/**
 * 要望・バグに付ける画像 (2026-10-14 オーナー「画像送れるようにもしようか」)。端末で縮めてから送る:
 * 長い辺 1600px までの JPEG、1 枚 1MB 以下 (サーバーの上限は server/live/src/feedback-images.ts の MAX_IMAGE_BYTES)
 */
export const MAX_IMAGES = 3;
const MAX_SIDE = 1600;
const MAX_BYTES = 1_000_000;

export interface PickedImage { mime: string; b64: string; url: string; bytes: number }

const blobOf = (c: HTMLCanvasElement, q: number): Promise<Blob | null> => new Promise((r) => c.toBlob(r, "image/jpeg", q));

/** 画像のファイル (貼り付け・選んだ物) を縮めて base64 に。画像でなければ null */
export async function shrinkImage(file: Blob): Promise<PickedImage | null> {
  if (!file.type.startsWith("image/")) return null;
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#000";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  let blob: Blob | null = null;
  for (const q of [0.85, 0.7, 0.55, 0.4]) {
    blob = await blobOf(c, q);
    if (blob && blob.size <= MAX_BYTES) break;
  }
  if (!blob || blob.size > MAX_BYTES) return null;
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { mime: "image/jpeg", b64: btoa(bin), url: URL.createObjectURL(blob), bytes: blob.size };
}

/** 貼り付け (Ctrl+V) の中の画像ファイル */
export function imagesFromClipboard(e: ClipboardEvent): File[] {
  return [...(e.clipboardData?.items ?? [])].filter((x) => x.kind === "file" && x.type.startsWith("image/")).map((x) => x.getAsFile()).filter((f): f is File => !!f);
}
