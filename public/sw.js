// Service Worker لتطبيق "سمسار السودان" (PWA)
// الهدف: تفعيل خاصية "التثبيت على الشاشة الرئيسية" + تحميل أسرع للصفحات الثابتة
// ملاحظة: البيانات الحية (المحادثات، الإعلانات) تُجلب دائماً من الشبكة مباشرة
// ولا يتم تخزينها مؤقتاً هنا حتى تبقى محدثة دوماً.

const CACHE_NAME = "samsar-sudan-v2";
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
