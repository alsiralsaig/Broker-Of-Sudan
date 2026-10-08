// رفع الفيديو مباشرة من المتصفح لـ Vercel Blob (بدون ما يعدّي على السيرفر — حد 4.5MB)
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { userFromCookie } from '@/server/app';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json({ error: 'رفع الفيديو غير مفعّل — اربط Vercel Blob' }, { status: 503 });
  }
  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        const user = await userFromCookie(req.headers.get('cookie') || undefined);
        if (!user) throw new Error('لازم تسجّل دخول أولاً');
        return {
          allowedContentTypes: ['video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp'],
          maximumSizeInBytes: 50 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ uid: user.id }),
        };
      },
      onUploadCompleted: async () => {},
    });
    return Response.json(result);
  } catch (e: any) {
    return Response.json({ error: e?.message || 'تعذر الرفع' }, { status: 400 });
  }
}
