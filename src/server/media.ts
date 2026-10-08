// تخزين الصور والتسجيلات الصوتية: Vercel Blob لو مربوط، وإلا داخل القاعدة (مناسب للتجربة).
import type { Db } from './db';

const MAX_BYTES = 3 * 1024 * 1024; // حد Vercel للطلب 4.5MB، والـ base64 بيزيد الحجم الثلث

const ALLOWED: Record<'image' | 'audio', string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  audio: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/x-m4a'],
};

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/aac': 'aac', 'audio/x-m4a': 'm4a',
};

export class MediaError extends Error {
  status = 400;
}

/** هل الرابط من ملفاتنا؟ (عشان ما حد يحط روابط خارجية في الإعلانات أو الرسائل) */
export function isOurMediaUrl(url: string): boolean {
  if (/^\/api\/media\/fil_[a-f0-9]{16}$/.test(url)) return true;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname.endsWith('.public.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

export function blobEnabled(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export async function storeMedia(db: Db, ownerId: string, kind: 'image' | 'audio', dataUrl: unknown): Promise<string> {
  if (typeof dataUrl !== 'string') throw new MediaError('الملف مفقود');
  const m = /^data:([a-z0-9.+/-]+)(?:;codecs=[^;,]+)?;base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
  if (!m) throw new MediaError('صيغة الملف غير صحيحة');
  const mime = m[1].toLowerCase();
  if (!ALLOWED[kind].includes(mime)) throw new MediaError('نوع الملف غير مسموح');
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length === 0) throw new MediaError('الملف فاضي');
  if (bytes.length > MAX_BYTES) throw new MediaError('الملف أكبر من 3 ميجا');
  if (kind === 'image' && !looksLikeImage(bytes, mime)) throw new MediaError('الملف ما صورة حقيقية');

  const id = `fil_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  if (blobEnabled()) {
    const { put } = await import('@vercel/blob');
    const res = await put(`${kind === 'image' ? 'images' : 'voice'}/${id}.${EXT[mime] || 'bin'}`, bytes, {
      access: 'public',
      contentType: mime,
      addRandomSuffix: true,
    });
    return res.url;
  }
  await db.query(`INSERT INTO media_files (id, owner_id, mime, data) VALUES ($1,$2,$3,$4)`, [id, ownerId, mime, m[2]]);
  return `/api/media/${id}`;
}

export async function readStoredMedia(db: Db, id: string) {
  if (!/^fil_[a-f0-9]{16}$/.test(id)) return null;
  const r = (await db.query(`SELECT mime, data FROM media_files WHERE id = $1`, [id]))[0];
  if (!r) return null;
  return { contentType: r.mime as string, data: new Uint8Array(Buffer.from(r.data, 'base64')) };
}

function looksLikeImage(b: Buffer, mime: string): boolean {
  if (mime === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8;
  if (mime === 'image/png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (mime === 'image/webp') return b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP';
  return false;
}
