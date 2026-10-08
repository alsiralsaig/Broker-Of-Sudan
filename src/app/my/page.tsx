"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, MessageCircle, Pencil } from "lucide-react";
import Header from "@/components/Header";
import AuthGate from "@/components/AuthGate";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatPrice, timeAgo } from "@/lib/format";
import type { Listing } from "@/lib/types";
import Commissions from "@/components/Commissions";

const statusChip: Record<string, [string, string]> = {
  pending: ["⏳ قيد المراجعة", "bg-sky-500/15 text-sky-300 border-sky-500/30"],
  rejected: ["⚠️ مرفوض", "bg-red-500/15 text-red-300 border-red-500/30"],
  available: ["متاح", "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"],
  reserved: ["🔒 محجوز", "bg-amber-500/15 text-amber-300 border-amber-500/30"],
  sold: ["✅ اتباع", "bg-slate-500/15 text-slate-300 border-slate-500/30"],
  rented: ["✅ اتأجّر", "bg-slate-500/15 text-slate-300 border-slate-500/30"],
};

export default function MyListingsPage() {
  const { user, loading: authLoading } = useAuth();
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api<{ listings: Listing[] }>("/my/listings")
      .then((r) => setListings(r.listings))
      .catch((e) => setError(errMsg(e)));
  }, [user]);

  if (authLoading) return <div className="min-h-screen bg-[#0b1220]"><Header /></div>;
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0b1220]">
        <Header />
        <AuthGate title="سجّل دخولك لعرض إعلاناتك" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b1220]">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold text-white">📋 إعلاناتي</h1>
          <Link href="/new" className="px-3.5 py-2 bg-sky-500 text-slate-950 rounded-xl text-xs font-extrabold">➕ إعلان جديد</Link>
        </div>

        <Commissions />

        {error && <div className="text-center text-red-300 text-xs">{error}</div>}

        {listings === null ? (
          <div className="text-center py-16 text-slate-500 text-sm">جاري التحميل... ⏳</div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16 bg-[#0f1b30] border border-sky-900/60 rounded-2xl text-slate-400 text-sm space-y-3">
            <p>لسه ما نشرت أي إعلان.</p>
            <Link href="/new" className="inline-block px-4 py-2 bg-sky-500 text-slate-950 rounded-xl text-xs font-extrabold">انشر أول إعلان</Link>
          </div>
        ) : (
          <div className="space-y-2.5">
            {listings.map((l) => {
              const [label, cls] = statusChip[l.status];
              const closed = l.status === "sold" || l.status === "rented";
              return (
                <div key={l.id} className="bg-[#0f1b30] border border-sky-900/60 rounded-2xl p-3 flex gap-3">
                  <Link href={`/listing/${l.id}`} className="shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-[#0b1526] flex items-center justify-center text-2xl">
                    {l.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.cover} alt="" loading="lazy" className="w-full h-full object-cover" />
                    ) : l.category === "car" ? "🚗" : "🏠"}
                  </Link>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/listing/${l.id}`} className="text-sm font-bold text-white truncate">{l.title}</Link>
                      <span className={`shrink-0 text-[10px] font-extrabold px-2 py-0.5 rounded-lg border ${cls}`}>{label}</span>
                    </div>
                    <p className="text-sky-400 font-extrabold font-mono text-sm">
                      {formatPrice(l.price)} <span className="text-[10px]">ج.س{l.dealType === "rent" ? "/شهرياً" : ""}</span>
                    </p>
                    {l.status === "rejected" && l.rejectReason && (
                      <p className="text-[11px] text-red-300">السبب: {l.rejectReason} — عدّل الإعلان وحيرجع للمراجعة</p>
                    )}
                    <div className="flex items-center gap-3 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1"><Eye size={12} /> {l.views}</span>
                      <Link href="/chats" className="flex items-center gap-1 text-sky-400"><MessageCircle size={12} /> {l.conversationsCount || 0}</Link>
                      <span>{timeAgo(l.createdAt)}</span>
                      {!closed && (
                        <Link href={`/new?edit=${l.id}`} className="mr-auto flex items-center gap-1 text-sky-300 font-bold">
                          <Pencil size={12} /> تعديل
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
