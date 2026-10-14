/*
 * Sample content for a brand-new database.
 *
 * This is the example data from the original mockup, turned into real
 * records so the dashboard looks exactly like the design the first time it
 * opens — every number on screen is then computed from these rows rather
 * than hard-coded into the markup.
 *
 * Everything here is ordinary editable data. "تنظیمات و پشتیبان" has a
 * one-click button to delete all of it.
 */
(function (App) {
  'use strict';

  var J = App.jalali;

  function build(uid, nowIso) {
    var today = J.todayIso();
    var tj = J.isoToJ(today);
    var thisMonth = J.monthKey(today);
    var months = J.lastMonthKeys(6, thisMonth);   // oldest first

    /** A date inside month key `mk`, on Jalali day `jd` (clamped to the month). */
    function dayIn(mk, jd) {
      var p = mk.split('-');
      var jy = +p[0], jm = +p[1];
      var max = J.daysInJMonth(jy, jm);
      return J.jToIso(jy, jm, Math.min(jd, max));
    }

    function rec(prefix, fields) {
      fields.id = uid(prefix);
      fields.createdAt = nowIso;
      fields.updatedAt = nowIso;
      return fields;
    }

    // ---- goals ----------------------------------------------------------
    var g1 = rec('goal', {
      name: 'درآمد آزاد',
      statement: 'تا پایان اسفند، ماهی ۳۰ میلیون تومان از طراحی سایت درآمد داشته باشم',
      status: 'فعال',
      metric: 'درآمد ماهانه آزاد',
      current: '۰ تومان',
      targetDate: J.jToIso(tj.jy, 12, 29)
    });
    var g2 = rec('goal', {
      name: 'مهارت درآمدزا',
      statement: 'تا پایان پاییز، وردپرس و المنتور را در حد یک پروژه‌ی واقعی بلد باشم',
      status: 'فعال',
      metric: 'دوره‌های تمام‌شده',
      current: '۱ از ۳',
      targetDate: J.jToIso(tj.jy, 9, 30)
    });

    // ---- projects -------------------------------------------------------
    var p1 = rec('proj', {
      name: 'سایت عکاسی (نمونه‌کار)', goalId: g1.id, status: 'در جریان',
      deadline: J.jToIso(tj.jy, 7, 15),
      description: 'یک سایت نمونه‌کار کامل که بتوانم به مشتری نشان بدهم.',
      progressMode: 'manual', progressManual: 65
    });
    var p2 = rec('proj', {
      name: 'یادگیری وردپرس + المنتور', goalId: g2.id, status: 'در جریان',
      deadline: null, description: 'دوره‌ها + تمرین روی پروژه‌ی واقعی.',
      progressMode: 'manual', progressManual: 40
    });
    var p3 = rec('proj', {
      name: 'صفحه‌ی خدمات و قیمت‌گذاری', goalId: g1.id, status: 'بعدی',
      deadline: J.jToIso(tj.jy, 8, 1),
      description: 'سه سطح قیمت، با نمونه‌کار و فرم تماس.',
      progressMode: 'manual', progressManual: 15
    });
    var p4 = rec('proj', {
      name: 'مرتب‌کردن رزومه و نمونه‌کارها', goalId: g1.id, status: 'تمام',
      deadline: dayIn(months[5], 5), description: '',
      progressMode: 'manual', progressManual: 100
    });

    // ---- tasks ----------------------------------------------------------
    function task(title, projectId, date, type, done) {
      return rec('task', {
        title: title, projectId: projectId || '', date: date || null,
        category: type, done: !!done,
        completedAt: done ? nowIso : null
      });
    }
    var tasks = [
      task('صفحه‌ی گالری سایت عکاسی را در المنتور بچین', p1.id, today, 'کار', false),
      task('فصل Flexbox را تمام کن و یک تمرین بنویس', p2.id, today, 'یادگیری', false),
      task('نمونه‌کار اول را در اینستاگرام منتشر کن', p3.id, today, 'کار', false),
      task('گزارش آزمایش بتن دیروز را ثبت کن', '', today, 'کار', true),
      task('بهینه‌سازی تصاویر گالری', p1.id, null, 'کار', false),
      task('تست موبایل صفحه‌ی گالری', p1.id, null, 'کار', false),
      task('تمرین گرید', p2.id, null, 'یادگیری', false),
      task('مرور هفتگی صندوق ورودی', '', J.addDays(today, 3), 'شخصی', false)
    ];

    // ---- accounts -------------------------------------------------------
    var a1 = rec('acct', { name: 'بانک ملی — حساب جاری', type: 'بانک', balance: 21400 });
    var a2 = rec('acct', { name: 'پس‌انداز (صندوق اضطراری)', type: 'پس‌انداز', balance: 24000 });
    var a3 = rec('acct', { name: 'نقد', type: 'نقد', balance: 2800 });
    var a4 = rec('acct', { name: 'طلا / ارز (دارایی)', type: 'دارایی', balance: 78300 });

    // ---- transactions ---------------------------------------------------
    /* `srcId` marks a row that came from a recurring template, exactly as the
       real approval flow does — so the month it covers is not proposed again. */
    function tx(title, dir, amount, category, accountId, date, srcId) {
      return rec('tx', {
        title: title, direction: dir, amount: amount,
        category: dir === 'درآمد' ? '' : category,
        accountId: accountId || '', date: date, srcId: srcId || ''
      });
    }

    var transactions = [];

    // Five closed months, so the six-month chart has real history.
    var history = [
      { income: 28000, bills: 12000, food: 9450 },
      { income: 28000, bills: 11000, food: 8700 },
      { income: 30600, bills: 12500, food: 10000 },
      { income: 28000, bills: 10600, food: 8500 },
      { income: 31000, bills: 12650, food: 10500 }
    ];
    history.forEach(function (m, i) {
      var mk = months[i];
      transactions.push(tx('درآمد ماه', 'درآمد', m.income, '', a1.id, dayIn(mk, 1)));
      transactions.push(tx('خانه و قبض‌ها', 'خرج', m.bills, 'خانه و قبض‌ها', a1.id, dayIn(mk, 5)));
      transactions.push(tx('خوراک ماه', 'خرج', m.food, 'خوراک', a1.id, dayIn(mk, 12)));
    });

    // ---- recurring templates --------------------------------------------
    /* The three monthly items that used to be a checkbox on a transaction.
       Each one starts this month and already has this month's transaction
       below, so a brand-new dashboard opens with nothing waiting for approval;
       next month it will propose all three. */
    var cm = months[5];
    var d = function (jd) { return dayIn(cm, Math.min(jd, tj.jd)); };

    function monthly(title, amount, category, day) {
      return rec('rec', {
        title: title, direction: 'خرج', category: category, amount: amount,
        accountId: a1.id, dayOfMonth: day,
        startDate: d(day), endDate: '', active: true, skipMonths: []
      });
    }
    var r1 = monthly('اینترنت', 350, 'خانه و قبض‌ها', 4);
    var r2 = monthly('هاست و دامنه', 150, 'یادگیری و ابزار', 6);
    var r3 = monthly('دوره‌ی آنلاین', 450, 'یادگیری و ابزار', 6);
    var recurrings = [r1, r2, r3];

    // The current month, itemised. Categories sum to 19,650 and the three
    // recurring rows sum to 950 — the numbers shown in the original design.
    transactions.push(
      tx('پروژه‌ی سایت شرکتی', 'درآمد', 20000, '', a1.id, d(8)),
      tx('حقوق کنترل کیفیت', 'درآمد', 12000, '', a1.id, d(1)),

      tx('اجاره و قبض‌ها', 'خرج', 6850, 'خانه و قبض‌ها', a1.id, d(3)),
      tx('اینترنت', 'خرج', 350, 'خانه و قبض‌ها', a1.id, d(4), r1.id),
      tx('خرید خوراک', 'خرج', 5400, 'خوراک', a1.id, d(10)),
      tx('رفت‌وآمد', 'خرج', 2900, 'رفت‌وآمد', a3.id, d(14)),
      tx('هاست و دامنه', 'خرج', 150, 'یادگیری و ابزار', a1.id, d(6), r2.id),
      tx('دوره‌ی آنلاین', 'خرج', 450, 'یادگیری و ابزار', a1.id, d(6), r3.id),
      tx('کتاب و ابزار طراحی', 'خرج', 1550, 'یادگیری و ابزار', a1.id, d(18)),
      tx('متفرقه', 'خرج', 2000, 'متفرقه', a3.id, d(20))
    );

    // ---- notes ----------------------------------------------------------
    function note(title, content, stage, link, source) {
      return rec('note', {
        title: title, content: content, stage: stage,
        link: link || '', source: source || ''
      });
    }
    var notes = [
      note('', 'قیمت‌گذاری پروژه‌ای بهتر است یا ساعتی؟ فکر کنم پروژه‌ای برای مشتری اول.', 'گذرا'),
      note('', 'ایده: پکیج «سایت عکاس» با سه سطح قیمت.', 'گذرا'),
      note('', 'در المنتور، container بهتر از section است — چرا؟', 'گذرا'),
      note('', 'برای هر پروژه یک چک‌لیست تحویل بنویس: سرعت، موبایل، سئوی پایه.', 'گذرا'),
      note('', 'قبل از قیمت دادن، همیشه یک تماس ۱۵ دقیقه‌ای.', 'گذرا'),

      note('چطور پروژه‌ی طراحی سایت را قیمت می‌دهم',
        'سه سطح، پیش‌پرداخت ۵۰٪، دو بازبینی رایگان.', 'پرورش‌یافته', 'project:' + p3.id),
      note('چرا از کنترل کیفیت به وب می‌روم',
        'دلایل و ریسک‌ها؛ متن پشتیبان برای وقتی انگیزه کم می‌شود.', 'پرورش‌یافته', 'goal:' + g1.id),

      note('تنظیمات هاست و DNS', 'رکوردهای A و CNAME، مراحل نصب SSL.', 'مرجع'),
      note('اسنیپت‌های CSS پرکاربرد', 'وسط‌چین با flex، گرید واکنش‌گرا، truncate متن.', 'مرجع'),
      note('قالب قرارداد و فاکتور', 'بندهای پرداخت، دامنه‌ی کار، تعداد بازبینی.', 'مرجع'),
      note('لیست افزونه‌های وردپرس', 'امنیت، کش، فرم، بکاپ، سئو.', 'مرجع')
    ];

    // ---- courses --------------------------------------------------------
    function course(name, progress, next, status, category) {
      return rec('course', {
        name: name, progress: progress, nextLesson: next, status: status,
        category: category || '', materials: []
      });
    }
    var courses = [
      course('HTML و CSS از پایه', 70, 'Flexbox — تمرین چیدمان کارت', 'فعال', 'طراحی وب'),
      course('وردپرس برای طراحان', 45, 'قالب فرزند و مدیریت پوسته', 'فعال', 'طراحی وب'),
      course('المنتور پیشرفته', 30, 'Container و طراحی واکنش‌گرا', 'فعال', 'طراحی وب'),
      course('مبانی UI/UX', 15, 'سلسله‌مراتب بصری', 'متوقف', 'طراحی UI'),
      course('مبانی جاوااسکریپت', 100, '', 'تمام', 'برنامه‌نویسی')
    ];

    // ---- people ---------------------------------------------------------
    function person(name, context, birthday, category, extra) {
      return rec('person', Object.assign({
        name: name, context: context, birthday: birthday, category: category,
        phone: '', email: '', details: [], notes: '', docUrl: ''
      }, extra || {}));
    }
    var people = [
      person('مادر', 'خانواده', J.jToIso(1340, 6, 28), 'خانواده'),
      person('رضا — عکاس', 'مشتری احتمالی سایت عکاسی', null, 'مشتری احتمالی', {
        details: [
          { label: 'خدمت', value: 'سایت نمونه‌کار عکاسی' },
          { label: 'بودجه‌ی تقریبی', value: '۱۵ میلیون تومان' },
          { label: 'مرحله', value: 'منتظر پیش‌فاکتور' }
        ],
        notes: 'گالری تمام‌صفحه می‌خواهد. قبل از قیمت دادن، نمونه‌ی سایت‌های مشابه را نشانش بده.'
      }),
      person('سارا — طراح وب', 'هم‌مسیر؛ بازخورد نمونه‌کار', J.jToIso(1372, 9, 12), 'حرفه‌ای'),
      person('مدیر کنترل کیفیت', 'کار فعلی؛ مرجع توصیه‌نامه', null, 'حرفه‌ای'),
      person('مینا — عکاس پرتره', 'مشتری احتمالی؛ معرفی از رضا', null, 'مشتری احتمالی')
    ];

    return {
      goals: [g1, g2],
      projects: [p1, p2, p3, p4],
      tasks: tasks,
      notes: notes,
      accounts: [a1, a2, a3, a4],
      transactions: transactions,
      recurrings: recurrings,
      courses: courses,
      people: people
    };
  }

  App.seed = { build: build };
})(window.App = window.App || {});
