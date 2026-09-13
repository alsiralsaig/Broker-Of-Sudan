"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Phone, Send, CheckCircle2 } from "lucide-react";
import Header from "@/components/Header";
import PhoneGate from "@/components/PhoneGate";
import VoiceRecorder from "@/components/VoiceRecorder";
import { supabase } from "@/lib/supabase";
import { displayPhone, formatPrice, timeAgo } from "@/lib/format";
import { getSavedPhone } from "@/lib/session";
import type { Conversation, Message } from "@/lib/types";

export default function ChatPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [myPhone, setMyPhone] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [offerAmount, setOfferAmount] = useState("");
  const [showOfferBox, setShowOfferBox] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMyPhone(getSavedPhone());
  }, []);

  useEffect(() => {
    if (!myPhone) return;
    let alive = true;

    const fetchAll = async () => {
      const { data: conv } = await supabase
        .from("conversations")
        .select("*, listing:listings(*)")
        .eq("id", params.id)
        .maybeSingle();

      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", params.id)
        .order("created_at", { ascending: true });

      if (!alive) return;
      setConversation(conv as unknown as Conversation);
      setMessages((msgs as unknown as Message[]) || []);
      setLoading(false);
    };

    fetchAll();

    const channel = supabase
      .channel(`chat-${params.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${params.id}` },
        () => fetchAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations", filter: `id=eq.${params.id}` },
        () => fetchAll()
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [myPhone, params.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!myPhone) {
    return (
      <div className="min-h-screen bg-[#0b1220]">
        <Header />
        <PhoneGate
          title="سجّل دخولك لعرض المحادثة"
          onDone={(phone) => setMyPhone(phone)}
        />
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

  if (!conversation) {
    return (
      <div className="min-h-screen bg-[#0b1220]">
        <Header />
        <div className="text-center py-20 text-slate-400 text-sm">المحادثة غير موجودة.</div>
      </div>
    );
  }

  const isSeller = myPhone === conversation.seller_phone;
  const otherPhone = isSeller ? conversation.buyer_phone : conversation.seller_phone;
  const listing = conversation.listing;
  const locked = listing?.status !== "available";

  const sendMessage = async (payload: Partial<Message>) => {
    setSending(true);
    await supabase.from("messages").insert([
      {
        conversation_id: params.id,
        sender_phone: myPhone,
        message_type: "text",
        ...payload,
      },
    ]);
    setSending(false);
  };

  const handleSendText = async () => {
    if (!text.trim() || sending) return;
    const body = text.trim();
    setText("");
    await sendMessage({ message_type: "text", body });
  };

  const handleSendOffer = async () => {
    const amount = parseFloat(offerAmount);
    if (!amount || amount <= 0 || sending) return;
    setSending(true);

    await supabase.from("messages").insert([
      {
        conversation_id: params.id,
        sender_phone: myPhone,
        message_type: "offer",
        offer_price: amount,
        body: `عرض سعر: ${formatPrice(amount)} ج.س`,
      },
    ]);

    await supabase
      .from("conversations")
      .update({
        current_offer_price: amount,
        current_offer_by: isSeller ? "seller" : "buyer",
        offer_status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id);

    setOfferAmount("");
    setShowOfferBox(false);
    setSending(false);
  };

  const handleAcceptOffer = async (msg: Message) => {
    if (!msg.offer_price || !listing) return;
    setSending(true);

    await supabase.from("messages").insert([
      {
        conversation_id: params.id,
        sender_phone: myPhone,
        message_type: "system",
        body: `✅ تم الاتفاق على السعر ${formatPrice(msg.offer_price)} ج.س`,
      },
    ]);

    await supabase
      .from("conversations")
      .update({ offer_status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", params.id);

    await supabase
      .from("listings")
      .update({ status: listing.deal_type === "rent" ? "rented" : "sold" })
      .eq("id", listing.id);

    setSending(false);
  };

  const handleSendVoice = async (blob: Blob, durationSec: number) => {
    setSending(true);
    const path = `voice/${params.id}/${crypto.randomUUID()}.webm`;
    const { error } = await supabase.storage.from("media").upload(path, blob);
    if (!error) {
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      await sendMessage({
        message_type: "voice",
        voice_url: data.publicUrl,
        voice_duration_sec: durationSec,
      });
    }
    setSending(false);
  };

  return (
    <div className="min-h-screen bg-[#0b1220] flex flex-col">
      <Header />

      {/* شريط معلومات الإعلان */}
      {listing && (
        <Link
          href={`/listing/${listing.id}`}
          className="max-w-4xl w-full mx-auto px-4 py-3 flex items-center justify-between gap-3 border-b border-sky-900/50"
        >
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">{listing.title}</p>
            <p className="text-xs text-slate-400">
              {isSeller ? `المشتري: ${displayPhone(conversation.buyer_phone)}` : `البائع: ${displayPhone(conversation.seller_phone)}`}
            </p>
          </div>
          <a
            href={`tel:${otherPhone}`}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400"
            title="اتصال هاتفي"
          >
            <Phone size={16} />
          </a>
        </Link>
      )}

      {locked && (
        <div className="max-w-4xl w-full mx-auto px-4 pt-3">
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold rounded-xl px-3.5 py-3 text-center">
            ✅ تم الاتفاق على هذا الإعلان — لم يعد متاحاً للمفاصلة
          </div>
        </div>
      )}

      {/* الرسائل */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-4 space-y-3 overflow-y-auto">
        {messages.map((msg) => {
          const mine = msg.sender_phone === myPhone;

          if (msg.message_type === "system") {
            return (
              <div key={msg.id} className="text-center text-[11px] text-slate-500 py-1">
                {msg.body}
              </div>
            );
          }

          if (msg.message_type === "offer") {
            const isLastPendingOffer =
              conversation.offer_status === "pending" && conversation.current_offer_price === msg.offer_price;
            const canAccept = isLastPendingOffer && !mine && !locked;

            return (
              <div key={msg.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 space-y-2 border ${
                    mine ? "bg-sky-500/10 border-sky-500/40" : "bg-[#0f1b30] border-sky-900/60"
                  }`}
                >
                  <p className="text-[10px] text-slate-400 font-bold">💰 عرض سعر</p>
                  <p className="text-lg font-extrabold text-sky-400 font-mono">{formatPrice(msg.offer_price!)} ج.س</p>
                  {canAccept && (
                    <button
                      onClick={() => handleAcceptOffer(msg)}
                      disabled={sending}
                      className="w-full flex items-center justify-center gap-1.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold rounded-xl text-xs disabled:opacity-50"
                    >
                      <CheckCircle2 size={14} /> قبول هذا العرض
                    </button>
                  )}
                  <p className="text-[10px] text-slate-500">{timeAgo(msg.created_at)}</p>
                </div>
              </div>
            );
          }

          if (msg.message_type === "voice") {
            return (
              <div key={msg.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2.5 border ${
                    mine ? "bg-sky-500/10 border-sky-500/40" : "bg-[#0f1b30] border-sky-900/60"
                  }`}
                >
                  <audio src={msg.voice_url!} controls className="h-9 w-56 max-w-full" />
                  <p className="text-[10px] text-slate-500 mt-1">{timeAgo(msg.created_at)}</p>
                </div>
              </div>
            );
          }

          return (
            <div key={msg.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 border ${
                  mine ? "bg-sky-500/10 border-sky-500/40" : "bg-[#0f1b30] border-sky-900/60"
                }`}
              >
                <p className="text-sm text-slate-100 whitespace-pre-wrap break-words">{msg.body}</p>
                <p className="text-[10px] text-slate-500 mt-1">{timeAgo(msg.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </main>

      {/* شريط الإدخال */}
      {!locked && (
        <div className="max-w-4xl w-full mx-auto px-4 pb-4 space-y-2 sticky bottom-0 bg-[#0b1220]">
          {showOfferBox && (
            <div className="flex items-center gap-2 bg-[#0f1b30] border border-sky-900/60 rounded-xl p-2">
              <input
                type="number"
                autoFocus
                value={offerAmount}
                onChange={(e) => setOfferAmount(e.target.value)}
                placeholder="أدخل السعر المقترح (ج.س)"
                className="flex-1 bg-transparent px-2 py-2 text-sm text-white placeholder-slate-500 focus:outline-none font-mono"
              />
              <button
                onClick={handleSendOffer}
                disabled={sending}
                className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold rounded-lg text-xs disabled:opacity-50"
              >
                إرسال العرض
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowOfferBox((v) => !v)}
              className="shrink-0 px-3.5 py-2.5 bg-[#0f1b30] border border-sky-900/60 rounded-xl text-xs font-extrabold text-sky-400"
            >
              💰 عرض سعر
            </button>

            <VoiceRecorder onSend={handleSendVoice} disabled={sending} />

            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendText()}
              placeholder="اكتب رسالة..."
              className="flex-1 bg-[#0f1b30] border border-sky-900/60 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />

            <button
              onClick={handleSendText}
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
