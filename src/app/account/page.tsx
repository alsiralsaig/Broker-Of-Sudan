"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import AuthGate from "@/components/AuthGate";
import PushToggle from "@/components/PushToggle";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { User } from "@/lib/types";

const field =
  "w-full bg-[#0b1526] border border-sky-900/60 rounded-xl px-3.5 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500";

export default function AccountPage() {
  const router = useRouter();
  const { user, loading, setUser, logout } = useAuth();
  const [name, setName] = useState<string | null>(null);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="min-h-screen bg-[#0b1220]"><Header /></div>;
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0b1220]">
        <Header />
        <AuthGate />
      </div>
    );
  }

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b1220]">
      <Header />
      <main className="max-w-sm mx-auto px-4 py-6 space-y-4">
        <h1 className="text-lg font-extrabold text-white">👤 حسابي</h1>
        {msg && (
          <div className={`text-xs font-bold rounded-xl px-3 py-2.5 text-center border ${msg.ok ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-red-500/10 border-red-500/30 text-red-300"}`}>
            {msg.text}
          </div>
        )}

        <div className="bg-[#0f1b30] border border-sky-900/60 rounded-2xl p-4 space-y-3">
          <p className="text-xs text-slate-400">رقم التلفون: <span className="font-mono text-white" dir="ltr">{user.phone}</span></p>
          <input className={field} value={name ?? user.name} onChange={(e) => setName(e.target.value)} placeholder="الاسم" />
          <button
            disabled={busy || !name || name === user.name}
            onClick={() => run(async () => {
              const r = await api<{ user: User }>("/auth/profile", { method: "PATCH", body: { name } });
              setUser(r.user);
              return "اتحفظ الاسم ✅";
            })}
            className="w-full py-2.5 bg-sky-500 text-slate-950 font-extrabold rounded-xl text-xs disabled:opacity-40"
          >
            حفظ الاسم
          </button>
        </div>

        <div className="bg-[#0f1b30] border border-sky-900/60 rounded-2xl p-4 space-y-3">
          <p className="text-sm font-bold text-white">🔔 الإشعارات</p>
          <PushToggle />
        </div>

        <div className="bg-[#0f1b30] border border-sky-900/60 rounded-2xl p-4 space-y-3">
          <p className="text-sm font-bold text-white">🔑 تغيير كلمة السر</p>
          <input className={field} type="password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="كلمة السر الحالية" autoComplete="current-password" />
          <input className={field} type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="كلمة السر الجديدة" autoComplete="new-password" />
          <button
            disabled={busy || !cur || !next}
            onClick={() => run(async () => {
              await api("/auth/password", { method: "POST", body: { currentPassword: cur, newPassword: next } });
              setCur("");
              setNext("");
              return "اتغيّرت كلمة السر ✅ — الأجهزة التانية اتسجّل خروجها";
            })}
            className="w-full py-2.5 bg-sky-500 text-slate-950 font-extrabold rounded-xl text-xs disabled:opacity-40"
          >
            تغيير
          </button>
        </div>

        <button
          onClick={async () => { await logout(); router.push("/"); }}
          className="w-full py-3 bg-red-500/10 border border-red-500/30 text-red-300 font-extrabold rounded-xl text-xs"
        >
          تسجيل خروج
        </button>
      </main>
    </div>
  );
}
