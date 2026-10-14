/*
 * Installing the dashboard as an app.
 *
 * Registers the service worker (only over http/https — it cannot run from a
 * file:// page), offers the install prompt where the browser supports it,
 * and tells the user when a newer version of the app files is ready.
 */
(function (App) {
  'use strict';

  var deferredPrompt = null;
  var listeners = [];

  function supported() {
    return 'serviceWorker' in window.navigator &&
      (window.location.protocol === 'https:' || window.location.hostname === 'localhost');
  }

  /** True when it is already running as an installed app. */
  function installed() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
  }

  function canInstall() { return !!deferredPrompt; }

  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } }); }

  /** Opens the browser's own install dialog. Resolves true if accepted. */
  function install() {
    if (!deferredPrompt) return Promise.resolve(false);
    var prompt = deferredPrompt;
    deferredPrompt = null;
    prompt.prompt();
    return prompt.userChoice.then(function (choice) {
      emit();
      return choice && choice.outcome === 'accepted';
    }, function () { return false; });
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();          // show our own button instead of the mini-bar
    deferredPrompt = e;
    emit();
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    emit();
    if (App.toast) App.toast.show('برنامه روی دستگاهت نصب شد');
  });

  function register() {
    if (!supported()) return;
    window.navigator.serviceWorker.register('sw.js').then(function (reg) {
      reg.addEventListener('updatefound', function () {
        var fresh = reg.installing;
        if (!fresh) return;
        fresh.addEventListener('statechange', function () {
          // A previous worker was in control, so this is an update, not a first install.
          if (fresh.state === 'installed' && window.navigator.serviceWorker.controller) {
            announceUpdate(fresh);
          }
        });
      });
    }, function (e) {
      console.warn('[pwa] service worker registration failed', e);
    });

    var reloading = false;
    window.navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  }

  function announceUpdate(worker) {
    if (!App.modal) return;
    var handle = App.modal.confirm({
      title: 'نسخه‌ی تازه‌ی برنامه آماده است',
      message: 'برای استفاده از نسخه‌ی جدید، صفحه یک بار تازه می‌شود. داده‌هایت دست نمی‌خورند.',
      confirmLabel: 'به‌روزرسانی کن',
      cancelLabel: 'بعداً',
      danger: false
    });
    handle.then(function (yes) {
      if (yes) worker.postMessage('skip-waiting');
    });
  }

  App.pwa = {
    register: register,
    supported: supported,
    installed: installed,
    canInstall: canInstall,
    install: install,
    onChange: onChange
  };
})(window.App = window.App || {});
