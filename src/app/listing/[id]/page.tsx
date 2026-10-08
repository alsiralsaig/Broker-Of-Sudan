"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { BadgeCheck, Eye, Pencil, Share2, Trash2 } from "lucide-react";
import Header from "@/components/Header";
import AuthGate from "@/components/AuthGate";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatPrice, timeAgo } from "@/lib/format";
import type { Listing } from "@/lib/types";

const dealLabel: Record<string, string> = { sale: "للبيع", rent: "للإيجار" };
const statusBanner: Record<string, string> = {
  pending: "⏳ إعلانك قيد المراجعة — حيظهر للناس بعد موافقة الإدارة",
  rejected: "⚠️ الإدارة رفضت الإعلان — عدّله وحيرجع للمراجعة",
  reserved: "🔒 محجوز — في اتفاق مبدئي مع مشتري",
  sold: "✅ تم البيع",
  rented: "✅ تم التأجير",
};

interface Detail {
  listing: Listing;
  seller: { name: string; verified: boolean; memberSince: string; listingsCount: number; dealsCount: number };
  isOwner: boolean;
  myConversationId: string | null;
}

export default function ListingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMedia, setActiveMedia] = useState(0);
  const [starting, setStarting] = useState(false);
  const [showGate, setShowGate] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    let alive = true;
    api<Detail>(`/listings/${params.id}`)
      .then((r) => alive && setData(r))
      .catch((e) => alive && setError(errMsg(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [params.id, user?.id, authLoading]);

  // بعد تسجيل الدخول من البوابة نبدأ المحادثة طوالي
  useEffect(() => {
    if (showGate && user && data) {
      setShowGate(false);
      startConversation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, showGate, data]);

  const startConversation = async () => {
    if (!data) return;
    if (!user) {
      setShowGate(true);
      return;
    }
    if (data.myConversationId) {
      router.push(`/chat/${data.myConversationId}`);
      return;
    }
    setStarting(true);
    try {
      const r = await api<{ id: string }>("/conversations", { method: "POST", body: { listingId: data.listing.id } });
      router.push(`/chat/${r.id}`);
    } catch (e) {
      alert(errMsg(e));
      setStarting(false);
    }
  };

  const remove = async () => {
    if (!data || !confirm("متأكد عايز تمسح الإعلان ده نهائياً؟")) return;
    try {
      await api(`/listings/${data.listing.id}`, { method: "DELETE" });
      router.push("/my");
    } catch (e) {
      alert(errMsg(e));
    }
  };

  const share = async () => {
    if (!data) return;
    const url = window.location.href;
    const text = `${data.listing.title} — ${formatPrice(data.listing.price)} ج.س`;
    if (navigator.share) {
      navigator.share({ title: data.listing.title, text, url }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`, "_blank");
    }
  };

  if (showGate && !user) {
    return (
      <div className="min-h-screen bg-[#0b1220]">
        <Header />
        <AuthGate title="سجّل دخولك للتواصل مع البائع" subtitle="عشان تقدر تبدأ المفاصلة" />
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

  if (!data) {
    return (
      <div className="min-h-screen bg-[#0b1220]">
        <Header />
        <div className="text-center py-20 text-slate-400 text-sm">{error || "الإعلان غير موجود أو تم حذفه."}</div>
      </div>
    );
  }

  const { listing, seller, isOwner } = data;
  const media = listing.media;
  const isCar = listing.category === "car";
  const current = media[Math.min(activeMedia, media.length - 1)];
  const closed = listing.status === "sold" || listing.status === "rented";

  return (
    <div className="min-h-screen bg-[#0b1220]">
      <Header />

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {listing.status !== "available" && (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold rounded-xl px-3.5 py-3 text-center">
            {statusBanner[listing.status]}
            {listing.status === "rejected" && listing.rejectReason && (
              <span className="block mt-1 text-red-300">السبب: {listing.rejectReason}</span>
            )}
          </div>
        )}

        <div className="space-y-2">
          <div className="w-full aspect-video bg-[#0f1b30] border border-sky-900/60 rounded-2xl overflow-hidden flex items-center justify-center">
            {current ? (
              current.type === "video" ? (
                <video src={current.url} controls playsInline className="w-full h-full object-contain bg-black" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={current.url} alt={listing.title} className="w-full h-full object-contain" />
              )
            ) : (
              <span className="text-6xl text-slate-700">{isCar ? "🚗" : "🏠"}</span>
            )}
          </div>
          {media.length > 1 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {media.map((m, i) => (
                <button
                  key={m.id || m.url}
                  onClick={() => setActiveMedia(i)}
                  className={`shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition ${
                    i === activeMedia ? "border-sky-500" : "border-sky-900/60 opacity-60"
                  }`}
                >
                  {m.type === "video" ? (
                    <div className="w-full h-full bg-black flex items-center justify-center text-lg">🎬</div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#0f1b30] border border-sky-900/60 rounded-2xl p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-lg font-extrabold text-white">{listing.title}</h1>
            <span className="shrink-0 bg-sky-500/10 text-sky-400 border border-sky-500/30 px-2.5 py-1 rounded-lg text-[11px] font-bold">
              {dealLabel[listing.dealType]}
            </span>
          </div>

          <div className="text-2xl font-extrabold text-sky-400 font-mono">
            {formatPrice(listing.price)}{" "}
            <span className="text-xs font-semibold">ج.س{listing.dealType === "rent" ? "/شهرياً" : ""}</span>
          </div>

          {(listing.city || listing.location) && (
            <div className="text-xs text-slate-400">📍 {[listing.city, listing.location].filter(Boolean).join(" — ")}</div>
          )}
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span>{timeAgo(listing.createdAt)}</span>
            <span className="flex items-center gap-1"><Eye size={12} /> {listing.views}</span>
            <button onClick={share} className="mr-auto flex items-center gap-1 text-sky-400 font-bold">
              <Share2 size={13} /> مشاركة
            </button>
          </div>

          {listing.description && (
            <p className="text-sm text-slate-300 leading-relaxed border-t border-sky-900/50 pt-3 whitespace-pre-wrap">
              {listing.description}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 border-t border-sky-900/50 pt-3 text-xs">
            {isCar ? (
              <>
                {listing.carMake && <Detail label="الماركة" value={listing.carMake} />}
                {listing.carModel && <Detail label="الموديل" value={listing.carModel} />}
                {listing.carYear && <Detail label="سنة الصنع" value={String(listing.carYear)} />}
                {listing.carMileageKm !== null && <Detail label="الممشى" value={`${formatPrice(listing.carMileageKm)} كم`} />}
                {listing.carCondition && <Detail label="الحالة" value={listing.carCondition} />}
                {listing.carTransmission && <Detail label="ناقل الحركة" value={listing.carTransmission} />}
              </>
            ) : (
              <>
                {listing.propertyType && <Detail label="نوع العقار" value={listing.propertyType} />}
                {listing.propertyAreaSqm && <Detail label="المساحة" value={`${formatPrice(listing.propertyAreaSqm)} م²`} />}
                {listing.propertyRooms !== null && <Detail label="عدد الغرف" value={String(listing.propertyRooms)} />}
                {listing.propertyBathrooms !== null && <Detail label="عدد الحمامات" value={String(listing.propertyBathrooms)} />}
                {listing.propertyFloor !== null && <Detail label="الطابق" value={String(listing.propertyFloor)} />}
              </>
            )}
          </div>
        </div>

        <div className="bg-[#0f1b30] border border-sky-900/60 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-300">👤 البائع:</span>
            <span className="font-bold text-white flex items-center gap-1">
              {seller.name}
              {seller.verified && <BadgeCheck size={15} className="text-sky-400" />}
            </span>
          </div>
          <div className="flex justify-between text-[11px] text-slate-500">
            <span>عضو {timeAgo(seller.memberSince).replace("منذ", "من")}</span>
            <span>{seller.listingsCount} إعلان · {seller.dealsCount} صفقة تمت</span>
          </div>

          {isOwner ? (
            <div className="space-y-2">
              <div className="w-full py-3 bg-sky-500/10 border border-sky-500/30 text-sky-300 font-bold rounded-xl text-xs text-center">
                📋 ده إعلانك — رسائل المهتمين بتلقاها في «محادثاتي»
              </div>
              {!closed && (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href={`/new?edit=${listing.id}`}
                    className="flex items-center justify-center gap-1.5 py-3 bg-[#0b1526] border border-sky-900/60 rounded-xl text-xs font-extrabold text-sky-300"
                  >
                    <Pencil size={14} /> تعديل
                  </Link>
                  <button
                    onClick={remove}
                    className="flex items-center justify-center gap-1.5 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs font-extrabold text-red-300"
                  >
                    <Trash2 size={14} /> مسح
                  </button>
                </div>
              )}
            </div>
          ) : listing.status === "available" || data.myConversationId ? (
            <button
              onClick={startConversation}
              disabled={starting}
              className="w-full py-4 bg-sky-500 hover:bg-sky-400 active:scale-[0.99] text-slate-950 font-extrabold rounded-2xl text-sm shadow-xl transition disabled:opacity-50"
            >
              {starting ? "جاري البدء..." : data.myConversationId ? "💬 افتح المحادثة" : "💬 تواصل وابدأ المفاصلة"}
            </button>
          ) : (
            <div className="w-full py-4 bg-slate-800 text-slate-400 font-extrabold rounded-2xl text-sm text-center">
              هذا الإعلان لم يعد متاحاً
            </div>
          )}
          {!isOwner && (
            <p className="text-[10px] text-slate-500 text-center leading-relaxed">
              🔒 للحماية: التواصل بيكون عبر المحادثة، وأرقام التلفون بتظهر للطرفين بعد الاتفاق على السعر.
            </p>
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
