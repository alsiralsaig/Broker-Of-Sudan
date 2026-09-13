"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname();

  const navItem = (href: string, label: string, emoji: string) => {
    const active = pathname === href || (href !== "/" && pathname?.startsWith(href));
    return (
      <Link
        href={href}
        className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
          active
            ? "bg-sky-500 text-slate-950 shadow-md"
            : "bg-[#0f1b30] text-slate-300 border border-sky-900/60 hover:text-white"
        }`}
      >
        <span>{emoji}</span> {label}
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
          {navItem("/chats", "محادثاتي", "💬")}
        </nav>
      </div>
    </header>
  );
}
