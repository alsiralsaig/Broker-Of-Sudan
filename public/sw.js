// Service Worker لتطبيق "سمسار السودان" (PWA)
// الهدف: تفعيل خاصية "التثبيت على الشاشة الرئيسية" + تحميل أسرع للصفحات الثابتة
// ملاحظة: البيانات الحية (المحادثات، الإعلانات) تُجلب دائماً من الشبكة مباشرة
// ولا يتم تخزينها مؤقتاً هنا حتى تبقى محدثة دوماً.

const CACHE_NAME = "samsar-sudan-v3";
const APP_SHELL = [
  "/",
  "/manifest.json",
];

const APP_ICON =
  "https://gfqrutdwvtqxtfgndyhd.supabase.co/storage/v1/object/public/media/public/icons/icon-192.png";


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

// ------------------------------------------------------------
// استقبال إشعارات Push حقيقية — تظهر حتى لو التطبيق مقفول تماماً
// بالضبط زي واتساب وفيسبوك (صوت + اهتزاز النظام الافتراضي)
// ------------------------------------------------------------
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "سمسار السودان 🔔", body: event.data ? event.data.text() : "لديك رسالة جديدة" };
  }

  const title = data.title || "سمسار السودان 🔔";
  const options = {
    body: data.body || "لديك رسالة جديدة",
    icon: data.icon || APP_ICON,
    badge: data.badge || APP_ICON,
    dir: "rtl",
    lang: "ar",
    vibrate: [200, 100, 200],
    data: { conversation_id: data.conversation_id || null },
    tag: data.conversation_id ? `chat-${data.conversation_id}` : undefined,
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// عند الضغط على الإشعار، نفتح المحادثة المعنية مباشرة
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const conversationId = event.notification.data?.conversation_id;
  const targetUrl = conversationId ? `/chat/${conversationId}` : "/chats";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
