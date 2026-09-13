"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import PhoneGate from "@/components/PhoneGate";
import ListingCard from "@/components/ListingCard";
import { supabase } from "@/lib/supabase";
import { getSavedPhone } from "@/lib/session";
import type { Listing } from "@/lib/types";

export default function MyListingsPage() {
  const [phone, setPhone] = useState<string | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPhone(getSavedPhone());
  }, []);

  useEffect(() => {
    if (!phone) return;
    const fetchMine = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("listings")
        .select("*, listing_media(*)")
        .eq("seller_phone", phone)
        .order("created_at", { ascending: false });
      setListings((data as unknown as Listing[]) || []);
      setLoading(false);
    };
    fetchMine();
  }, [phone]);

  if (!phone) {
    return (
      <div className="min-h-screen bg-[#0b1220]">
        <Header />
        <PhoneGate title="سجّل دخولك لعرض إعلاناتك" onDone={(p) => setPhone(p)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b1220]">
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <h1 className="text-lg font-extrabold text-white">📋 إعلاناتي</h1>

        {loading ? (
          <div className="text-center py-16 text-slate-500 text-sm">جاري التحميل... ⏳</div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16 bg-[#0f1b30] border border-sky-900/60 rounded-2xl text-slate-400 text-sm">
            لم تنشر أي إعلانات بعد.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
