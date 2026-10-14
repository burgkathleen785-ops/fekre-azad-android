/*
 * Applies the last-used theme before anything paints, so a dark-mode user
 * never sees a white flash while the data loads.
 *
 * Kept in its own file rather than inline in index.html so the page can ship
 * a Content-Security-Policy without 'unsafe-inline' for scripts. Written by
 * App.theme.apply(); harmless when the cache is empty.
 */
(function () {
  'use strict';
  try {
    var v = JSON.parse(window.localStorage.getItem('pld:theme') || 'null');
    var r = document.documentElement;
    if (!v) {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        r.setAttribute('data-theme', 'dark');
      }
      return;
    }
    r.setAttribute('data-theme', v.mode === 'dark' ? 'dark' : 'light');
    if (v.accent) r.style.setProperty('--accent-base', v.accent);
    if (v.pos) r.style.setProperty('--pos-base', v.pos);
    if (v.neg) r.style.setProperty('--neg-base', v.neg);
    if (v.uiFamily) r.style.setProperty('--font-ui', v.uiFamily);
    if (v.numFamily) r.style.setProperty('--font-num', v.numFamily);
    if (v.uiUrl && /^https:\/\/fonts\.googleapis\.com\//.test(v.uiUrl)) {
      var link = document.createElement('link');
      link.id = 'pld-font-ui';
      link.rel = 'stylesheet';
      link.href = v.uiUrl;
      document.head.appendChild(link);
    }
  } catch (e) { /* ignore */ }
})();
