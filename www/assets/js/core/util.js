/* Small shared helpers. No dependencies. */
(function (App) {
  'use strict';

  var FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

  // 'fa' shows Persian digits everywhere; 'en' keeps Latin digits. Set from
  // the appearance settings by App.theme.
  var digitStyle = 'fa';

  function setDigits(style) { digitStyle = style === 'en' ? 'en' : 'fa'; }
  function digits() { return digitStyle; }

  /** 1405 -> "۱۴۰۵" (or "1405" when Latin digits are chosen). Works on numbers or strings. */
  function toFa(value) {
    var s = String(value == null ? '' : value);
    if (digitStyle === 'en') return toEn(s);
    return s.replace(/[0-9]/g, function (d) {
      return FA_DIGITS[+d];
    });
  }

  /** "۱۴۰۵/۰۶/۲۵" -> "1405/06/25". Also normalises Arabic-Indic digits. */
  function toEn(value) {
    return String(value == null ? '' : value)
      .replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 0x06F0); })
      .replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x0660); });
  }

  /** 48200 -> "۴۸٬۲۰۰" (Persian thousands separator), or "48,200" with Latin digits. */
  function faNum(n) {
    if (n == null || isNaN(n)) return '—';
    var neg = n < 0;
    var sep = digitStyle === 'en' ? ',' : '٬';
    var s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep);
    return (neg ? '−' : '') + toFa(s);
  }

  /** 82 -> "۸۲٪" */
  function faPct(n) {
    return toFa(Math.round(n || 0)) + (digitStyle === 'en' ? '%' : '٪');
  }

  /** Only http(s) links are ever rendered as clickable, so a pasted
   *  "javascript:" value can never run. Returns '' for anything else. */
  function safeUrl(raw) {
    var s = trim(raw);
    return /^https?:\/\/[^\s]+$/i.test(s) ? s : '';
  }

  /** Collision-resistant enough for a single-user local app. */
  function uid(prefix) {
    return (prefix || 'id') + '_' +
      Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 8);
  }

  function nowIso() { return new Date().toISOString(); }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  /** Parse a user-entered number, tolerating Persian digits, commas and spaces. */
  function parseNum(raw) {
    if (raw == null || raw === '') return null;
    var s = toEn(String(raw)).replace(/[,\s٬،]/g, '');
    if (s === '' || s === '-') return null;
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  }

  function trim(s) { return (s == null ? '' : String(s)).trim(); }

  /** Stable sort helper: by key ascending, undefined/null last. */
  function byKey(key, dir) {
    var d = dir === 'desc' ? -1 : 1;
    return function (a, b) {
      var x = a[key], y = b[key];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      if (x < y) return -1 * d;
      if (x > y) return 1 * d;
      return 0;
    };
  }

  /** Case/diacritic-tolerant substring match for Persian + Latin text. */
  function matches(haystack, needle) {
    if (!needle) return true;
    var norm = function (s) {
      return toEn(String(s || ''))
        .toLowerCase()
        .replace(/[ً-ْ‌]/g, '')  // harakat + ZWNJ
        .replace(/[يﻱﻲ]/g, 'ی')
        .replace(/[كﻙ]/g, 'ک');
    };
    return norm(haystack).indexOf(norm(needle)) !== -1;
  }

  function deepClone(v) {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  }

  App.util = {
    setDigits: setDigits,
    digits: digits,
    safeUrl: safeUrl,
    toFa: toFa,
    toEn: toEn,
    faNum: faNum,
    faPct: faPct,
    uid: uid,
    nowIso: nowIso,
    clamp: clamp,
    parseNum: parseNum,
    trim: trim,
    byKey: byKey,
    matches: matches,
    deepClone: deepClone
  };
})(window.App = window.App || {});
