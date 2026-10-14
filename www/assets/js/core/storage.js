/*
 * Storage adapter.
 *
 * The rest of the app only ever calls load() / save(). Everything about
 * *where* bytes live is confined to this file. There are two back ends:
 *
 *   local  — the browser's localStorage. Used when the dashboard is opened
 *            straight from disk (file://) or from a host without PHP. Every
 *            successful save first copies the last known-good document to a
 *            second key, so a truncated primary never silently empties the
 *            database.
 *
 *   server — api.php on the same site. Used automatically when api.php
 *            answers. One copy of the data lives on the server, so every
 *            device sees the same thing. Saves are debounced and sent in the
 *            background; a revision number stops two devices from silently
 *            overwriting each other.
 *
 * Once a site has been seen in server mode it is remembered, so a network
 * blip at startup shows "server unreachable" instead of quietly opening an
 * empty local database that the user might then type into.
 */
(function (App) {
  'use strict';

  var KEY = 'pld:data:v1';
  var KEY_PREV = 'pld:data:v1:prev';
  var KEY_QUOTA_WARNED = 'pld:quota-warned';
  var KEY_MODE = 'pld:mode';

  var API = 'api.php';
  var EXPORT_TAG = 'personal-dashboard';

  var mode = 'local';

  var available = (function () {
    try {
      var probe = '__pld_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch (e) {
      return false;
    }
  })();

  /** In-memory stand-in so the app still runs (unsaved) if storage is blocked. */
  var memory = {};

  function rawGet(key) {
    if (!available) return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  function rawSet(key, value) {
    if (!available) { memory[key] = value; return true; }
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  function rawRemove(key) {
    if (!available) { delete memory[key]; return; }
    try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  function tryParse(text) {
    try {
      var value = JSON.parse(text);
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { ok: false, error: 'ساختار ذخیره‌شده یک شیء معتبر نیست' };
      }
      return { ok: true, value: value };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // ======================================================================
  // detection
  // ======================================================================

  /**
   * Resolves to one of:
   *   { mode: 'local' }
   *   { mode: 'server', status: { configured, authenticated, error? } }
   *   { mode: 'unreachable', error }   — server mode was used here before
   */
  function detect() {
    if (window.location.protocol === 'file:') {
      mode = 'local';
      return Promise.resolve({ mode: 'local' });
    }

    var remembered = rawGet(KEY_MODE) === 'server';

    return request('GET', 'status').then(function (res) {
      if (res.json && res.json.app === EXPORT_TAG) {
        mode = 'server';
        rawSet(KEY_MODE, 'server');
        return { mode: 'server', status: res.json };
      }
      if (remembered) {
        return { mode: 'unreachable', error: 'سرور پاسخ درستی نداد (کد ' + res.status + ').' };
      }
      mode = 'local';
      return { mode: 'local' };
    }, function (err) {
      if (remembered) return { mode: 'unreachable', error: 'اتصال به سرور برقرار نشد.' };
      mode = 'local';
      return { mode: 'local', error: err && err.message };
    });
  }

  /** Forget that this site uses a server (used by "switch to local"). */
  function forgetServer() { rawRemove(KEY_MODE); }

  // ======================================================================
  // HTTP
  // ======================================================================

  /**
   * Low-level call to api.php. Never rejects for HTTP errors — resolves to
   * { status, json } where json is null if the body was not our JSON. It
   * rejects only when the network itself fails.
   *
   * `rawBody` lets save() send an already-serialised document without
   * stringifying the whole database twice.
   */
  function request(method, action, body, rawBody) {
    var opts = {
      method: method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Accept': 'application/json', 'X-PLD': '1' }
    };
    if (method === 'POST') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = rawBody != null ? rawBody : JSON.stringify(body || {});
    }
    return window.fetch(API + '?action=' + encodeURIComponent(action), opts).then(function (r) {
      return r.text().then(function (text) {
        var json = null;
        try { json = JSON.parse(text); } catch (e) { /* not JSON — PHP missing or crashed */ }
        if (json && json.app !== EXPORT_TAG) json = null;
        return { status: r.status, json: json };
      });
    });
  }

  /** Convenience for auth/backup calls: resolves {ok, ...} or {ok:false, error}. */
  function api(method, action, body) {
    return request(method, action, body).then(function (res) {
      if (res.json) return res.json;
      return { ok: false, error: 'پاسخ سرور قابل خواندن نبود (کد ' + res.status + ').' };
    }, function () {
      return { ok: false, error: 'اتصال به سرور برقرار نشد.' };
    });
  }

  // ======================================================================
  // load
  // ======================================================================

  /**
   * Resolves to { data, status, detail }.
   *   status: 'ok' | 'empty' | 'recovered' | 'corrupt' | 'error' | 'auth'
   */
  function load() {
    return mode === 'server' ? loadServer() : Promise.resolve(loadLocal());
  }

  function loadLocal() {
    var primary = rawGet(KEY);

    if (primary == null) {
      // No primary — maybe a save was interrupted. Try the previous snapshot.
      var onlyPrev = rawGet(KEY_PREV);
      if (onlyPrev != null) {
        var parsedPrev = tryParse(onlyPrev);
        if (parsedPrev.ok) return { data: parsedPrev.value, status: 'recovered' };
      }
      return { data: null, status: 'empty' };
    }

    var parsed = tryParse(primary);
    if (parsed.ok) return { data: parsed.value, status: 'ok' };

    var prev = rawGet(KEY_PREV);
    if (prev != null) {
      var parsed2 = tryParse(prev);
      if (parsed2.ok) {
        quarantine(primary);
        return { data: parsed2.value, status: 'recovered', detail: parsed.error };
      }
    }

    quarantine(primary);
    return { data: null, status: 'corrupt', detail: parsed.error };
  }

  var serverRev = 0;
  var serverBytes = 0;

  function loadServer() {
    return request('GET', 'load').then(function (res) {
      if (res.status === 401) return { data: null, status: 'auth' };
      if (!res.json || !res.json.ok) {
        return { data: null, status: 'error', detail: (res.json && res.json.error) || ('کد ' + res.status) };
      }
      serverRev = res.json.rev || 0;
      serverBytes = res.json.bytes || 0;
      if (!res.json.doc) return { data: null, status: 'empty' };
      return { data: res.json.doc, status: 'ok' };
    }, function () {
      return { data: null, status: 'error', detail: 'اتصال به سرور برقرار نشد.' };
    });
  }

  function quarantine(text) {
    rawSet('pld:corrupt:' + Date.now(), text);
  }

  // ======================================================================
  // save
  // ======================================================================

  /** Returns { ok } or { ok:false, error }. Never throws. */
  function save(data) {
    var text;
    try {
      text = JSON.stringify(data);
    } catch (e) {
      return { ok: false, error: 'داده قابل تبدیل به JSON نیست: ' + e.message };
    }
    return mode === 'server' ? queueServerSave(text) : saveLocal(text);
  }

  function saveLocal(text) {
    // Roll the current document into the backup slot before overwriting it.
    var current = rawGet(KEY);
    if (current != null && current !== text) rawSet(KEY_PREV, current);

    if (!rawSet(KEY, text)) {
      // Almost always QuotaExceededError. Drop the backup copy and retry once.
      rawRemove(KEY_PREV);
      if (!rawSet(KEY, text)) {
        return { ok: false, error: 'فضای ذخیره‌سازی مرورگر پر است. از داده‌ها خروجی بگیر و چند مورد قدیمی را پاک کن.' };
      }
    }
    return { ok: true };
  }

  // ---- server save queue -------------------------------------------------

  var DEBOUNCE_MS = 450;

  var pendingText = null;     // newest unsaved document
  var inFlight = false;
  var timer = null;
  var retryDelay = 0;
  var syncState = 'saved';    // saved | saving | error | conflict | auth
  var syncDetail = '';
  var syncListeners = [];
  var hooks = { conflict: null, authLost: null };

  function setSync(state, detail) {
    syncState = state;
    syncDetail = detail || '';
    syncListeners.forEach(function (fn) {
      try { fn(syncState, syncDetail); } catch (e) { console.error('[storage] sync listener failed', e); }
    });
  }

  function onSync(fn) {
    syncListeners.push(fn);
    fn(syncState, syncDetail);
  }

  function queueServerSave(text) {
    pendingText = text;
    if (syncState === 'conflict' || syncState === 'auth') return { ok: true, pending: true };
    setSync('saving');
    schedule(DEBOUNCE_MS);
    return { ok: true, pending: true };
  }

  function schedule(ms) {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(function () { timer = null; flush(); }, ms);
  }

  /** Send whatever is pending now. `force` overwrites a newer server copy. */
  function flush(force) {
    if (inFlight || pendingText == null) return;
    var text = pendingText;
    pendingText = null;
    inFlight = true;
    setSync('saving');

    var body = '{"rev":' + Number(serverRev || 0) + ',"force":' + (force ? 'true' : 'false') + ',"doc":' + text + '}';

    request('POST', 'save', null, body).then(function (res) {
      inFlight = false;

      if (res.json && res.json.ok) {
        serverRev = res.json.rev;
        serverBytes = res.json.bytes || text.length;
        retryDelay = 0;
        if (pendingText != null) flush();
        else setSync('saved');
        return;
      }

      // Put the text back unless something newer was queued meanwhile.
      if (pendingText == null) pendingText = text;

      if (res.status === 409) {
        setSync('conflict', 'این داده‌ها از دستگاه دیگری تغییر کرده‌اند.');
        if (hooks.conflict) hooks.conflict();
      } else if (res.status === 401) {
        setSync('auth', 'نشست کاربری تمام شده — دوباره وارد شو.');
        if (hooks.authLost) hooks.authLost();
      } else {
        failAndRetry((res.json && res.json.error) || ('خطای سرور (کد ' + res.status + ')'));
      }
    }, function () {
      inFlight = false;
      if (pendingText == null) pendingText = text;
      failAndRetry('اتصال به سرور قطع است؛ دوباره تلاش می‌کنم…');
    });
  }

  function failAndRetry(message) {
    retryDelay = Math.min(retryDelay ? retryDelay * 2 : 3000, 60000);
    setSync('error', message);
    schedule(retryDelay);
  }

  /** After re-login or a "keep mine" decision, resume sending. */
  function resume(force) {
    setSync(pendingText != null ? 'saving' : 'saved');
    flush(!!force);
  }

  /** Drop unsaved changes (the user chose the server copy instead). */
  function discardPending() {
    pendingText = null;
    if (timer) { window.clearTimeout(timer); timer = null; }
  }

  function hasPending() {
    return mode === 'server' && (pendingText != null || inFlight);
  }

  /** Current server revision — used to notice edits from other devices. */
  function checkRemoteRevision() {
    if (mode !== 'server') return Promise.resolve(null);
    return request('GET', 'rev').then(function (res) {
      if (!res.json || !res.json.ok) return null;
      return { rev: res.json.rev, changed: res.json.rev !== serverRev };
    }, function () { return null; });
  }

  // ======================================================================
  // info
  // ======================================================================

  /** Approximate size of the stored document, in bytes. */
  function usage() {
    if (mode === 'server') return serverBytes;
    var text = rawGet(KEY);
    return text ? text.length * 2 : 0;   // UTF-16 code units
  }

  function listQuarantined() {
    if (!available) return [];
    var out = [];
    try {
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        if (k && k.indexOf('pld:corrupt:') === 0) out.push(k);
      }
    } catch (e) { /* ignore */ }
    return out.sort();
  }

  App.storage = {
    available: available,
    mode: function () { return mode; },
    detect: detect,
    forgetServer: forgetServer,
    api: api,
    load: load,
    save: save,
    onSync: onSync,
    syncState: function () { return syncState; },
    hooks: hooks,
    resume: resume,
    flush: flush,
    discardPending: discardPending,
    hasPending: hasPending,
    checkRemoteRevision: checkRemoteRevision,
    usage: usage,
    listQuarantined: listQuarantined,
    KEY: KEY,
    KEY_PREV: KEY_PREV,
    _rawGet: rawGet,
    _rawSet: rawSet,
    _rawRemove: rawRemove,
    _quotaWarnKey: KEY_QUOTA_WARNED
  };
})(window.App = window.App || {});
