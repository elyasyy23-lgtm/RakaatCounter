// Lightweight i18n for Khushu (خشوع).
//
// The English string IS the key, so the dictionary stays readable and a missing
// key simply falls back to English instead of crashing. `translate()` also turns
// Latin digits into Persian digits when the language is fa, so every number in
// the UI matches the script of the surrounding text.

export type Lang = 'en' | 'fa';

type Entry = { en: string; fa: string };

export const STRINGS: Record<string, Entry> = {
  // Drawer / brand
  'Rakaat Tracker': { en: 'Khushu', fa: 'خشوع' },
  'Enhancing Your Salah': { en: 'Enhancing Your Salah', fa: 'یاریگر نماز شما' },
  'Enhancing Your Salah Experience': {
    en: 'Enhancing Your Salah Experience',
    fa: 'تجربه‌ای بهتر برای نماز شما',
  },
  Home: { en: 'Home', fa: 'خانه' },
  Settings: { en: 'Settings', fa: 'تنظیمات' },
  'Debug Logs': { en: 'Debug Logs', fa: 'گزارش اشکال' },
  Help: { en: 'Help', fa: 'راهنما' },
  'Share App': { en: 'Share App', fa: 'اشتراک برنامه' },
  'Open menu': { en: 'Open menu', fa: 'باز کردن منو' },

  // Home
  RakaatCounter: { en: 'Khushu', fa: 'خشوع' },
  "TODAY'S PRAYERS": { en: "TODAY'S PRAYERS", fa: 'نمازهای امروز' },
  Fajr: { en: 'Fajr', fa: 'فجر' },
  Dhuhr: { en: 'Dhuhr', fa: 'ظهر' },
  Asr: { en: 'Asr', fa: 'عصر' },
  Maghrib: { en: 'Maghrib', fa: 'مغرب' },
  Isha: { en: 'Isha', fa: 'عشاء' },
  FARD: { en: 'FARD', fa: 'فرض' },
  'Fard only': { en: 'Fard only', fa: 'فقط فرض' },
  '{n} Sunnah before': { en: '{n} Sunnah before', fa: '{n} سنت پیش از فرض' },
  '{n} Sunnah after': { en: '{n} Sunnah after', fa: '{n} سنت پس از فرض' },
  '{n} Witr': { en: '{n} Witr', fa: '{n} وتر' },
  '{n} Rakaat': { en: '{n} Rakaat', fa: '{n} رکعت' },
  '{n} Rakaat {name}': { en: '{n} Rakaat {name}', fa: '{n} رکعت {name}' },
  '{n} Rakaat Sunnah {name}': { en: '{n} Rakaat Sunnah {name}', fa: '{n} رکعت سنت {name}' },
  '{n} Rakaat Fard {name}': { en: '{n} Rakaat Fard {name}', fa: '{n} رکعت فرض {name}' },
  '{n} Rakaat Witr {name}': { en: '{n} Rakaat Witr {name}', fa: '{n} رکعت وتر {name}' },
  'PART {i} OF {n}': { en: 'PART {i} OF {n}', fa: 'بخش {i} از {n}' },
  'Next: {title}': { en: 'Next: {title}', fa: 'بعدی: {title}' },
  'Tap to activate': { en: 'Tap to activate', fa: 'برای فعال‌سازی ضربه بزنید' },
  'Tap Stop Prayer when you are ready.': {
    en: 'Tap Stop Prayer when you are ready.',
    fa: 'هرگاه آماده بودید، «پایان نماز» را بزنید.',
  },
  '{f} Fard · {s} Sunnah · {w} Witr every day': {
    en: '{f} Fard · {s} Sunnah · {w} Witr every day',
    fa: 'هر روز {f} فرض · {s} سنت · {w} وتر',
  },

  // Madhhab
  Madhhab: { en: 'Madhhab', fa: 'مذهب' },
  Hanafi: { en: 'Hanafi', fa: 'حنفی' },
  "Shafi'i": { en: "Shafi'i", fa: 'شافعی' },
  Maliki: { en: 'Maliki', fa: 'مالکی' },
  Hanbali: { en: 'Hanbali', fa: 'حنبلی' },
  'Rakaat counts follow your school of jurisprudence': {
    en: 'Rakaat counts follow your school of jurisprudence',
    fa: 'تعداد رکعت‌ها بر اساس مذهب شما نمایش داده می‌شود',
  },

  'CHOOSE RAKAAT': { en: 'CHOOSE RAKAAT', fa: 'انتخاب تعداد رکعت' },
  Two: { en: 'Two', fa: 'دو' },
  Three: { en: 'Three', fa: 'سه' },
  Four: { en: 'Four', fa: 'چهار' },
  Taraweeh: { en: 'Taraweeh', fa: 'تراویح' },
  '20 Rakaat': { en: '20 Rakaat', fa: '20 رکعت' },
  'Keep the phone on your prayer mat with the top edge clear.': {
    en: 'Keep the phone on your prayer mat with the top edge clear.',
    fa: 'گوشی را روی سجاده بگذارید و لبهٔ بالای آن آزاد باشد.',
  },
  'Recalibrate Sensor': { en: 'Recalibrate Sensor', fa: 'کالیبره کردن حسگر' },
  'Re-run the light calibration for the current room.': {
    en: 'Re-run the light calibration for the current room.',
    fa: 'کالیبراسیون نور را برای اتاق فعلی دوباره اجرا کنید.',
  },

  // Prayer — calibration
  'Wait 10 seconds while the app measures the room light.': {
    en: 'Wait 10 seconds while the app measures the room light.',
    fa: '۱۰ ثانیه صبر کنید تا برنامه نور اتاق را اندازه بگیرد.',
  },
  'Keep the phone in the same place for the whole prayer.': {
    en: 'Keep the phone in the same place for the whole prayer.',
    fa: 'گوشی را در تمام نماز در همان جا نگه دارید.',
  },
  'MEASURING ROOM LIGHT': { en: 'MEASURING ROOM LIGHT', fa: 'اندازه‌گیری نور اتاق' },
  'Hold the phone where you normally pray and keep the top uncovered.': {
    en: 'Hold the phone where you normally pray and keep the top uncovered.',
    fa: 'گوشی را همان‌جا که نماز می‌خوانید نگه دارید و بالای آن را نپوشانید.',
  },
  '{n}s': { en: '{n}s', fa: '{n} ثانیه' },
  'Ambient {lux} lux': { en: 'Ambient {lux} lux', fa: 'نور محیط {lux} لوکس' },
  'STEP 1 OF 2': { en: 'STEP 1 OF 2', fa: 'گام 1 از 2' },
  'STEP 2 OF 2': { en: 'STEP 2 OF 2', fa: 'گام 2 از 2' },
  'Calibrating…': { en: 'Calibrating…', fa: 'در حال کالیبره کردن…' },
  'Simulating Sujud…': { en: 'Simulating Sujud…', fa: 'شبیه‌سازی سجده…' },
  'Do not cover the top of the phone.': {
    en: 'Do not cover the top of the phone.',
    fa: 'بالای گوشی را نپوشانید.',
  },
  'Cover the top of the phone with your hand.': {
    en: 'Cover the top of the phone with your hand.',
    fa: 'بالای گوشی را با دست بپوشانید.',
  },
  'Calibration complete': { en: 'Calibration complete', fa: 'کالیبراسیون کامل شد' },
  'The sensor is ready for your next prayer.': {
    en: 'The sensor is ready for your next prayer.',
    fa: 'حسگر برای نماز بعدی آماده است.',
  },
  'Back to Home': { en: 'Back to Home', fa: 'بازگشت به خانه' },

  // Prayer — live
  'TARGET {n} RAKAAT': { en: 'TARGET {n} RAKAAT', fa: 'هدف {n} رکعت' },
  RAKAAT: { en: 'RAKAAT', fa: 'رکعت' },
  SUJUD: { en: 'SUJUD', fa: 'سجده' },
  'Stop Prayer': { en: 'Stop Prayer', fa: 'پایان نماز' },

  // Qibla
  Qibla: { en: 'Qibla', fa: 'قبله' },
  'Finding your location…': { en: 'Finding your location…', fa: 'در حال یافتن موقعیت شما…' },
  'Location is off for this app.': {
    en: 'Location is off for this app.',
    fa: 'دسترسی به موقعیت برای این برنامه خاموش است.',
  },
  'Enable Location in Settings': {
    en: 'Enable Location in Settings',
    fa: 'موقعیت را در تنظیمات فعال کنید',
  },
  'Compass is not available on this device.': {
    en: 'Compass is not available on this device.',
    fa: 'قطب‌نما در این دستگاه موجود نیست.',
  },

  // Support
  'Support Us': { en: 'Support Us', fa: 'پشتیبانی' },
  'Questions, ideas or a problem? Message me on Rubika.': {
    en: 'Questions, ideas or a problem? Message me on Rubika.',
    fa: 'پرسش، پیشنهاد یا مشکلی دارید؟ در روبیکا به من پیام بدهید.',
  },
  'Want to support the app financially? Open “Donate” in the menu.': {
    en: 'Want to support the app financially? Open “Donate” in the menu.',
    fa: 'می‌خواهید به‌صورت مالی از برنامه حمایت کنید؟ از منو «حمایت از ما» را باز کنید.',
  },
  'Donate': { en: 'Donate', fa: 'حمایت از ما' },
  'Your support keeps this app free and ad-free — every contribution is a step in serving those who pray. 🌙': {
    en: 'Your support keeps this app free and ad-free — every contribution is a step in serving those who pray. 🌙',
    fa: 'با حمایت شما، این برنامه رایگان و بدون تبلیغ باقی می‌ماند. هر کمکی، قدمی در راه خدمت به نمازگزاران است. 🌙',
  },
  'Rubika': { en: 'Rubika', fa: 'روبیکا' },
  'Message me on Rubika for questions, ideas or a problem.': {
    en: 'Message me on Rubika for questions, ideas or a problem.',
    fa: 'برای پرسش، پیشنهاد یا مشکل در روبیکا به من پیام بدهید.',
  },
  'Open Rubika': { en: 'Open Rubika', fa: 'باز کردن روبیکا' },
  'Crypto Donation': { en: 'Crypto Donation', fa: 'حمایت با رمزارز' },
  'Send only USDT on the TRC20 (Tron) network.': {
    en: 'Send only USDT on the TRC20 (Tron) network.',
    fa: 'فقط USDT در شبکه TRC20 (ترون) ارسال کنید.',
  },
  'USDT · TRC20': { en: 'USDT · TRC20', fa: 'USDT · TRC20' },
  'Copy Address': { en: 'Copy Address', fa: 'کپی آدرس' },
  'Could not copy the address.': {
    en: 'Could not copy the address.',
    fa: 'کپی آدرس ممکن نشد.',
  },

  // Settings
  'Personalise how the app looks and feels.': {
    en: 'Personalise how the app looks and feels.',
    fa: 'ظاهر و حس برنامه را شخصی‌سازی کنید.',
  },
  'Night Mode': { en: 'Night Mode', fa: 'حالت شب' },
  'Dark theme across the app': { en: 'Dark theme across the app', fa: 'پوستهٔ تیره در سراسر برنامه' },
  Vibration: { en: 'Vibration', fa: 'لرزش' },
  'Buzz on every detected sujud': {
    en: 'Buzz on every detected sujud',
    fa: 'لرزش هنگام تشخیص هر سجده',
  },
  Language: { en: 'Language', fa: 'زبان' },
  'Choose the app language': { en: 'Choose the app language', fa: 'زبان برنامه را انتخاب کنید' },
  English: { en: 'English', fa: 'انگلیسی' },
  Persian: { en: 'Persian', fa: 'فارسی' },

  // Logs
  'Live sensor and state events, newest first.': {
    en: 'Live sensor and state events, newest first.',
    fa: 'رویدادهای زندهٔ حسگر و وضعیت، جدیدترین در بالا.',
  },
  'Copy Logs': { en: 'Copy Logs', fa: 'کپی گزارش' },
  'Copied!': { en: 'Copied!', fa: 'کپی شد!' },
  'Copy failed': { en: 'Copy failed', fa: 'کپی نشد' },
  'No events yet. Start a prayer to see logs.': {
    en: 'No events yet. Start a prayer to see logs.',
    fa: 'هنوز رویدادی ثبت نشده. برای دیدن گزارش، نماز را شروع کنید.',
  },

  // Help
  'How to use': { en: 'How to use', fa: 'نحوهٔ استفاده' },
  'Four quick steps to accurate counting.': {
    en: 'Four quick steps to accurate counting.',
    fa: 'چهار گام سریع برای شمارش دقیق.',
  },
  'Place your phone on the prayer mat.': {
    en: 'Place your phone on the prayer mat.',
    fa: 'گوشی را روی سجاده قرار دهید.',
  },
  'Do not cover the top of the phone during calibration.': {
    en: 'Do not cover the top of the phone during calibration.',
    fa: 'در هنگام کالیبراسیون بالای گوشی را نپوشانید.',
  },
  'When it says "Simulating Sujud", cover the top with your hand for 3 seconds.': {
    en: 'When it says "Simulating Sujud", cover the top with your hand for 3 seconds.',
    fa: 'وقتی نوشت «شبیه‌سازی سجده»، بالای گوشی را 3 ثانیه با دست بپوشانید.',
  },
  'Start praying. The app counts sajdahs and rakaats automatically.': {
    en: 'Start praying. The app counts sajdahs and rakaats automatically.',
    fa: 'نماز را شروع کنید. برنامه سجده‌ها و رکعت‌ها را خودکار می‌شمارد.',
  },
  'Two sajdahs complete one rakaat. The counter resets itself for each rakaat.': {
    en: 'Two sajdahs complete one rakaat. The counter resets itself for each rakaat.',
    fa: 'هر دو سجده یک رکعت را کامل می‌کند. شمارنده برای هر رکعت خودبه‌خود صفر می‌شود.',
  },

  // Share
  'Share & Support': { en: 'Share & Support', fa: 'اشتراک و حمایت' },
  'Help a friend track their salah — every share keeps this app free.': {
    en: 'Help a friend track their salah — every share keeps this app free.',
    fa: 'به دوستی برای پیگیری نمازش کمک کنید — هر اشتراک این برنامه را رایگان نگه می‌دارد.',
  },
};

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toPersianDigits(value: string): string {
  return value.replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

export function translate(
  lang: Lang,
  key: string,
  params?: Record<string, string | number>,
): string {
  const entry = STRINGS[key];
  let out = entry ? entry[lang] ?? entry.en : key;
  if (params) {
    for (const name of Object.keys(params)) {
      out = out.split(`{${name}}`).join(String(params[name]));
    }
  }
  return lang === 'fa' ? toPersianDigits(out) : out;
}
