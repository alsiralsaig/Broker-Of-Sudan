// تفعيل إشعارات Web Push (بتوصل حتى لو التطبيق مقفول)
import { api } from "./api";

export type PushState = "unsupported" | "ios-install" | "denied" | "off" | "on";

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function getPushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIos() && !isStandalone() ? "ios-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

async function sendSubscription(sub: PushSubscription) {
  const j = sub.toJSON();
  await api("/push/subscribe", { method: "POST", body: { endpoint: j.endpoint, keys: j.keys } });
}

export class PushError extends Error {}

function explain(e: any): string {
  const n = e?.name || "";
  const m = String(e?.message || e || "");
  if (n === "NotAllowedError") return "المتصفح رفض الإذن — فعّل الإشعارات للموقع من إعدادات Chrome";
  if (n === "AbortError" || /push service/i.test(m))
    return "خدمة الإشعارات في التلفون ما ردّت — اتأكد إنو خدمات Google Play شغالة والنت كويس وجرّب تاني";
  return `تعذّر تفعيل الإشعارات (${n || "خطأ"}: ${m.slice(0, 120)})`;
}

async function getReg(): Promise<ServiceWorkerRegistration> {
  let reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) reg = await navigator.serviceWorker.register("/sw.js");
  // ready بيستنى لحدي ما الـ SW يبقى active — مع حد أقصى عشان ما نعلق
  const ready = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), 10000)),
  ]);
  return ready || reg;
}

async function subscribeFresh(reg: ServiceWorkerRegistration): Promise<PushSubscription> {
  const { publicKey } = await api<{ publicKey: string }>("/push/key");
  const key = urlBase64ToUint8Array(publicKey);
  let sub = await reg.pushManager.getSubscription();
  // اشتراك قديم بمفتاح تاني (من نسخة الموقع القديمة) — نلغيه ونشترك من جديد
  if (sub) {
    const old = sub.options?.applicationServerKey;
    const same = old && new Uint8Array(old).every((b, i) => b === key[i]) && new Uint8Array(old).length === key.length;
    if (!same) { await sub.unsubscribe().catch(() => {}); sub = null; }
  }
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    } catch (e: any) {
      if (e?.name === "InvalidStateError") {
        const s2 = await reg.pushManager.getSubscription();
        await s2?.unsubscribe().catch(() => {});
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      } else throw e;
    }
  }
  return sub;
}

/** لازم تتنادى من ضغطة زر (المتصفح بيطلب كده) — بترمي PushError برسالة واضحة لو فشلت */
export async function enablePush(): Promise<PushState> {
  const state = await getPushState();
  if (state === "unsupported" || state === "ios-install" || state === "denied") return state;
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "off";
  try {
    const reg = await getReg();
    const sub = await subscribeFresh(reg);
    await sendSubscription(sub);
  } catch (e) {
    throw new PushError(explain(e));
  }
  return "on";
}

/** بعد الدخول/فتح الصفحة: لو الإذن ممنوح، نضمن إنو في اشتراك مربوط بالحساب — بدون ما نطلب حاجة */
export async function syncPush(): Promise<PushState | null> {
  try {
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) return null;
    if (Notification.permission !== "granted") return null;
    const reg = await getReg();
    const sub = await subscribeFresh(reg);
    await sendSubscription(sub);
    return "on";
  } catch {
    return null;
  }
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api("/push/unsubscribe", { method: "POST", body: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe();
  }
}
