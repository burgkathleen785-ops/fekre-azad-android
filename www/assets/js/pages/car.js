/*
 * ماشین — the logbook: what was replaced, at what mileage, and what is next.
 *
 * Everything on this page hangs off one number: the car's current odometer
 * reading. A service says "replaced at 142,000, do it again at 152,000", so
 * whether it is due is a subtraction, not a date. That is the whole idea —
 * a car does not wear out by the calendar.
 *
 * The odometer is therefore the one thing that has to be easy to update, and
 * it gets its own control at the top rather than being buried in the vehicle
 * form. Insurance is the exception: that really is a calendar matter, so it
 * is tracked by date and warned about a month ahead.
 */
(function (App) {
  'use strict';

  var el = App.el;
  var util = App.util;
  var db = App.db;
  var J = App.jalali;
  var W = App.widgets;

  // Which car is on screen; kept across re-renders.
  var currentId = '';

  function vehicles() {
    return db.list('vehicles').sort(util.byKey('name'));
  }

  function current() {
    var all = vehicles();
    if (!all.length) return null;
    var found = all.filter(function (v) { return v.id === currentId; })[0];
    if (!found) {
      found = all[0];
      currentId = found.id;
    }
    return found;
  }

  // ======================================================================
  // page
  // ======================================================================

  function render() {
    var car = current();

    return el('div', [
      el('div.eyebrow', 'ODOMETER / SERVICE HISTORY / INSURANCE'),
      el('h1.page-title.page-title--tight', 'ماشین'),

      car ? null : el('p.page-lede',
        'دفترچه‌ی ماشین: هر قطعه‌ای که عوض می‌کنی با کیلومترش ثبت می‌شود و کیلومتر تعویض بعدی را ' +
        'هم می‌نویسی. بعد هر وقت کیلومتر ماشین را به‌روز کنی، خودش می‌گوید چه چیزی نزدیک است و ' +
        'چه چیزی عقب افتاده.'),

      vehiclePicker(),

      car ? el('div', [
        odometerCard(car),
        alertsCard(car),
        el('div.cols.cols--wide.mt-30', [
          el('div.col', [serviceList(car)]),
          el('div.col.col--narrow', [insuranceList(car)])
        ])
      ]) : W.emptyState('هنوز ماشینی ثبت نکرده‌ای.', 'ثبت ماشین', function () {
        App.crud.create('vehicles');
      })
    ]);
  }

  function vehiclePicker() {
    var all = vehicles();
    if (all.length < 2) {
      return all.length ? el('div.car-picker', [
        el('span.car-picker__name', all[0].name),
        all[0].plate ? el('span.chip.chip--mute', { dir: 'ltr' }, all[0].plate) : null,
        el('button.icon-btn', {
          type: 'button', onclick: function () { App.crud.edit('vehicles', all[0].id); }
        }, 'ویرایش'),
        el('button.icon-btn', {
          type: 'button', onclick: function () { App.crud.create('vehicles'); }
        }, 'ماشین دیگر')
      ]) : null;
    }

    return el('div.car-picker', [
      el('div.cat-bar__chips', all.map(function (v) {
        var on = v.id === currentId;
        return el('button.cat-chip' + (on ? '.is-active' : ''), {
          type: 'button',
          onclick: function () { currentId = v.id; App.view.refresh(); }
        }, v.name);
      })),
      el('button.icon-btn', {
        type: 'button', onclick: function () { App.crud.edit('vehicles', currentId); }
      }, 'ویرایش'),
      el('button.icon-btn', {
        type: 'button', onclick: function () { App.crud.create('vehicles'); }
      }, 'ماشین تازه')
    ]);
  }

  // ---- the odometer ----------------------------------------------------

  function odometerCard(car) {
    var input = el('input.input.input--mono', {
      type: 'text', dir: 'ltr', inputmode: 'numeric',
      style: { width: '160px' },
      'data-focus-key': 'odometer',
      onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); save(); } }
    });
    input.value = util.toFa(Number(car.odometer) || 0);

    function save() {
      var n = util.parseNum(input.value);
      if (n === null || isNaN(n) || n < 0) {
        App.toast.error('کیلومتر را با عدد بنویس');
        input.value = util.toFa(Number(car.odometer) || 0);
        return;
      }
      if (n === Number(car.odometer)) return;
      if (n < Number(car.odometer)) {
        App.modal.confirm({
          title: 'کیلومتر کمتر از قبل؟',
          message: 'عدد فعلی ' + util.faNum(car.odometer) + ' است و تو ' + util.faNum(n) +
            ' نوشتی. کیلومترشمار معمولاً برنمی‌گردد — مطمئنی؟',
          confirmLabel: 'بله، ثبت کن',
          danger: false
        }).then(function (yes) {
          if (yes) commit(n);
          else input.value = util.toFa(Number(car.odometer) || 0);
        });
        return;
      }
      commit(n);
    }

    function commit(n) {
      db.update('vehicles', car.id, { odometer: n });
      App.toast.show('کیلومتر ثبت شد');
    }

    return el('div.card.card--pad.odo', [
      el('div.odo__body', [
        el('div.odo__label', 'کیلومتر فعلی'),
        el('div.odo__hint', 'همه‌ی یادآوری‌های سرویس با همین عدد سنجیده می‌شوند.')
      ]),
      el('div.odo__control', [
        input,
        el('button.btn', { type: 'button', onclick: save }, 'ثبت')
      ])
    ]);
  }

  // ---- what is due -----------------------------------------------------

  function alertsCard(car) {
    var a = App.stats.carAlerts(car.id);
    if (!a.overdue.length && !a.soon.length && !a.insurance.length) return null;

    return el('div.card.card--pad.pending.mt-24', [
      el('div.pending__title', 'رسیدگی لازم دارد'),
      el('div.pending__rows', [].concat(
        a.overdue.map(function (r) { return alertRow(r, true); }),
        a.soon.map(function (r) { return alertRow(r, false); }),
        a.insurance.map(insuranceAlertRow)
      ))
    ]);
  }

  function alertRow(r, overdue) {
    return el('div.pending__row', [
      el('span.pending__label', [
        r.service.part,
        r.service.brand ? el('span.muted', { style: { 'font-size': '11.5px' } },
          ' · ' + r.service.brand) : null
      ]),
      el('span.chip' + (overdue ? '.chip--warn' : '.chip--mute'),
        overdue
          ? util.faNum(-r.remaining) + ' کیلومتر گذشته'
          : util.faNum(r.remaining) + ' کیلومتر مانده'),
      el('span.cell-num.muted.pending__date', util.faNum(r.service.nextKm)),
      el('div.pending__actions', [
        el('button.icon-btn', {
          type: 'button', title: 'ثبت تعویض تازه با همین عنوان',
          onclick: function () { repeat(r.service); }
        }, 'تعویض شد')
      ])
    ]);
  }

  function insuranceAlertRow(r) {
    var gone = r.days < 0;
    return el('div.pending__row', [
      el('span.pending__label', [
        'بیمه‌ی ' + (r.policy.kind || ''),
        el('span.muted', { style: { 'font-size': '11.5px' } }, ' · ' + (r.policy.company || ''))
      ]),
      el('span.chip' + (gone ? '.chip--warn' : '.chip--mute'),
        gone ? 'منقضی شده' : util.toFa(r.days) + ' روز مانده'),
      el('span.cell-num.muted.pending__date', J.format(r.policy.to)),
      el('div.pending__actions', [
        el('button.icon-btn', {
          type: 'button', onclick: function () { App.crud.edit('insurances', r.policy.id); }
        }, 'تمدید')
      ])
    ]);
  }

  /**
   * "Replaced again": open a new service pre-filled from the old one, at the
   * current odometer, keeping the same interval as last time.
   */
  function repeat(service) {
    var car = current();
    var km = Number(car.odometer) || 0;
    var interval = (Number(service.nextKm) || 0) - (Number(service.km) || 0);
    App.crud.create('services', {
      part: service.part,
      vehicleId: service.vehicleId,
      category: service.category,
      brand: service.brand,
      place: service.place,
      km: km,
      nextKm: interval > 0 ? km + interval : null,
      date: J.todayIso()
    });
  }

  // ---- service history -------------------------------------------------

  function serviceList(car) {
    var all = db.list('services', function (s) { return s.vehicleId === car.id; });
    var rows = W.byCategory('services', all).sort(function (a, b) {
      return (Number(b.km) || 0) - (Number(a.km) || 0);
    });
    var spent = all.reduce(function (sum, s) { return sum + (Number(s.cost) || 0); }, 0);

    return el('div', [
      W.sectionHead('تاریخچه‌ی سرویس', el('span.section-head__count', util.toFa(all.length)),
        { flush: true }),
      W.categoryBar('services', all, { margin: '10px 0 4px' }),
      rows.length
        ? el('div.stack.stack--sm', rows.map(function (s) { return serviceRow(s, car); }))
        : W.emptyState(all.length ? 'در این دسته چیزی نیست.' : 'هنوز سرویسی ثبت نشده.', null, null, true),
      spent ? el('div.money-sum', [
        el('span', 'SUM'),
        el('span', util.faNum(spent) + ' ' + db.settings().unit)
      ]) : null,
      W.addButton('سرویس یا تعویض تازه', function () {
        App.crud.create('services', {
          vehicleId: car.id,
          km: Number(car.odometer) || 0,
          category: W.activeCategory('services')
        });
      })
    ]);
  }

  function serviceRow(s, car) {
    var km = Number(car.odometer) || 0;
    var next = Number(s.nextKm) || 0;
    var remaining = next ? next - km : null;

    return el('div.service.row', {
      role: 'button', tabindex: '0',
      onclick: function (e) {
        if (e.target.closest('.row-actions')) return;
        App.crud.edit('services', s.id);
      },
      onkeydown: function (e) { if (e.key === 'Enter') App.crud.edit('services', s.id); }
    }, [
      el('div.service__head', [
        el('span.service__part', s.part),
        el('span.cell-num.service__km', util.faNum(s.km) + ' کیلومتر')
      ]),
      el('div.service__meta', [
        W.categoryTag(s.category),
        s.brand ? el('span', s.brand) : null,
        s.date ? el('span.num', J.format(s.date, true)) : null,
        s.cost ? el('span.num', util.faNum(s.cost)) : null,
        s.place ? el('span', s.place) : null
      ]),
      next ? el('div.service__next' + (remaining <= 0 ? '.is-due' : ''),
        remaining <= 0
          ? 'تعویض بعدی در ' + util.faNum(next) + ' بود — ' + util.faNum(-remaining) + ' کیلومتر گذشته'
          : 'تعویض بعدی در ' + util.faNum(next) + ' — ' + util.faNum(remaining) + ' کیلومتر مانده') : null,
      s.notes ? el('div.service__notes', s.notes) : null,
      W.rowActions(null, function () { App.crud.destroy('services', s.id); })
    ]);
  }

  // ---- insurance -------------------------------------------------------

  function insuranceList(car) {
    var rows = db.list('insurances', function (i) { return i.vehicleId === car.id; })
      .sort(function (a, b) { return String(b.to || '').localeCompare(String(a.to || '')); });

    return el('div', [
      W.sectionHead('بیمه‌نامه‌ها', el('span.section-head__count', util.toFa(rows.length)),
        { flush: true }),
      rows.length
        ? el('div.stack.stack--sm.mt-12', rows.map(policyCard))
        : W.emptyState('بیمه‌نامه‌ای ثبت نشده.', null, null, true),
      W.addButton('بیمه‌نامه‌ی تازه', function () {
        App.crud.create('insurances', { vehicleId: car.id });
      })
    ]);
  }

  function policyCard(p) {
    var days = p.to ? J.diffDays(J.todayIso(), p.to) : null;
    var state = days == null ? null
      : days < 0 ? { cls: '.chip--warn', text: 'منقضی شده' }
      : days <= 30 ? { cls: '.chip--warn', text: util.toFa(days) + ' روز مانده' }
      : { cls: '.chip--mute', text: util.toFa(days) + ' روز مانده' };

    return el('div.policy.row', {
      role: 'button', tabindex: '0',
      onclick: function (e) {
        if (e.target.closest('.row-actions')) return;
        App.crud.edit('insurances', p.id);
      },
      onkeydown: function (e) { if (e.key === 'Enter') App.crud.edit('insurances', p.id); }
    }, [
      el('div.policy__head', [
        el('span.policy__kind', p.kind || 'بیمه'),
        state ? el('span.chip' + state.cls, state.text) : null
      ]),
      el('div.policy__company', p.company),
      // Both dates carry their year: a policy almost always spans a new year,
      // and "۲۷ مهر تا ۲۷ مهر" reads like a one-day policy.
      el('div.policy__dates', [
        el('span.num', J.format(p.from, true)),
        el('span', ' تا '),
        el('span.num', J.format(p.to, true))
      ]),
      p.policyNo ? el('div.policy__no', { dir: 'ltr' }, p.policyNo) : null,
      p.agent ? el('div.policy__agent', p.agent) : null,
      p.amount ? el('div.policy__amount.num', util.faNum(p.amount) + ' ' + db.settings().unit) : null,
      W.rowActions(null, function () { App.crud.destroy('insurances', p.id); })
    ]);
  }

  App.pages = App.pages || {};
  App.pages.car = { id: 'car', label: 'ماشین', group: 'زندگی', render: render };
})(window.App = window.App || {});
