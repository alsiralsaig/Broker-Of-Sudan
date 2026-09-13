"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import PhoneGate from "@/components/PhoneGate";
import { supabase } from "@/lib/supabase";
import { displayPhone, formatPrice, timeAgo } from "@/lib/format";
import { getSavedPhone } from "@/lib/session";
import type { Conversation } from "@/lib/types";

export default function ChatsListPage() {
  const [phone, setPhone] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPhone(getSavedPhone());
  }, []);

  useEffect(() => {
    if (!phone) return;
    const fetchChats = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("conversations")
        .select("*, listing:listings(*)")
        .or(`buyer_phone.eq.${phone},seller_phone.eq.${phone}`)
        .order("updated_at", { ascending: false });
      setConversations((data as unknown as Conversation[]) || []);
      setLoading(false);
    };
    fetchChats();
  }, [phone]);

  if (!phone) {
    return (
      <div className="min-h-screen bg-[#0b1220]">
        <Header />
        <PhoneGate title="سجّل دخولك لعرض محادثاتك" onDone={(p) => setPhone(p)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b1220]">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-3">
        <h1 className="text-lg font-extrabold text-white mb-2">💬 محادثاتي</h1>

        {loading ? (
          <div className="text-center py-16 text-slate-500 text-sm">جاري التحميل... ⏳</div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-16 bg-[#0f1b30] border border-sky-900/60 rounded-2xl text-slate-400 text-sm">
            لا توجد محادثات بعد.
          </div>
        ) : (
          conversations.map((conv) => {
            const isSeller = phone === conv.seller_phone;
            const otherPhone = isSeller ? conv.buyer_phone : conv.seller_phone;
            return (
              <Link
                key={conv.id}
                href={`/chat/${conv.id}`}
                className="flex items-center justify-between gap-3 bg-[#0f1b30] border border-sky-900/60 rounded-2xl p-4 hover:border-sky-600/60 transition"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{conv.listing?.title || "إعلان محذوف"}</p>
                  <p className="text-xs text-slate-400">
                    {isSeller ? "مشتري" : "بائع"}: {displayPhone(otherPhone)}
                  </p>
                  {conv.current_offer_price && (
                    <p className="text-xs text-sky-400 font-mono font-bold mt-1">
                      آخر عرض: {formatPrice(conv.current_offer_price)} ج.س
                      {conv.offer_status === "accepted" && " ✅ متفق عليه"}
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-slate-500 shrink-0">{timeAgo(conv.updated_at)}</span>
              </Link>
            );
          })
        )}
      </main>
    </div>
  );
}
