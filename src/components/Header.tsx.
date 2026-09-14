"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSavedPhone } from "@/lib/session";
import { useUnreadConversations } from "@/lib/useUnreadConversations";
import NotificationBell from "@/components/NotificationBell";

export default function Header() {
  const pathname = usePathname();
  const [phone, setPhone] = useState<string | null>(null);

  useEffect(() => {
    setPhone(getSavedPhone());
  }, [pathname]);

  const unreadItems = useUnreadConversations(phone);
  const unreadCount = unreadItems.length;

  const navItem = (href: string, label: string, emoji: string, badge?: number) => {
    const active = pathname === href || (href !== "/" && pathname?.startsWith(href));
    return (
      <Link
        href={href}
        className={`relative px-2 sm:px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 shrink-0 ${
          active
            ? "bg-sky-500 text-slate-950 shadow-md"
            : "bg-[#0f1b30] text-slate-300 border border-sky-900/60 hover:text-white"
        }`}
      >
        <span>{emoji}</span>
        {/* النص يختفي على الشاشات الصغيرة عشان كل الأزرار تفضل ظاهرة كاملة بدون الحاجة للسحب */}
        <span className="hidden sm:inline">{label}</span>
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
      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
        <Link href="/" className="flex items-center gap-1.5 shrink-0">
          <span className="text-2xl">🛒</span>
          <span className="hidden sm:inline font-extrabold text-lg text-white tracking-wide">سمسار السودان</span>
        </Link>

        <nav className="flex items-center gap-1.5 sm:gap-2">
          {navItem("/", "تصفح", "🔎")}
          {navItem("/new", "أضف إعلان", "➕")}
          {navItem("/my", "إعلاناتي", "📋")}
          {navItem("/chats", "محادثاتي", "💬", unreadCount)}
          {phone && <NotificationBell phone={phone} items={unreadItems} />}
        </nav>
      </div>
    </header>
  );
}
