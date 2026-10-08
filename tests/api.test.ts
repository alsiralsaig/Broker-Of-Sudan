// اختبارات الـ API على Postgres حقيقي داخل الذاكرة (PGlite).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createPgliteDb, type Db } from '../src/server/db';
import { handleApi } from '../src/server/app';

(process.env as Record<string, string>).NODE_ENV = 'test';
process.env.ADMIN_PHONE = '0911111111';
process.env.ADMIN_PASSWORD = 'admin-pass-1';
delete process.env.BLOB_READ_WRITE_TOKEN;

let db: Db;
before(async () => { db = await createPgliteDb(); });

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

class Client {
  cookie = '';
  async call(method: string, path: string, body?: any, extra: Record<string, string> = {}, query?: Record<string, string>) {
    const res = await handleApi(
      { method, path, body, query, ip: '1.2.3.4', headers: { cookie: this.cookie, 'x-bs-client': '1', ...extra } },
      db
    );
    for (const c of res.cookies || []) {
      const v = c.split(';')[0];
      this.cookie = v.endsWith('=') ? '' : v;
    }
    return res;
  }
  async ok(method: string, path: string, body?: any, query?: Record<string, string>) {
    const r = await this.call(method, path, body, {}, query);
    assert.equal(r.status, 200, `${method} ${path} -> ${r.status} ${JSON.stringify(r.json)}`);
    return r.json as any;
  }
}

const seller = new Client();
const buyer = new Client();
const buyer2 = new Client();
const admin = new Client();
const anon = new Client();
let listingId = '';
let convId = '';
let conv2Id = '';
let imageUrl = '';

const carBody = () => ({
  category: 'car', dealType: 'sale', title: 'تويوتا كورولا 2018', description: 'نظيفة جداً', price: 25000000,
  city: 'الخرطوم', location: 'الرياض', carMake: 'تويوتا', carModel: 'كورولا', carYear: 2018, carMileageKm: 90000,
  carCondition: 'مستعملة', carTransmission: 'أوتوماتيك', media: [{ type: 'image', url: imageUrl }],
});

test('التسجيل والدخول وكلمة السر', async () => {
  const r = await seller.ok('POST', '/auth/register', { name: 'أحمد البائع', phone: '0912345678', password: 'seller-pass' });
  assert.equal(r.user.phone, '+249912345678');
  assert.equal(r.user.role, 'user');
  await buyer.ok('POST', '/auth/register', { name: 'محمد المشتري', phone: '0922222222', password: 'buyer-pass' });
  await buyer2.ok('POST', '/auth/register', { name: 'علي', phone: '0933333333', password: 'buyer2-pass' });

  const dup = await anon.call('POST', '/auth/register', { name: 'تاني', phone: '+249912345678', password: 'xxxxxxx1' });
  assert.equal(dup.status, 409);
  const weak = await anon.call('POST', '/auth/register', { name: 'ضعيف', phone: '0944444444', password: '123' });
  assert.equal(weak.status, 400);

  const bad = await anon.call('POST', '/auth/login', { phone: '0912345678', password: 'wrong-pass' });
  assert.equal(bad.status, 401);
  const a = await admin.ok('POST', '/auth/login', { phone: '0911111111', password: 'admin-pass-1' });
  assert.equal(a.user.role, 'admin');
  assert.equal((await anon.ok('GET', '/auth/me')).user, null);
});

test('حماية CSRF: طلب معدِّل بدون الترويسة مرفوض', async () => {
  const r = await handleApi({ method: 'POST', path: '/auth/logout', headers: { cookie: seller.cookie } }, db);
  assert.equal(r.status, 403);
});

test('رفع الصور: صورة حقيقية بس', async () => {
  assert.equal((await anon.call('POST', '/media', { kind: 'image', dataUrl: PNG })).status, 401);
  const fake = await seller.call('POST', '/media', { kind: 'image', dataUrl: 'data:image/png;base64,' + Buffer.from('<script>').toString('base64') });
  assert.equal(fake.status, 400);
  const html = await seller.call('POST', '/media', { kind: 'image', dataUrl: 'data:text/html;base64,PGgxPg==' });
  assert.equal(html.status, 400);
  const r = await seller.ok('POST', '/media', { kind: 'image', dataUrl: PNG });
  assert.match(r.url, /^\/api\/media\/fil_/);
  imageUrl = r.url;
  const f = await anon.call('GET', imageUrl.replace('/api', ''));
  assert.equal(f.status, 200);
  assert.equal(f.raw?.contentType, 'image/png');
});

test('الإعلانات: إنشاء وتصفّح وبحث وصلاحيات', async () => {
  assert.equal((await anon.call('POST', '/listings', carBody())).status, 401);
  const ext = await seller.call('POST', '/listings', { ...carBody(), media: [{ type: 'image', url: 'https://evil.com/x.jpg' }] });
  assert.equal(ext.status, 400);

  const r = await seller.ok('POST', '/listings', carBody());
  listingId = r.listing.id;
  assert.equal(r.listing.cover, imageUrl);
  await seller.ok('POST', '/listings', {
    category: 'property', dealType: 'rent', title: 'شقة في بحري', price: 800000, city: 'بحري', propertyType: 'شقة', propertyRooms: 3,
  });

  const all = await anon.ok('GET', '/listings');
  assert.equal(all.listings.length, 2);
  const cars = await anon.ok('GET', '/listings', undefined, { category: 'car' });
  assert.equal(cars.listings.length, 1);
  const search = await anon.ok('GET', '/listings', undefined, { q: 'كورولا' });
  assert.equal(search.listings[0].id, listingId);
  const cheap = await anon.ok('GET', '/listings', undefined, { maxPrice: '1000000' });
  assert.equal(cheap.listings.length, 1);
  assert.equal((await anon.ok('GET', '/listings', undefined, { q: '%' })).listings.length, 0);
  const cities = await anon.ok('GET', '/listings/cities');
  assert.deepEqual(cities.cities.sort(), ['الخرطوم', 'بحري'].sort());

  // صفحة الإعلان ما بتكشف رقم البائع
  const d = await anon.ok('GET', `/listings/${listingId}`);
  assert.equal(JSON.stringify(d).includes('912345678'), false);
  assert.equal(d.seller.name, 'أحمد البائع');

  // تعديل: صاحبه بس (أو المدير)
  assert.equal((await buyer.call('PATCH', `/listings/${listingId}`, carBody())).status, 403);
  const upd = await seller.ok('PATCH', `/listings/${listingId}`, { ...carBody(), price: 24000000 });
  assert.equal(upd.listing.price, 24000000);
  assert.equal((await buyer.call('DELETE', `/listings/${listingId}`)).status, 403);
  const mine = await seller.ok('GET', '/my/listings');
  assert.equal(mine.listings.length, 2);
});

test('المحادثة والمفاصلة: خصوصية وعروض', async () => {
  assert.equal((await seller.call('POST', '/conversations', { listingId })).status, 400); // إعلانه
  convId = (await buyer.ok('POST', '/conversations', { listingId })).id;
  assert.equal((await buyer.ok('POST', '/conversations', { listingId })).id, convId); // نفس المحادثة
  conv2Id = (await buyer2.ok('POST', '/conversations', { listingId })).id;

  await buyer.ok('POST', `/conversations/${convId}/messages`, { body: 'السلام عليكم، العربية لسه موجودة؟' });
  // طرف تالت ما بيشوف المحادثة
  assert.equal((await buyer2.call('GET', `/conversations/${convId}`)).status, 403);
  assert.equal((await anon.call('GET', `/conversations/${convId}`)).status, 401);

  const unread = await seller.ok('GET', '/unread');
  assert.equal(unread.count, 2);
  const view = await seller.ok('GET', `/conversations/${convId}`);
  assert.equal(view.conversation.side, 'seller');
  assert.equal(view.conversation.otherPhone, null); // الرقم مخفي قبل الاتفاق
  assert.equal((await seller.ok('GET', '/unread')).count, 1);

  await buyer.ok('POST', `/conversations/${convId}/offer`, { price: 22000000 });
  // ما بيقبل عرضه
  assert.equal((await buyer.call('POST', `/conversations/${convId}/accept`)).status, 400);
  await seller.ok('POST', `/conversations/${convId}/offer`, { price: 23000000 });
  await buyer2.ok('POST', `/conversations/${conv2Id}/offer`, { price: 22500000 });

  const list = await buyer.ok('GET', '/conversations');
  assert.equal(list.conversations[0].lastMessage.type, 'offer');
  assert.equal(list.conversations[0].unread, 1);

  // صوت: رابط خارجي مرفوض
  const v = await buyer.call('POST', `/conversations/${convId}/messages`, { type: 'voice', voiceUrl: 'https://evil.com/a.webm' });
  assert.equal(v.status, 400);
  const after = new Date(Date.now() - 1000).toISOString();
  const inc = await buyer.ok('GET', `/conversations/${convId}`, undefined, { after });
  assert.ok(inc.messages.length >= 1);
});

test('القبول بيحجز الإعلان ويكشف الأرقام، والتأكيد بيقفله', async () => {
  await buyer.ok('POST', `/conversations/${convId}/accept`);
  const l = await anon.ok('GET', `/listings/${listingId}`);
  assert.equal(l.listing.status, 'reserved');
  // ما بيظهر في التصفح
  assert.equal((await anon.ok('GET', '/listings', undefined, { category: 'car' })).listings.length, 0);
  // المشتري التاني ما بيقدر يقبل أو يفاصل
  assert.equal((await seller.call('POST', `/conversations/${conv2Id}/accept`)).status, 409);
  assert.equal((await buyer2.call('POST', `/conversations/${conv2Id}/offer`, { price: 1 })).status, 400);

  const vb = await buyer.ok('GET', `/conversations/${convId}`);
  assert.equal(vb.conversation.otherPhone, '+249912345678');
  assert.equal(vb.deal.status, 'agreed');
  assert.equal(vb.deal.price, 23000000);
  const v2 = await buyer2.ok('GET', `/conversations/${conv2Id}`);
  assert.equal(v2.conversation.otherPhone, null);

  // ما بيتمسح وعليه صفقة
  assert.equal((await seller.call('DELETE', `/listings/${listingId}`)).status, 400);

  // إلغاء ← يرجع متاح
  await buyer.ok('POST', `/deals/${vb.deal.id}/cancel`, { reason: 'ما اتفقنا على التسليم' });
  assert.equal((await anon.ok('GET', `/listings/${listingId}`)).listing.status, 'available');
  assert.equal((await buyer.ok('GET', `/conversations/${convId}`)).conversation.otherPhone, null);

  // اتفاق جديد مع المشتري التاني ثم تأكيد
  await seller.ok('POST', `/conversations/${conv2Id}/accept`);
  const d2 = (await seller.ok('GET', `/conversations/${conv2Id}`)).deal;
  assert.equal(d2.price, 22500000);
  assert.equal((await buyer2.call('POST', `/deals/${d2.id}/complete`)).status, 403); // البائع بس
  await seller.ok('POST', `/deals/${d2.id}/complete`);
  const done = await anon.ok('GET', `/listings/${listingId}`);
  assert.equal(done.listing.status, 'sold');
  assert.equal(done.seller.dealsCount, 1);
  assert.equal((await buyer.call('POST', `/conversations/${convId}/messages`, { body: 'سلام' })).status, 400);
  assert.equal((await seller.call('PATCH', `/listings/${listingId}`, carBody())).status, 400);
});

test('المدير يقدر يمسح أي إعلان، وتغيير كلمة السر يطرد الجلسات القديمة', async () => {
  const mine = await seller.ok('GET', '/my/listings');
  const prop = mine.listings.find((l: any) => l.category === 'property');
  await admin.ok('DELETE', `/listings/${prop.id}`);

  const old = seller.cookie;
  await seller.ok('POST', '/auth/password', { currentPassword: 'seller-pass', newPassword: 'new-seller-pass' });
  const stale = new Client();
  stale.cookie = old;
  assert.equal((await stale.ok('GET', '/auth/me')).user, null);
  assert.equal((await seller.ok('GET', '/auth/me')).user.name, 'أحمد البائع');
});

test('قفل الحساب بعد 5 محاولات غلط', async () => {
  const c = new Client();
  for (let i = 0; i < 5; i++) await c.call('POST', '/auth/login', { phone: '0933333333', password: 'nope-nope' });
  const r = await c.call('POST', '/auth/login', { phone: '0933333333', password: 'buyer2-pass' });
  assert.equal(r.status, 429);
});

test('حماية: ما بيشتغل على قاعدة مشروع تاني', async () => {
  const other = await createPgliteDb();
  await other.query(`CREATE TABLE users (id TEXT PRIMARY KEY, phone TEXT)`);
  await other.query(`CREATE TABLE schema_meta (id INT PRIMARY KEY, version INT)`);
  const r = await handleApi({ method: 'GET', path: '/listings', headers: {} }, other);
  assert.equal(r.status, 503);
  const t = await other.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`);
  assert.equal(t[0].n, 2); // ما اتعمل أي جدول
});
