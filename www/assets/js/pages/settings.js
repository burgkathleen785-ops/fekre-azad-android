/* تنظیمات و پشتیبان — appearance, preferences, categories, export, account, restore. */
(function (App) {
  'use strict';

  var el = App.el;
  var util = App.util;
  var db = App.db;
  var schema = App.schema;
  var W = App.widgets;

  function isServer() { return App.storage.mode() === 'server'; }

  function render() {
    var s = db.settings();
    var usedKb = Math.max(1, Math.round(App.storage.usage() / 1024));

    return el('div', [
      el('div.eyebrow', 'APPEARANCE · CATEGORIES · EXPORT · BACKUP'),
      el('h1.page-title.page-title--tight', 'تنظیمات و پشتیبان'),
      el('p.page-lede', isServer()
        ? 'داده‌ها روی سرور سایتت ذخیره می‌شوند و از هر دستگاهی که وارد شوی همان‌ها را می‌بینی. ' +
          'سرور خودش نسخه‌های پشتیبان نگه می‌دارد؛ با این حال هر چند وقت یک بار خروجی بگیر.'
        : 'همه‌ی داده‌ها داخل حافظه‌ی همین مرورگر ذخیره می‌شود و به اینترنت فرستاده نمی‌شود. ' +
          'برای اینکه پاک‌کردن حافظه‌ی مرورگر کارت را از بین نبرد، هر چند وقت یک بار خروجی بگیر.'),

      appearanceSection(s),

      W.sectionHead('ترجیحات', null, { margin: '36px 0 4px' }),
      settingRow('نام میزکار', 'همان عنوانی که بالای صفحه می‌بینی.',
        textControl(s.workspaceTitle, function (v) {
          db.setSettings({ workspaceTitle: util.trim(v) || schema.DEFAULT_SETTINGS.workspaceTitle });
          App.toast.show('ذخیره شد');
        })),
      settingRow('واحد پول', 'فقط یک برچسب است؛ روی محاسبه‌ها اثری ندارد.',
        textControl(s.unit, function (v) {
          db.setSettings({ unit: util.trim(v) || schema.DEFAULT_SETTINGS.unit });
          App.toast.show('ذخیره شد');
        })),
      settingRow('سقف خرج ماهانه',
        'نوار بودجه در صفحه‌ی خانه با همین عدد سنجیده می‌شود. صفر یعنی بدون سقف.',
        numberControl(s.monthlyBudget, function (n) {
          db.setSettings({ monthlyBudget: n });
          App.toast.show('ذخیره شد');
        })),
      settingRow('صفحه‌ی شروع', 'وقتی برنامه را باز می‌کنی از این صفحه شروع می‌شود.',
        startPageControl(s.startPage)),

      modulesSection(s),

      categoriesSection(),

      db.moduleOn('vault') ? vaultSection(s) : null,

      W.sectionHead('خروجی و پشتیبان', null, { margin: '36px 0 4px' }),
      settingRow('خروجی Excel',
        'یک فایل ‎.xlsx‎ با یک برگه برای هر بخش (اهداف، پروژه‌ها، کارها، یادداشت‌ها، حساب‌ها، تراکنش‌ها، ' +
        'دوره‌ها، افراد) و یک برگه‌ی خلاصه. تاریخ‌ها شمسی‌اند و مبلغ‌ها عدد واقعی، تا در Excel جمع بزنی.',
        el('button.btn', { type: 'button', onclick: function () { App.exporter.excel(); } }, 'دانلود Excel')),
      settingRow('پشتیبان JSON',
        'فایلی با همه‌ی داده‌ها و تنظیمات. همین فایل را می‌شود دوباره وارد کرد — ' +
        'مثلاً برای انتقال داده‌های نسخه‌ی محلی به نسخه‌ی آنلاین.',
        el('button.btn-ghost', { type: 'button', onclick: function () { App.exporter.json(); } }, 'دانلود JSON')),
      settingRow('وارد کردن',
        'فایل JSON قبل از هر تغییری بررسی می‌شود و تعداد رکوردها را نشانت می‌دهم. ' +
        'بعد خودت انتخاب می‌کنی جایگزین شود یا اضافه.',
        importControl()),

      isServer() ? accountSection() : null,
      isServer() && App.auth.isOwner() ? peopleSection() : null,

      appSection(),

      W.sectionHead('وضعیت داده‌ها', null, { margin: '36px 0 4px' }),
      el('div.table.mt-12', [
        el('div.table__head', { style: { 'grid-template-columns': '1fr 90px' } }, [
          el('div', 'جدول'), el('div', 'تعداد')
        ])
      ].concat(schema.NAMES.map(function (name) {
        return el('div.table__row', { style: { 'grid-template-columns': '1fr 90px' } }, [
          el('div', schema.COLLECTIONS[name].plural),
          el('div.cell-num', util.toFa(db.count(name)))
        ]);
      })).concat([
        el('div.table__row', { style: { 'grid-template-columns': '1fr 90px' } }, [
          el('div.cell-strong', 'مجموع'),
          el('div.cell-num.cell-accent', util.toFa(db.totalRecords()))
        ])
      ])),
      el('div.table__row', { style: { 'grid-template-columns': '1fr 90px' } }, [
        el('div', [
          'محرمانه (گاوصندوق)',
          el('span.hint', { style: { display: 'block' } },
            App.vault.state() === 'open' ? 'باز است'
              : App.vault.state() === 'locked' ? 'قفل است — محتوایش رمزشده روی سرور است'
              : App.vault.state() === 'absent' ? 'ساخته نشده'
              : 'در این مرورگر در دسترس نیست')
        ]),
        el('div.cell-num', util.toFa(App.vault.count()))
      ]),
      el('div.hint.mt-12', isServer()
        ? 'حجم داده روی سرور حدود ' + util.toFa(usedKb) + ' کیلوبایت است.'
        : 'حجم ذخیره‌شده حدود ' + util.toFa(usedKb) + ' کیلوبایت است. ' +
          'محدودیت مرورگر معمولاً حدود ۵ مگابایت است، پس جای نگرانی نیست.'),

      W.sectionHead('پاک‌کردن', null, { margin: '36px 0 4px' }),
      settingRow('پاک‌کردن همه‌ی داده‌ها',
        'همه‌ی رکوردها حذف می‌شوند و دیتابیس خالی می‌ماند. تنظیمات، دسته‌ها و گاوصندوق ' +
        'دست‌نخورده می‌مانند (گاوصندوق دکمه‌ی پاک‌کردن خودش را در همان صفحه دارد). ' +
        'اول خروجی بگیر — این کار برگشت‌پذیر نیست.',
        el('button.btn-ghost.btn-ghost--danger', { type: 'button', onclick: clearData },
          'پاک‌کردن همه')),

      whereCard()
    ]);
  }

  // ======================================================================
  // appearance
  // ======================================================================

  function appearanceSection(s) {
    return el('div', [
      W.sectionHead('ظاهر', null, { margin: '0 0 4px' }),

      settingRow('حالت نمایش', '«هماهنگ با سیستم» با تنظیم روشن/تیره‌ی دستگاهت عوض می‌شود.',
        segmented([
          { value: 'light', label: 'روشن' },
          { value: 'dark', label: 'تیره' },
          { value: 'system', label: 'هماهنگ با سیستم' }
        ], s.themeMode || 'light', function (v) { save({ themeMode: v }); })),

      settingRow('رنگ اصلی',
        'رنگ دکمه‌ها، نوارهای پیشرفت، نمودارها و پیوندها. یکی از رنگ‌های آماده را بزن یا رنگ دلخواهت را انتخاب کن.',
        accentControl(s)),

      settingRow('رنگ درآمد و خرج', 'رنگ اعداد مثبت (درآمد) و منفی (خرج) در صفحه‌ی پول.',
        el('div.color-pair', [
          colorControl('درآمد', s.posColor, App.theme.DEFAULTS.posColor, 'posColor'),
          colorControl('خرج', s.negColor, App.theme.DEFAULTS.negColor, 'negColor')
        ])),

      settingRow('فونت برنامه',
        'فونت‌های آنلاین بار اول از Google Fonts گرفته می‌شوند. «فونت سیستم» هیچ چیزی دانلود نمی‌کند.',
        fontControl(s)),

      settingRow('فونت اعداد', 'فونت مبلغ‌ها، درصدها و تاریخ‌ها. پیش‌فرض: همان فونت برنامه.',
        select(
          [{ value: 'same', label: 'همان فونت برنامه' }].concat(App.theme.FONTS
            .filter(function (f) { return f.id !== 'custom' || util.trim(s.customFont); })
            .map(function (f) {
              return { value: f.id, label: f.licence ? f.label + ' — نیاز به لایسنس' : f.label };
            })),
          s.numFont || 'same',
          function (v) { save({ numFont: v }); })),

      settingRow('شکل ارقام', 'ارقام فارسی (۱۲۳) یا انگلیسی (123) در همه‌ی برنامه.',
        segmented([
          { value: 'fa', label: '۱۲۳٬۴۵۶' },
          { value: 'en', label: '123,456' }
        ], s.digits || 'fa', function (v) { save({ digits: v }); })),

      preview(),

      el('div', { style: { 'margin-top': '12px' } }, [
        el('button.btn-ghost', { type: 'button', onclick: resetAppearance }, 'بازگشت به ظاهر پیش‌فرض')
      ])
    ]);
  }

  function save(patch) {
    db.setSettings(patch);
  }

  function segmented(options, current, onPick) {
    return el('div.segmented', { role: 'group' }, options.map(function (o) {
      var on = o.value === current;
      return el('button.segmented__item' + (on ? '.is-active' : ''), {
        type: 'button', 'aria-pressed': on ? 'true' : 'false',
        onclick: function () { if (!on) onPick(o.value); }
      }, o.label);
    }));
  }

  function select(options, current, onPick, width) {
    var node = el('select.select', {
      style: { width: width || '240px' },
      onchange: function () { onPick(node.value); }
    });
    options.forEach(function (o) { node.appendChild(el('option', { value: o.value }, o.label)); });
    node.value = current;
    if (node.value !== current) node.selectedIndex = 0;
    return node;
  }

  function accentControl(s) {
    var current = App.theme.hex(s.accent, App.theme.DEFAULTS.accent);
    return el('div.accent-control', [
      el('div.swatches', App.theme.PRESETS.map(function (p) {
        var on = p.accent === current;
        return el('button.swatch-btn' + (on ? '.is-active' : ''), {
          type: 'button', title: p.label, 'aria-label': p.label,
          'aria-pressed': on ? 'true' : 'false',
          style: { background: p.accent },
          onclick: function () { save({ accent: p.accent }); }
        });
      })),
      colorControl('دلخواه', current, App.theme.DEFAULTS.accent, 'accent')
    ]);
  }

  /**
   * A native colour picker. While dragging it only repaints (no save, no
   * re-render — re-rendering would destroy the open picker); the value is
   * saved when the picker is closed.
   */
  function colorControl(label, value, fallback, key) {
    var hex = App.theme.hex(value, fallback);
    var input = el('input.color-input', {
      type: 'color', 'aria-label': label,
      oninput: function () {
        var draft = Object.assign({}, db.settings());
        draft[key] = input.value;
        App.theme.apply(draft);
      },
      onchange: function () {
        var patch = {};
        patch[key] = input.value;
        save(patch);
      }
    });
    input.value = hex;
    return el('label.color-control', [
      input,
      el('span', label),
      el('span.color-control__hex', { dir: 'ltr' }, hex)
    ]);
  }

  /** Fonts that are not free to redistribute say so, right where they are picked. */
  function licenceNote(id) {
    var f = App.theme.fontById ? App.theme.fontById(id) : null;
    if (!f || !f.licence) return null;
    return el('div.hint.hint--warn.mt-8', f.licence);
  }

  function fontControl(s) {
    var isCustom = s.font === 'custom';
    var note = licenceNote(s.font);
    var fontSelect = select(App.theme.FONTS.map(function (f) {
        return { value: f.id, label: f.licence ? f.label + ' — نیاز به لایسنس' : f.label };
      }),
      s.font || 'estedad',
      function (v) {
        if (v === 'custom' && !util.trim(db.settings().customFont)) {
          // Show the name box first; switching to an empty custom font would do nothing.
          customBox.style.display = '';
          nameInput.focus();
          return;
        }
        save({ font: v });
      });

    var nameInput = el('input.input.input--ltr', {
      type: 'text', dir: 'ltr', placeholder: 'IRANYekan', 'aria-label': 'نام فونت'
    });
    nameInput.value = s.customFont || '';
    var urlInput = el('input.input.input--ltr', {
      type: 'text', dir: 'ltr', placeholder: 'https://example.com/fonts/font.css', 'aria-label': 'آدرس فایل CSS فونت'
    });
    urlInput.value = s.customFontUrl || '';

    var customBox = el('div.custom-font', { style: { display: isCustom ? '' : 'none' } }, [
      el('label.field__label', 'نام فونت (همان نامی که روی دستگاه نصب است یا در فایل CSS تعریف شده)'),
      nameInput,
      el('label.field__label', { style: { 'margin-top': '10px' } }, 'آدرس فایل CSS فونت (اختیاری)'),
      urlInput,
      el('div.field__hint', 'اگر فونت روی دستگاهت نصب است، آدرس لازم نیست. برای نسخه‌ی آنلاین، ' +
        'فایل فونت را روی هاست خودت بگذار و آدرس CSS آن را اینجا بنویس.'),
      el('button.btn', {
        type: 'button', style: { 'margin-top': '10px' },
        onclick: function () {
          var name = util.trim(nameInput.value);
          if (!name) { App.toast.error('نام فونت را بنویس'); nameInput.focus(); return; }
          var url = util.trim(urlInput.value);
          if (url && !util.safeUrl(url)) { App.toast.error('آدرس باید با https:// شروع شود'); urlInput.focus(); return; }
          save({ font: 'custom', customFont: name, customFontUrl: url });
          App.toast.show('فونت اعمال شد');
        }
      }, 'اعمال فونت')
    ]);

    return el('div', { style: { width: '100%', 'max-width': '360px' } },
      [fontSelect, note, customBox]);
  }

  function preview() {
    return el('div.card.card--pad.theme-preview', [
      el('div.eyebrow', { style: { 'margin-bottom': '10px' } }, 'PREVIEW'),
      el('div.stat-grid.autogrid--money', [
        el('div.stat.stat--sm', [
          el('div.stat__label', 'موجودی کل'),
          el('div.stat__value.stat__value--sm', util.faNum(48200)),
          el('div.stat__note', db.settings().unit)
        ]),
        el('div.stat.stat--sm', [
          el('div.stat__label', 'درآمد'),
          el('div.stat__value.stat__value--sm.is-pos', util.faNum(32000))
        ]),
        el('div.stat.stat--sm', [
          el('div.stat__label', 'خرج'),
          el('div.stat__value.stat__value--sm.is-neg', util.faNum(19650))
        ])
      ]),
      el('div.bar.mt-12', [el('div.bar__fill', { style: { width: '64%' } })]),
      el('div.bar-legend', [el('span', util.faPct(64) + ' بودجه'), el('span', util.toFa(12) + ' روز مانده')]),
      el('div', { style: { display: 'flex', gap: '10px', 'align-items': 'center', 'margin-top': '14px', 'flex-wrap': 'wrap' } }, [
        el('button.btn', { type: 'button' }, 'دکمه'),
        el('button.btn-ghost', { type: 'button' }, 'دکمه‌ی فرعی'),
        el('span.chip', 'برچسب'),
        el('span.cat-tag', 'دسته'),
        el('a', { href: '#/settings', onclick: function (e) { e.preventDefault(); } }, 'پیوند')
      ])
    ]);
  }

  function resetAppearance() {
    var d = schema.DEFAULT_SETTINGS;
    save({
      themeMode: d.themeMode, accent: d.accent, posColor: d.posColor, negColor: d.negColor,
      font: d.font, numFont: d.numFont, digits: d.digits
    });
    App.toast.show('ظاهر به حالت پیش‌فرض برگشت');
  }

  // ======================================================================
  // categories
  // ======================================================================

  function categoriesSection() {
    return el('div', [
      W.sectionHead('دسته‌بندی‌ها', null, { margin: '36px 0 4px' }),
      el('div.hint', { style: { margin: '10px 0 4px' } },
        'هر بخش فهرست دسته‌های خودش را دارد. در همان بخش با دکمه‌های بالای فهرست فیلتر می‌کنی، ' +
        'و در فرم هر مورد دسته‌اش را انتخاب می‌کنی (یا همان‌جا دسته‌ی تازه می‌سازی).'),
      schema.CATEGORY_SECTIONS.map(function (sec) {
        var cats = App.categories.list(sec.collection);
        return settingRow(sec.label,
          el('div.cat-preview', cats.length
            ? cats.map(function (c) { return el('span.cat-tag', c); })
            : el('span.muted', 'بدون دسته')),
          el('button.btn-ghost', {
            type: 'button',
            onclick: function () { App.categories.openManager(sec.collection); }
          }, 'مدیریت'));
      })
    ]);
  }

  // ======================================================================
  // account (server mode)
  // ======================================================================

  var backups = { loading: false, loaded: false, at: 0, items: [], error: '' };

  function loadBackups(force) {
    if (backups.loading) return;
    if (!force && backups.loaded && Date.now() - backups.at < 30000) return;
    backups.loading = true;
    backups.at = Date.now();
    App.storage.api('GET', 'backups').then(function (res) {
      backups.loading = false;
      backups.loaded = true;
      backups.items = res.ok ? (res.backups || []) : [];
      backups.error = res.ok ? '' : (res.error || 'فهرست پشتیبان‌ها گرفته نشد');
      if (App.view.current() === 'settings') App.view.refresh();
    });
  }

  function accountSection() {
    loadBackups(false);
    var me = App.auth.session() || {};

    return el('div', [
      W.sectionHead('حساب من', null, { margin: '36px 0 4px' }),
      settingRow('حساب',
        'داده‌های این حساب جدا از بقیه است؛ هیچ حساب دیگری — حتی مدیر — محتوای آن را نمی‌بیند.',
        el('div.account-chip', [
          App.logo.tile(30),
          el('div', [
            el('div', { style: { 'font-weight': '600' } }, me.displayName || me.username || '—'),
            el('div.hint', { dir: 'ltr', style: { 'text-align': 'right' } },
              '@' + (me.username || '') + (me.role === 'owner' ? ' · مدیر' : ''))
          ])
        ])),
      settingRow('نام کاربری و نام نمایشی', 'نام کاربری همان چیزی است که با آن وارد می‌شوی.',
        el('button.btn-ghost', { type: 'button', onclick: editProfile }, 'ویرایش')),
      settingRow('رمز ورود', 'با عوض کردن رمز، همه‌ی دستگاه‌های دیگر از حساب خارج می‌شوند.',
        el('button.btn-ghost', { type: 'button', onclick: changePassword }, 'تغییر رمز')),
      settingRow('خروج', 'از این دستگاه خارج شو. داده‌ها روی سرور می‌مانند.',
        el('div', { style: { display: 'flex', gap: '8px', 'flex-wrap': 'wrap' } }, [
          el('button.btn-ghost', { type: 'button', onclick: function () { App.auth.logout(false); } }, 'خروج'),
          el('button.btn-ghost', { type: 'button', onclick: function () { App.auth.logout(true); } },
            'خروج از همه‌ی دستگاه‌ها')
        ])),

      settingRow('پشتیبان‌های خودکار سرور',
        'سرور حداکثر هر یک ساعت یک نسخه از داده‌ها نگه می‌دارد (آخرین ۳۰ نسخه). ' +
        'اگر چیزی را اشتباهی پاک کردی، از اینجا به نسخه‌ی قبل برگرد.',
        el('button.btn-ghost', { type: 'button', onclick: function () { loadBackups(true); } }, 'به‌روزرسانی فهرست')),
      backupList()
    ]);
  }

  function backupList() {
    if (!backups.loaded) return el('div.hint', { style: { padding: '8px 0' } }, 'در حال گرفتن فهرست…');
    if (backups.error) return el('div.field__error', backups.error);
    if (!backups.items.length) return el('div.hint', { style: { padding: '8px 0' } }, 'هنوز نسخه‌ی پشتیبانی ساخته نشده.');

    return el('div.table.mt-8', [
      el('div.table__head', { style: { 'grid-template-columns': '1fr 90px 90px' } }, [
        el('div', 'زمان'), el('div', 'حجم'), el('div', '')
      ])
    ].concat(backups.items.slice(0, 12).map(function (b) {
      var when = new Date(b.time * 1000);
      var iso = dateIso(when);
      var label = App.jalali.format(iso, true) + ' · ' +
        util.toFa(pad(when.getHours()) + ':' + pad(when.getMinutes()));
      return el('div.table__row.row', { style: { 'grid-template-columns': '1fr 90px 90px' } }, [
        el('div.cell-num', label),
        el('div.cell-num', util.toFa(Math.max(1, Math.round(b.bytes / 1024))) + ' KB'),
        el('div', { style: { display: 'flex', 'justify-content': 'flex-end' } }, [
          el('button.icon-btn', { type: 'button', onclick: function () { restoreBackup(b, label); } }, 'بازگردانی')
        ])
      ]);
    })));
  }

  function dateIso(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function restoreBackup(b, label) {
    App.modal.confirm({
      title: 'برگشت به نسخه‌ی ' + label + '؟',
      message: 'داده‌های فعلی با این نسخه جایگزین می‌شوند. قبل از جایگزینی، از وضعیت فعلی هم یک پشتیبان روی سرور ساخته می‌شود.',
      confirmLabel: 'بازگردانی'
    }).then(function (yes) {
      if (!yes) return;
      App.storage.api('POST', 'restore', { name: b.name }).then(function (res) {
        if (!res.ok) { App.toast.error(res.error || 'بازگردانی ناموفق بود'); return; }
        db.reload().then(function () {
          backups.loaded = false;
          App.toast.show('نسخه‌ی پشتیبان بازگردانی شد');
        }, function () { window.location.reload(); });
      });
    });
  }

  // ======================================================================
  // owner console — accounts and invite codes
  // ======================================================================

  var people = { loaded: false, loading: false, at: 0, users: [], invites: [], max: 0, error: '' };

  // Anything older than this is re-fetched when the page is opened again, so
  // the console never shows an account list that has since changed.
  var STALE_MS = 30000;

  function loadPeople(force) {
    if (people.loading) return;
    if (!force && people.loaded && Date.now() - people.at < STALE_MS) return;
    people.loading = true;
    people.at = Date.now();
    Promise.all([
      App.storage.api('GET', 'users'),
      App.storage.api('GET', 'invites')
    ]).then(function (res) {
      people.loading = false;
      people.loaded = true;
      people.error = (res[0].ok ? '' : res[0].error) || (res[1].ok ? '' : res[1].error) || '';
      people.users = res[0].ok ? res[0].users : [];
      people.invites = res[1].ok ? res[1].invites : [];
      people.max = res[0].maxUsers || 0;
      if (App.view.current() === 'settings') App.view.refresh();
    });
  }

  function peopleSection() {
    loadPeople(false);

    return el('div', [
      W.sectionHead('حساب‌ها و دعوت‌ها', null, { margin: '36px 0 4px' }),
      el('div.hint', { style: { margin: '10px 0 4px' } },
        'برای هر نفر یک کد جدا بساز. هر کد فقط یک بار و فقط برای همان نفر کار می‌کند؛ ' +
        'اگر کسی کدش را به دیگری بدهد، بعد از ساخت حساب دیگر به درد نمی‌خورد. ' +
        'داده‌های هر حساب جداست و تو هم محتوای آن را نمی‌بینی — فقط می‌توانی حساب را غیرفعال یا پاک کنی.'),
      settingRow('دعوت تازه', 'یک کد برای یک نفر مشخص می‌سازد. کد فقط همان یک بار نشان داده می‌شود.',
        el('div', { style: { display: 'flex', gap: '8px', 'flex-wrap': 'wrap' } }, [
          el('button.btn', { type: 'button', onclick: createInvite }, 'ساخت کد دعوت'),
          el('button.btn-ghost', {
            type: 'button',
            onclick: function () { loadPeople(true); }
          }, 'به‌روزرسانی فهرست')
        ])),
      peopleBody()
    ]);
  }

  function peopleBody() {
    if (!people.loaded) return el('div.hint', { style: { padding: '8px 0' } }, 'در حال گرفتن فهرست…');
    if (people.error) return el('div.field__error', people.error);

    return el('div', [
      el('div.setting-row__title', { style: { margin: '18px 0 8px' } },
        'حساب‌ها' + (people.max ? ' (' + util.toFa(people.users.length) + ' از ' + util.toFa(people.max) + ')' : '')),
      usersTable(),
      el('div.setting-row__title', { style: { margin: '22px 0 8px' } }, 'کدهای دعوت'),
      invitesTable()
    ]);
  }

  function usersTable() {
    if (!people.users.length) return el('div.hint', 'هنوز حسابی ساخته نشده.');
    var cols = { 'grid-template-columns': 'minmax(0,1.4fr) minmax(0,1fr) 92px 110px' };

    return el('div.table', [
      el('div.table__head', { style: cols }, [
        el('div', 'نام'), el('div', 'آخرین ورود'), el('div', 'حجم'), el('div', '')
      ])
    ].concat(people.users.map(function (u) {
      return el('div.table__row.row', { style: cols }, [
        el('div.cell-strong', [
          u.displayName || u.username,
          el('div.person-meta', [
            el('span.muted', { dir: 'ltr' }, '@' + u.username),
            u.role === 'owner' ? el('span.cat-tag', 'مدیر') : null,
            u.disabled ? el('span.cat-tag', 'غیرفعال') : null,
            u.self ? el('span.cat-tag', 'خودت') : null
          ])
        ]),
        el('div.cell-num', u.lastLoginAt ? stampLabel(u.lastLoginAt) : 'هنوز وارد نشده'),
        el('div.cell-num', util.toFa(Math.max(0, Math.round(u.bytes / 1024))) + ' KB'),
        el('div', { style: { display: 'flex', 'justify-content': 'flex-end', gap: '2px', 'flex-wrap': 'wrap' } },
          u.role === 'owner' ? [el('span.hint', '—')] : [
            el('button.icon-btn', {
              type: 'button', title: 'کد یک‌بارمصرف برای گذاشتن رمز تازه',
              onclick: function () { resetUser(u); }
            }, 'بازیابی رمز'),
            el('button.icon-btn', {
              type: 'button',
              onclick: function () { setDisabled(u, !u.disabled); }
            }, u.disabled ? 'فعال‌کردن' : 'غیرفعال'),
            el('button.icon-btn.icon-btn--danger', {
              type: 'button', onclick: function () { deleteUser(u); }
            }, 'حذف')
          ])
      ]);
    })));
  }

  function invitesTable() {
    if (!people.invites.length) return el('div.hint', 'کد دعوتی ساخته نشده.');
    var cols = { 'grid-template-columns': 'minmax(0,1.3fr) minmax(0,1fr) 92px' };

    return el('div.table', [
      el('div.table__head', { style: cols }, [
        el('div', 'برای چه کسی'), el('div', 'وضعیت'), el('div', '')
      ])
    ].concat(people.invites.map(function (inv) {
      var state = inv.usedAt ? 'استفاده شد' + (inv.usedBy ? ' · ' + inv.usedBy : '')
        : inv.revoked ? 'لغو شده'
        : inv.expired ? 'منقضی شده'
        : 'منتظر · تا ' + stampLabel(inv.expiresAt * 1000);
      var open = !inv.usedAt && !inv.revoked && !inv.expired;

      return el('div.table__row.row', { style: cols }, [
        el('div.cell-strong', inv.label),
        el('div' + (open ? '.cell-accent' : '.muted'), { style: { 'font-size': '12.5px' } }, state),
        el('div', { style: { display: 'flex', 'justify-content': 'flex-end' } }, [
          open ? el('button.icon-btn.icon-btn--danger', {
            type: 'button', onclick: function () { revokeInvite(inv); }
          }, 'لغو') : null
        ])
      ]);
    })));
  }

  function stampLabel(value) {
    var d = typeof value === 'number' ? new Date(value) : new Date(value);
    if (isNaN(d.getTime())) return '—';
    return App.jalali.format(dateIso(d), true);
  }

  function createInvite() {
    var label = textControlValue();
    var days = el('select.select', { style: { width: '100%' } });
    [[7, '۷ روز'], [14, '۱۴ روز'], [30, '۳۰ روز'], [90, '۹۰ روز']].forEach(function (d) {
      days.appendChild(el('option', { value: String(d[0]) }, d[1]));
    });
    days.value = '14';
    var error = el('div.field__error', { style: { display: 'none' } });

    function submit() {
      error.style.display = 'none';
      if (!util.trim(label.value)) {
        error.textContent = 'یک نام بنویس تا بعداً بدانی این کد مال کیست.';
        error.style.display = '';
        return;
      }
      App.storage.api('POST', 'invite_create', { label: label.value, days: Number(days.value) })
        .then(function (res) {
          if (!res.ok) {
            error.textContent = res.error || 'کد ساخته نشد.';
            error.style.display = '';
            return;
          }
          handle.close();
          people.loaded = false;
          loadPeople(true);
          showInvite(res.code, util.trim(label.value));
        });
    }

    var handle = App.modal.open({
      title: 'کد دعوت تازه',
      sub: 'کد را فقط به همان شخص بده. بعد از اینکه حسابش را ساخت، کد دیگر کار نمی‌کند.',
      narrow: true,
      body: el('form', { onsubmit: function (e) { e.preventDefault(); submit(); } }, [
        el('div.field', [el('label.field__label', 'برای چه کسی؟'), label,
          el('div.field__hint', 'فقط برای یادآوری خودت — مثلاً «رضا — عکاس».')]),
        el('div.field', [el('label.field__label', 'اعتبار'), days]),
        error
      ]),
      footer: [
        el('button.btn', { type: 'button', onclick: submit }, 'ساخت کد'),
        el('button.btn-ghost', { type: 'button', onclick: function () { handle.close(); } }, 'انصراف')
      ]
    });
  }

  function textControlValue() {
    return el('input.input', { type: 'text', maxlength: '60', placeholder: 'رضا — عکاس' });
  }

  /**
   * The code exists in readable form exactly once: here.
   * `withLink` is false for reset codes — those are typed on the login screen,
   * not turned into a sign-up link.
   */
  function showInvite(code, label, withLink) {
    var link = window.location.origin + window.location.pathname + '?invite=' + encodeURIComponent(code);
    var showLink = withLink !== false;

    function copy(text, button) {
      var done = function () {
        button.textContent = 'کپی شد';
        window.setTimeout(function () { button.textContent = 'کپی'; }, 1500);
      };
      if (window.navigator.clipboard && window.isSecureContext) {
        window.navigator.clipboard.writeText(text).then(done, function () { App.toast.error('کپی نشد؛ دستی انتخابش کن.'); });
      } else {
        App.toast.error('مرورگر اجازه‌ی کپی نداد؛ دستی انتخابش کن.');
      }
    }

    var codeBtn = el('button.btn-ghost', { type: 'button' }, 'کپی');
    codeBtn.addEventListener('click', function () { copy(code, codeBtn); });
    var linkBtn = el('button.btn-ghost', { type: 'button' }, 'کپی');
    linkBtn.addEventListener('click', function () { copy(link, linkBtn); });

    var handle = App.modal.open({
      title: 'کد دعوت ' + label,
      sub: 'این کد فقط همین یک بار نشان داده می‌شود — روی سرور فقط اثر رمزنگاری‌شده‌اش می‌ماند. ' +
        'اگر گمش کردی، کد تازه‌ای بساز و این یکی را لغو کن.',
      body: el('div', [
        el('div.field', [
          el('label.field__label', 'کد'),
          el('div.input-group', [
            el('div.input.input--ltr.code-box', { dir: 'ltr' }, code),
            codeBtn
          ])
        ]),
        showLink ? el('div.field', [
          el('label.field__label', 'یا این لینک را بفرست (کد از قبل داخلش است)'),
          el('div.input-group', [
            el('div.input.input--ltr.code-box.code-box--sm', { dir: 'ltr' }, link),
            linkBtn
          ])
        ]) : null,
        el('div.hint', showLink
          ? 'کد و لینک را از راهی امن بفرست. هر کسی که این کد را داشته باشد، تا وقتی استفاده نشده می‌تواند یک حساب بسازد.'
          : 'کد را از راهی امن بفرست. او در صفحه‌ی ورود روی «رمزم را فراموش کرده‌ام» می‌زند و با این کد رمز تازه می‌گذارد.')
      ]),
      footer: [el('button.btn', { type: 'button', onclick: function () { handle.close(); } }, 'بستن')]
    });
  }

  function revokeInvite(inv) {
    App.modal.confirm({
      title: 'لغو کد «' + inv.label + '»؟',
      message: 'بعد از لغو، این کد دیگر برای ساخت حساب کار نمی‌کند.',
      confirmLabel: 'لغو کن'
    }).then(function (yes) {
      if (!yes) return;
      App.storage.api('POST', 'invite_revoke', { id: inv.id }).then(function (res) {
        if (!res.ok) { App.toast.error(res.error || 'لغو نشد'); return; }
        App.toast.show('کد لغو شد');
        loadPeople(true);
      });
    });
  }

  function setDisabled(user, disabled) {
    var ask = disabled
      ? App.modal.confirm({
          title: 'غیرفعال‌کردن «' + (user.displayName || user.username) + '»؟',
          message: 'از همه‌ی دستگاه‌ها خارج می‌شود و تا وقتی فعالش نکنی نمی‌تواند وارد شود. داده‌هایش پاک نمی‌شود.',
          confirmLabel: 'غیرفعال کن'
        })
      : Promise.resolve(true);

    ask.then(function (yes) {
      if (!yes) return;
      App.storage.api('POST', 'user_disable', { id: user.id, disabled: disabled }).then(function (res) {
        if (!res.ok) { App.toast.error(res.error || 'انجام نشد'); return; }
        App.toast.show(disabled ? 'حساب غیرفعال شد' : 'حساب فعال شد');
        loadPeople(true);
      });
    });
  }

  function resetUser(user) {
    var name = user.displayName || user.username;
    App.modal.confirm({
      title: 'کد بازیابی برای «' + name + '»؟',
      message: 'یک کد یک‌بارمصرف ۲۴ ساعته ساخته می‌شود. خودِ او با این کد رمز تازه می‌گذارد — ' +
        'تو رمزش را نمی‌بینی و داده‌هایش دست نمی‌خورد.',
      confirmLabel: 'بساز',
      danger: false
    }).then(function (yes) {
      if (!yes) return;
      App.storage.api('POST', 'user_reset', { id: user.id }).then(function (res) {
        if (!res.ok) { App.toast.error(res.error || 'ساخته نشد'); return; }
        showInvite(res.code, name + ' (بازیابی رمز)', false);
      });
    });
  }

  function deleteUser(user) {
    var name = user.displayName || user.username;
    App.modal.confirm({
      title: 'حذف حساب «' + name + '»؟',
      message: 'حساب و همه‌ی داده‌ها و پشتیبان‌هایش برای همیشه پاک می‌شود. این کار برگشت ندارد.',
      confirmLabel: 'حذف کن'
    }).then(function (yes) {
      if (!yes) return;
      return App.modal.confirm({
        title: 'مطمئنی؟',
        message: 'داده‌های «' + name + '» قابل بازگردانی نخواهد بود.',
        confirmLabel: 'بله، پاک کن'
      });
    }).then(function (yes) {
      if (!yes) return;
      App.storage.api('POST', 'user_delete', { id: user.id }).then(function (res) {
        if (!res.ok) { App.toast.error(res.error || 'حذف نشد'); return; }
        App.toast.show('حساب حذف شد');
        loadPeople(true);
      });
    });
  }

  // ---- my profile --------------------------------------------------------

  function editProfile() {
    var me = App.auth.session() || {};
    var username = el('input.input.input--ltr', { type: 'text', dir: 'ltr', maxlength: '32' });
    username.value = me.username || '';
    var display = el('input.input', { type: 'text', maxlength: '60' });
    display.value = me.displayName || '';
    var error = el('div.field__error', { style: { display: 'none' } });

    function submit() {
      error.style.display = 'none';
      App.storage.api('POST', 'profile', { username: username.value, displayName: display.value })
        .then(function (res) {
          if (!res.ok) {
            error.textContent = res.error || 'ذخیره نشد.';
            error.style.display = '';
            return;
          }
          App.auth.setSession(res.user);
          handle.close();
          App.toast.show('ذخیره شد');
          App.view.refresh();
        });
    }

    var handle = App.modal.open({
      title: 'حساب من',
      narrow: true,
      body: el('form', { onsubmit: function (e) { e.preventDefault(); submit(); } }, [
        el('div.field', [el('label.field__label', 'نام کاربری'), username,
          el('div.field__hint', 'با همین وارد می‌شوی. ۳ تا ۳۲ حرف انگلیسی، عدد، نقطه یا خط تیره.')]),
        el('div.field', [el('label.field__label', 'نام نمایشی'), display]),
        error
      ]),
      footer: [
        el('button.btn', { type: 'button', onclick: submit }, 'ذخیره'),
        el('button.btn-ghost', { type: 'button', onclick: function () { handle.close(); } }, 'انصراف')
      ]
    });
  }

  function changePassword() {
    var current = el('input.input.input--ltr', { type: 'password', dir: 'ltr', autocomplete: 'current-password' });
    var next = el('input.input.input--ltr', { type: 'password', dir: 'ltr', autocomplete: 'new-password' });
    var repeat = el('input.input.input--ltr', { type: 'password', dir: 'ltr', autocomplete: 'new-password' });
    var error = el('div.field__error', { style: { display: 'none' } });

    function fail(msg) { error.textContent = msg; error.style.display = ''; }

    function submit() {
      error.style.display = 'none';
      if (next.value.length < 8) return fail('رمز جدید دست‌کم ۸ حرف باشد.');
      if (next.value !== repeat.value) return fail('رمز جدید و تکرارش یکی نیستند.');
      App.storage.api('POST', 'password', { current: current.value, next: next.value }).then(function (res) {
        if (!res.ok) return fail(res.error || 'رمز عوض نشد.');
        handle.close();
        App.toast.show('رمز عوض شد');
      });
    }

    var form = el('form', { onsubmit: function (e) { e.preventDefault(); submit(); } }, [
      el('div.field', [el('label.field__label', 'رمز فعلی'), current]),
      el('div.field', [el('label.field__label', 'رمز جدید'), next,
        el('div.field__hint', 'دست‌کم ۸ حرف. ترکیب حروف و عدد امن‌تر است.')]),
      el('div.field', [el('label.field__label', 'تکرار رمز جدید'), repeat]),
      error,
      el('button', { type: 'submit', style: { display: 'none' } })
    ]);

    var handle = App.modal.open({
      title: 'تغییر رمز ورود',
      narrow: true,
      body: form,
      footer: [
        el('button.btn', { type: 'button', onclick: submit }, 'ذخیره'),
        el('button.btn-ghost', { type: 'button', onclick: function () { handle.close(); } }, 'انصراف')
      ]
    });
  }

  // ======================================================================
  // install as an app
  // ======================================================================

  function appSection() {
    var versionRows = el('div', [
      W.sectionHead('نسخه‌ی برنامه', null, { margin: '36px 0 4px' }),
      settingRow('نسخه‌ی ' + util.toFa(App.changelog.VERSION),
        'فهرست تغییرات هر نسخه. همین پنجره بعد از هر به‌روزرسانی یک بار خودش باز می‌شود.',
        el('button.btn-ghost', {
          type: 'button',
          onclick: function () { App.whatsnew.show(App.changelog.ENTRIES, false); }
        }, 'تغییرات نسخه‌ها'))
    ]);

    if (!App.pwa.supported()) return versionRows;

    var control;
    if (App.pwa.installed()) {
      control = el('span.chip', 'نصب شده');
    } else if (App.pwa.canInstall()) {
      control = el('button.btn', {
        type: 'button',
        onclick: function () { App.pwa.install().then(function () { App.view.refresh(); }); }
      }, 'نصب روی این دستگاه');
    } else {
      control = el('span.hint', { style: { 'max-width': '240px', display: 'block' } },
        'در iPhone: دکمه‌ی Share ← «Add to Home Screen». در اندروید و ویندوز: منوی مرورگر ← ' +
        '«Install app» یا «Add to Home screen».');
    }

    return el('div', [
      versionRows,
      W.sectionHead('نصب برنامه', null, { margin: '36px 0 4px' }),
      settingRow('نصب روی دستگاه',
        'داشبورد را مثل یک برنامه‌ی معمولی روی صفحه‌ی گوشی یا دسکتاپ بگذار: آیکون خودش، ' +
        'تمام‌صفحه و بدون نوار آدرس مرورگر. فایل‌های برنامه ذخیره می‌شوند تا بدون اینترنت هم باز شود ' +
        '(برای دیدن و ذخیره‌ی داده‌ها همچنان به اینترنت نیاز است).',
        control)
    ]);
  }

  // ======================================================================
  // sections on and off
  // ======================================================================

  /*
   * Not everyone wants all of it. Someone who keeps their accounts elsewhere
   * should not have to look at a money page forever.
   *
   * Switching a section off hides its page, its cards on the home page and its
   * reminders. It never deletes anything: the records stay in the database and
   * in every export, and switching it back on brings the page back exactly as
   * it was.
   */
  function modulesSection(s) {
    var on = s.modules || {};
    var hidden = schema.MODULES.filter(function (m) { return on[m.id] === false; });

    return el('div', [
      W.sectionHead('بخش‌ها', null, { margin: '36px 0 4px' }),
      el('p.hint.mt-8', 'هر بخشی را که لازم نداری خاموش کن تا از منو و صفحه‌ی خانه برداشته شود. ' +
        'داده‌هایش پاک نمی‌شود — هر وقت دوباره روشنش کنی سر جایش است.'),
      el('div.modules.mt-16', schema.MODULES.map(function (m) { return moduleRow(m, on); })),
      hidden.length
        ? el('div.hint.mt-12', util.toFa(hidden.length) + ' بخش خاموش است: ' +
            hidden.map(function (m) { return m.label; }).join('، '))
        : null
    ]);
  }

  function moduleRow(m, on) {
    var enabled = on[m.id] !== false;
    var id = 'module-' + m.id;
    var box = el('input', {
      type: 'checkbox', id: id,
      onchange: function () { toggleModule(m, box.checked); }
    });
    box.checked = enabled;

    var count = m.pages.reduce(function (n, page) {
      return n + recordsOfPage(page);
    }, 0);

    return el('div.modules__row' + (enabled ? '' : '.is-off'), [
      box,
      el('label.modules__label', { for: id }, m.label),
      el('span.modules__count', count ? util.toFa(count) + ' رکورد' : '')
    ]);
  }

  /** Roughly how much would be hidden — enough to stop an accidental switch. */
  var PAGE_COLLECTIONS = {
    goals: ['goals', 'projects', 'tasks'],
    money: ['accounts', 'transactions', 'recurrings'],
    notes: ['notes'],
    learning: ['courses'],
    people: ['people'],
    car: ['vehicles', 'services', 'insurances']
  };

  function recordsOfPage(page) {
    return (PAGE_COLLECTIONS[page] || []).reduce(function (n, name) {
      return n + db.count(name);
    }, 0);
  }

  function toggleModule(m, enabled) {
    var next = util.deepClone(db.settings().modules || {});
    next[m.id] = enabled;

    var patch = { modules: next };
    // Do not leave the start page pointing at something that is now hidden.
    if (!enabled && m.pages.indexOf(db.settings().startPage) !== -1) {
      patch.startPage = 'home';
    }
    db.setSettings(patch);
    App.toast.show(enabled ? m.label + ' روشن شد' : m.label + ' خاموش شد — داده‌هایش سر جایش است');
  }

  // ======================================================================
  // vault
  // ======================================================================

  /*
   * Only the settings that belong here: the rest of the vault lives on its own
   * page, because everything it does needs the master password, which this
   * page never asks for.
   */
  function vaultSection(s) {
    var state = App.vault.state();
    var label = state === 'open' ? 'باز است'
      : state === 'locked' ? 'قفل است'
      : state === 'absent' ? 'ساخته نشده'
      : 'در دسترس نیست';

    return el('div', [
      W.sectionHead('محرمانه', null, { margin: '36px 0 4px' }),
      settingRow('وضعیت گاوصندوق',
        'شماره‌کارت‌ها و رمزهای سایت‌ها در بخش «محرمانه» نگه داشته می‌شوند و پیش از ذخیره ' +
        'داخل همین مرورگر رمزنگاری می‌شوند. رمز اصلی هیچ‌وقت به سرور نمی‌رود و قابل بازیابی نیست.',
        el('div.setting-row__stack', [
          el('span.chip' + (state === 'open' ? '.chip--on' : '.chip--mute'), label),
          el('button.btn-ghost', {
            type: 'button', onclick: function () { App.view.go('vault'); }
          }, 'رفتن به محرمانه')
        ])),
      state === 'unsupported' ? null : settingRow('قفل خودکار',
        'اگر این مدت دست به برنامه نزنی، گاوصندوق خودش قفل می‌شود و رمز اصلی دوباره لازم است. ' +
        'صفر یعنی فقط دستی قفل شود.',
        minutesControl(s.vaultLockMinutes))
    ]);
  }

  function minutesControl(value) {
    var current = Number(value);
    if (!isFinite(current) || current < 0) current = 10;
    return select([
      { value: '0', label: 'فقط دستی' },
      { value: '2', label: '۲ دقیقه' },
      { value: '5', label: '۵ دقیقه' },
      { value: '10', label: '۱۰ دقیقه' },
      { value: '30', label: '۳۰ دقیقه' },
      { value: '60', label: '۱ ساعت' }
    ], String(current), function (v) {
      save({ vaultLockMinutes: Number(v) });
      App.vault.touch();
    }, '160px');
  }

  // ======================================================================
  // shared controls
  // ======================================================================

  function settingRow(title, desc, control) {
    return el('div.setting-row', [
      el('div.setting-row__body', [
        el('div.setting-row__title', title),
        el('div.setting-row__desc', desc)
      ]),
      el('div.setting-row__control', control)
    ]);
  }

  function textControl(value, onSave) {
    var input = el('input.input', {
      type: 'text', style: { width: '220px' },
      onblur: function () { if (input.value !== value) onSave(input.value); },
      onkeydown: function (e) { if (e.key === 'Enter') input.blur(); }
    });
    input.value = value || '';
    return input;
  }

  function numberControl(value, onSave) {
    var input = el('input.input.input--mono', {
      type: 'text', dir: 'ltr', inputmode: 'numeric', style: { width: '160px' },
      onblur: function () {
        var n = util.parseNum(input.value);
        if (n === null || isNaN(n) || n < 0) {
          App.toast.error('عدد معتبر بنویس');
          input.value = value;
          return;
        }
        if (n !== value) onSave(n);
      },
      onkeydown: function (e) { if (e.key === 'Enter') input.blur(); }
    });
    input.value = value == null ? '' : String(value);
    return input;
  }

  function startPageControl(current) {
    return select(App.view.pageList().map(function (p) { return { value: p.id, label: p.label }; }),
      current || 'home',
      function (v) {
        db.setSettings({ startPage: v });
        App.toast.show('ذخیره شد');
      }, '220px');
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  // ---- import ----------------------------------------------------------

  function importControl() {
    var input = el('input', {
      type: 'file', accept: 'application/json,.json',
      style: { display: 'none' },
      onchange: function () {
        var file = input.files && input.files[0];
        input.value = '';           // allow re-picking the same file
        if (file) readFile(file);
      }
    });

    return el('div', { style: { display: 'flex', gap: '8px' } }, [
      input,
      el('button.btn-ghost', { type: 'button', onclick: function () { input.click(); } },
        'انتخاب فایل JSON')
    ]);
  }

  function readFile(file) {
    if (file.size > 20 * 1024 * 1024) {
      App.toast.error('فایل خیلی بزرگ است.');
      return;
    }
    var reader = new FileReader();
    reader.onerror = function () { App.toast.error('فایل خوانده نشد.'); };
    reader.onload = function () {
      var check = db.inspectImport(String(reader.result || ''));
      if (!check.ok) { App.toast.error(check.error); return; }
      askImportMode(check, file.name);
    };
    reader.readAsText(file, 'utf-8');
  }

  function askImportMode(check, filename) {
    var lines = schema.NAMES
      .filter(function (n) { return check.counts[n]; })
      .map(function (n) {
        return el('div.money-row.money-row--sub', [
          el('span.money-row__label', schema.COLLECTIONS[n].plural),
          el('span.money-row__amount', util.toFa(check.counts[n]))
        ]);
      });

    var body = el('div', [
      el('div.hint', { style: { 'margin-bottom': '12px' } },
        'فایل «' + filename + '» بررسی شد و ' + util.toFa(check.total) + ' رکورد دارد.'),
      el('div', lines),
      check.warnings.length
        ? el('div.field__error', { style: { 'margin-top': '12px' } }, check.warnings.join(' '))
        : null,
      el('div.hint', { style: { 'margin-top': '14px' } },
        'الان ' + util.toFa(db.totalRecords()) + ' رکورد داری. ' +
        '«جایگزینی» همه‌شان را پاک می‌کند؛ «افزودن» فقط رکوردهای تازه را اضافه می‌کند ' +
        'و چیزی را بازنویسی نمی‌کند.')
    ]);

    var handle = App.modal.open({
      title: 'وارد کردن داده‌ها',
      body: body,
      footer: [
        el('button.btn', {
          type: 'button',
          onclick: function () { handle.close(); doImport(check.parsed, 'merge'); }
        }, 'افزودن به داده‌های فعلی'),
        el('button.btn-ghost.btn-ghost--danger', {
          type: 'button',
          onclick: function () { handle.close(); confirmReplace(check.parsed); }
        }, 'جایگزینی کامل'),
        el('div.spacer'),
        el('button.btn-ghost', { type: 'button', onclick: function () { handle.close(); } }, 'انصراف')
      ]
    });
  }

  function confirmReplace(parsed) {
    App.modal.confirm({
      title: 'جایگزینی کامل؟',
      message: 'هر ' + util.toFa(db.totalRecords()) + ' رکورد فعلی پاک می‌شود و ' +
        'محتوای فایل جایش می‌نشیند. اگر خروجی نگرفته‌ای، اول انصراف بده و خروجی بگیر.',
      confirmLabel: 'جایگزین کن'
    }).then(function (yes) {
      if (yes) doImport(parsed, 'replace');
    });
  }

  function doImport(parsed, mode) {
    try {
      var result = db.applyImport(parsed, mode);
      if (mode === 'replace') {
        App.toast.show(util.toFa(result.added) + ' رکورد جایگزین شد');
      } else {
        App.toast.show(util.toFa(result.added) + ' رکورد اضافه شد' +
          (result.skipped ? ' · ' + util.toFa(result.skipped) + ' تکراری رد شد' : ''));
      }
    } catch (e) {
      console.error('[settings] import failed', e);
      App.toast.error('وارد کردن ناموفق بود: ' + e.message);
    }
  }

  // ---- clear -----------------------------------------------------------

  function clearData() {
    App.modal.confirm({
      title: 'پاک‌کردن همه‌ی داده‌ها؟',
      message: 'هر ' + util.toFa(db.totalRecords()) + ' رکورد حذف می‌شود و برگشتی ندارد.',
      confirmLabel: 'می‌دانم، پاک کن'
    }).then(function (yes) {
      if (!yes) return;
      return App.modal.confirm({
        title: 'مطمئنی؟',
        message: 'آخرین فرصت. اگر خروجی JSON نگرفته‌ای، همه چیز از بین می‌رود.',
        confirmLabel: 'پاک کن'
      });
    }).then(function (yes) {
      if (!yes) return;
      db.clearAll();
      App.toast.show('همه‌ی داده‌ها پاک شد');
    });
  }

  // ---- where is my data ------------------------------------------------

  function whereCard() {
    var body;
    if (isServer()) {
      body = [
        el('div', 'روی سرور سایتت، داخل پوشه‌ی '),
        el('div.mono', { style: { 'font-size': '12px', color: 'var(--accent)', margin: '4px 0 8px' }, dir: 'ltr' },
          'data/store.php'),
        el('div', 'این پوشه از بیرون قابل دسترسی نیست. نسخه‌های پشتیبان خودکار در data/backups نگه داشته می‌شوند. ' +
          'هر دستگاهی که با رمز وارد شود همین داده‌ها را می‌بیند.')
      ];
    } else {
      body = [
        el('div', 'در حافظه‌ی محلی (localStorage) همین مرورگر، زیر کلید '),
        el('div.mono', { style: { 'font-size': '12px', color: 'var(--accent)', margin: '4px 0 8px' }, dir: 'ltr' },
          App.storage.KEY),
        el('div', 'یک نسخه‌ی پشتیبان از آخرین حالت سالم هم زیر کلید ' + App.storage.KEY_PREV +
          ' نگه داشته می‌شود تا اگر فایل اصلی خراب شد، از بین نروی.'),
        el('div', { style: { 'margin-top': '8px' } },
          window.location.protocol === 'file:'
            ? 'اگر همیشه با همین مرورگر و از همین مسیر بازش کنی، داده‌ها سر جایشان می‌مانند. ' +
              'پاک‌کردن «Cookies and site data» مرورگر آن‌ها را هم پاک می‌کند.'
            : 'این نسخه روی وب باز شده ولی فایل api.php جواب نداد، پس داده‌ها فقط در همین مرورگر ذخیره می‌شوند. ' +
              'برای ذخیره روی سرور، راهنمای نصب آنلاین در README را ببین.')
      ];
    }
    return el('div.card.card--pad.card--soft.mt-30', [
      el('div', { style: { 'font-size': '13px', 'font-weight': '600', 'margin-bottom': '8px' } },
        'داده‌ها دقیقاً کجا هستند؟'),
      el('div', { style: { 'font-size': '12.5px', 'line-height': '1.9', color: 'var(--ink-2)' } }, body)
    ]);
  }

  App.pages = App.pages || {};
  App.pages.settings = {
    id: 'settings', label: 'تنظیمات و پشتیبان', group: 'سیستم', render: render
  };
})(window.App = window.App || {});
