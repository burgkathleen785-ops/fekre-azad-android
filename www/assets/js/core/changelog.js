/*
 * What changed, and in which release.
 *
 * VERSION is the app's own version number — the one shown in settings and
 * used to decide whether to open the "what's new" note. It is separate from
 * schema.VERSION (the shape of the data) and from the service worker's
 * VERSION (which cache to use); all three are bumped together on a release,
 * but they answer different questions.
 *
 * Which releases a person has already read is kept in settings.seenVersion,
 * which lives in their account's document on the server — so reading the note
 * on the phone also marks it read on the laptop.
 */
(function (App) {
  'use strict';

  var VERSION = '3.2.0';

  // Newest first. `items` are shown as a list; keep them short and concrete.
  var ENTRIES = [
    {
      version: '3.2.0',
      date: '1405-07-07',
      title: 'ماشین، فونت تازه، بخش‌های دلخواه',
      items: [
        'بخش تازه‌ی «ماشین»: دفترچه‌ی سرویس با کیلومتر تعویض و کیلومتر تعویض بعدی، بیمه‌نامه‌ها، و کیلومتر فعلی که مبنای همه‌ی یادآوری‌هاست.',
        'صفحه‌ی خانه می‌گوید چه قطعه‌ای نزدیک تعویض است یا از تعویضش گذشته، و کِی بیمه تمام می‌شود.',
        'تولد را می‌شود بدون سال ثبت کرد — «۱۲ اسفند» یا «۱۲/۱۲». نام ماه و سال دو رقمی هم قبول می‌شود.',
        'در تنظیمات هر بخشی را که لازم نداری خاموش کن؛ از منو و خانه برداشته می‌شود و داده‌اش سر جایش می‌ماند.',
        'فونت پیش‌فرض «استعداد» شد و فونت‌ها از روی هاست خودت می‌آیند، نه از سرور گوگل — سریع‌تر و بدون وابستگی.'
      ]
    },
    {
      version: '3.1.0',
      date: '1405-07-05',
      title: 'گاوصندوق، موارد تکرارشونده',
      items: [
        'بخش تازه‌ی «محرمانه»: شماره‌کارت‌ها و رمزهای سایت‌ها، رمزنگاری‌شده در مرورگر خودت با یک رمز اصلی. سرور فقط متن رمزشده را می‌بیند.',
        'قبض‌ها و درآمدهای ثابت حالا قالب دارند: هر ماه که رسید، تراکنش‌های آن ماه را در «در انتظار تأیید» می‌بینی و با یک دکمه ثبت می‌کنی.',
        'همین پنجره: از این به بعد بعد از هر آپدیت، تغییرات را می‌بینی.',
        'منوی کناری موقع باز شدن، محتوا را کنار می‌زند و رویش نمی‌افتد.',
        'ورود با http به https منتقل می‌شود، چون رمزنگاری گاوصندوق به اتصال امن نیاز دارد.'
      ]
    },
    {
      version: '3.0.0',
      date: '1405-06-27',
      title: 'حساب‌های جداگانه',
      items: [
        'هر کاربر حساب و داشبورد خودش را دارد؛ داده‌ها کاملاً جدا هستند.',
        'کد دعوت شخصی و یک‌بارمصرف جای کد مشترک قبلی را گرفت.',
        'کنسول مدیر برای ساخت دعوت، غیرفعال‌کردن و بازنشانی رمز کاربران.'
      ]
    }
  ];

  /** -1, 0 or 1 — compares dotted version numbers part by part. */
  function compare(a, b) {
    var pa = String(a || '0').split('.');
    var pb = String(b || '0').split('.');
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var na = Number(pa[i]) || 0;
      var nb = Number(pb[i]) || 0;
      if (na !== nb) return na < nb ? -1 : 1;
    }
    return 0;
  }

  /**
   * The releases to show someone who last read `seen`.
   *
   * A blank `seen` means this account has never been told about a release —
   * either because it is brand new, or because it existed before this feature.
   * Showing it years of history would be noise, so it gets the current
   * release only.
   */
  function since(seen) {
    if (!seen) return ENTRIES.slice(0, 1);
    if (compare(seen, VERSION) >= 0) return [];
    return ENTRIES.filter(function (e) { return compare(e.version, seen) > 0; });
  }

  function latest() { return ENTRIES[0]; }

  App.changelog = {
    VERSION: VERSION,
    ENTRIES: ENTRIES,
    compare: compare,
    since: since,
    latest: latest
  };
})(window.App = window.App || {});
