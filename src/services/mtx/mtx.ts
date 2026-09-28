/**
 * mtx.ts — スキン (マイクロトランザクション) の一覧 (2026-09-29)
 *
 * 中身は scripts/build-mtx-from-client.mjs が PoE2 のクライアントから作る mtx.json (PoE1 で使える物だけ)。
 * p のビット: 1 = PoE1 で使える / 2 = PoE2 で使える (MtxTypes の名前の無い列 19 / 20 番)。
 * 1.5 MB あるので画面を開いた時に読む (動的 import)。
 */
export interface MtxItem {
  /** MtxTypes の行番号 (絵のファイル名) */
  i: number;
  en: string;
  ja: string;
  /** 説明 (日本語) */
  d: string;
  /** 分類 (MicrotransactionCategory の行番号。-1 = 分類なし) */
  c: number;
  /** パック / シリーズ (ShopTag の日本語名) */
  t: string;
  p: number;
  /** 絵 (public/mtx-art/<a>.webp)。無ければ絵なし */
  a?: number;
}
export interface MtxData { generated: string; cats: Record<string, string>; items: MtxItem[] }

let cache: Promise<MtxData> | null = null;
export function loadMtx(): Promise<MtxData> {
  cache ??= import("./mtx.json").then((m) => (m.default ?? m) as unknown as MtxData);
  return cache;
}
export const usableInPoe2 = (x: MtxItem): boolean => (x.p & 2) !== 0;
export const artOf = (x: MtxItem): string | null => (x.a != null ? `/mtx-art/${x.a}.webp` : null);
/** poe2db の日本語ページ (英語名の空白を _ に、アポストロフィ等を除く。例 Onyx Oblivion Wings → Onyx_Oblivion_Wings) */
export const poe2dbUrl = (x: MtxItem): string => `https://poe2db.tw/jp/${x.en.replace(/['’:,!?.]/g, "").trim().replace(/\s+/g, "_")}`;
