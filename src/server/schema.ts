// إنشاء الجداول تلقائياً (آمن للتشغيل أكثر من مرة) + حساب المدير من متغيرات البيئة.
import type { Db } from './db';
import { hashPassword, normalizePhone } from './auth';

export const SCHEMA_VERSION = 2;

const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS broker_meta (
     id INT PRIMARY KEY DEFAULT 1,
     version INT NOT NULL,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY,
     role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
     name TEXT NOT NULL,
     phone TEXT NOT NULL UNIQUE,
     password_hash TEXT NOT NULL,
     verified BOOLEAN NOT NULL DEFAULT false,
     active BOOLEAN NOT NULL DEFAULT true,
     failed_logins INT NOT NULL DEFAULT 0,
     locked_until TIMESTAMPTZ,
     token_version INT NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS listings (
     id TEXT PRIMARY KEY,
     seller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     category TEXT NOT NULL CHECK (category IN ('car','property')),
     deal_type TEXT NOT NULL CHECK (deal_type IN ('sale','rent')),
     title TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     price NUMERIC NOT NULL CHECK (price > 0),
     city TEXT NOT NULL DEFAULT '',
     location TEXT NOT NULL DEFAULT '',
     car_make TEXT, car_model TEXT, car_year INT, car_mileage_km INT, car_condition TEXT, car_transmission TEXT,
     property_type TEXT, property_rooms INT, property_bathrooms INT, property_area_sqm NUMERIC, property_floor INT,
     status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','sold','rented')),
     views INT NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS listings_browse_idx ON listings (status, created_at DESC, id DESC)`,
  `CREATE INDEX IF NOT EXISTS listings_seller_idx ON listings (seller_id)`,
  `CREATE TABLE IF NOT EXISTS listing_media (
     id TEXT PRIMARY KEY,
     listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
     media_type TEXT NOT NULL CHECK (media_type IN ('image','video')),
     url TEXT NOT NULL,
     sort_order INT NOT NULL DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS listing_media_listing_idx ON listing_media (listing_id, sort_order)`,
  // ملفات مرفوعة محفوظة في القاعدة (للتطوير، أو لو Vercel Blob ما مربوط) — الصور مضغوطة والصوت صغير
  `CREATE TABLE IF NOT EXISTS media_files (
     id TEXT PRIMARY KEY,
     owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     mime TEXT NOT NULL,
     data TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS conversations (
     id TEXT PRIMARY KEY,
     listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
     buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     seller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     current_offer_price NUMERIC,
     current_offer_by TEXT CHECK (current_offer_by IN ('buyer','seller')),
     offer_status TEXT CHECK (offer_status IN ('pending','accepted')),
     buyer_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     seller_read_at TIMESTAMPTZ NOT NULL DEFAULT 'epoch',
     last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE (listing_id, buyer_id)
   )`,
  `CREATE INDEX IF NOT EXISTS conversations_buyer_idx ON conversations (buyer_id, last_message_at DESC)`,
  `CREATE INDEX IF NOT EXISTS conversations_seller_idx ON conversations (seller_id, last_message_at DESC)`,
  `CREATE TABLE IF NOT EXISTS messages (
     id TEXT PRIMARY KEY,
     conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
     sender_id TEXT REFERENCES users(id) ON DELETE SET NULL,
     message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','offer','voice','system')),
     body TEXT NOT NULL DEFAULT '',
     offer_price NUMERIC,
     voice_url TEXT,
     voice_duration_sec INT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
   )`,
  `CREATE INDEX IF NOT EXISTS messages_conv_idx ON messages (conversation_id, created_at)`,
  // الصفقات المتفق عليها (أساس العمولة في المرحلة التانية)
  `CREATE TABLE IF NOT EXISTS deals (
     id TEXT PRIMARY KEY,
     listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
     conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
     seller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     price NUMERIC NOT NULL,
     status TEXT NOT NULL DEFAULT 'agreed' CHECK (status IN ('agreed','completed','cancelled')),
     cancel_reason TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     closed_at TIMESTAMPTZ
   )`,
  `CREATE INDEX IF NOT EXISTS deals_seller_idx ON deals (seller_id, status)`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
     key TEXT NOT NULL,
     day DATE NOT NULL,
     count INT NOT NULL DEFAULT 0,
     PRIMARY KEY (key, day)
   )`,
];

// ترقيات بالترتيب — كل نسخة بتتطبق مرة واحدة على القواعد القديمة (والجديدة كمان)
const MIGRATIONS: Record<number, string[]> = {
  2: [
    // مراجعة الإعلانات
    `ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_status_check`,
    `ALTER TABLE listings ADD CONSTRAINT listings_status_check
       CHECK (status IN ('pending','available','reserved','sold','rented','rejected'))`,
    `ALTER TABLE listings ADD COLUMN IF NOT EXISTS reject_reason TEXT`,
    // العمولة
    `ALTER TABLE deals ADD COLUMN IF NOT EXISTS commission_amount NUMERIC`,
    `ALTER TABLE deals ADD COLUMN IF NOT EXISTS commission_rule TEXT`,
    `ALTER TABLE deals ADD COLUMN IF NOT EXISTS commission_status TEXT
       CHECK (commission_status IN ('due','submitted','paid','waived'))`,
    `ALTER TABLE deals ADD COLUMN IF NOT EXISTS commission_ref TEXT`,
    `ALTER TABLE deals ADD COLUMN IF NOT EXISTS commission_note TEXT`,
    `ALTER TABLE deals ADD COLUMN IF NOT EXISTS commission_paid_at TIMESTAMPTZ`,
    `CREATE INDEX IF NOT EXISTS deals_commission_idx ON deals (commission_status)`,
    // الإعدادات
    `CREATE TABLE IF NOT EXISTS settings (
       key TEXT PRIMARY KEY,
       value JSONB NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
    // الإشعارات
    `CREATE TABLE IF NOT EXISTS notifications (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       kind TEXT NOT NULL,
       title TEXT NOT NULL,
       body TEXT NOT NULL DEFAULT '',
       url TEXT NOT NULL DEFAULT '/',
       read_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS push_subscriptions (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       endpoint TEXT NOT NULL UNIQUE,
       p256dh TEXT NOT NULL,
       auth TEXT NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS push_user_idx ON push_subscriptions (user_id)`,
  ],
};

let ready: Promise<void> | null = null;
let readyFor: Db | null = null;

export function ensureSchema(db: Db): Promise<void> {
  if (ready && readyFor === db) return ready;
  readyFor = db;
  ready = (async () => {
    // حماية: لو القاعدة فيها جداول مشروع تاني (users موجود بدون broker_meta) ما نلمس حاجة
    const own = await db.query(`SELECT to_regclass('public.broker_meta') AS m, to_regclass('public.users') AS u`);
    if (!own[0]?.m && own[0]?.u) {
      throw new Error('FOREIGN_DB: قاعدة البيانات دي تبع مشروع تاني — اربط قاعدة Neon جديدة خاصة بالسمسار');
    }
    await db.query(DDL[0]);
    const meta = await db.query<{ version: number }>(`SELECT version FROM broker_meta WHERE id = 1`);
    const current = meta[0]?.version ?? 0;
    if (current < SCHEMA_VERSION) {
      if (current < 1) for (const stmt of DDL.slice(1)) await db.query(stmt);
      for (let v = Math.max(2, current + 1); v <= SCHEMA_VERSION; v++) {
        for (const stmt of MIGRATIONS[v] || []) await db.query(stmt);
      }
      await db.query(
        `INSERT INTO broker_meta (id, version) VALUES (1, $1)
         ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, updated_at = now()`,
        [SCHEMA_VERSION]
      );
    }
    await ensureAdmin(db);
  })();
  ready.catch(() => {
    ready = null;
  });
  return ready;
}

/** حساب المدير من ADMIN_PHONE / ADMIN_PASSWORD (بيتعمل مرة واحدة، وما بيغيّر كلمة سر موجودة) */
async function ensureAdmin(db: Db) {
  const phone = normalizePhone(process.env.ADMIN_PHONE || '');
  const pw = process.env.ADMIN_PASSWORD || '';
  if (!phone || pw.length < 6) return;
  const exists = await db.query(`SELECT id, role FROM users WHERE phone = $1`, [phone]);
  if (exists[0]) {
    if (exists[0].role !== 'admin') await db.query(`UPDATE users SET role = 'admin', verified = true WHERE id = $1`, [exists[0].id]);
    return;
  }
  await db.query(
    `INSERT INTO users (id, role, name, phone, password_hash, verified) VALUES ($1, 'admin', $2, $3, $4, true)
     ON CONFLICT (phone) DO NOTHING`,
    ['usr_admin', process.env.ADMIN_NAME || 'إدارة سمسار السودان', phone, await hashPassword(pw)]
  );
}
