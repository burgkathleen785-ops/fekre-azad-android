/*
 * The "what's new" note.
 *
 * Shown once per release, right after the dashboard opens. What counts as
 * "once" is stored per account on the server (settings.seenVersion), not in
 * this browser — so reading it on the phone also marks it read on the laptop,
 * and clearing browser data does not make it pop up again.
 *
 * This is a different thing from the service worker's "a newer version is
 * ready, reload?" prompt in ui/pwa.js. That one is about fetching new files;
 * this one is about telling the user what those files changed. In practice
 * they happen in that order: reload first, then this note.
 */
(function (App) {
  'use strict';

  var el = App.el;
  var util = App.util;
  var J = App.jalali;

  /** Open the note if this account has not seen the current release yet. */
  function maybeShow() {
    var seen = App.db.settings().seenVersion || '';
    var entries = App.changelog.since(seen);
    if (!entries.length) { markSeen(); return false; }

    // A brand-new, empty account does not need a change log — it has no
    // "before" to compare with.
    if (!seen && App.db.totalRecords() === 0) { markSeen(); return false; }

    show(entries, true);
    return true;
  }

  function markSeen() {
    if (App.db.settings().seenVersion === App.changelog.VERSION) return;
    App.db.setSettings({ seenVersion: App.changelog.VERSION });
  }

  /** `andMarkSeen` is false when the user opened it deliberately from settings. */
  function show(entries, andMarkSeen) {
    var list = entries && entries.length ? entries : App.changelog.ENTRIES;

    var handle = App.modal.open({
      title: 'چه چیزی تازه شد',
      sub: 'نسخه‌ی ' + util.toFa(App.changelog.VERSION) + ' — داده‌هایت دست‌نخورده هستند.',
      body: el('div.changelog', list.map(entryNode)),
      footer: [
        el('button.btn', { type: 'button', onclick: function () { handle.close(); } }, 'فهمیدم'),
        el('button.btn-ghost', {
          type: 'button',
          onclick: function () { handle.close(); App.view.go('settings'); }
        }, 'تنظیمات')
      ],
      onClose: function () { if (andMarkSeen) markSeen(); }
    });
    return handle;
  }

  function entryNode(entry) {
    return el('div.changelog__entry', [
      el('div.changelog__head', [
        el('span.changelog__version', util.toFa(entry.version)),
        el('span.changelog__date', entry.title + ' · ' + jalaliLabel(entry.date))
      ]),
      el('ul.changelog__list', (entry.items || []).map(function (text) {
        return el('li', text);
      }))
    ]);
  }

  /** The dates in the change log are already Jalali, written as 1405-07-05. */
  function jalaliLabel(key) {
    var p = String(key || '').split('-');
    if (p.length !== 3) return '';
    return util.toFa(+p[2]) + ' ' + J.MONTHS[+p[1] - 1] + ' ' + util.toFa(p[0]);
  }

  App.whatsnew = { maybeShow: maybeShow, show: show, markSeen: markSeen };
})(window.App = window.App || {});
