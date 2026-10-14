/*
 * Monthly bills and fixed income.
 *
 * A `recurrings` record is a template, not a transaction: "internet, 450, the
 * 5th of every month, from Mehr". This file works out which months that
 * template still owes a transaction for, and turns an approved month into a
 * perfectly ordinary transaction that carries `srcId` back to the template.
 *
 * Nothing is ever written without being approved first — that is a deliberate
 * choice, so the numbers on the money page are always ones the user agreed
 * to. The home and money pages show what is waiting.
 *
 * A month stops being pending in exactly three ways: a transaction for it
 * exists (matched by `srcId`, so duplicates are impossible even if two
 * devices approve at once), the month is listed in the template's
 * `skipMonths`, or it falls outside the template's start/end dates.
 */
(function (App) {
  'use strict';

  var util = App.util;
  var db = App.db;
  var J = App.jalali;

  // Never look further back than this, so a template started years ago and
  // left alone cannot suggest a wall of months.
  var MAX_MONTHS = 12;

  function templates(activeOnly) {
    return db.list('recurrings', function (r) {
      return activeOnly ? r.active !== false : true;
    }).sort(function (a, b) {
      return String(a.title || '').localeCompare(String(b.title || ''), 'fa');
    });
  }

  /** Months this template already has a transaction for. */
  function generatedMonths(tplId) {
    var out = {};
    db.list('transactions', function (t) { return t.srcId === tplId; })
      .forEach(function (t) {
        var k = J.monthKey(t.date);
        if (k) out[k] = true;
      });
    return out;
  }

  /**
   * Months still waiting for approval for one template, oldest first.
   * Each entry is everything the transaction needs.
   */
  function pendingFor(tpl, todayKey) {
    if (!tpl || tpl.active === false) return [];
    var from = J.monthKey(tpl.startDate);
    if (!from) return [];

    var to = todayKey || J.monthKeyOfToday();
    if (tpl.endDate) {
      var endKey = J.monthKey(tpl.endDate);
      if (endKey && endKey < to) to = endKey;
    }

    var done = generatedMonths(tpl.id);
    var skipped = {};
    (Array.isArray(tpl.skipMonths) ? tpl.skipMonths : []).forEach(function (m) { skipped[m] = true; });

    return J.monthKeyRange(from, to, MAX_MONTHS)
      .filter(function (k) { return !done[k] && !skipped[k]; })
      .map(function (k) { return entry(tpl, k); });
  }

  function entry(tpl, monthKey) {
    var iso = J.monthDayIso(monthKey, tpl.dayOfMonth);
    // A bill dated after the template's end date is not owed.
    if (tpl.endDate && iso && iso > tpl.endDate) iso = tpl.endDate;
    return {
      id: tpl.id + '@' + monthKey,
      tplId: tpl.id,
      monthKey: monthKey,
      title: tpl.title,
      direction: tpl.direction === 'درآمد' ? 'درآمد' : 'خرج',
      category: tpl.category || '',
      amount: Number(tpl.amount) || 0,
      accountId: tpl.accountId || '',
      date: iso
    };
  }

  /** Everything pending across every active template, oldest month first. */
  function pending() {
    var todayKey = J.monthKeyOfToday();
    var out = [];
    templates(true).forEach(function (tpl) {
      pendingFor(tpl, todayKey).forEach(function (e) { out.push(e); });
    });
    return out.sort(function (a, b) {
      return a.monthKey === b.monthKey
        ? String(a.title).localeCompare(String(b.title), 'fa')
        : (a.monthKey < b.monthKey ? -1 : 1);
    });
  }

  function count() { return pending().length; }

  /** Sum of what is waiting, split by direction. */
  function pendingTotals(list) {
    var rows = list || pending();
    var out = { income: 0, spend: 0, count: rows.length };
    rows.forEach(function (e) {
      if (e.direction === 'درآمد') out.income += e.amount;
      else out.spend += e.amount;
    });
    return out;
  }

  // ---- approving --------------------------------------------------------

  /**
   * Turn approved entries into transactions. The clash check makes this safe
   * to call twice: a month that already has its transaction is skipped, so
   * two devices approving the same month cannot double-charge it.
   */
  function toTransactions(entries) {
    return (entries || []).filter(function (e) {
      if (!e || !e.date) return false;
      return !db.count('transactions', function (t) {
        return t.srcId === e.tplId && J.monthKey(t.date) === e.monthKey;
      });
    }).map(function (e) {
      return {
        title: e.title,
        direction: e.direction,
        category: e.category,
        amount: e.amount,
        accountId: e.accountId,
        date: e.date,
        srcId: e.tplId
      };
    });
  }

  /** Approve one waiting month. Returns true when a transaction was added. */
  function approve(e) {
    return db.insertMany('transactions', toTransactions([e])).length > 0;
  }

  /** Approve everything waiting, in one save and one re-render. */
  function approveAll(list) {
    return db.insertMany('transactions', toTransactions(list || pending())).length;
  }

  /** Dismiss one waiting month for good (a bill that was not due that month). */
  function skip(e) {
    var tpl = db.get('recurrings', e.tplId);
    if (!tpl) return false;
    var months = (Array.isArray(tpl.skipMonths) ? tpl.skipMonths : []).slice();
    if (months.indexOf(e.monthKey) === -1) months.push(e.monthKey);
    db.update('recurrings', tpl.id, { skipMonths: months });
    return true;
  }

  /** Undo a skip, so the month is offered again. */
  function unskip(tplId, monthKey) {
    var tpl = db.get('recurrings', tplId);
    if (!tpl) return false;
    var months = (Array.isArray(tpl.skipMonths) ? tpl.skipMonths : [])
      .filter(function (m) { return m !== monthKey; });
    db.update('recurrings', tplId, { skipMonths: months });
    return true;
  }

  // ---- reading ----------------------------------------------------------

  /** Monthly totals from the active templates — what the month costs on paper. */
  function summary() {
    var rows = templates(true);
    var spend = 0, income = 0;
    rows.forEach(function (r) {
      var amount = Number(r.amount) || 0;
      if (r.direction === 'درآمد') income += amount;
      else spend += amount;
    });
    return { rows: rows, spend: spend, income: income, net: income - spend };
  }

  /** The template a generated transaction came from, or null. */
  function sourceOf(transaction) {
    if (!transaction || !transaction.srcId) return null;
    return db.get('recurrings', transaction.srcId);
  }

  function label(tpl) {
    return util.trim(tpl && tpl.title) || 'بی‌عنوان';
  }

  App.recurring = {
    MAX_MONTHS: MAX_MONTHS,
    templates: templates,
    pending: pending,
    pendingFor: pendingFor,
    pendingTotals: pendingTotals,
    count: count,
    approve: approve,
    approveAll: approveAll,
    skip: skip,
    unskip: unskip,
    summary: summary,
    sourceOf: sourceOf,
    label: label
  };
})(window.App = window.App || {});
