/*
 * The data store.
 *
 * Holds one plain JSON document in memory, writes it through App.storage on
 * every mutation, and notifies subscribers so the current page re-renders.
 * Pages never touch localStorage and never mutate records directly — they go
 * through insert/update/remove, which is what keeps `updatedAt` honest and
 * the saved copy in sync.
 */
(function (App) {
  'use strict';

  var util = App.util;
  var schema = App.schema;
  var storage = App.storage;
  var J = App.jalali;

  var EXPORT_TAG = 'personal-dashboard';

  var state = null;          // { version, settings, data: {collection: [...]} }
  var listeners = [];
  var bootStatus = { level: 'ok', message: '' };

  // ---- shape -----------------------------------------------------------

  function emptyDocument() {
    var data = {};
    schema.NAMES.forEach(function (n) { data[n] = []; });
    return {
      app: EXPORT_TAG,
      version: schema.VERSION,
      settings: util.deepClone(schema.DEFAULT_SETTINGS),
      data: data,
      vault: null              // sealed blob — see core/vault.js
    };
  }

  /**
   * Make any loaded document safe to render: missing collections become empty
   * arrays, non-objects are dropped, and every record gets an id and stamps.
   * Returns { doc, repaired } where `repaired` counts salvaged problems.
   */
  function normalise(input) {
    var doc = emptyDocument();
    var repaired = 0;

    if (input && typeof input.settings === 'object' && input.settings) {
      Object.keys(schema.DEFAULT_SETTINGS).forEach(function (k) {
        if (k === 'categories') return;
        var v = input.settings[k];
        if (v !== undefined && v !== null && v !== '') doc.settings[k] = v;
      });
      // Free-text settings that may legitimately be blank.
      ['customFont', 'customFontUrl'].forEach(function (k) {
        if (typeof input.settings[k] === 'string') doc.settings[k] = input.settings[k];
      });
      var mb = util.parseNum(doc.settings.monthlyBudget);
      doc.settings.monthlyBudget = (mb === null || isNaN(mb)) ? schema.DEFAULT_SETTINGS.monthlyBudget : mb;
    }
    doc.settings.categories = normaliseCategories(input && input.settings && input.settings.categories);
    doc.settings.modules = normaliseModules(input && input.settings && input.settings.modules);

    var src = (input && input.data && typeof input.data === 'object') ? input.data : (input || {});
    var fromVersion = Number(input && input.version) || 1;

    schema.NAMES.forEach(function (name) {
      var rows = src[name];
      if (!Array.isArray(rows)) {
        if (rows !== undefined) repaired++;
        return;
      }
      var seen = {};
      rows.forEach(function (row) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) { repaired++; return; }
        var clean = util.deepClone(row);
        if (!clean.id || typeof clean.id !== 'string' || seen[clean.id]) {
          clean.id = util.uid(name);
          repaired++;
        }
        seen[clean.id] = true;
        if (!clean.createdAt) clean.createdAt = util.nowIso();
        if (!clean.updatedAt) clean.updatedAt = clean.createdAt;
        migrateRecord(name, clean, fromVersion);
        doc.data[name].push(clean);
      });
    });

    doc.vault = sealedVault(input && input.vault);

    migrateDocument(doc, fromVersion);
    adoptUsedCategories(doc);
    return { doc: doc, repaired: repaired };
  }

  /**
   * The vault blob is opaque here on purpose: db never decrypts it and never
   * looks inside. All this does is reject anything that is not shaped like a
   * sealed blob, so a hand-edited file cannot make the vault page throw.
   */
  function sealedVault(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    if (typeof v.ct !== 'string' || typeof v.salt !== 'string' || typeof v.iv !== 'string') return null;
    return {
      v: Number(v.v) || 1,
      kdf: typeof v.kdf === 'string' ? v.kdf : 'PBKDF2-SHA256',
      iter: Number(v.iter) || 0,
      salt: v.salt,
      iv: v.iv,
      ct: v.ct,
      count: Number(v.count) || 0,
      updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : null
    };
  }

  /**
   * Whole-document migrations — the ones that need to see more than a single
   * record.
   *
   * Version 3: a monthly bill used to be a transaction with `recurring: true`,
   * and nothing was ever generated from it. Each distinct title becomes one
   * `recurrings` template, built from the most recent row that used it. The
   * old transactions stay exactly as they are (they really happened), and the
   * template starts from that row's date, with that month marked as already
   * handled — so no past month is ever proposed twice.
   */
  function migrateDocument(doc, fromVersion) {
    if (fromVersion >= 3) return;
    if (!Array.isArray(doc.data.transactions)) return;

    var latest = {};
    doc.data.transactions.forEach(function (t) {
      if (!t.recurring) return;
      var key = util.trim(t.title);
      if (!key) return;
      if (!latest[key] || String(t.date || '') > String(latest[key].date || '')) latest[key] = t;
    });

    var have = {};
    (doc.data.recurrings || []).forEach(function (r) { have[util.trim(r.title)] = true; });

    Object.keys(latest).forEach(function (title) {
      if (have[title]) return;
      var t = latest[title];
      var j = J.isoToJ(t.date);
      doc.data.recurrings.push({
        id: util.uid('recurrings'),
        createdAt: t.createdAt || util.nowIso(),
        updatedAt: util.nowIso(),
        title: title,
        direction: t.direction === 'درآمد' ? 'درآمد' : 'خرج',
        category: t.category || '',
        amount: Number(t.amount) || 0,
        accountId: t.accountId || '',
        dayOfMonth: j ? j.jd : 1,
        startDate: t.date || J.todayIso(),
        endDate: '',
        active: true,
        // The month this template was built from is already in the books, so
        // it must never be proposed again. Nothing before `startDate` is ever
        // looked at, which takes care of every earlier month.
        skipMonths: [J.monthKey(t.date)].filter(Boolean)
      });
    });

    // One source of truth from here on: the template list.
    doc.data.transactions.forEach(function (t) { delete t.recurring; });
  }

  /**
   * Version 1 kept a fixed "type" on tasks and a fixed "tag" on people. Both
   * became the user-managed `category`. Any value a record already uses is
   * added to that section's list so nothing disappears from a dropdown.
   */
  function migrateRecord(name, rec, fromVersion) {
    if (fromVersion < 2) {
      if (name === 'tasks' && rec.category == null && rec.type != null) {
        rec.category = rec.type;
        delete rec.type;
      }
      if (name === 'people' && rec.category == null && rec.tag != null) {
        rec.category = rec.tag;
        delete rec.tag;
      }
    }
    ['details', 'materials', 'skipMonths'].forEach(function (k) {
      if (rec[k] != null && !Array.isArray(rec[k])) rec[k] = [];
    });
    if (name === 'recurrings' && !Array.isArray(rec.skipMonths)) rec.skipMonths = [];
  }

  /** Category lists: arrays of unique, non-empty strings; defaults for missing sections. */
  function normaliseCategories(input) {
    var out = {};
    schema.CATEGORY_SECTIONS.forEach(function (sec) {
      var raw = input && input[sec.collection];
      var list = Array.isArray(raw) ? raw : schema.DEFAULT_CATEGORIES[sec.collection];
      var seen = {};
      out[sec.collection] = (list || []).map(function (v) { return util.trim(v); })
        .filter(function (v) {
          if (!v || seen[v]) return false;
          seen[v] = true;
          return true;
        });
    });
    return out;
  }

  /**
   * Module switches: every known section gets a true/false, and a section the
   * saved settings have never heard of defaults to on. That way a release that
   * adds a section does not leave it invisible for accounts that already exist.
   */
  function normaliseModules(input) {
    var out = {};
    schema.MODULES.forEach(function (m) {
      var v = input && input[m.id];
      out[m.id] = v === undefined ? true : !!v;
    });
    return out;
  }

  /**
   * Make sure every category used by a record is also in its section's list —
   * including sections that borrow another one's list, like recurring items
   * borrowing the transaction categories.
   */
  function adoptUsedCategories(doc) {
    schema.NAMES.forEach(function (name) {
      var list = doc.settings.categories[schema.catSource(name)];
      if (!list) return;
      (doc.data[name] || []).forEach(function (r) {
        var c = util.trim(r.category);
        if (c && list.indexOf(c) === -1) list.push(c);
      });
    });
  }

  // ---- lifecycle -------------------------------------------------------

  /**
   * Resolves once the document is in memory. Rejects with {status, detail}
   * when a server load fails, so the shell can show a retry screen instead
   * of an empty dashboard.
   */
  function init() {
    if (!storage.available && storage.mode() === 'local') {
      bootStatus = {
        level: 'error',
        message: 'مرورگر اجازه‌ی ذخیره‌سازی محلی نمی‌دهد — تغییرات با بستن صفحه از بین می‌رود. اگر در حالت ناشناس هستی، صفحه را در پنجره‌ی معمولی باز کن.'
      };
    }

    return storage.load().then(function (loaded) {
      if (loaded.status === 'error' || loaded.status === 'auth') {
        return Promise.reject(loaded);
      }
      applyLoaded(loaded);
    });
  }

  function applyLoaded(loaded) {
    if (loaded.status === 'empty') {
      state = emptyDocument();
      var seeded = App.seed.build(util.uid, util.nowIso());
      Object.keys(seeded).forEach(function (k) { state.data[k] = seeded[k]; });
      persist();
      bootStatus = { level: 'info', message: 'داده‌های نمونه بارگذاری شد. هر وقت خواستی از «تنظیمات و پشتیبان» پاکشان کن.' };
      return;
    }

    var result = normalise(loaded.data);
    state = result.doc;
    var migrated = (Number(loaded.data && loaded.data.version) || 1) < schema.VERSION;

    if (loaded.status === 'recovered') {
      bootStatus = { level: 'error', message: 'نسخه‌ی اصلی خوانده نشد؛ از نسخه‌ی پشتیبان بازیابی شد.' };
      persist();
    } else if (loaded.status === 'corrupt') {
      // Both copies unreadable. Start clean but keep the unreadable text.
      bootStatus = {
        level: 'error',
        message: 'داده‌ی ذخیره‌شده خوانده نشد و با یک دیتابیس خالی شروع شد. متن خراب پاک نشده — قبل از وارد کردن هر چیزی از «تنظیمات» کمک بگیر.'
      };
      persist();
    } else if (result.repaired > 0) {
      bootStatus = { level: 'info', message: util.toFa(result.repaired) + ' رکورد ناقص ترمیم شد.' };
      persist();
    } else if (migrated) {
      persist();
    }
  }

  /** Replace the in-memory document with a fresh server copy (another device saved). */
  function reload() {
    var hadVault = state && state.vault ? state.vault.ct : null;
    return storage.load().then(function (loaded) {
      if (loaded.status === 'error' || loaded.status === 'auth') return Promise.reject(loaded);
      if (loaded.status === 'empty') return;
      state = normalise(loaded.data).doc;

      // The open vault holds a decrypted copy of the *old* blob. If another
      // device changed it, that copy is stale and saving from it would undo
      // their change — so lock, and let the user unlock the new one.
      var nowVault = state.vault ? state.vault.ct : null;
      if (App.vault && App.vault.isOpen() && nowVault !== hadVault) {
        App.vault.lock();
        if (App.toast) App.toast.show('گاوصندوق از دستگاه دیگری تغییر کرد — دوباره بازش کن');
      }

      emit();
    });
  }

  function persist() {
    var res = storage.save(state);
    if (!res.ok && App.toast) App.toast.error(res.error);
    return res.ok;
  }

  // ---- notifications ---------------------------------------------------

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (f) { return f !== fn; });
    };
  }

  function emit() {
    listeners.forEach(function (fn) {
      try { fn(); } catch (e) { console.error('[db] listener failed', e); }
    });
  }

  // ---- reads -----------------------------------------------------------

  function rows(name) {
    return state.data[name] || (state.data[name] = []);
  }

  function list(name, filter) {
    var all = rows(name).slice();
    return filter ? all.filter(filter) : all;
  }

  function get(name, id) {
    if (!id) return null;
    var found = rows(name).filter(function (r) { return r.id === id; });
    return found.length ? found[0] : null;
  }

  function count(name, filter) {
    return list(name, filter).length;
  }

  /** Display label for a record id, or '' when it does not resolve. */
  function labelOf(name, id) {
    var r = get(name, id);
    if (!r) return '';
    return r.name || r.title || '';
  }

  // ---- writes ----------------------------------------------------------

  function insert(name, values) {
    var rec = util.deepClone(values) || {};
    rec.id = util.uid(name);
    rec.createdAt = util.nowIso();
    rec.updatedAt = rec.createdAt;
    rows(name).push(rec);
    persist();
    emit();
    return rec;
  }

  /**
   * Insert several records with one save and one re-render — used when a
   * single click legitimately creates a handful of rows, like approving a
   * month of recurring bills. Returns the new records.
   */
  function insertMany(name, list) {
    var now = util.nowIso();
    var made = (list || []).map(function (values) {
      var rec = util.deepClone(values) || {};
      rec.id = util.uid(name);
      rec.createdAt = now;
      rec.updatedAt = now;
      rows(name).push(rec);
      return rec;
    });
    if (!made.length) return made;
    persist();
    emit();
    return made;
  }

  function update(name, id, patch) {
    var rec = get(name, id);
    if (!rec) return null;
    Object.keys(patch).forEach(function (k) { rec[k] = patch[k]; });
    rec.updatedAt = util.nowIso();
    persist();
    emit();
    return rec;
  }

  function remove(name, id) {
    var doomed = get(name, id);
    if (!doomed) return false;
    state.data[name] = rows(name).filter(function (r) { return r.id !== id; });
    cascade(name, doomed);
    persist();
    emit();
    return true;
  }

  /** Detach references so deleting a record never leaves a dangling link. */
  function cascade(name, rec) {
    var id = rec.id;
    if (name === 'goals') {
      rows('projects').forEach(function (p) { if (p.goalId === id) p.goalId = ''; });
      rows('notes').forEach(function (n) { if (n.link === 'goal:' + id) n.link = ''; });
    } else if (name === 'projects') {
      rows('tasks').forEach(function (t) { if (t.projectId === id) t.projectId = ''; });
      rows('notes').forEach(function (n) { if (n.link === 'project:' + id) n.link = ''; });
    } else if (name === 'accounts') {
      rows('transactions').forEach(function (t) { if (t.accountId === id) t.accountId = ''; });
    } else if (name === 'transactions' && rec.srcId) {
      // Deleting an approved month means "this one should not be recorded".
      // Without this, the recurring item would offer the same month again the
      // moment the page re-rendered.
      markMonthHandled(rec.srcId, J.monthKey(rec.date));
    }
  }

  function markMonthHandled(templateId, monthKey) {
    if (!monthKey) return;
    var tpl = get('recurrings', templateId);
    if (!tpl) return;
    if (!Array.isArray(tpl.skipMonths)) tpl.skipMonths = [];
    if (tpl.skipMonths.indexOf(monthKey) === -1) {
      tpl.skipMonths.push(monthKey);
      tpl.updatedAt = util.nowIso();
    }
  }

  /**
   * Apply `fn(record)` to every row of a collection; rows for which it
   * returns true are stamped as updated. One save, one re-render.
   * Returns how many rows changed.
   */
  function mutateAll(name, fn) {
    var now = util.nowIso();
    var changed = 0;
    rows(name).forEach(function (r) {
      if (fn(r)) { r.updatedAt = now; changed++; }
    });
    return changed;
  }

  /** Run several writes and settings changes, then save and re-render once. */
  function batch(fn) {
    var result = fn();
    persist();
    emit();
    return result;
  }

  /** Bulk delete, one save. Returns the number removed. */
  function removeWhere(name, filter) {
    var doomed = rows(name).filter(filter);
    if (!doomed.length) return 0;
    doomed.forEach(function (r) {
      state.data[name] = rows(name).filter(function (x) { return x.id !== r.id; });
      cascade(name, r);
    });
    persist();
    emit();
    return doomed.length;
  }

  // ---- settings --------------------------------------------------------

  function settings() { return state.settings; }

  /**
   * Is this section switched on? Unknown ids are "on", so a section that a
   * saved settings file has never heard of is visible rather than missing.
   */
  function moduleOn(id) {
    if (!id) return true;
    var m = state && state.settings && state.settings.modules;
    return !m || m[id] !== false;
  }

  function setSettings(patch, quiet) {
    Object.keys(patch).forEach(function (k) { state.settings[k] = patch[k]; });
    if (quiet) return;
    persist();
    emit();
  }

  // ---- the sealed vault ------------------------------------------------

  /**
   * The encrypted blob, or null when this account has no vault yet. Only
   * core/vault.js should touch these two; everything else would need the
   * master password, which never leaves that file.
   */
  function vault() { return state ? state.vault : null; }

  function setVault(blob) {
    state.vault = blob || null;
    persist();
    emit();
  }

  // ---- export / import -------------------------------------------------

  /**
   * The JSON backup. The vault travels as the same sealed blob that sits on
   * the server: restorable on another device, useless without the master
   * password. Nothing readable is written here.
   */
  function exportDocument() {
    return {
      app: EXPORT_TAG,
      version: schema.VERSION,
      exportedAt: util.nowIso(),
      settings: util.deepClone(state.settings),
      data: util.deepClone(state.data),
      vault: state.vault ? util.deepClone(state.vault) : null
    };
  }

  /**
   * Check an uploaded file before anything is overwritten.
   * Returns { ok, counts, warnings } or { ok:false, error }.
   */
  function inspectImport(text) {
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: 'فایل یک JSON معتبر نیست: ' + e.message };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'ساختار فایل درست نیست — انتظار یک شیء JSON می‌رفت.' };
    }

    var warnings = [];
    if (parsed.app && parsed.app !== EXPORT_TAG) {
      warnings.push('این فایل از برنامه‌ی دیگری گرفته شده است.');
    }
    if (parsed.version && Number(parsed.version) > schema.VERSION) {
      warnings.push('فایل مربوط به نسخه‌ی جدیدتری از برنامه است؛ ممکن است بخشی از آن خوانده نشود.');
    }

    var src = (parsed.data && typeof parsed.data === 'object') ? parsed.data : parsed;
    var known = schema.NAMES.filter(function (n) { return Array.isArray(src[n]); });
    if (!known.length) {
      return { ok: false, error: 'در فایل هیچ‌کدام از جدول‌های شناخته‌شده پیدا نشد.' };
    }

    var counts = {};
    var total = 0;
    known.forEach(function (n) {
      counts[n] = src[n].length;
      total += src[n].length;
    });

    var incomingVault = sealedVault(parsed.vault);
    if (incomingVault && state && state.vault) {
      warnings.push('این فایل یک گاوصندوق رمزشده دارد. دو گاوصندوق با دو رمز اصلی قابل ادغام نیستند: ' +
        'در حالت «جایگزینی» گاوصندوق فایل جای گاوصندوق فعلی را می‌گیرد و برای بازکردنش به رمز اصلیِ ' +
        'همان فایل نیاز داری؛ در حالت «اضافه‌کردن» گاوصندوق فعلی دست‌نخورده می‌ماند.');
    } else if (incomingVault) {
      warnings.push('این فایل یک گاوصندوق رمزشده دارد؛ برای بازکردنش به رمز اصلیِ همان فایل نیاز داری.');
    }

    return {
      ok: true, parsed: parsed, counts: counts, total: total,
      warnings: warnings, hasVault: !!incomingVault
    };
  }

  /**
   * mode: 'replace' wipes the current database; 'merge' keeps it and adds
   * only records whose id is not already present.
   */
  function applyImport(parsed, mode) {
    var incoming = normalise(parsed).doc;

    if (mode === 'replace') {
      // A file without a vault must never delete one. Replacing everything is
      // about records; losing the vault that way would be unrecoverable.
      var keptVault = incoming.vault || state.vault || null;
      state = incoming;
      state.vault = keptVault;
      persist();
      emit();
      return { added: countAll(incoming.data), skipped: 0 };
    }

    // Merging keeps the vault that is already here: two blobs sealed with
    // two different master passwords cannot be combined.

    var added = 0, skipped = 0;
    schema.NAMES.forEach(function (name) {
      var have = {};
      rows(name).forEach(function (r) { have[r.id] = true; });
      incoming.data[name].forEach(function (r) {
        if (have[r.id]) { skipped++; return; }
        rows(name).push(r);
        have[r.id] = true;
        added++;
      });
    });
    // Bring along any categories the imported file defines or uses.
    schema.CATEGORY_SECTIONS.forEach(function (sec) {
      var list = state.settings.categories[sec.collection];
      incoming.settings.categories[sec.collection].forEach(function (c) {
        if (list.indexOf(c) === -1) list.push(c);
      });
    });
    adoptUsedCategories(state);
    persist();
    emit();
    return { added: added, skipped: skipped };
  }

  function countAll(data) {
    return schema.NAMES.reduce(function (sum, n) {
      return sum + ((data[n] && data[n].length) || 0);
    }, 0);
  }

  function totalRecords() { return countAll(state.data); }

  /** Delete every record but keep settings. */
  function clearAll() {
    schema.NAMES.forEach(function (n) { state.data[n] = []; });
    persist();
    emit();
  }

  App.db = {
    init: init,
    reload: reload,
    mutateAll: mutateAll,
    batch: batch,
    subscribe: subscribe,
    bootStatus: function () { return bootStatus; },

    list: list,
    get: get,
    count: count,
    labelOf: labelOf,

    insert: insert,
    insertMany: insertMany,
    update: update,
    remove: remove,
    removeWhere: removeWhere,

    settings: settings,
    setSettings: setSettings,
    moduleOn: moduleOn,

    vault: vault,
    setVault: setVault,

    exportDocument: exportDocument,
    inspectImport: inspectImport,
    applyImport: applyImport,
    totalRecords: totalRecords,
    clearAll: clearAll
  };
})(window.App = window.App || {});
