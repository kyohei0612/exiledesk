/**
 * skins.ts — PoE2 で使える PoE1 のスキンの一覧のデータ (?page=skins、SkinsPage.vue。2026-10-25 オーナー「スキン PoE2 で使える PoE1 スキン一覧みたいな奴、DB 調べって話と責任持てませんって話で」)。
 * 元は src/data/mtx-poe1-in-poe2.json (scripts/build-mtx-web.mjs、poe2db の Microtransactions の一覧の英日で裏を取った物)。
 * 絞り込みは種類 (30 近く) をまとめた groups.json の 10 個 (オーナー「8 種類くらいに分類分け、あとはその他で」)。
 * 大きいのでページを開いた時に読む (動的 import)。絵は public/mtx-art/<a>.webp (静的な置き場から返るので 1 日の枠に数えない、サーバー管理人 10-25)
 */
import G from "./groups.json";

export interface SkinGroup { id: string; slug: string; ja: string; en: string }
/** 絞り込みのまとめ (並びはこのまま、その他は最後) */
export const SKIN_GROUPS: SkinGroup[] = [...G.groups, G.other];
const GROUP_OF = new Map<number, SkinGroup>(G.groups.flatMap((g) => g.k.map((k) => [k, g] as const)));
/** 種類が 1 つだけのまとめ (行の種類にもまとめの名前を出す。例 ソーシャルフレーム → ポートレートフレーム) */
const SINGLE = new Set<SkinGroup>(G.groups.filter((g) => g.k.length === 1));
export const groupOf = (k: number): SkinGroup => GROUP_OF.get(k) ?? G.other;

export interface Skin {
  en: string;
  ja: string;
  /** 種類 (日本語はクライアントの種類の名前、英語は poe2db の種類の英語名。英語名の無い種類と、種類が 1 つだけのまとめはまとめの名前) */
  kind: { ja: string; en: string };
  group: SkinGroup;
  /** poe2db のページ (日本語・英語)。一覧は poe2db に載っている物だけ (10-25 オーナー「DB に無ければ表示無くていい」) */
  url: { ja: string; en: string };
  /** 絵 (無ければ null) */
  art: string | null;
}

let cache: Promise<Skin[]> | null = null;
export function loadSkins(): Promise<Skin[]> {
  cache ??= import("../../data/mtx-poe1-in-poe2.json").then((m) => {
    const d = (m.default ?? m) as unknown as {
      url: { ja: string; en: string };
      kinds: Record<string, { ja: string | null; en: string | null }>;
      items: Array<{ en: string; ja: string; k: number; slug: string; a?: number }>;
    };
    return d.items.map((x): Skin => {
      const group = groupOf(x.k);
      const k = d.kinds[x.k];
      return {
        en: x.en,
        ja: x.ja,
        kind: SINGLE.has(group) ? { ja: group.ja, en: group.en } : { ja: k?.ja ?? group.ja, en: k?.en ?? group.en },
        group,
        url: { ja: d.url.ja + x.slug, en: d.url.en + x.slug },
        art: x.a != null ? `/mtx-art/${x.a}.webp` : null,
      };
    });
  });
  return cache;
}
