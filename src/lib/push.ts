// نظام الإشعارات الحقيقية (Push Notifications) — تظهر خارج التطبيق
// حتى لو المتصفح/التطبيق مقفول تماماً، بالضبط زي واتساب وفيسبوك.

import { supabase } from "@/lib/supabase";

// المفتاح العمومي (Public Key) — آمن تماماً في كود العميل، هذا هو الغرض منه
const VAPID_PUBLIC_KEY = "BAXT9qMbnXVh_VRiR_2cmhGiujgXRwEHMerYURdbKYGE7EvBqcXYZ2EZZLpryPkoh7XPU8lj_3y0PozFJieCj9k";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function getPushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

/**
 * يطلب إذن الإشعارات من المستخدم، ولو وافق يشترك فعلياً في Push
 * ويخزن الاشتراك في Supabase مربوطاً برقم هاتفه.
 */
export async function subscribeToPush(phone: string): Promise<"granted" | "denied" | "unsupported"> {
  if (!isPushSupported()) return "unsupported";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  try {
    const registration = await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return "denied";

    await supabase.from("push_subscriptions").upsert(
      {
        phone_number: phone,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
      { onConflict: "endpoint" }
    );

    return "granted";
  } catch {
    return "denied";
  }
}
