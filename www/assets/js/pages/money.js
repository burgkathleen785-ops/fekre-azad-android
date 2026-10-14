/*
 * پول — accounts, income and spending, recurring items, net worth.
 *
 * A bill or a salary is a `recurrings` template. Nothing is written from a
 * template until it is approved, so the top of this page is the approval
 * list: one row per month a template still owes a transaction for.
 */
(function (App) {
  'use strict';

  var el = App.el;
  var util = App.util;
  var db = App.db;
  var J = App.jalali;
  var stats = App.stats;
  var W = App.widgets;
  var R = App.recurring;

  function render() {
    var money = stats.moneySummary();
    var unit = db.settings().unit;

    return el('div', [
      el('div.eyebrow', 'ACCOUNTS / INCOME / SUBSCRIPTIONS / NET WORTH'),
      el('h1.page-title', 'پول'),

      el('div.stat-grid.autogrid--stats', [
        stat('موجودی کل', money.totalBalance),
        stat('درآمد ' + money.monthLabel, money.income, 'is-pos'),
        stat('خرج ' + money.monthLabel, money.spend, 'is-neg'),
        stat('ارزش خالص', money.netWorth)
      ]),
      el('div.hint', { style: { margin: '10px 0 30px' } }, 'همه‌ی اعداد ' + unit),

      pendingCard(),
      chartCard(),
      assetMix(),

      el('div.cols.cols--wide', [
        el('div.col', [
          accountsList(),
          recurringList()
        ]),
        el('div.col.col--narrow', [
          categoryBreakdown(money),
          el('div.card.card--pad.card--soft.mt-24', [
            el('div.eyebrow.eyebrow--accent', { style: { 'margin-bottom': '8px' } },
              'مرور ماهانه · ۵ دقیقه'),
            el('div', { style: { 'font-size': '12.5px', 'line-height': '1.9', color: 'var(--ink-2)' } },
              'آخر هر ماه سه خط بنویس: چه چیزی بیشتر از حد خرج شد، چه درآمدی رسید، ماه بعد چه چیزی را قطع می‌کنم.'),
            W.addButton('نوشتن مرور این ماه', function () {
              App.crud.create('notes', {
                title: 'مرور مالی ' + money.monthLabel,
                stage: 'پرورش‌یافته',
                content: 'بیشتر از حد خرج شد:\n\nدرآمد رسید:\n\nماه بعد قطع می‌کنم:\n'
              });
            }, true)
          ])
        ])
      ]),

      transactionsList(money)
    ]);
  }

  function stat(label, value, tone) {
    return el('div.stat', [
      el('div.stat__label', label),
      el('div.stat__value' + (tone ? '.' + tone : ''), util.faNum(value))
    ]);
  }

  // ---- six-month chart -------------------------------------------------

  function chartCard() {
    var series = stats.monthlySeries(6);
    var cols = 'repeat(' + series.rows.length + ', 1fr)';

    return el('div.card.mb-30', { style: { padding: '18px 20px 14px' } }, [
      el('div', {
        style: {
          display: 'flex', 'flex-wrap': 'wrap', gap: '16px',
          'align-items': 'baseline', 'justify-content': 'space-between',
          'margin-bottom': '22px'
        }
      }, [
        el('div', { style: { 'font-size': '14px', 'font-weight': '600' } }, 'درآمد و خرج، شش ماه'),
        el('div.chart__legend', [
          legend('var(--accent)', 'درآمد'),
          legend('var(--tint-bar)', 'خرج')
        ])
      ]),

      series.max === 0
        ? W.emptyState('هنوز تراکنشی ثبت نشده.', 'اولین تراکنش', function () {
            App.crud.create('transactions');
          })
        : el('div', [
            el('div.chart', [
              el('div.chart__grid', { style: { top: '0' } }),
              el('div.chart__grid', { style: { top: '50%' } }),
              el('div.chart__bars', { style: { 'grid-template-columns': cols } },
                series.rows.map(function (r) {
                  return el('div.chart__col', {
                    title: r.label + ' — درآمد ' + util.faNum(r.income) + ' / خرج ' + util.faNum(r.spend)
                  }, [
                    el('div.chart__bar', { style: { height: r.incomePct + '%' } }),
                    el('div.chart__bar.chart__bar--out', { style: { height: r.spendPct + '%' } })
                  ]);
                }))
            ]),
            el('div.chart__labels', { style: { 'grid-template-columns': cols } },
              series.rows.map(function (r) { return el('div', r.label); }))
          ])
    ]);
  }

  function legend(colour, label) {
    return el('span.legend-item', [
      el('span.swatch', { style: { background: colour } }),
      label
    ]);
  }

  // ---- asset composition -----------------------------------------------

  function assetMix() {
    var rows = stats.assetMix();
    if (!rows.length) return null;

    return el('div.mb-34', [
      W.sectionHead('ترکیب دارایی', null),
      el('div.mix', rows.map(function (r) {
        return el('div.mix__seg', {
          style: { width: r.pct + '%', background: r.color },
          title: r.type + ' · ' + util.faNum(r.amount)
        });
      })),
      el('div.mix__legend', rows.map(function (r) {
        return el('span.legend-item', [
          el('span.swatch', { style: { background: r.color } }),
          r.type + ' · ' + util.faPct(r.pct)
        ]);
      }))
    ]);
  }

  // ---- accounts / subscriptions ----------------------------------------

  function accountsList() {
    var accounts = db.list('accounts');
    return el('div', [
      W.sectionHead('حساب‌ها', null, { flush: true }),
      accounts.length
        ? accounts.map(function (a) {
            return el('div.money-row.row', [
              el('span.money-row__label', {
                style: { cursor: 'pointer' },
                onclick: function () { App.crud.edit('accounts', a.id); }
              }, a.name),
              W.rowActions(null, function () {
                App.crud.destroy('accounts', a.id, 'تراکنش‌های این حساب پاک نمی‌شوند.');
              }),
              el('span.money-row__amount', util.faNum(a.balance))
            ]);
          })
        : W.emptyState('هنوز حسابی ثبت نکرده‌ای.', null, null, true),
      W.addButton('حساب جدید', function () { App.crud.create('accounts'); })
    ]);
  }

  /**
   * The templates themselves: bills and fixed income, biggest first. Editing
   * one changes what is proposed from next month on; the transactions already
   * approved from it stay exactly as they are.
   */
  function recurringList() {
    var summary = R.summary();
    var rows = summary.rows.slice().sort(function (a, b) {
      return (Number(b.amount) || 0) - (Number(a.amount) || 0);
    });
    var inactive = db.list('recurrings', function (r) { return r.active === false; });

    return el('div', [
      W.sectionHead('موارد تکرارشونده‌ی ماهانه',
        el('span.section-head__count', util.toFa(rows.length)),
        { margin: '32px 0 2px', flush: true }),
      rows.length
        ? rows.map(templateRow).concat([
            el('div.money-sum', [
              el('span', 'SUM'),
              el('span', util.faNum(summary.spend) + ' خرج' +
                (summary.income ? ' · ' + util.faNum(summary.income) + ' درآمد' : '') + ' / ماه')
            ])
          ])
        : W.emptyState('هنوز قبض یا درآمد ثابتی ثبت نکرده‌ای. هر چیزی که هر ماه تکرار می‌شود را ' +
            'یک بار اینجا بنویس؛ بعد هر ماه با یک دکمه ثبتش می‌کنی.', null, null, true),
      inactive.length
        ? el('div.hint.mt-12', util.toFa(inactive.length) + ' مورد غیرفعال هم داری؛ ' +
            'برای هیچ‌کدامشان تراکنشی پیشنهاد نمی‌شود.')
        : null,
      W.addButton('مورد تکرارشونده‌ی جدید', function () {
        App.crud.create('recurrings', { category: W.activeCategory('transactions') });
      })
    ]);
  }

  function templateRow(tpl) {
    var income = tpl.direction === 'درآمد';
    var waiting = R.pendingFor(tpl).length;

    return el('div.money-row.money-row--sub.row', [
      el('span.money-row__label', {
        style: { cursor: 'pointer' },
        onclick: function () { App.crud.edit('recurrings', tpl.id); }
      }, [
        tpl.title,
        el('span.muted', { style: { 'font-size': '11.5px' } },
          ' · روز ' + util.toFa(tpl.dayOfMonth || 1)),
        tpl.category ? el('span.muted', { style: { 'font-size': '11.5px' } }, ' · ' + tpl.category) : null,
        waiting ? el('span.chip.chip--warn', { style: { 'margin-right': '6px' } },
          util.toFa(waiting) + ' ماه در انتظار') : null
      ]),
      W.rowActions(null, function () {
        App.crud.destroy('recurrings', tpl.id,
          'تراکنش‌هایی که تا حالا از این مورد ثبت شده‌اند پاک نمی‌شوند.');
      }),
      el('span.money-row__amount' + (income ? '' : '.muted'), {
        style: income ? { color: 'var(--pos)' } : null
      }, util.faNum(tpl.amount))
    ]);
  }

  // ---- waiting for approval --------------------------------------------

  function pendingCard() {
    var rows = R.pending();
    if (!rows.length) return null;
    var totals = R.pendingTotals(rows);

    return el('div.card.card--pad.pending.mb-30', [
      el('div.pending__head', [
        el('div', [
          el('div.pending__title', util.toFa(rows.length) + ' تراکنش تکرارشونده در انتظار تأیید'),
          el('div.pending__sub', 'تا تأیید نکنی در هیچ محاسبه‌ای نمی‌آیند.' +
            (totals.spend ? ' مجموع خرج: ' + util.faNum(totals.spend) : '') +
            (totals.income ? ' · مجموع درآمد: ' + util.faNum(totals.income) : ''))
        ]),
        el('button.btn', {
          type: 'button',
          onclick: function () {
            var added = R.approveAll(rows);
            App.toast.show(util.toFa(added) + ' تراکنش ثبت شد');
          }
        }, 'همه را ثبت کن')
      ]),

      el('div.pending__rows', rows.map(pendingRow))
    ]);
  }

  function pendingRow(e) {
    var income = e.direction === 'درآمد';
    return el('div.pending__row', [
      el('span.cell-num.pending__month', J.monthTitle(e.monthKey)),
      el('span.pending__label', [
        e.title,
        e.category ? el('span.muted', { style: { 'font-size': '11.5px' } }, ' · ' + e.category) : null
      ]),
      el('span.pending__amount', { style: { color: income ? 'var(--pos)' : 'var(--neg)' } },
        (income ? '+' : '−') + util.faNum(e.amount)),
      el('span.cell-num.muted.pending__date', J.format(e.date)),
      el('div.pending__actions', [
        el('button.icon-btn', {
          type: 'button', title: 'ثبت این ماه',
          onclick: function () {
            if (R.approve(e)) App.toast.show('ثبت شد');
          }
        }, 'ثبت'),
        el('button.icon-btn', {
          type: 'button', title: 'این ماه ثبت نشود',
          onclick: function () {
            R.skip(e);
            App.toast.show('این ماه رد شد');
          }
        }, 'رد')
      ])
    ]);
  }

  // ---- category breakdown ----------------------------------------------

  function categoryBreakdown(money) {
    var rows = stats.categorySpend(money.monthKey);
    return el('div', [
      W.sectionHead('خرج به تفکیک دسته — ' + money.monthLabel, null, { margin: '0 0 18px' }),
      rows.length
        ? el('div.stack.stack--lg', rows.map(function (r) {
            return el('div', [
              el('div.catbar__head', [
                el('span', r.category),
                el('span.num.muted', util.faNum(r.amount))
              ]),
              el('div.bar.bar--mid', [
                el('div.bar__fill', { style: { width: r.pct + '%' } })
              ])
            ]);
          }))
        : W.emptyState('این ماه هنوز خرجی ثبت نشده.', null, null, true)
    ]);
  }

  // ---- transactions ----------------------------------------------------

  function transactionsList(money) {
    var monthRows = db.list('transactions', function (t) {
      return J.monthKey(t.date) === money.monthKey;
    }).sort(util.byKey('date', 'desc'));
    var rows = W.byCategory('transactions', monthRows);

    return el('div.mt-38', [
      W.sectionHead('تراکنش‌های ' + money.monthLabel,
        el('div', { style: { display: 'flex', gap: '12px', 'align-items': 'baseline' } }, [
          el('span.section-head__count', util.toFa(rows.length)),
          el('button.icon-btn', {
            type: 'button', title: 'همه‌ی تراکنش‌ها و حساب‌ها در یک فایل Excel',
            onclick: function () { App.exporter.excel(['transactions', 'accounts'], 'money'); }
          }, 'خروجی Excel')
        ]), { flush: true }),
      W.categoryBar('transactions', monthRows, { margin: '10px 0 4px' }),
      rows.length
        ? rows.map(function (t) {
            var income = t.direction === 'درآمد';
            return el('div.money-row.row', [
              el('span.cell-num', { style: { flex: '0 0 auto', width: '64px' } },
                J.format(t.date)),
              el('span.money-row__label', {
                style: { cursor: 'pointer' },
                onclick: function () { App.crud.edit('transactions', t.id); }
              }, [
                t.title,
                t.category ? el('span.muted', { style: { 'font-size': '11.5px' } }, ' · ' + t.category) : null,
                t.srcId ? el('span.chip.chip--mute', { style: { 'margin-right': '6px' } }, 'تکرارشونده') : null
              ]),
              W.rowActions(null, function () { App.crud.destroy('transactions', t.id); }),
              el('span.money-row__amount', {
                style: { color: income ? 'var(--pos)' : 'var(--neg)' }
              }, (income ? '+' : '−') + util.faNum(t.amount))
            ]);
          })
        : W.emptyState(monthRows.length ? 'در این دسته تراکنشی نیست.' : 'این ماه تراکنشی ثبت نشده.', null, null, true),
      W.addButton('تراکنش جدید', function () {
        App.crud.create('transactions', { category: W.activeCategory('transactions') });
      })
    ]);
  }

  App.pages = App.pages || {};
  App.pages.money = { id: 'money', label: 'پول', render: render };
})(window.App = window.App || {});
