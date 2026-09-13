import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#0ea5e9",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "سمسار السودان — بيع وشراء وإيجار",
  description: "منصة بيع وشراء وإيجار السيارات والعقارات في السودان، مع نظام مفاصلة مباشر بين البائع والمشتري",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="bg-[#0b1220] text-slate-100 antialiased">{children}</body>
    </html>
  );
}
