// إعدادات المنصة (العمولة، المراجعة، بيانات الدفع) — محفوظة في جدول settings
import type { Db } from './db';

export interface PlatformSettings {
  carSalePct: number; // نسبة عمولة بيع السيارات %
  propertySalePct: number; // نسبة عمولة بيع العقارات %
  rentMonths: number; // عمولة الإيجار = كم شهر من الإيجار (0.5 = نص شهر)
  payInfo: string; // طريقة دفع العمولة (رقم حساب بنكك مثلاً)
  requireApproval: boolean; // الإعلانات الجديدة بتحتاج موافقة الإدارة
  blockOverdueDays: number; // منع النشر لو في عمولة متأخرة أكتر من كم يوم (0 = بدون منع)
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  carSalePct: 1,
  propertySalePct: 2,
  rentMonths: 0.5,
  payInfo: '',
  requireApproval: false,
  blockOverdueDays: 7,
};

export async function getSettings(db: Db): Promise<PlatformSettings> {
  const r = (await db.query(`SELECT value FROM settings WHERE key = 'platform'`))[0];
  const v = r?.value ? (typeof r.value === 'string' ? JSON.parse(r.value) : r.value) : {};
  return { ...DEFAULT_SETTINGS, ...v };
}

export async function saveSettings(db: Db, s: PlatformSettings) {
  await db.query(
    `INSERT INTO settings (key, value) VALUES ('platform', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(s)]
  );
}

/** حساب العمولة لصفقة */
export function computeCommission(
  s: PlatformSettings,
  category: string,
  dealType: string,
  price: number
): { amount: number; rule: string } {
  if (dealType === 'rent') {
    return { amount: Math.round(price * s.rentMonths), rule: `${s.rentMonths} شهر من الإيجار` };
  }
  const pct = category === 'car' ? s.carSalePct : s.propertySalePct;
  return { amount: Math.round((price * pct) / 100), rule: `${pct}% من سعر البيع` };
}
