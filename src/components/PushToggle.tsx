"use client";

import { useEffect, useState } from "react";
import { BellPlus, BellOff } from "lucide-react";
import { enablePush, disablePush, getPushState, type PushState } from "@/lib/push";

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

  useEffect(() => {
    getPushState().then(setState).catch(() => setState("unsupported"));
  }, []);

  if (!state) return null;
  if (compact && state === "on") return null;

  const enable = async () => {
    setBusy(true);
    try {
      setState(await enablePush());
    } catch {
      setState(await getPushState());
    } finally {
      setBusy(false);
    }
  };

  if (state === "off") {
    return (
      <button
        onClick={enable}
        disabled={busy}
        className={`w-full flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs disabled:opacity-50 ${compact ? "py-2.5" : "py-3 rounded-xl"}`}
      >
        <BellPlus size={15} /> {busy ? "لحظة..." : "فعّل الإشعارات على الجهاز ده"}
      </button>
    );
  }

  if (state === "on") {
    return (
      <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2.5">
        <span className="text-xs font-bold text-emerald-300">✅ الإشعارات شغّالة على الجهاز ده</span>
        <button
          onClick={async () => { setBusy(true); await disablePush(); setState(await getPushState()); setBusy(false); }}
          className="text-[11px] text-slate-400 flex items-center gap-1"
        >
          <BellOff size={12} /> إيقاف
        </button>
      </div>
    );
  }

  return (
    <p className={`text-[11px] text-amber-300 bg-amber-500/10 leading-relaxed ${compact ? "px-4 py-2.5 border-b border-sky-900/50" : "rounded-xl px-3 py-2.5 border border-amber-500/30"}`}>
      {msg[state]}
    </p>
  );
}
