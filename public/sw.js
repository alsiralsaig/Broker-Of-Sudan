// Service Worker لتطبيق "سمسار السودان" (PWA)
// الهدف: تفعيل خاصية "التثبيت على الشاشة الرئيسية" + تحميل أسرع للصفحات الثابتة
// ملاحظة: البيانات الحية (المحادثات، الإعلانات) تُجلب دائماً من الشبكة مباشرة
// ولا يتم تخزينها مؤقتاً هنا حتى تبقى محدثة دوماً.

const CACHE_NAME = "samsar-sudan-v8";
const APP_SHELL = [
  "/",
  "/manifest.json",
];



self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // لا نتدخل أبداً في طلبات Supabase أو أي API خارجي — لازم تكون Live دايماً
  if (url.origin !== self.location.origin) return;

  // الـ API (محادثات، حساب، إعلانات) ما بيتخزن أبداً — بيانات شخصية ولازم تكون حية
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/data/")) return;

  // استراتيجية "الشبكة أولاً": نحاول نجيب أحدث نسخة، ولو فشل الاتصال نستخدم النسخة المخزنة
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ------------------------------------------------------------
// استقبال إشعارات Push حقيقية — تظهر حتى لو التطبيق مقفول تماماً
// بالضبط زي واتساب وفيسبوك (صوت + اهتزاز النظام الافتراضي)
// ------------------------------------------------------------
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "سمسار السودان 🔔", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "سمسار السودان 🔔";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    dir: "rtl",
    lang: "ar",
    vibrate: [200, 100, 200],
    data: { url: data.url || "/" },
    tag: data.tag || undefined,
    renotify: !!data.tag,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// الضغط على الإشعار بيفتح الصفحة المعنية (أو يركّز عليها لو مفتوحة)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url === target && "focus" in c) return c.focus();
      }
      for (const c of list) {
        if ("navigate" in c && "focus" in c) return c.navigate(target).then((w) => (w || c).focus());
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    })
  );
});
