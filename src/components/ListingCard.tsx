"use client";

import Link from "next/link";
import { formatPrice, timeAgo } from "@/lib/format";
import type { Listing } from "@/lib/types";

const dealLabel: Record<string, string> = {
  sale: "للبيع",
  rent: "للإيجار",
};

const statusLabel: Record<string, string> = {
  available: "",
  reserved: "🔒 محجوز",
  sold: "✅ تم البيع",
  rented: "✅ تم التأجير",
};

export default function ListingCard({ listing }: { listing: Listing }) {
  const cover = listing.listing_media?.find((m) => m.media_type === "image")?.url;
  const isCar = listing.category === "car";

  const subtitle = isCar
    ? [listing.car_make, listing.car_model, listing.car_year].filter(Boolean).join(" · ")
    : [listing.property_type, listing.location].filter(Boolean).join(" · ");

  const unavailable = listing.status !== "available";

  return (
    <Link
      href={`/listing/${listing.id}`}
      className="block bg-[#0f1b30] border border-sky-900/60 rounded-2xl overflow-hidden shadow-lg hover:border-sky-600/60 transition group"
    >
      <div className="relative w-full aspect-[4/3] bg-[#0b1526]">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={listing.title}
            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl text-slate-700">
            {isCar ? "🚗" : "🏠"}
          </div>
        )}

        <span className="absolute top-2 right-2 bg-sky-500/90 text-slate-950 text-[10px] font-extrabold px-2.5 py-1 rounded-lg shadow">
          {dealLabel[listing.deal_type]}
        </span>

        {unavailable && (
          <span className="absolute top-2 left-2 bg-slate-950/80 text-slate-200 text-[10px] font-extrabold px-2.5 py-1 rounded-lg">
            {statusLabel[listing.status]}
          </span>
        )}
      </div>

      <div className="p-3 space-y-1.5">
        <h3 className="text-sm font-bold text-white truncate">{listing.title}</h3>
        {subtitle && <p className="text-[11px] text-slate-400 truncate">{subtitle}</p>}
        <div className="flex items-center justify-between pt-1">
          <span className="text-sky-400 font-extrabold font-mono text-sm">
            {formatPrice(listing.price)} <span className="text-[10px] font-semibold">ج.س{listing.deal_type === "rent" ? "/شهرياً" : ""}</span>
          </span>
          <span className="text-[10px] text-slate-500">{timeAgo(listing.created_at)}</span>
        </div>
      </div>
    </Link>
  );
}
