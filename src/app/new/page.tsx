"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X, Loader2 } from "lucide-react";
import Header from "@/components/Header";
import AuthGate from "@/components/AuthGate";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { uploadImage, uploadVideo } from "@/lib/upload";
import type { Listing, ListingCategory, DealType, MediaItem } from "@/lib/types";

const MAX_IMAGES = 10;
const MAX_VIDEO_MB = 50;
const CITIES = [
  "الخرطوم", "أم درمان", "بحري", "بورتسودان", "ود مدني", "كسلا", "القضارف", "عطبرة", "شندي",
  "دنقلا", "الأبيض", "كوستي", "سنار", "الدمازين", "نيالا", "الفاشر", "الجنينة", "حلفا الجديدة",
];

const field =
  "w-full bg-[#0f1b30] border border-sky-900/60 rounded-xl px-3.5 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500";
const sub =
  "w-full bg-[#0b1526] border border-sky-900/60 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500";
const label = "text-xs font-semibold text-slate-300 mb-1.5 block text-right";

export default function NewListingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0b1220]" />}>
      <ListingForm />
    </Suspense>
  );
}

function ListingForm() {
  const router = useRouter();
  const editId = useSearchParams().get("edit");
  const { user, loading: authLoading } = useAuth();

  const [category, setCategory] = useState<ListingCategory>("car");
  const [dealType, setDealType] = useState<DealType>("sale");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [city, setCity] = useState("");
  const [location, setLocation] = useState("");

  const [carMake, setCarMake] = useState("");
  const [carModel, setCarModel] = useState("");
  const [carYear, setCarYear] = useState("");
  const [carMileage, setCarMileage] = useState("");
  const [carCondition, setCarCondition] = useState("مستعملة");
  const [carTransmission, setCarTransmission] = useState("أوتوماتيك");

  const [propertyType, setPropertyType] = useState("شقة");
  const [propertyRooms, setPropertyRooms] = useState("");
  const [propertyBathrooms, setPropertyBathrooms] = useState("");
  const [propertyArea, setPropertyArea] = useState("");
  const [propertyFloor, setPropertyFloor] = useState("");

  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(0);
  const [videoPct, setVideoPct] = useState<number | null>(null);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(!!editId);

  useEffect(() => {
    api<{ videoUpload: boolean }>("/config").then((r) => setVideoEnabled(r.videoUpload)).catch(() => {});
  }, []);

  // تعبئة النموذج في وضع التعديل
  useEffect(() => {
    if (!editId || !user) return;
    api<{ listing: Listing; isOwner: boolean }>(`/listings/${editId}`)
      .then(({ listing: l, isOwner }) => {
        if (!isOwner && user.role !== "admin") throw new Error("ده ما إعلانك");
        setCategory(l.category);
        setDealType(l.dealType);
        setTitle(l.title);
        setDescription(l.description);
        setPrice(String(l.price));
        setCity(l.city);
        setLocation(l.location);
        setCarMake(l.carMake || "");
        setCarModel(l.carModel || "");
        setCarYear(l.carYear ? String(l.carYear) : "");
        setCarMileage(l.carMileageKm !== null ? String(l.carMileageKm) : "");
        setCarCondition(l.carCondition || "مستعملة");
        setCarTransmission(l.carTransmission || "أوتوماتيك");
        setPropertyType(l.propertyType || "شقة");
        setPropertyRooms(l.propertyRooms !== null ? String(l.propertyRooms) : "");
        setPropertyBathrooms(l.propertyBathrooms !== null ? String(l.propertyBathrooms) : "");
        setPropertyArea(l.propertyAreaSqm ? String(l.propertyAreaSqm) : "");
        setPropertyFloor(l.propertyFloor !== null ? String(l.propertyFloor) : "");
        setMedia(l.media.map((m) => ({ type: m.type, url: m.url })));
      })
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoadingEdit(false));
  }, [editId, user]);

  if (authLoading) return <div className="min-h-screen bg-[#0b1220]"><Header /></div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0b1220]">
        <Header />
        <AuthGate title="سجّل دخولك لنشر إعلان" subtitle="الحساب بيحمي إعلاناتك — إنت بس البتقدر تعدّلها" />
      </div>
    );
  }

  const images = media.filter((m) => m.type === "image");
  const video = media.find((m) => m.type === "video");

  // الصور بترفع فوراً واحدة واحدة (لو الشبكة قطعت، الرفعات الناجحة بتفضل)
  const handleImagesChange = async (files: FileList | null) => {
    if (!files) return;
    const room = MAX_IMAGES - images.length;
    const list = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > room) setError(`الحد الأقصى ${MAX_IMAGES} صور`);
    for (const f of list) {
      setUploading((n) => n + 1);
      try {
        const url = await uploadImage(f);
        setMedia((m) => [...m, { type: "image", url }]);
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const handleVideoChange = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      setError(`حجم الفيديو أكبر من ${MAX_VIDEO_MB} ميجا — اختر فيديو أقصر`);
      return;
    }
    setVideoPct(0);
    try {
      const url = await uploadVideo(file, setVideoPct);
      setMedia((m) => [...m.filter((x) => x.type !== "video"), { type: "video", url }]);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setVideoPct(null);
    }
  };

  const removeMedia = (url: string) => setMedia((m) => m.filter((x) => x.url !== url));
  const moveFirst = (url: string) =>
    setMedia((m) => [...m.filter((x) => x.url === url), ...m.filter((x) => x.url !== url)]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (uploading || videoPct !== null) {
      setError("انتظر لحدي ما الرفع يكتمل");
      return;
    }
    if (!title.trim()) return setError("عنوان الإعلان مطلوب");
    const priceNum = parseFloat(price.replace(/,/g, ""));
    if (!priceNum || priceNum <= 0) return setError("أدخل سعراً صحيحاً أكبر من صفر");

    setSubmitting(true);
    const body = {
      category, dealType, title, description, price: priceNum, city, location,
      carMake, carModel, carYear, carMileageKm: carMileage, carCondition, carTransmission,
      propertyType, propertyRooms, propertyBathrooms, propertyAreaSqm: propertyArea, propertyFloor,
      media,
    };
    try {
      const r = editId
        ? await api<{ listing: Listing }>(`/listings/${editId}`, { method: "PATCH", body })
        : await api<{ listing: Listing }>("/listings", { method: "POST", body });
      router.push(`/listing/${r.listing.id}`);
    } catch (err) {
      setError(errMsg(err));
      setSubmitting(false);
    }
  };

  const toggle = (active: boolean) =>
    `py-3 rounded-xl text-xs font-extrabold transition ${
      active ? "bg-sky-500 text-slate-950" : "bg-[#0f1b30] text-slate-300 border border-sky-900/60"
    }`;

  if (loadingEdit) {
    return (
      <div className="min-h-screen bg-[#0b1220]">
        <Header />
        <div className="text-center py-20 text-slate-500 text-sm">جاري التحميل... ⏳</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b1220]">
      <Header />

      <main className="max-w-2xl mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="text-center space-y-1">
            <h1 className="text-lg font-extrabold text-white">{editId ? "✏️ تعديل الإعلان" : "➕ أضف إعلان جديد"}</h1>
            <p className="text-xs text-slate-400">املأ التفاصيل بدقة عشان يوصلك المشتري المناسب بسرعة</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-bold rounded-xl px-3.5 py-3 text-center">
              ⚠️ {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>الفئة:</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setCategory("car")} className={toggle(category === "car")}>🚗 سيارة</button>
                <button type="button" onClick={() => setCategory("property")} className={toggle(category === "property")}>🏠 عقار</button>
              </div>
            </div>
            <div>
              <label className={label}>نوع المعاملة:</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setDealType("sale")} className={toggle(dealType === "sale")}>بيع</button>
                <button type="button" onClick={() => setDealType("rent")} className={toggle(dealType === "rent")}>إيجار</button>
              </div>
            </div>
          </div>

          <div>
            <label className={label}>عنوان الإعلان:</label>
            <input
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={category === "car" ? "مثال: تويوتا كورولا 2018 نظيفة جداً" : "مثال: شقة 3 غرف في الرياض"}
              className={field}
            />
          </div>

          <div>
            <label className={label}>الوصف:</label>
            <textarea
              value={description}
              maxLength={3000}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="اكتب تفاصيل إضافية تساعد المشتري يقرر بسرعة"
              className={`${field} resize-none`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>السعر (ج.س){dealType === "rent" ? " شهرياً" : ""}:</label>
              <input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="أدخل المبلغ" className={`${field} font-mono`} />
            </div>
            <div>
              <label className={label}>المدينة:</label>
              <input list="cities" value={city} onChange={(e) => setCity(e.target.value)} placeholder="اختار أو اكتب" className={field} />
              <datalist id="cities">
                {CITIES.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>
          <div>
            <label className={label}>الحي / المنطقة:</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="مثال: الرياض، كافوري..." className={field} />
          </div>

          {category === "car" ? (
            <div className="bg-[#0f1b30]/50 border border-sky-900/50 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-bold text-sky-300">🚗 تفاصيل السيارة</p>
              <div className="grid grid-cols-2 gap-2">
                <input value={carMake} onChange={(e) => setCarMake(e.target.value)} placeholder="الماركة (تويوتا...)" className={sub} />
                <input value={carModel} onChange={(e) => setCarModel(e.target.value)} placeholder="الموديل (كورولا...)" className={sub} />
                <input inputMode="numeric" value={carYear} onChange={(e) => setCarYear(e.target.value)} placeholder="سنة الصنع" className={`${sub} font-mono`} />
                <input inputMode="numeric" value={carMileage} onChange={(e) => setCarMileage(e.target.value)} placeholder="الممشى (كم)" className={`${sub} font-mono`} />
                <select value={carCondition} onChange={(e) => setCarCondition(e.target.value)} className={sub}>
                  <option value="جديدة">جديدة</option>
                  <option value="مستعملة">مستعملة</option>
                </select>
                <select value={carTransmission} onChange={(e) => setCarTransmission(e.target.value)} className={sub}>
                  <option value="أوتوماتيك">أوتوماتيك</option>
                  <option value="عادي">عادي (مانيوال)</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="bg-[#0f1b30]/50 border border-sky-900/50 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-bold text-sky-300">🏠 تفاصيل العقار</p>
              <div className="grid grid-cols-2 gap-2">
                <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)} className={sub}>
                  {["شقة", "منزل", "أرض", "محل تجاري", "مكتب", "مزرعة", "أخرى"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <input inputMode="decimal" value={propertyArea} onChange={(e) => setPropertyArea(e.target.value)} placeholder="المساحة (م²)" className={`${sub} font-mono`} />
                <input inputMode="numeric" value={propertyRooms} onChange={(e) => setPropertyRooms(e.target.value)} placeholder="عدد الغرف" className={`${sub} font-mono`} />
                <input inputMode="numeric" value={propertyBathrooms} onChange={(e) => setPropertyBathrooms(e.target.value)} placeholder="عدد الحمامات" className={`${sub} font-mono`} />
                <input inputMode="numeric" value={propertyFloor} onChange={(e) => setPropertyFloor(e.target.value)} placeholder="الطابق (لو شقة)" className={`${sub} font-mono`} />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className={label}>📷 الصور ({images.length}/{MAX_IMAGES}) — الأولى بتكون الغلاف:</label>
            <div className="grid grid-cols-4 gap-2">
              {images.map((m, i) => (
                <div key={m.url} className={`relative aspect-square rounded-xl overflow-hidden border-2 ${i === 0 ? "border-sky-500" : "border-sky-900/60"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt="" className="w-full h-full object-cover" onClick={() => moveFirst(m.url)} />
                  <button type="button" onClick={() => removeMedia(m.url)} className="absolute top-1 left-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center">
                    <X size={13} />
                  </button>
                  {i === 0 && <span className="absolute bottom-0 inset-x-0 bg-sky-500 text-slate-950 text-[9px] font-extrabold text-center">الغلاف</span>}
                </div>
              ))}
              {Array.from({ length: uploading }).map((_, i) => (
                <div key={`up${i}`} className="aspect-square rounded-xl border-2 border-dashed border-sky-900/60 flex items-center justify-center text-sky-400">
                  <Loader2 size={18} className="animate-spin" />
                </div>
              ))}
              {images.length + uploading < MAX_IMAGES && (
                <label className="aspect-square rounded-xl border-2 border-dashed border-sky-700/60 flex flex-col items-center justify-center text-sky-400 text-[10px] font-bold cursor-pointer">
                  <span className="text-xl">＋</span> إضافة
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { handleImagesChange(e.target.files); e.target.value = ""; }} />
                </label>
              )}
            </div>
            {images.length > 1 && <p className="text-[10px] text-slate-500">اضغط على أي صورة عشان تخليها الغلاف.</p>}
          </div>

          <div className="space-y-2">
            <label className={label}>🎬 فيديو (اختياري، حتى {MAX_VIDEO_MB} ميجا):</label>
            {!videoEnabled ? (
              <p className="text-[11px] text-slate-500 bg-[#0f1b30] border border-sky-900/60 rounded-xl px-3 py-2.5">
                رفع الفيديو بيتفعّل بعد ربط التخزين (Vercel Blob).
              </p>
            ) : video ? (
              <div className="relative rounded-xl overflow-hidden border border-sky-900/60">
                <video src={video.url} controls playsInline className="w-full max-h-56 bg-black" />
                <button type="button" onClick={() => removeMedia(video.url)} className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center">
                  <X size={14} />
                </button>
              </div>
            ) : videoPct !== null ? (
              <div className="bg-[#0f1b30] border border-sky-900/60 rounded-xl p-3 text-xs text-sky-300">
                جاري رفع الفيديو... {videoPct}%
                <div className="h-1.5 bg-sky-900/50 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-sky-500" style={{ width: `${videoPct}%` }} />
                </div>
              </div>
            ) : (
              <input type="file" accept="video/*" onChange={(e) => handleVideoChange(e.target.files)} className="w-full text-xs text-slate-400 file:ml-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-sky-500 file:text-slate-950 file:font-bold" />
            )}
          </div>

          <button
            type="submit"
            disabled={submitting || uploading > 0 || videoPct !== null}
            className="w-full py-4 bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold rounded-2xl text-sm shadow-xl disabled:opacity-50"
          >
            {submitting ? "جاري الحفظ..." : uploading ? "انتظر رفع الصور..." : editId ? "💾 حفظ التعديلات" : "🚀 انشر الإعلان"}
          </button>
        </form>
      </main>
    </div>
  );
}
