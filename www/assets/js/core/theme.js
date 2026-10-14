/*
 * Appearance — light/dark mode, colours, fonts and digit style.
 *
 * Everything visual is driven by CSS custom properties on <html>. The user
 * picks three base colours (accent, income, expense); app.css derives every
 * tint, hover and background from them with color-mix(), separately for the
 * light and dark palettes. So this file only has to set a handful of
 * variables and a data-theme attribute.
 *
 * The resolved values are also cached in localStorage and applied by a tiny
 * inline script in index.html before first paint, so a dark-mode user never
 * sees a white flash while the data is still loading from the server.
 */
(function (App) {
  'use strict';

  var util = App.util;

  var CACHE_KEY = 'pld:theme';
  var GF = 'https://fonts.googleapis.com/css2?display=swap&family=';

  /**
   * Fonts with full Persian coverage.
   *
   * "Full" here was measured, not assumed: every candidate was checked for all
   * 32 Persian letters (including the Persian kaf and yeh, not the Arabic
   * ones), the Persian digits, the zero-width non-joiner, the Persian
   * thousands separator ٬ and the true minus sign −. A font missing any of
   * those puts empty boxes in the middle of words and numbers.
   *
   * The four `local: true` families are served from this site rather than
   * Google Fonts: faster in Iran, no third-party dependency, and they keep
   * working offline. `licence` marks the ones that are not free to
   * redistribute — fine for personal use, but they must be bought or removed
   * before the dashboard is published to the public. See assets/fonts/README.md.
   */
  var FONTS = [
    { id: 'estedad', label: 'استعداد (پیش‌فرض)', family: '"Estedad"',
      url: 'assets/fonts/estedad/estedad.css', local: true },
    { id: 'vazirmatn', label: 'وزیرمتن', family: '"Vazirmatn"',
      url: GF + 'Vazirmatn:wght@400;500;600;700' },
    { id: 'morabba', label: 'مربا', family: '"Morabba"',
      url: 'assets/fonts/morabba/morabba.css', local: true,
      licence: 'برای انتشار عمومی باید لایسنس این فونت را از fontiran.com بخری.' },
    { id: 'modam', label: 'مدام', family: '"Modam"',
      url: 'assets/fonts/modam/modam.css', local: true,
      licence: 'برای انتشار عمومی باید لایسنس این فونت را از fontiran.com بخری.' },
    { id: 'telegraph', label: 'تلگراف', family: '"Telegraph"',
      url: 'assets/fonts/telegraph/telegraph.css', local: true,
      licence: 'برای انتشار عمومی باید لایسنس این فونت را از fontha.com بخری.' },
    { id: 'plex-arabic', label: 'IBM Plex Sans Arabic', family: '"IBM Plex Sans Arabic"',
      url: GF + 'IBM+Plex+Sans+Arabic:wght@400;500;600;700' },
    { id: 'noto-sans', label: 'Noto Sans Arabic', family: '"Noto Sans Arabic"',
      url: GF + 'Noto+Sans+Arabic:wght@400;500;600;700' },
    { id: 'readex', label: 'Readex Pro', family: '"Readex Pro"',
      url: GF + 'Readex+Pro:wght@400;500;600;700' },
    { id: 'noto-kufi', label: 'Noto Kufi Arabic', family: '"Noto Kufi Arabic"',
      url: GF + 'Noto+Kufi+Arabic:wght@400;500;600;700' },
    { id: 'noto-naskh', label: 'Noto Naskh Arabic (نسخ)', family: '"Noto Naskh Arabic"',
      url: GF + 'Noto+Naskh+Arabic:wght@400;500;600;700' },
    { id: 'markazi', label: 'Markazi Text (کتابی)', family: '"Markazi Text"',
      url: GF + 'Markazi+Text:wght@400;500;600;700' },
    { id: 'tahoma', label: 'Tahoma (فونت سیستم، بدون دانلود)', family: 'Tahoma', url: '' },
    { id: 'segoe', label: 'Segoe UI (فونت سیستم، بدون دانلود)', family: '"Segoe UI"', url: '' },
    { id: 'custom', label: 'فونت دلخواه…', family: '', url: '' }
  ];

  /** Ready-made accent colours for one-click choice. */
  var PRESETS = [
    { label: 'آبی فکر آزاد', accent: '#1e4fd8' },
    { label: 'فیروزه‌ای', accent: '#0e7490' },
    { label: 'سبز', accent: '#15803d' },
    { label: 'بنفش', accent: '#6d28d9' },
    { label: 'سرخابی', accent: '#be185d' },
    { label: 'نارنجی', accent: '#c2410c' },
    { label: 'قهوه‌ای', accent: '#92400e' },
    { label: 'زغالی', accent: '#374151' }
  ];

  var DEFAULTS = { accent: '#1e4fd8', posColor: '#2f6f4f', negColor: '#b4453a' };

  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var current = null;

  function hex(value, fallback) {
    var s = util.trim(value);
    if (/^#[0-9a-f]{3}$/i.test(s)) {
      s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    }
    return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : fallback;
  }

  function fontById(id) {
    for (var i = 0; i < FONTS.length; i++) if (FONTS[i].id === id) return FONTS[i];
    return null;
  }

  /** CSS-safe family name for a user-typed font. */
  function quoteFamily(name) {
    var clean = util.trim(name).replace(/["\\;{}<>]/g, '');
    return clean ? '"' + clean + '"' : '';
  }

  /** { family, url } for a font id, honouring the custom font settings. */
  function resolveFont(id, s) {
    if (id === 'custom') {
      var fam = quoteFamily(s.customFont);
      if (!fam) return resolveFont('estedad', s);
      return { family: fam, url: util.safeUrl(s.customFontUrl) };
    }
    var f = fontById(id) || FONTS[0];
    return { family: f.family, url: f.url };
  }

  function resolveMode(mode) {
    if (mode === 'dark') return 'dark';
    if (mode === 'system') return media && media.matches ? 'dark' : 'light';
    return 'light';
  }

  /** Turn settings into the small set of values the page actually needs. */
  function resolve(s) {
    s = s || {};
    var ui = resolveFont(s.font || 'estedad', s);
    var num = (!s.numFont || s.numFont === 'same') ? ui : resolveFont(s.numFont, s);
    return {
      mode: resolveMode(s.themeMode),
      accent: hex(s.accent, DEFAULTS.accent),
      pos: hex(s.posColor, DEFAULTS.posColor),
      neg: hex(s.negColor, DEFAULTS.negColor),
      uiFamily: ui.family,
      uiUrl: ui.url,
      numFamily: num.family,
      numUrl: num.url,
      digits: s.digits === 'en' ? 'en' : 'fa'
    };
  }

  /** Apply resolved values to <html>. Also used by the pre-paint snippet's cache. */
  function paint(v) {
    var root = document.documentElement;
    root.setAttribute('data-theme', v.mode);
    root.style.setProperty('--accent-base', v.accent);
    root.style.setProperty('--pos-base', v.pos);
    root.style.setProperty('--neg-base', v.neg);
    root.style.setProperty('--font-ui', v.uiFamily);
    root.style.setProperty('--font-num', v.numFamily);
    ensureStylesheet('pld-font-ui', v.uiUrl);
    ensureStylesheet('pld-font-num', v.numUrl !== v.uiUrl ? v.numUrl : '');
    util.setDigits(v.digits);

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', v.mode === 'dark' ? '#0f1115' : '#f6f6f7');
  }

  function ensureStylesheet(id, url) {
    var link = document.getElementById(id);
    if (!url) {
      if (link) link.parentNode.removeChild(link);
      return;
    }
    if (link && link.getAttribute('href') === url) return;
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  /** Apply the saved appearance settings (or a draft of them, for live preview). */
  function apply(settings) {
    current = settings;
    var v = resolve(settings);
    paint(v);
    try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(v)); } catch (e) { /* ignore */ }
    return v;
  }

  function onSystemChange() {
    if (current && current.themeMode === 'system') {
      apply(current);
      if (App.view) App.view.refresh();
    }
  }
  if (media) {
    if (media.addEventListener) media.addEventListener('change', onSystemChange);
    else if (media.addListener) media.addListener(onSystemChange);
  }

  App.theme = {
    FONTS: FONTS,
    PRESETS: PRESETS,
    DEFAULTS: DEFAULTS,
    CACHE_KEY: CACHE_KEY,
    apply: apply,
    fontById: fontById,
    resolve: resolve,
    resolvedMode: function () { return document.documentElement.getAttribute('data-theme') || 'light'; },
    hex: hex
  };
})(window.App = window.App || {});
