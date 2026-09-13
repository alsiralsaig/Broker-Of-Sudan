"use client";

import { useState } from "react";
import { normalizeSudanesePhone } from "@/lib/format";
import { saveUserSession } from "@/lib/session";

interface PhoneGateProps {
  title: string;
  subtitle?: string;
  onDone: (phone: string, name: string) => void;
}

/** بوابة دخول بسيطة بالاسم ورقم الهاتف فقط — تُستخدم قبل أي عملية تحتاج هوية
 * (نشر إعلان، بدء مفاصلة) بنفس أسلوب رَكْشَتُك المُختبر */
export default function PhoneGate({ title, subtitle, onDone }: PhoneGateProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const fullPhone = normalizeSudanesePhone(phone);
    if (!fullPhone) {
      setError("رقم الهاتف السوداني غير صحيح (9 أرقام تبدأ بـ 9 أو 1)");
      return;
    }
    if (!name.trim()) {
      setError("الاسم مطلوب");
      return;
    }

    saveUserSession(fullPhone, name.trim());
    onDone(fullPhone, name.trim());
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-[#0f1b30] border border-sky-900/60 rounded-2xl p-6 space-y-4 shadow-2xl"
      >
        <div className="text-center space-y-1.5">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-bold rounded-xl px-3.5 py-3 text-center">
            ⚠️ {error}
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-slate-300 mb-1.5 block text-right">الاسم:</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اسمك الكامل"
            className="w-full bg-[#0b1526] border border-sky-900/60 rounded-xl px-3.5 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-300 mb-1.5 block text-right">📞 رقم الهاتف:</label>
          <div
            className="flex items-stretch border border-sky-900/60 rounded-xl overflow-hidden bg-[#0b1526] focus-within:border-sky-500"
            style={{ direction: "ltr" }}
          >
            <div className="bg-[#0f2942] text-sky-400 px-3.5 py-3 text-sm font-mono font-bold border-r border-sky-900/60 flex items-center gap-1.5 select-none shrink-0">
              <span>🇸🇩</span>
              <span style={{ direction: "ltr", unicodeBidi: "isolate" }}>+249</span>
            </div>
            <input
              type="tel"
              required
              value={phone.replace("+249", "")}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              placeholder="9 أو 1 + 8 أرقام"
              className="w-full bg-transparent px-3.5 py-3 text-sm text-white placeholder-slate-500 focus:outline-none font-mono text-left"
              style={{ direction: "ltr" }}
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-3.5 bg-sky-500 hover:bg-sky-400 active:scale-[0.99] text-slate-950 font-extrabold rounded-2xl text-sm shadow-xl transition"
        >
          متابعة 🚀
        </button>
      </form>
    </div>
  );
}
