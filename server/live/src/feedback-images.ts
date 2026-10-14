/**
 * 要望・バグに付いた画像 (2026-10-14 オーナー「画像送れるようにもしようか、一応指示できるし、こっちからその画像下さいみたいな」)。
 *   POST /feedback の images: [{ mime, b64 }] (送る時に一緒に)
 *   POST /feedback/<id>/images { uid, images, text? } … 後から足す (返事で「画像を下さい」と頼んだ時)。送った端末 (context.uid が同じ) だけ
 *   GET  /feedback/image/<画像の id>?key= … オーナー用
 * 中身は D1 の fb_images (KV は増やさない)。端末で縮めてから送る (長い辺 1600px の JPEG)。90 日で消す
 */
import type { Fetch } from "./types";

export const MAX_IMAGES = 3;
/** 1 枚の上限 (縮めた後。D1 の 1 行は 2MB まで) */
export const MAX_IMAGE_BYTES = 1_200_000;
const MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const KEEP_DAYS = 90;
export const IMAGE_ID_RE = /^[a-f0-9]{12}$/;

export interface ImageIn { mime: string; bytes: Uint8Array }

/** 届いた images を確かめる (無ければ空)。形が違えば理由 */
export function parseImages(raw: unknown): { ok: true; images: ImageIn[] } | { ok: false; why: string } {
  if (raw == null) return { ok: true, images: [] };
  if (!Array.isArray(raw)) return { ok: false, why: "images は配列" };
  if (raw.length > MAX_IMAGES) return { ok: false, why: `画像は ${MAX_IMAGES} 枚まで` };
  const out: ImageIn[] = [];
  for (const x of raw) {
    const mime = (x as { mime?: unknown })?.mime, b64 = (x as { b64?: unknown })?.b64;
    if (typeof mime !== "string" || !MIMES.has(mime) || typeof b64 !== "string") return { ok: false, why: "画像の形が違う" };
    if (b64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 8) return { ok: false, why: "画像が大きすぎる" };
    let bin: string;
    try { bin = atob(b64); } catch { return { ok: false, why: "画像の形が違う" }; }
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    out.push({ mime, bytes });
  }
  return { ok: true, images: out };
}

/** D1 に置いて画像の id を返す */
export async function saveImages(db: D1Database, fbId: string, images: readonly ImageIn[], now = Date.now()): Promise<string[]> {
  const ids: string[] = [];
  for (const im of images) {
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    await db.prepare("INSERT INTO fb_images (id, fb_id, at, mime, data) VALUES (?, ?, ?, ?, ?)").bind(id, fbId, now, im.mime, im.bytes).run();
    ids.push(id);
  }
  return ids;
}

export async function getImage(db: D1Database, id: string): Promise<{ mime: string; data: ArrayBuffer } | null> {
  const r = await db.prepare("SELECT mime, data FROM fb_images WHERE id = ?").bind(id).first<{ mime: string; data: ArrayBuffer | number[] }>();
  if (!r) return null;
  return { mime: r.mime, data: Array.isArray(r.data) ? new Uint8Array(r.data).buffer : r.data };
}

/** 90 日より前の画像を消す (毎朝) */
export async function pruneImages(db: D1Database, now = Date.now()): Promise<void> {
  await db.prepare("DELETE FROM fb_images WHERE at < ?").bind(now - KEEP_DAYS * 86400e3).run();
}

const extOf = (mime: string): string => (mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg");

/** Discord の webhook の form に画像を足す (files[n]) */
export function appendImages(form: FormData, images: readonly ImageIn[], fbId: string, from = 1): void {
  images.forEach((im, i) => form.append(`files[${from + i}]`, new Blob([im.bytes], { type: im.mime }), `feedback-${fbId}-${i + 1}.${extOf(im.mime)}`));
}

/** 後から足された画像を Discord に流す */
export async function notifyImagesDiscord(webhook: string, fbId: string, text: string, images: readonly ImageIn[], fetchFn: Fetch): Promise<boolean> {
  try {
    const form = new FormData();
    form.append("payload_json", JSON.stringify({ content: `**🖼 画像が届きました** · id ${fbId}${text ? `\n${text.slice(0, 1200)}` : ""}`, allowed_mentions: { parse: [] } }));
    appendImages(form, images, fbId, 0);
    const r = await fetchFn(webhook, { method: "POST", body: form });
    return r.ok;
  } catch { return false; }
}
