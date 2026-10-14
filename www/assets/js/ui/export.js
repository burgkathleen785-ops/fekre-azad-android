/*
 * File exports — the JSON backup and the Excel workbook.
 *
 * The Excel columns are generated from schema.js, like the forms are, so a
 * field added there shows up in the spreadsheet too. Values are converted
 * for reading rather than re-importing: relation ids become names, dates
 * become Jalali, checkboxes become «بله», and numbers stay real numbers so
 * they can be summed in Excel.
 */
(function (App) {
  'use strict';

  var util = App.util;
  var db = App.db;
  var J = App.jalali;
  var schema = App.schema;

  function stamp() {
    var j = J.isoToJ(J.todayIso());
    return j ? j.jy + '-' + pad(j.jm) + '-' + pad(j.jd) : 'export';
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  // ---- JSON --------------------------------------------------------------

  function json() {
    try {
      var text = JSON.stringify(db.exportDocument(), null, 2);
      downloadBlob(new Blob([text], { type: 'application/json;charset=utf-8' }),
        'dashboard-' + stamp() + '.json');
      App.toast.show('فایل پشتیبان ساخته شد');
    } catch (e) {
      console.error('[export] json failed', e);
      App.toast.error('خروجی گرفتن ناموفق بود: ' + e.message);
    }
  }

  // ---- Excel -------------------------------------------------------------

  /**
   * Jalali date with Latin digits, so Excel sorts it correctly as text.
   * A birthday with no year keeps its month and day rather than vanishing.
   */
  function jDate(iso) {
    var j = J.parts(iso);
    if (!j) return '';
    return (j.jy ? j.jy + '/' : '') + pad(j.jm) + '/' + pad(j.jd);
  }

  function stampDate(isoTime) {
    return isoTime ? jDate(String(isoTime).slice(0, 10)) : '';
  }

  function selectLabel(field, value) {
    if (value == null || value === '') return '';
    var raw = typeof field.options === 'function' ? field.options() : field.options;
    var found = (raw || []).filter(function (o) {
      return (typeof o === 'string' ? o : o.value) === value;
    })[0];
    if (!found) return String(value);
    return typeof found === 'string' ? found : found.label;
  }

  function cellFor(field, rec) {
    var v = rec[field.name];
    switch (field.type) {
      case 'number': {
        var n = Number(v);
        return (v === null || v === '' || v === undefined || !isFinite(n)) ? null : n;
      }
      case 'checkbox': return v ? 'بله' : '';
      case 'jdate': return jDate(v);
      case 'select': return selectLabel(field, v);
      case 'pairs':
        return (Array.isArray(v) ? v : []).map(function (p) {
          return (p.label ? p.label + ': ' : '') + (p.value || '');
        }).join('\n');
      default: return v == null ? '' : String(v);
    }
  }

  function widthFor(field) {
    switch (field.type) {
      case 'textarea': case 'pairs': return 44;
      case 'url': return 38;
      case 'jdate': return 13;
      case 'number': case 'checkbox': return 13;
      case 'select': return 20;
      default: return field.required ? 30 : 20;
    }
  }

  function sortRows(name, rows) {
    var def = schema.COLLECTIONS[name];
    if (def.fields.some(function (f) { return f.name === 'date'; })) {
      return rows.sort(function (a, b) {
        return String(b.date || '').localeCompare(String(a.date || ''));
      });
    }
    var key = def.titleField;
    return rows.sort(function (a, b) {
      return String(a[key] || '').localeCompare(String(b[key] || ''), 'fa');
    });
  }

  /** Extra computed columns that make a sheet more useful than the raw fields. */
  var EXTRA = {
    projects: [{ header: 'درصد پیشرفت', type: 'number', width: 13,
      get: function (r) { return App.stats.projectProgress(r); } }],
    transactions: [{ header: 'مبلغ با علامت', type: 'number', width: 15,
      get: function (r) { return (r.direction === 'درآمد' ? 1 : -1) * (Number(r.amount) || 0); } }]
  };

  function collectionSheet(name) {
    var def = schema.COLLECTIONS[name];
    var fields = def.fields;
    var extra = EXTRA[name] || [];

    var columns = fields.map(function (f) {
      return { header: f.label, width: widthFor(f), wrap: f.type === 'textarea' || f.type === 'pairs' };
    }).concat(extra.map(function (x) {
      return { header: x.header, width: x.width };
    })).concat([
      { header: 'تاریخ ثبت', width: 13 },
      { header: 'آخرین ویرایش', width: 13 }
    ]);

    var rows = sortRows(name, db.list(name)).map(function (rec) {
      return fields.map(function (f) {
        // The generic "link" value on notes is a goal/project token.
        if (name === 'notes' && f.name === 'link') return linkText(rec.link);
        return cellFor(f, rec);
      }).concat(extra.map(function (x) { return x.get(rec); }))
        .concat([stampDate(rec.createdAt), stampDate(rec.updatedAt)]);
    });

    return { name: def.plural, columns: columns, rows: rows };
  }

  function linkText(link) {
    if (!link) return '';
    var parts = String(link).split(':');
    if (parts.length !== 2) return '';
    return parts[0] === 'goal'
      ? 'هدف · ' + db.labelOf('goals', parts[1])
      : 'پروژه · ' + db.labelOf('projects', parts[1]);
  }

  function summarySheet() {
    var s = db.settings();
    var money = App.stats.moneySummary();
    var subs = App.stats.subscriptions();
    var unit = s.unit;

    var income = App.stats.fixedIncome();
    var pending = App.recurring.pendingTotals();

    var rows = [
      [{ v: s.workspaceTitle, bold: true }, ''],
      ['تاریخ خروجی', jDate(J.todayIso())],
      ['نسخه‌ی برنامه', App.changelog.VERSION],
      ['', ''],
      [{ v: 'پول — ' + money.monthLabel, bold: true }, ''],
      ['موجودی کل (' + unit + ')', money.totalBalance],
      ['ارزش خالص (' + unit + ')', money.netWorth],
      ['درآمد این ماه (' + unit + ')', money.income],
      ['خرج این ماه (' + unit + ')', money.spend],
      ['سقف خرج ماهانه (' + unit + ')', money.budget],
      ['قبض‌های ماهانه (' + unit + ')', subs.total],
      ['درآمد ثابت ماهانه (' + unit + ')', income.total],
      ['تراکنش‌های تکرارشونده‌ی در انتظار تأیید', pending.count],
      ['', ''],
      [{ v: 'تعداد رکوردها', bold: true }, '']
    ];
    schema.NAMES.forEach(function (n) {
      rows.push([schema.COLLECTIONS[n].plural, db.count(n)]);
    });
    rows.push([{ v: 'مجموع', bold: true }, { v: db.totalRecords(), bold: true }]);
    rows.push(['', '']);
    rows.push([{ v: 'محرمانه', bold: true }, '']);
    rows.push(['تعداد موارد گاوصندوق', App.vault.count()]);
    rows.push(['محتوای گاوصندوق در این فایل', 'نه — رمزنگاری‌شده و جداست']);

    return {
      name: 'خلاصه',
      columns: [{ header: 'شاخص', width: 34 }, { header: 'مقدار', width: 22 }],
      rows: rows
    };
  }

  /** Build the workbook. `only` limits it to some collections (plus no summary). */
  function workbook(only) {
    var names = only && only.length ? only : schema.NAMES;
    var sheets = names.map(collectionSheet);
    if (!only) sheets.unshift(summarySheet());
    return App.xlsx.build(sheets);
  }

  function excel(only, label) {
    try {
      var blob = workbook(only);
      var suffix = label ? '-' + label : '';
      downloadBlob(blob, 'dashboard-' + stamp() + suffix + '.xlsx');
      App.toast.show('فایل Excel ساخته شد');
    } catch (e) {
      console.error('[export] excel failed', e);
      App.toast.error('ساخت فایل Excel ناموفق بود: ' + e.message);
    }
  }

  // ---- the vault, in the clear -------------------------------------------

  /*
   * A separate workbook, on purpose.
   *
   * The ordinary Excel export never contains the vault, and the JSON backup
   * only ever contains the sealed blob. This is the one place the secrets are
   * written out readable, it only works while the vault is open, and the page
   * asks for confirmation before calling it — see pages/vault.js.
   */
  function vaultWorkbook() {
    if (!App.vault.isOpen()) throw new Error('گاوصندوق قفل است.');
    var page = App.pages.vault;
    var items = App.vault.list();

    var sheets = page.KIND_ORDER.map(function (kind) {
      var fields = page.FIELDS[kind] || [];
      var columns = [{ header: 'عنوان', width: 30 }, { header: 'دسته', width: 16 }]
        .concat(fields.map(function (f) {
          return {
            header: f.label,
            width: f.type === 'textarea' ? 44 : 22,
            wrap: f.type === 'textarea'
          };
        }))
        .concat([{ header: 'یادداشت', width: 40, wrap: true },
                 { header: 'تاریخ ثبت', width: 13 },
                 { header: 'آخرین ویرایش', width: 13 }]);

      var rows = items.filter(function (i) { return i.kind === kind; })
        .map(function (i) {
          return [i.title || '', i.category || '']
            .concat(fields.map(function (f) { return i[f.name] == null ? '' : String(i[f.name]); }))
            .concat([i.notes || '', stampDate(i.createdAt), stampDate(i.updatedAt)]);
        });

      return { name: page.KIND_LABEL[kind], columns: columns, rows: rows };
    });

    var warning = {
      name: 'هشدار',
      columns: [{ header: 'توجه', width: 90, wrap: true }],
      rows: [
        ['این فایل محتوای بخش «محرمانه» را به‌صورت متن ساده دارد: شماره‌کارت‌ها، رمزها و ' +
         'یادداشت‌های خصوصی، بدون هیچ رمزنگاری.'],
        ['هر کسی که این فایل را داشته باشد همه‌ی آن‌ها را می‌بیند — از جمله هر سرویس ابری که ' +
         'پوشه‌ی دانلودهایت را همگام‌سازی می‌کند.'],
        ['برای پشتیبان‌گیری معمولی از این فایل استفاده نکن؛ «پشتیبان JSON» همین محتوا را ' +
         'رمزشده نگه می‌دارد.'],
        ['بعد از استفاده، فایل را پاک کن و سطل بازیافت را هم خالی کن.'],
        ['تاریخ ساخت: ' + jDate(J.todayIso())]
      ]
    };

    return App.xlsx.build([warning].concat(sheets));
  }

  function vaultExcel() {
    var blob = vaultWorkbook();
    downloadBlob(blob, 'dashboard-' + stamp() + '-mahramaneh.xlsx');
    App.toast.show('فایل ساخته شد — بعد از استفاده پاکش کن');
  }

  App.exporter = {
    json: json,
    excel: excel,
    workbook: workbook,
    vaultExcel: vaultExcel,
    vaultWorkbook: vaultWorkbook,
    stamp: stamp,
    downloadBlob: downloadBlob
  };
})(window.App = window.App || {});
