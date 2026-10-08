// ضغط الصور في المتصفح قبل الرفع (أسرع على الشبكة الضعيفة وأرخص في التخزين)
import { api } from "./api";

const MAX_SIDE = 1600;

export async function compressImage(file: File): Promise<string> {
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("الصورة دي ما بتفتح — جرّب صورة تانية"));
      i.src = bitmapUrl;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    let q = 0.8;
    let out = canvas.toDataURL("image/jpeg", q);
    while (out.length > 1_400_000 && q > 0.4) {
      q -= 0.15;
      out = canvas.toDataURL("image/jpeg", q);
    }
    return out;
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("تعذر قراءة الملف"));
    r.readAsDataURL(blob);
  });
}

export async function uploadImage(file: File): Promise<string> {
  const dataUrl = await compressImage(file);
  const r = await api<{ url: string }>("/media", { method: "POST", body: { kind: "image", dataUrl } });
  return r.url;
}

export async function uploadVoice(blob: Blob): Promise<string> {
  if (blob.size > 3 * 1024 * 1024) throw new Error("التسجيل طويل شديد — خليه أقصر");
  const dataUrl = await blobToDataUrl(blob);
  const r = await api<{ url: string }>("/media", { method: "POST", body: { kind: "audio", dataUrl } });
  return r.url;
}

/** رفع فيديو مباشرة لـ Vercel Blob (بيشتغل بس لو Blob مربوط) */
export async function uploadVideo(file: File, onProgress?: (pct: number) => void): Promise<string> {
  const { upload } = await import("@vercel/blob/client");
  const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "");
  const res = await upload(`videos/${Date.now()}.${ext}`, file, {
    access: "public",
    handleUploadUrl: "/api/blob",
    onUploadProgress: onProgress ? (e) => onProgress(Math.round(e.percentage)) : undefined,
  });
  return res.url;
}
