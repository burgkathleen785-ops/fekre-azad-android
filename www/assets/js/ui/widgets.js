/* Reusable pieces shared by more than one page. */
(function (App) {
  'use strict';

  var el = App.el;
  var util = App.util;
  var db = App.db;
  var stats = App.stats;

  /** Section heading with the black underline used throughout the design. */
  function sectionHead(title, right, opts) {
    opts = opts || {};
    return el('div.section-head' + (opts.flush ? '.section-head--flush' : ''), {
      style: opts.margin ? { margin: opts.margin } : null
    }, [
      el('div', title),
      right == null ? null :
        (right instanceof Node ? right : el('div.section-head__count', String(right)))
    ]);
  }

  function emptyState(text, actionLabel, onAction, inline) {
    return el('div.empty' + (inline ? '.empty--inline' : ''), [
      el('div', text),
      onAction ? el('button.btn-add.btn-add--inline', {
        type: 'button', onclick: onAction,
        style: { display: 'inline-block', 'margin-top': '6px' }
      }, actionLabel) : null
    ]);
  }

  /** The small edit/delete pair revealed when a row is hovered or focused. */
  function rowActions(onEdit, onDelete) {
    return el('div.row-actions', [
      onEdit ? el('button.icon-btn', {
        type: 'button', title: 'ویرایش', 'aria-label': 'ویرایش',
        onclick: function (e) { e.stopPropagation(); onEdit(); }
      }, 'ویرایش') : null,
      onDelete ? el('button.icon-btn.icon-btn--danger', {
        type: 'button', title: 'حذف', 'aria-label': 'حذف',
        onclick: function (e) { e.stopPropagation(); onDelete(); }
      }, 'حذف') : null
    ]);
  }

  /** One task line: checkbox, title, context chip, hover actions. */
  function taskRow(task, opts) {
    opts = opts || {};
    var project = task.projectId ? db.get('projects', task.projectId) : null;
    var chipText = project ? project.name : (task.category || '');

    var box = el('button.task__box', {
      type: 'button',
      role: 'checkbox',
      'aria-checked': task.done ? 'true' : 'false',
      'aria-label': task.done ? 'برگرداندن به انجام‌نشده' : 'انجام شد',
      onclick: function (e) {
        e.stopPropagation();
        toggleTask(task.id);
      }
    });

    var title = el('span.task__title', {
      role: 'button',
      tabindex: '0',
      title: 'برای ویرایش کلیک کن',
      onclick: function () { App.crud.edit('tasks', task.id); },
      onkeydown: function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          App.crud.edit('tasks', task.id);
        }
      }
    }, task.title);

    return el('div.task.row' + (task.done ? '.is-done' : ''), [
      box,
      title,
      chipText ? el('span.chip' + (project ? '' : '.chip--mute'), chipText) : null,
      opts.showDate && task.date ? el('span.cell-mono', App.jalali.format(task.date)) : null,
      rowActions(null, function () { App.crud.destroy('tasks', task.id); })
    ]);
  }

  function toggleTask(id) {
    var task = db.get('tasks', id);
    if (!task) return;
    var next = !task.done;
    db.update('tasks', id, {
      done: next,
      completedAt: next ? util.nowIso() : null
    });
  }

  /** "+ کار جدید" style add button. */
  function addButton(label, onClick, inline) {
    return el('button.btn-add' + (inline ? '.btn-add--inline' : ''), {
      type: 'button', onclick: onClick
    }, '+ ' + label);
  }

  /** Project card with its progress bar — used on the home page. */
  function projectCard(project) {
    var goal = project.goalId ? db.get('goals', project.goalId) : null;
    var pct = stats.projectProgress(project);

    return el('div.card.row', {
      style: { cursor: 'pointer' },
      role: 'button',
      tabindex: '0',
      onclick: function () { App.crud.edit('projects', project.id); },
      onkeydown: function (e) {
        if (e.key === 'Enter') App.crud.edit('projects', project.id);
      }
    }, [
      el('div.proj__name', project.name),
      el('div.proj__goal', goal ? 'هدف: ' + goal.name : 'بدون هدف'),
      el('div.bar.bar--thin', [
        el('div.bar__fill', { style: { width: pct + '%' } })
      ]),
      el('div.proj__meta', [
        el('span', util.faPct(pct)),
        el('span', project.deadline ? 'مهلت ' + App.jalali.format(project.deadline) : 'بی‌مهلت')
      ])
    ]);
  }

  /** Progress ring from the learning page (conic-gradient, exactly as designed). */
  function progressRing(pct, muted) {
    var deg = util.clamp(Number(pct) || 0, 0, 100) * 3.6;
    var colour = muted ? 'var(--muted)' : 'var(--accent)';
    return el('div.course__ring', {
      style: { background: 'conic-gradient(' + colour + ' ' + deg + 'deg, var(--line-soft) ' + deg + 'deg)' }
    }, [
      el('div.course__ring-in' + (muted ? '.is-mute' : ''), util.faPct(pct))
    ]);
  }

  /** Renders a goal/project link token like "وصل به: درآمد آزاد". */
  function linkLabel(link) {
    if (!link) return null;
    var parts = String(link).split(':');
    if (parts.length !== 2) return null;
    var name = parts[0] === 'goal' ? db.labelOf('goals', parts[1]) : db.labelOf('projects', parts[1]);
    return name ? 'وصل به: ' + name : null;
  }

  // ---- categories ------------------------------------------------------

  var NONE = '__none__';

  // Chosen filter per collection; kept in memory so re-renders keep it.
  var filters = {};

  function filterValue(collection) {
    var v = filters[collection] || '';
    // A filter on a category that was since renamed/deleted falls back to "all".
    if (v && v !== NONE && App.categories.list(collection).indexOf(v) === -1) v = filters[collection] = '';
    return v;
  }

  /** The filtered category name, so "add" can start new records in it; '' otherwise. */
  function activeCategory(collection) {
    var v = filterValue(collection);
    return v === NONE ? '' : v;
  }

  /** Rows narrowed to the active category filter of that collection. */
  function byCategory(collection, rows) {
    var v = filterValue(collection);
    if (!v) return rows;
    return rows.filter(function (r) {
      return v === NONE ? !util.trim(r.category) : r.category === v;
    });
  }

  /**
   * Filter chips for one section: «همه», one chip per category (with counts),
   * «بدون دسته» when relevant, and a link to the category manager.
   * `rows` is the unfiltered list the counts are taken from.
   */
  function categoryBar(collection, rows, opts) {
    opts = opts || {};
    var active = filterValue(collection);
    var cats = App.categories.list(collection);

    var counts = {};
    var none = 0;
    rows.forEach(function (r) {
      var c = util.trim(r.category);
      if (!c) none++;
      else counts[c] = (counts[c] || 0) + 1;
    });

    function chip(value, label, count) {
      var on = active === value;
      return el('button.cat-chip' + (on ? '.is-active' : ''), {
        type: 'button',
        'aria-pressed': on ? 'true' : 'false',
        onclick: function () {
          filters[collection] = on && value ? '' : value;
          App.view.refresh();
        }
      }, [
        label,
        count != null ? el('span.cat-chip__count.num', util.toFa(count)) : null
      ]);
    }

    var chips = [chip('', 'همه', rows.length)];
    cats.forEach(function (c) { chips.push(chip(c, c, counts[c] || 0)); });
    if (none && cats.length) chips.push(chip(NONE, 'بدون دسته', none));

    return el('div.cat-bar', { style: opts.margin ? { margin: opts.margin } : null }, [
      opts.label ? el('span.cat-bar__label', opts.label) : null,
      el('div.cat-bar__chips', chips),
      el('button.icon-btn.cat-bar__manage', {
        type: 'button',
        onclick: function () { App.categories.openManager(collection); }
      }, cats.length ? 'مدیریت دسته‌ها' : '+ ساخت دسته')
    ]);
  }

  /** Small category label shown next to a record, or null. */
  function categoryTag(category) {
    var c = util.trim(category);
    return c ? el('span.cat-tag', c) : null;
  }

  /** External link opened in a new tab; renders nothing for unsafe URLs. */
  function externalLink(url, label, cls) {
    var safe = util.safeUrl(url);
    if (!safe) return null;
    return el('a.ext-link' + (cls ? '.' + cls : ''), {
      href: safe, target: '_blank', rel: 'noopener noreferrer',
      title: safe,
      onclick: function (e) { e.stopPropagation(); }
    }, label + ' ↗');
  }

  App.widgets = {
    NONE: NONE,
    activeCategory: activeCategory,
    byCategory: byCategory,
    categoryBar: categoryBar,
    categoryTag: categoryTag,
    externalLink: externalLink,
    sectionHead: sectionHead,
    emptyState: emptyState,
    rowActions: rowActions,
    taskRow: taskRow,
    toggleTask: toggleTask,
    addButton: addButton,
    projectCard: projectCard,
    progressRing: progressRing,
    linkLabel: linkLabel
  };
})(window.App = window.App || {});
