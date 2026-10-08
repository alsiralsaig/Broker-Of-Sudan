"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import Header from "@/components/Header";
import ListingCard from "@/components/ListingCard";
import { api, errMsg } from "@/lib/api";
import type { Listing, ListingCategory, DealType } from "@/lib/types";

type CategoryFilter = "all" | ListingCategory;
type DealFilter = "all" | DealType;
type Sort = "new" | "price_asc" | "price_desc";

const chip = (active: boolean, color = "sky") =>
  `px-4 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
    active
      ? `${color === "sky" ? "bg-sky-500" : "bg-emerald-500"} text-slate-950 shadow-md`
      : "bg-[#0f1b30] text-slate-300 border border-sky-900/60 hover:text-white"
  }`;

const inputCls =
  "w-full bg-[#0f1b30] border border-sky-900/60 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500";

export default function BrowsePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<CategoryFilter>("all");
  const [dealType, setDealType] = useState<DealFilter>("all");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [city, setCity] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [cities, setCities] = useState<string[]>([]);
  const reqId = useRef(0);

  // البحث بعد ما المستخدم يوقف كتابة (يوفّر الباقة)
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 450);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    api<{ cities: string[] }>("/listings/cities").then((r) => setCities(r.cities)).catch(() => {});
  }, []);

  const query = useCallback(
    (offset: number) =>
      api<{ listings: Listing[]; nextOffset: number | null }>("/listings", {
        query: {
          category: category === "all" ? undefined : category,
          deal: dealType === "all" ? undefined : dealType,
          q,
          city,
          minPrice: minPrice.replace(/,/g, ""),
          maxPrice: maxPrice.replace(/,/g, ""),
          sort: sort === "new" ? undefined : sort,
          offset: offset || undefined,
        },
      }),
    [category, dealType, q, city, minPrice, maxPrice, sort]
  );

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    const t = setTimeout(() => {
      query(0)
        .then((r) => {
          if (id !== reqId.current) return;
          setListings(r.listings);
          setNextOffset(r.nextOffset);
        })
        .catch((e) => id === reqId.current && setError(errMsg(e)))
        .finally(() => id === reqId.current && setLoading(false));
    }, 150);
    return () => clearTimeout(t);
  }, [query]);

  const loadMore = async () => {
    if (nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await query(nextOffset);
      setListings((prev) => [...prev, ...r.listings.filter((l) => !prev.some((p) => p.id === l.id))]);
      setNextOffset(r.nextOffset);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoadingMore(false);
    }
  };

  const activeExtra = [city, minPrice, maxPrice].filter(Boolean).length + (sort !== "new" ? 1 : 0);

  return (
    <div className="min-h-screen bg-[#0b1220]">
      <Header />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="bg-gradient-to-l from-sky-600/20 to-transparent border border-sky-900/50 rounded-2xl p-5">
          <h1 className="text-xl font-extrabold text-white">🛒 سمسار السودان</h1>
          <p className="text-xs text-slate-400 mt-1">
            بيع، شراء، وإيجار السيارات والعقارات — بالمفاصلة المباشرة مع البائع
          </p>
        </div>

        <div className="flex gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔎 دوّر باسم السيارة، الموديل، أو المنطقة..."
            className="flex-1 bg-[#0f1b30] border border-sky-900/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
          <button
            onClick={() => setShowMore((v) => !v)}
            className={`relative shrink-0 w-12 rounded-xl border flex items-center justify-center ${
              showMore ? "bg-sky-500 text-slate-950 border-sky-500" : "bg-[#0f1b30] text-slate-300 border-sky-900/60"
            }`}
            aria-label="فلاتر إضافية"
          >
            <SlidersHorizontal size={18} />
            {activeExtra > 0 && (
              <span className="absolute -top-1.5 -left-1.5 bg-emerald-500 text-slate-950 text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center">
                {activeExtra}
              </span>
            )}
          </button>
        </div>

        {showMore && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#0f1b30]/50 border border-sky-900/50 rounded-2xl p-3">
            <select value={city} onChange={(e) => setCity(e.target.value)} className={inputCls}>
              <option value="">كل المدن</option>
              {cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={inputCls}>
              <option value="new">الأحدث أولاً</option>
              <option value="price_asc">الأرخص أولاً</option>
              <option value="price_desc">الأغلى أولاً</option>
            </select>
            <input inputMode="numeric" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="أقل سعر" className={`${inputCls} font-mono`} />
            <input inputMode="numeric" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="أعلى سعر" className={`${inputCls} font-mono`} />
            {activeExtra > 0 && (
              <button
                onClick={() => { setCity(""); setMinPrice(""); setMaxPrice(""); setSort("new"); }}
                className="col-span-2 sm:col-span-4 text-[11px] font-bold text-red-300 py-1"
              >
                مسح الفلاتر
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {([
            ["all", "الكل", "🗂️"],
            ["car", "سيارات", "🚗"],
            ["property", "عقارات", "🏠"],
          ] as [CategoryFilter, string, string][]).map(([id, label, emoji]) => (
            <button key={id} onClick={() => setCategory(id)} className={chip(category === id)}>
              <span>{emoji}</span> {label}
            </button>
          ))}
          <span className="w-px bg-sky-900/60 mx-1" />
          {([
            ["all", "بيع وإيجار"],
            ["sale", "بيع فقط"],
            ["rent", "إيجار فقط"],
          ] as [DealFilter, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setDealType(id)} className={chip(dealType === id, "emerald")}>
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-bold rounded-xl px-3.5 py-3 text-center">
            ⚠️ {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-slate-500 text-sm">جاري التحميل... ⏳</div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16 bg-[#0f1b30] border border-sky-900/60 rounded-2xl text-slate-400 text-sm">
            لا توجد إعلانات مطابقة حالياً.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
            {nextOffset !== null && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-3 bg-[#0f1b30] border border-sky-900/60 rounded-xl text-xs font-extrabold text-sky-400 disabled:opacity-50"
              >
                {loadingMore ? "جاري التحميل..." : "عرض المزيد"}
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}
