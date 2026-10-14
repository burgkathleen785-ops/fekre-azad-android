/*
 * Modal shell + the confirm dialog.
 *
 * Escape closes, clicking the backdrop closes, focus returns to whatever was
 * focused before opening, and focus is kept inside the dialog while it is up.
 */
(function (App) {
  'use strict';

  var el = App.el;
  var stack = [];

  function open(opts) {
    var previousFocus = document.activeElement;

    var dialog = el('div.modal' + (opts.narrow ? '.modal--narrow' : ''), {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': opts.title || ''
    }, [
      opts.title ? el('h2.modal__title', opts.title) : null,
      opts.sub ? el('p.modal__sub', opts.sub) : null,
      opts.body,
      opts.footer ? el('div.modal__foot', opts.footer) : null
    ]);

    var overlay = el('div.overlay', {
      onmousedown: function (e) { if (e.target === overlay) close(); }
    }, [dialog]);

    function onKeydown(e) {
      if (stack[stack.length - 1] !== handle) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Tab') {
        trapFocus(e, dialog);
      }
    }

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKeydown, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      stack = stack.filter(function (h) { return h !== handle; });
      if (!stack.length) document.body.style.removeProperty('overflow');
      if (previousFocus && previousFocus.focus) {
        try { previousFocus.focus(); } catch (e) { /* ignore */ }
      }
      if (opts.onClose) opts.onClose();
    }

    var handle = { close: close, dialog: dialog };

    document.addEventListener('keydown', onKeydown, true);
    document.body.appendChild(overlay);
    document.body.style.setProperty('overflow', 'hidden');
    stack.push(handle);

    var first = dialog.querySelector('[autofocus]') ||
      dialog.querySelector('input, textarea, select, button');
    if (first) {
      try { first.focus(); if (first.select) first.select(); } catch (e) { /* ignore */ }
    }

    return handle;
  }

  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), ' +
    'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function trapFocus(e, root) {
    var items = Array.prototype.slice.call(root.querySelectorAll(FOCUSABLE))
      .filter(function (n) { return n.offsetParent !== null; });
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /**
   * Destructive-action confirmation. Used only where an action genuinely
   * cannot be undone — deleting a record, replacing the whole database.
   */
  function confirm(opts) {
    return new Promise(function (resolve) {
      var settled = false;
      function done(value) {
        if (settled) return;
        settled = true;
        handle.close();
        resolve(value);
      }

      var confirmBtn = el('button.btn', {
        type: 'button',
        style: opts.danger === false ? null : { background: 'var(--neg)' },
        onclick: function () { done(true); }
      }, opts.confirmLabel || 'حذف');

      var handle = open({
        narrow: true,
        title: opts.title,
        sub: opts.message,
        body: null,
        footer: [
          confirmBtn,
          el('button.btn-ghost', { type: 'button', onclick: function () { done(false); } },
            opts.cancelLabel || 'انصراف')
        ],
        onClose: function () { done(false); }
      });

      try { confirmBtn.focus(); } catch (e) { /* ignore */ }
    });
  }

  App.modal = { open: open, confirm: confirm };
})(window.App = window.App || {});
