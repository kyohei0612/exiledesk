/**
 * share.ts — JSON を縮めて URL に乗せる道具と、X に投稿する画面 (シミュレーターのレシピの URL・スパムシミュの運試しの X シェアが使う)。
 * もとはエミュの工程の共有 (#share=、2026-10-12) の物。工程の共有は 2026-10-28 オーナー「工程に関してはシミュのレシピで統一のため削除エミュのシェアはカオススパム運試しのみ」で消した。
 * 縮めた物は URL の # に乗せる (# はサーバーに送られないので、サーバーも KV も使わない)。
 */

const toB64url = (u8: Uint8Array): string => {
  let bin = "";
  for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode(...u8.subarray(i, i + 8192));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
};
async function pipe(u8: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([u8 as BlobPart]).stream().pipeThrough(t)).arrayBuffer());
}

/** JSON に出来る物 → 縮めた文字 (deflate + base64url)。シミュレーターのレシピの URL (views/simulator/recipe-share.ts)・スパムの運試しのシェアで使う */
export async function packJson(v: unknown): Promise<string> {
  return toB64url(await pipe(new TextEncoder().encode(JSON.stringify(v)), new CompressionStream("deflate-raw")));
}
/** 縮めた文字 → JSON の中身 (読めなければ例外) */
export async function unpackJson(code: string): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await pipe(fromB64url(code), new DecompressionStream("deflate-raw"))));
}
/** X に投稿する画面。text は投稿の文 */
export function xIntentUrl(url: string, text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}
