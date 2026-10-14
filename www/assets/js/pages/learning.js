/* یادگیری — courses, their progress and their study materials. */
(function (App) {
  'use strict';

  var el = App.el;
  var util = App.util;
  var db = App.db;
  var stats = App.stats;
  var W = App.widgets;

  function render() {
    var all = db.list('courses').sort(function (a, b) {
      var rank = { 'فعال': 0, 'متوقف': 1, 'تمام': 2 };
      var d = (rank[a.status] == null ? 9 : rank[a.status]) -
              (rank[b.status] == null ? 9 : rank[b.status]);
      return d !== 0 ? d : (Number(b.progress) || 0) - (Number(a.progress) || 0);
    });
    var courses = W.byCategory('courses', all);
    var s = stats.courseStats();

    function addCourse() {
      App.crud.create('courses', { category: W.activeCategory('courses') });
    }

    return el('div', [
      el('div.eyebrow', 'COURSES · PROGRESS · MATERIALS'),
      el('h1.page-title.page-title--tight', 'یادگیری'),
      el('p.page-lede',
        'دوره‌ها، درصد پیشرفت و جزوه‌ها. درصد را دستی به‌روز می‌کنی؛ برای هر درس هم می‌توانی ' +
        'لینک سند Google Docs جزوه‌اش را کنار دوره نگه داری.'),

      W.categoryBar('courses', all),

      courses.length
        ? el('div.stack', courses.map(courseRow))
        : W.emptyState(all.length ? 'در این دسته دوره‌ای نیست.' : 'هنوز دوره‌ای اضافه نکرده‌ای.',
            'اولین دوره', addCourse),

      el('div', [W.addButton('دوره‌ی جدید', addCourse)]),

      el('div.stat-grid.autogrid--stats3.mt-24', [
        smallStat('میانگین پیشرفت', util.faPct(s.averageProgress)),
        smallStat('دوره‌ی فعال', util.toFa(s.active)),
        smallStat('تمام‌شده', util.toFa(s.completed))
      ])
    ]);
  }

  function smallStat(label, value) {
    return el('div.stat.stat--sm', { style: { padding: '14px 16px' } }, [
      el('div.stat__label', label),
      el('div.stat__value.stat__value--xs', value)
    ]);
  }

  function courseRow(course) {
    var pct = util.clamp(Number(course.progress) || 0, 0, 100);
    var muted = course.status !== 'فعال';
    var materials = (course.materials || []).filter(function (m) { return util.safeUrl(m.value) || m.label; });

    return el('div.course.row', [
      W.progressRing(pct, muted),
      el('div.course__body', [
        el('div', {
          style: { cursor: 'pointer' },
          onclick: function () { App.crud.edit('courses', course.id); }
        }, [
          el('div.course__name', [course.name, course.category ? ' ' : null, W.categoryTag(course.category)]),
          el('div.course__next', course.status === 'تمام'
            ? 'تمام شد'
            : (course.nextLesson ? 'درس بعدی: ' + course.nextLesson : 'درس بعدی نوشته نشده'))
        ]),
        materials.length
          ? el('div.materials', [
              el('span.materials__label', 'جزوه‌ها:'),
              materials.map(function (m, i) {
                var label = util.trim(m.label) || ('جزوه ' + util.toFa(i + 1));
                return W.externalLink(m.value, label, 'materials__link') ||
                  el('span.materials__link.is-missing', { title: 'لینک ندارد' }, label);
              })
            ])
          : el('button.btn-add.btn-add--inline.materials__add', {
              type: 'button',
              onclick: function () { App.crud.edit('courses', course.id); }
            }, '+ لینک جزوه')
      ]),
      el('div.row-actions', [
        el('button.icon-btn', {
          type: 'button', title: 'کم‌کردن ۵ درصد', 'aria-label': 'کم‌کردن پیشرفت',
          onclick: function () { bump(course, -5); }
        }, '−' + util.toFa(5)),
        el('button.icon-btn', {
          type: 'button', title: 'افزودن ۵ درصد', 'aria-label': 'افزودن پیشرفت',
          onclick: function () { bump(course, 5); }
        }, '+' + util.toFa(5)),
        el('button.icon-btn', {
          type: 'button', onclick: function () { App.crud.edit('courses', course.id); }
        }, 'ویرایش'),
        el('button.icon-btn.icon-btn--danger', {
          type: 'button', onclick: function () { App.crud.destroy('courses', course.id); }
        }, 'حذف')
      ])
    ]);
  }

  /** Nudging a course to 100% also marks it finished — that is what it means. */
  function bump(course, delta) {
    var next = util.clamp((Number(course.progress) || 0) + delta, 0, 100);
    var patch = { progress: next };
    if (next === 100 && course.status !== 'تمام') patch.status = 'تمام';
    if (next < 100 && course.status === 'تمام') patch.status = 'فعال';
    db.update('courses', course.id, patch);
  }

  App.pages = App.pages || {};
  App.pages.learning = { id: 'learning', label: 'یادگیری', render: render };
})(window.App = window.App || {});
