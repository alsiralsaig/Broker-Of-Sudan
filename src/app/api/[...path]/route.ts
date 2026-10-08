// كل طلبات ‎/api/*‎ بتمر على موجّه واحد في src/server/app.ts
import { handleApi } from '@/server/app';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(req: Request, ctx: { params: { path: string[] } }) {
  const url = new URL(req.url);
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
  let body: unknown;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const text = await req.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        return Response.json({ error: 'صيغة الطلب غير صحيحة' }, { status: 400 });
      }
    }
  }
  const res = await handleApi({
    method: req.method,
    path: '/' + (ctx.params.path || []).join('/'),
    query: Object.fromEntries(url.searchParams),
    headers,
    body,
    ip: (headers['x-forwarded-for'] || '').split(',')[0].trim() || headers['x-real-ip'],
  });
  const out = new Headers(res.headers || {});
  for (const c of res.cookies || []) out.append('Set-Cookie', c);
  if (res.raw) {
    out.set('Content-Type', res.raw.contentType);
    return new Response(res.raw.data as unknown as BodyInit, { status: res.status, headers: out });
  }
  out.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(res.json ?? null), { status: res.status, headers: out });
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE, handle as PUT };
