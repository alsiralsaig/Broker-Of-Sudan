"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import PhoneGate from "@/components/PhoneGate";
import { supabase } from "@/lib/supabase";
import { getSavedName, getSavedPhone } from "@/lib/session";
import type { ListingCategory, DealType } from "@/lib/types";

const MAX_IMAGES = 8;
const MAX_VIDEO_MB = 25;

export default function NewListingPage() {
  const router = useRouter();
  const [sellerPhone, setSellerPhone] = useState<string | null>(null);
  const [sellerName, setSellerName] = useState<string | null>(null);

  const [category, setCategory] = useState<ListingCategory>("car");
  const [dealType, setDealType] = useState<DealType>("sale");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState("");

  // حقول السيارات
  const [carMake, setCarMake] = useState("");
  const [carModel, setCarModel] = useState("");
  const [carYear, setCarYear] = useState("");
  const [carMileage, setCarMileage] = useState("");
  const [carCondition, setCarCondition] = useState("مستعملة");
  const [carTransmission, setCarTransmission] = useState("أوتوماتيك");

  // حقول العقارات
  const [propertyType, setPropertyType] = useState("شقة");
  const [propertyRooms, setPropertyRooms] = useState("");
  const [propertyBathrooms, setPropertyBathrooms] = useState("");
  const [propertyArea, setPropertyArea] = useState("");
  const [propertyFloor, setPropertyFloor] = useState("");

  const [images, setImages] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSellerPhone(getSavedPhone());
    setSellerName(getSavedName());
  }, []);

  if (!sellerPhone) {
    return (
      <div className="min-h-screen bg-[#0b1220]">
        <Header />
        <PhoneGate
          title="سجّل دخولك لنشر إعلان"
          subtitle="أدخل اسمك ورقم هاتفك عشان المشترين يقدروا يتواصلوا معاك"
          onDone={(phone, name) => {
            setSellerPhone(phone);
            setSellerName(name);
          }}
        />
      </div>
    );
  }

  const handleImagesChange = (files: FileList | null) => {
    if (!files) return;
    const list = Array.from(files).slice(0, MAX_IMAGES);
    setImages(list);
  };

  const handleVideoChange = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      setError(`حجم الفيديو أكبر من ${MAX_VIDEO_MB} ميجا — اختر فيديو أقصر`);
      return;
    }
    setVideo(file);
  };

  const uploadFile = async (file: File, folder: string) => {
    const ext = file.name.split(".").pop() || "bin";
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("media").upload(path, file);
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("عنوان الإعلان مطلوب");
      return;
    }
    const priceNum = parseFloat(price);
    if (!price || isNaN(priceNum) || priceNum <= 0) {
      setError("أدخل سعراً صحيحاً أكبر من صفر");
      return;
    }

    setSubmitting(true);
    try {
      const { data: listing, error: insertError } = await supabase
        .from("listings")
        .insert([
          {
            seller_phone: sellerPhone,
            seller_name: sellerName,
            category,
            deal_type: dealType,
            title: title.trim(),
            description: description.trim() || null,
            price: priceNum,
            location: location.trim() || null,
            car_make: category === "car" ? carMake.trim() || null : null,
            car_model: category === "car" ? carModel.trim() || null : null,
            car_year: category === "car" && carYear ? parseInt(carYear, 10) : null,
            car_mileage_km: category === "car" && carMileage ? parseInt(carMileage, 10) : null,
            car_condition: category === "car" ? carCondition : null,
            car_transmission: category === "car" ? carTransmission : null,
            property_type: category === "property" ? propertyType : null,
            property_rooms: category === "property" && propertyRooms ? parseInt(propertyRooms, 10) : null,
            property_bathrooms:
              category === "property" && propertyBathrooms ? parseInt(propertyBathrooms, 10) : null,
            property_area_sqm: category === "property" && propertyArea ? parseFloat(propertyArea) : null,
            property_floor: category === "property" && propertyFloor ? parseInt(propertyFloor, 10) : null,
          },
        ])
        .select()
        .single();

      if (insertError || !listing) {
        throw insertError || new Error("تعذر إنشاء الإعلان");
      }

      // رفع الصور والفيديو (لو موجودين) بعد إنشاء الإعلان
      const mediaRows: { listing_id: string; media_type: "image" | "video"; url: string; sort_order: number }[] = [];

      for (let i = 0; i < images.length; i++) {
        const url = await uploadFile(images[i], `listings/${listing.id}`);
        mediaRows.push({ listing_id: listing.id, media_type: "image", url, sort_order: i });
      }

      if (video) {
        const url = await uploadFile(video, `listings/${listing.id}`);
        mediaRows.push({ listing_id: listing.id, media_type: "video", url, sort_order: 999 });
      }

      if (mediaRows.length > 0) {
        await supabase.from("listing_media").insert(mediaRows);
      }

      router.push(`/listing/${listing.id}`);
    } catch (err: any) {
      setError(err?.message || "حدث خطأ أثناء نشر الإعلان");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b1220]">
      <Header />

      <main className="max-w-2xl mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="text-center space-y-1">
            <h1 className="text-lg font-extrabold text-white">➕ أضف إعلان جديد</h1>
            <p className="text-xs text-slate-400">املأ التفاصيل بدقة عشان يوصلك المشتري المناسب بسرعة</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-bold rounded-xl px-3.5 py-3 text-center">
              ⚠️ {error}
            </div>
          )}

          {/* الفئة ونوع المعاملة */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1.5 block text-right">الفئة:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCategory("car")}
                  className={`py-3 rounded-xl text-xs font-extrabold transition ${
                    category === "car" ? "bg-sky-500 text-slate-950" : "bg-[#0f1b30] text-slate-300 border border-sky-900/60"
                  }`}
                >
                  🚗 سيارة
                </button>
                <button
                  type="button"
                  onClick={() => setCategory("property")}
                  className={`py-3 rounded-xl text-xs font-extrabold transition ${
                    category === "property" ? "bg-sky-500 text-slate-950" : "bg-[#0f1b30] text-slate-300 border border-sky-900/60"
                  }`}
                >
                  🏠 عقار
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1.5 block text-right">نوع المعاملة:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDealType("sale")}
                  className={`py-3 rounded-xl text-xs font-extrabold transition ${
                    dealType === "sale" ? "bg-emerald-500 text-slate-950" : "bg-[#0f1b30] text-slate-300 border border-sky-900/60"
                  }`}
                >
                  بيع
                </button>
                <button
                  type="button"
                  onClick={() => setDealType("rent")}
                  className={`py-3 rounded-xl text-xs font-extrabold transition ${
                    dealType === "rent" ? "bg-emerald-500 text-slate-950" : "bg-[#0f1b30] text-slate-300 border border-sky-900/60"
                  }`}
                >
                  إيجار
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 mb-1.5 block text-right">عنوان الإعلان:</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={category === "car" ? "مثال: تويوتا كورولا 2018 نظيفة جداً" : "مثال: شقة 3 غرف في المنطقة الفلانية"}
              className="w-full bg-[#0f1b30] border border-sky-900/60 rounded-xl px-3.5 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 mb-1.5 block text-right">الوصف:</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="اكتب تفاصيل إضافية تساعد المشتري يقرر بسرعة"
              className="w-full bg-[#0f1b30] border border-sky-900/60 rounded-xl px-3.5 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1.5 block text-right">
                {dealType === "rent" ? "الإيجار الشهري (ج.س):" : "السعر (ج.س):"}
              </label>
              <input
                type="number"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="أدخل المبلغ"
                className="w-full bg-[#0f1b30] border border-sky-900/60 rounded-xl px-3.5 py-3 text-sm text-white placeholder-slate-500 focus:outline-none font-mono text-right focus:border-sky-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1.5 block text-right">المنطقة/المدينة:</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="مثال: الخرطوم، بحري..."
                className="w-full bg-[#0f1b30] border border-sky-900/60 rounded-xl px-3.5 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* حقول السيارات */}
          {category === "car" && (
            <div className="space-y-3 bg-[#0f1b30]/60 border border-sky-900/50 rounded-2xl p-4">
              <h3 className="text-xs font-extrabold text-sky-400">🚗 تفاصيل السيارة</h3>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={carMake}
                  onChange={(e) => setCarMake(e.target.value)}
                  placeholder="الماركة (تويوتا...)"
                  className="w-full bg-[#0b1526] border border-sky-900/60 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
                <input
                  type="text"
                  value={carModel}
                  onChange={(e) => setCarModel(e.target.value)}
                  placeholder="الموديل (كورولا...)"
                  className="w-full bg-[#0b1526] border border-sky-900/60 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
                <input
                  type="number"
                  value={carYear}
                  onChange={(e) => setCarYear(e.target.value)}
                  placeholder="سنة الصنع"
                  className="w-full bg-[#0b1526] border border-sky-900/60 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none font-mono focus:border-sky-500"
                />
                <input
                  type="number"
                  value={carMileage}
                  onChange={(e) => setCarMileage(e.target.value)}
                  placeholder="الممشى (كم)"
                  className="w-full bg-[#0b1526] border border-sky-900/60 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none font-mono focus:border-sky-500"
                />
                <select
                  value={carCondition}
                  onChange={(e) => setCarCondition(e.target.value)}
                  className="w-full bg-[#0b1526] border border-sky-900/60 rounded-xl px-3 py-2.5 text-sm text-sky-400 font-bold focus:outline-none focus:border-sky-500"
                >
                  <option value="جديدة">جديدة</option>
                  <option value="مستعملة">مستعملة</option>
                </select>
                <select
                  value={carTransmission}
                  onChange={(e) => setCarTransmission(e.target.value)}
                  className="w-full bg-[#0b1526] border border-sky-900/60 rounded-xl px-3 py-2.5 text-sm text-sky-400 font-bold focus:outline-none focus:border-sky-500"
                >
                  <option value="أوتوماتيك">أوتوماتيك</option>
                  <option value="عادي">عادي (مانيوال)</option>
                </select>
              </div>
            </div>
          )}

          {/* حقول العقارات */}
          {category === "property" && (
            <div className="space-y-3 bg-[#0f1b30]/60 border border-sky-900/50 rounded-2xl p-4">
              <h3 className="text-xs font-extrabold text-sky-400">🏠 تفاصيل العقار</h3>
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={propertyType}
                  onChange={(e) => setPropertyType(e.target.value)}
                  className="w-full bg-[#0b1526] border border-sky-900/60 rounded-xl px-3 py-2.5 text-sm text-sky-400 font-bold focus:outline-none focus:border-sky-500"
                >
                  <option value="شقة">شقة</option>
                  <option value="منزل">منزل</option>
                  <option value="أرض">أرض</option>
                  <option value="محل تجاري">محل تجاري</option>
                  <option value="مكتب">مكتب</option>
                </select>
                <input
                  type="number"
                  value={propertyArea}
                  onChange={(e) => setPropertyArea(e.target.value)}
                  placeholder="المساحة (م²)"
                  className="w-full bg-[#0b1526] border border-sky-900/60 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none font-mono focus:border-sky-500"
                />
                <input
                  type="number"
                  value={propertyRooms}
                  onChange={(e) => setPropertyRooms(e.target.value)}
                  placeholder="عدد الغرف"
                  className="w-full bg-[#0b1526] border border-sky-900/60 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none font-mono focus:border-sky-500"
                />
                <input
                  type="number"
                  value={propertyBathrooms}
                  onChange={(e) => setPropertyBathrooms(e.target.value)}
                  placeholder="عدد الحمامات"
                  className="w-full bg-[#0b1526] border border-sky-900/60 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none font-mono focus:border-sky-500"
                />
                <input
                  type="number"
                  value={propertyFloor}
                  onChange={(e) => setPropertyFloor(e.target.value)}
                  placeholder="الطابق (لو شقة)"
                  className="w-full bg-[#0b1526] border border-sky-900/60 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none font-mono focus:border-sky-500"
                />
              </div>
            </div>
          )}

          {/* الصور والفيديو */}
          <div className="space-y-3 bg-[#0f1b30]/60 border border-sky-900/50 rounded-2xl p-4">
            <h3 className="text-xs font-extrabold text-sky-400">📸 الصور والفيديو</h3>

            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1.5 block text-right">
                الصور (حتى {MAX_IMAGES} صور):
              </label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => handleImagesChange(e.target.files)}
                className="w-full text-xs text-slate-300 file:ml-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-sky-500 file:text-slate-950 file:font-extrabold file:text-xs"
              />
              {images.length > 0 && (
                <p className="text-[11px] text-emerald-400 mt-1.5">تم اختيار {images.length} صورة ✅</p>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1.5 block text-right">
                فيديو قصير (اختياري، حتى {MAX_VIDEO_MB} ميجا):
              </label>
              <input
                type="file"
                accept="video/*"
                onChange={(e) => handleVideoChange(e.target.files)}
                className="w-full text-xs text-slate-300 file:ml-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-sky-500 file:text-slate-950 file:font-extrabold file:text-xs"
              />
              {video && <p className="text-[11px] text-emerald-400 mt-1.5">تم اختيار الفيديو: {video.name} ✅</p>}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 bg-sky-500 hover:bg-sky-400 active:scale-[0.99] text-slate-950 font-extrabold rounded-2xl text-base shadow-xl transition disabled:opacity-50"
          >
            {submitting ? "جاري النشر..." : "نشر الإعلان 🚀"}
          </button>
        </form>
      </main>
    </div>
  );
}
