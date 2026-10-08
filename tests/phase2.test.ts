// اختبارات المرحلة 2: العمولة، لوحة الإدارة، المراجعة، الإشعارات، الترقية من نسخة 1
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createPgliteDb, type Db } from '../src/server/db';
import { handleApi } from '../src/server/app';
import { sentPushes } from '../src/server/notify';

(process.env as Record<string, string>).NODE_ENV = 'test';
process.env.ADMIN_PHONE = '0911111111';
process.env.ADMIN_PASSWORD = 'admin-pass-1';

let db: Db;
before(async () => { db = await createPgliteDb(); });

class Client {
  cookie = '';
  async call(method: string, path: string, body?: any, query?: Record<string, string>) {
    const res = await handleApi(
      { method, path, body, query, ip: '9.9.9.9', headers: { cookie: this.cookie, 'x-bs-client': '1' } },
      db
    );
    for (const c of res.cookies || []) {
      const v = c.split(';')[0];
      this.cookie = v.endsWith('=') ? '' : v;
    }
    return res;
  }
  async ok(method: string, path: string, body?: any, query?: Record<string, string>) {
    const r = await this.call(method, path, body, query);
    assert.equal(r.status, 200, `${method} ${path} -> ${r.status} ${JSON.stringify(r.json)}`);
    return r.json as any;
  }
}

const admin = new Client();
const seller = new Client();
const buyer = new Client();
const car = (extra: any = {}) => ({ category: 'car', dealType: 'sale', title: 'لاندكروزر', price: 100000000, ...extra });

async function makeDeal(listingId: string, price: number) {
  const conv = (await buyer.ok('POST', '/conversations', { listingId })).id;
  await buyer.ok('POST', `/conversations/${conv}/offer`, { price });
  await seller.ok('POST', `/conversations/${conv}/accept`);
  const d = (await seller.ok('GET', `/conversations/${conv}`)).deal;
  return { conv, dealId: d.id as string };
}

test('الإعداد', async () => {
  await admin.ok('POST', '/auth/login', { phone: '0911111111', password: 'admin-pass-1' });
  await seller.ok('POST', '/auth/register', { name: 'البائع', phone: '0912000001', password: 'seller-pass' });
  await buyer.ok('POST', '/auth/register', { name: 'المشتري', phone: '0912000002', password: 'buyer-pass' });
  // مستخدم عادي ما بيدخل الإدارة
  assert.equal((await seller.call('GET', '/admin/stats')).status, 403);
  assert.equal((await seller.call('PUT', '/admin/settings', {})).status, 403);
  const cfg = await seller.ok('GET', '/config');
  assert.deepEqual(cfg.commission, { carSalePct: 1, propertySalePct: 2, rentMonths: 0.5 });
});

test('العمولة: بيع سيارة 1% وإيجار نص شهر، والإدارة بتعدّل وتأكد الدفع', async () => {
  const l1 = (await seller.ok('POST', '/listings', car())).listing.id;
  const { dealId } = await makeDeal(l1, 90000000);
  const done = await seller.ok('POST', `/deals/${dealId}/complete`);
  assert.equal(done.commission.amount, 900000);

  const rent = (await seller.ok('POST', '/listings', { category: 'property', dealType: 'rent', title: 'شقة', price: 600000 })).listing.id;
  const d2 = await makeDeal(rent, 500000);
  assert.equal((await seller.ok('POST', `/deals/${d2.dealId}/complete`)).commission.amount, 250000);

  // المشتري ما بيشوف العمولة
  const bv = await buyer.ok('GET', `/conversations/${d2.conv}`);
  assert.equal(bv.deal.commissionAmount, undefined);

  const mine = await seller.ok('GET', '/my/commissions');
  assert.equal(mine.commissions.length, 2);
  assert.ok(mine.commissions.every((x: any) => x.commissionStatus === 'due'));

  // البائع يرسل رقم العملية ← الإدارة تتنبه
  assert.equal((await buyer.call('POST', `/deals/${dealId}/commission-ref`, { ref: '123' })).status, 403);
  await seller.ok('POST', `/deals/${dealId}/commission-ref`, { ref: 'BNK-55667' });
  const unpaid = await admin.ok('GET', '/admin/deals', undefined, { filter: 'submitted' });
  assert.equal(unpaid.deals[0].commissionRef, 'BNK-55667');
  assert.equal(unpaid.deals[0].sellerPhone, '+249912000001');

  // تعديل يدوي للمبلغ + تأكيد الدفع
  await admin.ok('PATCH', `/admin/deals/${dealId}`, { commissionAmount: 800000, commissionStatus: 'paid', note: 'خصم' });
  const stats = await admin.ok('GET', '/admin/stats');
  assert.equal(stats.commission.paid, 800000);
  assert.equal(stats.commission.due, 250000);
  assert.equal(stats.deals.completed, 2);

  const notes = (await seller.ok('GET', '/unread')).notifications.map((x: any) => x.kind);
  assert.ok(notes.includes('commission_due'));
  assert.ok(notes.includes('commission_paid'));
});

test('منع النشر مع عمولة متأخرة', async () => {
  await db.query(`UPDATE deals SET closed_at = now() - interval '10 days' WHERE commission_status = 'due'`);
  const r = await seller.call('POST', '/listings', car({ title: 'تاني' }));
  assert.equal(r.status, 403);
  // الإدارة تقفل المنع
  const st = (await admin.ok('GET', '/admin/settings')).settings;
  await admin.ok('PUT', '/admin/settings', { ...st, blockOverdueDays: 0 });
  await seller.ok('POST', '/listings', car({ title: 'تاني' }));
});

test('تغيير النسب يدوياً بيأثر على الصفقات الجديدة', async () => {
  const st = (await admin.ok('GET', '/admin/settings')).settings;
  await admin.ok('PUT', '/admin/settings', { ...st, carSalePct: 1.5, payInfo: 'بنكك 1234567' });
  const l = (await seller.ok('POST', '/listings', car({ title: 'ثالث' }))).listing.id;
  const { dealId } = await makeDeal(l, 10000000);
  assert.equal((await seller.ok('POST', `/deals/${dealId}/complete`)).commission.amount, 150000);
  assert.equal((await seller.ok('GET', '/my/commissions')).payInfo, 'بنكك 1234567');
  assert.equal((await admin.call('PUT', '/admin/settings', { ...st, carSalePct: 99 })).status, 400);
});

test('مراجعة الإعلانات', async () => {
  const st = (await admin.ok('GET', '/admin/settings')).settings;
  await admin.ok('PUT', '/admin/settings', { ...st, requireApproval: true });
  const l = (await seller.ok('POST', '/listings', car({ title: 'منتظر' }))).listing;
  assert.equal(l.status, 'pending');
  // ما بيظهر للناس
  assert.equal((await buyer.call('GET', `/listings/${l.id}`)).status, 404);
  assert.equal((await seller.ok('GET', `/listings/${l.id}`)).listing.status, 'pending');
  const pend = await admin.ok('GET', '/admin/listings', undefined, { status: 'pending' });
  assert.equal(pend.listings[0].id, l.id);

  await admin.ok('POST', `/admin/listings/${l.id}/reject`, { reason: 'الصور ما واضحة' });
  const rej = await seller.ok('GET', `/listings/${l.id}`);
  assert.equal(rej.listing.status, 'rejected');
  assert.equal(rej.listing.rejectReason, 'الصور ما واضحة');
  // التعديل يرجّعه للمراجعة
  await seller.ok('PATCH', `/listings/${l.id}`, car({ title: 'منتظر بعد التعديل' }));
  assert.equal((await seller.ok('GET', `/listings/${l.id}`)).listing.status, 'pending');
  await admin.ok('POST', `/admin/listings/${l.id}/approve`);
  assert.equal((await buyer.ok('GET', `/listings/${l.id}`)).listing.status, 'available');
  await admin.ok('PUT', '/admin/settings', { ...st, requireApproval: false });
});

test('إدارة المستخدمين: توثيق، إيقاف، كلمة سر مؤقتة', async () => {
  const users = (await admin.ok('GET', '/admin/users', undefined, { q: '0912000001' })).users;
  assert.equal(users.length, 1);
  const id = users[0].id;
  await admin.ok('PATCH', `/admin/users/${id}`, { verified: true });
  const l = (await seller.ok('GET', '/my/listings')).listings[0];
  assert.equal((await buyer.ok('GET', `/listings/${l.id}`)).listing.sellerVerified, true);

  await admin.ok('PATCH', `/admin/users/${id}`, { active: false });
  assert.equal((await seller.ok('GET', '/auth/me')).user, null); // اتطرد
  assert.equal((await new Client().call('POST', '/auth/login', { phone: '0912000001', password: 'seller-pass' })).status, 403);
  await admin.ok('PATCH', `/admin/users/${id}`, { active: true });

  const { tempPassword } = await admin.ok('POST', `/admin/users/${id}/reset-password`);
  await seller.ok('POST', '/auth/login', { phone: '0912000001', password: tempPassword });
});

test('الإشعارات: اشتراك push وإرسال للطرف التاني', async () => {
  assert.ok((await buyer.ok('GET', '/push/key')).publicKey.length > 40);
  await seller.ok('POST', '/push/subscribe', { endpoint: 'https://fcm.googleapis.com/x/1', keys: { p256dh: 'k'.repeat(80), auth: 'a'.repeat(22) } });
  assert.equal((await seller.call('POST', '/push/subscribe', { endpoint: 'http://evil', keys: { p256dh: 'x', auth: 'y' } })).status, 400);
  sentPushes.length = 0;
  const l = (await seller.ok('POST', '/listings', car({ title: 'جديد للإشعار' }))).listing.id;
  const conv = (await buyer.ok('POST', '/conversations', { listingId: l })).id;
  await buyer.ok('POST', `/conversations/${conv}/messages`, { body: 'لسه موجودة؟' });
  const kinds = sentPushes.map((p) => p.payload.tag);
  assert.ok(kinds.includes(`chat-${conv}`));
  assert.ok(sentPushes.some((p) => p.payload.body === 'لسه موجودة؟'));
  const u = await seller.ok('GET', '/unread');
  assert.ok(u.unreadNotifications >= 1);
  await seller.ok('POST', '/notifications/read');
  assert.equal((await seller.ok('GET', '/unread')).unreadNotifications, 0);
});

test('الترقية من قاعدة نسخة 1 بدون فقدان بيانات', async () => {
  const old = await createPgliteDb();
  // نبني قاعدة v1 حقيقية: نشغّل المخطط، وبعدها نرجّعها لشكل v1
  const wrap1: Db = { query: old.query.bind(old), tx: old.tx.bind(old) };
  await handleApi({ method: 'GET', path: '/health', headers: {} }, wrap1);
  for (const t of ['notifications', 'push_subscriptions', 'settings']) await old.query(`DROP TABLE ${t}`);
  await old.query(`ALTER TABLE deals DROP COLUMN commission_amount, DROP COLUMN commission_rule, DROP COLUMN commission_status,
    DROP COLUMN commission_ref, DROP COLUMN commission_note, DROP COLUMN commission_paid_at`);
  await old.query(`ALTER TABLE listings DROP CONSTRAINT listings_status_check, DROP COLUMN reject_reason`);
  await old.query(`ALTER TABLE listings ADD CONSTRAINT listings_status_check CHECK (status IN ('available','reserved','sold','rented'))`);
  await old.query(`UPDATE broker_meta SET version = 1`);
  await old.query(`INSERT INTO users (id, name, phone, password_hash) VALUES ('usr_old','قديم','+249900000009','x')`);
  // اتصال جديد ← ترقية
  const wrap2: Db = { query: old.query.bind(old), tx: old.tx.bind(old) };
  const r = await handleApi({ method: 'GET', path: '/admin/stats', headers: {} }, wrap2);
  assert.equal(r.status, 401); // اشتغل (محتاج دخول بس)
  const v = await old.query(`SELECT version FROM broker_meta`);
  assert.equal(v[0].version, 2);
  assert.equal((await old.query(`SELECT name FROM users WHERE id = 'usr_old'`))[0].name, 'قديم');
  await old.query(`INSERT INTO settings (key, value) VALUES ('t', '{}')`);
});
