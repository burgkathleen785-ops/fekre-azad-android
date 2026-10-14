/*
 * Accounts — sign in, join with an invite code, first-run owner setup, and
 * the screens shown while the dashboard cannot open yet.
 *
 * All of these render into #gate, which stands in place of the dashboard
 * shell until the data has loaded. Only used in server mode.
 *
 * Every account has its own dashboard; nothing here decides what a person
 * may see. The server does that from the signed-in account alone.
 */
(function (App) {
  'use strict';

  var el = App.el;
  var dom = App.dom;

  var session = null;      // the signed-in account, as the server describes it

  function gateHost() { return document.getElementById('gate'); }

  function showGate(node) {
    var host = gateHost();
    dom.clear(host);
    host.appendChild(node);
    host.hidden = false;
    document.querySelector('.shell').hidden = true;
  }

  function hideGate() {
    var host = gateHost();
    dom.clear(host);
    host.hidden = true;
    document.querySelector('.shell').hidden = false;
  }

  function card(title, lede, children, footer) {
    return el('div.gate-card', [
      App.logo.lockup({ size: 40 }),
      el('h1.gate-card__title', title),
      lede ? el('p.gate-card__lede', lede) : null,
      children,
      footer ? el('div.gate-card__foot', footer) : null
    ]);
  }

  function loading(message) {
    showGate(el('div.gate-loading', [
      App.logo.mark(26, { ink: 'var(--muted)', accent: 'var(--accent)' }),
      el('div.gate-spinner', { 'aria-hidden': 'true' }),
      el('div', message || 'در حال بارگذاری…')
    ]));
  }

  /** A retry screen. Never offers to "continue offline" — that would split the data. */
  function failure(title, detail) {
    showGate(card(title,
      'داده‌هایت سر جایشان روی سرور هستند؛ فقط الان به آن‌ها دسترسی ندارم.', [
        detail ? el('div.field__error', { style: { 'margin-bottom': '14px' } }, detail) : null,
        el('div', { style: { display: 'flex', gap: '10px' } }, [
          el('button.btn', { type: 'button', onclick: function () { window.location.reload(); } }, 'تلاش دوباره')
        ])
      ]));
  }

  function formError() {
    return el('div.field__error', { style: { display: 'none', 'margin-bottom': '12px' }, role: 'alert' });
  }

  /** Password box with a show/hide toggle — fewer failed logins on phones. */
  function passwordField(label, id, autocomplete, hint) {
    var input = el('input.input.input--ltr', {
      id: id, type: 'password', dir: 'ltr', autocomplete: autocomplete, required: true
    });
    var toggle = el('button.reveal', {
      type: 'button', 'aria-label': 'نمایش رمز', title: 'نمایش رمز',
      onclick: function () {
        var shown = input.type === 'text';
        input.type = shown ? 'password' : 'text';
        toggle.textContent = shown ? 'نمایش' : 'پنهان';
        toggle.setAttribute('aria-label', shown ? 'نمایش رمز' : 'پنهان کردن رمز');
        input.focus();
      }
    }, 'نمایش');

    var wrap = el('div.field', [
      el('label.field__label', { for: id }, label),
      el('div.input-group', [input, toggle]),
      hint ? el('div.field__hint', hint) : null
    ]);
    return { wrap: wrap, input: input };
  }

  function textField(label, id, opts) {
    opts = opts || {};
    var input = el('input.input' + (opts.ltr ? '.input--ltr' : ''), {
      id: id, type: 'text', dir: opts.ltr ? 'ltr' : null,
      autocomplete: opts.autocomplete || 'off', spellcheck: 'false',
      placeholder: opts.placeholder || '', required: !opts.optional
    });
    if (opts.value) input.value = opts.value;
    return {
      wrap: el('div.field', [
        el('label.field__label', { for: id }, label),
        input,
        opts.hint ? el('div.field__hint', opts.hint) : null
      ]),
      input: input
    };
  }

  function setBusy(button, busy, label) {
    button.disabled = busy;
    button.textContent = busy ? 'صبر کن…' : label;
  }

  /** An invite code may arrive as ?invite=… or #/join/… from a shared link. */
  function inviteFromUrl() {
    var q = new RegExp('[?&]invite=([^&#]+)').exec(window.location.search);
    if (q) return decodeURIComponent(q[1]);
    var h = /#\/join\/([^/?&]+)/.exec(window.location.hash);
    return h ? decodeURIComponent(h[1]) : '';
  }

  function clearInviteFromUrl() {
    if (!window.history.replaceState) return;
    var clean = window.location.pathname + window.location.hash.replace(/#\/join\/[^/?&]+/, '');
    try { window.history.replaceState(null, '', clean); } catch (e) { /* ignore */ }
  }

  /**
   * Resolves once someone is signed in. `status` comes from api.php
   * ?action=status: { configured, authenticated, user, migrated, error }.
   */
  function gate(status) {
    if (status && status.error) {
      failure('سرور آماده نیست', status.error);
      return new Promise(function () {});   // stays on the error screen
    }
    if (status && status.authenticated) {
      session = status.user || null;
      return Promise.resolve();
    }
    return new Promise(function (resolve) {
      var done = function (user) {
        session = user || null;
        clearInviteFromUrl();
        resolve();
      };
      if (status && !status.configured) ownerSetupScreen(done);
      else if (inviteFromUrl()) joinScreen(done, inviteFromUrl());
      else loginScreen(done, status);
    });
  }

  // ---- first run: the owner account ---------------------------------------

  function ownerSetupScreen(done) {
    var code = textField('کد راه‌اندازی', 'setup-code',
      { ltr: true, hint: 'کدی که در فایل config.php نوشته شده. فقط همین یک بار، برای ساخت حساب مدیر.' });
    var name = textField('نام کاربری', 'setup-user',
      { ltr: true, placeholder: 'mina', hint: '۳ تا ۳۲ حرف انگلیسی، عدد، نقطه یا خط تیره. با همین وارد می‌شوی.' });
    var pass = passwordField('رمز ورود', 'setup-pass', 'new-password', 'دست‌کم ۸ حرف.');
    var repeat = passwordField('تکرار رمز', 'setup-repeat', 'new-password');
    var error = formError();
    var button = el('button.btn', { type: 'submit' }, 'ساخت حساب مدیر');

    function fail(msg) { error.textContent = msg; error.style.display = ''; }

    var form = el('form', {
      onsubmit: function (e) {
        e.preventDefault();
        error.style.display = 'none';
        if (pass.input.value !== repeat.input.value) return fail('رمز و تکرارش یکی نیستند.');
        setBusy(button, true, 'ساخت حساب مدیر');
        App.storage.api('POST', 'bootstrap', {
          code: code.input.value, username: name.input.value, password: pass.input.value
        }).then(function (res) {
          setBusy(button, false, 'ساخت حساب مدیر');
          if (!res.ok) return fail(res.error || 'راه‌اندازی انجام نشد.');
          done(res.user);
        });
      }
    }, [code.wrap, name.wrap, pass.wrap, repeat.wrap, error, button]);

    showGate(card('ساخت حساب مدیر',
      'این اولین حساب است — حساب خودت. بعد از این، هر کس دیگری با کد دعوتی که تو برایش می‌سازی وارد می‌شود.',
      form));
    code.input.focus();
  }

  // ---- joining with a personal invite --------------------------------------

  function joinScreen(done, prefill) {
    var code = textField('کد دعوت', 'join-code',
      { ltr: true, value: prefill || '', placeholder: 'FA-XXXX-XXXX-XXXX',
        hint: 'کدی که برایت فرستاده شده. فقط یک بار و فقط برای همین حساب کار می‌کند.' });
    var name = textField('نام کاربری', 'join-user',
      { ltr: true, placeholder: 'reza', hint: '۳ تا ۳۲ حرف انگلیسی، عدد، نقطه یا خط تیره.' });
    var display = textField('نام نمایشی', 'join-display', { optional: true, placeholder: 'رضا' });
    var pass = passwordField('رمز ورود', 'join-pass', 'new-password', 'دست‌کم ۸ حرف. جایی امن نگهش دار.');
    var repeat = passwordField('تکرار رمز', 'join-repeat', 'new-password');
    var error = formError();
    var button = el('button.btn', { type: 'submit' }, 'ساخت حساب');

    function fail(msg) { error.textContent = msg; error.style.display = ''; }

    var form = el('form', {
      onsubmit: function (e) {
        e.preventDefault();
        error.style.display = 'none';
        if (pass.input.value !== repeat.input.value) return fail('رمز و تکرارش یکی نیستند.');
        setBusy(button, true, 'ساخت حساب');
        App.storage.api('POST', 'register', {
          invite: code.input.value, username: name.input.value,
          displayName: display.input.value, password: pass.input.value
        }).then(function (res) {
          setBusy(button, false, 'ساخت حساب');
          if (!res.ok) return fail(res.error || 'حساب ساخته نشد.');
          done(res.user);
        });
      }
    }, [code.wrap, name.wrap, display.wrap, pass.wrap, repeat.wrap, error, button]);

    showGate(card('ساخت حساب تازه',
      'داشبورد خودت را می‌سازی: داده‌هایت جدا از بقیه است و فقط با همین حساب دیده می‌شود.',
      form,
      [el('button.linkish', { type: 'button', onclick: function () { loginScreen(done); } }, 'قبلاً حساب دارم — ورود')]));
    (prefill ? name.input : code.input).focus();
  }

  // ---- signing in ----------------------------------------------------------

  function loginScreen(done, status) {
    var name = textField('نام کاربری', 'login-user', { ltr: true, autocomplete: 'username' });
    var pass = passwordField('رمز ورود', 'login-pass', 'current-password');
    var error = formError();
    var button = el('button.btn', { type: 'submit' }, 'ورود');

    var form = el('form', {
      onsubmit: function (e) {
        e.preventDefault();
        error.style.display = 'none';
        setBusy(button, true, 'ورود');
        App.storage.api('POST', 'login', {
          username: name.input.value, password: pass.input.value
        }).then(function (res) {
          setBusy(button, false, 'ورود');
          if (!res.ok) {
            error.textContent = res.error || 'ورود انجام نشد.';
            error.style.display = '';
            pass.input.select();
            return;
          }
          done(res.user);
        });
      }
    }, [
      name.wrap, pass.wrap,
      (status && status.migrated)
        ? el('div.field__hint', { style: { 'margin-bottom': '12px' } },
            'از نسخه‌ی قبلی می‌آیی؟ نام کاربری حساب قدیمی «owner» است و رمزش همان رمز قبلی.')
        : null,
      error, button
    ]);

    showGate(card('ورود به داشبورد', 'برای دیدن داشبوردت وارد شو.', form, [
      el('button.linkish', { type: 'button', onclick: function () { joinScreen(done, ''); } },
        'کد دعوت دارم — ساخت حساب'),
      el('button.linkish', { type: 'button', onclick: function () { resetScreen(done); } },
        'رمزم را فراموش کرده‌ام')
    ]));
    name.input.focus();
  }

  /** The owner forgot their own password: recover with the code from config.php. */
  function ownerRecoverScreen(done) {
    var code = textField('کد بازیابی مدیر', 'recover-code',
      { ltr: true, hint: 'همان کدی که در فایل config.php روی هاست نوشته شده (PLD_SETUP_CODE).' });
    var pass = passwordField('رمز تازه', 'recover-pass', 'new-password', 'دست‌کم ۸ حرف.');
    var repeat = passwordField('تکرار رمز تازه', 'recover-repeat', 'new-password');
    var error = formError();
    var button = el('button.btn', { type: 'submit' }, 'ثبت رمز تازه');

    function fail(msg) { error.textContent = msg; error.style.display = ''; }

    var form = el('form', {
      onsubmit: function (e) {
        e.preventDefault();
        error.style.display = 'none';
        if (pass.input.value !== repeat.input.value) return fail('رمز و تکرارش یکی نیستند.');
        setBusy(button, true, 'ثبت رمز تازه');
        App.storage.api('POST', 'owner_recover', { code: code.input.value, password: pass.input.value })
          .then(function (res) {
            setBusy(button, false, 'ثبت رمز تازه');
            if (!res.ok) return fail(res.error || 'بازیابی انجام نشد.');
            done(res.user);
          });
      }
    }, [code.wrap, pass.wrap, repeat.wrap, error, button]);

    showGate(card('بازیابی حساب مدیر',
      'فقط برای خودت: چون به فایل config.php روی هاست دسترسی داری، با کد داخل آن می‌توانی رمز حساب مدیر را عوض کنی. ' +
      'حساب‌های دیگر و همه‌ی داده‌ها دست‌نخورده می‌مانند.', form,
      [el('button.linkish', { type: 'button', onclick: function () { loginScreen(done); } }, 'برگرد به ورود')]));
    code.input.focus();
  }

  /** Forgotten password: the owner hands out a one-time code, the person picks a new password. */
  function resetScreen(done) {
    var name = textField('نام کاربری', 'reset-user', { ltr: true, autocomplete: 'username' });
    var code = textField('کد بازیابی', 'reset-code',
      { ltr: true, placeholder: 'FA-XXXX-XXXX-XXXX', hint: 'این کد را مدیر برایت می‌سازد. تا ۲۴ ساعت و فقط یک بار کار می‌کند.' });
    var pass = passwordField('رمز تازه', 'reset-pass', 'new-password', 'دست‌کم ۸ حرف.');
    var repeat = passwordField('تکرار رمز تازه', 'reset-repeat', 'new-password');
    var error = formError();
    var button = el('button.btn', { type: 'submit' }, 'ثبت رمز تازه');

    function fail(msg) { error.textContent = msg; error.style.display = ''; }

    var form = el('form', {
      onsubmit: function (e) {
        e.preventDefault();
        error.style.display = 'none';
        if (pass.input.value !== repeat.input.value) return fail('رمز و تکرارش یکی نیستند.');
        setBusy(button, true, 'ثبت رمز تازه');
        App.storage.api('POST', 'reset_password', {
          username: name.input.value, code: code.input.value, password: pass.input.value
        }).then(function (res) {
          setBusy(button, false, 'ثبت رمز تازه');
          if (!res.ok) return fail(res.error || 'رمز عوض نشد.');
          done(res.user);
        });
      }
    }, [name.wrap, code.wrap, pass.wrap, repeat.wrap, error, button]);

    showGate(card('رمز تازه', 'با کد بازیابی که مدیر داده، رمز تازه‌ای برای حسابت بگذار. ' +
      'داده‌هایت دست‌نخورده می‌ماند و بقیه‌ی دستگاه‌ها از حساب خارج می‌شوند.', form,
      [
        el('button.linkish', { type: 'button', onclick: function () { loginScreen(done); } }, 'برگرد به ورود'),
        el('button.linkish', { type: 'button', onclick: function () { ownerRecoverScreen(done); } }, 'من مدیرم')
      ]));
    name.input.focus();
  }

  /** Session expired while working: sign in again in a dialog, keep unsaved edits. */
  var reloginOpen = false;
  function relogin() {
    if (reloginOpen) return;
    reloginOpen = true;

    var name = textField('نام کاربری', 'relogin-user',
      { ltr: true, autocomplete: 'username', value: session ? session.username : '' });
    var pass = passwordField('رمز ورود', 'relogin-pass', 'current-password');
    var error = formError();

    function submit() {
      error.style.display = 'none';
      App.storage.api('POST', 'login', {
        username: name.input.value, password: pass.input.value
      }).then(function (res) {
        if (!res.ok) {
          error.textContent = res.error || 'ورود انجام نشد.';
          error.style.display = '';
          return;
        }
        // A different account must not inherit this page's unsaved data.
        if (session && res.user && res.user.id !== session.id) {
          App.storage.discardPending();
          window.location.reload();
          return;
        }
        session = res.user || session;
        reloginOpen = false;
        handle.close();
        App.storage.resume(false);
        App.toast.show('دوباره وارد شدی — تغییرات ذخیره می‌شوند');
      });
    }

    var handle = App.modal.open({
      title: 'دوباره وارد شو',
      sub: 'نشست کاربری‌ات تمام شده. تغییراتی که داده‌ای هنوز در همین صفحه هستند و بعد از ورود ذخیره می‌شوند.',
      narrow: true,
      body: el('form', { onsubmit: function (e) { e.preventDefault(); submit(); } },
        [name.wrap, pass.wrap, error]),
      footer: [el('button.btn', { type: 'button', onclick: submit }, 'ورود')],
      onClose: function () { reloginOpen = false; }
    });
  }

  function logout(everywhere) {
    var go = function () {
      // The master key lives in memory only, but there is no reason to keep it
      // for even the moment between the request and the reload.
      if (App.vault) App.vault.lock();
      App.storage.api('POST', everywhere ? 'logout_all' : 'logout', {}).then(function () {
        window.location.hash = '';
        window.location.reload();
      });
    };
    if (App.storage.hasPending()) {
      App.modal.confirm({
        title: 'تغییرات هنوز ذخیره نشده‌اند',
        message: 'اگر الان خارج شوی، آخرین تغییرات از بین می‌روند. چند ثانیه صبر کن و دوباره امتحان کن.',
        confirmLabel: 'با این حال خارج شو'
      }).then(function (yes) { if (yes) go(); });
      return;
    }
    go();
  }

  /** Another device saved first. Let the user pick which version wins. */
  var conflictOpen = false;
  function conflict() {
    if (conflictOpen) return;
    conflictOpen = true;
    var choice = null;

    var handle = App.modal.open({
      title: 'داده‌ها در جای دیگری تغییر کرده‌اند',
      sub: 'از وقتی این صفحه را باز کرده‌ای، از دستگاه یا تب دیگری تغییری ذخیره شده. ' +
        'اگر نسخه‌ی سرور را بارگذاری کنی، آخرین تغییرات این صفحه از بین می‌رود. ' +
        'اگر نسخه‌ی خودت را نگه داری، تغییرات آن دستگاه بازنویسی می‌شود (قبلش روی سرور پشتیبان گرفته می‌شود).',
      body: null,
      footer: [
        el('button.btn', {
          type: 'button',
          onclick: function () { choice = 'server'; handle.close(); }
        }, 'بارگذاری نسخه‌ی سرور'),
        el('button.btn-ghost', {
          type: 'button',
          onclick: function () { choice = 'mine'; handle.close(); }
        }, 'نگه‌داشتن نسخه‌ی این صفحه')
      ],
      onClose: function () {
        conflictOpen = false;
        if (choice === 'mine') {
          App.storage.resume(true);
        } else {
          // Closing without choosing is treated as "load the server copy" — the safe default.
          App.storage.discardPending();
          window.location.reload();
        }
      }
    });
  }

  App.auth = {
    gate: gate,
    loading: loading,
    failure: failure,
    hideGate: hideGate,
    relogin: relogin,
    logout: logout,
    conflict: conflict,
    session: function () { return session; },
    setSession: function (user) { session = user; },
    isOwner: function () { return !!session && session.role === 'owner'; }
  };
})(window.App = window.App || {});
