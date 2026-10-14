/*
 * Schema-driven record editor.
 *
 * Every "add" and "edit" in the app opens through App.crud, which reads the
 * field list out of App.schema and builds the form. That is why adding a
 * field to schema.js is all it takes to make it editable everywhere.
 */
(function (App) {
  'use strict';

  var el = App.el;
  var util = App.util;
  var J = App.jalali;
  var schema = App.schema;

  var datalistSeq = 0;

  function resolveOptions(field) {
    var raw = typeof field.options === 'function' ? field.options() : field.options;
    return (raw || []).map(function (o) {
      return typeof o === 'string' ? { value: o, label: o } : o;
    });
  }

  /**
   * opts: { title, sub, collection, values, submitLabel, onSubmit(values),
   *         onDelete, deleteLabel }
   * onSubmit may return a string to report a problem and keep the form open.
   */
  function openRecordForm(opts) {
    var def = schema.COLLECTIONS[opts.collection];
    var current = Object.assign(schema.blank(opts.collection), opts.values || {});
    var controls = {};   // name -> { wrap, input, error }

    var formError = el('div.field__error', { style: { display: 'none' } });

    var fieldNodes = [];
    var pendingHalf = null;
    def.fields.forEach(function (field) {
      var node = buildField(field, current, onAnyChange, opts.collection);
      controls[field.name] = node;
      // Consecutive short fields ("half", or a category next to one) share a row.
      var short = field.half || field.type === 'category';
      if (short && pendingHalf) {
        fieldNodes.push(el('div.field--row', [pendingHalf, node.wrap]));
        pendingHalf = null;
      } else if (short && field.half) {
        pendingHalf = node.wrap;
      } else {
        if (pendingHalf) { fieldNodes.push(pendingHalf); pendingHalf = null; }
        fieldNodes.push(node.wrap);
      }
    });
    if (pendingHalf) fieldNodes.push(pendingHalf);

    function readValues() {
      var out = {};
      def.fields.forEach(function (f) {
        var c = controls[f.name];
        if (c.get) out[f.name] = c.get();
        else out[f.name] = f.type === 'checkbox' ? c.input.checked : c.input.value;
      });
      return out;
    }

    function onAnyChange() {
      var snapshot = readValues();
      def.fields.forEach(function (f) {
        if (!f.showIf) return;
        controls[f.name].wrap.style.display = f.showIf(snapshot) ? '' : 'none';
      });
    }

    function clearErrors() {
      Object.keys(controls).forEach(function (k) {
        controls[k].error.style.display = 'none';
        controls[k].error.textContent = '';
        controls[k].input.classList.remove('has-error');
      });
      formError.style.display = 'none';
      formError.textContent = '';
    }

    function showErrors(errors, message) {
      var firstBad = null;
      Object.keys(errors || {}).forEach(function (name) {
        var c = controls[name];
        if (!c) return;
        c.error.textContent = errors[name];
        c.error.style.display = '';
        if (!firstBad) firstBad = c.input;
      });
      if (message) {
        formError.textContent = message;
        formError.style.display = '';
      }
      if (firstBad) { try { firstBad.focus(); } catch (e) { /* ignore */ } }
    }

    function submit() {
      clearErrors();
      var result = schema.coerce(opts.collection, readValues());
      if (result.errors || result.formError) {
        showErrors(result.errors, result.formError);
        return;
      }
      var problem;
      try {
        problem = opts.onSubmit(result.values);
      } catch (e) {
        console.error('[form] submit failed', e);
        problem = 'ذخیره نشد: ' + e.message;
      }
      if (typeof problem === 'string' && problem) {
        showErrors(null, problem);
        return;
      }
      handle.close();
    }

    var form = el('form', {
      onsubmit: function (e) { e.preventDefault(); submit(); },
      onkeydown: function (e) {
        var isTextarea = e.target && e.target.tagName === 'TEXTAREA';
        if (e.key === 'Enter' && isTextarea && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          submit();
        }
      }
    }, fieldNodes.concat([formError]));

    var footer = [
      el('button.btn', { type: 'button', onclick: submit }, opts.submitLabel || 'ذخیره'),
      el('button.btn-ghost', { type: 'button', onclick: function () { handle.close(); } }, 'انصراف'),
      el('div.spacer')
    ];
    if (opts.onDelete) {
      footer.push(el('button.btn-ghost.btn-ghost--danger', {
        type: 'button',
        onclick: function () {
          handle.close();
          opts.onDelete();
        }
      }, opts.deleteLabel || 'حذف'));
    }

    var handle = App.modal.open({
      title: opts.title,
      sub: opts.sub,
      body: form,
      footer: footer
    });

    onAnyChange();
    return handle;
  }

  function buildField(field, values, onChange, collection) {
    var id = 'f_' + field.name + '_' + (datalistSeq++);
    var error = el('div.field__error', { style: { display: 'none' } });
    var input, wrap;

    var raw = values[field.name];

    if (field.type === 'pairs') return buildPairs(field, raw, id, error);
    if (field.type === 'category') return buildCategory(field, raw, id, error, collection, onChange);

    if (field.type === 'checkbox') {
      input = el('input', { type: 'checkbox', id: id, onchange: onChange });
      input.checked = !!raw;
      wrap = el('div.field.field--check', [
        input,
        el('label.field__label', { for: id }, field.label),
        error
      ]);
      return { wrap: wrap, input: input, error: error };
    }

    var label = el('label.field__label', { for: id }, [
      field.label,
      field.required ? el('span.field__req', ' *') : null
    ]);

    if (field.type === 'textarea') {
      input = el('textarea.textarea', {
        id: id, rows: field.rows || 4, placeholder: field.placeholder || '', oninput: onChange
      });
      input.value = raw == null ? '' : String(raw);

    } else if (field.type === 'select') {
      input = el('select.select', { id: id, onchange: onChange });
      resolveOptions(field).forEach(function (o) {
        var opt = el('option', { value: o.value }, o.label);
        input.appendChild(opt);
      });
      var want = raw == null ? '' : String(raw);
      input.value = want;
      // A referenced record may have been deleted; fall back to the first option.
      if (input.value !== want) input.selectedIndex = 0;

    } else if (field.type === 'jdate') {
      input = el('input.input.input--mono', {
        id: id, type: 'text', dir: 'ltr', inputmode: 'numeric',
        placeholder: '۱۴۰۵/۰۶/۲۵', autocomplete: 'off', oninput: onChange
      });
      input.value = J.toInput(raw);

    } else if (field.type === 'number') {
      input = el('input.input.input--mono', {
        id: id, type: 'text', dir: 'ltr', inputmode: 'decimal',
        placeholder: field.placeholder || '', autocomplete: 'off', oninput: onChange
      });
      input.value = (raw === null || raw === undefined || raw === '') ? '' : String(raw);

    } else if (field.type === 'url' || field.type === 'email' || field.type === 'tel') {
      input = el('input.input.input--ltr', {
        id: id, type: field.type === 'url' ? 'text' : field.type, dir: 'ltr',
        inputmode: field.type === 'url' ? 'url' : null,
        placeholder: field.placeholder || '', autocomplete: 'off', oninput: onChange
      });
      input.value = raw == null ? '' : String(raw);

    } else {
      input = el('input.input', {
        id: id, type: 'text', placeholder: field.placeholder || '',
        autocomplete: 'off', oninput: onChange
      });
      input.value = raw == null ? '' : String(raw);

      if (field.suggest && field.suggest.length) {
        var listId = id + '_list';
        input.setAttribute('list', listId);
        var dl = el('datalist', { id: listId });
        field.suggest.forEach(function (s) { dl.appendChild(el('option', { value: s })); });
        wrap = el('div.field', [label, input, dl, hintNode(field), error]);
        return { wrap: wrap, input: input, error: error };
      }
    }

    wrap = el('div.field', [label, input, hintNode(field), error]);
    return { wrap: wrap, input: input, error: error };
  }

  var NEW_CATEGORY = '__new__';

  /**
   * Category select fed from the section's managed list. The last option
   * turns into an inline "new category" box, so a missing category never
   * forces the user out of the form they are filling in.
   */
  function buildCategory(field, raw, id, error, collection, onChange) {
    var current = raw == null ? '' : String(raw);
    var select = el('select.select', { id: id });
    var newBox = el('input.input', {
      type: 'text', maxlength: String(App.categories.MAX_LEN),
      placeholder: 'نام دسته‌ی جدید', style: { display: 'none', 'margin-top': '6px' },
      onkeydown: function (e) {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commitNew(); }
        if (e.key === 'Escape') { e.stopPropagation(); cancelNew(); }
      },
      onblur: function () { if (util.trim(newBox.value)) commitNew(); }
    });

    function fill(selected) {
      App.dom.clear(select);
      select.appendChild(el('option', { value: '' }, 'بدون دسته'));
      var items = App.categories.list(collection);
      if (selected && items.indexOf(selected) === -1) items.push(selected);
      items.forEach(function (c) { select.appendChild(el('option', { value: c }, c)); });
      select.appendChild(el('option', { value: NEW_CATEGORY }, '+ دسته‌ی جدید…'));
      select.value = selected || '';
      lastValue = select.value;
    }

    var lastValue = '';

    function commitNew() {
      var name = util.trim(newBox.value);
      if (!name) { cancelNew(); return; }
      var exists = App.categories.list(collection).indexOf(name) !== -1;
      if (!exists) {
        var err = App.categories.add(collection, name);
        if (err) { error.textContent = err; error.style.display = ''; return; }
      }
      error.style.display = 'none';
      newBox.value = '';
      newBox.style.display = 'none';
      fill(name);
      onChange();
    }

    function cancelNew() {
      newBox.value = '';
      newBox.style.display = 'none';
      select.value = lastValue;
    }

    select.addEventListener('change', function () {
      if (select.value === NEW_CATEGORY) {
        newBox.style.display = '';
        newBox.focus();
        return;
      }
      lastValue = select.value;
      newBox.style.display = 'none';
      onChange();
    });

    fill(current);

    var label = el('label.field__label', { for: id }, field.label);
    var wrap = el('div.field', [label, select, newBox, hintNode(field), error]);
    return {
      wrap: wrap, input: select, error: error,
      get: function () { return select.value === NEW_CATEGORY ? lastValue : select.value; }
    };
  }

  /** Repeatable "label + value" rows, e.g. client details or lesson links. */
  function buildPairs(field, raw, id, error) {
    var list = el('div.pairs');
    var rows = [];
    var isUrl = field.valueType === 'url';

    function addRow(item, focus) {
      var key = el('input.input.pairs__key', {
        type: 'text', placeholder: field.keyPlaceholder || field.keyLabel || '',
        'aria-label': field.keyLabel || 'عنوان', autocomplete: 'off'
      });
      var val = el('input.input.pairs__value' + (isUrl ? '.input--ltr' : ''), {
        type: 'text', placeholder: field.valuePlaceholder || field.valueLabel || '',
        'aria-label': field.valueLabel || 'مقدار', autocomplete: 'off',
        dir: isUrl ? 'ltr' : null, inputmode: isUrl ? 'url' : null
      });
      key.value = (item && item.label) || '';
      val.value = (item && item.value) || '';

      var entry = { key: key, val: val };
      var node = el('div.pairs__row', [
        key, val,
        el('button.icon-btn.icon-btn--danger', {
          type: 'button', title: 'حذف ردیف', 'aria-label': 'حذف ردیف',
          onclick: function () {
            rows = rows.filter(function (r) { return r !== entry; });
            list.removeChild(node);
            if (!rows.length) addRow(null, false);
          }
        }, '×')
      ]);
      entry.node = node;
      rows.push(entry);
      list.appendChild(node);
      if (focus) key.focus();
    }

    var initial = Array.isArray(raw) ? raw : [];
    if (initial.length) initial.forEach(function (it) { addRow(it, false); });
    else addRow(null, false);

    var head = el('div.pairs__head', [
      el('span', field.keyLabel || 'عنوان'),
      el('span', field.valueLabel || 'مقدار')
    ]);

    var wrap = el('div.field', [
      el('label.field__label', { for: id }, field.label),
      head,
      list,
      el('button.btn-add.btn-add--inline', {
        type: 'button', id: id, onclick: function () { addRow(null, true); }
      }, '+ ' + (field.addLabel || 'ردیف جدید')),
      hintNode(field),
      error
    ]);

    return {
      wrap: wrap,
      input: rows[0].key,
      error: error,
      get: function () {
        return rows.map(function (r) { return { label: r.key.value, value: r.val.value }; });
      }
    };
  }

  function hintNode(field) {
    var parts = [];
    if (field.type === 'jdate') parts.push('تاریخ شمسی — یا بنویس «امروز» / «فردا».');
    if (field.unit) parts.push('واحد: ' + App.db.settings().unit);
    if (field.hint) parts.push(field.hint);
    return parts.length ? el('div.field__hint', parts.join(' ')) : null;
  }

  // ---- public CRUD entry points ----------------------------------------

  function titleOf(collection, rec) {
    var def = schema.COLLECTIONS[collection];
    return util.trim(rec[def.titleField]) || def.singular;
  }

  function create(collection, prefill, opts) {
    opts = opts || {};
    var def = schema.COLLECTIONS[collection];
    return openRecordForm({
      collection: collection,
      title: opts.title || (def.singular + ' جدید'),
      sub: opts.sub,
      values: prefill,
      submitLabel: 'افزودن',
      onSubmit: function (values) {
        App.db.insert(collection, values);
        App.toast.show(def.singular + ' اضافه شد');
        if (opts.onDone) opts.onDone();
      }
    });
  }

  function edit(collection, id, opts) {
    opts = opts || {};
    var def = schema.COLLECTIONS[collection];
    var rec = App.db.get(collection, id);
    if (!rec) { App.toast.error('این رکورد دیگر وجود ندارد'); return null; }

    return openRecordForm({
      collection: collection,
      title: opts.title || ('ویرایش ' + def.singular),
      sub: opts.sub,
      values: rec,
      submitLabel: 'ذخیره',
      onSubmit: function (values) {
        App.db.update(collection, id, values);
        App.toast.show('ذخیره شد');
        if (opts.onDone) opts.onDone();
      },
      onDelete: function () { destroy(collection, id); }
    });
  }

  function destroy(collection, id, extraWarning) {
    var def = schema.COLLECTIONS[collection];
    var rec = App.db.get(collection, id);
    if (!rec) return Promise.resolve(false);

    var message = '«' + titleOf(collection, rec) + '» برای همیشه پاک می‌شود.';
    if (extraWarning) message += ' ' + extraWarning;

    return App.modal.confirm({
      title: 'حذف ' + def.singular + '؟',
      message: message,
      confirmLabel: 'حذف کن'
    }).then(function (yes) {
      if (!yes) return false;
      App.db.remove(collection, id);
      App.toast.show(def.singular + ' حذف شد');
      return true;
    });
  }

  App.form = { open: openRecordForm };
  App.crud = { create: create, edit: edit, destroy: destroy };
})(window.App = window.App || {});
