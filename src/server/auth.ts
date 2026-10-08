// تسجيل الدخول: تشفير كلمات السر + جلسة موقعة في كوكي HttpOnly.
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

export const COOKIE_NAME = 'bs_session';
export const SESSION_DAYS = 30;

export type Role = 'admin' | 'user';

export interface SessionClaims {
  uid: string;
  role: Role;
  tv: number; // token_version — لإلغاء كل الجلسات عند تغيير كلمة السر
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(pw, hash);
  } catch {
    return false;
  }
}

/** شروط كلمة السر: 6 أحرف على الأقل */
export function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== 'string' || pw.length < 6) return 'كلمة السر لازم تكون 6 أحرف أو أرقام على الأقل';
  if (pw.length > 128) return 'كلمة السر طويلة جداً';
  return null;
}

const AR_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

/**
 * يوحّد رقم التلفون بصيغة دولية ‎+249xxxxxxxxx.
 * يقبل: 0912345678 / 912345678 / 249912345678 / 00249… / +249… / أرقام عربية.
 * الأرقام اللي بتبدأ بـ + أو 00 من دول تانية بتتقبل زي ما هي.
 */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let s = raw.replace(/[٠-٩۰-۹]/g, (d) => AR_DIGITS[d] || d).replace(/[\s\-().\u200e\u200f]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) {
    s = '+' + s.slice(1).replace(/\D/g, '');
  } else {
    s = s.replace(/\D/g, '');
    if (s.startsWith('249')) s = '+' + s;
    else if (s.startsWith('0') && s.length === 10) s = '+249' + s.slice(1);
    else if (s.length === 9 && /^[19]/.test(s)) s = '+249' + s;
    else return null;
  }
  // سوداني: +249 ثم 9 أرقام
  if (s.startsWith('+249')) return /^\+249[19]\d{8}$/.test(s) ? s : null;
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

function secretKey(): Uint8Array {
  const s = process.env.AUTH_SECRET || '';
  if (s.length < 32) {
    if (process.env.NODE_ENV === 'test' || process.env.LOCAL_PGLITE || process.env.NODE_ENV === 'development') {
      return new TextEncoder().encode('dev-only-secret-dev-only-secret-dev-only');
    }
    throw new Error('AUTH_SECRET لازم يكون 32 حرف على الأقل');
  }
  return new TextEncoder().encode(s);
}

export async function signSession(c: SessionClaims): Promise<string> {
  return new SignJWT({ role: c.role, tv: c.tv })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(c.uid)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function readSession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    if (!payload.sub) return null;
    return { uid: payload.sub, role: payload.role as Role, tv: Number(payload.tv || 0) };
  } catch {
    return null;
  }
}

export function sessionCookie(token: string, secure: boolean): string {
  return [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_DAYS * 86400}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

export function clearCookie(secure: boolean): string {
  return [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0', secure ? 'Secure' : '']
    .filter(Boolean).join('; ');
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** كلمة سر مؤقتة سهلة القراءة (لإعادة التعيين من الإدارة) */
export function tempPassword(): string {
  const digits = '23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => digits[b % digits.length]).join('');
}
