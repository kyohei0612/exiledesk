/**
 * skins.ts — PoE2 で使える PoE1 のスキンの一覧のデータ (?page=skins、SkinsPage.vue。2026-10-25 オーナー「スキン PoE2 で使える PoE1 スキン一覧みたいな奴、DB 調べって話と責任持てませんって話で」)。
 * 元は src/data/mtx-poe1-in-poe2.json (scripts/build-mtx-web.mjs、poe2db の Microtransactions の一覧の英日で裏を取った物)。
 * 大きいのでページを開いた時に読む (動的 import)。絵は public/mtx-art/<a>.webp (静的な置き場から返るので 1 日の枠に数えない、サーバー管理人 10-25)
 */
export interface Skin {
  en: string;
  ja: string;
  /** 種類 (クライアントの MicrotransactionCategory の番号、-1 = 無し) */
  k: number;
  /** poe2db のページ (日本語・英語)。poe2db の一覧に無い物は null */
  url: { ja: string; en: string } | null;
  /** 絵 (無ければ null) */
  art: string | null;
}
export interface SkinKind {
  k: number;
  ja: string | null;
  /** poe2db の一覧の種類の英語名。無い種類は null (推測で訳さない、英語の画面では「Other」にまとめる) */
  en: string | null;
}
export interface SkinList { items: Skin[]; kinds: SkinKind[] }

let cache: Promise<SkinList> | null = null;
export function loadSkins(): Promise<SkinList> {
  cache ??= import("../../data/mtx-poe1-in-poe2.json").then((m) => {
    const d = (m.default ?? m) as unknown as {
      url: { ja: string; en: string };
      kinds: Record<string, { ja: string | null; en: string | null }>;
      items: Array<{ en: string; ja: string; k: number; slug: string | null; a?: number }>;
    };
    const items = d.items.map((x): Skin => ({
      en: x.en,
      ja: x.ja,
      k: x.k,
      url: x.slug ? { ja: d.url.ja + x.slug, en: d.url.en + x.slug } : null,
      art: x.a != null ? `/mtx-art/${x.a}.webp` : null,
    }));
    const kinds = Object.entries(d.kinds).map(([k, v]) => ({ k: +k, ja: v.ja, en: v.en }));
    return { items, kinds };
  });
  return cache;
}
