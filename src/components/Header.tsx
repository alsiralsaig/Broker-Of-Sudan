"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { UserRound, LogOut, KeyRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useUnread } from "@/lib/useUnread";
import NotificationBell from "@/components/NotificationBell";

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const unread = useUnread(!!user);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const navItem = (href: string, label: string, emoji: string, badge?: number) => {
    const active = pathname === href || (href !== "/" && pathname?.startsWith(href));
    return (
      <Link
        href={href}
        className={`relative px-2 sm:px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 shrink-0 ${
          active ? "bg-sky-500 text-slate-950 shadow-md" : "bg-[#0f1b30] text-slate-300 border border-sky-900/60 hover:text-white"
        }`}
      >
        <span>{emoji}</span>
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
          {navItem("/chats", "محادثاتي", "💬", unread.items.length)}
          {user?.role === "admin" && navItem("/admin", "الإدارة", "🛠️")}
          {user && <NotificationBell state={unread} />}
          {user && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenu((v) => !v)}
                className="w-9 h-9 rounded-xl bg-[#0f1b30] border border-sky-900/60 flex items-center justify-center text-slate-300 hover:text-white"
                aria-label="حسابي"
              >
                <UserRound size={16} />
              </button>
              {menu && (
                <div className="absolute left-0 mt-2 w-56 bg-[#0f1b30] border border-sky-900/60 rounded-2xl shadow-2xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-sky-900/50">
                    <p className="text-sm font-extrabold text-white truncate">{user.name}</p>
                    <p className="text-[11px] text-slate-400 font-mono" dir="ltr">{user.phone}</p>
                  </div>
                  <button
                    onClick={() => { setMenu(false); router.push("/account"); }}
                    className="w-full text-right px-4 py-2.5 text-xs font-bold text-slate-200 hover:bg-sky-500/5 flex items-center gap-2"
                  >
                    <KeyRound size={14} /> حسابي وكلمة السر
                  </button>
                  <button
                    onClick={async () => { setMenu(false); await logout(); router.push("/"); }}
                    className="w-full text-right px-4 py-2.5 text-xs font-bold text-red-300 hover:bg-red-500/5 flex items-center gap-2 border-t border-sky-900/40"
                  >
                    <LogOut size={14} /> تسجيل خروج
                  </button>
                </div>
              )}
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
