export type ListingCategory = "car" | "property";
export type DealType = "sale" | "rent";
export type ListingStatus = "pending" | "available" | "reserved" | "sold" | "rented" | "rejected";

export interface User {
  id: string;
  name: string;
  phone: string;
  role: "admin" | "user";
  verified: boolean;
  createdAt: string;
}

export interface MediaItem {
  id?: string;
  type: "image" | "video";
  url: string;
}

export interface Listing {
  id: string;
  sellerId: string;
  sellerName: string | null;
  sellerVerified: boolean;
  category: ListingCategory;
  dealType: DealType;
  title: string;
  description: string;
  price: number;
  city: string;
  location: string;
  carMake: string | null;
  carModel: string | null;
  carYear: number | null;
  carMileageKm: number | null;
  carCondition: string | null;
  carTransmission: string | null;
  propertyType: string | null;
  propertyRooms: number | null;
  propertyBathrooms: number | null;
  propertyAreaSqm: number | null;
  propertyFloor: number | null;
  status: ListingStatus;
  rejectReason: string | null;
  views: number;
  cover: string | null;
  media: MediaItem[];
  createdAt: string;
  updatedAt: string;
  conversationsCount?: number;
}

export type MessageType = "text" | "offer" | "voice" | "system";

export interface Message {
  id: string;
  type: MessageType;
  body: string;
  offerPrice: number | null;
  voiceUrl: string | null;
  voiceDuration: number | null;
  mine: boolean;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  side: "buyer" | "seller";
  otherName: string;
  listing: { id: string; title: string; price: number; dealType: DealType; status: ListingStatus; cover: string | null };
  offerStatus: "pending" | "accepted" | null;
  lastMessage: { type: MessageType; body: string; offerPrice: number | null; mine: boolean } | null;
  lastMessageAt: string;
  unread: number;
}

export interface ConversationDetail {
  conversation: {
    id: string;
    side: "buyer" | "seller" | "admin";
    otherName: string;
    otherPhone: string | null;
    currentOfferPrice: number | null;
    currentOfferBy: "buyer" | "seller" | null;
    offerStatus: "pending" | "accepted" | null;
  };
  listing: Listing;
  deal: {
    id: string;
    price: number;
    status: "agreed" | "completed";
    createdAt: string;
    commissionAmount?: number | null;
    commissionStatus?: CommissionStatus | null;
  } | null;
  messages: Message[];
  serverTime: string;
}

export interface UnreadItem {
  conversationId: string;
  title: string;
  from: "buyer" | "seller";
  count: number;
  at: string;
}

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  url: string;
  read: boolean;
  at: string;
}

export type CommissionStatus = "due" | "submitted" | "paid" | "waived";

export interface DealRow {
  id: string;
  listingId: string;
  listingTitle: string | null;
  conversationId: string;
  price: number;
  status: "agreed" | "completed" | "cancelled";
  commissionAmount: number | null;
  commissionRule: string | null;
  commissionStatus: CommissionStatus | null;
  commissionRef: string | null;
  commissionNote: string | null;
  commissionPaidAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  closedAt: string | null;
  sellerName?: string;
  sellerPhone?: string;
  buyerName?: string;
  buyerPhone?: string;
}

export interface CommissionRates {
  carSalePct: number;
  propertySalePct: number;
  rentMonths: number;
}
