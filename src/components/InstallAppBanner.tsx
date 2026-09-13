"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X, Download, Share } from "lucide-react";

const DISMISS_KEY = "samsar_install_banner_dismissed";

function isIos(): boolean {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

export default function InstallAppBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone()) return; // التطبيق متثبت بالفعل، مفيش داعي للبانر
    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    if (isIos()) {
      setShowIosHint(true);
      setVisible(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-3 left-3 right-3 z-50 max-w-md mx-auto">
      <div className="bg-[#0f1b30] border border-sky-500/50 rounded-2xl p-3.5 shadow-2xl shadow-black/40 flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 border border-sky-900/60 relative">
          <Image src="/icons/icon-96.png" alt="سمسار السودان" fill className="object-cover" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-extrabold text-white">ثبّت تطبيق سمسار السودان</p>
          {showIosHint ? (
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              اضغط زر المشاركة <Share size={12} className="inline -mt-0.5" /> في المتصفح، ثم اختر
              &quot;إضافة إلى الشاشة الرئيسية&quot;.
            </p>
          ) : (
            <p className="text-xs text-slate-400 mt-1">للوصول السريع من شاشة هاتفك مباشرة، بدون فتح المتصفح.</p>
          )}

          {!showIosHint && (
            <button
              onClick={install}
              className="mt-2.5 flex items-center gap-1.5 px-3.5 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold rounded-xl text-xs"
            >
              <Download size={14} /> تثبيت الآن
            </button>
          )}
        </div>

        <button onClick={dismiss} className="shrink-0 text-slate-500 hover:text-white p-1" aria-label="إغلاق">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
