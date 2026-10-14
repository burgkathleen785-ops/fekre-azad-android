/*
 * Schema — the single source of truth for what a record looks like.
 *
 * The field lists below drive three things at once: the edit forms, the
 * validation, and the import checker. Adding a field to a collection here
 * makes it appear in that collection's modal automatically; no form markup
 * anywhere in the app is written by hand.
 *
 * The collections and field names come from the original design, which
 * already specified this exact data model.
 *
 * Version 2 added: a user-managed `category` on every section (replacing the
 * fixed task "type" and person "tag" lists), profile fields for people, and
 * study-material links for courses. db.normalise() migrates version-1 data.
 *
 * Version 3 added: `recurrings` — templates for bills and salaries that
 * repeat every month — and the encrypted vault. The vault is NOT a
 * collection: its records never exist in this document in readable form, so
 * they cannot live in `data`. One sealed blob sits at doc.vault instead and
 * only App.vault can open it. See core/vault.js.
 *
 * Version 4 added the car logbook (`vehicles`, `services`, `insurances`) and
 * `settings.modules`, which lets each person switch whole sections off. A
 * switched-off section keeps its data — it is hidden, never deleted.
 */
(function (App) {
  'use strict';

  var util = App.util;
  var J = App.jalali;

  var SCHEMA_VERSION = 4;

  var GOAL_STATUS = ['فعال', 'رسیده', 'رها'];
  var PROJECT_STATUS = ['بعدی', 'در جریان', 'متوقف', 'تمام'];
  var NOTE_STAGE = ['گذرا', 'پرورش‌یافته', 'مرجع'];
  var ACCOUNT_TYPE = ['بانک', 'پس‌انداز', 'نقد', 'دارایی'];
  var DIRECTION = ['درآمد', 'خرج'];
  var COURSE_STATUS = ['فعال', 'متوقف', 'تمام'];
  var INSURANCE_KIND = ['شخص ثالث', 'بدنه', 'حوادث راننده', 'دیگر'];

  /**
   * Sections that carry a user-managed category list, in the order they are
   * shown in settings. The lists themselves live in settings.categories so
   * they travel with backups and can be edited without touching code.
   */
  var CATEGORY_SECTIONS = [
    { collection: 'goals',        label: 'اهداف' },
    { collection: 'projects',     label: 'پروژه‌ها' },
    { collection: 'tasks',        label: 'کارها' },
    { collection: 'notes',        label: 'یادداشت‌ها' },
    { collection: 'transactions', label: 'تراکنش‌ها' },
    { collection: 'courses',      label: 'دوره‌ها' },
    { collection: 'people',       label: 'افراد' },
    { collection: 'services',     label: 'سرویس ماشین' },
    { collection: 'vault',        label: 'محرمانه' }
  ];

  /**
   * Sections that borrow another section's category list instead of keeping
   * their own. A recurring bill becomes a transaction, so the two must offer
   * the same categories — two lists would drift apart immediately.
   */
  var CATEGORY_SOURCE = { recurrings: 'transactions' };

  function catSource(collection) {
    return CATEGORY_SOURCE[collection] || collection;
  }

  var DEFAULT_CATEGORIES = {
    goals: ['مالی', 'مهارت', 'شخصی'],
    projects: ['مشتری', 'نمونه‌کار', 'شخصی'],
    tasks: ['کار', 'یادگیری', 'شخصی'],
    notes: ['کاری', 'آموزشی', 'شخصی'],
    transactions: ['خانه و قبض‌ها', 'خوراک', 'رفت‌وآمد', 'یادگیری و ابزار', 'سلامت', 'متفرقه', 'حقوق', 'پروژه'],
    courses: ['طراحی وب', 'برنامه‌نویسی', 'طراحی UI'],
    people: ['خانواده', 'حرفه‌ای', 'مشتری احتمالی', 'مشتری'],
    services: ['موتور', 'ترمز', 'لاستیک و تعلیق', 'برق و باتری', 'تسمه و فیلتر', 'بدنه', 'دوره‌ای'],
    vault: ['بانکی', 'سایت‌ها', 'کاری', 'شخصی']
  };

  /** Select options built from another collection. */
  function relation(collection, empty) {
    return function () {
      var opts = App.db.list(collection)
        .map(function (r) { return { value: r.id, label: r.name || r.title || '—' }; })
        .sort(function (a, b) { return a.label.localeCompare(b.label, 'fa'); });
      return [{ value: '', label: empty || '—' }].concat(opts);
    };
  }

  /** Goals + projects in one select, encoded as "goal:<id>" / "project:<id>". */
  function goalOrProjectOptions() {
    var out = [{ value: '', label: 'وصل نیست' }];
    App.db.list('goals').forEach(function (g) {
      out.push({ value: 'goal:' + g.id, label: 'هدف · ' + g.name });
    });
    App.db.list('projects').forEach(function (p) {
      out.push({ value: 'project:' + p.id, label: 'پروژه · ' + p.name });
    });
    return out;
  }

  /** Today's day number in the Jalali month — the usual answer for a bill. */
  function todayDayOfMonth() {
    var j = J.isoToJ(J.todayIso());
    return j ? j.jd : 1;
  }

  function categoryField(label) {
    return { name: 'category', label: label || 'دسته', type: 'category' };
  }

  var COLLECTIONS = {
    goals: {
      singular: 'هدف',
      plural: 'اهداف',
      titleField: 'name',
      fields: [
        { name: 'name', label: 'نام کوتاه', type: 'text', required: true,
          hint: 'یکی دو کلمه — همین روی کارت پروژه‌ها دیده می‌شود. مثل: درآمد آزاد' },
        { name: 'statement', label: 'جمله‌ی هدف', type: 'textarea',
          hint: 'کامل و قابل سنجش بنویس. همین متن روی کارت هدف فعال می‌آید.' },
        { name: 'status', label: 'وضعیت', type: 'select', options: GOAL_STATUS, default: 'فعال', half: true },
        categoryField(),
        { name: 'metric', label: 'سنجه', type: 'text', placeholder: 'درآمد ماهانه آزاد', half: true },
        { name: 'current', label: 'حالا', type: 'text', placeholder: '۰ تومان', half: true },
        { name: 'targetDate', label: 'تاریخ هدف', type: 'jdate' }
      ]
    },

    projects: {
      singular: 'پروژه',
      plural: 'پروژه‌ها',
      titleField: 'name',
      fields: [
        { name: 'name', label: 'نام پروژه', type: 'text', required: true },
        { name: 'goalId', label: 'هدف', type: 'select', options: relation('goals', 'بدون هدف'),
          hint: 'پروژه‌ای که به هیچ هدفی وصل نیست، احتمالاً لازم نیست.' },
        { name: 'status', label: 'وضعیت', type: 'select', options: PROJECT_STATUS, default: 'بعدی', half: true },
        categoryField(),
        { name: 'deadline', label: 'مهلت', type: 'jdate' },
        { name: 'description', label: 'توضیح', type: 'textarea' },
        { name: 'progressMode', label: 'درصد پیشرفت', type: 'select', default: 'auto',
          options: [
            { value: 'auto', label: 'خودکار — از روی کارهای انجام‌شده' },
            { value: 'manual', label: 'دستی — عددی که خودم می‌نویسم' }
          ] },
        { name: 'progressManual', label: 'درصد دستی', type: 'number', min: 0, max: 100,
          showIf: function (v) { return v.progressMode === 'manual'; },
          hint: 'عددی بین ۰ تا ۱۰۰' }
      ]
    },

    tasks: {
      singular: 'کار',
      plural: 'کارها',
      titleField: 'title',
      fields: [
        { name: 'title', label: 'کار', type: 'text', required: true, placeholder: 'چه کاری؟' },
        { name: 'projectId', label: 'پروژه', type: 'select', options: relation('projects', 'بدون پروژه') },
        { name: 'date', label: 'تاریخ', type: 'jdate', hint: 'خالی بگذار اگر تاریخ مشخصی ندارد.' },
        categoryField('نوع / دسته'),
        { name: 'done', label: 'انجام شده', type: 'checkbox' }
      ]
    },

    notes: {
      singular: 'یادداشت',
      plural: 'یادداشت‌ها',
      titleField: 'title',
      fields: [
        { name: 'title', label: 'عنوان', type: 'text',
          hint: 'برای یادداشت گذرا می‌تواند خالی باشد.' },
        { name: 'content', label: 'متن', type: 'textarea', rows: 7 },
        { name: 'stage', label: 'مرحله', type: 'select', options: NOTE_STAGE, default: 'گذرا', half: true },
        categoryField(),
        { name: 'link', label: 'وصل به', type: 'select', options: goalOrProjectOptions },
        { name: 'source', label: 'منبع', type: 'url', placeholder: 'https://…' }
      ],
      validate: function (v) {
        if (!util.trim(v.title) && !util.trim(v.content)) {
          return 'یادداشت باید دست‌کم عنوان یا متن داشته باشد.';
        }
        return null;
      }
    },

    accounts: {
      singular: 'حساب',
      plural: 'حساب‌ها',
      titleField: 'name',
      fields: [
        { name: 'name', label: 'نام حساب', type: 'text', required: true },
        { name: 'type', label: 'نوع', type: 'select', options: ACCOUNT_TYPE, default: 'بانک',
          hint: '«دارایی» در موجودی کل حساب نمی‌شود، ولی در ارزش خالص می‌آید.' },
        { name: 'balance', label: 'موجودی', type: 'number', required: true, unit: true, default: 0 }
      ]
    },

    transactions: {
      singular: 'تراکنش',
      plural: 'تراکنش‌ها',
      titleField: 'title',
      fields: [
        { name: 'title', label: 'بابت', type: 'text', required: true },
        { name: 'direction', label: 'جهت', type: 'select', options: DIRECTION, default: 'خرج', half: true },
        categoryField(),
        { name: 'amount', label: 'مبلغ', type: 'number', required: true, min: 0, unit: true },
        { name: 'accountId', label: 'حساب', type: 'select', options: relation('accounts', 'نامشخص') },
        { name: 'date', label: 'تاریخ', type: 'jdate', required: true, default: J.todayIso }
      ]
    },

    recurrings: {
      singular: 'مورد تکرارشونده',
      plural: 'موارد تکرارشونده',
      titleField: 'title',
      fields: [
        { name: 'title', label: 'بابت', type: 'text', required: true,
          placeholder: 'اشتراک اینترنت',
          hint: 'همین عنوان روی تراکنشی که هر ماه ساخته می‌شود می‌نشیند.' },
        { name: 'direction', label: 'جهت', type: 'select', options: DIRECTION, default: 'خرج', half: true },
        categoryField(),
        { name: 'amount', label: 'مبلغ ماهانه', type: 'number', required: true, min: 0, unit: true },
        { name: 'accountId', label: 'حساب', type: 'select', options: relation('accounts', 'نامشخص') },
        { name: 'dayOfMonth', label: 'روز ماه', type: 'number', required: true, min: 1, max: 31,
          half: true, default: todayDayOfMonth,
          hint: 'در ماه‌های کوتاه‌تر، آخرین روز ماه استفاده می‌شود.' },
        { name: 'startDate', label: 'از تاریخ', type: 'jdate', required: true, default: J.todayIso,
          hint: 'ماهِ همین تاریخ، اولین ماهی است که پیشنهاد می‌شود.' },
        { name: 'endDate', label: 'تا تاریخ', type: 'jdate',
          hint: 'خالی بگذار اگر پایانی ندارد.' },
        { name: 'active', label: 'فعال است', type: 'checkbox', default: true }
      ],
      validate: function (v) {
        if (v.endDate && v.startDate && v.endDate < v.startDate) {
          return 'تاریخ پایان از تاریخ شروع جلوتر است.';
        }
        return null;
      }
    },

    courses: {
      singular: 'دوره',
      plural: 'دوره‌ها',
      titleField: 'name',
      fields: [
        { name: 'name', label: 'نام دوره', type: 'text', required: true },
        { name: 'status', label: 'وضعیت', type: 'select', options: COURSE_STATUS, default: 'فعال', half: true },
        categoryField(),
        { name: 'progress', label: 'درصد پیشرفت', type: 'number', min: 0, max: 100, default: 0 },
        { name: 'nextLesson', label: 'درس بعدی', type: 'text' },
        { name: 'materials', label: 'جزوه‌ها و منابع مطالعه', type: 'pairs',
          keyLabel: 'درس / جلسه', valueLabel: 'لینک Google Docs', valueType: 'url',
          keyPlaceholder: 'جلسه‌ی ۳ — Flexbox',
          valuePlaceholder: 'https://docs.google.com/document/d/…',
          addLabel: 'جزوه‌ی جدید',
          hint: 'برای هر درس یک ردیف: عنوان درس و لینک سندی که جزوه‌اش در آن است.' }
      ]
    },

    people: {
      singular: 'شخص',
      plural: 'افراد',
      titleField: 'name',
      fields: [
        { name: 'name', label: 'نام', type: 'text', required: true },
        { name: 'context', label: 'نقش / زمینه', type: 'text', half: true },
        categoryField(),
        { name: 'phone', label: 'تلفن', type: 'tel', half: true, placeholder: '0912…' },
        { name: 'email', label: 'ایمیل', type: 'email', half: true, placeholder: 'name@example.com' },
        { name: 'birthday', label: 'تولد', type: 'jdate', partial: true,
          hint: 'اگر سال را نمی‌دانی، فقط روز و ماه را بنویس — مثل «۱۲ اسفند» یا «۱۲/۱۲».' },
        { name: 'details', label: 'جزئیات بیشتر', type: 'pairs',
          keyLabel: 'عنوان', valueLabel: 'مقدار',
          keyPlaceholder: 'مثلاً: خدمت / بودجه / شرکت',
          valuePlaceholder: 'سایت نمونه‌کار — ۱۵ میلیون',
          addLabel: 'ردیف جدید',
          hint: 'هر اطلاعاتی که برای این شخص مهم است — مثلاً برای مشتری: خدمت، بودجه، مرحله‌ی کار.' },
        { name: 'notes', label: 'یادداشت', type: 'textarea', rows: 5 },
        { name: 'docUrl', label: 'لینک سند Google Docs', type: 'url',
          placeholder: 'https://docs.google.com/document/d/…',
          hint: 'سندی که اطلاعات کامل این شخص یا پروژه‌اش در آن است.' }
      ]
    },

    vehicles: {
      singular: 'ماشین',
      plural: 'ماشین‌ها',
      titleField: 'name',
      fields: [
        { name: 'name', label: 'نام ماشین', type: 'text', required: true, placeholder: 'پژو ۲۰۶ سفید' },
        { name: 'plate', label: 'پلاک', type: 'text', half: true },
        { name: 'modelYear', label: 'مدل', type: 'text', half: true, placeholder: '۱۳۹۸' },
        { name: 'odometer', label: 'کیلومتر فعلی', type: 'number', min: 0, default: 0,
          hint: 'همین عدد مبنای همه‌ی یادآوری‌های سرویس است. هر چند وقت یک بار به‌روزش کن.' },
        { name: 'notes', label: 'یادداشت', type: 'textarea', rows: 3 }
      ]
    },

    services: {
      singular: 'سرویس',
      plural: 'سرویس‌ها و قطعات',
      titleField: 'part',
      fields: [
        { name: 'part', label: 'قطعه / کاری که انجام شد', type: 'text', required: true,
          placeholder: 'روغن موتور و فیلتر' },
        { name: 'vehicleId', label: 'ماشین', type: 'select', options: relation('vehicles', 'انتخاب کن') },
        categoryField(),
        { name: 'date', label: 'تاریخ تعویض', type: 'jdate', default: J.todayIso, half: true },
        { name: 'km', label: 'کیلومتر تعویض', type: 'number', required: true, min: 0,
          hint: 'کیلومتر ماشین در همان روزی که این کار انجام شد.' },
        { name: 'nextKm', label: 'کیلومتر تعویض بعدی', type: 'number', min: 0,
          hint: 'خالی بگذار اگر تعویض بعدی ندارد. وقتی نزدیک شود در صفحه‌ی خانه یادآوری می‌شود.' },
        { name: 'brand', label: 'برند خریداری‌شده', type: 'text', half: true, placeholder: 'بهران' },
        { name: 'cost', label: 'هزینه', type: 'number', min: 0, half: true, unit: true },
        { name: 'place', label: 'کجا انجام شد', type: 'text' },
        { name: 'notes', label: 'توضیحات', type: 'textarea', rows: 3 }
      ],
      validate: function (v) {
        if (v.nextKm && v.km && v.nextKm <= v.km) {
          return 'کیلومتر تعویض بعدی باید از کیلومتر این تعویض بیشتر باشد.';
        }
        return null;
      }
    },

    insurances: {
      singular: 'بیمه‌نامه',
      plural: 'بیمه‌نامه‌ها',
      titleField: 'company',
      fields: [
        { name: 'company', label: 'شرکت بیمه', type: 'text', required: true, placeholder: 'بیمه‌ی ایران' },
        { name: 'vehicleId', label: 'ماشین', type: 'select', options: relation('vehicles', 'انتخاب کن') },
        { name: 'kind', label: 'نوع بیمه', type: 'select', options: INSURANCE_KIND, default: 'شخص ثالث', half: true },
        { name: 'policyNo', label: 'شماره بیمه‌نامه', type: 'text', half: true },
        { name: 'from', label: 'از تاریخ', type: 'jdate', required: true, default: J.todayIso, half: true },
        { name: 'to', label: 'تا تاریخ', type: 'jdate', required: true, half: true,
          hint: 'یک ماه مانده به این تاریخ، در صفحه‌ی خانه یادآوری می‌شود.' },
        { name: 'amount', label: 'حق بیمه', type: 'number', min: 0, unit: true },
        { name: 'agent', label: 'کجا بیمه کردی', type: 'text', placeholder: 'نمایندگی ۲۳۴۵ — خیابان…' },
        { name: 'notes', label: 'یادداشت', type: 'textarea', rows: 3 }
      ],
      validate: function (v) {
        if (v.from && v.to && v.to <= v.from) return 'تاریخ پایان باید بعد از تاریخ شروع باشد.';
        return null;
      }
    }
  };

  var COLLECTION_NAMES = Object.keys(COLLECTIONS);

  /**
   * The sections that can be switched off, in menu order. Home and settings
   * are missing on purpose: there would be nothing left to switch them back
   * on from.
   */
  var MODULES = [
    { id: 'goals',    label: 'اهداف و پروژه‌ها', pages: ['goals'] },
    { id: 'money',    label: 'پول',             pages: ['money'] },
    { id: 'notes',    label: 'یادداشت‌ها و فکرها', pages: ['notes'] },
    { id: 'learning', label: 'یادگیری',          pages: ['learning'] },
    { id: 'people',   label: 'افراد',            pages: ['people'] },
    { id: 'car',      label: 'ماشین',            pages: ['car'] },
    { id: 'vault',    label: 'محرمانه',          pages: ['vault'] }
  ];

  var DEFAULT_MODULES = (function () {
    var out = {};
    MODULES.forEach(function (m) { out[m.id] = true; });
    return out;
  })();

  /** Which module a page belongs to, or null when it can never be hidden. */
  function moduleOfPage(pageId) {
    for (var i = 0; i < MODULES.length; i++) {
      if (MODULES[i].pages.indexOf(pageId) !== -1) return MODULES[i].id;
    }
    return null;
  }

  var DEFAULT_SETTINGS = {
    workspaceTitle: 'فکر آزاد',
    unit: 'هزار تومان',
    monthlyBudget: 24000,
    startPage: 'home',

    // appearance — applied by App.theme
    themeMode: 'light',         // light | dark | system
    accent: '#1e4fd8',          // Fekre Azad brand blue
    posColor: '#2f6f4f',
    negColor: '#b4453a',
    font: 'estedad',
    numFont: 'same',
    digits: 'fa',               // fa | en
    customFont: '',
    customFontUrl: '',

    categories: DEFAULT_CATEGORIES,

    // Sections the user wants to see. Switching one off hides its page, its
    // home-page cards and its reminders — the data stays exactly where it is.
    modules: DEFAULT_MODULES,

    // The vault locks itself after this many idle minutes. 0 = only manually.
    vaultLockMinutes: 10,

    // Last release whose "what's new" note this account has seen. Lives here
    // rather than in localStorage so it is the same on every device.
    seenVersion: ''
  };

  /** A blank record with every field at its declared default. */
  function blank(collection) {
    var def = COLLECTIONS[collection];
    var out = {};
    def.fields.forEach(function (f) {
      out[f.name] = defaultOf(f);
    });
    return out;
  }

  function defaultOf(f) {
    var d = f.default;
    if (typeof d === 'function') d = d();
    if (d !== undefined) return d;
    if (f.type === 'checkbox') return false;
    if (f.type === 'pairs') return [];
    return '';
  }

  /**
   * Coerce + validate a submitted form value bag against the schema.
   * Returns { values } or { errors: {field: message}, formError }.
   */
  function coerce(collection, raw) {
    var def = COLLECTIONS[collection];
    var out = {};
    var errors = {};

    def.fields.forEach(function (f) {
      var v = raw[f.name];

      if (f.showIf && !f.showIf(raw)) {
        // Field is hidden for this combination — keep the declared default.
        out[f.name] = defaultOf(f);
        return;
      }

      switch (f.type) {
        case 'checkbox':
          out[f.name] = !!v;
          break;

        case 'number': {
          var n = util.parseNum(v);
          if (n === null) {
            if (f.required) errors[f.name] = 'این عدد لازم است';
            out[f.name] = f.required ? 0 : null;
          } else if (isNaN(n)) {
            errors[f.name] = 'عدد معتبر نیست';
          } else {
            if (f.min != null && n < f.min) errors[f.name] = 'نباید کمتر از ' + util.toFa(f.min) + ' باشد';
            if (f.max != null && n > f.max) errors[f.name] = 'نباید بیشتر از ' + util.toFa(f.max) + ' باشد';
            out[f.name] = n;
          }
          break;
        }

        case 'jdate': {
          // `partial` fields (a birthday) may come back as "--MM-DD".
          var parsed = J.parseInput(v, { partial: !!f.partial });
          if (parsed.error) errors[f.name] = parsed.error;
          else if (!parsed.iso && f.required) errors[f.name] = 'تاریخ لازم است';
          else out[f.name] = parsed.iso;
          break;
        }

        case 'url': {
          var u = normaliseUrl(v);
          if (u && !util.safeUrl(u)) errors[f.name] = 'لینک معتبر نیست — با https:// شروع کن';
          out[f.name] = u;
          break;
        }

        case 'email': {
          var e = util.trim(v);
          if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) errors[f.name] = 'ایمیل معتبر نیست';
          out[f.name] = e;
          break;
        }

        case 'pairs': {
          var rows = [];
          var bad = false;
          (Array.isArray(v) ? v : []).forEach(function (p) {
            var key = util.trim(p && p.label);
            var val = util.trim(p && p.value);
            if (!key && !val) return;
            if (f.valueType === 'url') {
              val = normaliseUrl(val);
              if (val && !util.safeUrl(val)) bad = true;
            }
            rows.push({ label: key, value: val });
          });
          if (bad) errors[f.name] = 'یکی از لینک‌ها معتبر نیست — با https:// شروع کن';
          out[f.name] = rows;
          break;
        }

        default: {
          var s = util.trim(v);
          if (f.required && !s) errors[f.name] = 'این فیلد لازم است';
          out[f.name] = s;
        }
      }
    });

    var formError = null;
    if (def.validate && !Object.keys(errors).length) formError = def.validate(out);

    if (Object.keys(errors).length || formError) {
      return { errors: errors, formError: formError };
    }
    return { values: out };
  }

  function normaliseUrl(v) {
    var u = util.trim(v);
    if (u && !/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
    return u;
  }

  App.schema = {
    VERSION: SCHEMA_VERSION,
    COLLECTIONS: COLLECTIONS,
    NAMES: COLLECTION_NAMES,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
    CATEGORY_SECTIONS: CATEGORY_SECTIONS,
    catSource: catSource,
    MODULES: MODULES,
    DEFAULT_MODULES: DEFAULT_MODULES,
    moduleOfPage: moduleOfPage,
    INSURANCE_KIND: INSURANCE_KIND,
    GOAL_STATUS: GOAL_STATUS,
    PROJECT_STATUS: PROJECT_STATUS,
    NOTE_STAGE: NOTE_STAGE,
    ACCOUNT_TYPE: ACCOUNT_TYPE,
    DIRECTION: DIRECTION,
    COURSE_STATUS: COURSE_STATUS,
    blank: blank,
    coerce: coerce
  };
})(window.App = window.App || {});
