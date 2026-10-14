/* اهداف و پروژه‌ها — goals, the projects hanging off them, and open tasks. */
(function (App) {
  'use strict';

  var el = App.el;
  var util = App.util;
  var db = App.db;
  var J = App.jalali;
  var stats = App.stats;
  var W = App.widgets;

  function render() {
    var goals = db.list('goals');
    var active = goals.filter(function (g) { return g.status === 'فعال'; });
    var archived = goals.filter(function (g) { return g.status !== 'فعال'; });

    return el('div', [
      el('div.eyebrow', 'GOALS → PROJECTS → TASKS'),
      el('h1.page-title.page-title--tight', 'اهداف و پروژه‌ها'),
      el('p.page-lede',
        'هر پروژه باید به یک هدف وصل باشد. اگر پروژه‌ای به هیچ هدفی وصل نیست، ' +
        'یا هدفش را ننوشته‌ای یا لازم نیست انجامش بدهی.'),

      active.length
        ? el('div.stack.mb-30', active.map(goalCard))
        : W.emptyState('هیچ هدف فعالی نداری. سیستم بدون هدف، فقط یک فهرست کار است.',
            'اولین هدف را بنویس', function () { App.crud.create('goals'); }),

      el('div.mb-30', { style: { 'margin-top': '-18px' } }, [
        W.addButton('هدف جدید', function () { App.crud.create('goals'); }, true)
      ]),

      archived.length ? archivedGoals(archived) : null,

      W.sectionHead('پروژه‌ها', null, { margin: '0 0 4px' }),
      W.categoryBar('projects', db.list('projects'), { margin: '12px 0 14px' }),
      projectsTable(),
      el('div', [W.addButton('پروژه‌ی جدید', function () {
        App.crud.create('projects', { category: W.activeCategory('projects') });
      })]),

      W.sectionHead('کارها — گروه‌شده بر اساس پروژه', null, { margin: '36px 0 4px' }),
      el('div.hint', { style: { margin: '8px 0 4px' } },
        'همه‌ی کارهای انجام‌نشده، کنار پروژه‌ای که به آن وصل‌اند. ' +
        'در صفحه‌ی خانه همین کارها با فیلتر «تاریخ = امروز» دیده می‌شوند.'),
      W.categoryBar('tasks', db.list('tasks', function (t) { return !t.done; }), { margin: '10px 0 16px' }),
      taskGroups()
    ]);
  }

  function goalCard(goal) {
    var year = goal.targetDate ? (J.isoToJ(goal.targetDate) || {}).jy : null;
    var connected = stats.connectedProjectCount(goal.id);

    return el('div.card.card--pad.card--strong.row', {
      style: { padding: '20px 22px' }
    }, [
      el('div', {
        style: { display: 'flex', 'align-items': 'baseline', 'justify-content': 'space-between', gap: '12px' }
      }, [
        el('div.eyebrow.eyebrow--accent', {
          style: { 'margin-bottom': '10px' }
        }, 'هدف فعال' + (year ? ' ' + util.toFa(year) : '')),
        W.rowActions(
          function () { App.crud.edit('goals', goal.id); },
          function () { App.crud.destroy('goals', goal.id, 'پروژه‌های متصل پاک نمی‌شوند، فقط بی‌هدف می‌مانند.'); }
        )
      ]),
      el('div', {
        style: { 'font-size': '21px', 'font-weight': '700', 'line-height': '1.5', 'margin-bottom': '16px' }
      }, util.trim(goal.statement) || goal.name),
      el('div', {
        style: { display: 'flex', 'flex-wrap': 'wrap', gap: '26px', 'font-size': '12.5px', color: 'var(--ink-2)' }
      }, [
        metaItem('وضعیت', goal.status),
        goal.category ? metaItem('دسته', goal.category) : null,
        metaItem('پروژه‌های متصل', util.toFa(connected)),
        goal.metric ? metaItem('سنجه', goal.metric) : null,
        goal.current ? metaItem('حالا', goal.current) : null,
        goal.targetDate ? metaItem('تاریخ هدف', J.format(goal.targetDate, true)) : null
      ])
    ]);
  }

  function metaItem(label, value) {
    return el('div', [el('span.muted', label), ' · ', value]);
  }

  function archivedGoals(goals) {
    return el('div.mb-30', [
      W.sectionHead('اهداف بسته‌شده', util.toFa(goals.length), { flush: true }),
      el('div', goals.map(function (g) {
        return el('div.money-row.row', [
          el('span.money-row__label', [
            g.name,
            el('span.muted', { style: { 'font-size': '12px' } }, ' · ' + g.status)
          ]),
          W.rowActions(
            function () { App.crud.edit('goals', g.id); },
            function () { App.crud.destroy('goals', g.id); }
          )
        ]);
      }))
    ]);
  }

  function projectsTable() {
    var all = db.list('projects');
    var projects = W.byCategory('projects', all).sort(function (a, b) {
      var order = { 'در جریان': 0, 'بعدی': 1, 'متوقف': 2, 'تمام': 3 };
      var d = (order[a.status] == null ? 9 : order[a.status]) -
              (order[b.status] == null ? 9 : order[b.status]);
      return d !== 0 ? d : util.byKey('deadline')(a, b);
    });

    if (!projects.length) {
      return all.length
        ? W.emptyState('در این دسته پروژه‌ای نیست.', null, null, false)
        : W.emptyState('هنوز پروژه‌ای نساخته‌ای.', 'اولین پروژه', function () {
            App.crud.create('projects');
          });
    }

    return el('div.table', [
      el('div.table__head.grid-projects', [
        el('div', 'پروژه'),
        el('div', 'هدف'),
        el('div', 'وضعیت'),
        el('div', 'مهلت'),
        el('div', '')
      ])
    ].concat(projects.map(projectRow)));
  }

  function projectRow(project) {
    var goal = project.goalId ? db.get('goals', project.goalId) : null;
    var done = project.status === 'تمام';
    var pct = stats.projectProgress(project);

    return el('div.table__row.grid-projects.row' + (done ? '.is-dim' : ''), [
      el('div.cell-strong', {
        style: { cursor: 'pointer' },
        onclick: function () { App.crud.edit('projects', project.id); }
      }, [
        project.name,
        el('div.person-meta', [
          el('span.num.muted', util.faPct(pct) + ' پیشرفت'),
          W.categoryTag(project.category)
        ])
      ]),
      el('div' + (goal ? '.cell-accent' : '.muted'), goal ? goal.name : 'بدون هدف'),
      el('div.cell-status', project.status),
      el('div.cell-num', project.deadline ? J.format(project.deadline) : '—'),
      el('div', { style: { display: 'flex', 'justify-content': 'flex-end' } }, [
        W.rowActions(
          function () { App.crud.edit('projects', project.id); },
          function () {
            App.crud.destroy('projects', project.id, 'کارهای این پروژه پاک نمی‌شوند، فقط بی‌پروژه می‌مانند.');
          }
        )
      ])
    ]);
  }

  function taskGroups() {
    var groups = stats.openTasksByProject(function (t) {
      return W.byCategory('tasks', [t]).length > 0;
    });
    if (!groups.length) {
      return W.emptyState(W.activeCategory('tasks') ? 'در این دسته کار بازی نیست.' : 'هیچ کار بازی نمانده.',
        'کار جدید', function () {
          App.crud.create('tasks', { category: W.activeCategory('tasks') });
        });
    }

    return el('div.autogrid.autogrid--tasks', groups.map(function (g) {
      return el('div.card', [
        el('div', {
          style: {
            'font-size': '12.5px', 'font-weight': '600', 'margin-bottom': '10px',
            color: g.accent ? 'var(--accent)' : 'var(--muted)'
          }
        }, [g.label, el('span.num', ' · ' + util.toFa(g.tasks.length))]),
        el('div', { style: { 'font-size': '13.5px', color: 'var(--ink-2)' } },
          g.tasks.map(function (t) { return groupTaskLine(t); })),
        W.addButton('کار', function () {
          App.crud.create('tasks', { projectId: g.id || '', category: W.activeCategory('tasks') });
        }, true)
      ]);
    }));
  }

  function groupTaskLine(task) {
    return el('div.row', {
      style: { display: 'flex', 'align-items': 'center', gap: '8px', 'line-height': '2.1' }
    }, [
      el('button.task__box', {
        type: 'button',
        role: 'checkbox',
        'aria-checked': 'false',
        'aria-label': 'انجام شد',
        onclick: function () { W.toggleTask(task.id); }
      }),
      el('span', {
        style: { flex: '1 1 auto', cursor: 'pointer', 'min-width': '0' },
        onclick: function () { App.crud.edit('tasks', task.id); }
      }, [task.title, task.category ? ' ' : null, W.categoryTag(task.category)]),
      W.rowActions(null, function () { App.crud.destroy('tasks', task.id); })
    ]);
  }

  App.pages = App.pages || {};
  App.pages.goals = { id: 'goals', label: 'اهداف و پروژه‌ها', group: 'ساختن', render: render };
})(window.App = window.App || {});
