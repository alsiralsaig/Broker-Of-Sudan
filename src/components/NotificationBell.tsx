"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellRing } from "lucide-react";
import { markConversationRead } from "@/lib/notifications";
import { subscribeToPush, getPushPermission, isPushSupported } from "@/lib/push";
import { timeAgo } from "@/lib/format";
import type { UnreadItem } from "@/lib/useUnreadConversations";

interface NotificationBellProps {
  phone: string;
  items: UnreadItem[];
}

/** جرس إشعارات داخل التطبيق بقائمة منسدلة، بنفس أسلوب فيسبوك/واتساب ويب */
export default function NotificationBell({ phone, items }: NotificationBellProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [askedPush, setAskedPush] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // بمجرد ما نعرف رقم المستخدم، نحاول نفعّل له إشعارات Push حقيقية
  // (تظهر حتى لو التطبيق مقفول) — طلب إذن مرة واحدة فقط
  useEffect(() => {
    if (!phone || askedPush) return;
    if (!isPushSupported()) return;
    if (getPushPermission() === "granted") {
      subscribeToPush(phone); // تحديث الاشتراك بصمت لو كان موافق بالفعل
      setAskedPush(true);
      return;
    }
    if (getPushPermission() === "denied") {
      setAskedPush(true);
      return;
    }
    // لسه ما سُئلش، نستنى تفاعل أول من المستخدم (فتح الجرس) قبل ما نطلب الإذن
  }, [phone, askedPush]);


  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleToggle = async () => {
    setOpen((v) => !v);
    if (!open && phone && !askedPush && getPushPermission() === "default") {
      await subscribeToPush(phone);
      setAskedPush(true);
    }
  };

  const handleItemClick = (conversationId: string) => {
    markConversationRead(conversationId);
    setOpen(false);
    router.push(`/chat/${conversationId}`);
  };

  const count = items.length;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={handleToggle}
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

          <div className="max-h-80 overflow-y-auto">
            {count === 0 ? (
              <div className="px-4 py-8 text-center text-slate-500 text-xs">لا توجد إشعارات جديدة</div>
            ) : (
              items.map(({ conversation, lastMessageAt }) => {
                const isSeller = phone === conversation.seller_phone;
                return (
                  <button
                    key={conversation.id}
                    onClick={() => handleItemClick(conversation.id)}
                    className="w-full text-right px-4 py-3 border-b border-sky-900/30 hover:bg-sky-500/5 transition flex items-start gap-2.5"
                  >
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 mt-1.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-extrabold text-white truncate">
                        {conversation.listing?.title || "إعلان محذوف"}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        رسالة جديدة من {isSeller ? "المشتري" : "البائع"}
                      </p>
                      {lastMessageAt && (
                        <p className="text-[10px] text-slate-500 mt-1">{timeAgo(lastMessageAt)}</p>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <button
            onClick={() => {
              setOpen(false);
              router.push("/chats");
            }}
            className="w-full py-2.5 text-center text-xs font-bold text-sky-400 hover:bg-sky-500/5 transition border-t border-sky-900/50"
          >
            عرض كل المحادثات
          </button>
        </div>
      )}
    </div>
  );
}
