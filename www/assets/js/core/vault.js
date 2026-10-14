/*
 * The vault — card numbers, passwords and anything else that must not be
 * readable on the server.
 *
 * Everything else in this app stores plain JSON: the dashboard's own data is
 * not secret, and a readable file is easy to back up and repair. Secrets are
 * different, so they take a different route:
 *
 *   1. the items live in memory as ordinary objects while the vault is open,
 *   2. every change re-seals the whole list with AES-GCM (core/crypto.js),
 *   3. only the sealed blob is handed to db.setVault(), which saves it the
 *      same way it saves everything else.
 *
 * So the server, the automatic backups, the JSON export and anyone reading
 * the data directory all see one base64 string. The master password only
 * exists as a derived key in this file's `material`, and is thrown away on
 * lock, on logout and on every page load.
 *
 * There is deliberately no recovery path. If the master password is lost the
 * items are gone — the create screen says so and makes the user tick a box.
 */
(function (App) {
  'use strict';

  var util = App.util;

  var material = null;     // { key, salt, iter } — present only while open
  var items = null;        // the decrypted list — present only while open
  var listeners = [];
  var idleTimer = null;
  var busy = null;          // the save in flight, if any
  var queued = null;        // one more save, waiting for it

  // ---- state ------------------------------------------------------------

  /** 'unsupported' | 'absent' | 'locked' | 'open' */
  function state() {
    if (!App.crypt.supported()) return 'unsupported';
    if (items && material) return 'open';
    return App.db.vault() ? 'locked' : 'absent';
  }

  function isOpen() { return state() === 'open'; }
  function exists() { return !!App.db.vault(); }

  /** How many items are in there — readable even while locked. */
  function count() {
    if (isOpen()) return items.length;
    var blob = App.db.vault();
    return blob ? (Number(blob.count) || 0) : 0;
  }

  function updatedAt() {
    var blob = App.db.vault();
    return blob && blob.updatedAt ? blob.updatedAt : null;
  }

  function onChange(fn) { listeners.push(fn); }

  function emit() {
    listeners.forEach(function (fn) {
      try { fn(state()); } catch (e) { console.error('[vault] listener failed', e); }
    });
  }

  // ---- auto-lock --------------------------------------------------------

  function lockMinutes() {
    // Called from the activity listener, which is live before the document is
    // loaded (on the login screen), so the settings may not exist yet.
    var settings = App.db.settings ? App.db.settings() : null;
    var n = settings ? Number(settings.vaultLockMinutes) : 10;
    if (!isFinite(n) || n < 0) return 10;
    return Math.min(n, 240);
  }

  /** Restart the idle countdown. Called on any activity while open. */
  function touch() {
    if (idleTimer) { window.clearTimeout(idleTimer); idleTimer = null; }
    if (!isOpen()) return;
    var minutes = lockMinutes();
    if (!minutes) return;                     // 0 = only lock manually
    idleTimer = window.setTimeout(function () {
      idleTimer = null;
      if (!isOpen()) return;
      lock();
      if (App.toast) App.toast.show('گاوصندوق بعد از بی‌کاری قفل شد');
    }, minutes * 60000);
  }

  function lock() {
    material = null;
    items = null;
    queued = null;
    if (idleTimer) { window.clearTimeout(idleTimer); idleTimer = null; }
    emit();
    if (App.view) App.view.refresh();
  }

  // ---- open / create ----------------------------------------------------

  /** Create the vault for the first time. Resolves, or rejects with Error. */
  function create(password) {
    if (exists()) return Promise.reject(new Error('گاوصندوق از قبل ساخته شده است.'));
    var problem = passwordProblem(password);
    if (problem) return Promise.reject(new Error(problem));

    return App.crypt.keyFor(password, null).then(function (m) {
      material = m;
      items = [];
      return persist();
    }).then(function () {
      touch();
      emit();
      return true;
    });
  }

  /** Unlock with the master password. Rejects with `err.wrong` when it is wrong. */
  function unlock(password) {
    var blob = App.db.vault();
    if (!blob) return Promise.reject(new Error('هنوز گاوصندوقی ساخته نشده است.'));
    if (!String(password || '')) {
      var e = new Error('رمز اصلی را بنویس.');
      e.wrong = true;
      return Promise.reject(e);
    }

    return App.crypt.keyFor(password, blob).then(function (m) {
      return App.crypt.open(blob, m).then(function (payload) {
        material = m;
        items = normaliseItems(payload && payload.items);
        touch();
        emit();
        return true;
      });
    });
  }

  /**
   * Swap the master password. The items are re-sealed with a brand-new salt,
   * so the old password stops working the moment this saves. Requires the
   * vault to be open already.
   */
  function changePassword(next) {
    if (!isOpen()) return Promise.reject(new Error('اول قفل گاوصندوق را باز کن.'));
    var problem = passwordProblem(next);
    if (problem) return Promise.reject(new Error(problem));

    return App.crypt.keyFor(next, null).then(function (m) {
      material = m;
      return persist();
    }).then(function () { return true; });
  }

  function passwordProblem(password) {
    var p = String(password || '');
    if (p.length < 10) return 'رمز اصلی باید دست‌کم ۱۰ کاراکتر باشد.';
    if (p.length > 200) return 'رمز اصلی خیلی بلند است.';
    if (/^\s|\s$/.test(p)) return 'رمز اصلی نباید با فاصله شروع یا تمام شود.';
    return null;
  }

  // ---- items ------------------------------------------------------------

  var KINDS = ['card', 'login', 'note'];

  function normaliseItems(raw) {
    if (!Array.isArray(raw)) return [];
    var seen = {};
    var out = [];
    raw.forEach(function (r) {
      if (!r || typeof r !== 'object' || Array.isArray(r)) return;
      var item = util.deepClone(r);
      if (!item.id || seen[item.id]) item.id = util.uid('vault');
      seen[item.id] = true;
      if (KINDS.indexOf(item.kind) === -1) item.kind = 'note';
      if (!item.createdAt) item.createdAt = util.nowIso();
      if (!item.updatedAt) item.updatedAt = item.createdAt;
      out.push(item);
    });
    return out;
  }

  /** A copy of the list, newest change first. Empty while locked. */
  function list() {
    if (!isOpen()) return [];
    return items.slice().sort(function (a, b) {
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
  }

  function get(id) {
    if (!isOpen()) return null;
    var found = items.filter(function (i) { return i.id === id; });
    return found.length ? util.deepClone(found[0]) : null;
  }

  /** Add or replace one item, then re-seal and save. */
  function put(values) {
    if (!isOpen()) return Promise.reject(new Error('گاوصندوق قفل است.'));
    var rec = util.deepClone(values) || {};
    if (KINDS.indexOf(rec.kind) === -1) rec.kind = 'note';
    rec.updatedAt = util.nowIso();

    var existing = rec.id ? items.filter(function (i) { return i.id === rec.id; })[0] : null;
    if (existing) {
      Object.keys(rec).forEach(function (k) { existing[k] = rec[k]; });
    } else {
      rec.id = rec.id || util.uid('vault');
      rec.createdAt = rec.createdAt || util.nowIso();
      items.push(rec);
    }
    touch();
    return persist();
  }

  function remove(id) {
    if (!isOpen()) return Promise.reject(new Error('گاوصندوق قفل است.'));
    var before = items.length;
    items = items.filter(function (i) { return i.id !== id; });
    if (items.length === before) return Promise.resolve(false);
    touch();
    return persist().then(function () { return true; });
  }

  /** Throw the whole thing away. Cannot be undone; the page confirms first. */
  function destroy() {
    material = null;
    items = null;
    if (idleTimer) { window.clearTimeout(idleTimer); idleTimer = null; }
    App.db.setVault(null);
    emit();
    return Promise.resolve(true);
  }

  // ---- categories (used by the category manager) -------------------------

  function countByCategory(name) {
    if (!isOpen()) return null;                // unknown while locked
    return items.filter(function (i) { return i.category === name; }).length;
  }

  function renameCategory(from, to) {
    if (!isOpen()) return Promise.resolve(false);
    var changed = 0;
    items.forEach(function (i) {
      if (i.category === from) { i.category = to; i.updatedAt = util.nowIso(); changed++; }
    });
    if (!changed) return Promise.resolve(false);
    return persist().then(function () { return true; });
  }

  // ---- saving -----------------------------------------------------------

  /**
   * Seal the current list and hand the blob to the database.
   *
   * Sealing is asynchronous, so two quick edits could overlap. Rather than
   * refusing the second one — which would leave a change in memory that was
   * never saved — a save that arrives while another is in flight waits for it
   * and then seals again from the list as it stands.
   */
  function persist() {
    if (!material || !items) return Promise.reject(new Error('گاوصندوق قفل است.'));
    if (busy) {
      queued = queued || busy.then(seal, seal);
      return queued;
    }
    busy = seal();
    return busy;
  }

  function seal() {
    queued = null;
    if (!material || !items) return Promise.reject(new Error('گاوصندوق قفل است.'));
    var snapshot = util.deepClone(items);
    var run = App.crypt.seal({ items: snapshot }, material, snapshot.length)
      .then(function (blob) {
        if (busy === run) busy = null;
        App.db.setVault(blob);
        return true;
      }, function (err) {
        if (busy === run) busy = null;
        throw err;
      });
    busy = run;
    return run;
  }

  // ---- wiring -----------------------------------------------------------

  /** Any activity anywhere in the app counts as "still using it". */
  function watchActivity() {
    ['pointerdown', 'keydown'].forEach(function (evt) {
      document.addEventListener(evt, function () {
        if (isOpen()) touch();
      }, true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchActivity);
  } else {
    watchActivity();
  }

  App.vault = {
    KINDS: KINDS,
    state: state,
    isOpen: isOpen,
    exists: exists,
    count: count,
    updatedAt: updatedAt,
    onChange: onChange,
    touch: touch,
    lock: lock,
    create: create,
    unlock: unlock,
    changePassword: changePassword,
    passwordProblem: passwordProblem,
    list: list,
    get: get,
    put: put,
    remove: remove,
    destroy: destroy,
    countByCategory: countByCategory,
    renameCategory: renameCategory
  };
})(window.App = window.App || {});
