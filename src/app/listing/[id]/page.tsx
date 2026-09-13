"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import PhoneGate from "@/components/PhoneGate";
import { supabase } from "@/lib/supabase";
import { formatPrice, timeAgo } from "@/lib/format";
import { getSavedName, getSavedPhone } from "@/lib/session";
import type { Listing } from "@/lib/types";

const dealLabel: Record<string, string> = { sale: "للبيع", rent: "للإيجار" };

export default function ListingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeMedia, setActiveMedia] = useState(0);
  const [showGate, setShowGate] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const fetchListing = async () => {
      const { data } = await supabase
        .from("listings")
        .select("*, listing_media(*)")
        .eq("id", params.id)
        .maybeSingle();
      setListing(data as unknown as Listing);
      setLoading(false);
    };
    fetchListing();
  }, [params.id]);

  const startConversation = async (buyerPhone: string, buyerName: string) => {
    if (!listing) return;
    setStarting(true);

    // محادثة واحدة لكل زوج مشتري+بائع لكل إعلان (upsert)
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("listing_id", listing.id)
      .eq("buyer_phone", buyerPhone)
      .maybeSingle();

    let conversationId = existing?.id as string | undefined;

    if (!conversationId) {
      const { data: created, error } = await supabase
        .from("conversations")
        .insert([
          {
            listing_id: listing.id,
            buyer_phone: buyerPhone,
            seller_phone: listing.seller_phone,
          },
        ])
        .select()
        .single();

      if (error || !created) {
        setStarting(false);
        alert("تعذر بدء المحادثة دلوقتي — جرب تاني");
        return;
      }
      conversationId = created.id;

      // رسالة نظام ترحيبية تلقائية
      await supabase.from("messages").insert([
        {
          conversation_id: conversationId,
          sender_phone: buyerPhone,
          message_type: "system",
          body: `بدأ ${buyerName} محادثة بخصوص "${listing.title}"`,
        },
      ]);
    }

    router.push(`/chat/${conversationId}`);
  };

  const handleContactClick = () => {
    const savedPhone = getSavedPhone();
    const savedName = getSavedName();
    if (savedPhone && savedName) {
      startConversation(savedPhone, savedName);
    } else {
      setShowGate(true);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b1220]">
        <Header />
        <div className="text-center py-20 text-slate-500 text-sm">جاري التحميل... ⏳</div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen bg-[#0b1220]">
        <Header />
        <div className="text-center py-20 text-slate-400 text-sm">الإعلان غير موجود أو تم حذفه.</div>
      </div>
    );
  }

  if (showGate) {
    return (
      <div className="min-h-screen bg-[#0b1220]">
        <Header />
        <PhoneGate
          title="سجّل دخولك للتواصل مع البائع"
          subtitle="أدخل اسمك ورقم هاتفك عشان تقدر تبدأ المفاصلة"
          onDone={(phone, name) => startConversation(phone, name)}
        />
      </div>
    );
  }

  const media = listing.listing_media?.sort((a, b) => a.sort_order - b.sort_order) ?? [];
  const isCar = listing.category === "car";

  return (
    <div className="min-h-screen bg-[#0b1220]">
      <Header />

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {/* معرض الوسائط */}
        <div className="space-y-2">
          <div className="w-full aspect-video bg-[#0f1b30] border border-sky-900/60 rounded-2xl overflow-hidden flex items-center justify-center">
            {media.length > 0 ? (
              media[activeMedia].media_type === "video" ? (
                <video src={media[activeMedia].url} controls className="w-full h-full object-contain bg-black" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={media[activeMedia].url} alt={listing.title} className="w-full h-full object-contain" />
              )
            ) : (
              <span className="text-6xl text-slate-700">{isCar ? "🚗" : "🏠"}</span>
            )}
          </div>

          {media.length > 1 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {media.map((m, i) => (
                <button
                  key={m.id}
                  onClick={() => setActiveMedia(i)}
                  className={`shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition ${
                    i === activeMedia ? "border-sky-500" : "border-sky-900/60 opacity-60"
                  }`}
                >
                  {m.media_type === "video" ? (
                    <div className="w-full h-full bg-black flex items-center justify-center text-lg">🎬</div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt="" className="w-full h-full object-cover" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* المعلومات الرئيسية */}
        <div className="bg-[#0f1b30] border border-sky-900/60 rounded-2xl p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-lg font-extrabold text-white">{listing.title}</h1>
            <span className="shrink-0 bg-sky-500/10 text-sky-400 border border-sky-500/30 px-2.5 py-1 rounded-lg text-[11px] font-bold">
              {dealLabel[listing.deal_type]}
            </span>
          </div>

          <div className="text-2xl font-extrabold text-sky-400 font-mono">
            {formatPrice(listing.price)} <span className="text-xs font-semibold">ج.س{listing.deal_type === "rent" ? "/شهرياً" : ""}</span>
          </div>

          {listing.location && <div className="text-xs text-slate-400">📍 {listing.location}</div>}
          <div className="text-[11px] text-slate-500">{timeAgo(listing.created_at)}</div>

          {listing.description && (
            <p className="text-sm text-slate-300 leading-relaxed border-t border-sky-900/50 pt-3">
              {listing.description}
            </p>
          )}

          {/* تفاصيل مخصصة حسب الفئة */}
          <div className="grid grid-cols-2 gap-2 border-t border-sky-900/50 pt-3 text-xs">
            {isCar ? (
              <>
                {listing.car_make && <Detail label="الماركة" value={listing.car_make} />}
                {listing.car_model && <Detail label="الموديل" value={listing.car_model} />}
                {listing.car_year && <Detail label="سنة الصنع" value={String(listing.car_year)} />}
                {listing.car_mileage_km !== null && (
                  <Detail label="الممشى" value={`${formatPrice(listing.car_mileage_km)} كم`} />
                )}
                {listing.car_condition && <Detail label="الحالة" value={listing.car_condition} />}
                {listing.car_transmission && <Detail label="ناقل الحركة" value={listing.car_transmission} />}
              </>
            ) : (
              <>
                {listing.property_type && <Detail label="نوع العقار" value={listing.property_type} />}
                {listing.property_area_sqm && <Detail label="المساحة" value={`${listing.property_area_sqm} م²`} />}
                {listing.property_rooms !== null && <Detail label="عدد الغرف" value={String(listing.property_rooms)} />}
                {listing.property_bathrooms !== null && (
                  <Detail label="عدد الحمامات" value={String(listing.property_bathrooms)} />
                )}
                {listing.property_floor !== null && <Detail label="الطابق" value={String(listing.property_floor)} />}
              </>
            )}
          </div>
        </div>

        {/* معلومات البائع + زر بدء المفاصلة */}
        <div className="bg-[#0f1b30] border border-sky-900/60 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-300">👤 البائع:</span>
            <span className="font-bold text-white">{listing.seller_name || "بائع"}</span>
          </div>

          {listing.status === "available" ? (
            <button
              onClick={handleContactClick}
              disabled={starting}
              className="w-full py-4 bg-sky-500 hover:bg-sky-400 active:scale-[0.99] text-slate-950 font-extrabold rounded-2xl text-sm shadow-xl transition disabled:opacity-50"
            >
              {starting ? "جاري البدء..." : "💬 تواصل وابدأ المفاصلة"}
            </button>
          ) : (
            <div className="w-full py-4 bg-slate-800 text-slate-400 font-extrabold rounded-2xl text-sm text-center">
              هذا الإعلان لم يعد متاحاً
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0b1526] rounded-lg px-3 py-2 flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="text-white font-bold">{value}</span>
    </div>
  );
}
