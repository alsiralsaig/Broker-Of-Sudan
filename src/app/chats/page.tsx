"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import AuthGate from "@/components/AuthGate";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatPrice, timeAgo } from "@/lib/format";
import type { ConversationSummary } from "@/lib/types";

function preview(c: ConversationSummary) {
  const m = c.lastMessage;
  if (!m) return "";
  const who = m.mine ? "إنت: " : "";
  if (m.type === "offer") return `${who}💰 عرض ${formatPrice(m.offerPrice)} ج.س`;
  if (m.type === "voice") return `${who}🎤 رسالة صوتية`;
  if (m.type === "system") return m.body;
  return who + m.body;
}

export default function ChatsPage() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<ConversationSummary[] | null>(null);
  const [tab, setTab] = useState<"all" | "buyer" | "seller">("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      api<{ conversations: ConversationSummary[] }>("/conversations")
        .then((r) => alive && setItems(r.conversations))
        .catch((e) => alive && setError(errMsg(e)));
    };
    load();
    const t = setInterval(load, 10000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [user]);

  if (authLoading) return <div className="min-h-screen bg-[#0b1220]"><Header /></div>;
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0b1220]">
        <Header />
        <AuthGate title="سجّل دخولك لعرض محادثاتك" />
      </div>
    );
  }

  const shown = (items || []).filter((c) => tab === "all" || c.side === tab);

  return (
    <div className="min-h-screen bg-[#0b1220]">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <h1 className="text-lg font-extrabold text-white">💬 محادثاتي</h1>
        <div className="grid grid-cols-3 gap-2 bg-[#0f1b30] p-1 rounded-xl border border-sky-900/60">
          {([["all", "الكل"], ["buyer", "بشتري"], ["seller", "ببيع"]] as const).map(([id, l]) => (
            <button key={id} onClick={() => setTab(id)} className={`py-2 rounded-lg text-xs font-extrabold ${tab === id ? "bg-sky-500 text-slate-950" : "text-slate-400"}`}>
              {l}
            </button>
          ))}
        </div>

        {error && <div className="text-center text-red-300 text-xs">{error}</div>}

        {items === null ? (
          <div className="text-center py-16 text-slate-500 text-sm">جاري التحميل... ⏳</div>
        ) : shown.length === 0 ? (
          <div className="text-center py-16 bg-[#0f1b30] border border-sky-900/60 rounded-2xl text-slate-400 text-sm">
            ما في محادثات هنا لسه.
          </div>
        ) : (
          <div className="space-y-2">
            {shown.map((c) => (
              <Link
                key={c.id}
                href={`/chat/${c.id}`}
                className={`flex gap-3 items-center bg-[#0f1b30] border rounded-2xl p-3 transition hover:border-sky-600/60 ${
                  c.unread ? "border-sky-500/60" : "border-sky-900/60"
                }`}
              >
                <div className="shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-[#0b1526] flex items-center justify-center text-xl">
                  {c.listing.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.listing.cover} alt="" loading="lazy" className="w-full h-full object-cover" />
                  ) : "📦"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-white truncate">{c.listing.title}</p>
                    <span className="shrink-0 text-[10px] text-slate-500">{timeAgo(c.lastMessageAt)}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {c.side === "seller" ? "المشتري" : "البائع"}: {c.otherName}
                    {c.offerStatus === "accepted" && <span className="text-emerald-400 font-bold"> · 🤝 اتفاق</span>}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-xs truncate ${c.unread ? "text-white font-bold" : "text-slate-500"}`}>{preview(c)}</p>
                    {c.unread > 0 && (
                      <span className="shrink-0 bg-red-500 text-white text-[10px] font-extrabold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center">
                        {c.unread > 9 ? "9+" : c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
