/*
 * App shell — navigation, rendering and boot.
 *
 * There is no framework here on purpose. One function renders the current
 * page into <main>, and any write through App.db triggers it again. The
 * pages are small enough that re-rendering wholesale is both simpler and
 * faster than diffing, and it makes stale UI impossible.
 *
 * Boot is asynchronous because in online mode the data comes from api.php:
 * detect storage → (sign in) → load → render.
 */
(function (App) {
  'use strict';

  var el = App.el;
  var dom = App.dom;

  var PAGE_ORDER = ['home', 'goals', 'money', 'notes', 'learning', 'people', 'car', 'vault', 'settings'];

  var currentId = 'home';
  var navHost = null;
  var mainHost = null;
  var titleHost = null;
  var started = false;

  /** The pages this account has switched on, in menu order. */
  function pageList() {
    return PAGE_ORDER
      .map(function (id) { return App.pages[id]; })
      .filter(Boolean)
      .filter(function (page) { return App.db.moduleOn(App.schema.moduleOfPage(page.id)); });
  }

  function pageVisible(id) {
    return !!App.pages[id] && App.db.moduleOn(App.schema.moduleOfPage(id));
  }

  function pageById(id) {
    return App.pages[id] || App.pages.home;
  }

  // ---- routing ---------------------------------------------------------

  function idFromHash() {
    var raw = String(window.location.hash || '').replace(/^#\/?/, '');
    return App.pages[raw] ? raw : null;
  }

  /**
   * Switching a section off while standing on it — or following an old link
   * to it — must not leave a blank screen.
   */
  function fallbackIfHidden() {
    if (pageVisible(currentId)) return false;
    go('home');
    return true;
  }

  function apply(id) {
    currentId = id;
    render();
  }

  /**
   * The hash is the single source of truth for which page is showing, so the
   * back button works. When the hash actually changes, the hashchange handler
   * does the rendering; when it is already correct, render here instead.
   */
  function go(id) {
    if (!App.pages[id]) id = 'home';
    var target = '#/' + id;
    if (window.location.hash !== target) {
      window.location.hash = target;
    } else {
      apply(id);
    }
  }

  // ---- rendering -------------------------------------------------------

  /** Re-render in place, keeping whatever the user was typing in focus. */
  function refresh() {
    if (!started) return;
    var restore = captureFocus();
    render();
    restore();
  }

  function captureFocus() {
    var active = document.activeElement;
    var key = active && active.getAttribute && active.getAttribute('data-focus-key');
    if (!key) return function () {};

    var start = null, end = null;
    try { start = active.selectionStart; end = active.selectionEnd; } catch (e) { /* not a text field */ }

    return function () {
      var next = document.querySelector('[data-focus-key="' + key + '"]');
      if (!next) return;
      try {
        next.focus();
        if (start != null && next.setSelectionRange) next.setSelectionRange(start, end);
      } catch (e) { /* ignore */ }
    };
  }

  function render() {
    App.theme.apply(App.db.settings());
    if (started && fallbackIfHidden()) return;
    renderNav();
    renderTitle();
    renderMain();
    paintSync(App.storage.syncState(), '');
  }

  function renderTitle() {
    var title = App.db.settings().workspaceTitle || 'فکر آزاد';
    if (titleHost) {
      dom.clear(titleHost);
      titleHost.appendChild(App.logo.mark(22, { ink: 'var(--ink)', accent: 'var(--accent)' }));
      titleHost.appendChild(el('span', title));
    }
    document.title = title;
  }

  /**
   * The rail: icons always, labels and group headings only while it is
   * hovered or focused. Collapsed it shows just the workspace badge at the
   * bottom, so no text is left half-cut.
   */
  function renderNav() {
    dom.clear(navHost);
    var inner = el('div.nav__inner');
    inner.appendChild(el('div.nav__head', 'WORKSPACE'));

    pageList().forEach(function (page) {
      if (page.group) inner.appendChild(el('div.nav__group', page.group));
      var active = page.id === currentId;
      inner.appendChild(el('button.nav__item' + (active ? '.is-active' : ''), {
        type: 'button',
        title: page.label,
        'aria-label': page.label,
        'aria-current': active ? 'page' : null,
        onclick: function () { go(page.id); }
      }, [
        el('span.nav__icon', App.icons.icon(page.id)),
        el('span.nav__label', page.label)
      ]));
    });

    inner.appendChild(navFoot());
    navHost.appendChild(inner);
  }

  function navFoot() {
    var title = App.db.settings().workspaceTitle || 'فکر آزاد';
    return el('div.nav__foot', [
      App.logo.tile(34, { title: title }),
      el('span.nav__foot-text', [
        el('span.nav__foot-title', title),
        el('span.nav__foot-status', { id: 'nav-status' },
          App.storage.mode() === 'server' ? 'آنلاین' : 'ذخیره‌ی محلی')
      ])
    ]);
  }


  function renderMain() {
    var page = pageById(currentId);
    var keepScroll = mainHost.getAttribute('data-page') === page.id;
    var scrollY = window.scrollY;
    dom.clear(mainHost);
    mainHost.setAttribute('data-page', page.id);
    try {
      mainHost.appendChild(page.render());
    } catch (e) {
      console.error('[app] page "' + page.id + '" failed to render', e);
      mainHost.appendChild(errorPanel(page, e));
    }
    // A re-render of the same page (after an edit) keeps the scroll position;
    // navigating to another page starts at the top.
    if (keepScroll) window.scrollTo(0, scrollY);
    else window.scrollTo(0, 0);
  }

  function errorPanel(page, error) {
    return el('div', [
      el('h1.page-title.page-title--tight', 'این صفحه باز نشد'),
      el('p.page-lede',
        'صفحه‌ی «' + page.label + '» موقع ساخته‌شدن به خطا خورد. داده‌های تو سر جایشان هستند — ' +
        'هیچ چیزی پاک نشده. می‌توانی به صفحه‌ی دیگری بروی، یا از «تنظیمات و پشتیبان» خروجی بگیری.'),
      el('div.card.card--pad', [
        el('div.mono', { style: { 'font-size': '12px', color: 'var(--neg)', 'line-height': '1.8' }, dir: 'ltr' },
          String(error && error.message || error))
      ]),
      el('div.mt-24', { style: { display: 'flex', gap: '10px' } }, [
        el('button.btn', { type: 'button', onclick: function () { go('home'); } }, 'برگرد به خانه'),
        el('button.btn-ghost', { type: 'button', onclick: function () { go('settings'); } },
          'تنظیمات و پشتیبان')
      ])
    ]);
  }

  // ---- top bar -----------------------------------------------------------

  var SYNC_TEXT = {
    saved: 'ذخیره شد',
    saving: 'در حال ذخیره…',
    error: 'ذخیره نشد — تلاش دوباره',
    conflict: 'تعارض با دستگاه دیگر',
    auth: 'نیاز به ورود دوباره'
  };

  /** Paints the save state into the top bar and the rail footer. */
  function paintSync(state, detail) {
    var sync = document.getElementById('sync-badge');
    if (sync) {
      sync.className = 'sync is-' + state;
      sync.textContent = SYNC_TEXT[state] || state;
      sync.title = detail || '';
      sync.disabled = state === 'saved' || state === 'saving';
    }
    var footStatus = document.getElementById('nav-status');
    if (footStatus && App.storage.mode() === 'server') {
      footStatus.className = 'nav__foot-status is-' + state;
      footStatus.textContent = state === 'saved' ? 'آنلاین · ذخیره شد' : (SYNC_TEXT[state] || state);
    }
  }

  function renderTopbarTools() {
    var host = document.getElementById('topbar-tools');
    dom.clear(host);

    var server = App.storage.mode() === 'server';
    var sync = null;
    if (server) {
      sync = el('button.sync', {
        type: 'button',
        id: 'sync-badge',
        onclick: function () {
          var state = App.storage.syncState();
          if (state === 'error') App.storage.resume(false);
          else if (state === 'auth') App.auth.relogin();
          else if (state === 'conflict') App.auth.conflict();
        }
      });
    }

    host.appendChild(el('div.topbar__tools', [
      el('span.topbar__meta', server ? 'ONLINE' : 'LOCAL'),
      sync,
      el('button.icon-btn.topbar__btn', {
        type: 'button', title: 'خروجی Excel از همه‌ی داده‌ها',
        onclick: function () { App.exporter.excel(); }
      }, 'Excel'),
      el('button.icon-btn.topbar__btn', {
        type: 'button', title: 'روشن / تیره', 'aria-label': 'تغییر حالت روشن و تیره',
        onclick: toggleTheme
      }, App.theme.resolvedMode() === 'dark' ? 'حالت روشن' : 'حالت تیره')
    ]));

    paintSync(App.storage.syncState(), '');
  }

  function toggleTheme() {
    var next = App.theme.resolvedMode() === 'dark' ? 'light' : 'dark';
    App.db.setSettings({ themeMode: next });
    renderTopbarTools();
  }

  // ---- keyboard --------------------------------------------------------

  function bindKeys() {
    document.addEventListener('keydown', function (e) {
      if (document.querySelector('.overlay')) return;    // a modal owns the keyboard

      var mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (currentId !== 'home') go('home');
        var capture = document.querySelector('[data-focus-key="capture"]');
        if (capture) capture.focus();
        return;
      }

      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '');
      if (typing || mod || e.altKey) return;

      if (e.key === 'n') {
        e.preventDefault();
        App.crud.create('tasks', { date: App.jalali.todayIso() });
      }
    });
  }

  // ---- other devices -----------------------------------------------------

  var lastRemoteCheck = 0;

  /** When the tab regains focus, pick up changes saved from another device. */
  function checkRemote() {
    if (App.storage.mode() !== 'server' || App.storage.hasPending()) return;
    if (App.storage.syncState() !== 'saved') return;
    if (document.querySelector('.overlay')) return;   // don't swap data under an open form
    var now = Date.now();
    if (now - lastRemoteCheck < 15000) return;
    lastRemoteCheck = now;

    App.storage.checkRemoteRevision().then(function (r) {
      if (!r || !r.changed || App.storage.hasPending()) return;
      App.db.reload().then(function () {
        App.toast.show('داده‌ها از دستگاه دیگری به‌روز شد');
      }, function (err) {
        if (err && err.status === 'auth') App.auth.relogin();
      });
    });
  }

  // ---- boot ------------------------------------------------------------

  function boot() {
    navHost = document.getElementById('nav');
    mainHost = document.getElementById('main');
    titleHost = document.getElementById('workspace-title');

    App.auth.loading();

    App.storage.detect().then(function (d) {
      if (d.mode === 'unreachable') {
        App.auth.failure('سرور در دسترس نیست', d.error);
        return;
      }
      if (d.mode === 'server') {
        App.storage.hooks.conflict = App.auth.conflict;
        App.storage.hooks.authLost = App.auth.relogin;
        return App.auth.gate(d.status).then(load);
      }
      return load();
    });
  }

  function load() {
    App.auth.loading('در حال بارگذاری داده‌ها…');
    return App.db.init().then(start, function (err) {
      if (err && err.status === 'auth') {
        return App.auth.gate({ configured: true, authenticated: false }).then(load);
      }
      App.auth.failure('داده‌ها بارگذاری نشد', err && err.detail);
    });
  }

  function start() {
    started = true;
    App.auth.hideGate();

    currentId = idFromHash() || App.db.settings().startPage || 'home';
    if (!pageVisible(currentId)) currentId = 'home';

    window.addEventListener('hashchange', function () {
      var id = idFromHash();
      if (id) apply(id);
    });

    App.db.subscribe(refresh);
    bindKeys();
    render();
    renderTopbarTools();
    // One listener for the whole session; each render repaints from it.
    App.storage.onSync(paintSync);
    App.pwa.register();

    if (App.storage.mode() === 'local') {
      // Keep other tabs/windows of the same file in sync.
      window.addEventListener('storage', function (e) {
        if (e.key === App.storage.KEY) window.location.reload();
      });
    } else {
      window.addEventListener('focus', checkRemote);
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') checkRemote();
      });
      window.addEventListener('beforeunload', function (e) {
        if (!App.storage.hasPending()) return;
        App.storage.flush();
        e.preventDefault();
        e.returnValue = '';
      });
    }

    var status = App.db.bootStatus();
    if (status.message) {
      window.setTimeout(function () {
        if (status.level === 'error') App.toast.error(status.message);
        else App.toast.show(status.message);
      }, 300);
    }

    // "What's new", after the dashboard is on screen — and never on top of
    // something else, so a boot warning is read first.
    window.setTimeout(function () {
      if (document.querySelector('.overlay')) return;
      App.whatsnew.maybeShow();
    }, status.message ? 1400 : 500);
  }

  App.view = {
    go: go, refresh: refresh, render: render, pageList: pageList,
    pageVisible: pageVisible,
    current: function () { return currentId; },
    renderTopbarTools: function () { if (started) renderTopbarTools(); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.App = window.App || {});
