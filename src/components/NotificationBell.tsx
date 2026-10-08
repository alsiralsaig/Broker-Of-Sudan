"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellRing } from "lucide-react";
import { timeAgo } from "@/lib/format";
import { api } from "@/lib/api";
import { refreshUnread, type UnreadState } from "@/lib/useUnread";
import PushToggle from "@/components/PushToggle";

/** جرس: محادثات فيها جديد + إشعارات (عروض، صفقات، عمولات...) */
export default function NotificationBell({ state }: { state: UnreadState }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { items, notifications, unreadNotifications } = state;
  const count = items.length + unreadNotifications;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unreadNotifications > 0) {
      api("/notifications/read", { method: "POST" }).then(refreshUnread).catch(() => {});
    }
  };

  const go = (url: string) => {
    setOpen(false);
    router.push(url);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={toggle}
        className="relative w-9 h-9 rounded-xl bg-[#0f1b30] border border-sky-900/60 flex items-center justify-center text-slate-300 hover:text-white transition"
        aria-label="الإشعارات"
      >
        {count > 0 ? <BellRing size={16} className="text-sky-400" /> : <Bell size={16} />}
        {count > 0 && (
          <span className="absolute -top-1.5 -left-1.5 bg-red-500 text-white text-[9px] font-extrabold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center border-2 border-[#0b1220]">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-80 max-w-[90vw] bg-[#0f1b30] border border-sky-900/60 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-sky-900/50 flex items-center justify-between">
            <p className="text-sm font-extrabold text-white">🔔 الإشعارات</p>
            {count > 0 && <span className="text-[11px] text-slate-400">{count} جديد</span>}
          </div>

          <PushToggle compact />

          <div className="max-h-80 overflow-y-auto">
            {items.map((it) => (
              <button
                key={it.conversationId}
                onClick={() => go(`/chat/${it.conversationId}`)}
                className="w-full text-right px-4 py-3 border-b border-sky-900/30 hover:bg-sky-500/5 transition flex items-start gap-2.5"
              >
                <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 mt-1.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold text-white truncate">💬 {it.title}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {it.count > 1 ? `${it.count} رسائل جديدة` : "رسالة جديدة"} من {it.from === "seller" ? "البائع" : "المشتري"}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">{timeAgo(it.at)}</p>
                </div>
              </button>
            ))}
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => go(n.url)}
                className={`w-full text-right px-4 py-3 border-b border-sky-900/30 hover:bg-sky-500/5 transition flex items-start gap-2.5 ${n.read ? "opacity-60" : ""}`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${n.read ? "bg-slate-600" : "bg-sky-400"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold text-white">{n.title}</p>
                  {n.body && <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>}
                  <p className="text-[10px] text-slate-500 mt-1">{timeAgo(n.at)}</p>
                </div>
              </button>
            ))}
            {items.length === 0 && notifications.length === 0 && (
              <div className="px-4 py-8 text-center text-slate-500 text-xs">لا توجد إشعارات</div>
            )}
          </div>

          <button
            onClick={() => go("/chats")}
            className="w-full py-2.5 text-center text-xs font-bold text-sky-400 hover:bg-sky-500/5 transition border-t border-sky-900/50"
          >
            عرض كل المحادثات
          </button>
        </div>
      )}
    </div>
  );
}
