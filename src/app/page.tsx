"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import ListingCard from "@/components/ListingCard";
import { supabase } from "@/lib/supabase";
import type { Listing, ListingCategory, DealType } from "@/lib/types";

type CategoryFilter = "all" | ListingCategory;
type DealFilter = "all" | DealType;

export default function BrowsePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [dealType, setDealType] = useState<DealFilter>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;

    const fetchListings = async () => {
      setLoading(true);
      let query = supabase
        .from("listings")
        .select("*, listing_media(*)")
        .eq("status", "available")
        .order("created_at", { ascending: false });

      if (category !== "all") query = query.eq("category", category);
      if (dealType !== "all") query = query.eq("deal_type", dealType);

      const { data, error } = await query;
      if (!alive) return;
      if (!error && data) setListings(data as unknown as Listing[]);
      setLoading(false);
    };

    fetchListings();

    const channel = supabase
      .channel("listings-browse-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "listings" }, () => {
        fetchListings();
      })
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [category, dealType]);

  const filtered = listings.filter((l) => {
    if (!search.trim()) return true;
    const haystack = `${l.title} ${l.description ?? ""} ${l.location ?? ""} ${l.car_make ?? ""} ${l.car_model ?? ""}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });

  return (
    <div className="min-h-screen bg-[#0b1220]">
      <Header />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* شريط ترحيبي */}
        <div className="bg-gradient-to-l from-sky-600/20 to-transparent border border-sky-900/50 rounded-2xl p-5">
          <h1 className="text-xl font-extrabold text-white">🛒 سمسار السودان</h1>
          <p className="text-xs text-slate-400 mt-1">
            بيع، شراء، وإيجار السيارات والعقارات — بالمفاصلة المباشرة مع البائع
          </p>
        </div>

        {/* البحث */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔎 دوّر باسم السيارة، الموديل، أو المنطقة..."
          className="w-full bg-[#0f1b30] border border-sky-900/60 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
        />

        {/* فلاتر الفئة */}
        <div className="flex flex-wrap gap-2">
          {([
            ["all", "الكل", "🗂️"],
            ["car", "سيارات", "🚗"],
            ["property", "عقارات", "🏠"],
          ] as [CategoryFilter, string, string][]).map(([id, label, emoji]) => (
            <button
              key={id}
              onClick={() => setCategory(id)}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
                category === id
                  ? "bg-sky-500 text-slate-950 shadow-md"
                  : "bg-[#0f1b30] text-slate-300 border border-sky-900/60 hover:text-white"
              }`}
            >
              <span>{emoji}</span> {label}
            </button>
          ))}

          <span className="w-px bg-sky-900/60 mx-1" />

          {([
            ["all", "بيع وإيجار"],
            ["sale", "بيع فقط"],
            ["rent", "إيجار فقط"],
          ] as [DealFilter, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setDealType(id)}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold transition ${
                dealType === id
                  ? "bg-emerald-500 text-slate-950 shadow-md"
                  : "bg-[#0f1b30] text-slate-300 border border-sky-900/60 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* الشبكة */}
        {loading ? (
          <div className="text-center py-16 text-slate-500 text-sm">جاري التحميل... ⏳</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-[#0f1b30] border border-sky-900/60 rounded-2xl text-slate-400 text-sm">
            لا توجد إعلانات مطابقة حالياً.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
