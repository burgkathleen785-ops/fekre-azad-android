/* Transient confirmation messages. No dialogs, no clicking to dismiss. */
(function (App) {
  'use strict';

  var el = App.el;
  var host = null;

  function container() {
    if (!host) {
      host = el('div.toasts', { 'aria-live': 'polite' });
      document.body.appendChild(host);
    }
    return host;
  }

  function show(message, kind, ms) {
    if (!message) return;
    var node = el('div.toast' + (kind === 'error' ? '.toast--err' : ''), { text: message });
    container().appendChild(node);
    window.setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, ms || (kind === 'error' ? 6000 : 2200));
  }

  App.toast = {
    show: function (m) { show(m, 'ok'); },
    error: function (m) { show(m, 'error'); }
  };
})(window.App = window.App || {});
