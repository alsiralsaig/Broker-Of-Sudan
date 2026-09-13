"use client";

import { useEffect } from "react";

/**
 * يسجّل الـ Service Worker عشان تفعيل خاصية تثبيت التطبيق
 * على الشاشة الرئيسية للتلفون (Android / iOS / Desktop).
 */
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // فشل التسجيل مش خطر — التطبيق هيشتغل عادي بدون PWA
    });
  }, []);

  return null;
}
