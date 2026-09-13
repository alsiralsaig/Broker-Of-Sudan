"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getSavedPhone } from "@/lib/session";
import { isUnread } from "@/lib/notifications";
import type { Conversation } from "@/lib/types";

export default function Header() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const phone = getSavedPhone();
    if (!phone) return;

    const checkUnread = async () => {
      const { data: convs } = await supabase
        .from("conversations")
        .select("id")
        .or(`buyer_phone.eq.${phone},seller_phone.eq.${phone}`);

      const list = (convs as unknown as Conversation[]) || [];
      if (list.length === 0) {
        setUnreadCount(0);
        return;
      }

      const ids = list.map((c) => c.id);
      const { data: msgs } = await supabase
        .from("messages")
        .select("conversation_id, sender_phone, created_at")
        .in("conversation_id", ids)
        .order("created_at", { ascending: true });

      const lastByConv: Record<string, { created_at: string; sender_phone: string }> = {};
      (msgs || []).forEach((m: any) => {
        lastByConv[m.conversation_id] = { created_at: m.created_at, sender_phone: m.sender_phone };
      });

      const count = ids.filter((id) => {
        const last = lastByConv[id];
        return isUnread(id, last?.created_at, last?.sender_phone, phone);
      }).length;

      setUnreadCount(count);
    };

    checkUnread();

    // نتحقق كل 6 ثواني — يكفي عشان الشارة تظهر بسرعة معقولة بدون إرهاق قاعدة البيانات
    const interval = setInterval(checkUnread, 6000);

    const channel = supabase
      .channel("header-unread-watcher")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, checkUnread)
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [pathname]);

  const navItem = (href: string, label: string, emoji: string, badge?: number) => {
    const active = pathname === href || (href !== "/" && pathname?.startsWith(href));
    return (
      <Link
        href={href}
        className={`relative px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
          active
            ? "bg-sky-500 text-slate-950 shadow-md"
            : "bg-[#0f1b30] text-slate-300 border border-sky-900/60 hover:text-white"
        }`}
      >
        <span>{emoji}</span> {label}
        {!!badge && (
          <span className="absolute -top-1.5 -left-1.5 bg-red-500 text-white text-[9px] font-extrabold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center border-2 border-[#0b1220]">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-40 bg-[#0b1220]/95 backdrop-blur border-b border-sky-900/50">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="text-2xl">🛒</span>
          <span className="font-extrabold text-lg text-white tracking-wide">سمسار السودان</span>
        </Link>

        <nav className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          {navItem("/", "تصفح", "🔎")}
          {navItem("/new", "أضف إعلان", "➕")}
          {navItem("/my", "إعلاناتي", "📋")}
          {navItem("/chats", "محادثاتي", "💬", unreadCount)}
        </nav>
      </div>
    </header>
  );
}
