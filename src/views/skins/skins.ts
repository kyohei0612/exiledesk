/**
 * skins.ts — PoE2 で使える PoE1 のスキンの一覧のデータ (?page=skins、SkinsPage.vue。2026-10-25 オーナー「スキン PoE2 で使える PoE1 スキン一覧みたいな奴、DB 調べって話と責任持てませんって話で」)。
 * 元は src/data/mtx-poe1-in-poe2.json (scripts/build-mtx-web.mjs、poe2db の Microtransactions の一覧の英日で裏を取った物、PoE2 で出た物は除く)。
 * 絞り込みは種類 (30 近く) をまとめた groups.json の 11 個 (オーナー「8 種類くらいに分類分け、あとはその他で」+「一式」)。
 * 一式 (同じ名前の頭・同じシリーズの部品) は 1 枚のカードにまとめ、「一式」と「すべて」に出す。部品は各ジャンルに今までどおり (オーナー 10-25「一式は一式で、他のジャンルはあるか」)。
 * 大きいのでページを開いた時に読む (動的 import)。絵は public/mtx-art/<a>.webp (静的な置き場から返るので 1 日の枠に数えない、サーバー管理人 10-25)
 */
import G from "./groups.json";

export interface SkinGroup { id: string; slug: string; ja: string; en: string }
/** 絞り込みのまとめ (一式が先頭、並びはこのまま、その他は最後) */
export const SKIN_GROUPS: SkinGroup[] = [G.set, ...G.groups, G.other];
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
  /** 入っている一式 (無ければ null) */
  set: SkinSet | null;
}
/** 一式のカード (絵と飛び先は代表の部品 = 鎧 → 背面 → 初めの物。poe2db に一式のページは無い) */
export interface SkinSet {
  en: string;
  ja: string;
  main: Skin;
  parts: Skin[];
}
export interface SkinData { items: Skin[]; sets: SkinSet[] }

let cache: Promise<SkinData> | null = null;
export function loadSkins(): Promise<SkinData> {
  cache ??= import("../../data/mtx-poe1-in-poe2.json").then((m) => {
    const d = (m.default ?? m) as unknown as {
      url: { ja: string; en: string };
      kinds: Record<string, { ja: string | null; en: string | null }>;
      sets: Array<{ en: string; ja: string; main: number }>;
      items: Array<{ en: string; ja: string; k: number; slug: string; a?: number; s?: number }>;
    };
    const items = d.items.map((x): Skin => {
      const group = groupOf(x.k);
      const k = d.kinds[x.k];
      return {
        en: x.en,
        ja: x.ja,
        kind: SINGLE.has(group) ? { ja: group.ja, en: group.en } : { ja: k?.ja ?? group.ja, en: k?.en ?? group.en },
        group,
        url: { ja: d.url.ja + x.slug, en: d.url.en + x.slug },
        art: x.a != null ? `/mtx-art/${x.a}.webp` : null,
        set: null,
      };
    });
    const sets = d.sets.map((s): SkinSet => ({ en: s.en, ja: s.ja, main: items[s.main]!, parts: [] }));
    d.items.forEach((x, i) => {
      if (x.s == null) return;
      items[i]!.set = sets[x.s]!;
      sets[x.s]!.parts.push(items[i]!);
    });
    return { items, sets };
  });
  return cache;
}
