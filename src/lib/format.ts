/**
 * أدوات تنسيق والتحقق من رقم الهاتف السوداني (نفس منطق رَكْشَتُك المُختبر).
 *
 * الأرقام السودانية الصحيحة: 9 أرقام تبدأ بـ 9 (موبايل: زين/MTN/سوداني)
 * أو تبدأ بـ 1 (خطوط أرضية: سوداني/Sudatel الثابتة).
 */

export function normalizeSudanesePhone(raw: string): string | null {
  let digits = (raw || "").replace(/\D/g, "");

  while (digits.length > 9) {
    if (digits.startsWith("00249")) digits = digits.slice(5);
    else if (digits.startsWith("249")) digits = digits.slice(3);
    else if (digits.startsWith("0")) digits = digits.slice(1);
    else break;
  }

  return /^[19]\d{8}$/.test(digits) ? `+249${digits}` : null;
}

export function isValidSudanesePhone(raw: string): boolean {
  return normalizeSudanesePhone(raw) !== null;
}

export function displayPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  return normalizeSudanesePhone(raw) || raw;
}

/** تنسيق مبلغ بالجنيه السوداني بفواصل الآلاف */
export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

/** وقت نسبي مبسط بالعربي (منذ دقيقة، منذ ساعة...) */
export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "الآن";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `منذ ${diffHr} ساعة`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `منذ ${diffDay} يوم`;
  const diffMonth = Math.floor(diffDay / 30);
  return `منذ ${diffMonth} شهر`;
}
