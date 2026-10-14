/* خانه — today's tasks, this month's money, reminders, live projects. */
(function (App) {
  'use strict';

  var el = App.el;
  var util = App.util;
  var db = App.db;
  var J = App.jalali;
  var stats = App.stats;
  var W = App.widgets;

  // Kept across re-renders so an in-progress capture is never lost.
  var draft = '';

  function render() {
    var today = J.todayIso();
    var money = stats.moneySummary();
    var todayTasks = stats.tasksOn(today).sort(function (a, b) {
      return (a.done === b.done) ? 0 : (a.done ? 1 : -1);
    });
    var overdue = stats.dueTasks(J.addDays(today, -1));

    return el('div', [
      el('div.eyebrow', J.formatLong(today)),
      el('h1.page-title', 'خانه'),

      capture(),
      el('div.mt-8.hint',
        'هر ورودی به یادداشت‌های «گذرا» می‌رود. هفته‌ای یک بار سراغش می‌روی و هر چیز را به کار، ' +
        'یادداشت یا پروژه تبدیل می‌کنی. اگر فقط این یک عادت را نگه داری، سیستم زنده می‌ماند.'),

      pendingNotice(),
      carNotice(),

      el('div.cols.mt-36', [
        el('div.col', [
          W.sectionHead('کارهای امروز', util.toFa(todayTasks.length), { flush: true }),
          todayTasks.length
            ? todayTasks.map(function (t) { return W.taskRow(t); })
            : W.emptyState('برای امروز کاری ثبت نشده.', null, null, true),
          overdue.length
            ? el('div.mt-12', [
                W.sectionHead('عقب‌افتاده', util.toFa(overdue.length), { flush: true }),
                overdue.map(function (t) { return W.taskRow(t, { showDate: true }); })
              ])
            : null,
          W.addButton('کار جدید', function () {
            App.crud.create('tasks', { date: today });
          })
        ]),

        el('div.col.col--narrow', [
          db.moduleOn('money') ? el('div', [
          W.sectionHead('پول این ماه', null),
          moneyCard(money),
          el('div.bar.mt-12', [
            el('div.bar__fill', {
              style: {
                width: util.clamp(money.budgetPct, 0, 100) + '%',
                background: money.overBudget ? 'var(--neg)' : 'var(--accent)'
              }
            })
          ]),
          el('div.bar-legend', [
            el('span', money.budget > 0 ? util.faPct(money.budgetPct) + ' بودجه' : 'بودجه تعیین نشده'),
            el('span', util.toFa(money.daysLeft) + ' روز مانده')
          ])
          ]) : null,

          W.sectionHead('یادآوری', null,
            { margin: db.moduleOn('money') ? '30px 0 14px' : '0 0 14px' }),
          remindersBlock()
        ])
      ]),

      el('div.mt-38', [
        W.sectionHead('پروژه‌های در جریان',
          el('button.btn-add.btn-add--inline', {
            type: 'button',
            onclick: function () { App.crud.create('projects'); }
          }, '+ پروژه')),
        projectGrid()
      ])
    ]);
  }

  function capture() {
    var input = el('textarea.capture__input', {
      rows: 1,
      placeholder: 'هر چیزی که در ذهنت است اینجا بنویس…',
      'data-focus-key': 'capture',
      oninput: function () {
        draft = input.value;
        autoGrow(input);
      },
      onkeydown: function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          submit();
        }
      }
    });
    input.value = draft;

    function submit() {
      var text = util.trim(input.value);
      if (!text) {
        App.toast.error('چیزی ننوشتی');
        input.focus();
        return;
      }
      // Clear the draft first: insert() notifies synchronously, and the
      // re-render reads `draft` to repopulate the box.
      draft = '';
      input.value = '';
      db.insert('notes', {
        title: '', content: text, stage: 'گذرا', link: '', source: ''
      });
      App.toast.show('در صندوق ورودی ثبت شد');
    }

    var node = el('div.capture', [
      el('div.capture__body', [
        el('div.capture__label', 'QUICK CAPTURE'),
        input
      ]),
      el('button.btn', { type: 'button', onclick: submit }, 'ثبت')
    ]);

    window.setTimeout(function () { autoGrow(input); }, 0);
    return node;
  }

  function autoGrow(input) {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  }

  function moneyCard(money) {
    return el('div.stat-grid.autogrid--money', [
      el('div.stat.stat--sm', [
        el('div.stat__label', 'موجودی کل'),
        el('div.stat__value.stat__value--sm', util.faNum(money.totalBalance)),
        el('div.stat__note', db.settings().unit)
      ]),
      el('div.stat.stat--sm', [
        el('div.stat__label', 'خرج ' + money.monthLabel),
        el('div.stat__value.stat__value--sm' + (money.spend > 0 ? '.is-neg' : ''),
          util.faNum(money.spend)),
        el('div.stat__note', money.budget > 0
          ? 'از سقف ' + util.faNum(money.budget)
          : 'بدون سقف')
      ])
    ]);
  }

  /**
   * A one-line nudge when recurring bills are waiting. It is deliberately not
   * an approve button: approving belongs on the money page, next to the
   * amounts and the month each one belongs to.
   */
  function pendingNotice() {
    var totals = App.recurring.pendingTotals();
    if (!totals.count) return null;

    return el('div.notice.mt-20', [
      el('span.notice__body', [
        el('strong', util.toFa(totals.count) + ' تراکنش تکرارشونده'),
        ' در انتظار تأیید است' +
          (totals.spend ? ' — ' + util.faNum(totals.spend) + ' ' + db.settings().unit + ' خرج' : '') +
          '. تا تأییدشان نکنی در هیچ محاسبه‌ای نمی‌آیند.'
      ]),
      el('button.btn-ghost', {
        type: 'button', onclick: function () { App.view.go('money'); }
      }, 'دیدن در «پول»')
    ]);
  }

  /**
   * The car line. Kept separate from the reminder box on purpose: everything
   * in that box is counted in days, and a service is counted in kilometres.
   * Mixing the two units in one sorted list reads badly.
   */
  function carNotice() {
    if (!db.moduleOn('car')) return null;
    var a = App.stats.carAlerts();
    if (!a.overdue.length && !a.soon.length) return null;

    var first = a.overdue[0] || a.soon[0];
    var rest = a.overdue.length + a.soon.length - 1;

    return el('div.notice.notice--car.mt-20', [
      el('span.notice__body', [
        el('strong', first.service.part),
        a.overdue.length
          ? ' — ' + util.faNum(-first.remaining) + ' کیلومتر از تعویضش گذشته'
          : ' — ' + util.faNum(first.remaining) + ' کیلومتر تا تعویض مانده',
        rest > 0 ? ' و ' + util.toFa(rest) + ' مورد دیگر.' : '.',
        first.vehicle ? el('span.muted', ' (' + first.vehicle.name + ')') : null
      ]),
      el('button.btn-ghost', {
        type: 'button', onclick: function () { App.view.go('car'); }
      }, 'دیدن دفترچه‌ی ماشین')
    ]);
  }

  function remindersBlock() {
    var rows = stats.reminders(4);
    if (!rows.length) {
      return W.emptyState('یادآوری نزدیکی نیست.', null, null, true);
    }
    return el('div.reminders', rows.map(function (r) {
      var j = J.isoToJ(r.iso);
      var day = j ? util.toFa(j.jd < 10 ? '0' + j.jd : j.jd) : '—';
      return el('div.reminder', { title: J.format(r.iso, true) }, [
        el('span.reminder__day', day),
        el('span', r.text)
      ]);
    }));
  }

  function projectGrid() {
    var projects = stats.activeProjects();
    if (!projects.length) {
      return W.emptyState('پروژه‌ی فعالی نداری.', 'اولین پروژه را بساز', function () {
        App.crud.create('projects');
      });
    }
    return el('div.autogrid', projects.map(W.projectCard));
  }

  App.pages = App.pages || {};
  App.pages.home = { id: 'home', label: 'خانه', group: 'میزکار', render: render };
})(window.App = window.App || {});
