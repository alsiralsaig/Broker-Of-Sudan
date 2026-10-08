"use client";

import { useState } from "react";
import Link from "next/link";
import { LogIn, UserPlus } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { User } from "@/lib/types";

/** نموذج دخول / حساب جديد برقم التلفون وكلمة سر */
export default function AuthGate({ title, subtitle }: { title?: string; subtitle?: string }) {
  const { setUser } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api<{ user: User }>(mode === "login" ? "/auth/login" : "/auth/register", {
        method: "POST",
        body: mode === "login" ? { phone, password } : { name, phone, password },
      });
      setUser(r.user);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const input =
    "w-full bg-[#0b1526] border border-sky-900/60 rounded-xl px-3.5 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500";

  return (
    <div className="max-w-sm mx-auto px-4 py-10">
      <form onSubmit={submit} className="bg-[#0f1b30] border border-sky-900/60 rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="text-center space-y-1">
          <div className="text-3xl">🔐</div>
          <h1 className="text-base font-extrabold text-white">{title || "سجّل دخولك"}</h1>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>

        <div className="grid grid-cols-2 gap-2 bg-[#0b1526] p-1 rounded-xl">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(null); }}
              className={`py-2 rounded-lg text-xs font-extrabold transition ${mode === m ? "bg-sky-500 text-slate-950" : "text-slate-400"}`}
            >
              {m === "login" ? "دخول" : "حساب جديد"}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-bold rounded-xl px-3 py-2.5 text-center">
            ⚠️ {error}
          </div>
        )}

        {mode === "register" && (
          <input className={input} placeholder="اسمك الكامل" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        )}
        <input
          className={`${input} font-mono text-left`}
          dir="ltr"
          inputMode="tel"
          placeholder="0912345678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          required
        />
        <input
          className={input}
          type="password"
          placeholder={mode === "register" ? "كلمة سر (6 حروف أو أكتر)" : "كلمة السر"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          required
        />

        <button
          type="submit"
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-3 bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold rounded-xl text-sm disabled:opacity-50"
        >
          {mode === "login" ? <LogIn size={16} /> : <UserPlus size={16} />}
          {busy ? "لحظة..." : mode === "login" ? "دخول" : "إنشاء الحساب"}
        </button>

        {mode === "register" && (
          <p className="text-[11px] text-slate-500 text-center leading-relaxed">
            رقمك ما بيظهر لأي زول إلا بعد ما تتفقوا على السعر.
          </p>
        )}
        {mode === "login" && (
          <p className="text-[11px] text-slate-500 text-center">نسيت كلمة السر؟ تواصل مع الإدارة.</p>
        )}
        <p className="text-center">
          <Link href="/" className="text-[11px] text-sky-400 font-bold">← رجوع للتصفح</Link>
        </p>
      </form>
    </div>
  );
}
