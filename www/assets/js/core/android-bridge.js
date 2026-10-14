(function () {
  const REMOTE_API_URL = 'https://fekreazadlifestyle.ir/api.php';

  // ۱. هدایت خودکار درخواست‌های api.php به سرور اصلی سایت
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    if (typeof input === 'string' && input.includes('api.php') && !input.startsWith('http')) {
      const cleanPath = input.replace(/^\.?\//, '');
      input = REMOTE_API_URL + cleanPath.substring(cleanPath.indexOf('api.php') + 7);
    }
    return originalFetch.call(this, input, init);
  };

  // ۲. سیستم مدیریت اشتراک ویژه (Freemium)
  window.FekreAzadPro = {
    isPro: function () {
      return localStorage.getItem('fa_pro_active') === 'true';
    },
    activatePro: function (token) {
      localStorage.setItem('fa_pro_active', 'true');
      localStorage.setItem('fa_pro_token', token || 'bazaar_verified');
      alert('نسخه ویژه «فکر آزاد پلاس» با موفقیت فعال شد!');
      location.reload();
    },
    requirePro: function (featureTitle, onAllowed) {
      if (this.isPro()) {
        if (typeof onAllowed === 'function') onAllowed();
        return true;
      }
      this.showPaywall(featureTitle);
      return false;
    },
    showPaywall: function (featureTitle) {
      const existing = document.getElementById('fa-paywall-modal');
      if (existing) existing.remove();

      const modal = document.createElement('div');
      modal.id = 'fa-paywall-modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;direction:rtl;font-family:inherit;backdrop-filter:blur(4px);';
      modal.innerHTML = `
        <div style="background:var(--bg-surface, #1e1e24);color:var(--text-main, #fff);border-radius:18px;padding:24px;max-width:380px;width:100%;box-shadow:0 15px 35px rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.12);text-align:right;">
          <div style="font-size:1.2rem;font-weight:bold;margin-bottom:8px;color:#f59e0b;">✨ نسخه ویژه فکر آزاد پلاس</div>
          <p style="font-size:0.92rem;line-height:1.7;opacity:0.9;margin-bottom:14px;">
            قابلیت <b>«${featureTitle}»</b> مخصوص کاربران نسخه ویژه است. با ارتقا به نسخه پلاس، به تمامی امکانات زیر دسترسی دائمی خواهید داشت:
          </p>
          <ul style="font-size:0.85rem;line-height:1.9;margin-bottom:20px;padding-right:18px;opacity:0.85;">
            <li>ثبت هوشمند و خودکار هزینه‌ها از پیامک بانکی</li>
            <li>خروجی اکسل پیشرفته (XLSX) از تمام جداول</li>
            <li>قفل بیومتریک (اثر انگشت) و گاوصندوق نامحدود</li>
            <li>پشتیبان‌گیری ابری و یادآور سرویس‌های خودرو</li>
          </ul>
          <div style="display:flex;gap:10px;">
            <button id="fa-buy-pro-btn" style="flex:1;background:#f59e0b;color:#000;border:none;padding:12px;border-radius:10px;font-weight:bold;cursor:pointer;font-family:inherit;">خرید و فعال‌سازی از بازار</button>
            <button id="fa-close-paywall-btn" style="background:transparent;color:inherit;border:1px solid rgba(255,255,255,0.2);padding:12px 16px;border-radius:10px;cursor:pointer;font-family:inherit;">انصراف</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById('fa-close-paywall-btn').onclick = () => modal.remove();
      document.getElementById('fa-buy-pro-btn').onclick = () => {
        if (window.BazaarBilling && typeof window.BazaarBilling.purchase === 'function') {
          window.BazaarBilling.purchase('fekre_azad_plus');
        } else {
          // در حالت تست قبل از اتصال نهایی به کافه‌بازار، امکان تست فعال‌سازی را می‌دهد
          if (confirm('حالت تست توسعه‌دهنده: آیا می‌خواهید نسخه ویژه را به صورت آزمایشی فعال کنید؟')) {
            window.FekreAzadPro.activatePro('test_dev_token');
          }
        }
      };
    }
  };

  // ۳. رهگیری تابع downloadBlob برای قفل کردن اکسل (.xlsx) و ذخیره بومی فایل در اندروید
  const blobStore = new Map();
  const origCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = function (obj) {
    const url = origCreateObjectURL.call(URL, obj);
    if (obj instanceof Blob) {
      blobStore.set(url, obj);
    }
    return url;
  };

  const origAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    const filename = this.getAttribute('download') || '';
    const href = this.getAttribute('href') || '';

    if (filename && href.startsWith('blob:')) {
      const isExcel = filename.toLowerCase().endsWith('.xlsx');
      if (isExcel && !window.FekreAzadPro.isPro()) {
        window.FekreAzadPro.showPaywall('خروجی اکسل پیشرفته (Excel)');
        return;
      }

      const blob = blobStore.get(href);
      if (blob && window.Capacitor && window.Capacitor.isNativePlatform()) {
        saveAndShareBlobNative(blob, filename);
        return;
      }
    }
    return origAnchorClick.apply(this, arguments);
  };

  async function saveAndShareBlobNative(blob, filename) {
    try {
      const Filesystem = window.Capacitor.Plugins.Filesystem;
      const Share = window.Capacitor.Plugins.Share;
      if (!Filesystem || !Share) return;

      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const savedFile = await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: 'CACHE'
      });

      await Share.share({
        title: filename,
        text: 'فایل خروجی اپلیکیشن فکر آزاد',
        url: savedFile.uri,
        dialogTitle: 'ذخیره یا اشتراک‌گذاری فایل'
      });
    } catch (err) {
      console.error('Native file export error:', err);
      alert('خطا در ذخیره فایل: ' + (err.message || err));
    }
  }

  // ۴. مدیریت دکمه بازگشت فیزیکی اندروید (Hardware Back Button)
  document.addEventListener('DOMContentLoaded', () => {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
      window.Capacitor.Plugins.App.addListener('backButton', () => {
        const paywall = document.getElementById('fa-paywall-modal');
        if (paywall) {
          paywall.remove();
          return;
        }
        const activeModal = document.querySelector('.modal.active, .modal.open, [data-modal-open="true"]');
        if (activeModal) {
          const closeBtn = activeModal.querySelector('.close, [data-close], button');
          if (closeBtn) closeBtn.click();
          else activeModal.remove();
          return;
        }
        if (window.location.hash && window.location.hash !== '#home' && window.location.hash !== '#') {
          window.history.back();
        } else {
          window.Capacitor.Plugins.App.exitApp();
        }
      });
    }
  });
})();

// ۵. موتور هوشمند پردازش پیامک‌های بانکی ایران و قابلیت‌های ویژه (مرحله ۳)
(function () {
  function faToEnDigits(str) {
    if (!str) return '';
    return str
      .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  }

  // استخراج هوشمند مبلغ، نوع تراکنش و شرح از متن پیامک بانک‌های ایران
  window.FekreAzadSMS = {
    parseBankSMS: function (rawText) {
      const text = faToEnDigits(rawText || '').trim();
      if (!text) return null;

      // تشخیص نوع تراکنش (واریز/درآمد یا برداشت/هزینه)
      const isIncome = /(واریز|افزایش|بستانکار|دریافت|سود)/.test(text) && !/(برداشت|کاهش|خرید|بدهکار|انتقال به)/.test(text);
      const type = isIncome ? 'income' : 'expense';

      // پیدا کردن مبلغ تراکنش (قبل از کلمه ریال یا تومان یا بعد از مبلغ/برداشت/واریز)
      let amountRial = 0;
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        if (/(مانده|موجودی)/.test(line) && !/(مبلغ|برداشت|واریز)/.test(line)) continue;
        const m = line.match(/(?:مبلغ|برداشت|واریز|خرید|انتقال)?\s*[:=-]?\s*([0-9]{1,3}(?:[,،/][0-9]{3})+|[0-9]{4,12})\s*(ریال|تومان|ريال)?/);
        if (m && m[1]) {
          const num = parseInt(m[1].replace(/[,،/]/g, ''), 10);
          if (num >= 1000) {
            const isToman = m[2] && m[2].includes('تومان');
            amountRial = isToman ? num * 10 : num;
            break;
          }
        }
      }

      const amountToman = amountRial > 0 ? Math.round(amountRial / 10) : 0;

      // استخراج شرح تراکنش
      let title = isIncome ? 'واریز بانکی (پیامک)' : 'خرید / برداشت بانکی';
      for (const line of lines) {
        if (/(خرید از|فروشگاه|پایانه|به نام|بابت|شرح)/.test(line)) {
          title = line.trim().slice(0, 60);
          break;
        }
      }

      return {
        type: type,
        amountToman: amountToman,
        amountRial: amountRial,
        title: title,
        raw: text,
        dateIso: (window.App && window.App.jalali && window.App.jalali.todayIso) ? window.App.jalali.todayIso() : new Date().toISOString().slice(0, 10)
      };
    },

    openSmsModal: async function () {
      if (!window.FekreAzadPro.requirePro('ثبت خودکار هزینه از پیامک بانکی')) return;

      let clipText = '';
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          clipText = await navigator.clipboard.readText();
        }
      } catch (e) {}

      const modal = document.createElement('div');
      modal.id = 'fa-sms-modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:99998;display:flex;align-items:center;justify-content:center;padding:20px;direction:rtl;font-family:inherit;backdrop-filter:blur(4px);';
      modal.innerHTML = `
        <div style="background:var(--bg-surface, #1e1e24);color:var(--text-main, #fff);border-radius:18px;padding:22px;max-width:400px;width:100%;border:1px solid rgba(255,255,255,0.12);text-align:right;">
          <div style="font-size:1.1rem;font-weight:bold;margin-bottom:10px;color:#10b981;">📩 استخراج هوشمند از پیامک بانک</div>
          <p style="font-size:0.85rem;opacity:0.85;margin-bottom:10px;">متن پیامک بانک را در کادر زیر قرار دهید تا مبلغ و نوع تراکنش خودکار تشخیص داده شود:</p>
          <textarea id="fa-sms-input" rows="4" style="width:100%;border-radius:10px;padding:10px;background:rgba(0,0,0,0.25);color:inherit;border:1px solid rgba(255,255,255,0.2);font-family:inherit;font-size:0.85rem;margin-bottom:12px;" placeholder="مثال: بانک ملت&#10;برداشت مبلغ 2,500,000 ریال&#10;خرید از فروشگاه...">${clipText}</textarea>
          <div id="fa-sms-preview" style="font-size:0.85rem;padding:10px;border-radius:8px;background:rgba(16,185,129,0.12);margin-bottom:14px;display:none;"></div>
          <div style="display:flex;gap:10px;">
            <button id="fa-sms-apply-btn" style="flex:1;background:#10b981;color:#000;border:none;padding:11px;border-radius:10px;font-weight:bold;cursor:pointer;font-family:inherit;">انتقال به فرم ثبت تراکنش</button>
            <button id="fa-sms-close-btn" style="background:transparent;color:inherit;border:1px solid rgba(255,255,255,0.2);padding:11px 16px;border-radius:10px;cursor:pointer;font-family:inherit;">بستن</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const inputEl = document.getElementById('fa-sms-input');
      const previewEl = document.getElementById('fa-sms-preview');

      function updatePreview() {
        const parsed = window.FekreAzadSMS.parseBankSMS(inputEl.value);
        if (parsed && parsed.amountToman > 0) {
          previewEl.style.display = 'block';
          previewEl.innerHTML = `نوع: <b>${parsed.type === 'income' ? 'واریز (درآمد)' : 'برداشت (هزینه)'}</b> | مبلغ: <b>${parsed.amountToman.toLocaleString()} تومان</b> (${parsed.amountRial.toLocaleString()} ریال)<br>شرح: ${parsed.title}`;
        } else {
          previewEl.style.display = 'none';
        }
      }

      inputEl.addEventListener('input', updatePreview);
      updatePreview();

      document.getElementById('fa-sms-close-btn').onclick = () => modal.remove();
      document.getElementById('fa-sms-apply-btn').onclick = () => {
        const parsed = window.FekreAzadSMS.parseBankSMS(inputEl.value);
        if (!parsed || parsed.amountToman <= 0) {
          alert('مبلغ معتبری در متن پیامک پیدا نشد.');
          return;
        }
        modal.remove();

        // باز کردن فرم افزودن تراکنش در صفحه فعلی و پر کردن خودکار فیلدها
        const addBtn = document.querySelector('[data-action="add"], .btn-add, button.primary');
        if (addBtn) addBtn.click();

        setTimeout(() => {
          const numInput = document.querySelector('input[type="number"], input[name*="amount"], input[name*="price"], input[inputmode="numeric"]');
          if (numInput) {
            numInput.value = parsed.amountToman;
            numInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
          const textInput = document.querySelector('input[name*="title"], input[name*="desc"], input[name*="note"], textarea');
          if (textInput) {
            textInput.value = parsed.title;
            textInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, 200);
      };
    }
  };

  // ۶. احراز هویت بیومتریک (اثر انگشت اندروید) برای قفل برنامه و گاوصندوق
  window.FekreAzadBiometric = {
    verify: async function (reasonText) {
      if (!window.FekreAzadPro.requirePro('قفل بیومتریک (اثر انگشت و تشخیص چهره)')) return false;
      try {
        const Bio = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NativeBiometric;
        if (!Bio) {
          alert('سنسور اثر انگشت در شبیه‌ساز یا مرورگر فعال نیست (روی گوشی واقعی کار می‌کند).');
          return false;
        }
        const avail = await Bio.isAvailable();
        if (!avail || !avail.isAvailable) {
          alert('سنسور اثر انگشت روی این دستگاه فعال نشده است.');
          return false;
        }
        await Bio.verifyIdentity({
          reason: reasonText || 'لطفاً اثر انگشت خود را وارد کنید',
          title: 'تأیید هویت فکر آزاد',
          subtitle: 'ورود امن با سنسور بیومتریک',
          description: 'اثر انگشت خود را روی سنسور قرار دهید'
        });
        return true;
      } catch (e) {
        return false;
      }
    }
  };

  // ۷. افزودن دکمه شناور «📩 ثبت از پیامک» در صفحه مدیریت مالی
  function syncFloatingSmsButton() {
    const hash = window.location.hash || '';
    let btn = document.getElementById('fa-floating-sms-btn');
    if (hash.includes('money')) {
      if (!btn) {
        btn = document.createElement('button');
        btn.id = 'fa-floating-sms-btn';
        btn.innerHTML = '📩 ثبت از پیامک بانک';
        btn.style.cssText = 'position:fixed;bottom:82px;left:18px;z-index:9990;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:50px;padding:10px 16px;font-family:inherit;font-size:0.85rem;font-weight:bold;box-shadow:0 8px 20px rgba(16,185,129,0.35);cursor:pointer;display:flex;align-items:center;gap:6px;';
        btn.onclick = () => window.FekreAzadSMS.openSmsModal();
        document.body.appendChild(btn);
      }
      btn.style.display = 'flex';
    } else if (btn) {
      btn.style.display = 'none';
    }
  }

  window.addEventListener('hashchange', syncFloatingSmsButton);
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(syncFloatingSmsButton, 400);
  });
})();

// ۸. اتصال مستقیم به App.db برای اعمال محدودیت‌های نسخه رایگان و لرزش لمسی (Haptics)
(function () {
  function triggerHaptic() {
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
        window.Capacitor.Plugins.Haptics.impact({ style: 'LIGHT' });
      }
    } catch (e) {}
  }

  function hookDatabaseAndVault() {
    if (!window.App || !window.App.db) {
      setTimeout(hookDatabaseAndVault, 300);
      return;
    }

    const db = window.App.db;
    if (db._faHooked) return;
    db._faHooked = true;

    const origInsert = db.insert;
    if (typeof origInsert === 'function') {
      db.insert = function (collection, record) {
        if (!window.FekreAzadPro.isPro()) {
          const currentList = (typeof db.list === 'function' ? db.list(collection) : (db.all ? db.all(collection) : [])) || [];
          const count = Array.isArray(currentList) ? currentList.length : 0;

          if (collection === 'vehicles' && count >= 1) {
            window.FekreAzadPro.showPaywall('ثبت بیش از ۱ خودرو در بخش مدیریت خودرو');
            return null;
          }
          if (collection === 'recurrings' && count >= 2) {
            window.FekreAzadPro.showPaywall('ثبت نامحدود اقساط و تراکنش‌های تکرارشونده');
            return null;
          }
          if ((collection === 'services' || collection === 'insurances') && count >= 3) {
            window.FekreAzadPro.showPaywall('ثبت نامحدود سوابق سرویس و بیمه خودرو');
            return null;
          }
        }

        const res = origInsert.apply(this, arguments);
        triggerHaptic();
        return res;
      };
    }
  }

  document.addEventListener('DOMContentLoaded', hookDatabaseAndVault);
})();
