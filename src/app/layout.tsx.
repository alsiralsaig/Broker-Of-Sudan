import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "@/components/PwaRegister";
import InstallAppBanner from "@/components/InstallAppBanner";

// أيقونات التطبيق مستضافة على Supabase Storage (bucket: media)
// بدل الملفات المحلية في public/ — لتفادي مشاكل رفع الملفات الثنائية على GitHub
const ICONS_BASE = "https://gfqrutdwvtqxtfgndyhd.supabase.co/storage/v1/object/public/media/public";

export const viewport: Viewport = {
  themeColor: "#071043",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "سمسار السودان — بيع وشراء وإيجار",
  description:
    "منصة بيع وشراء وإيجار السيارات والعقارات في السودان، مع نظام مفاصلة مباشر بين البائع والمشتري",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: `${ICONS_BASE}/favicon-32.png`, sizes: "32x32", type: "image/png" },
      { url: `${ICONS_BASE}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
      { url: `${ICONS_BASE}/icons/icon-512.png`, sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: `${ICONS_BASE}/apple-touch-icon.png`, sizes: "180x180", type: "image/png" },
      { url: `${ICONS_BASE}/apple-touch-icon-152.png`, sizes: "152x152", type: "image/png" },
      { url: `${ICONS_BASE}/apple-touch-icon-167.png`, sizes: "167x167", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "سمسار السودان",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="bg-[#0b1220] text-slate-100 antialiased">
        <PwaRegister />
        {children}
        <InstallAppBanner />
      </body>
    </html>
  );
}
