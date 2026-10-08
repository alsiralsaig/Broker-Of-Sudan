// موجّه الـ API — مستقل عن المنصة (Next.js route handler أو الاختبارات).
// كل العمليات بتمر من هنا بصلاحيات: محادثاتك ليك بس، وإعلانك إنت بس البتعدّله.
import type { Db } from './db';
import { getDb, dbEnvNames } from './db';
import { ensureSchema } from './schema';
import {
  COOKIE_NAME, type Role, type SessionClaims,
  hashPassword, verifyPassword, passwordProblem, normalizePhone,
  signSession, readSession, sessionCookie, clearCookie, parseCookies, tempPassword,
} from './auth';
import { storeMedia, isOurMediaUrl, readStoredMedia, MediaError, blobEnabled } from './media';
import { getSettings, saveSettings, computeCommission, DEFAULT_SETTINGS, type PlatformSettings } from './settings';
import { notify, adminIds, getVapid } from './notify';

// ───────────────────────── أنواع عامة ─────────────────────────

export interface ApiRequest {
  method: string;
  path: string; // بدون ‎/api — مثلاً ‎/auth/login
  query?: Record<string, string>;
  headers: Record<string, string | undefined>;
  body?: any;
  ip?: string;
}

export interface ApiResponse {
  status: number;
  json?: unknown;
  raw?: { contentType: string; data: Uint8Array };
  headers?: Record<string, string>;
  cookies?: string[];
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface CurrentUser {
  id: string;
  role: Role;
  name: string;
  phone: string;
  verified: boolean;
  created_at: string;
}

interface Ctx {
  db: Db;
  req: ApiRequest;
  query: Record<string, string>;
  user: CurrentUser | null;
  secure: boolean;
  params: Record<string, string>;
  cookies: string[];
}

type Handler = (c: Ctx) => Promise<unknown>;

// ───────────────────────── أدوات ─────────────────────────

export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

function str(v: unknown, field: string, max = 500, required = true): string {
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError(400, `الحقل «${field}» مطلوب`);
    return '';
  }
  if (typeof v !== 'string' && typeof v !== 'number') throw new HttpError(400, `قيمة «${field}» غير صحيحة`);
  const s = String(v).trim();
  if (required && !s) throw new HttpError(400, `الحقل «${field}» مطلوب`);
  if (s.length > max) throw new HttpError(400, `«${field}» طويل جداً`);
  return s;
}

/** رقم صحيح اختياري (فاضي = null) */
function optInt(v: unknown, field: string, min: number, max: number): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || Math.floor(n) !== n || n < min || n > max) {
    throw new HttpError(400, `قيمة «${field}» لازم تكون رقم بين ${min} و ${max}`);
  }
  return n;
}

function num(v: unknown, field: string, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `قيمة «${field}» غير صحيحة`);
  return n;
}

function oneOf<T extends string>(v: unknown, field: string, allowed: readonly T[]): T {
  if (typeof v !== 'string' || !allowed.includes(v as T)) throw new HttpError(400, `قيمة «${field}» غير مسموحة`);
  return v as T;
}

function requireUser(c: Ctx, ...roles: Role[]): CurrentUser {
  if (!c.user) throw new HttpError(401, 'لازم تسجّل دخول أولاً');
  if (roles.length && !roles.includes(c.user.role)) throw new HttpError(403, 'ما عندك صلاحية لهذه العملية');
  return c.user;
}

/** حد يومي بسيط ضد الإزعاج */
async function rateLimit(db: Db, key: string, limit: number) {
  const rows = await db.query<{ count: number }>(
    `INSERT INTO rate_limits (key, day, count) VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (key, day) DO UPDATE SET count = rate_limits.count + 1
     RETURNING count`,
    [key]
  );
  if ((rows[0]?.count ?? 0) > limit) throw new HttpError(429, 'وصلت الحد المسموح لليوم، جرّب بكرة');
}

const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

// ───────────────────────── تحويل الصفوف لشكل الواجهة ─────────────────────────

function userOut(r: any) {
  return { id: r.id, name: r.name, phone: r.phone, role: r.role, verified: !!r.verified, createdAt: iso(r.created_at) };
}

function listingOut(r: any, media: any[] = []) {
  return {
    id: r.id,
    sellerId: r.seller_id,
    sellerName: r.seller_name ?? null,
    sellerVerified: !!r.seller_verified,
    category: r.category,
    dealType: r.deal_type,
    title: r.title,
    description: r.description || '',
    price: Number(r.price),
    city: r.city || '',
    location: r.location || '',
    carMake: r.car_make, carModel: r.car_model, carYear: n(r.car_year), carMileageKm: n(r.car_mileage_km),
    carCondition: r.car_condition, carTransmission: r.car_transmission,
    propertyType: r.property_type, propertyRooms: n(r.property_rooms), propertyBathrooms: n(r.property_bathrooms),
    propertyAreaSqm: n(r.property_area_sqm), propertyFloor: n(r.property_floor),
    status: r.status,
    rejectReason: r.reject_reason || null,
    views: Number(r.views || 0),
    cover: r.cover ?? media.find((m) => m.media_type === 'image')?.url ?? null,
    media: media.map((m) => ({ id: m.id, type: m.media_type, url: m.url })),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function messageOut(r: any, meId: string) {
  return {
    id: r.id,
    type: r.message_type,
    body: r.body || '',
    offerPrice: n(r.offer_price),
    voiceUrl: r.voice_url || null,
    voiceDuration: n(r.voice_duration_sec),
    mine: r.sender_id === meId,
    createdAt: iso(r.created_at),
  };
}

const LISTING_SELECT = `
  SELECT l.*, u.name AS seller_name, u.verified AS seller_verified,
    (SELECT url FROM listing_media m WHERE m.listing_id = l.id AND m.media_type = 'image' ORDER BY sort_order LIMIT 1) AS cover
  FROM listings l JOIN users u ON u.id = l.seller_id`;

// ───────────────────────── الموجّه ─────────────────────────

const routes: { method: string; pattern: RegExp; keys: string[]; handler: Handler; mutating: boolean }[] = [];

function route(method: string, path: string, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp(
    '^' + path.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$'
  );
  routes.push({ method, pattern, keys, handler, mutating: method !== 'GET' });
}

route('GET', '/health', async (c) => {
  await c.db.query('SELECT 1');
  return { ok: true };
});

route('GET', '/config', async (c) => {
  const st = await getSettings(c.db);
  return {
    videoUpload: blobEnabled(),
    requireApproval: st.requireApproval,
    commission: { carSalePct: st.carSalePct, propertySalePct: st.propertySalePct, rentMonths: st.rentMonths },
  };
});

// ═════════════════════════ الحسابات ═════════════════════════

async function startSession(c: Ctx, u: { id: string; role: Role; token_version: number }) {
  const token = await signSession({ uid: u.id, role: u.role, tv: u.token_version });
  c.cookies.push(sessionCookie(token, c.secure));
}

route('POST', '/auth/register', async (c) => {
  const b = c.req.body || {};
  const name = str(b.name, 'الاسم', 80);
  if (name.length < 2) throw new HttpError(400, 'اكتب اسمك كامل');
  const phone = normalizePhone(b.phone);
  if (!phone) throw new HttpError(400, 'رقم التلفون غير صحيح — اكتبه زي 0912345678');
  const pwErr = passwordProblem(b.password);
  if (pwErr) throw new HttpError(400, pwErr);
  await rateLimit(c.db, `register:${c.req.ip || 'unknown'}`, 15);

  const id = newId('usr');
  try {
    await c.db.query(`INSERT INTO users (id, name, phone, password_hash) VALUES ($1,$2,$3,$4)`, [
      id, name, phone, await hashPassword(b.password),
    ]);
  } catch (e: any) {
    if (String(e?.message || e).includes('unique') || e?.code === '23505') {
      throw new HttpError(409, 'الرقم ده مسجّل قبل كده — سجّل دخول بدل حساب جديد');
    }
    throw e;
  }
  await startSession(c, { id, role: 'user', token_version: 0 });
  const u = (await c.db.query(`SELECT * FROM users WHERE id = $1`, [id]))[0];
  return { user: userOut(u) };
});

route('POST', '/auth/login', async (c) => {
  const b = c.req.body || {};
  const phone = normalizePhone(b.phone);
  const password = typeof b.password === 'string' ? b.password : '';
  if (!phone || !password) throw new HttpError(400, 'اكتب رقم التلفون وكلمة السر');
  const u = (await c.db.query(`SELECT * FROM users WHERE phone = $1`, [phone]))[0];
  const wrong = new HttpError(401, 'رقم التلفون أو كلمة السر غير صحيحة');
  if (!u) {
    await verifyPassword(password, '$2a$10$abcdefghijklmnopqrstuuJ5e9c5mJyZ0o1r6tW0b4cVdD1Yk6x3K'); // توقيت ثابت
    throw wrong;
  }
  if (u.locked_until && new Date(u.locked_until) > new Date()) {
    throw new HttpError(429, 'محاولات كتيرة غلط — الحساب مقفول مؤقتاً، جرّب بعد 15 دقيقة');
  }
  if (!u.active) throw new HttpError(403, 'الحساب ده موقوف — تواصل مع الإدارة');
  if (!(await verifyPassword(password, u.password_hash))) {
    await c.db.query(
      `UPDATE users SET failed_logins = failed_logins + 1,
         locked_until = CASE WHEN failed_logins + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
       WHERE id = $1`,
      [u.id]
    );
    throw wrong;
  }
  await c.db.query(`UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1`, [u.id]);
  await startSession(c, u);
  return { user: userOut(u) };
});

route('POST', '/auth/logout', async (c) => {
  c.cookies.push(clearCookie(c.secure));
  return { ok: true };
});

route('GET', '/auth/me', async (c) => ({ user: c.user ? userOut(c.user) : null }));

route('POST', '/auth/password', async (c) => {
  const me = requireUser(c);
  const b = c.req.body || {};
  const pwErr = passwordProblem(b.newPassword);
  if (pwErr) throw new HttpError(400, pwErr);
  const row = (await c.db.query(`SELECT password_hash FROM users WHERE id = $1`, [me.id]))[0];
  if (!(await verifyPassword(String(b.currentPassword || ''), row.password_hash))) {
    throw new HttpError(400, 'كلمة السر الحالية غير صحيحة');
  }
  const upd = await c.db.query<{ token_version: number }>(
    `UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2 RETURNING token_version`,
    [await hashPassword(b.newPassword), me.id]
  );
  await startSession(c, { id: me.id, role: me.role, token_version: upd[0].token_version });
  return { ok: true };
});

route('PATCH', '/auth/profile', async (c) => {
  const me = requireUser(c);
  const name = str(c.req.body?.name, 'الاسم', 80);
  const rows = await c.db.query(`UPDATE users SET name = $1 WHERE id = $2 RETURNING *`, [name, me.id]);
  return { user: userOut(rows[0]) };
});

// ═════════════════════════ الملفات ═════════════════════════

route('POST', '/media', async (c) => {
  const me = requireUser(c);
  await rateLimit(c.db, `media:${me.id}`, 300);
  const kind = oneOf(c.req.body?.kind, 'نوع الملف', ['image', 'audio'] as const);
  const url = await storeMedia(c.db, me.id, kind, c.req.body?.dataUrl);
  return { url };
});

route('GET', '/media/:id', async (c) => {
  const f = await readStoredMedia(c.db, c.params.id);
  if (!f) throw new HttpError(404, 'الملف غير موجود');
  return { __raw: f };
});

// ═════════════════════════ الإعلانات ═════════════════════════

const CAR_CONDITIONS = ['جديدة', 'مستعملة'] as const;
const TRANSMISSIONS = ['أوتوماتيك', 'عادي'] as const;
const PROPERTY_TYPES = ['شقة', 'منزل', 'أرض', 'محل تجاري', 'مكتب', 'مزرعة', 'أخرى'] as const;
const MAX_IMAGES = 10;

/** التحقق من بيانات الإعلان (إنشاء أو تعديل) */
function listingInput(b: any) {
  const category = oneOf(b.category, 'الفئة', ['car', 'property'] as const);
  const isCar = category === 'car';
  const year = new Date().getFullYear();
  const media = Array.isArray(b.media) ? b.media : [];
  const images = media.filter((m: any) => m?.type === 'image').slice(0, MAX_IMAGES);
  const videos = media.filter((m: any) => m?.type === 'video').slice(0, 1);
  for (const m of [...images, ...videos]) {
    if (typeof m.url !== 'string' || !isOurMediaUrl(m.url)) throw new HttpError(400, 'رابط صورة أو فيديو غير مسموح');
  }
  return {
    category,
    deal_type: oneOf(b.dealType, 'نوع المعاملة', ['sale', 'rent'] as const),
    title: str(b.title, 'العنوان', 120),
    description: str(b.description, 'الوصف', 3000, false),
    price: num(b.price, 'السعر', 1, 1e13),
    city: str(b.city, 'المدينة', 60, false),
    location: str(b.location, 'المنطقة', 120, false),
    car_make: isCar ? str(b.carMake, 'الماركة', 40, false) || null : null,
    car_model: isCar ? str(b.carModel, 'الموديل', 40, false) || null : null,
    car_year: isCar ? optInt(b.carYear, 'سنة الصنع', 1950, year + 1) : null,
    car_mileage_km: isCar ? optInt(b.carMileageKm, 'الممشى', 0, 3_000_000) : null,
    car_condition: isCar && b.carCondition ? oneOf(b.carCondition, 'حالة السيارة', CAR_CONDITIONS) : null,
    car_transmission: isCar && b.carTransmission ? oneOf(b.carTransmission, 'ناقل الحركة', TRANSMISSIONS) : null,
    property_type: !isCar && b.propertyType ? oneOf(b.propertyType, 'نوع العقار', PROPERTY_TYPES) : null,
    property_rooms: !isCar ? optInt(b.propertyRooms, 'الغرف', 0, 200) : null,
    property_bathrooms: !isCar ? optInt(b.propertyBathrooms, 'الحمامات', 0, 100) : null,
    property_area_sqm: !isCar && b.propertyAreaSqm ? num(b.propertyAreaSqm, 'المساحة', 1, 1e8) : null,
    property_floor: !isCar ? optInt(b.propertyFloor, 'الطابق', -5, 200) : null,
    media: [
      ...images.map((m: any, i: number) => ({ type: 'image', url: m.url, sort: i })),
      ...videos.map((m: any) => ({ type: 'video', url: m.url, sort: 999 })),
    ],
  };
}

const LISTING_COLS = [
  'category', 'deal_type', 'title', 'description', 'price', 'city', 'location',
  'car_make', 'car_model', 'car_year', 'car_mileage_km', 'car_condition', 'car_transmission',
  'property_type', 'property_rooms', 'property_bathrooms', 'property_area_sqm', 'property_floor',
] as const;

function mediaStmts(listingId: string, media: { type: string; url: string; sort: number }[]) {
  return media.map((m) => ({
    text: `INSERT INTO listing_media (id, listing_id, media_type, url, sort_order) VALUES ($1,$2,$3,$4,$5)`,
    params: [newId('med'), listingId, m.type, m.url, m.sort],
  }));
}

async function getListing(db: Db, id: string) {
  const r = (await db.query(`${LISTING_SELECT} WHERE l.id = $1`, [id]))[0];
  if (!r) throw new HttpError(404, 'الإعلان غير موجود أو اتمسح');
  return r;
}

async function listingWithMedia(db: Db, r: any) {
  const media = await db.query(`SELECT * FROM listing_media WHERE listing_id = $1 ORDER BY sort_order`, [r.id]);
  return listingOut(r, media);
}

/** تصفّح الإعلانات المتاحة: بحث وفلاتر في السيرفر + تحميل على دفعات */
route('GET', '/listings', async (c) => {
  const q = c.query;
  const where: string[] = [`l.status = 'available'`, `u.active`];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (q.category === 'car' || q.category === 'property') add('l.category = ?', q.category);
  if (q.deal === 'sale' || q.deal === 'rent') add('l.deal_type = ?', q.deal);
  if (q.city) add('l.city = ?', q.city.slice(0, 60));
  if (q.minPrice && Number(q.minPrice) > 0) add('l.price >= ?', Number(q.minPrice));
  if (q.maxPrice && Number(q.maxPrice) > 0) add('l.price <= ?', Number(q.maxPrice));
  if (q.q && q.q.trim()) {
    const words = q.q.trim().slice(0, 80).split(/\s+/).slice(0, 5);
    for (const w of words) {
      const like = '%' + w.replace(/[\\%_]/g, (ch) => '\\' + ch) + '%';
      add(
        `(l.title ILIKE ? OR l.description ILIKE $${params.length + 1} OR l.city ILIKE $${params.length + 1}
          OR l.location ILIKE $${params.length + 1} OR coalesce(l.car_make,'') ILIKE $${params.length + 1}
          OR coalesce(l.car_model,'') ILIKE $${params.length + 1} OR coalesce(l.property_type,'') ILIKE $${params.length + 1})`,
        like
      );
    }
  }
  const order =
    q.sort === 'price_asc' ? 'l.price ASC, l.id' : q.sort === 'price_desc' ? 'l.price DESC, l.id' : 'l.created_at DESC, l.id DESC';
  const limit = 24;
  const offset = Math.max(0, Math.min(10_000, Number(q.offset) || 0));
  const rows = await c.db.query(
    `${LISTING_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${limit + 1} OFFSET ${offset}`,
    params
  );
  return {
    listings: rows.slice(0, limit).map((r) => listingOut(r)),
    nextOffset: rows.length > limit ? offset + limit : null,
  };
});

route('GET', '/listings/cities', async (c) => {
  const rows = await c.db.query<{ city: string; count: number }>(
    `SELECT city, count(*)::int AS count FROM listings WHERE status = 'available' AND city <> ''
     GROUP BY city ORDER BY count DESC, city LIMIT 50`
  );
  return { cities: rows.map((r) => r.city) };
});

route('GET', '/listings/:id', async (c) => {
  const r = await getListing(c.db, c.params.id);
  const me = c.user;
  const isOwner = !!me && me.id === r.seller_id;
  if ((r.status === 'pending' || r.status === 'rejected') && !isOwner && me?.role !== 'admin') {
    throw new HttpError(404, 'الإعلان غير موجود أو اتمسح');
  }
  if (!isOwner) {
    await c.db.query(`UPDATE listings SET views = views + 1 WHERE id = $1`, [r.id]);
  }
  const [seller] = await c.db.query(
    `SELECT u.created_at, (SELECT count(*)::int FROM listings WHERE seller_id = u.id) AS listings_count,
       (SELECT count(*)::int FROM deals WHERE seller_id = u.id AND status = 'completed') AS deals_count
     FROM users u WHERE u.id = $1`,
    [r.seller_id]
  );
  let myConversationId: string | null = null;
  if (me && !isOwner) {
    const conv = await c.db.query(`SELECT id FROM conversations WHERE listing_id = $1 AND buyer_id = $2`, [r.id, me.id]);
    myConversationId = conv[0]?.id || null;
  }
  return {
    listing: await listingWithMedia(c.db, r),
    seller: {
      name: r.seller_name,
      verified: !!r.seller_verified,
      memberSince: iso(seller?.created_at),
      listingsCount: Number(seller?.listings_count || 0),
      dealsCount: Number(seller?.deals_count || 0),
    },
    isOwner,
    myConversationId,
  };
});

route('POST', '/listings', async (c) => {
  const me = requireUser(c);
  await rateLimit(c.db, `listing:${me.id}`, 20);
  const d = listingInput(c.req.body || {});
  const st = await getSettings(c.db);
  if (me.role !== 'admin' && st.blockOverdueDays > 0) {
    const late = await c.db.query(
      `SELECT 1 FROM deals WHERE seller_id = $1 AND commission_status IN ('due','submitted')
         AND closed_at < now() - ($2 || ' days')::interval LIMIT 1`,
      [me.id, String(st.blockOverdueDays)]
    );
    if (late.length) throw new HttpError(403, 'عندك عمولة متأخرة — سدّدها من «إعلاناتي» عشان تقدر تنشر إعلان جديد');
  }
  const pending = st.requireApproval && me.role !== 'admin';
  const id = newId('lst');
  const cols = ['id', 'seller_id', 'status', ...LISTING_COLS];
  const vals = [id, me.id, pending ? 'pending' : 'available', ...LISTING_COLS.map((k) => (d as any)[k])];
  await c.db.tx([
    {
      text: `INSERT INTO listings (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})`,
      params: vals,
    },
    ...mediaStmts(id, d.media),
  ]);
  if (pending) {
    await notify(c.db, await adminIds(c.db), {
      kind: 'listing_pending', title: '📝 إعلان جديد منتظر المراجعة', body: d.title, url: '/admin?tab=listings',
    });
  }
  return { listing: await listingWithMedia(c.db, await getListing(c.db, id)) };
});

async function ownListing(c: Ctx, id: string) {
  const me = requireUser(c);
  const r = await getListing(c.db, id);
  if (r.seller_id !== me.id && me.role !== 'admin') throw new HttpError(403, 'ده ما إعلانك');
  return r;
}

route('PATCH', '/listings/:id', async (c) => {
  const r = await ownListing(c, c.params.id);
  if (r.status === 'sold' || r.status === 'rented') throw new HttpError(400, 'الإعلان ده اتقفل بصفقة — ما بيتعدّل');
  const d = listingInput(c.req.body || {});
  const sets = LISTING_COLS.map((k, i) => `${k} = $${i + 2}`).join(', ');
  let statusSql = '';
  if (r.status === 'rejected') {
    const st = await getSettings(c.db);
    statusSql = st.requireApproval && c.user!.role !== 'admin' ? `, status = 'pending', reject_reason = NULL` : `, status = 'available', reject_reason = NULL`;
  }
  await c.db.tx([
    {
      text: `UPDATE listings SET ${sets}${statusSql}, updated_at = now() WHERE id = $1`,
      params: [r.id, ...LISTING_COLS.map((k) => (d as any)[k])],
    },
    { text: `DELETE FROM listing_media WHERE listing_id = $1`, params: [r.id] },
    ...mediaStmts(r.id, d.media),
  ]);
  return { listing: await listingWithMedia(c.db, await getListing(c.db, r.id)) };
});

route('DELETE', '/listings/:id', async (c) => {
  const r = await ownListing(c, c.params.id);
  if (c.user!.role !== 'admin') {
    const open = await c.db.query(`SELECT 1 FROM deals WHERE listing_id = $1 AND status IN ('agreed','completed')`, [r.id]);
    if (open.length) throw new HttpError(400, 'الإعلان ده عليه صفقة — ما بيتمسح. ألغِ الصفقة أولاً لو ما تمت');
  }
  await c.db.query(`DELETE FROM listings WHERE id = $1`, [r.id]);
  return { ok: true };
});

route('GET', '/my/listings', async (c) => {
  const me = requireUser(c);
  const rows = await c.db.query(
    `${LISTING_SELECT.replace(
      'FROM listings l',
      `, (SELECT count(*)::int FROM conversations cv WHERE cv.listing_id = l.id) AS conversations_count FROM listings l`
    )} WHERE l.seller_id = $1 ORDER BY l.created_at DESC`,
    [me.id]
  );
  return { listings: rows.map((r) => ({ ...listingOut(r), conversationsCount: Number(r.conversations_count || 0) })) };
});

// ═════════════════════════ المحادثات والمفاصلة ═════════════════════════

async function conversationFor(c: Ctx, id: string) {
  const me = requireUser(c);
  const conv = (await c.db.query(`SELECT * FROM conversations WHERE id = $1`, [id]))[0];
  if (!conv) throw new HttpError(404, 'المحادثة غير موجودة');
  const side: 'buyer' | 'seller' | null = conv.buyer_id === me.id ? 'buyer' : conv.seller_id === me.id ? 'seller' : null;
  if (!side && me.role !== 'admin') throw new HttpError(403, 'المحادثة دي ما بتخصك');
  return { me, conv, side };
}

async function systemMessage(db: Db, convId: string, senderId: string | null, body: string) {
  await db.query(
    `INSERT INTO messages (id, conversation_id, sender_id, message_type, body) VALUES ($1,$2,$3,'system',$4)`,
    [newId('msg'), convId, senderId, body]
  );
  await db.query(`UPDATE conversations SET last_message_at = now() WHERE id = $1`, [convId]);
}

route('POST', '/conversations', async (c) => {
  const me = requireUser(c);
  const listing = await getListing(c.db, str(c.req.body?.listingId, 'الإعلان', 40));
  if (listing.seller_id === me.id) throw new HttpError(400, 'ده إعلانك إنت');
  const existing = await c.db.query(`SELECT id FROM conversations WHERE listing_id = $1 AND buyer_id = $2`, [listing.id, me.id]);
  if (existing[0]) return { id: existing[0].id };
  if (listing.status !== 'available') throw new HttpError(400, 'الإعلان ده ما متاح هسه');
  await rateLimit(c.db, `conv:${me.id}`, 60);
  const id = newId('cnv');
  try {
    await c.db.query(
      `INSERT INTO conversations (id, listing_id, buyer_id, seller_id) VALUES ($1,$2,$3,$4)`,
      [id, listing.id, me.id, listing.seller_id]
    );
  } catch (e: any) {
    const again = await c.db.query(`SELECT id FROM conversations WHERE listing_id = $1 AND buyer_id = $2`, [listing.id, me.id]);
    if (again[0]) return { id: again[0].id };
    throw e;
  }
  await systemMessage(c.db, id, me.id, `بدأ ${me.name} محادثة بخصوص «${listing.title}»`);
  await notify(c.db, [listing.seller_id], {
    kind: 'new_conversation', title: '👀 زبون مهتم بإعلانك', body: `${me.name} — ${listing.title}`, url: `/chat/${id}`, tag: `chat-${id}`,
  });
  return { id };
});

route('GET', '/conversations', async (c) => {
  const me = requireUser(c);
  const rows = await c.db.query(
    `SELECT cv.*, l.title, l.price, l.deal_type, l.status AS listing_status,
       (SELECT url FROM listing_media m WHERE m.listing_id = l.id AND m.media_type = 'image' ORDER BY sort_order LIMIT 1) AS cover,
       CASE WHEN cv.buyer_id = $1 THEN us.name ELSE ub.name END AS other_name,
       lm.message_type AS last_type, lm.body AS last_body, lm.offer_price AS last_offer, lm.sender_id AS last_sender,
       (SELECT count(*)::int FROM messages m WHERE m.conversation_id = cv.id AND m.sender_id IS DISTINCT FROM $1
          AND m.created_at > CASE WHEN cv.buyer_id = $1 THEN cv.buyer_read_at ELSE cv.seller_read_at END) AS unread
     FROM conversations cv
     JOIN listings l ON l.id = cv.listing_id
     JOIN users ub ON ub.id = cv.buyer_id
     JOIN users us ON us.id = cv.seller_id
     LEFT JOIN LATERAL (SELECT * FROM messages m WHERE m.conversation_id = cv.id ORDER BY created_at DESC LIMIT 1) lm ON true
     WHERE cv.buyer_id = $1 OR cv.seller_id = $1
     ORDER BY cv.last_message_at DESC
     LIMIT 200`,
    [me.id]
  );
  return {
    conversations: rows.map((r) => ({
      id: r.id,
      side: r.buyer_id === me.id ? 'buyer' : 'seller',
      otherName: r.other_name,
      listing: { id: r.listing_id, title: r.title, price: Number(r.price), dealType: r.deal_type, status: r.listing_status, cover: r.cover },
      offerStatus: r.offer_status,
      lastMessage: r.last_type
        ? { type: r.last_type, body: r.last_body || '', offerPrice: n(r.last_offer), mine: r.last_sender === me.id }
        : null,
      lastMessageAt: iso(r.last_message_at),
      unread: Number(r.unread || 0),
    })),
  };
});

/** عدد غير المقروء + آخر المحادثات الفيها جديد (للجرس والشارة) */
route('GET', '/unread', async (c) => {
  if (!c.user) return { count: 0, items: [], notifications: [], unreadNotifications: 0 };
  const me = c.user;
  const rows = await c.db.query(
    `SELECT cv.id, cv.buyer_id, l.title, cv.last_message_at,
       (SELECT count(*)::int FROM messages m WHERE m.conversation_id = cv.id AND m.sender_id IS DISTINCT FROM $1
          AND m.created_at > CASE WHEN cv.buyer_id = $1 THEN cv.buyer_read_at ELSE cv.seller_read_at END) AS unread
     FROM conversations cv JOIN listings l ON l.id = cv.listing_id
     WHERE (cv.buyer_id = $1 OR cv.seller_id = $1)
     ORDER BY cv.last_message_at DESC LIMIT 100`,
    [me.id]
  );
  const items = rows
    .filter((r) => Number(r.unread) > 0)
    .map((r) => ({
      conversationId: r.id,
      title: r.title,
      from: r.buyer_id === me.id ? 'seller' : 'buyer',
      count: Number(r.unread),
      at: iso(r.last_message_at),
    }));
  const notes = await c.db.query(
    `SELECT id, kind, title, body, url, read_at, created_at FROM notifications WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 15`,
    [me.id]
  );
  return {
    count: items.length,
    items: items.slice(0, 20),
    notifications: notes.map((x) => ({
      id: x.id, kind: x.kind, title: x.title, body: x.body, url: x.url, read: !!x.read_at, at: iso(x.created_at),
    })),
    unreadNotifications: notes.filter((x) => !x.read_at).length,
  };
});

route('GET', '/conversations/:id', async (c) => {
  const { me, conv, side } = await conversationFor(c, c.params.id);
  const listing = await getListing(c.db, conv.listing_id);
  const after = c.query.after ? new Date(c.query.after) : null;
  const msgs = after && !isNaN(after.getTime())
    ? await c.db.query(`SELECT * FROM messages WHERE conversation_id = $1 AND created_at > $2 ORDER BY created_at`, [conv.id, after.toISOString()])
    : await c.db.query(`SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at`, [conv.id]);
  if (side) {
    await c.db.query(`UPDATE conversations SET ${side}_read_at = now() WHERE id = $1`, [conv.id]);
  }
  const [buyer, seller] = await Promise.all([
    c.db.query(`SELECT name, phone FROM users WHERE id = $1`, [conv.buyer_id]),
    c.db.query(`SELECT name, phone, verified FROM users WHERE id = $1`, [conv.seller_id]),
  ]);
  const deal = (await c.db.query(
    `SELECT * FROM deals WHERE conversation_id = $1 AND status IN ('agreed','completed') ORDER BY created_at DESC LIMIT 1`,
    [conv.id]
  ))[0];
  const other = side === 'seller' ? buyer[0] : seller[0];
  return {
    conversation: {
      id: conv.id,
      side: side || 'admin',
      otherName: side ? other?.name : `${seller[0]?.name} ↔ ${buyer[0]?.name}`,
      // أرقام التلفون بتظهر للطرفين بس بعد الاتفاق (عشان التواصل يمشي عن طريق المنصة لحدي الصفقة)
      otherPhone: deal && side ? other?.phone : null,
      currentOfferPrice: n(conv.current_offer_price),
      currentOfferBy: conv.current_offer_by,
      offerStatus: conv.offer_status,
    },
    listing: listingOut(listing),
    deal: deal
      ? {
          id: deal.id, price: Number(deal.price), status: deal.status, createdAt: iso(deal.created_at),
          ...(side === 'seller' || me.role === 'admin'
            ? { commissionAmount: n(deal.commission_amount), commissionStatus: deal.commission_status || null }
            : {}),
        }
      : null,
    messages: msgs.map((m) => messageOut(m, me.id)),
    serverTime: new Date().toISOString(),
  };
});

async function guardOpen(db: Db, listingId: string) {
  const l = (await db.query(`SELECT status FROM listings WHERE id = $1`, [listingId]))[0];
  if (!l) throw new HttpError(404, 'الإعلان اتمسح');
  if (l.status === 'sold' || l.status === 'rented') throw new HttpError(400, 'الإعلان ده اتقفل بصفقة');
  return l.status as string;
}

route('POST', '/conversations/:id/messages', async (c) => {
  const { me, conv, side } = await conversationFor(c, c.params.id);
  if (!side) throw new HttpError(403, 'الإدارة بتشوف بس');
  await guardOpen(c.db, conv.listing_id);
  await rateLimit(c.db, `msg:${me.id}`, 1000);
  const b = c.req.body || {};
  const type = oneOf(b.type || 'text', 'نوع الرسالة', ['text', 'voice'] as const);
  const id = newId('msg');
  if (type === 'text') {
    await c.db.query(
      `INSERT INTO messages (id, conversation_id, sender_id, message_type, body) VALUES ($1,$2,$3,'text',$4)`,
      [id, conv.id, me.id, str(b.body, 'الرسالة', 2000)]
    );
  } else {
    if (typeof b.voiceUrl !== 'string' || !isOurMediaUrl(b.voiceUrl)) throw new HttpError(400, 'رابط التسجيل غير مسموح');
    await c.db.query(
      `INSERT INTO messages (id, conversation_id, sender_id, message_type, voice_url, voice_duration_sec)
       VALUES ($1,$2,$3,'voice',$4,$5)`,
      [id, conv.id, me.id, b.voiceUrl, optInt(b.voiceDuration, 'المدة', 0, 600)]
    );
  }
  await c.db.query(`UPDATE conversations SET last_message_at = now(), ${side}_read_at = now() WHERE id = $1`, [conv.id]);
  await notify(c.db, [side === 'buyer' ? conv.seller_id : conv.buyer_id], {
    kind: 'message', pushOnly: true, tag: `chat-${conv.id}`, url: `/chat/${conv.id}`,
    title: `💬 ${me.name}`,
    body: type === 'text' ? String(b.body).slice(0, 120) : '🎤 رسالة صوتية',
  });
  return { ok: true };
});

route('POST', '/conversations/:id/offer', async (c) => {
  const { me, conv, side } = await conversationFor(c, c.params.id);
  if (!side) throw new HttpError(403, 'الإدارة بتشوف بس');
  const status = await guardOpen(c.db, conv.listing_id);
  if (status !== 'available' || conv.offer_status === 'accepted') throw new HttpError(400, 'الإعلان محجوز — المفاصلة اتقفلت');
  const price = num(c.req.body?.price, 'السعر', 1, 1e13);
  await c.db.tx([
    {
      text: `INSERT INTO messages (id, conversation_id, sender_id, message_type, offer_price, body) VALUES ($1,$2,$3,'offer',$4,$5)`,
      params: [newId('msg'), conv.id, me.id, price, `عرض سعر: ${price}`],
    },
    {
      text: `UPDATE conversations SET current_offer_price = $2, current_offer_by = $3, offer_status = 'pending',
               last_message_at = now(), ${side}_read_at = now() WHERE id = $1`,
      params: [conv.id, price, side],
    },
  ]);
  await notify(c.db, [side === 'buyer' ? conv.seller_id : conv.buyer_id], {
    kind: 'offer', title: '💰 عرض سعر جديد', tag: `chat-${conv.id}`, url: `/chat/${conv.id}`,
    body: `${me.name} عرض ${new Intl.NumberFormat('en-US').format(price)} ج.س`,
  });
  return { ok: true };
});

/** قبول آخر عرض من الطرف التاني ← اتفاق مبدئي: الإعلان بيتحجز وأرقام التلفون بتظهر للطرفين */
route('POST', '/conversations/:id/accept', async (c) => {
  const { me, conv, side } = await conversationFor(c, c.params.id);
  if (!side) throw new HttpError(403, 'الإدارة بتشوف بس');
  if (conv.offer_status !== 'pending' || conv.current_offer_price == null) throw new HttpError(400, 'ما في عرض منتظر رد');
  if (conv.current_offer_by === side) throw new HttpError(400, 'ما بتقدر تقبل عرضك إنت — انتظر رد الطرف التاني');
  // الحجز ذري: لو اتنين قبلوا في نفس اللحظة، واحد بس بينجح
  const locked = await c.db.query(
    `UPDATE listings SET status = 'reserved', updated_at = now() WHERE id = $1 AND status = 'available' RETURNING id`,
    [conv.listing_id]
  );
  if (!locked.length) throw new HttpError(409, 'الإعلان اتحجز لمشتري تاني قبل شوية');
  const price = Number(conv.current_offer_price);
  await c.db.tx([
    {
      text: `INSERT INTO deals (id, listing_id, conversation_id, seller_id, buyer_id, price) VALUES ($1,$2,$3,$4,$5,$6)`,
      params: [newId('del'), conv.listing_id, conv.id, conv.seller_id, conv.buyer_id, price],
    },
    { text: `UPDATE conversations SET offer_status = 'accepted' WHERE id = $1`, params: [conv.id] },
  ]);
  await systemMessage(
    c.db, conv.id, me.id,
    `🤝 اتفاق مبدئي على ${new Intl.NumberFormat('en-US').format(price)} ج.س — الإعلان اتحجز، وأرقام التلفون ظهرت للطرفين عشان تتقابلوا. لما الصفقة تتم، البائع يأكد «تمت الصفقة».`
  );
  await notify(c.db, [conv.buyer_id, conv.seller_id], {
    kind: 'deal_agreed', title: '🤝 اتفاق مبدئي', tag: `chat-${conv.id}`, url: `/chat/${conv.id}`,
    body: `اتفقتوا على ${new Intl.NumberFormat('en-US').format(price)} ج.س — أرقام التلفون ظهرت في المحادثة`,
  });
  return { ok: true };
});

async function dealFor(c: Ctx, id: string) {
  const me = requireUser(c);
  const deal = (await c.db.query(`SELECT * FROM deals WHERE id = $1`, [id]))[0];
  if (!deal) throw new HttpError(404, 'الصفقة غير موجودة');
  const side = deal.seller_id === me.id ? 'seller' : deal.buyer_id === me.id ? 'buyer' : null;
  if (!side && me.role !== 'admin') throw new HttpError(403, 'الصفقة دي ما بتخصك');
  return { me, deal, side };
}

route('POST', '/deals/:id/complete', async (c) => {
  const { me, deal, side } = await dealFor(c, c.params.id);
  if (side !== 'seller' && me.role !== 'admin') throw new HttpError(403, 'البائع بس البيأكد إن الصفقة تمت');
  if (deal.status !== 'agreed') throw new HttpError(400, 'الصفقة دي اتقفلت قبل كده');
  const l = (await c.db.query(`SELECT deal_type, category, title FROM listings WHERE id = $1`, [deal.listing_id]))[0];
  const st = await getSettings(c.db);
  const com = computeCommission(st, l?.category, l?.deal_type, Number(deal.price));
  await c.db.tx([
    {
      text: `UPDATE deals SET status = 'completed', closed_at = now(), commission_amount = $2, commission_rule = $3,
               commission_status = CASE WHEN $2::numeric > 0 THEN 'due' ELSE 'waived' END WHERE id = $1`,
      params: [deal.id, com.amount, com.rule],
    },
    {
      text: `UPDATE listings SET status = $2, updated_at = now() WHERE id = $1`,
      params: [deal.listing_id, l?.deal_type === 'rent' ? 'rented' : 'sold'],
    },
  ]);
  await systemMessage(c.db, deal.conversation_id, me.id, `✅ تمت الصفقة — مبروك للطرفين!`);
  await notify(c.db, [deal.buyer_id], {
    kind: 'deal_completed', title: '✅ تمت الصفقة', body: l?.title || '', url: `/chat/${deal.conversation_id}`,
  });
  if (com.amount > 0) {
    await notify(c.db, [deal.seller_id], {
      kind: 'commission_due', title: '🧾 عمولة السمسار مستحقة',
      body: `${new Intl.NumberFormat('en-US').format(com.amount)} ج.س (${com.rule}) — التفاصيل في «إعلاناتي»`,
      url: '/my',
    });
  }
  return { ok: true, commission: com };
});

route('POST', '/deals/:id/cancel', async (c) => {
  const { me, deal, side } = await dealFor(c, c.params.id);
  if (!side && me.role !== 'admin') throw new HttpError(403, 'ما عندك صلاحية');
  if (deal.status !== 'agreed') throw new HttpError(400, 'الصفقة دي ما بتتلغى هسه');
  const reason = str(c.req.body?.reason, 'السبب', 300, false);
  await c.db.tx([
    { text: `UPDATE deals SET status = 'cancelled', cancel_reason = $2, closed_at = now() WHERE id = $1`, params: [deal.id, reason] },
    { text: `UPDATE listings SET status = 'available', updated_at = now() WHERE id = $1 AND status = 'reserved'`, params: [deal.listing_id] },
    {
      text: `UPDATE conversations SET offer_status = NULL, current_offer_price = NULL, current_offer_by = NULL WHERE id = $1`,
      params: [deal.conversation_id],
    },
  ]);
  await systemMessage(c.db, deal.conversation_id, me.id, `❌ الاتفاق اتلغى${reason ? ` — السبب: ${reason}` : ''}. الإعلان رجع متاح.`);
  await notify(c.db, [deal.buyer_id, deal.seller_id].filter((id) => id !== me.id), {
    kind: 'deal_cancelled', title: '❌ الاتفاق اتلغى', body: reason || '', url: `/chat/${deal.conversation_id}`,
  });
  return { ok: true };
});

// ═════════════════════════ العمولات (البائع) ═════════════════════════

function dealRowOut(r: any) {
  return {
    id: r.id,
    listingId: r.listing_id,
    listingTitle: r.title ?? null,
    conversationId: r.conversation_id,
    price: Number(r.price),
    status: r.status,
    commissionAmount: n(r.commission_amount),
    commissionRule: r.commission_rule || null,
    commissionStatus: r.commission_status || null,
    commissionRef: r.commission_ref || null,
    commissionNote: r.commission_note || null,
    commissionPaidAt: iso(r.commission_paid_at),
    cancelReason: r.cancel_reason || null,
    createdAt: iso(r.created_at),
    closedAt: iso(r.closed_at),
    sellerName: r.seller_name ?? undefined,
    sellerPhone: r.seller_phone ?? undefined,
    buyerName: r.buyer_name ?? undefined,
    buyerPhone: r.buyer_phone ?? undefined,
  };
}

route('GET', '/my/commissions', async (c) => {
  const me = requireUser(c);
  const rows = await c.db.query(
    `SELECT d.*, l.title FROM deals d JOIN listings l ON l.id = d.listing_id
     WHERE d.seller_id = $1 AND d.commission_status IS NOT NULL ORDER BY d.closed_at DESC LIMIT 100`,
    [me.id]
  );
  const st = await getSettings(c.db);
  return { commissions: rows.map(dealRowOut), payInfo: st.payInfo };
});

/** البائع يرسل رقم عملية الدفع (بنكك مثلاً) — والإدارة بتأكد */
route('POST', '/deals/:id/commission-ref', async (c) => {
  const { me, deal } = await dealFor(c, c.params.id);
  if (deal.seller_id !== me.id) throw new HttpError(403, 'البائع بس البيسدّد العمولة');
  if (deal.commission_status !== 'due' && deal.commission_status !== 'submitted') {
    throw new HttpError(400, 'العمولة دي ما منتظرة دفع');
  }
  const ref = str(c.req.body?.ref, 'رقم العملية', 120);
  await c.db.query(`UPDATE deals SET commission_ref = $2, commission_status = 'submitted' WHERE id = $1`, [deal.id, ref]);
  await notify(c.db, await adminIds(c.db), {
    kind: 'commission_submitted', title: '💵 بائع أرسل إثبات دفع عمولة',
    body: `${me.name} — ${new Intl.NumberFormat('en-US').format(Number(deal.commission_amount || 0))} ج.س — رقم: ${ref}`,
    url: '/admin?tab=deals',
  });
  return { ok: true };
});

// ═════════════════════════ الإشعارات ═════════════════════════

route('POST', '/notifications/read', async (c) => {
  const me = requireUser(c);
  await c.db.query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [me.id]);
  return { ok: true };
});

route('GET', '/push/key', async (c) => ({ publicKey: (await getVapid(c.db)).publicKey }));

route('POST', '/push/subscribe', async (c) => {
  const me = requireUser(c);
  const b = c.req.body || {};
  const endpoint = str(b.endpoint, 'endpoint', 1000);
  if (!/^https:\/\//.test(endpoint)) throw new HttpError(400, 'اشتراك غير صحيح');
  const p256dh = str(b.keys?.p256dh, 'p256dh', 200);
  const auth = str(b.keys?.auth, 'auth', 100);
  await c.db.query(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [newId('psh'), me.id, endpoint, p256dh, auth]
  );
  return { ok: true };
});

route('POST', '/push/unsubscribe', async (c) => {
  const me = requireUser(c);
  await c.db.query(`DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`, [me.id, String(c.req.body?.endpoint || '')]);
  return { ok: true };
});

// ═════════════════════════ لوحة الإدارة ═════════════════════════

route('GET', '/admin/stats', async (c) => {
  requireUser(c, 'admin');
  const [u] = await c.db.query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS week FROM users`
  );
  const ls = await c.db.query<{ status: string; n: number }>(`SELECT status, count(*)::int AS n FROM listings GROUP BY status`);
  const ds = await c.db.query<{ status: string; n: number }>(`SELECT status, count(*)::int AS n FROM deals GROUP BY status`);
  const [cm] = await c.db.query(
    `SELECT
       coalesce(sum(commission_amount) FILTER (WHERE commission_status IN ('due','submitted')), 0) AS due,
       count(*) FILTER (WHERE commission_status IN ('due','submitted'))::int AS due_count,
       count(*) FILTER (WHERE commission_status = 'submitted')::int AS submitted_count,
       coalesce(sum(commission_amount) FILTER (WHERE commission_status = 'paid'), 0) AS paid,
       coalesce(sum(commission_amount) FILTER (WHERE commission_status = 'paid' AND commission_paid_at > date_trunc('month', now())), 0) AS paid_month,
       coalesce(sum(price) FILTER (WHERE status = 'completed'), 0) AS volume
     FROM deals`
  );
  const toMap = (rows: { status: string; n: number }[]) => Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  return {
    users: { total: Number(u.total), week: Number(u.week) },
    listings: toMap(ls),
    deals: toMap(ds),
    commission: {
      due: Number(cm.due), dueCount: Number(cm.due_count), submittedCount: Number(cm.submitted_count),
      paid: Number(cm.paid), paidMonth: Number(cm.paid_month), volume: Number(cm.volume),
    },
  };
});

route('GET', '/admin/deals', async (c) => {
  requireUser(c, 'admin');
  const f = c.query.filter || 'all';
  const where =
    f === 'unpaid' ? `d.commission_status IN ('due','submitted')`
    : f === 'submitted' ? `d.commission_status = 'submitted'`
    : f === 'agreed' ? `d.status = 'agreed'`
    : f === 'cancelled' ? `d.status = 'cancelled'`
    : f === 'paid' ? `d.commission_status = 'paid'`
    : 'true';
  const rows = await c.db.query(
    `SELECT d.*, l.title, us.name AS seller_name, us.phone AS seller_phone, ub.name AS buyer_name, ub.phone AS buyer_phone
     FROM deals d JOIN listings l ON l.id = d.listing_id
     JOIN users us ON us.id = d.seller_id JOIN users ub ON ub.id = d.buyer_id
     WHERE ${where} ORDER BY d.created_at DESC LIMIT 200`
  );
  return { deals: rows.map(dealRowOut) };
});

route('PATCH', '/admin/deals/:id', async (c) => {
  requireUser(c, 'admin');
  const deal = (await c.db.query(`SELECT * FROM deals WHERE id = $1`, [c.params.id]))[0];
  if (!deal) throw new HttpError(404, 'الصفقة غير موجودة');
  const b = c.req.body || {};
  const amount = b.commissionAmount === undefined ? n(deal.commission_amount) : num(b.commissionAmount, 'العمولة', 0, 1e13);
  const status = b.commissionStatus === undefined
    ? deal.commission_status
    : oneOf(b.commissionStatus, 'حالة العمولة', ['due', 'submitted', 'paid', 'waived'] as const);
  const note = b.note === undefined ? deal.commission_note : str(b.note, 'ملاحظة', 500, false);
  if (deal.status !== 'completed' && status) throw new HttpError(400, 'العمولة بتتحدد بعد إتمام الصفقة');
  await c.db.query(
    `UPDATE deals SET commission_amount = $2, commission_status = $3, commission_note = $4,
       commission_paid_at = CASE WHEN $3 = 'paid' THEN coalesce(commission_paid_at, now()) ELSE NULL END
     WHERE id = $1`,
    [deal.id, amount, status, note]
  );
  if (status === 'paid' && deal.commission_status !== 'paid') {
    await notify(c.db, [deal.seller_id], {
      kind: 'commission_paid', title: '✅ استلمنا العمولة — شكراً ليك',
      body: `${new Intl.NumberFormat('en-US').format(Number(amount || 0))} ج.س`, url: '/my',
    });
  }
  return { ok: true };
});

route('GET', '/admin/listings', async (c) => {
  requireUser(c, 'admin');
  const status = c.query.status || 'pending';
  const params: unknown[] = [];
  let where = status === 'all' ? 'true' : (params.push(status), `l.status = $1`);
  if (c.query.q) {
    params.push('%' + c.query.q.slice(0, 80).replace(/[\\%_]/g, (ch) => '\\' + ch) + '%');
    where += ` AND (l.title ILIKE $${params.length} OR u.name ILIKE $${params.length} OR u.phone ILIKE $${params.length})`;
  }
  const rows = await c.db.query(
    `${LISTING_SELECT.replace('u.verified AS seller_verified', 'u.verified AS seller_verified, u.phone AS seller_phone')}
     WHERE ${where} ORDER BY l.created_at DESC LIMIT 200`,
    params
  );
  return { listings: rows.map((r) => ({ ...listingOut(r), sellerPhone: r.seller_phone })) };
});

route('POST', '/admin/listings/:id/approve', async (c) => {
  requireUser(c, 'admin');
  const r = await getListing(c.db, c.params.id);
  if (r.status !== 'pending' && r.status !== 'rejected') throw new HttpError(400, 'الإعلان ده ما منتظر مراجعة');
  await c.db.query(`UPDATE listings SET status = 'available', reject_reason = NULL, updated_at = now() WHERE id = $1`, [r.id]);
  await notify(c.db, [r.seller_id], { kind: 'listing_approved', title: '✅ إعلانك اتنشر', body: r.title, url: `/listing/${r.id}` });
  return { ok: true };
});

route('POST', '/admin/listings/:id/reject', async (c) => {
  requireUser(c, 'admin');
  const r = await getListing(c.db, c.params.id);
  if (r.status !== 'pending' && r.status !== 'available') throw new HttpError(400, 'ما بيترفض في الحالة دي');
  const reason = str(c.req.body?.reason, 'السبب', 300);
  await c.db.query(`UPDATE listings SET status = 'rejected', reject_reason = $2, updated_at = now() WHERE id = $1`, [r.id, reason]);
  await notify(c.db, [r.seller_id], {
    kind: 'listing_rejected', title: '⚠️ إعلانك محتاج تعديل', body: `${r.title} — ${reason}`, url: `/listing/${r.id}`,
  });
  return { ok: true };
});

route('GET', '/admin/users', async (c) => {
  requireUser(c, 'admin');
  const params: unknown[] = [];
  let where = 'true';
  if (c.query.q) {
    // الرقم بيتكتب 0912... لكنه محفوظ +249912... — نحوّله قبل البحث
    const q = normalizePhone(c.query.q)?.replace(/^\+/, '') || c.query.q.trim().replace(/^0/, '');
    params.push('%' + q.slice(0, 80).replace(/[\\%_]/g, (ch) => '\\' + ch) + '%');
    where = `(u.name ILIKE $1 OR u.phone ILIKE $1)`;
  }
  const rows = await c.db.query(
    `SELECT u.*, (SELECT count(*)::int FROM listings WHERE seller_id = u.id) AS listings_count,
       (SELECT count(*)::int FROM deals WHERE (seller_id = u.id OR buyer_id = u.id) AND status = 'completed') AS deals_count,
       (SELECT coalesce(sum(commission_amount),0) FROM deals WHERE seller_id = u.id AND commission_status IN ('due','submitted')) AS due
     FROM users u WHERE ${where} ORDER BY u.created_at DESC LIMIT 200`,
    params
  );
  return {
    users: rows.map((r) => ({
      ...userOut(r), active: !!r.active, listingsCount: Number(r.listings_count), dealsCount: Number(r.deals_count), commissionDue: Number(r.due),
    })),
  };
});

route('PATCH', '/admin/users/:id', async (c) => {
  const me = requireUser(c, 'admin');
  const u = (await c.db.query(`SELECT * FROM users WHERE id = $1`, [c.params.id]))[0];
  if (!u) throw new HttpError(404, 'المستخدم غير موجود');
  const b = c.req.body || {};
  if (u.id === me.id && b.active === false) throw new HttpError(400, 'ما بتقدر توقف حسابك إنت');
  const verified = typeof b.verified === 'boolean' ? b.verified : !!u.verified;
  const active = typeof b.active === 'boolean' ? b.active : !!u.active;
  await c.db.query(
    `UPDATE users SET verified = $2, active = $3, token_version = token_version + CASE WHEN $3 THEN 0 ELSE 1 END WHERE id = $1`,
    [u.id, verified, active]
  );
  return { ok: true };
});

route('POST', '/admin/users/:id/reset-password', async (c) => {
  requireUser(c, 'admin');
  const u = (await c.db.query(`SELECT id FROM users WHERE id = $1`, [c.params.id]))[0];
  if (!u) throw new HttpError(404, 'المستخدم غير موجود');
  const temp = tempPassword();
  await c.db.query(
    `UPDATE users SET password_hash = $2, token_version = token_version + 1, failed_logins = 0, locked_until = NULL WHERE id = $1`,
    [u.id, await hashPassword(temp)]
  );
  return { tempPassword: temp };
});

route('GET', '/admin/settings', async (c) => {
  requireUser(c, 'admin');
  return { settings: await getSettings(c.db) };
});

route('PUT', '/admin/settings', async (c) => {
  requireUser(c, 'admin');
  const b = c.req.body || {};
  const s: PlatformSettings = {
    carSalePct: num(b.carSalePct ?? DEFAULT_SETTINGS.carSalePct, 'نسبة السيارات', 0, 50),
    propertySalePct: num(b.propertySalePct ?? DEFAULT_SETTINGS.propertySalePct, 'نسبة العقارات', 0, 50),
    rentMonths: num(b.rentMonths ?? DEFAULT_SETTINGS.rentMonths, 'عمولة الإيجار', 0, 12),
    payInfo: str(b.payInfo, 'بيانات الدفع', 500, false),
    requireApproval: !!b.requireApproval,
    blockOverdueDays: Math.round(num(b.blockOverdueDays ?? 0, 'أيام التأخير', 0, 365)),
  };
  await saveSettings(c.db, s);
  return { settings: s };
});

// ───────────────────────── التشغيل ─────────────────────────

async function loadUser(db: Db, claims: SessionClaims | null): Promise<CurrentUser | null> {
  if (!claims) return null;
  const u = (await db.query(
    `SELECT id, role, name, phone, verified, created_at, token_version, active FROM users WHERE id = $1`,
    [claims.uid]
  ))[0];
  if (!u || !u.active || Number(u.token_version) !== claims.tv) return null;
  return u;
}

export async function handleApi(req: ApiRequest, dbOverride?: Db): Promise<ApiResponse> {
  const cookiesOut: string[] = [];
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https') || process.env.NODE_ENV === 'production';
  try {
    const method = req.method.toUpperCase();
    const path = ('/' + req.path.replace(/^\/+/, '')).replace(/\/+$/, '') || '/';
    const match = routes.find((r) => r.method === method && r.pattern.test(path));
    if (!match) {
      const anyMethod = routes.some((r) => r.pattern.test(path));
      throw new HttpError(anyMethod ? 405 : 404, anyMethod ? 'الطريقة غير مسموحة' : 'المسار غير موجود');
    }
    // حماية CSRF: الطلبات المعدِّلة لازم تحمل ترويسة مخصصة (المتصفح ما بيرسلها من موقع تاني)
    if (match.mutating && req.headers['x-bs-client'] !== '1') throw new HttpError(403, 'طلب غير موثوق');
    const m = match.pattern.exec(path)!;
    const params: Record<string, string> = {};
    match.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));

    const db = dbOverride || (await getDb());
    await ensureSchema(db);
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    const user = await loadUser(db, await readSession(token));
    if (token && !user) cookiesOut.push(clearCookie(secure));

    const ctx: Ctx = { db, req, query: req.query || {}, user, secure, params, cookies: cookiesOut };
    const result: any = await match.handler(ctx);
    if (result && result.__raw) {
      return {
        status: 200,
        raw: result.__raw,
        headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
        cookies: cookiesOut,
      };
    }
    return { status: 200, json: result, headers: { 'Cache-Control': 'no-store' }, cookies: cookiesOut };
  } catch (e: any) {
    if (e instanceof HttpError || e instanceof MediaError) {
      return { status: e.status, json: { error: e.message }, headers: { 'Cache-Control': 'no-store' }, cookies: cookiesOut };
    }
    console.error('[api] unexpected error:', e);
    const raw = String(e?.message || '');
    if (raw.startsWith('FOREIGN_DB:')) {
      return { status: 503, json: { error: raw.slice(11).trim() }, headers: { 'Cache-Control': 'no-store' }, cookies: cookiesOut };
    }
    const msg = raw.includes('DATABASE_URL')
      ? 'قاعدة البيانات غير مربوطة — تأكد من DATABASE_URL في إعدادات Vercel'
      : 'حصل خطأ في السيرفر، جرّب تاني';
    const diag = msg.includes('DATABASE_URL') ? { envNames: dbEnvNames() } : {};
    return { status: 500, json: { error: msg, ...diag }, headers: { 'Cache-Control': 'no-store' }, cookies: cookiesOut };
  }
}

/** للمسارات الخارجية (رفع الفيديو): تحديد المستخدم من الكوكي */
export async function userFromCookie(cookieHeader: string | undefined): Promise<CurrentUser | null> {
  const db = await getDb();
  await ensureSchema(db);
  return loadUser(db, await readSession(parseCookies(cookieHeader)[COOKIE_NAME]));
}
