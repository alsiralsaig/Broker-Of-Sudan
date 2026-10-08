// الإشعارات: سجل داخل التطبيق + Web Push للأجهزة (حتى لو التطبيق مقفول)
import type { Db } from './db';

interface NotifyInput {
  kind: string;
  title: string;
  body?: string;
  url?: string;
  /** للرسائل: إشعار push بس بدون حفظ في السجل */
  pushOnly?: boolean;
  tag?: string;
}

let vapidCache: { publicKey: string; privateKey: string } | null = null;

/** مفاتيح VAPID: من المتغيرات، أو بتتولّد مرة واحدة وتتحفظ في القاعدة */
export async function getVapid(db: Db) {
  if (vapidCache) return vapidCache;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    vapidCache = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    return vapidCache;
  }
  const row = (await db.query(`SELECT value FROM settings WHERE key = 'vapid'`))[0];
  if (row?.value) {
    vapidCache = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    return vapidCache!;
  }
  const webpush = (await import('web-push')).default;
  const keys = webpush.generateVAPIDKeys();
  await db.query(
    `INSERT INTO settings (key, value) VALUES ('vapid', $1::jsonb) ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify(keys)]
  );
  const again = (await db.query(`SELECT value FROM settings WHERE key = 'vapid'`))[0];
  vapidCache = typeof again.value === 'string' ? JSON.parse(again.value) : again.value;
  return vapidCache!;
}

/** للاختبارات: تجميع الإشعارات المرسلة بدل إرسالها */
export const sentPushes: { userId: string; payload: any }[] = [];

export async function notify(db: Db, userIds: (string | null | undefined)[], n: NotifyInput) {
  const ids = Array.from(new Set(userIds.filter(Boolean) as string[]));
  if (!ids.length) return;
  const url = n.url || '/';
  if (!n.pushOnly) {
    for (const uid of ids) {
      await db.query(
        `INSERT INTO notifications (id, user_id, kind, title, body, url) VALUES ($1,$2,$3,$4,$5,$6)`,
        [`ntf_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`, uid, n.kind, n.title, n.body || '', url]
      );
    }
  }
  const subs = await db.query(
    `SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1::text[])`,
    [ids]
  );
  if (!subs.length) return;
  const payload = { title: n.title, body: n.body || '', url, tag: n.tag || n.kind };
  if (process.env.NODE_ENV === 'test') {
    for (const s of subs) sentPushes.push({ userId: s.user_id, payload });
    return;
  }
  try {
    const webpush = (await import('web-push')).default;
    const v = await getVapid(db);
    webpush.setVapidDetails('mailto:admin@broker-of-sudan.app', v.publicKey, v.privateKey);
    const body = JSON.stringify(payload);
    await Promise.race([
      Promise.allSettled(
        subs.map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              body,
              { TTL: 60 * 60 * 24, urgency: 'high' }
            );
          } catch (e: any) {
            // الاشتراك انتهى (المستخدم مسح التطبيق أو قفل الإذن)
            if (e?.statusCode === 404 || e?.statusCode === 410) {
              await db.query(`DELETE FROM push_subscriptions WHERE id = $1`, [s.id]);
            }
          }
        })
      ),
      new Promise((r) => setTimeout(r, 5000)),
    ]);
  } catch (e) {
    console.error('[push] failed', e);
  }
}

export async function adminIds(db: Db): Promise<string[]> {
  return (await db.query<{ id: string }>(`SELECT id FROM users WHERE role = 'admin' AND active`)).map((r) => r.id);
}
