/*
 * Service worker — makes the dashboard installable and able to open offline.
 *
 * It caches the app's own files (HTML, CSS, JS, icons, fonts) and nothing
 * else. Your data is never cached here: every api.php request goes straight
 * to the network, so what you see is always the real saved state, and an
 * edit made offline is never mistaken for a saved one.
 *
 * Bump VERSION whenever the app files change; the old cache is then dropped
 * and every open tab is offered the new version.
 */
const VERSION = '3.2.0';
const SHELL_CACHE = 'pld-shell-' + VERSION;
const FONT_CACHE = 'pld-fonts-' + VERSION;

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/css/app.css?v=' + VERSION,
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/favicon-16.png',
  'assets/icons/favicon-32.png',
  'assets/icons/logo.svg',
  // The default font ships with the shell so the app looks right offline from
  // the very first load. The other families are fetched only if chosen, and
  // the same-origin handler below caches them on the way past.
  'assets/fonts/estedad/estedad.css',
  'assets/fonts/estedad/estedad-400.woff', 'assets/fonts/estedad/estedad-500.woff',
  'assets/fonts/estedad/estedad-600.woff', 'assets/fonts/estedad/estedad-700.woff',
  'assets/js/core/prepaint.js', 'assets/js/core/util.js', 'assets/js/core/jalali.js', 'assets/js/core/storage.js',
  'assets/js/core/schema.js', 'assets/js/core/seed.js', 'assets/js/core/db.js',
  'assets/js/core/crypto.js', 'assets/js/core/vault.js', 'assets/js/core/recurring.js',
  'assets/js/core/changelog.js',
  'assets/js/core/theme.js', 'assets/js/core/xlsx.js', 'assets/js/stats.js',
  'assets/js/ui/icons.js', 'assets/js/ui/logo.js', 'assets/js/ui/dom.js', 'assets/js/ui/toast.js',
  'assets/js/ui/modal.js', 'assets/js/ui/categories.js', 'assets/js/ui/form.js',
  'assets/js/ui/widgets.js', 'assets/js/ui/export.js', 'assets/js/ui/auth.js',
  'assets/js/ui/pwa.js', 'assets/js/ui/whatsnew.js',
  'assets/js/pages/home.js', 'assets/js/pages/goals.js', 'assets/js/pages/money.js',
  'assets/js/pages/notes.js', 'assets/js/pages/learning.js', 'assets/js/pages/people.js',
  'assets/js/pages/car.js', 'assets/js/pages/vault.js',
  'assets/js/pages/settings.js', 'assets/js/app.js'
].map(url => url.indexOf('assets/js/') === 0 ? url + '?v=' + VERSION : url);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // addAll fails the whole install if one file 404s, so add them individually.
      .then(cache => Promise.all(SHELL.map(url =>
        cache.add(new Request(url, { cache: 'reload' })).catch(() => null))))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(k => k.startsWith('pld-') && k !== SHELL_CACHE && k !== FONT_CACHE)
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

function isFontRequest(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Data always comes from the server, never from a cache.
  if (url.pathname.endsWith('/api.php') || url.pathname === '/api.php') return;

  // Page loads: prefer the network so a new version is picked up, fall back
  // to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('index.html', { ignoreSearch: true })
        .then(hit => hit || caches.match('./')))
    );
    return;
  }

  if (isFontRequest(url)) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(FONT_CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => hit))
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // App files: serve from cache, refresh in the background.
  event.respondWith(
    caches.match(req).then(hit => {
      const network = fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit);
      return hit || network;
    })
  );
});
