/*
 * Line icons for the sidebar rail.
 *
 * Drawn on a 24x24 grid, stroked with currentColor so they take the rail's
 * colour. SVG needs createElementNS, which el() does not do, hence this file.
 */
(function (App) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  var PATHS = {
    home:     ['M3 10.8 12 3l9 7.8v9.2a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1z'],
    goals:    ['M4 6.5A2.5 2.5 0 0 1 6.5 4h4l2 2h5A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z',
               'M8 12h8M8 15.5h5'],
    money:    ['M3.5 5h17a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
               'M7 12h.01M17 12h.01M12 9.5v5'],
    notes:    ['M6 3.5h9l3 3V20.5H6z', 'M15 3.5v4h4M9 11h6M9 14.5h6M9 18h4'],
    learning: ['M3.5 7.5 12 4l8.5 3.5L12 11z', 'M6 9.5V15c2 1.7 4 2.5 6 2.5s4-.8 6-2.5V9.5M20.5 8v6'],
    people:   ['M12 4.8a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4z', 'M5.5 20c.7-3.4 2.8-5.2 6.5-5.2s5.8 1.8 6.5 5.2'],
    car:      ['M4.2 12.4l1.6-4.3A2 2 0 0 1 7.7 6.8h8.6a2 2 0 0 1 1.9 1.3l1.6 4.3',
               'M3.6 12.4h16.8a1 1 0 0 1 1 1v3.4a1 1 0 0 1-1 1H3.6a1 1 0 0 1-1-1v-3.4a1 1 0 0 1 1-1z',
               'M6.4 15.1h.01M17.6 15.1h.01M6.5 17.8v1.4M17.5 17.8v1.4'],
    vault:    ['M5.8 10.6h12.4a1 1 0 0 1 1 1v7.4a1 1 0 0 1-1 1H5.8a1 1 0 0 1-1-1v-7.4a1 1 0 0 1 1-1z',
               'M8.4 10.6V8.2a3.6 3.6 0 0 1 7.2 0v2.4', 'M12 14.2v2.6'],
    settings: ['M12 8.6a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8z',
               'M12 2.8l1.4 2.3 2.6-.5.6 2.6 2.4 1.1-1 2.5 1 2.5-2.4 1.1-.6 2.6-2.6-.5L12 21.2l-1.4-2.3-2.6.5-.6-2.6-2.4-1.1 1-2.5-1-2.5 2.4-1.1.6-2.6 2.6.5z']
  };

  /** An <svg> node for a page id, or a small dot when the page is unknown. */
  function icon(id) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    var paths = PATHS[id] || ['M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z'];
    paths.forEach(function (d) {
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    return svg;
  }

  App.icons = { icon: icon, PATHS: PATHS };
})(window.App = window.App || {});
