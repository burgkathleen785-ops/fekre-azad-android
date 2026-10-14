/*
 * Jalali (Solar Hijri) <-> Gregorian conversion.
 *
 * The conversion maths is the standard Borkowski algorithm as popularised by
 * jalaali-js; it is exact for years 1178-1633 Jalali. Dates are STORED as
 * Gregorian ISO strings ("2026-09-16") so they sort, compare and export
 * cleanly, and are DISPLAYED as Jalali because the whole dashboard is Persian.
 *
 * One exception: a date with no year — a birthday you only know as "12 Esfand"
 * — is stored as "--12-12". There is no Gregorian equivalent of a day without
 * a year, so that form holds the JALALI month and day directly. Only fields
 * marked `partial: true` in the schema can produce it, and every function here
 * that reads a date knows about both shapes.
 */
(function (App) {
  'use strict';

  var util = App.util;

  function div(a, b) { return ~~(a / b); }
  function mod(a, b) { return a - ~~(a / b) * b; }

  var BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210,
    1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

  function jalCal(jy, withoutLeap) {
    var bl = BREAKS.length, gy = jy + 621, leapJ = -14, jp = BREAKS[0];
    var jm, jump, leap, leapG, march, n, i;

    if (jy < jp || jy >= BREAKS[bl - 1]) throw new Error('Jalaali year out of range: ' + jy);

    for (i = 1; i < bl; i += 1) {
      jm = BREAKS[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    n = jy - jp;

    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

    leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    march = 20 + leapJ - leapG;

    if (!withoutLeap) {
      if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
      leap = mod(mod(n + 1, 33) - 1, 4);
      if (leap === -1) leap = 4;
    }
    return { leap: leap, gy: gy, march: march };
  }

  /** Gregorian y/m/d -> Julian Day Number */
  function g2d(gy, gm, gd) {
    var d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
      div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
  }

  /** Julian Day Number -> Gregorian */
  function d2g(jdn) {
    var j, i, gd, gm, gy;
    j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    i = div(mod(j, 1461), 4) * 5 + 308;
    gd = div(mod(i, 153), 5) + 1;
    gm = mod(div(i, 153), 12) + 1;
    gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy: gy, gm: gm, gd: gd };
  }

  function j2d(jy, jm, jd) {
    var r = jalCal(jy, true);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }

  function d2j(jdn) {
    var gy = d2g(jdn).gy, jy = gy - 621, r = jalCal(jy, false);
    var jdn1f = g2d(gy, 3, r.march), jd, jm, k;
    k = jdn - jdn1f;
    if (k >= 0) {
      if (k <= 185) return { jy: jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
      k -= 186;
    } else {
      jy -= 1;
      k += 179;
      if (r.leap === 1) k += 1;
    }
    return { jy: jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
  }

  var MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  var WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];

  function isLeapJ(jy) { return jalCal(jy, false).leap === 0; }

  function daysInJMonth(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return isLeapJ(jy) ? 30 : 29;
  }

  // ---- ISO helpers ------------------------------------------------------

  var ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  var MD_RE = /^--(\d{2})-(\d{2})$/;        // Jalali month and day, no year

  function isIso(s) { return typeof s === 'string' && ISO_RE.test(s); }

  /** True for a stored year-less date like "--12-12". */
  function isPartial(s) { return typeof s === 'string' && MD_RE.test(s); }

  /**
   * Jalali pieces of either shape: { jy, jm, jd } with jy === null when the
   * year is unknown. Returns null if the value is neither shape.
   */
  function parts(value) {
    var md = MD_RE.exec(value || '');
    if (md) {
      var pm = +md[1], pd = +md[2];
      if (pm < 1 || pm > 12 || pd < 1 || pd > 31) return null;
      return { jy: null, jm: pm, jd: pd };
    }
    var j = isoToJ(value);
    return j ? { jy: j.jy, jm: j.jm, jd: j.jd } : null;
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  /** Local-midnight Date -> "YYYY-MM-DD" (never touches UTC, so no off-by-one). */
  function dateToIso(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function isoToDate(iso) {
    var m = ISO_RE.exec(iso);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]);
  }

  function todayIso() { return dateToIso(new Date()); }

  /** ISO -> {jy, jm, jd} or null */
  function isoToJ(iso) {
    var m = ISO_RE.exec(iso || '');
    if (!m) return null;
    try { return d2j(g2d(+m[1], +m[2], +m[3])); } catch (e) { return null; }
  }

  function jToIso(jy, jm, jd) {
    var g = d2g(j2d(jy, jm, jd));
    return g.gy + '-' + pad2(g.gm) + '-' + pad2(g.gd);
  }

  // ---- formatting -------------------------------------------------------

  /**
   * "2026-09-16" -> "۲۵ شهریور" (or "۲۵ شهریور ۱۴۰۵" when withYear).
   * A year-less date simply never shows a year, whatever is asked for.
   */
  function format(value, withYear) {
    var j = parts(value);
    if (!j) return '—';
    var s = util.toFa(j.jd) + ' ' + MONTHS[j.jm - 1];
    return (withYear && j.jy) ? s + ' ' + util.toFa(j.jy) : s;
  }

  /** "2026-09-16" -> "چهارشنبه ۲۵ شهریور ۱۴۰۵" */
  function formatLong(iso) {
    var d = isoToDate(iso);
    if (!d) return '—';
    return WEEKDAYS[d.getDay()] + ' ' + format(iso, true);
  }

  /** "2026-09-16" -> "1405/06/25" — the form used in edit fields. */
  function toInput(value) {
    var j = parts(value);
    if (!j) return '';
    var tail = pad2(j.jm) + '/' + pad2(j.jd);
    return j.jy ? j.jy + '/' + tail : tail;
  }

  /** Strip the things that make two spellings of a month name differ. */
  function foldName(text) {
    return String(text || '')
      .replace(/[\u200c\u200f\u200e\s]/g, '')
      .replace(/[يﻱﻲ]/g, 'ی')
      .replace(/[كﻙ]/g, 'ک')
      .replace(/[أإآا]/g, 'ا')
      .replace(/ه$/, 'ه');
  }

  var MONTH_LOOKUP = (function () {
    var map = {};
    MONTHS.forEach(function (name, i) { map[foldName(name)] = i + 1; });
    // Spellings people actually type.
    map[foldName('امرداد')] = 5;
    map[foldName('شهريور')] = 6;
    map[foldName('ارديبهشت')] = 2;
    return map;
  })();

  /** A month written as a word, or 0. Accepts an unambiguous prefix. */
  function monthFromName(text) {
    var key = foldName(text);
    if (!key) return 0;
    if (MONTH_LOOKUP[key]) return MONTH_LOOKUP[key];
    if (key.length < 3) return 0;
    var hit = 0;
    for (var k in MONTH_LOOKUP) {
      if (Object.prototype.hasOwnProperty.call(MONTH_LOOKUP, k) && k.indexOf(key) === 0) {
        if (hit && hit !== MONTH_LOOKUP[k]) return 0;   // ambiguous
        hit = MONTH_LOOKUP[k];
      }
    }
    return hit;
  }

  /** "72" -> 1372, "05" -> 1405. Anything four digits is taken as written. */
  function expandYear(n) {
    if (n >= 1000) return n;
    if (n >= 100) return 0;
    var thisYear = isoToJ(todayIso());
    var edge = thisYear ? thisYear.jy % 100 : 5;
    return n <= edge ? 1400 + n : 1300 + n;
  }

  /**
   * Parse what the user typed into a stored date.
   *
   * Accepts "1405/6/25", "۱۴۰۵-۰۶-۲۵", "1405 06 25", "25 شهریور 1405",
   * "شهریور 25", a two-digit year, and the words "امروز" / "فردا" / "دیروز".
   *
   * With `opts.partial`, a date with no year is allowed too — "12 اسفند" or
   * "12/12" — and comes back as "--12-12". Without it, the year is required,
   * because a task or a transaction with no year would be meaningless.
   *
   * Returns { iso } or { error }.
   */
  function parseInput(raw, opts) {
    var allowPartial = !!(opts && opts.partial);
    var text = util.trim(util.toEn(raw || ''));
    if (!text) return { iso: null };

    if (text === 'امروز') return { iso: todayIso() };
    if (text === 'فردا') return { iso: addDays(todayIso(), 1) };
    if (text === 'دیروز') return { iso: addDays(todayIso(), -1) };

    // A month written as a word can sit anywhere: "12 اسفند" or "اسفند 12".
    var named = 0;
    var rest = text.replace(/[^\d]+/g, function (chunk) {
      var m = monthFromName(chunk);
      if (m && !named) { named = m; return ' '; }
      return ' ';
    });

    var nums = rest.split(/\s+/).filter(Boolean).map(Number);
    if (nums.some(isNaN)) return { error: 'تاریخ را به شکل ۱۴۰۵/۰۶/۲۵ بنویس' };

    var jy = null, jm = 0, jd = 0;

    if (named) {
      jm = named;
      if (nums.length === 1) { jd = nums[0]; }
      else if (nums.length === 2) {
        // "12 اسفند 1372" or "1372 اسفند 12" — the four-digit one is the year.
        if (nums[0] > 31) { jy = nums[0]; jd = nums[1]; }
        else { jd = nums[0]; jy = nums[1]; }
      } else if (nums.length === 0) {
        return { error: 'روز را هم بنویس — مثل «۱۲ ' + MONTHS[jm - 1] + '»' };
      } else {
        return { error: 'تاریخ را به شکل ۱۴۰۵/۰۶/۲۵ بنویس' };
      }
    } else if (nums.length === 3) {
      jy = nums[0]; jm = nums[1]; jd = nums[2];
    } else if (nums.length === 2 && allowPartial) {
      jm = nums[0]; jd = nums[1];
    } else {
      return {
        error: allowPartial
          ? 'تاریخ را به شکل ۱۴۰۵/۰۶/۲۵ بنویس — یا بدون سال: ۰۶/۲۵'
          : 'تاریخ را به شکل ۱۴۰۵/۰۶/۲۵ بنویس'
      };
    }

    if (jy === null && !allowPartial) {
      // A month name with no year is fine for a birthday and meaningless for
      // a task or a transaction, so only `partial` fields may leave it out.
      return { error: 'سال را هم بنویس — مثل «۱۲ ' + (jm ? MONTHS[jm - 1] : 'اسفند') + ' ۱۴۰۵»' };
    }
    if (jy !== null) {
      jy = expandYear(jy);
      if (!jy || jy < 1178 || jy > 1632) return { error: 'سال خارج از محدوده است' };
    }
    if (jm < 1 || jm > 12) return { error: 'ماه باید بین ۱ تا ۱۲ باشد' };

    // Without a year, use the longest that month can ever be, so a 30 Esfand
    // birthday is not rejected because this particular year is not a leap year.
    var max;
    try {
      max = jy === null ? (jm <= 6 ? 31 : 30) : daysInJMonth(jy, jm);
    } catch (e) {
      return { error: 'تاریخ نامعتبر است' };
    }
    if (jd < 1 || jd > max) {
      return {
        error: MONTHS[jm - 1] + (jy ? ' ' + util.toFa(jy) : '') +
          ' فقط ' + util.toFa(max) + ' روز دارد'
      };
    }

    if (jy === null) return { iso: '--' + pad2(jm) + '-' + pad2(jd) };
    return { iso: jToIso(jy, jm, jd) };
  }

  // ---- arithmetic -------------------------------------------------------

  function addDays(iso, n) {
    var d = isoToDate(iso);
    if (!d) return null;
    d.setDate(d.getDate() + n);
    return dateToIso(d);
  }

  /** Whole days from a to b (b - a). Both ISO. */
  function diffDays(a, b) {
    var da = isoToDate(a), db = isoToDate(b);
    if (!da || !db) return null;
    return Math.round((db - da) / 86400000);
  }

  /** Jalali month key for grouping, e.g. "1405-06". */
  function monthKey(iso) {
    var j = isoToJ(iso);
    return j ? j.jy + '-' + pad2(j.jm) : null;
  }

  function monthKeyOfToday() { return monthKey(todayIso()); }

  function monthLabel(key) {
    var p = String(key || '').split('-');
    return p.length === 2 ? MONTHS[+p[1] - 1] : '—';
  }

  /** Month name plus year, e.g. "مهر ۱۴۰۵". */
  function monthTitle(key) {
    var p = String(key || '').split('-');
    if (p.length !== 2) return '—';
    return MONTHS[+p[1] - 1] + ' ' + App.util.toFa(p[0]);
  }

  /** The month after `key`. Keys are zero-padded, so they also sort as text. */
  function nextMonthKey(key) {
    var p = String(key || '').split('-');
    var jy = +p[0], jm = +p[1] + 1;
    if (!jy || !p[1]) return null;
    if (jm === 13) { jm = 1; jy += 1; }
    return jy + '-' + pad2(jm);
  }

  /**
   * Every month key from `fromKey` to `toKey` inclusive, oldest first.
   * `limit` caps the list from the newest end, so a template with an old
   * start date cannot produce hundreds of months at once.
   */
  function monthKeyRange(fromKey, toKey, limit) {
    if (!fromKey || !toKey || fromKey > toKey) return [];
    var out = [];
    var k = fromKey;
    var guard = 600;
    while (k && k <= toKey && guard-- > 0) {
      out.push(k);
      k = nextMonthKey(k);
    }
    if (limit && out.length > limit) out = out.slice(out.length - limit);
    return out;
  }

  /** First and last day of a Jalali month, as ISO dates. */
  function monthDayIso(key, day) {
    var p = String(key || '').split('-');
    if (p.length !== 2) return null;
    var jy = +p[0], jm = +p[1];
    var max = daysInJMonth(jy, jm);
    var d = Math.max(1, Math.min(Number(day) || 1, max));
    return jToIso(jy, jm, d);
  }

  /** The last `count` Jalali month keys, oldest first, ending with `key`. */
  function lastMonthKeys(count, key) {
    var p = String(key || monthKeyOfToday()).split('-');
    var jy = +p[0], jm = +p[1], out = [];
    for (var i = 0; i < count; i++) {
      out.unshift(jy + '-' + pad2(jm));
      jm -= 1;
      if (jm === 0) { jm = 12; jy -= 1; }
    }
    return out;
  }

  /** Days left in the current Jalali month, including today. */
  function daysLeftInJMonth(iso) {
    var j = isoToJ(iso || todayIso());
    if (!j) return null;
    return daysInJMonth(j.jy, j.jm) - j.jd;
  }

  /**
   * Days until the next occurrence of a birthday, ignoring the year.
   * Returns 0 when it is today.
   */
  function daysUntilAnniversary(value, fromIso) {
    var target = parts(value);
    var from = isoToJ(fromIso || todayIso());
    if (!target || !from) return null;

    for (var y = from.jy; y <= from.jy + 1; y++) {
      var jd = target.jd;
      // 30 Esfand only exists in leap years — fall back to the 29th.
      if (target.jm === 12 && jd === 30 && !isLeapJ(y)) jd = 29;
      var d = diffDays(fromIso || todayIso(), jToIso(y, target.jm, jd));
      if (d >= 0) return d;
    }
    return null;
  }

  App.jalali = {
    MONTHS: MONTHS,
    isIso: isIso,
    isPartial: isPartial,
    parts: parts,
    monthFromName: monthFromName,
    todayIso: todayIso,
    isoToJ: isoToJ,
    jToIso: jToIso,
    format: format,
    formatLong: formatLong,
    toInput: toInput,
    parseInput: parseInput,
    addDays: addDays,
    diffDays: diffDays,
    monthKey: monthKey,
    monthKeyOfToday: monthKeyOfToday,
    monthLabel: monthLabel,
    monthTitle: monthTitle,
    nextMonthKey: nextMonthKey,
    monthKeyRange: monthKeyRange,
    monthDayIso: monthDayIso,
    lastMonthKeys: lastMonthKeys,
    daysInJMonth: daysInJMonth,
    daysLeftInJMonth: daysLeftInJMonth,
    daysUntilAnniversary: daysUntilAnniversary
  };
})(window.App = window.App || {});
