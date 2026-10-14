/* افراد — birthdays, clients and the people around the work. */
(function (App) {
  'use strict';

  var el = App.el;
  var util = App.util;
  var db = App.db;
  var J = App.jalali;
  var stats = App.stats;
  var W = App.widgets;

  function render() {
    var all = db.list('people').sort(util.byKey('name'));
    var people = W.byCategory('people', all);
    var birthdays = stats.upcomingBirthdays(5);

    return el('div', [
      el('div.eyebrow', 'BIRTHDAYS · CLIENTS · NETWORK'),
      el('h1.page-title.page-title--tight', 'افراد'),
      el('p.page-lede',
        'تولدها و تاریخ‌های مهم را از یاد نبری، و بدانی هر آدم در مسیر کاری‌ات چه نقشی دارد. ' +
        'روی نام هر شخص بزن تا پرونده‌اش — جزئیات، یادداشت و لینک سند — باز شود.'),

      W.categoryBar('people', all),

      people.length
        ? table(people)
        : W.emptyState(all.length ? 'در این دسته کسی نیست.' : 'هنوز کسی را ثبت نکرده‌ای.', null, null, false),
      el('div.mb-30', [W.addButton('شخص جدید', function () {
        App.crud.create('people', { category: W.activeCategory('people') });
      })]),

      el('div', { style: { display: 'flex', 'flex-wrap': 'wrap', gap: '16px' } }, [
        el('div.card.card--pad', { style: { flex: '1 1 220px' } }, [
          el('div.eyebrow.eyebrow--accent', { style: { 'margin-bottom': '10px' } }, 'تولدهای نزدیک'),
          birthdays.length
            ? el('div', { style: { 'font-size': '13.5px', 'line-height': '2.1' } },
                birthdays.map(function (b) {
                  return el('div', { style: { display: 'flex', 'justify-content': 'space-between', gap: '10px' } }, [
                    el('span', b.person.name),
                    el('span.num.muted', { style: { 'font-size': '12px' } },
                      b.days === 0 ? 'امروز' : util.toFa(b.days) + ' روز')
                  ]);
                }))
            : el('div.hint', 'برای کسی تاریخ تولد ثبت نشده.')
        ]),
        el('div.card.card--pad', { style: { flex: '1 1 220px' } }, [
          el('div.eyebrow.eyebrow--accent', { style: { 'margin-bottom': '10px' } }, 'به تفکیک دسته'),
          categorySummary(all)
        ])
      ])
    ]);
  }

  function categorySummary(all) {
    var cats = App.categories.list('people');
    var rows = cats.map(function (c) {
      var members = all.filter(function (p) { return p.category === c; });
      return { name: c, members: members };
    }).filter(function (r) { return r.members.length; });

    if (!rows.length) return el('div.hint', 'هنوز کسی دسته ندارد.');

    return el('div', { style: { 'font-size': '13px', 'line-height': '2', color: 'var(--ink-2)' } },
      rows.map(function (r) {
        return el('div', { style: { display: 'flex', gap: '10px', 'justify-content': 'space-between' } }, [
          el('span', { style: { 'min-width': '0' } }, [
            el('span', { style: { 'font-weight': '600' } }, r.name),
            el('span.muted', ' — ' + r.members.slice(0, 3).map(function (p) { return p.name; }).join('، ') +
              (r.members.length > 3 ? '، …' : ''))
          ]),
          el('span.num.muted', util.toFa(r.members.length))
        ]);
      }));
  }

  function table(people) {
    return el('div.table.mb-30', [
      el('div.table__head.grid-people', [
        el('div', 'نام'),
        el('div', 'نقش / زمینه'),
        el('div', 'تولد'),
        el('div', '')
      ])
    ].concat(people.map(row)));
  }

  function row(person) {
    var days = person.birthday ? J.daysUntilAnniversary(person.birthday) : null;
    var soon = days != null && days <= 14;
    var hasDoc = !!util.safeUrl(person.docUrl);
    var hasInfo = hasDoc || util.trim(person.notes) || (person.details && person.details.length) ||
      person.phone || person.email;

    return el('div.table__row.grid-people.row', [
      el('div.cell-strong', {
        style: { cursor: 'pointer' },
        role: 'button', tabindex: '0',
        onclick: function () { openProfile(person.id); },
        onkeydown: function (e) { if (e.key === 'Enter') openProfile(person.id); }
      }, [
        person.name,
        el('div.person-meta', [
          W.categoryTag(person.category),
          hasInfo ? el('span.muted', { title: 'پرونده دارد' }, hasDoc ? 'سند ↗' : 'پرونده') : null
        ])
      ]),
      el('div.muted', person.context || '—'),
      el('div.cell-num' + (soon ? '.cell-accent' : ''), {
        title: person.birthday ? J.format(person.birthday, true) : ''
      }, person.birthday ? J.format(person.birthday) : '—'),
      el('div', { style: { display: 'flex', 'justify-content': 'flex-end' } }, [
        W.rowActions(
          function () { App.crud.edit('people', person.id); },
          function () { App.crud.destroy('people', person.id); }
        )
      ])
    ]);
  }

  // ---- profile -----------------------------------------------------------

  function openProfile(id) {
    var p = db.get('people', id);
    if (!p) { App.toast.error('این شخص دیگر وجود ندارد'); return; }

    var details = (p.details || []).filter(function (d) { return d.label || d.value; });
    var doc = util.safeUrl(p.docUrl);

    var body = el('div.profile', [
      el('div.profile__grid', [
        info('دسته', p.category),
        info('نقش / زمینه', p.context),
        info('تلفن', p.phone, 'tel:' + String(p.phone || '').replace(/[^\d+]/g, ''), true),
        info('ایمیل', p.email, 'mailto:' + (p.email || ''), true),
        info('تولد', p.birthday ? J.format(p.birthday, true) : '')
      ]),

      details.length ? el('div.profile__block', [
        el('div.profile__label', 'جزئیات'),
        el('div.profile__details', details.map(function (d) {
          var link = util.safeUrl(d.value);
          return el('div.profile__detail', [
            el('span.muted', d.label || '—'),
            link ? W.externalLink(link, 'باز کردن') : el('span', d.value)
          ]);
        }))
      ]) : null,

      util.trim(p.notes) ? el('div.profile__block', [
        el('div.profile__label', 'یادداشت'),
        el('div.profile__notes', p.notes)
      ]) : null,

      el('div.profile__block', [
        el('div.profile__label', 'سند Google Docs'),
        doc
          ? el('a.btn-ghost.profile__doc', {
              href: doc, target: '_blank', rel: 'noopener noreferrer', title: doc
            }, 'باز کردن سند ↗')
          : el('div.hint', 'لینکی ثبت نشده. از «ویرایش» اضافه‌اش کن.')
      ])
    ]);

    var handle = App.modal.open({
      title: p.name,
      sub: 'ثبت‌شده ' + J.format(p.createdAt ? p.createdAt.slice(0, 10) : null, true),
      body: body,
      footer: [
        el('button.btn', {
          type: 'button',
          onclick: function () { handle.close(); App.crud.edit('people', id); }
        }, 'ویرایش'),
        el('button.btn-ghost', { type: 'button', onclick: function () { handle.close(); } }, 'بستن'),
        el('div.spacer'),
        el('button.btn-ghost.btn-ghost--danger', {
          type: 'button',
          onclick: function () { handle.close(); App.crud.destroy('people', id); }
        }, 'حذف')
      ]
    });
  }

  function info(label, value, href, ltr) {
    if (!util.trim(value)) return null;
    return el('div.profile__item', [
      el('div.profile__label', label),
      href
        ? el('a', { href: href, dir: ltr ? 'ltr' : null }, value)
        : el('div', value)
    ]);
  }

  App.pages = App.pages || {};
  App.pages.people = { id: 'people', label: 'افراد', group: 'زندگی', render: render, openProfile: openProfile };
})(window.App = window.App || {});
