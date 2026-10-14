/*
 * محرمانه — card numbers, site passwords and private notes.
 *
 * The page is hand-written rather than generated from schema.js, because the
 * records here must never pass through App.db: db writes the whole document
 * to the server, and that document is readable. Everything on this page goes
 * through App.vault instead, which seals the list before it is saved.
 *
 * Consequences that shape the UI:
 *   - while locked, there is nothing to show but a count, so the page is a
 *     password prompt and nothing else,
 *   - secret values are masked until asked for, one at a time,
 *   - there is no "forgot my master password" link, because there cannot be.
 */
(function (App) {
  'use strict';

  var el = App.el;
  var util = App.util;
  var J = App.jalali;
  var W = App.widgets;
  var vault = App.vault;

  var KIND_LABEL = { card: 'کارت بانکی', login: 'ورود به سایت', note: 'یادداشت محرمانه' };
  var KIND_ORDER = ['card', 'login', 'note'];

  // Kept across re-renders, like the note search.
  var query = '';
  var kindFilter = '';
  var revealed = {};     // { 'itemId:field': true } — cleared on lock

  /**
   * The extra fields each kind has, on top of the shared title / category /
   * notes. `secret: true` means masked until revealed, with a copy button.
   */
  var FIELDS = {
    card: [
      { name: 'bank', label: 'بانک', type: 'text', half: true, placeholder: 'ملت' },
      { name: 'cardNumber', label: 'شماره کارت', type: 'text', secret: true, ltr: true,
        digits: 16, group: 4, placeholder: '6104 3379 …' },
      { name: 'cardHolder', label: 'به نام', type: 'text' },
      { name: 'expiry', label: 'انقضا', type: 'text', half: true, ltr: true, placeholder: '08/05' },
      { name: 'cvv2', label: 'CVV2', type: 'text', half: true, secret: true, ltr: true },
      { name: 'pin', label: 'رمز دوم (اینترنتی)', type: 'text', secret: true, ltr: true },
      { name: 'iban', label: 'شبا', type: 'text', secret: true, ltr: true, placeholder: 'IR…' },
      { name: 'accountNo', label: 'شماره حساب', type: 'text', secret: true, ltr: true }
    ],
    login: [
      { name: 'url', label: 'نشانی سایت', type: 'url', ltr: true, placeholder: 'https://…' },
      { name: 'username', label: 'نام کاربری یا ایمیل', type: 'text', ltr: true },
      { name: 'password', label: 'رمز', type: 'text', secret: true, ltr: true, generate: true },
      { name: 'recoveryEmail', label: 'ایمیل بازیابی', type: 'text', ltr: true },
      { name: 'totpNote', label: 'یادداشت ورود دومرحله‌ای', type: 'text',
        placeholder: 'کدهای پشتیبان کجا هستند' }
    ],
    note: [
      { name: 'secret', label: 'متن محرمانه', type: 'textarea', secret: true, rows: 6 }
    ]
  };

  /** The one value shown (masked) on the row, per kind. */
  var PRIMARY = { card: 'cardNumber', login: 'password', note: 'secret' };

  // ======================================================================
  // page
  // ======================================================================

  function render() {
    var state = vault.state();

    return el('div', [
      el('div.eyebrow', 'CARDS / PASSWORDS / PRIVATE NOTES'),
      el('h1.page-title.page-title--tight', 'محرمانه'),

      state === 'unsupported' ? unsupportedCard()
        : state === 'absent' ? createCard()
        : state === 'locked' ? unlockCard()
        : openView()
    ]);
  }

  function lede(text) {
    return el('p.page-lede', text);
  }

  // ---- the three closed states -----------------------------------------

  function unsupportedCard() {
    var insecure = window.location.protocol === 'http:';
    return el('div', [
      lede('این بخش محتوایش را در همین مرورگر رمزنگاری می‌کند و فقط متن رمزشده را روی سرور می‌گذارد. ' +
        'برای رمزنگاری، مرورگر به اتصال امن نیاز دارد.'),
      el('div.card.card--pad.vault-warn', [
        el('div.vault-warn__title', insecure
          ? 'این صفحه با http باز شده است'
          : 'مرورگر از رمزنگاری پشتیبانی نمی‌کند'),
        el('div.vault-warn__body', insecure
          ? 'همان نشانی را با https باز کن. اگر با https هم همین پیام را دیدی، به من بگو.'
          : 'با یک مرورگر تازه‌تر امتحان کن — کروم، فایرفاکس، سافاری یا اج به‌روز.'),
        insecure ? el('a.btn.mt-16', { href: secureUrl() }, 'باز کردن با https') : null
      ])
    ]);
  }

  function secureUrl() {
    return 'https://' + window.location.host + window.location.pathname +
      window.location.search + window.location.hash;
  }

  function createCard() {
    var pass = passwordInput('رمز اصلی', 'vault-new');
    var again = passwordInput('یک بار دیگر', 'vault-again');
    var understood = el('input', { type: 'checkbox', id: 'vault-understood' });
    var error = el('div.field__error', { style: { display: 'none' } });
    var meter = el('div.vault-meter__text', 'هنوز چیزی نوشته نشده');
    var bar = el('div.vault-meter__fill', { style: { width: '0%' } });

    pass.input.addEventListener('input', function () {
      var s = strength(pass.input.value);
      bar.style.setProperty('width', s.pct + '%');
      bar.style.setProperty('background', s.color);
      meter.textContent = s.text;
    });

    function submit() {
      error.style.display = 'none';
      if (pass.input.value !== again.input.value) {
        return showError(error, 'دو رمز یکی نیستند.');
      }
      if (!understood.checked) {
        return showError(error, 'اول تیک پایین را بزن — این بخش راه بازیابی ندارد.');
      }
      var problem = vault.passwordProblem(pass.input.value);
      if (problem) return showError(error, problem);

      busy(button, true);
      vault.create(pass.input.value).then(function () {
        busy(button, false);
        App.toast.show('گاوصندوق ساخته شد و باز است');
        App.view.refresh();
      }, function (err) {
        busy(button, false);
        showError(error, err && err.message ? err.message : 'ساخت گاوصندوق ناموفق بود.');
      });
    }

    var button = el('button.btn', { type: 'submit' }, 'ساختن گاوصندوق');

    return el('div', [
      lede('شماره‌کارت‌ها و رمزهای سایت‌ها را اینجا نگه دار. محتوای این بخش پیش از ذخیره‌شدن، ' +
        'داخل همین مرورگر با رمز اصلی‌ات رمزنگاری می‌شود؛ روی سرور و در فایل‌های پشتیبان فقط یک ' +
        'متن نامفهوم می‌نشیند. رمز اصلی هیچ‌وقت به سرور فرستاده نمی‌شود.'),

      el('div.card.card--pad.vault-warn.vault-warn--hard', [
        el('div.vault-warn__title', 'رمز اصلی را نمی‌توان بازیابی کرد'),
        el('div.vault-warn__body', 'نه من، نه سرور، نه هیچ‌کس دیگری نمی‌تواند این رمز را بازگرداند — ' +
          'چون هیچ‌جا ذخیره نمی‌شود. اگر فراموشش کنی، محتوای گاوصندوق برای همیشه از دست می‌رود. ' +
          'یک جای مطمئن بنویسش: روی کاغذ، یا در یک برنامه‌ی مدیریت رمز.')
      ]),

      el('form.card.card--pad.mt-24.vault-form', {
        onsubmit: function (e) { e.preventDefault(); submit(); }
      }, [
        el('div', [
          pass.wrap,
          el('div.vault-meter', [el('div.vault-meter__bar', bar), meter]),
          again.wrap,
          el('div.field.field--check.mt-16', [
            understood,
            el('label.field__label', { for: 'vault-understood' },
              'می‌دانم اگر این رمز را فراموش کنم، محتوای گاوصندوق قابل بازگرداندن نیست.')
          ]),
          error,
          el('div.mt-20', [button])
        ])
      ]),

      el('div.hint.mt-16', 'پیشنهاد: رمزی جدا از رمز ورود به داشبورد انتخاب کن. ' +
        'یک جمله‌ی چهار-پنج کلمه‌ای که فقط خودت می‌دانی، از یک رمز کوتاه سخت بهتر است.')
    ]);
  }

  function unlockCard() {
    var pass = passwordInput('رمز اصلی', 'vault-unlock');
    var error = el('div.field__error', { style: { display: 'none' } });
    var button = el('button.btn', { type: 'submit' }, 'باز کردن');
    var stamp = vault.updatedAt();

    function submit() {
      error.style.display = 'none';
      busy(button, true, 'یک لحظه…');
      vault.unlock(pass.input.value).then(function () {
        busy(button, false);
        App.view.refresh();
      }, function (err) {
        busy(button, false);
        pass.input.value = '';
        pass.input.focus();
        showError(error, err && err.message ? err.message : 'باز نشد.');
      });
    }

    return el('div', [
      lede('گاوصندوق قفل است. بعد از هر بار تازه‌شدن صفحه، رمز اصلی دوباره لازم است — ' +
        'چون هیچ‌جا ذخیره نمی‌شود.'),

      el('form.card.card--pad.vault-lock', {
        onsubmit: function (e) { e.preventDefault(); submit(); }
      }, [
        el('div.vault-lock__meta', [
          el('span', util.toFa(vault.count()) + ' مورد داخل گاوصندوق'),
          stamp ? el('span.muted', 'آخرین تغییر ' + J.format(stamp.slice(0, 10), true)) : null
        ]),
        pass.wrap,
        error,
        el('div.mt-16', [button])
      ]),

      el('div.hint.mt-16', 'باز کردن قفل یک لحظه طول می‌کشد؛ این کندی عمدی است و کار حمله‌ی ' +
        'حدس‌زدن رمز را سخت می‌کند.')
    ]);
  }

  // ---- the open vault --------------------------------------------------

  function openView() {
    var all = vault.list();
    var byKind = kindFilter ? all.filter(function (i) { return i.kind === kindFilter; }) : all;
    var visible = byKind.filter(function (i) { return matchesQuery(i); });

    return el('div', [
      el('div.vault-bar', [
        el('div.vault-bar__state', [
          el('span.vault-bar__dot'),
          el('span', 'باز است'),
          el('span.muted', autoLockLabel())
        ]),
        el('div.vault-bar__tools', [
          el('button.icon-btn', {
            type: 'button', title: 'قفل کردن گاوصندوق',
            onclick: function () { revealed = {}; vault.lock(); }
          }, 'قفل کن'),
          el('button.icon-btn', {
            type: 'button', title: 'همه‌ی محتوا به‌صورت متن ساده در یک فایل Excel',
            onclick: exportPlain
          }, 'خروجی Excel'),
          el('button.icon-btn', { type: 'button', onclick: changePassword }, 'تغییر رمز اصلی')
        ])
      ]),

      kindBar(all),
      searchBar(byKind.length, visible.length),

      visible.length
        ? el('div.stack.stack--sm.mt-16', visible.map(row))
        : el('div.mt-16', W.emptyState(
            all.length ? 'چیزی با این فیلتر پیدا نشد.' : 'گاوصندوق خالی است. اولین مورد را اضافه کن.',
            null, null, true)),

      el('div.vault-add', KIND_ORDER.map(function (kind) {
        return el('button.btn-ghost', {
          type: 'button',
          onclick: function () { openEditor(blank(kind)); }
        }, KIND_LABEL[kind] + ' تازه');
      })),

      el('div.card.card--pad.card--soft.mt-30', [
        el('div.vault-note__title', 'چند نکته'),
        el('ul.vault-note__list', [
          el('li', 'این بخش در خروجی JSON هم می‌آید، ولی رمزشده — برای بازگرداندنش روی دستگاه ' +
            'دیگر به همین رمز اصلی نیاز داری.'),
          el('li', 'خروجی Excel این بخش، متن ساده است. فقط وقتی بگیر که لازم است، و بعد فایل را پاک کن.'),
          el('li', '«پاک‌کردن همه‌ی داده‌ها» در تنظیمات به گاوصندوق کاری ندارد؛ پاک‌کردنش دکمه‌ی خودش را دارد.')
        ]),
        el('div.mt-20', [
          el('button.btn-ghost.btn-ghost--danger', { type: 'button', onclick: destroyVault },
            'پاک‌کردن کل گاوصندوق')
        ])
      ])
    ]);
  }

  function autoLockLabel() {
    var n = Number(App.db.settings().vaultLockMinutes);
    if (!n) return 'قفل خودکار خاموش است';
    return 'بعد از ' + util.toFa(n) + ' دقیقه بی‌کاری خودش قفل می‌شود';
  }

  function matchesQuery(item) {
    if (!query) return true;
    return util.matches(item.title, query) ||
      util.matches(item.category, query) ||
      util.matches(item.notes, query) ||
      util.matches(item.username, query) ||
      util.matches(item.bank, query) ||
      util.matches(item.url, query);
  }

  function kindBar(all) {
    var counts = {};
    all.forEach(function (i) { counts[i.kind] = (counts[i.kind] || 0) + 1; });

    var options = [{ value: '', label: 'همه', count: all.length }].concat(
      KIND_ORDER.map(function (k) {
        return { value: k, label: KIND_LABEL[k], count: counts[k] || 0 };
      }));

    return el('div.cat-bar', [
      el('span.cat-bar__label', 'نوع'),
      el('div.cat-bar__chips', options.map(function (o) {
        var on = kindFilter === o.value;
        return el('button.cat-chip' + (on ? '.is-active' : ''), {
          type: 'button',
          onclick: function () { kindFilter = o.value; App.view.refresh(); }
        }, [o.label, el('span.cat-chip__count', util.toFa(o.count))]);
      }))
    ]);
  }

  function searchBar(total, shown) {
    var input = el('input.search__input', {
      type: 'search', placeholder: 'جست‌وجو در عنوان، دسته، نام کاربری…',
      'data-focus-key': 'vault-search',
      oninput: function () { query = input.value; App.view.refresh(); }
    });
    input.value = query;

    return el('div.search', [
      el('span.eyebrow', 'SEARCH'),
      input,
      el('span.num.muted', { style: { 'font-size': '12px' } },
        query ? util.toFa(shown) + ' از ' + util.toFa(total) : util.toFa(total)),
      query ? el('button.icon-btn', {
        type: 'button', onclick: function () { query = ''; App.view.refresh(); }
      }, 'پاک‌کردن') : null
    ]);
  }

  // ---- one row ---------------------------------------------------------

  function row(item) {
    var primary = PRIMARY[item.kind];
    var value = item[primary] || '';
    var key = item.id + ':' + primary;
    var shown = !!revealed[key];

    return el('div.vault-row.row', [
      el('div.vault-row__main', {
        style: { cursor: 'pointer' },
        onclick: function (e) {
          if (e.target.closest('.vault-row__secret') || e.target.closest('.row-actions')) return;
          openEditor(item);
        }
      }, [
        el('div.vault-row__title', [
          item.title || 'بی‌عنوان',
          el('span.vault-row__kind', KIND_LABEL[item.kind])
        ]),
        el('div.vault-row__meta', [
          W.categoryTag(item.category),
          subtitle(item) ? el('span.vault-row__sub', { dir: 'ltr' }, subtitle(item)) : null
        ])
      ]),

      value
        ? el('div.vault-row__secret', [
            el('code.vault-secret' + (shown ? '.is-shown' : ''), { dir: 'ltr' },
              shown ? display(item, primary) : mask(value, primary === 'cardNumber')),
            el('button.icon-btn', {
              type: 'button', title: shown ? 'پنهان کن' : 'نمایش بده',
              onclick: function () {
                if (shown) delete revealed[key]; else revealed[key] = true;
                App.view.refresh();
              }
            }, shown ? 'پنهان' : 'نمایش'),
            el('button.icon-btn', {
              type: 'button', title: 'کپی در کلیپ‌بورد',
              onclick: function (e) { copy(value, e.currentTarget); }
            }, 'کپی')
          ])
        : null,

      W.rowActions(function () { openEditor(item); }, function () { destroyItem(item); })
    ]);
  }

  function subtitle(item) {
    if (item.kind === 'card') return item.bank || item.cardHolder || '';
    if (item.kind === 'login') return item.username || hostOf(item.url);
    return '';
  }

  function hostOf(url) {
    var m = /^https?:\/\/([^/?#]+)/i.exec(String(url || ''));
    return m ? m[1] : '';
  }

  /**
   * The masked form. A card number keeps its last four digits, the way a bank
   * statement does — that is how you tell two cards apart without revealing
   * either. Everything else, passwords above all, is dotted completely: the
   * tail of a password is as secret as the rest of it.
   */
  function mask(value, keepTail) {
    var s = String(value || '').replace(/\s+/g, '');
    if (keepTail && s.length > 8) return '•••• •••• •••• ' + s.slice(-4);
    return new Array(Math.min(Math.max(s.length, 1), 12) + 1).join('•');
  }

  function display(item, field) {
    var spec = fieldSpec(item.kind, field);
    var raw = String(item[field] || '');
    if (spec && spec.group) return grouped(raw, spec.group);
    return raw;
  }

  function grouped(value, size) {
    var s = String(value || '').replace(/\s+/g, '');
    var out = [];
    for (var i = 0; i < s.length; i += size) out.push(s.substr(i, size));
    return out.join(' ');
  }

  function fieldSpec(kind, name) {
    var list = FIELDS[kind] || [];
    for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
    return null;
  }

  // ======================================================================
  // editor
  // ======================================================================

  function blank(kind) {
    return { kind: kind, title: '', category: W.activeCategory('vault') || '', notes: '' };
  }

  function openEditor(item) {
    var isNew = !item.id;
    var controls = {};
    var error = el('div.field__error', { style: { display: 'none' } });

    var specs = [
      { name: 'title', label: 'عنوان', type: 'text', required: true,
        placeholder: item.kind === 'card' ? 'کارت ملت — حساب اصلی' : 'جیمیل' },
      { name: 'category', label: 'دسته', type: 'category', half: true }
    ].concat(FIELDS[item.kind] || [])
      .concat([{ name: 'notes', label: 'یادداشت', type: 'textarea', rows: 3 }]);

    var fieldNodes = layout(specs.map(function (spec) {
      if (spec.type === 'category') return { spec: spec, wrap: categoryPicker(item, controls) };
      if (spec.type === 'textarea') return { spec: spec, wrap: textareaField(spec, item, controls) };
      return { spec: spec, wrap: textField(spec, item, controls) };
    }));

    function read() {
      var out = {
        id: item.id, kind: item.kind,
        createdAt: item.createdAt, updatedAt: item.updatedAt
      };
      Object.keys(controls).forEach(function (name) { out[name] = controls[name].get(); });
      return out;
    }

    function submit() {
      error.style.display = 'none';
      var values = read();
      if (!util.trim(values.title)) return showError(error, 'عنوان لازم است.');

      var problem = validate(values);
      if (problem) return showError(error, problem);

      busy(saveBtn, true);
      vault.put(values).then(function () {
        busy(saveBtn, false);
        handle.close();
        App.toast.show(isNew ? 'اضافه شد' : 'ذخیره شد');
        App.view.refresh();
      }, function (err) {
        busy(saveBtn, false);
        showError(error, err && err.message ? err.message : 'ذخیره نشد.');
      });
    }

    var saveBtn = el('button.btn', { type: 'button', onclick: submit },
      isNew ? 'اضافه کن' : 'ذخیره');

    var handle = App.modal.open({
      title: (isNew ? KIND_LABEL[item.kind] + ' تازه' : item.title || KIND_LABEL[item.kind]),
      sub: isNew ? null : 'ساخته‌شده ' + J.format(String(item.createdAt || '').slice(0, 10), true),
      body: el('form', {
        onsubmit: function (e) { e.preventDefault(); submit(); },
        onkeydown: function (e) {
          var isTextarea = e.target && e.target.tagName === 'TEXTAREA';
          if (e.key === 'Enter' && isTextarea && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
        }
      }, fieldNodes.concat([error])),
      footer: [
        saveBtn,
        el('button.btn-ghost', { type: 'button', onclick: function () { handle.close(); } }, 'انصراف'),
        el('div.spacer'),
        isNew ? null : el('button.btn-ghost.btn-ghost--danger', {
          type: 'button',
          onclick: function () { handle.close(); destroyItem(item); }
        }, 'حذف')
      ]
    });
  }

  /** Put consecutive short fields on one row, exactly like the schema forms. */
  function layout(built) {
    var out = [];
    var pending = null;
    built.forEach(function (b) {
      if (b.spec.half) {
        if (pending) { out.push(el('div.field--row', [pending, b.wrap])); pending = null; }
        else pending = b.wrap;
      } else {
        if (pending) { out.push(pending); pending = null; }
        out.push(b.wrap);
      }
    });
    if (pending) out.push(pending);
    return out;
  }

  function validate(values) {
    if (values.kind === 'card' && values.cardNumber) {
      var digits = util.toEn(values.cardNumber).replace(/[\s-]/g, '');
      if (!/^\d{12,19}$/.test(digits)) return 'شماره کارت باید فقط رقم باشد (۱۶ رقم برای کارت‌های ایرانی).';
    }
    if (values.kind === 'login' && values.url) {
      var u = util.trim(values.url);
      if (u && !/^https?:\/\//i.test(u)) values.url = 'https://' + u;
      if (!util.safeUrl(values.url)) return 'نشانی سایت معتبر نیست.';
    }
    return null;
  }

  // ---- fields ----------------------------------------------------------

  function fieldId(name) { return 'vault-f-' + name; }

  function textField(spec, item, controls) {
    var id = fieldId(spec.name);
    var secret = !!spec.secret;
    var input = el('input.input', {
      id: id,
      type: 'text',
      dir: spec.ltr ? 'ltr' : null,
      inputmode: spec.digits ? 'numeric' : null,
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: spec.placeholder || null,
      'data-focus-key': 'vault-' + spec.name
    });
    input.value = spec.name === 'cardNumber'
      ? grouped(item[spec.name] || '', 4)
      : (item[spec.name] == null ? '' : String(item[spec.name]));

    if (secret) input.classList.add('input--secret');

    var tools = [];
    if (secret) {
      var shown = false;
      var toggle = el('button.icon-btn', {
        type: 'button', title: 'نمایش / پنهان',
        onclick: function () {
          shown = !shown;
          input.classList.toggle('input--secret', !shown);
          toggle.textContent = shown ? 'پنهان' : 'نمایش';
        }
      }, 'نمایش');
      tools.push(toggle);
      tools.push(el('button.icon-btn', {
        type: 'button', title: 'کپی',
        onclick: function (e) { copy(input.value, e.currentTarget); }
      }, 'کپی'));
    }
    if (spec.generate) {
      tools.push(el('button.icon-btn', {
        type: 'button', title: 'ساخت یک رمز تازه‌ی تصادفی',
        onclick: function () {
          input.value = generatePassword();
          input.classList.remove('input--secret');
        }
      }, 'ساختن'));
    }

    controls[spec.name] = {
      get: function () {
        var v = util.trim(input.value);
        if (spec.digits) v = util.toEn(v).replace(/[\s-]/g, '');
        return v;
      }
    };

    return el('div.field', [
      el('label.field__label', { for: id }, [
        spec.label,
        spec.required ? el('span.field__req', ' *') : null
      ]),
      tools.length ? el('div.input-group', [input].concat(tools)) : input
    ]);
  }

  function textareaField(spec, item, controls) {
    var id = fieldId(spec.name);
    var box = el('textarea.textarea', {
      id: id, rows: String(spec.rows || 4), autocomplete: 'off', spellcheck: 'false'
    });
    box.value = item[spec.name] == null ? '' : String(item[spec.name]);
    controls[spec.name] = { get: function () { return box.value.replace(/\s+$/, ''); } };
    return el('div.field', [el('label.field__label', { for: id }, spec.label), box]);
  }

  function categoryPicker(item, controls) {
    var id = fieldId('category');
    var select = el('select.select', { id: id });
    var current = item.category || '';
    var items = App.categories.list('vault');
    if (current && items.indexOf(current) === -1) items.push(current);

    select.appendChild(el('option', { value: '' }, 'بدون دسته'));
    items.forEach(function (c) { select.appendChild(el('option', { value: c }, c)); });
    select.value = current;

    controls.category = { get: function () { return select.value; } };
    return el('div.field', [el('label.field__label', { for: id }, 'دسته'), select]);
  }

  // ---- actions ---------------------------------------------------------

  function destroyItem(item) {
    App.modal.confirm({
      title: 'حذف «' + (item.title || 'بی‌عنوان') + '»؟',
      message: 'این مورد از گاوصندوق پاک می‌شود و برنمی‌گردد.',
      confirmLabel: 'حذف کن'
    }).then(function (yes) {
      if (!yes) return;
      vault.remove(item.id).then(function () {
        App.toast.show('حذف شد');
        App.view.refresh();
      }, function (err) {
        App.toast.error(err && err.message ? err.message : 'حذف نشد.');
      });
    });
  }

  function destroyVault() {
    App.modal.confirm({
      title: 'کل گاوصندوق پاک شود؟',
      message: 'هر ' + util.toFa(vault.count()) + ' مورد داخلش پاک می‌شود و رمز اصلی فعلی بی‌اثر ' +
        'می‌شود. اگر پشتیبان JSON قدیمی داری، از آن قابل بازگرداندن است — وگرنه برنمی‌گردد.',
      confirmLabel: 'پاک کن'
    }).then(function (yes) {
      if (!yes) return;
      vault.destroy().then(function () {
        revealed = {};
        App.toast.show('گاوصندوق پاک شد');
        App.view.refresh();
      });
    });
  }

  function changePassword() {
    var next = passwordInput('رمز اصلی تازه', 'vault-next');
    var again = passwordInput('یک بار دیگر', 'vault-next2');
    var error = el('div.field__error', { style: { display: 'none' } });
    var button = el('button.btn', { type: 'button' }, 'تغییر بده');

    function submit() {
      error.style.display = 'none';
      if (next.input.value !== again.input.value) return showError(error, 'دو رمز یکی نیستند.');
      var problem = vault.passwordProblem(next.input.value);
      if (problem) return showError(error, problem);

      busy(button, true);
      vault.changePassword(next.input.value).then(function () {
        busy(button, false);
        handle.close();
        App.toast.show('رمز اصلی عوض شد');
      }, function (err) {
        busy(button, false);
        showError(error, err && err.message ? err.message : 'تغییر نکرد.');
      });
    }

    button.addEventListener('click', submit);

    var handle = App.modal.open({
      narrow: true,
      title: 'تغییر رمز اصلی',
      sub: 'محتوای گاوصندوق با رمز تازه دوباره رمزنگاری می‌شود. رمز قبلی از همان لحظه بی‌اثر است.',
      body: el('form', { onsubmit: function (e) { e.preventDefault(); submit(); } },
        [next.wrap, again.wrap, error]),
      footer: [
        button,
        el('button.btn-ghost', { type: 'button', onclick: function () { handle.close(); } }, 'انصراف')
      ]
    });
  }

  /** Plain-text Excel export — deliberately behind a confirmation. */
  function exportPlain() {
    App.modal.confirm({
      title: 'خروجی Excel از گاوصندوق؟',
      message: 'این فایل شماره‌کارت‌ها و رمزها را به‌صورت متن ساده و بدون رمزنگاری دارد. ' +
        'هر کسی که فایل را داشته باشد همه را می‌بیند. بعد از استفاده پاکش کن.',
      confirmLabel: 'می‌خواهم',
      danger: true
    }).then(function (yes) {
      if (!yes) return;
      try {
        App.exporter.vaultExcel();
      } catch (e) {
        App.toast.error('ساخت فایل ناموفق بود: ' + e.message);
      }
    });
  }

  // ---- small shared bits -----------------------------------------------

  function passwordInput(label, id) {
    var input = el('input.input', {
      id: id, type: 'password', autocomplete: 'new-password',
      spellcheck: 'false', dir: 'ltr'
    });
    var toggle = el('button.icon-btn.reveal', {
      type: 'button', 'aria-label': 'نمایش رمز',
      onclick: function () {
        var showing = input.getAttribute('type') === 'text';
        input.setAttribute('type', showing ? 'password' : 'text');
        toggle.textContent = showing ? 'نمایش' : 'پنهان';
        input.focus();
      }
    }, 'نمایش');

    return {
      input: input,
      wrap: el('div.field', [
        el('label.field__label', { for: id }, label),
        el('div.input-group', [input, toggle])
      ])
    };
  }

  function showError(node, message) {
    node.textContent = message;
    node.style.display = '';
  }

  function busy(button, on, label) {
    button.disabled = !!on;
    if (on) {
      button.setAttribute('data-label', button.textContent);
      button.textContent = label || 'یک لحظه…';
    } else if (button.getAttribute('data-label')) {
      button.textContent = button.getAttribute('data-label');
      button.removeAttribute('data-label');
    }
  }

  function copy(text, button) {
    var value = String(text || '');
    if (!value) return;

    function done() {
      App.toast.show('کپی شد');
      if (!button) return;
      var was = button.textContent;
      button.textContent = 'کپی شد';
      window.setTimeout(function () { button.textContent = was; }, 1500);
    }

    if (window.navigator.clipboard && window.navigator.clipboard.writeText) {
      window.navigator.clipboard.writeText(value).then(done, fallback);
    } else {
      fallback();
    }

    function fallback() {
      var box = el('textarea', { style: { position: 'fixed', top: '-1000px', opacity: '0' } });
      box.value = value;
      document.body.appendChild(box);
      box.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(box);
      if (ok) done();
      else App.toast.error('کپی نشد — خودت انتخاب و کپی کن.');
    }
  }

  /**
   * A strong password from the browser's own randomness.
   *
   * Bytes whose value would make some letters likelier than others are thrown
   * away rather than folded in with a modulo, so every character really is
   * uniform over the alphabet.
   */
  function generatePassword() {
    var alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%*-_=+';
    var limit = 256 - (256 % alphabet.length);
    var out = '';
    while (out.length < 20) {
      var bytes = App.crypt.randomBytes(24);
      for (var i = 0; i < bytes.length && out.length < 20; i++) {
        if (bytes[i] >= limit) continue;
        out += alphabet[bytes[i] % alphabet.length];
      }
    }
    return out;
  }

  /** A rough, honest hint — not a score anyone should trust precisely. */
  function strength(password) {
    var p = String(password || '');
    if (!p) return { pct: 0, color: 'var(--line)', text: 'هنوز چیزی نوشته نشده' };

    var classes = 0;
    if (/[a-z]/.test(p)) classes++;
    if (/[A-Z]/.test(p)) classes++;
    if (/[0-9۰-۹]/.test(p)) classes++;
    if (/[^\w\s]/.test(p)) classes++;
    if (/\s/.test(p)) classes++;

    var score = Math.min(100, p.length * 5 + classes * 10);
    if (p.length < 10) return { pct: Math.max(12, score), color: 'var(--neg)', text: 'کوتاه است — دست‌کم ۱۰ کاراکتر' };
    if (score < 55) return { pct: score, color: 'var(--neg)', text: 'ضعیف — بلندترش کن' };
    if (score < 80) return { pct: score, color: 'var(--accent)', text: 'قابل قبول' };
    return { pct: score, color: 'var(--pos)', text: 'خوب' };
  }

  // Locking from anywhere (idle timer, logout) has to repaint the page.
  vault.onChange(function (state) {
    if (state !== 'open') revealed = {};
  });

  App.pages = App.pages || {};
  App.pages.vault = {
    id: 'vault', label: 'محرمانه', group: 'محرمانه', render: render,
    FIELDS: FIELDS, KIND_LABEL: KIND_LABEL, KIND_ORDER: KIND_ORDER
  };
})(window.App = window.App || {});
