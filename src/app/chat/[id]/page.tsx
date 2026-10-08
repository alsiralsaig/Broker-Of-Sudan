"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Phone, Send, CheckCircle2, XCircle } from "lucide-react";
import Header from "@/components/Header";
import AuthGate from "@/components/AuthGate";
import VoiceRecorder from "@/components/VoiceRecorder";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { refreshUnread } from "@/lib/useUnread";
import { uploadVoice } from "@/lib/upload";
import { formatPrice, timeAgo } from "@/lib/format";
import type { ConversationDetail, Message } from "@/lib/types";

const bubble = (mine: boolean) =>
  `max-w-[80%] rounded-2xl border ${mine ? "bg-sky-500/10 border-sky-500/40" : "bg-[#0f1b30] border-sky-900/60"}`;

export default function ChatPage() {
  const params = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();

  const [detail, setDetail] = useState<Omit<ConversationDetail, "messages"> | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [offerAmount, setOfferAmount] = useState("");
  const [showOfferBox, setShowOfferBox] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastAt = useRef<string | null>(null);
  const busy = useRef(false);

  // جلب أول مرة كامل، وبعدها الجديد بس (يوفّر الباقة)
  const fetchChat = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await api<ConversationDetail>(`/conversations/${params.id}`, {
        query: { after: lastAt.current || undefined },
      });
      const { messages: incoming, ...rest } = r;
      setDetail(rest);
      if (incoming.length) {
        lastAt.current = incoming[incoming.length - 1].createdAt;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          return [...prev, ...incoming.filter((m) => !seen.has(m.id))];
        });
        refreshUnread();
      }
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (!user) return;
    lastAt.current = null;
    setMessages([]);
    fetchChat();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") fetchChat();
    }, 3000);
    const onVis = () => document.visibilityState === "visible" && fetchChat();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user, fetchChat]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const act = async (fn: () => Promise<unknown>) => {
    setSending(true);
    try {
      await fn();
      await fetchChat();
    } catch (e) {
      alert(errMsg(e));
    } finally {
      setSending(false);
    }
  };

  if (authLoading) return <div className="min-h-screen bg-[#0b1220]"><Header /></div>;
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0b1220]">
        <Header />
        <AuthGate title="سجّل دخولك لعرض المحادثة" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b1220]">
        <Header />
        <div className="text-center py-20 text-slate-500 text-sm">جاري التحميل... ⏳</div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="min-h-screen bg-[#0b1220]">
        <Header />
        <div className="text-center py-20 text-slate-400 text-sm">{error || "المحادثة غير موجودة."}</div>
      </div>
    );
  }

  const { conversation: conv, listing, deal } = detail;
  const isSeller = conv.side === "seller";
  const isAdmin = conv.side === "admin";
  const closed = listing.status === "sold" || listing.status === "rented";
  const reservedElsewhere = listing.status === "reserved" && !deal;
  const canOffer = !isAdmin && listing.status === "available" && conv.offerStatus !== "accepted";
  const canWrite = !isAdmin && !closed;

  const sendText = () => {
    const body = text.trim();
    if (!body || sending) return;
    setText("");
    act(() => api(`/conversations/${params.id}/messages`, { method: "POST", body: { type: "text", body } }));
  };

  const sendOffer = () => {
    const price = parseFloat(offerAmount.replace(/,/g, ""));
    if (!price || price <= 0 || sending) return;
    act(async () => {
      await api(`/conversations/${params.id}/offer`, { method: "POST", body: { price } });
      setOfferAmount("");
      setShowOfferBox(false);
    });
  };

  const acceptOffer = (price: number) => {
    if (!confirm(`تأكيد الاتفاق المبدئي على ${formatPrice(price)} ج.س؟\nالإعلان حيتحجز وأرقام التلفون حتظهر للطرفين.`)) return;
    act(() => api(`/conversations/${params.id}/accept`, { method: "POST" }));
  };

  const completeDeal = () => {
    if (!deal || !confirm(`تأكيد إن ${listing.dealType === "rent" ? "التأجير" : "البيع"} تم فعلاً؟`)) return;
    act(() => api(`/deals/${deal.id}/complete`, { method: "POST" }));
  };

  const cancelDeal = () => {
    if (!deal) return;
    const reason = prompt("ليه الاتفاق اتلغى؟ (اختياري)");
    if (reason === null) return;
    act(() => api(`/deals/${deal.id}/cancel`, { method: "POST", body: { reason } }));
  };

  const sendVoice = (blob: Blob, durationSec: number) =>
    act(async () => {
      const url = await uploadVoice(blob);
      await api(`/conversations/${params.id}/messages`, {
        method: "POST",
        body: { type: "voice", voiceUrl: url, voiceDuration: durationSec },
      });
    });

  return (
    <div className="min-h-screen bg-[#0b1220] flex flex-col">
      <Header />

      <Link
        href={`/listing/${listing.id}`}
        className="max-w-4xl w-full mx-auto px-4 py-3 flex items-center justify-between gap-3 border-b border-sky-900/50"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 w-11 h-11 rounded-lg overflow-hidden bg-[#0f1b30] flex items-center justify-center">
            {listing.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={listing.cover} alt="" className="w-full h-full object-cover" />
            ) : listing.category === "car" ? "🚗" : "🏠"}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">{listing.title}</p>
            <p className="text-xs text-slate-400 truncate">
              {isAdmin ? conv.otherName : `${isSeller ? "المشتري" : "البائع"}: ${conv.otherName}`} ·{" "}
              <span className="font-mono">{formatPrice(listing.price)}</span> ج.س
            </p>
          </div>
        </div>
        {conv.otherPhone && (
          <a
            href={`tel:${conv.otherPhone}`}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400"
            title="اتصال هاتفي"
          >
            <Phone size={16} />
          </a>
        )}
      </Link>

      <div className="max-w-4xl w-full mx-auto px-4 pt-3 space-y-2">
        {deal?.status === "agreed" && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 space-y-2.5">
            <p className="text-emerald-300 text-xs font-extrabold text-center">
              🤝 اتفاق مبدئي على {formatPrice(deal.price)} ج.س — الإعلان محجوز ليكم
            </p>
            {conv.otherPhone && (
              <p className="text-center text-xs text-slate-300">
                رقم {isSeller ? "المشتري" : "البائع"}:{" "}
                <a href={`tel:${conv.otherPhone}`} className="font-mono font-bold text-white" dir="ltr">{conv.otherPhone}</a>
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {(isSeller || isAdmin) && (
                <button onClick={completeDeal} disabled={sending} className="flex items-center justify-center gap-1.5 py-2.5 bg-emerald-500 text-slate-950 font-extrabold rounded-xl text-xs disabled:opacity-50">
                  <CheckCircle2 size={14} /> تمت الصفقة
                </button>
              )}
              <button onClick={cancelDeal} disabled={sending} className={`flex items-center justify-center gap-1.5 py-2.5 bg-red-500/10 border border-red-500/30 text-red-300 font-extrabold rounded-xl text-xs disabled:opacity-50 ${isSeller || isAdmin ? "" : "col-span-2"}`}>
                <XCircle size={14} /> إلغاء الاتفاق
              </button>
            </div>
            {!isSeller && !isAdmin && (
              <p className="text-[10px] text-slate-500 text-center">البائع بيأكد «تمت الصفقة» بعد الاستلام والتسليم.</p>
            )}
          </div>
        )}
        {deal?.status === "completed" && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold rounded-xl px-3.5 py-3 text-center">
            ✅ تمت الصفقة على {formatPrice(deal.price)} ج.س — مبروك!
            {conv.otherPhone && <span className="block mt-1 font-mono text-white" dir="ltr">{conv.otherPhone}</span>}
          </div>
        )}
        {reservedElsewhere && (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold rounded-xl px-3.5 py-3 text-center">
            🔒 الإعلان محجوز حالياً لمشتري تاني — لو الاتفاق اتلغى، المفاصلة بترجع تفتح.
          </div>
        )}
        {closed && !deal && (
          <div className="bg-slate-500/10 border border-slate-500/30 text-slate-300 text-xs font-bold rounded-xl px-3.5 py-3 text-center">
            الإعلان ده اتقفل — {listing.status === "rented" ? "اتأجّر" : "اتباع"}
          </div>
        )}
        {error && <div className="text-center text-[11px] text-red-300">⚠️ {error}</div>}
      </div>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-4 space-y-3 overflow-y-auto">
        {messages.map((msg) => {
          const mine = msg.mine;
          const side = mine ? "justify-start" : "justify-end";

          if (msg.type === "system") {
            return (
              <div key={msg.id} className="text-center text-[11px] text-slate-500 py-1 px-6 leading-relaxed">
                {msg.body}
              </div>
            );
          }

          if (msg.type === "offer") {
            const isLastPending =
              conv.offerStatus === "pending" && conv.currentOfferPrice === msg.offerPrice && msg.id === lastOfferId(messages);
            const canAccept = isLastPending && !mine && canOffer;
            return (
              <div key={msg.id} className={`flex ${side}`}>
                <div className={`${bubble(mine)} px-4 py-3 space-y-2`}>
                  <p className="text-[10px] text-slate-400 font-bold">💰 عرض سعر{isLastPending ? " · منتظر رد" : ""}</p>
                  <p className="text-lg font-extrabold text-sky-400 font-mono">{formatPrice(msg.offerPrice)} ج.س</p>
                  {canAccept && (
                    <button
                      onClick={() => acceptOffer(msg.offerPrice!)}
                      disabled={sending}
                      className="w-full flex items-center justify-center gap-1.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold rounded-xl text-xs disabled:opacity-50"
                    >
                      <CheckCircle2 size={14} /> قبول هذا العرض
                    </button>
                  )}
                  <p className="text-[10px] text-slate-500">{timeAgo(msg.createdAt)}</p>
                </div>
              </div>
            );
          }

          if (msg.type === "voice") {
            return (
              <div key={msg.id} className={`flex ${side}`}>
                <div className={`${bubble(mine)} px-3 py-2.5`}>
                  <audio src={msg.voiceUrl!} controls preload="none" className="h-9 w-56 max-w-full" />
                  <p className="text-[10px] text-slate-500 mt-1">
                    {msg.voiceDuration ? `${msg.voiceDuration}ث · ` : ""}{timeAgo(msg.createdAt)}
                  </p>
                </div>
              </div>
            );
          }

          return (
            <div key={msg.id} className={`flex ${side}`}>
              <div className={`${bubble(mine)} px-4 py-2.5`}>
                <p className="text-sm text-slate-100 whitespace-pre-wrap break-words">{msg.body}</p>
                <p className="text-[10px] text-slate-500 mt-1">{timeAgo(msg.createdAt)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </main>

      {canWrite && (
        <div className="max-w-4xl w-full mx-auto px-4 pb-4 space-y-2 sticky bottom-0 bg-[#0b1220]">
          {!deal && !reservedElsewhere && (
            <p className="text-[10px] text-slate-500 text-center">🔒 الأرقام بتظهر بعد الاتفاق — خلي التواصل هنا لحمايتك.</p>
          )}
          {showOfferBox && canOffer && (
            <div className="flex items-center gap-2 bg-[#0f1b30] border border-sky-900/60 rounded-xl p-2">
              <input
                inputMode="numeric"
                autoFocus
                value={offerAmount}
                onChange={(e) => setOfferAmount(e.target.value)}
                placeholder="أدخل السعر المقترح (ج.س)"
                className="flex-1 bg-transparent px-2 py-2 text-sm text-white placeholder-slate-500 focus:outline-none font-mono"
              />
              <button
                onClick={sendOffer}
                disabled={sending}
                className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold rounded-lg text-xs disabled:opacity-50"
              >
                إرسال العرض
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            {canOffer && (
              <button
                onClick={() => setShowOfferBox((v) => !v)}
                className="shrink-0 px-3.5 py-2.5 bg-[#0f1b30] border border-sky-900/60 rounded-xl text-xs font-extrabold text-sky-400"
              >
                💰 عرض
              </button>
            )}
            <VoiceRecorder onSend={sendVoice} disabled={sending} />
            <input
              type="text"
              value={text}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendText()}
              placeholder="اكتب رسالة..."
              className="flex-1 min-w-0 bg-[#0f1b30] border border-sky-900/60 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
            <button
              onClick={sendText}
              disabled={sending || !text.trim()}
              className="shrink-0 w-11 h-11 rounded-full bg-sky-500 hover:bg-sky-400 text-slate-950 flex items-center justify-center disabled:opacity-50"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function lastOfferId(messages: Message[]) {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].type === "offer") return messages[i].id;
  return null;
}
