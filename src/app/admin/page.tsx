"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import AuthGate from "@/components/AuthGate";
import PushToggle from "@/components/PushToggle";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { displayPhone, formatPrice, timeAgo } from "@/lib/format";
import type { DealRow, Listing, User } from "@/lib/types";

type Tab = "stats" | "deals" | "listings" | "users" | "settings";
const TABS: [Tab, string][] = [
  ["stats", "📊 الملخص"],
  ["deals", "🧾 العمولات"],
  ["listings", "📝 الإعلانات"],
  ["users", "👥 المستخدمين"],
  ["settings", "⚙️ الإعدادات"],
];

const card = "bg-[#0f1b30] border border-sky-900/60 rounded-2xl p-4";
const input =
  "w-full bg-[#0b1526] border border-sky-900/60 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500";
const btn = "px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40";

export default function AdminPage() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("stats");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t && TABS.some(([k]) => k === t)) setTab(t);
  }, []);

  const go = (t: Tab) => {
    setTab(t);
    window.history.replaceState(null, "", `/admin?tab=${t}`);
  };

  if (loading) return <div className="min-h-screen bg-[#0b1220]"><Header /></div>;
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0b1220]">
        <Header />
        <AuthGate title="دخول الإدارة" />
      </div>
    );
  }
  if (user.role !== "admin") {
    return (
      <div className="min-h-screen bg-[#0b1220]">
        <Header />
        <p className="text-center text-slate-400 py-20 text-sm">الصفحة دي للإدارة بس.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b1220] pb-16">
      <Header />
      <div className="max-w-3xl mx-auto px-4 pt-4 space-y-4">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4">
          {TABS.map(([k, label]) => (
            <button
              key={k}
              onClick={() => go(k)}
              className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold border ${
                tab === k ? "bg-amber-400 text-slate-950 border-amber-400" : "bg-[#0f1b30] text-slate-300 border-sky-900/60"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "stats" && <Stats go={go} />}
        {tab === "deals" && <Deals />}
        {tab === "listings" && <Listings />}
        {tab === "users" && <Users meId={user.id} />}
        {tab === "settings" && <Settings />}
      </div>
    </div>
  );
}

// ───────────── الملخص ─────────────
interface StatsData {
  users: { total: number; week: number };
  listings: Record<string, number>;
  deals: Record<string, number>;
  commission: { due: number; dueCount: number; submittedCount: number; paid: number; paidMonth: number; volume: number };
}

function Stats({ go }: { go: (t: Tab) => void }) {
  const [s, setS] = useState<StatsData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<StatsData>("/admin/stats").then(setS).catch((e) => setErr(errMsg(e)));
  }, []);
  if (err) return <p className="text-red-300 text-xs text-center">{err}</p>;
  if (!s) return <p className="text-slate-500 text-xs text-center py-10">جاري التحميل…</p>;
  const L = s.listings;
  const box = (label: string, value: string, sub?: string, onClick?: () => void, hl?: boolean) => (
    <button onClick={onClick} className={`${card} text-right ${hl ? "border-amber-500/50" : ""} ${onClick ? "" : "cursor-default"}`}>
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={`text-lg font-extrabold font-mono ${hl ? "text-amber-300" : "text-white"}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </button>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {box("عمولات مستحقة", `${formatPrice(s.commission.due)}`, `${s.commission.dueCount} صفقة · ${s.commission.submittedCount} منتظرة تأكيد`, () => go("deals"), true)}
        {box("محصّل الشهر ده", formatPrice(s.commission.paidMonth), `الإجمالي ${formatPrice(s.commission.paid)}`)}
        {box("إعلانات منتظرة المراجعة", String(L.pending || 0), undefined, () => go("listings"), (L.pending || 0) > 0)}
        {box("إعلانات متاحة", String(L.available || 0), `محجوز ${L.reserved || 0} · اتباع ${L.sold || 0} · اتأجّر ${L.rented || 0}`)}
        {box("المستخدمين", String(s.users.total), `${s.users.week} جديد الأسبوع ده`, () => go("users"))}
        {box("الصفقات", String(s.deals.completed || 0), `جارية ${s.deals.agreed || 0} · ملغية ${s.deals.cancelled || 0}`, () => go("deals"))}
      </div>
      <div className={card}>
        <p className="text-[11px] text-slate-400">حجم الصفقات المكتملة</p>
        <p className="text-white font-extrabold font-mono">{formatPrice(s.commission.volume)} ج.س</p>
      </div>
      <div className={`${card} space-y-2`}>
        <p className="text-sm font-bold text-white">🔔 إشعارات الإدارة على الجهاز ده</p>
        <PushToggle />
      </div>
    </div>
  );
}

// ───────────── الصفقات والعمولات ─────────────
const FILTERS: [string, string][] = [
  ["unpaid", "غير مسددة"],
  ["submitted", "منتظرة تأكيد"],
  ["agreed", "جارية"],
  ["paid", "مدفوعة"],
  ["cancelled", "ملغية"],
  ["all", "الكل"],
];
const comLabel: Record<string, [string, string]> = {
  due: ["مستحقة", "text-amber-300"],
  submitted: ["منتظرة تأكيد", "text-sky-300"],
  paid: ["✅ مدفوعة", "text-emerald-300"],
  waived: ["معفية", "text-slate-400"],
};
const dealLabel: Record<string, string> = { agreed: "🤝 جارية", completed: "✅ مكتملة", cancelled: "✖ ملغية" };

function Deals() {
  const [filter, setFilter] = useState("unpaid");
  const [rows, setRows] = useState<DealRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setErr(null);
    api<{ deals: DealRow[] }>(`/admin/deals?filter=${filter}`).then((r) => setRows(r.deals)).catch((e) => setErr(errMsg(e)));
  }, [filter]);
  useEffect(() => { setRows(null); load(); }, [load]);

  const patch = async (d: DealRow, body: Record<string, unknown>) => {
    setBusy(d.id);
    try {
      await api(`/admin/deals/${d.id}`, { method: "PATCH", body });
      load();
    } catch (e) {
      alert(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const editAmount = (d: DealRow) => {
    const v = prompt("المبلغ الجديد للعمولة (ج.س):", String(d.commissionAmount ?? 0));
    if (v === null) return;
    const amount = Number(v.replace(/[,\s]/g, ""));
    if (!Number.isFinite(amount) || amount < 0) return alert("رقم غير صحيح");
    const note = prompt("ملاحظة (اختياري):", d.commissionNote || "") ?? d.commissionNote ?? "";
    patch(d, { commissionAmount: amount, note });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`${btn} border ${filter === k ? "bg-sky-500 text-white border-sky-500" : "text-slate-300 border-sky-900/60"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {err && <p className="text-red-300 text-xs text-center">{err}</p>}
      {!rows ? (
        <p className="text-slate-500 text-xs text-center py-10">جاري التحميل…</p>
      ) : rows.length === 0 ? (
        <p className="text-slate-500 text-xs text-center py-10">ما في صفقات هنا.</p>
      ) : (
        rows.map((d) => (
          <div key={d.id} className={`${card} space-y-2`}>
            <div className="flex justify-between gap-2">
              <Link href={`/listing/${d.listingId}`} className="text-sm font-bold text-white truncate">{d.listingTitle}</Link>
              <span className="text-[11px] text-slate-400 shrink-0">{dealLabel[d.status]} · {timeAgo(d.closedAt || d.createdAt)}</span>
            </div>
            <div className="text-[11px] text-slate-400 grid grid-cols-2 gap-1">
              <span>البائع: <span className="text-slate-200">{d.sellerName}</span> <a href={`tel:${d.sellerPhone}`} className="font-mono text-sky-400" dir="ltr">{displayPhone(d.sellerPhone)}</a></span>
              <span>المشتري: <span className="text-slate-200">{d.buyerName}</span> <a href={`tel:${d.buyerPhone}`} className="font-mono text-sky-400" dir="ltr">{displayPhone(d.buyerPhone)}</a></span>
            </div>
            <p className="text-xs text-slate-300">
              السعر <span className="font-mono font-bold">{formatPrice(d.price)}</span> ج.س
              {d.commissionAmount != null && (
                <>
                  {" "}· العمولة <span className="font-mono font-bold text-amber-300">{formatPrice(d.commissionAmount)}</span>
                  {d.commissionRule && <span className="text-slate-500"> ({d.commissionRule})</span>}
                  {d.commissionStatus && <span className={`mr-1 ${comLabel[d.commissionStatus][1]}`}> · {comLabel[d.commissionStatus][0]}</span>}
                </>
              )}
            </p>
            {d.commissionRef && <p className="text-[11px] text-sky-300">رقم العملية: <span className="font-mono select-all">{d.commissionRef}</span></p>}
            {d.commissionNote && <p className="text-[11px] text-slate-500">📝 {d.commissionNote}</p>}
            {d.cancelReason && <p className="text-[11px] text-red-300/80">سبب الإلغاء: {d.cancelReason}</p>}
            {d.status === "completed" && (
              <div className="flex gap-1.5 flex-wrap pt-1">
                {d.commissionStatus !== "paid" && (
                  <button disabled={busy === d.id} onClick={() => confirm("تأكيد استلام العمولة؟") && patch(d, { commissionStatus: "paid" })} className={`${btn} bg-emerald-500 text-white`}>
                    ✅ استلمت
                  </button>
                )}
                {d.commissionStatus !== "waived" && d.commissionStatus !== "paid" && (
                  <button disabled={busy === d.id} onClick={() => confirm("إعفاء الصفقة دي من العمولة؟") && patch(d, { commissionStatus: "waived" })} className={`${btn} border border-slate-600 text-slate-300`}>
                    إعفاء
                  </button>
                )}
                {(d.commissionStatus === "paid" || d.commissionStatus === "waived" || d.commissionStatus === "submitted") && (
                  <button disabled={busy === d.id} onClick={() => patch(d, { commissionStatus: "due" })} className={`${btn} border border-amber-600/60 text-amber-300`}>
                    رجّعها مستحقة
                  </button>
                )}
                <button disabled={busy === d.id} onClick={() => editAmount(d)} className={`${btn} border border-sky-700 text-sky-300`}>
                  ✏️ تعديل المبلغ
                </button>
                <Link href={`/chat/${d.conversationId}`} className={`${btn} border border-sky-900 text-slate-400`}>💬 المحادثة</Link>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ───────────── الإعلانات ─────────────
type AdminListing = Listing & { sellerPhone?: string };
const LSTATUS: [string, string][] = [
  ["pending", "منتظرة"],
  ["available", "متاحة"],
  ["rejected", "مرفوضة"],
  ["reserved", "محجوزة"],
  ["all", "الكل"],
];

function Listings() {
  const [status, setStatus] = useState("pending");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AdminListing[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setErr(null);
    const qs = new URLSearchParams({ status });
    if (q.trim()) qs.set("q", q.trim());
    api<{ listings: AdminListing[] }>(`/admin/listings?${qs}`).then((r) => setRows(r.listings)).catch((e) => setErr(errMsg(e)));
  }, [status, q]);
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const act = async (l: AdminListing, kind: "approve" | "reject") => {
    let body: Record<string, unknown> | undefined;
    if (kind === "reject") {
      const reason = prompt("سبب الرفض (بيظهر للمعلن):");
      if (!reason?.trim()) return;
      body = { reason: reason.trim() };
    }
    setBusy(l.id);
    try {
      await api(`/admin/listings/${l.id}/${kind}`, { method: "POST", body });
      load();
    } catch (e) {
      alert(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 flex-wrap">
        {LSTATUS.map(([k, label]) => (
          <button key={k} onClick={() => setStatus(k)} className={`${btn} border ${status === k ? "bg-sky-500 text-white border-sky-500" : "text-slate-300 border-sky-900/60"}`}>
            {label}
          </button>
        ))}
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالعنوان أو اسم/رقم المعلن" className={input} />
      {err && <p className="text-red-300 text-xs text-center">{err}</p>}
      {!rows ? (
        <p className="text-slate-500 text-xs text-center py-10">جاري التحميل…</p>
      ) : rows.length === 0 ? (
        <p className="text-slate-500 text-xs text-center py-10">ما في إعلانات هنا.</p>
      ) : (
        rows.map((l) => (
          <div key={l.id} className={`${card} flex gap-3`}>
            <Link href={`/listing/${l.id}`} className="w-20 h-20 shrink-0 rounded-xl overflow-hidden bg-[#0b1526]">
              {l.cover ? <img src={l.cover} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full grid place-items-center text-2xl">{l.category === "car" ? "🚗" : "🏠"}</div>}
            </Link>
            <div className="flex-1 min-w-0 space-y-1">
              <Link href={`/listing/${l.id}`} className="text-sm font-bold text-white line-clamp-1">{l.title}</Link>
              <p className="text-xs text-amber-300 font-mono font-bold">{formatPrice(l.price)} ج.س{l.dealType === "rent" && <span className="text-slate-400 font-sans font-normal"> / شهر</span>}</p>
              <p className="text-[11px] text-slate-400">
                {l.sellerName} <span className="font-mono" dir="ltr">{displayPhone(l.sellerPhone)}</span> · {l.city} · {timeAgo(l.createdAt)}
              </p>
              {l.rejectReason && <p className="text-[11px] text-red-300">مرفوض: {l.rejectReason}</p>}
              <div className="flex gap-1.5 pt-1">
                {(l.status === "pending" || l.status === "rejected") && (
                  <button disabled={busy === l.id} onClick={() => act(l, "approve")} className={`${btn} bg-emerald-500 text-white`}>✅ نشر</button>
                )}
                {(l.status === "pending" || l.status === "available") && (
                  <button disabled={busy === l.id} onClick={() => act(l, "reject")} className={`${btn} border border-red-500/60 text-red-300`}>✖ رفض</button>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ───────────── المستخدمين ─────────────
type AdminUser = User & { active: boolean; listingsCount: number; dealsCount: number; commissionDue: number };

function Users({ meId }: { meId: string }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AdminUser[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setErr(null);
    api<{ users: AdminUser[] }>(`/admin/users${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`)
      .then((r) => setRows(r.users))
      .catch((e) => setErr(errMsg(e)));
  }, [q]);
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const patch = async (u: AdminUser, body: Record<string, unknown>) => {
    setBusy(u.id);
    try {
      await api(`/admin/users/${u.id}`, { method: "PATCH", body });
      load();
    } catch (e) {
      alert(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const reset = async (u: AdminUser) => {
    if (!confirm(`إعادة تعيين كلمة سر ${u.name}؟ حيطلع من كل الأجهزة.`)) return;
    setBusy(u.id);
    try {
      const r = await api<{ tempPassword: string }>(`/admin/users/${u.id}/reset-password`, { method: "POST" });
      prompt("كلمة السر المؤقتة — رسلها ليهو وخليهو يغيّرها من «حسابي»:", r.tempPassword);
    } catch (e) {
      alert(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو الرقم (مثلاً 0912…)" className={input} />
      {err && <p className="text-red-300 text-xs text-center">{err}</p>}
      {!rows ? (
        <p className="text-slate-500 text-xs text-center py-10">جاري التحميل…</p>
      ) : rows.length === 0 ? (
        <p className="text-slate-500 text-xs text-center py-10">ما في نتائج.</p>
      ) : (
        rows.map((u) => (
          <div key={u.id} className={`${card} space-y-2 ${u.active ? "" : "opacity-60"}`}>
            <div className="flex justify-between gap-2">
              <p className="text-sm font-bold text-white truncate">
                {u.name} {u.verified && <span className="text-sky-400">✔</span>} {u.role === "admin" && <span className="text-amber-300 text-[11px]">(إدارة)</span>}
                {!u.active && <span className="text-red-300 text-[11px]"> · موقوف</span>}
              </p>
              <a href={`tel:${u.phone}`} className="font-mono text-xs text-sky-400 shrink-0" dir="ltr">{displayPhone(u.phone)}</a>
            </div>
            <p className="text-[11px] text-slate-400">
              {u.listingsCount} إعلان · {u.dealsCount} صفقة · انضم {timeAgo(u.createdAt)}
              {u.commissionDue > 0 && <span className="text-amber-300"> · عليه {formatPrice(u.commissionDue)} ج.س</span>}
            </p>
            <div className="flex gap-1.5 flex-wrap">
              <button disabled={busy === u.id} onClick={() => patch(u, { verified: !u.verified })} className={`${btn} border border-sky-700 text-sky-300`}>
                {u.verified ? "إلغاء التوثيق" : "✔ توثيق"}
              </button>
              {u.id !== meId && (
                <button
                  disabled={busy === u.id}
                  onClick={() => confirm(u.active ? `إيقاف حساب ${u.name}؟` : `تفعيل حساب ${u.name}؟`) && patch(u, { active: !u.active })}
                  className={`${btn} border ${u.active ? "border-red-500/60 text-red-300" : "border-emerald-500/60 text-emerald-300"}`}
                >
                  {u.active ? "⛔ إيقاف" : "تفعيل"}
                </button>
              )}
              <button disabled={busy === u.id} onClick={() => reset(u)} className={`${btn} border border-slate-600 text-slate-300`}>🔑 كلمة سر مؤقتة</button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ───────────── الإعدادات ─────────────
interface SettingsData {
  carSalePct: number;
  propertySalePct: number;
  rentMonths: number;
  payInfo: string;
  requireApproval: boolean;
  blockOverdueDays: number;
}

function Settings() {
  const [s, setS] = useState<SettingsData | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ settings: SettingsData }>("/admin/settings").then((r) => setS(r.settings)).catch((e) => setMsg(errMsg(e)));
  }, []);
  if (!s) return <p className="text-slate-500 text-xs text-center py-10">{msg || "جاري التحميل…"}</p>;

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ settings: SettingsData }>("/admin/settings", { method: "PUT", body: s });
      setS(r.settings);
      setMsg("✅ اتحفظت");
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const numField = (key: keyof SettingsData, label: string, hint: string, step = "0.1") => (
    <label className="block space-y-1">
      <span className="text-xs text-slate-300 font-bold">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={0}
        value={String(s[key])}
        onChange={(e) => setS({ ...s, [key]: e.target.value === "" ? 0 : Number(e.target.value) })}
        className={`${input} font-mono`}
        dir="ltr"
      />
      <span className="text-[10px] text-slate-500">{hint}</span>
    </label>
  );

  return (
    <div className={`${card} space-y-4`}>
      <p className="text-sm font-extrabold text-white">💰 نسب العمولة</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {numField("carSalePct", "بيع السيارات %", "من سعر البيع")}
        {numField("propertySalePct", "بيع العقارات %", "من سعر البيع")}
        {numField("rentMonths", "الإيجار (بالشهور)", "0.5 = نص شهر إيجار")}
      </div>
      <p className="text-[10px] text-slate-500">التعديل بيسري على الصفقات الجديدة بس — القديمة بتتعدل يدوي من «العمولات».</p>

      <label className="block space-y-1">
        <span className="text-xs text-slate-300 font-bold">💳 طريقة دفع العمولة (بتظهر للبائع)</span>
        <textarea
          value={s.payInfo}
          onChange={(e) => setS({ ...s, payInfo: e.target.value })}
          rows={3}
          maxLength={500}
          placeholder="مثلاً: بنكك — حساب رقم 1234567 باسم …"
          className={input}
        />
      </label>

      {numField("blockOverdueDays", "منع النشر لو العمولة متأخرة (أيام)", "0 = بدون منع", "1")}

      <label className="flex items-center justify-between gap-3 bg-[#0b1526] rounded-xl px-3 py-3 cursor-pointer">
        <span className="text-xs text-slate-200">
          <span className="font-bold block">📝 مراجعة الإعلانات قبل النشر</span>
          <span className="text-[10px] text-slate-500">كل إعلان جديد بيستنى موافقتك</span>
        </span>
        <input type="checkbox" checked={s.requireApproval} onChange={(e) => setS({ ...s, requireApproval: e.target.checked })} className="w-5 h-5 accent-amber-400" />
      </label>

      <button onClick={save} disabled={busy} className="w-full py-3 bg-amber-400 text-slate-950 font-extrabold rounded-xl text-sm disabled:opacity-50">
        {busy ? "جاري الحفظ…" : "حفظ الإعدادات"}
      </button>
      {msg && <p className="text-center text-xs text-slate-300">{msg}</p>}
    </div>
  );
}
