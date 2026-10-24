/**
 * skins.ts — PoE2 で使える PoE1 のスキンの一覧 (?page=skins、SkinsPage.vue。2026-10-25 オーナー「スキン PoE2 で使える PoE1 スキン一覧みたいな奴、DB 調べって話と責任持てませんって話で」)。
 * 今は仮に src/services/mtx/mtx.json (アプリの一覧、p の 2 = PoE2 で使える) から。ジン部長が poe2db で裏を取った JSON が届いたら読む先を替える。
 * 大きいのでページを開いた時に読む (動的 import)
 */
export interface Skin {
  en: string;
  ja: string;
  /** 分類 (無ければ null)。en が無い間は ja を出す (分類の英語は推測で付けない) */
  cat: { ja: string; en: string | null } | null;
  /** poe2db のページ (日本語・英語) */
  url: { ja: string; en: string };
}

/** poe2db のページ (英語名の空白を _ に、アポストロフィ等を除く。例 Onyx Oblivion Wings → /jp/Onyx_Oblivion_Wings) */
const poe2db = (lang: "jp" | "us", en: string): string => `https://poe2db.tw/${lang}/${en.replace(/['’:,!?.]/g, "").trim().replace(/\s+/g, "_")}`;

let cache: Promise<Skin[]> | null = null;
export function loadSkins(): Promise<Skin[]> {
  cache ??= import("../services/mtx/mtx.json").then((m) => {
    const d = (m.default ?? m) as unknown as { cats: Record<string, string>; items: Array<{ en: string; ja: string; c: number; p: number }> };
    return d.items
      .filter((x) => (x.p & 2) !== 0)
      .map((x) => ({ en: x.en, ja: x.ja, cat: d.cats[x.c] ? { ja: d.cats[x.c]!, en: null } : null, url: { ja: poe2db("jp", x.en), en: poe2db("us", x.en) } }));
  });
  return cache;
}
