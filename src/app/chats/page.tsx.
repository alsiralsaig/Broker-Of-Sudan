"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import PhoneGate from "@/components/PhoneGate";
import { supabase } from "@/lib/supabase";
import { displayPhone, formatPrice, timeAgo } from "@/lib/format";
import { getSavedPhone } from "@/lib/session";
import { isUnread } from "@/lib/notifications";
import type { Conversation } from "@/lib/types";

interface LastMessageInfo {
  created_at: string;
  sender_phone: string;
}

export default function ChatsListPage() {
  const [phone, setPhone] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [lastMessages, setLastMessages] = useState<Record<string, LastMessageInfo>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPhone(getSavedPhone());
  }, []);

  useEffect(() => {
    if (!phone) return;

    const fetchChats = async (showLoading = true) => {
      if (showLoading) setLoading(true);

      const { data: convs } = await supabase
        .from("conversations")
        .select("*, listing:listings(*)")
        .or(`buyer_phone.eq.${phone},seller_phone.eq.${phone}`)
        .order("updated_at", { ascending: false });

      const list = (convs as unknown as Conversation[]) || [];
      setConversations(list);

      // نجيب آخر رسالة في كل محادثة عشان نحدد لو فيه جديد لسه ما اتقراش
      if (list.length > 0) {
        const ids = list.map((c) => c.id);
        const { data: msgs } = await supabase
          .from("messages")
          .select("conversation_id, sender_phone, created_at")
          .in("conversation_id", ids)
          .order("created_at", { ascending: true });

        const lastByConv: Record<string, LastMessageInfo> = {};
        (msgs || []).forEach((m: any) => {
          lastByConv[m.conversation_id] = { created_at: m.created_at, sender_phone: m.sender_phone };
        });
        setLastMessages(lastByConv);
      }

      setLoading(false);
    };

    fetchChats();

    // تحديث تلقائي كل 5 ثواني — يظهر المحادثات والرسائل الجديدة بدون
    // ما يحتاج المستخدم يعمل Refresh يدوي للصفحة
    const pollInterval = setInterval(() => fetchChats(false), 5000);

    const channel = supabase
      .channel(`chats-list-${phone}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => fetchChats(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => fetchChats(false))
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [phone]);

  if (!phone) {
    return (
      <div className="min-h-screen bg-[#0b1220]">
        <Header />
        <PhoneGate title="سجّل دخولك لعرض محادثاتك" onDone={(p) => setPhone(p)} />
      </div>
    );
  }

  const unreadCount = conversations.filter((conv) => {
    const last = lastMessages[conv.id];
    return isUnread(conv.id, last?.created_at, last?.sender_phone, phone);
  }).length;

  return (
    <div className="min-h-screen bg-[#0b1220]">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-lg font-extrabold text-white">💬 محادثاتي</h1>
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-[11px] font-extrabold px-2 py-0.5 rounded-full">
              {unreadCount} جديد
            </span>
          )}
        </div>

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
            const last = lastMessages[conv.id];
            const unread = isUnread(conv.id, last?.created_at, last?.sender_phone, phone);

            return (
              <Link
                key={conv.id}
                href={`/chat/${conv.id}`}
                className={`flex items-center justify-between gap-3 bg-[#0f1b30] rounded-2xl p-4 hover:border-sky-600/60 transition ${
                  unread ? "border-2 border-sky-500 shadow-lg shadow-sky-500/10" : "border border-sky-900/60"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {unread && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                    <p className={`text-sm truncate ${unread ? "font-extrabold text-white" : "font-bold text-slate-200"}`}>
                      {conv.listing?.title || "إعلان محذوف"}
                    </p>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
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
