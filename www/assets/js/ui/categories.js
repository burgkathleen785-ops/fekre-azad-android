/*
 * User-managed categories.
 *
 * Every section in schema.CATEGORY_SECTIONS has its own ordered list of
 * category names, stored in settings.categories. Records keep the category
 * *name* (not an id), which keeps exports readable; so a rename rewrites the
 * matching records and a delete clears them, in one save.
 *
 * Two sections are not plain collections:
 *   - recurring items borrow the transaction list (schema.catSource), because
 *     a recurring item becomes a transaction and two lists would drift,
 *   - the vault's records are encrypted, so counting and rewriting them has
 *     to go through App.vault — and cannot happen at all while it is locked.
 */
(function (App) {
  'use strict';

  var el = App.el;
  var util = App.util;
  var db = App.db;
  var schema = App.schema;

  var MAX_LEN = 40;

  function sectionOf(collection) {
    return schema.CATEGORY_SECTIONS.filter(function (s) { return s.collection === collection; })[0] || null;
  }

  function list(collection) {
    var all = db.settings().categories || {};
    return (all[schema.catSource(collection)] || []).slice();
  }

  /** How many records use a category — null when the answer is not knowable. */
  function usage(collection, name) {
    if (collection === 'vault') return App.vault.countByCategory(name);
    var own = db.count(collection, function (r) { return r.category === name; });
    // A borrowed list is shared, so the count has to include the borrowers.
    schema.NAMES.forEach(function (other) {
      if (other === collection) return;
      if (schema.catSource(other) !== collection) return;
      own += db.count(other, function (r) { return r.category === name; });
    });
    return own;
  }

  /** The count for the chip — a question mark when the vault is locked. */
  function usageLabel(collection, name) {
    var n = usage(collection, name);
    return n == null ? '؟' : util.toFa(n);
  }

  /** True while a section's records cannot be rewritten (a locked vault). */
  function frozen(collection) {
    return collection === 'vault' && !App.vault.isOpen();
  }

  function writeList(collection, next, recordFn) {
    var target = schema.catSource(collection);
    var all = util.deepClone(db.settings().categories || {});
    all[target] = next;
    db.batch(function () {
      db.setSettings({ categories: all }, true);
      if (!recordFn) return;
      // Rewrite the records of this section and of anything borrowing its list.
      schema.NAMES.forEach(function (name) {
        if (name !== collection && schema.catSource(name) !== target) return;
        db.mutateAll(name, recordFn);
      });
    });
  }

  function validate(collection, name, except) {
    var clean = util.trim(name);
    if (!clean) return { error: 'نام دسته خالی است' };
    if (clean.length > MAX_LEN) return { error: 'نام دسته حداکثر ' + util.toFa(MAX_LEN) + ' حرف' };
    var dup = list(collection).some(function (c) { return c === clean && c !== except; });
    if (dup) return { error: 'این دسته از قبل هست' };
    return { name: clean };
  }

  /** Returns an error string, or null on success. */
  function add(collection, name) {
    var v = validate(collection, name);
    if (v.error) return v.error;
    writeList(collection, list(collection).concat([v.name]));
    return null;
  }

  function rename(collection, from, to) {
    if (util.trim(to) === from) return null;
    if (frozen(collection)) return 'برای تغییر دسته‌های این بخش، اول قفل گاوصندوق را باز کن.';
    var v = validate(collection, to, from);
    if (v.error) return v.error;
    var next = list(collection).map(function (c) { return c === from ? v.name : c; });
    writeList(collection, next, function (r) {
      if (r.category !== from) return false;
      r.category = v.name;
      return true;
    });
    if (collection === 'vault') App.vault.renameCategory(from, v.name);
    return null;
  }

  function move(collection, name, delta) {
    var cur = list(collection);
    var i = cur.indexOf(name);
    var j = i + delta;
    if (i < 0 || j < 0 || j >= cur.length) return;
    cur.splice(i, 1);
    cur.splice(j, 0, name);
    writeList(collection, cur);
  }

  /** Asks first when records use it. Resolves true when deleted. */
  function remove(collection, name) {
    if (frozen(collection)) {
      App.toast.error('برای تغییر دسته‌های این بخش، اول قفل گاوصندوق را باز کن.');
      return Promise.resolve(false);
    }
    var n = usage(collection, name);
    var ask = n
      ? App.modal.confirm({
          title: 'حذف دسته‌ی «' + name + '»؟',
          message: util.toFa(n) + ' مورد این دسته را دارند. خودشان پاک نمی‌شوند، فقط بدون دسته می‌مانند.',
          confirmLabel: 'حذف دسته'
        })
      : Promise.resolve(true);

    return ask.then(function (yes) {
      if (!yes) return false;
      var next = list(collection).filter(function (c) { return c !== name; });
      writeList(collection, next, function (r) {
        if (r.category !== name) return false;
        r.category = '';
        return true;
      });
      if (collection === 'vault') App.vault.renameCategory(name, '');
      App.toast.show('دسته حذف شد');
      return true;
    });
  }

  // ---- manager modal -----------------------------------------------------

  /** Opens the manager for one section; the section can be switched inside. */
  function openManager(collection) {
    var active = sectionOf(collection) ? collection : schema.CATEGORY_SECTIONS[0].collection;
    var body = el('div');

    function draw() {
      App.dom.clear(body);
      body.appendChild(sectionPicker());
      if (frozen(active)) {
        body.appendChild(el('div.hint', 'گاوصندوق قفل است: دسته‌ی تازه می‌توانی اضافه کنی، ولی ' +
          'تغییر نام و حذف تا باز شدنش ممکن نیست — چون باید موارد داخلش هم به‌روز شوند.'));
      }
      body.appendChild(listNode());
      body.appendChild(addRow());
    }

    function sectionPicker() {
      var select = el('select.select', {
        'aria-label': 'بخش',
        onchange: function () { active = select.value; draw(); }
      });
      schema.CATEGORY_SECTIONS.forEach(function (s) {
        select.appendChild(el('option', { value: s.collection }, s.label));
      });
      select.value = active;
      return el('div.field', [el('label.field__label', 'بخش'), select]);
    }

    function listNode() {
      var items = list(active);
      if (!items.length) {
        return el('div.empty.empty--inline', 'این بخش هنوز دسته‌ای ندارد. اولین دسته را پایین اضافه کن.');
      }
      return el('div.cat-list', items.map(function (name, i) {
        var input = el('input.input.cat-list__name', {
          type: 'text', maxlength: String(MAX_LEN), 'aria-label': 'نام دسته',
          onkeydown: function (e) {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') { input.value = name; }
          },
          onblur: function () {
            if (util.trim(input.value) === name) return;
            var err = rename(active, name, input.value);
            if (err) { App.toast.error(err); input.value = name; return; }
            App.toast.show('نام دسته عوض شد');
            draw();
          }
        });
        input.value = name;

        return el('div.cat-list__row', [
          el('div.cat-list__order', [
            el('button.icon-btn', {
              type: 'button', title: 'بالاتر', 'aria-label': 'بالاتر', disabled: i === 0,
              onclick: function () { move(active, name, -1); draw(); }
            }, '▲'),
            el('button.icon-btn', {
              type: 'button', title: 'پایین‌تر', 'aria-label': 'پایین‌تر', disabled: i === items.length - 1,
              onclick: function () { move(active, name, 1); draw(); }
            }, '▼')
          ]),
          input,
          el('span.chip.chip--mute.num', { title: 'تعداد موارد با این دسته' }, usageLabel(active, name)),
          el('button.icon-btn.icon-btn--danger', {
            type: 'button',
            onclick: function () { remove(active, name).then(function (done) { if (done) draw(); }); }
          }, 'حذف')
        ]);
      }));
    }

    function addRow() {
      var input = el('input.input', {
        type: 'text', maxlength: String(MAX_LEN), placeholder: 'نام دسته‌ی جدید',
        onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } }
      });
      function submit() {
        var err = add(active, input.value);
        if (err) { App.toast.error(err); input.focus(); return; }
        App.toast.show('دسته اضافه شد');
        draw();
        var fresh = body.querySelector('.cat-add input');
        if (fresh) fresh.focus();
      }
      return el('div.cat-add', [
        input,
        el('button.btn', { type: 'button', onclick: submit }, 'افزودن')
      ]);
    }

    draw();

    var handle = App.modal.open({
      title: 'مدیریت دسته‌ها',
      sub: 'نام هر دسته را همان‌جا ویرایش کن. تغییر نام روی همه‌ی موارد آن دسته اعمال می‌شود؛ ' +
        'حذف دسته، خود موارد را پاک نمی‌کند.',
      body: body,
      footer: [
        el('button.btn-ghost', { type: 'button', onclick: function () { handle.close(); } }, 'بستن')
      ]
    });
    return handle;
  }

  App.categories = {
    MAX_LEN: MAX_LEN,
    sectionOf: sectionOf,
    list: list,
    usage: usage,
    add: add,
    rename: rename,
    move: move,
    remove: remove,
    openManager: openManager
  };
})(window.App = window.App || {});
