export type ListingCategory = "car" | "property";
export type DealType = "sale" | "rent";
export type ListingStatus = "available" | "reserved" | "sold" | "rented";

export interface Listing {
  id: string;
  seller_phone: string;
  seller_name: string | null;

  category: ListingCategory;
  deal_type: DealType;

  title: string;
  description: string | null;
  price: number;
  location: string | null;

  car_make: string | null;
  car_model: string | null;
  car_year: number | null;
  car_mileage_km: number | null;
  car_condition: string | null;
  car_transmission: string | null;

  property_type: string | null;
  property_rooms: number | null;
  property_bathrooms: number | null;
  property_area_sqm: number | null;
  property_floor: number | null;

  status: ListingStatus;
  created_at: string;
  updated_at: string;

  // ملء اختياري من الاستعلام (join)
  listing_media?: ListingMedia[];
}

export interface ListingMedia {
  id: string;
  listing_id: string;
  media_type: "image" | "video";
  url: string;
  sort_order: number;
  created_at: string;
}

export type OfferBy = "buyer" | "seller";
export type OfferStatus = "pending" | "accepted";

export interface Conversation {
  id: string;
  listing_id: string;
  buyer_phone: string;
  seller_phone: string;
  current_offer_price: number | null;
  current_offer_by: OfferBy | null;
  offer_status: OfferStatus | null;
  created_at: string;
  updated_at: string;

  // ملء اختياري من الاستعلام (join)
  listing?: Listing;
}

export type MessageType = "text" | "offer" | "voice" | "system";

export interface Message {
  id: string;
  conversation_id: string;
  sender_phone: string;
  message_type: MessageType;
  body: string | null;
  offer_price: number | null;
  voice_url: string | null;
  voice_duration_sec: number | null;
  created_at: string;
}
