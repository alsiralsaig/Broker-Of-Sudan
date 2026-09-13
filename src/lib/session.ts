// إدارة جلسة المستخدم البسيطة (بالهاتف فقط، بدون كلمة سر) عبر localStorage
// نفس منطق رَكْشَتُك المُختبر — بدون تعقيد OTP في المرحلة الأولى

const PHONE_KEY = "broker_user_phone";
const NAME_KEY = "broker_user_name";

export function getSavedPhone(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PHONE_KEY);
}

export function getSavedName(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(NAME_KEY);
}

export function saveUserSession(phone: string, name?: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PHONE_KEY, phone);
  if (name) localStorage.setItem(NAME_KEY, name);
}

export function clearUserSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PHONE_KEY);
  localStorage.removeItem(NAME_KEY);
}
