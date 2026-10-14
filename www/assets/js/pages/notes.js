/* یادداشت‌ها و فکرها — one database, three stages. */
(function (App) {
  'use strict';

  var el = App.el;
  var util = App.util;
  var db = App.db;
  var J = App.jalali;
  var stats = App.stats;
  var W = App.widgets;

  var STAGES = [
    { name: 'گذرا', modifier: '' },
    { name: 'پرورش‌یافته', modifier: 'is-developed' },
    { name: 'مرجع', modifier: 'is-reference' }
  ];

  var query = '';   // kept across re-renders

  function render() {
    var counts = stats.noteCounts();
    var all = db.list('notes').sort(util.byKey('updatedAt', 'desc'));
    var filtered = W.byCategory('notes', all);
    var narrowed = filtered.length !== all.length;
    var visible = filtered.filter(function (n) {
      return util.matches(n.title, query) || util.matches(n.content, query);
    });

    return el('div', [
      el('div.eyebrow', 'FLEETING → DEVELOPED → REFERENCE'),
      el('h1.page-title.page-title--tight', 'یادداشت‌ها و فکرها'),
      el('p.page-lede',
        'یک دیتابیس، سه وضعیت. همه چیز از «گذرا» شروع می‌شود. هر یادداشتی که دوباره سراغش رفتی و ' +
        'کامل‌ترش کردی می‌رود به «پرورش‌یافته». چیزهایی که فقط باید پیدا شوند (کد، لینک، تنظیمات) ' +
        'می‌روند به «مرجع».'),

      W.categoryBar('notes', all),
      searchBar(filtered.length, visible.length),

      el('div.autogrid.autogrid--notes', STAGES.map(function (stage) {
        return column(stage, visible.filter(function (n) {
          return (n.stage || 'گذرا') === stage.name;
        }), counts[stage.name] || 0, narrowed);
      })),

      el('div.card.card--pad.card--soft.mt-30', [
        el('div', { style: { 'font-size': '13px', 'font-weight': '600', 'margin-bottom': '8px' } },
          'یک عادت کوچک'),
        el('div', { style: { 'font-size': '12.5px', 'line-height': '1.9', color: 'var(--ink-2)' } },
          'هفته‌ای یک بار ستون «گذرا» را خالی کن: هر فکر یا به کار تبدیل می‌شود، یا پرورده و ' +
          'کامل می‌شود، یا پاک. اگر متن بلندی جای دیگری داری، لینکش را در فیلد «منبع» بگذار ' +
          'تا یک محتوا در دو جا نگه داشته نشود.')
      ])
    ]);
  }

  function searchBar(total, shown) {
    var input = el('input.search__input', {
      type: 'search',
      placeholder: 'جست‌وجو در یادداشت‌ها…',
      'data-focus-key': 'note-search',
      oninput: function () {
        query = input.value;
        App.view.refresh();
      }
    });
    input.value = query;

    return el('div.search', [
      el('span.eyebrow', 'SEARCH'),
      input,
      el('span.num.muted', { style: { 'font-size': '12px' } },
        query ? util.toFa(shown) + ' از ' + util.toFa(total) : util.toFa(total)),
      query
        ? el('button.icon-btn', {
            type: 'button',
            onclick: function () { query = ''; App.view.refresh(); }
          }, 'پاک‌کردن')
        : null
    ]);
  }

  function column(stage, notes, totalCount, narrowed) {
    var filtering = query || narrowed;
    return el('div', [
      el('div.notes-col__head' + (stage.modifier ? '.' + stage.modifier : ''), [
        el('span.notes-col__title', stage.name),
        el('span.notes-col__count', util.toFa(filtering ? notes.length : totalCount))
      ]),
      el('div.stack.stack--sm', [
        notes.length
          ? notes.map(function (n) { return card(n, stage); })
          : el('div.empty.empty--inline', filtering ? 'چیزی پیدا نشد.' : 'خالی است.'),
        W.addButton('یادداشت', function () {
          App.crud.create('notes', { stage: stage.name, category: W.activeCategory('notes') });
        }, true)
      ])
    ]);
  }

  function card(note, stage) {
    var developed = stage.name === 'پرورش‌یافته';
    var hasTitle = !!util.trim(note.title);
    var link = W.linkLabel(note.link);
    var showMeta = developed || stage.name === 'مرجع' || !!note.category;

    return el('div.note.row' + (developed ? '.note--developed' : ''), {
      role: 'button',
      tabindex: '0',
      title: 'ساخته‌شده ' + J.format(note.createdAt ? note.createdAt.slice(0, 10) : null, true),
      onclick: function (e) {
        if (e.target.closest('.row-actions')) return;
        open(note);
      },
      onkeydown: function (e) {
        if (e.key === 'Enter') open(note);
      }
    }, [
      hasTitle ? el('div.note__title', note.title) : null,
      note.content
        ? el('div' + (hasTitle ? '.note__body' : ''), excerpt(note.content, hasTitle ? 160 : 260))
        : null,
      showMeta || link
        ? el('div.note__meta', [
            el('span', [W.categoryTag(note.category), link ? ' ' + link : '']),
            el('span.num', J.format(dateOf(note)))
          ])
        : null,
      W.externalLink(note.source, 'منبع', 'note__source'),
      W.rowActions(null, function () { App.crud.destroy('notes', note.id); })
    ]);
  }

  function dateOf(note) {
    var stamp = note.updatedAt || note.createdAt;
    return stamp ? stamp.slice(0, 10) : null;
  }

  function excerpt(text, max) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  function open(note) {
    var created = J.format(note.createdAt ? note.createdAt.slice(0, 10) : null, true);
    var updated = J.format(dateOf(note), true);
    App.crud.edit('notes', note.id, {
      sub: 'ساخته‌شده ' + created + (updated !== created ? ' · آخرین ویرایش ' + updated : '')
    });
  }

  App.pages = App.pages || {};
  App.pages.notes = { id: 'notes', label: 'یادداشت‌ها و فکرها', group: 'دانستن', render: render };
})(window.App = window.App || {});
