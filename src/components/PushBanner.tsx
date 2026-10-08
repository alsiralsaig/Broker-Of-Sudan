"use client";

import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { enablePush, getPushState, syncPush, PushError, type PushState } from "@/lib/push";

const KEY = "bs_push_banner_hidden_until";

/** شريط ثابت تحت الهيدر — بيطلب تفعيل الإشعارات لأي مستخدم مسجّل ما فعّلها */
export default function PushBanner() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (Number(localStorage.getItem(KEY) || 0) > Date.now()) return;
    (async () => {
      let st = await getPushState().catch(() => null);
      // الإذن ممنوح لكن ما في اشتراك — نشترك بصمت
      if (st === "off" && typeof Notification !== "undefined" && Notification.permission === "granted") {
        st = (await syncPush()) || st;
      }
      setState(st);
    })();
  }, []);

  if (!state || state === "on" || state === "unsupported") return null;

  // الإخفاء ليوم واحد بس — الإشعارات أساسية
  const hide = () => {
    localStorage.setItem(KEY, String(Date.now() + 24 * 3600 * 1000));
    setState(null);
  };

  const enable = async () => {
    setBusy(true);
    setErr(null);
    try {
      setState(await enablePush());
    } catch (e) {
      setErr(e instanceof PushError ? e.message : "تعذّر التفعيل — جرّب تاني");
      setState(await getPushState());
    } finally {
      setBusy(false);
    }
  };

  const text =
    state === "ios-install"
      ? "في الآيفون: ثبّت الموقع من زر المشاركة ← «إضافة للشاشة الرئيسية» عشان توصلك الإشعارات"
      : state === "denied"
      ? "الإشعارات مقفولة — افتح إعدادات الموقع في المتصفح (🔒 جنب الرابط) وفعّلها، عشان ما تفوتك الرسائل والعروض"
      : "فعّل الإشعارات عشان توصلك الرسائل والعروض والصفقات فوراً";

  return (
    <div className="bg-sky-500/15 border-b border-sky-500/30">
      <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-2">
        <BellRing size={16} className="text-sky-300 shrink-0" />
        <p className="flex-1 text-[11px] sm:text-xs text-sky-100 leading-relaxed">
          {text}
          {err && <span className="block text-amber-300 mt-0.5">⚠️ {err}</span>}
        </p>
        {state === "off" && (
          <button
            onClick={enable}
            disabled={busy}
            className="shrink-0 px-3 py-1.5 bg-sky-400 text-slate-950 font-extrabold rounded-lg text-xs disabled:opacity-50"
          >
            {busy ? "لحظة…" : "فعّل"}
          </button>
        )}
        <button onClick={hide} aria-label="إخفاء" className="shrink-0 text-sky-300/70 p-1">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
