/*
 * Derived numbers.
 *
 * Nothing in the pages computes a statistic inline — every count, percentage,
 * bar height and total on the dashboard comes from a function here, so the
 * same figure is never calculated two different ways in two places.
 *
 * The formulas were reverse-engineered from the original mockup, whose sample
 * numbers were internally consistent (e.g. the ۸۲٪ budget bar is exactly
 * ۱۹,۶۵۰ ÷ ۲۴,۰۰۰, and every chart bar is value ÷ max × 94).
 */
(function (App) {
  'use strict';

  var db = App.db;
  var J = App.jalali;
  var util = App.util;

  /** Bars in the money chart top out at 94% of the plot height, as designed. */
  var CHART_CEILING = 94;

  function sum(rows, key) {
    return rows.reduce(function (acc, r) {
      var v = Number(r[key]);
      return acc + (isFinite(v) ? v : 0);
    }, 0);
  }

  // ---- tasks -----------------------------------------------------------

  function tasksOn(iso) {
    return db.list('tasks', function (t) { return t.date === iso; });
  }

  function taskStats() {
    var all = db.list('tasks');
    var done = all.filter(function (t) { return t.done; });
    return {
      total: all.length,
      done: done.length,
      open: all.length - done.length
    };
  }

  /** Open tasks with no date, or a date on/before today — the real backlog. */
  function dueTasks(iso) {
    var today = iso || J.todayIso();
    return db.list('tasks', function (t) {
      return !t.done && t.date && t.date <= today;
    }).sort(util.byKey('date'));
  }

  /** Open tasks grouped by project, for the goals page. `filter` narrows the tasks. */
  function openTasksByProject(filter) {
    var open = db.list('tasks', function (t) { return !t.done && (!filter || filter(t)); });
    var groups = [];
    var index = {};

    function bucket(id, label, accent) {
      var key = id || '__none__';
      if (!index[key]) {
        index[key] = { id: id, label: label, accent: accent, tasks: [] };
        groups.push(index[key]);
      }
      return index[key];
    }

    db.list('projects')
      .filter(function (p) { return p.status !== 'تمام'; })
      .forEach(function (p) { bucket(p.id, p.name, true); });

    open.forEach(function (t) {
      var p = t.projectId ? db.get('projects', t.projectId) : null;
      bucket(p ? p.id : '', p ? p.name : 'بدون پروژه', !!p).tasks.push(t);
    });

    return groups.filter(function (g) { return g.tasks.length > 0; });
  }

  // ---- projects --------------------------------------------------------

  /** Returns 0-100. Auto mode counts completed tasks; manual is user-entered. */
  function projectProgress(project) {
    if (!project) return 0;
    if (project.progressMode === 'manual') {
      return util.clamp(Number(project.progressManual) || 0, 0, 100);
    }
    if (project.status === 'تمام') return 100;
    var tasks = db.list('tasks', function (t) { return t.projectId === project.id; });
    if (!tasks.length) return 0;
    var done = tasks.filter(function (t) { return t.done; }).length;
    return Math.round(done / tasks.length * 100);
  }

  function activeProjects() {
    return db.list('projects', function (p) {
      return p.status === 'در جریان' || p.status === 'بعدی';
    }).sort(function (a, b) {
      var order = { 'در جریان': 0, 'بعدی': 1 };
      var ra = order[a.status] == null ? 9 : order[a.status];
      var rb = order[b.status] == null ? 9 : order[b.status];
      if (ra !== rb) return ra - rb;
      return util.byKey('deadline')(a, b);
    });
  }

  function projectsForGoal(goalId) {
    return db.list('projects', function (p) { return p.goalId === goalId; });
  }

  function connectedProjectCount(goalId) {
    return projectsForGoal(goalId).filter(function (p) { return p.status !== 'تمام'; }).length;
  }

  // ---- money -----------------------------------------------------------

  function accountsOfMonth(monthKey) {
    return db.list('transactions', function (t) { return J.monthKey(t.date) === monthKey; });
  }

  function moneySummary() {
    var accounts = db.list('accounts');
    var liquid = accounts.filter(function (a) { return a.type !== 'دارایی'; });
    var mk = J.monthKeyOfToday();
    var rows = accountsOfMonth(mk);

    var income = sum(rows.filter(function (t) { return t.direction === 'درآمد'; }), 'amount');
    var spend = sum(rows.filter(function (t) { return t.direction !== 'درآمد'; }), 'amount');
    var budget = Number(db.settings().monthlyBudget) || 0;

    return {
      monthKey: mk,
      monthLabel: J.monthLabel(mk),
      totalBalance: sum(liquid, 'balance'),
      netWorth: sum(accounts, 'balance'),
      income: income,
      spend: spend,
      budget: budget,
      budgetPct: budget > 0 ? (spend / budget) * 100 : 0,
      overBudget: budget > 0 && spend > budget,
      daysLeft: J.daysLeftInJMonth()
    };
  }

  /** Six Jalali months of income vs. spend, oldest first, with bar heights. */
  function monthlySeries(count) {
    var keys = J.lastMonthKeys(count || 6);
    var rows = db.list('transactions');

    var series = keys.map(function (k) {
      var inMonth = rows.filter(function (t) { return J.monthKey(t.date) === k; });
      return {
        key: k,
        label: J.monthLabel(k),
        income: sum(inMonth.filter(function (t) { return t.direction === 'درآمد'; }), 'amount'),
        spend: sum(inMonth.filter(function (t) { return t.direction !== 'درآمد'; }), 'amount')
      };
    });

    var max = series.reduce(function (m, s) { return Math.max(m, s.income, s.spend); }, 0);
    series.forEach(function (s) {
      s.incomePct = max > 0 ? (s.income / max) * CHART_CEILING : 0;
      s.spendPct = max > 0 ? (s.spend / max) * CHART_CEILING : 0;
    });
    return { rows: series, max: max };
  }

  /** Spend per category for one month, largest first, scaled to the largest. */
  function categorySpend(monthKey) {
    var mk = monthKey || J.monthKeyOfToday();
    var totals = {};
    accountsOfMonth(mk)
      .filter(function (t) { return t.direction !== 'درآمد'; })
      .forEach(function (t) {
        var key = util.trim(t.category) || 'متفرقه';
        totals[key] = (totals[key] || 0) + (Number(t.amount) || 0);
      });

    var rows = Object.keys(totals).map(function (k) {
      return { category: k, amount: totals[k] };
    }).sort(function (a, b) { return b.amount - a.amount; });

    var max = rows.length ? rows[0].amount : 0;
    rows.forEach(function (r) { r.pct = max > 0 ? (r.amount / max) * 100 : 0; });
    return rows;
  }

  var MIX_TINTS = ['var(--tint-1)', 'var(--tint-2)', 'var(--tint-3)', 'var(--tint-4)',
    'var(--tint-5)', 'var(--line-soft)'];

  /** Net-worth composition by account type, largest slice first. */
  function assetMix() {
    var totals = {};
    db.list('accounts').forEach(function (a) {
      var key = a.type || 'بانک';
      totals[key] = (totals[key] || 0) + (Number(a.balance) || 0);
    });

    var net = Object.keys(totals).reduce(function (s, k) { return s + totals[k]; }, 0);
    return Object.keys(totals)
      .map(function (k) { return { type: k, amount: totals[k] }; })
      .filter(function (r) { return r.amount > 0; })
      .sort(function (a, b) { return b.amount - a.amount; })
      .map(function (r, i) {
        r.pct = net > 0 ? (r.amount / net) * 100 : 0;
        r.color = MIX_TINTS[i % MIX_TINTS.length];
        return r;
      });
  }

  /**
   * Monthly bills — the spending side of the recurring templates, biggest
   * first. Version 3 moved these out of the transaction list: a bill is now
   * a template that a month's transaction is generated from, so this reads
   * the templates rather than guessing from past rows.
   */
  function subscriptions() {
    var rows = App.recurring.templates(true)
      .filter(function (r) { return r.direction !== 'درآمد'; })
      .sort(function (a, b) { return (Number(b.amount) || 0) - (Number(a.amount) || 0); });

    return { rows: rows, total: sum(rows, 'amount') };
  }

  /** The income side of the same templates — salary, retainers. */
  function fixedIncome() {
    var rows = App.recurring.templates(true)
      .filter(function (r) { return r.direction === 'درآمد'; })
      .sort(function (a, b) { return (Number(b.amount) || 0) - (Number(a.amount) || 0); });

    return { rows: rows, total: sum(rows, 'amount') };
  }

  // ---- the car ---------------------------------------------------------

  /** How close a service has to be before it is worth mentioning. */
  var SOON_KM = 1000;
  var INSURANCE_DAYS = 30;

  /**
   * The newest service per part, per car.
   *
   * Without this, replacing the oil twice would leave the first entry warning
   * forever: its "next at 110,000" is long past, even though the job was done
   * again at 112,000. Only the most recent entry for a given part can be due.
   */
  function latestServices(vehicleId) {
    var best = {};
    db.list('services', function (s) {
      return !vehicleId || s.vehicleId === vehicleId;
    }).forEach(function (s) {
      var key = (s.vehicleId || '') + '|' + util.trim(s.part);
      var km = Number(s.km) || 0;
      if (!best[key] || km > (Number(best[key].km) || 0)) best[key] = s;
    });
    return Object.keys(best).map(function (k) { return best[k]; });
  }

  /**
   * What needs attention on a car, by mileage rather than by date.
   * Pass a vehicle id for one car, or nothing for all of them.
   */
  function carAlerts(vehicleId) {
    var cars = {};
    db.list('vehicles').forEach(function (v) { cars[v.id] = v; });

    var overdue = [], soon = [];
    latestServices(vehicleId).forEach(function (s) {
      var next = Number(s.nextKm) || 0;
      if (!next) return;
      var car = cars[s.vehicleId];
      if (!car) return;
      var remaining = next - (Number(car.odometer) || 0);
      var row = { service: s, vehicle: car, remaining: remaining };
      if (remaining <= 0) overdue.push(row);
      else if (remaining <= SOON_KM) soon.push(row);
    });

    overdue.sort(function (a, b) { return a.remaining - b.remaining; });
    soon.sort(function (a, b) { return a.remaining - b.remaining; });

    var today = J.todayIso();
    var insurance = db.list('insurances', function (i) {
      return (!vehicleId || i.vehicleId === vehicleId) && !!i.to;
    }).map(function (p) {
      return { policy: p, vehicle: cars[p.vehicleId], days: J.diffDays(today, p.to) };
    }).filter(function (r) {
      return r.days != null && r.days <= INSURANCE_DAYS;
    }).sort(function (a, b) { return a.days - b.days; });

    // An expired policy that has already been replaced by a newer one for the
    // same car and kind is history, not a warning.
    insurance = insurance.filter(function (r) {
      return !db.list('insurances').some(function (other) {
        return other.id !== r.policy.id &&
          other.vehicleId === r.policy.vehicleId &&
          other.kind === r.policy.kind &&
          String(other.to || '') > String(r.policy.to || '');
      });
    });

    return { overdue: overdue, soon: soon, insurance: insurance,
             count: overdue.length + soon.length + insurance.length };
  }

  // ---- reminders -------------------------------------------------------

  /** Birthdays, recurring bills and dated tasks, merged and sorted by date. */
  function reminders(limit, horizonDays) {
    var today = J.todayIso();
    var horizon = horizonDays || 45;
    var out = [];

    if (db.moduleOn('people')) {
      db.list('people', function (p) { return !!p.birthday; }).forEach(function (p) {
        var days = J.daysUntilAnniversary(p.birthday, today);
        if (days == null || days > horizon) return;
        var iso = J.addDays(today, days);
        out.push({ days: days, iso: iso, text: 'تولد ' + p.name, kind: 'birthday' });
      });
    }

    if (db.moduleOn('money')) subscriptions().rows.forEach(function (tpl) {
      var day = Number(tpl.dayOfMonth) || 1;
      var next = nextMonthlyOccurrence(day, today);
      if (tpl.endDate && next > tpl.endDate) return;
      var days = J.diffDays(today, next);
      if (days == null || days > horizon) return;
      out.push({
        days: days, iso: next, kind: 'bill',
        text: tpl.title + ' — ' + util.faNum(tpl.amount) + ' ' + db.settings().unit
      });
    });

    if (db.moduleOn('car')) carAlerts().insurance.forEach(function (r) {
      if (r.days == null || r.days > horizon) return;
      var car = r.vehicle ? r.vehicle.name : 'ماشین';
      out.push({
        days: r.days, iso: r.policy.to, kind: 'insurance',
        text: 'بیمه‌ی ' + (r.policy.kind || '') + ' ' + car +
          (r.days < 0 ? ' منقضی شده' : ' تمام می‌شود')
      });
    });

    // Tasks dated today already have their own list on the home page; the
    // reminder box is for what is coming, not for what is on screen already.
    db.list('tasks', function (t) { return !t.done && t.date && t.date > today; })
      .forEach(function (t) {
        var days = J.diffDays(today, t.date);
        if (days == null || days > horizon) return;
        out.push({ days: days, iso: t.date, text: t.title, kind: 'task', id: t.id });
      });

    out.sort(function (a, b) { return a.days - b.days; });
    return limit ? out.slice(0, limit) : out;
  }

  /** Same Jalali day-of-month, this month if still ahead, otherwise next. */
  function nextMonthlyOccurrence(jd, fromIso) {
    var from = J.isoToJ(fromIso);
    var jy = from.jy, jm = from.jm;
    if (jd < from.jd) {
      jm += 1;
      if (jm > 12) { jm = 1; jy += 1; }
    }
    var max = J.daysInJMonth(jy, jm);
    return J.jToIso(jy, jm, Math.min(jd, max));
  }

  // ---- notes / learning / people ---------------------------------------

  function noteCounts() {
    var counts = {};
    App.schema.NOTE_STAGE.forEach(function (s) { counts[s] = 0; });
    db.list('notes').forEach(function (n) {
      var s = n.stage || 'گذرا';
      counts[s] = (counts[s] || 0) + 1;
    });
    return counts;
  }

  function courseStats() {
    var all = db.list('courses');
    var active = all.filter(function (c) { return c.status !== 'تمام'; });
    var avg = active.length
      ? Math.round(active.reduce(function (s, c) { return s + (Number(c.progress) || 0); }, 0) / active.length)
      : 0;
    return {
      total: all.length,
      active: active.length,
      completed: all.length - active.length,
      averageProgress: avg
    };
  }

  function upcomingBirthdays(limit) {
    var today = J.todayIso();
    return db.list('people', function (p) { return !!p.birthday; })
      .map(function (p) {
        return { person: p, days: J.daysUntilAnniversary(p.birthday, today) };
      })
      .filter(function (r) { return r.days != null; })
      .sort(function (a, b) { return a.days - b.days; })
      .slice(0, limit || 5);
  }

  function peopleByCategory(category) {
    return db.list('people', function (p) { return p.category === category; });
  }

  App.stats = {
    CHART_CEILING: CHART_CEILING,
    sum: sum,
    tasksOn: tasksOn,
    taskStats: taskStats,
    dueTasks: dueTasks,
    openTasksByProject: openTasksByProject,
    projectProgress: projectProgress,
    activeProjects: activeProjects,
    projectsForGoal: projectsForGoal,
    connectedProjectCount: connectedProjectCount,
    moneySummary: moneySummary,
    monthlySeries: monthlySeries,
    categorySpend: categorySpend,
    assetMix: assetMix,
    subscriptions: subscriptions,
    fixedIncome: fixedIncome,
    carAlerts: carAlerts,
    latestServices: latestServices,
    reminders: reminders,
    noteCounts: noteCounts,
    courseStats: courseStats,
    upcomingBirthdays: upcomingBirthdays,
    peopleByCategory: peopleByCategory
  };
})(window.App = window.App || {});
