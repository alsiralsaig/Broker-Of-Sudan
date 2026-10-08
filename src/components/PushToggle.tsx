"use client";

import { useEffect, useState } from "react";
import { BellPlus, BellOff } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { enablePush, disablePush, getPushState, syncPush, PushError, type PushState } from "@/lib/push";

const msg: Record<PushState, string> = {
  unsupported: "المتصفح ده ما بيدعم الإشعارات — جرّب Chrome",
  "ios-install": "في الآيفون: ثبّت التطبيق من زر المشاركة ← «إضافة للشاشة الرئيسية» عشان الإشعارات تشتغل",
  denied: "الإشعارات مقفولة — فعّلها من إعدادات المتصفح للموقع ده",
  off: "",
  on: "",
};

/** زر تفعيل إشعارات الجهاز */
export default function PushToggle({ compact }: { compact?: boolean }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      let st: PushState = await getPushState().catch(() => "unsupported" as PushState);
      if (st === "off" && typeof Notification !== "undefined" && Notification.permission === "granted") {
        st = (await syncPush()) || st;
      }
      setState(st);
    })();
  }, []);

  if (!state) return null;
  if (compact && state === "on") return null;

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

  if (state === "off") {
    return (
      <div>
      <button
        onClick={enable}
        disabled={busy}
        className={`w-full flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs disabled:opacity-50 ${compact ? "py-2.5" : "py-3 rounded-xl"}`}
      >
        <BellPlus size={15} /> {busy ? "لحظة..." : "فعّل الإشعارات على الجهاز ده"}
      </button>
      {err && <p className="text-[11px] text-amber-300 px-3 py-2 leading-relaxed">⚠️ {err}</p>}
      </div>
    );
  }

  const test = async () => {
    setBusy(true);
    setErr(null);
    try {
      await syncPush();
      const r = await api<{ devices: number; results: { host: string; ok: boolean; status: number; error?: string }[] }>("/push/test", { method: "POST" });
      if (!r.devices) setErr("الجهاز ده ما مسجّل — اضغط إيقاف وبعدين فعّل تاني");
      else if (r.results.every((x) => x.ok)) setErr(`✅ اترسل لـ ${r.devices} جهاز — لو ما ظهر في شريط التلفون خلال ثواني، شيك إعدادات إشعارات التطبيق`);
      else setErr("فشل الإرسال: " + r.results.filter((x) => !x.ok).map((x) => `${x.host} ${x.status} ${x.error || ""}`).join(" | "));
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (state === "on") {
    return (
      <div className="space-y-2">
      <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2.5">
        <span className="text-xs font-bold text-emerald-300">✅ الإشعارات شغّالة على الجهاز ده</span>
        <button
          onClick={async () => { setBusy(true); await disablePush(); setState(await getPushState()); setBusy(false); }}
          className="text-[11px] text-slate-400 flex items-center gap-1"
        >
          <BellOff size={12} /> إيقاف
        </button>
      </div>
      <button
        onClick={test}
        disabled={busy}
        className="w-full py-2.5 rounded-xl border border-sky-700 text-sky-300 text-xs font-bold disabled:opacity-50"
      >
        {busy ? "لحظة..." : "🔔 جرّب إشعار"}
      </button>
      {err && <p className="text-[11px] text-amber-300 leading-relaxed">{err}</p>}
      </div>
    );
  }

  return (
    <p className={`text-[11px] text-amber-300 bg-amber-500/10 leading-relaxed ${compact ? "px-4 py-2.5 border-b border-sky-900/50" : "rounded-xl px-3 py-2.5 border border-amber-500/30"}`}>
      {msg[state]}
    </p>
  );
}
