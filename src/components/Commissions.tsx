"use client";

import { useEffect, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { formatPrice, timeAgo } from "@/lib/format";
import type { DealRow } from "@/lib/types";

const statusLabel: Record<string, [string, string]> = {
  due: ["مستحقة", "text-amber-300"],
  submitted: ["⏳ منتظرة تأكيد الإدارة", "text-sky-300"],
  paid: ["✅ مدفوعة", "text-emerald-300"],
  waived: ["معفية", "text-slate-400"],
};

/** عمولات السمسار على صفقات البائع — مع إرسال رقم عملية الدفع */
export default function Commissions() {
  const [rows, setRows] = useState<DealRow[] | null>(null);
  const [payInfo, setPayInfo] = useState("");
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [showPaid, setShowPaid] = useState(false);

  const load = () =>
    api<{ commissions: DealRow[]; payInfo: string }>("/my/commissions")
      .then((r) => { setRows(r.commissions); setPayInfo(r.payInfo); })
      .catch(() => setRows([]));

  useEffect(() => { load(); }, []);

  if (!rows || rows.length === 0) return null;
  const open = rows.filter((r) => r.commissionStatus === "due" || r.commissionStatus === "submitted");
  const closed = rows.filter((r) => !open.includes(r));
  const total = open.reduce((a, r) => a + (r.commissionAmount || 0), 0);

  const submit = async (id: string) => {
    const ref = (refs[id] || "").trim();
    if (!ref) return;
    setBusy(id);
    try {
      await api(`/deals/${id}/commission-ref`, { method: "POST", body: { ref } });
      await load();
    } catch (e) {
      alert(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-[#0f1b30] border border-amber-500/30 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-extrabold text-white">🧾 عمولة السمسار</p>
        {total > 0 && <p className="text-amber-300 font-extrabold font-mono text-sm">{formatPrice(total)} ج.س</p>}
      </div>

      {open.length > 0 && (
        <p className="text-[11px] text-slate-300 leading-relaxed bg-[#0b1526] rounded-xl px-3 py-2.5">
          💳 {payInfo || "تواصل مع الإدارة لمعرفة طريقة الدفع"}
          <span className="block text-slate-500 mt-1">بعد التحويل اكتب رقم العملية تحت، والإدارة بتأكد.</span>
        </p>
      )}

      {open.map((r) => (
        <div key={r.id} className="border border-sky-900/50 rounded-xl p-3 space-y-2">
          <div className="flex justify-between gap-2 text-xs">
            <span className="text-white font-bold truncate">{r.listingTitle}</span>
            <span className={statusLabel[r.commissionStatus!][1]}>{statusLabel[r.commissionStatus!][0]}</span>
          </div>
          <p className="text-[11px] text-slate-400">
            الصفقة {formatPrice(r.price)} ج.س · {r.commissionRule} ·{" "}
            <span className="text-amber-300 font-bold font-mono">{formatPrice(r.commissionAmount)} ج.س</span> · {timeAgo(r.closedAt)}
          </p>
          {r.commissionStatus === "submitted" ? (
            <p className="text-[11px] text-sky-300">رقم العملية المرسل: <span className="font-mono">{r.commissionRef}</span></p>
          ) : (
            <div className="flex gap-2">
              <input
                value={refs[r.id] || ""}
                onChange={(e) => setRefs({ ...refs, [r.id]: e.target.value })}
                placeholder="رقم عملية التحويل"
                className="flex-1 min-w-0 bg-[#0b1526] border border-sky-900/60 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
              />
              <button
                onClick={() => submit(r.id)}
                disabled={busy === r.id || !(refs[r.id] || "").trim()}
                className="px-3 py-2 bg-amber-400 text-slate-950 font-extrabold rounded-lg text-xs disabled:opacity-40"
              >
                إرسال
              </button>
            </div>
          )}
        </div>
      ))}

      {closed.length > 0 && (
        <div>
          <button onClick={() => setShowPaid((v) => !v)} className="text-[11px] text-sky-400 font-bold">
            {showPaid ? "إخفاء" : "عرض"} العمولات المسددة ({closed.length})
          </button>
          {showPaid && (
            <div className="mt-2 space-y-1.5">
              {closed.map((r) => (
                <div key={r.id} className="flex justify-between text-[11px] text-slate-400 border-b border-sky-900/30 pb-1.5">
                  <span className="truncate">{r.listingTitle}</span>
                  <span className={statusLabel[r.commissionStatus!][1]}>
                    {formatPrice(r.commissionAmount)} · {statusLabel[r.commissionStatus!][0]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
