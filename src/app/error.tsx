"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // نطبع تفاصيل الخطأ الكاملة في الكونسول عشان يسهل تشخيصها
    console.error("[سمسار السودان] خطأ غير متوقع:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#0b1220] flex items-center justify-center p-6" dir="rtl">
      <div className="max-w-md w-full bg-[#0f1b30] border border-red-500/40 rounded-2xl p-6 space-y-4 text-center">
        <div className="text-4xl">⚠️</div>
        <h1 className="text-lg font-extrabold text-white">حدث خطأ غير متوقع</h1>
        <p className="text-xs text-slate-400 leading-relaxed">
          حاول تحديث الصفحة، ولو استمرت المشكلة أرسل نص الخطأ التالي للدعم الفني:
        </p>
        <pre className="text-[10px] text-red-300 bg-[#0b1526] rounded-xl p-3 text-left overflow-x-auto whitespace-pre-wrap break-words" dir="ltr">
          {error?.message || "خطأ غير معروف"}
          {error?.digest ? `\ndigest: ${error.digest}` : ""}
        </pre>
        <button
          onClick={reset}
          className="w-full py-3 bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold rounded-xl text-sm"
        >
          إعادة المحاولة 🔄
        </button>
      </div>
    </div>
  );
}
