/*
 * The Fekre Azad mark — «فکر آزاد».
 *
 * Geometry is taken verbatim from the brand handoff (Fekre Azad Logo.dc.html):
 * an open bowl on a 100x100 box with the dot free of the loop, the skeleton of
 * ف. Drawn as SVG rather than a bitmap so it stays sharp at every size and can
 * take the current theme colours.
 *
 * Brand rules honoured here: the mark is never rotated, the opening is never
 * closed, the dot never sits inside the bowl, clear space equals the dot
 * diameter, and below 20px the heavier stroke variant is used.
 */
(function (App) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  var BRAND = {
    ink: '#101A2E',        // Ink Navy
    accent: '#1E4FD8',     // Brand Blue
    accentLight: '#6C93FF',
    nearBlack: '#0B1220',
    paper: '#F5F7FA'
  };

  var ARC = 'M 71.80 46.48 A 28 28 0 1 1 53.52 28.20';

  /**
   * The mark on its own.
   * opts: { ink, accent } — any CSS colour, including var(--…) and
   * 'currentColor'. Defaults follow the app's theme rather than the raw brand
   * colours so the logo sits correctly in light and dark mode.
   */
  function mark(size, opts) {
    opts = opts || {};
    var px = Number(size) || 24;
    var small = px < 20;                       // heavier construction at tiny sizes

    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('width', px);
    svg.setAttribute('height', px);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('class', 'logo-mark');
    if (opts.label) {
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', opts.label);
    } else {
      svg.setAttribute('aria-hidden', 'true');
    }

    var bowl = document.createElementNS(NS, 'path');
    bowl.setAttribute('d', ARC);
    bowl.setAttribute('stroke', opts.ink || 'currentColor');
    bowl.setAttribute('stroke-width', small ? 15 : 13);
    svg.appendChild(bowl);

    var dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', '79.39');
    dot.setAttribute('cy', '20.61');
    dot.setAttribute('r', small ? 11 : 10);
    dot.setAttribute('fill', opts.accent || 'var(--accent)');
    svg.appendChild(dot);

    return svg;
  }

  /** The app-icon treatment: mark reversed out of a brand-blue rounded tile. */
  function tile(size, opts) {
    opts = opts || {};
    var px = Number(size) || 34;
    var node = App.el('span.logo-tile', {
      style: { width: px + 'px', height: px + 'px', 'border-radius': Math.round(px * 0.226) + 'px' },
      title: opts.title || null
    }, [mark(Math.round(px * 0.6), { ink: '#FFFFFF', accent: BRAND.accentLight })]);
    return node;
  }

  /**
   * Mark + wordmark, as in the handoff's lockup: «فکر آزاد» over the latin
   * line. `tone` is 'light' (default) or 'dark' for dark backgrounds.
   */
  function lockup(opts) {
    opts = opts || {};
    var size = opts.size || 44;
    return App.el('div.logo-lockup' + (opts.tone === 'dark' ? '.is-dark' : ''), [
      mark(size, opts.tone === 'dark'
        ? { ink: '#FFFFFF', accent: BRAND.accentLight, label: 'فکر آزاد' }
        : { ink: 'var(--ink)', accent: 'var(--accent)', label: 'فکر آزاد' }),
      App.el('div.logo-lockup__text', [
        App.el('div.logo-lockup__fa', 'فکر آزاد'),
        App.el('div.logo-lockup__en', 'Fekre Azad Lifestyle')
      ])
    ]);
  }

  App.logo = {
    BRAND: BRAND,
    ARC: ARC,
    mark: mark,
    tile: tile,
    lockup: lockup
  };
})(window.App = window.App || {});
