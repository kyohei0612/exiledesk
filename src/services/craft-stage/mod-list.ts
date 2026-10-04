/**
 * mod-list.ts — クラフトステージの「このベースに付く MOD」一覧の中身 (2026-09-29)
 *
 * オーナー「そのベースに付く MOD 全て、アイテムレベルは無視して、重み付きで。DB (poe2db) にならって。
 * ただ DB は海外向けで見づらいので、UI はシンプルに色や形にこだわって」。
 * 中身は計算機のエンジンの行 (item.cls.pools) そのまま = クラフトステージの抽選と同じ。
 *   - 種類: 普通 / エッセンス / 冒涜 / 異界 (変質した鎖骨)
 *   - 1 行 = 1 系統の MOD。重みは全段の合計、出やすさは同じ種類・同じ側の合計に対する割合
 */
import type { Mod, PatchData } from "../../vendor/poe2htc/engine/types";
import { fillHashes, jaOfMod } from "../htc/mod-text";
import type { StageItem, StageSide } from "./types";
import { allMods, effectiveCls, takenFamilies } from "./stage-core";
import { TAG_STYLE } from "../mods/tag-ja";
import { familyBlocked, fillShares, tierWeight } from "../mods/mod-rules";
import { tierDisplayRanges } from "../mods/stat-scale";

export type ModGroup = "normal" | "rune" | "essence" | "desecrated" | "otherworldly";
export const GROUP_JA: Record<ModGroup, string> = { normal: "普通", rune: "ルーンの特殊 MOD (重みは仮定)", essence: "エッセンス", desecrated: "冒涜", otherworldly: "異界 (変質した鎖骨)" };

export interface ListTier { rank: string; name: string; ilvl: number; weight: number; text: string }
export interface ListRow {
  id: string;
  /** 系統 (URL の mod= で id の代わりに使える) */
  family: string;
  /** 文面 (数値は #) */
  template: string;
  side: StageSide;
  group: ModGroup;
  /** 一番上の段の数値で埋めた文面 */
  text: string;
  tags: string[];
  tiers: ListTier[];
  /** 全段の重みの合計 */
  weight: number;
  /** 一番上の段の MOD レベル */
  topLevel: number;
  /** 同じ種類・同じ側の重みの合計に対する割合 (0〜1)。重みが 0 の種類 (エッセンス) は 0 */
  share: number;
  /** 今のアイテムに付いている / 同じ系統が付いていて付かない */
  on: boolean;
  blocked: boolean;
}

export function modListFor(data: PatchData, item: StageItem): ListRow[] {
  // 普通の置き場は差した特殊 MOD のルーンの MOD 込み (要望 ㉙)。行の種類は "rune"、出やすさは普通と一緒に引くので一緒に割る
  const pools = effectiveCls(item).pools as typeof item.cls.pools & { otherworldly?: { prefixes: readonly string[]; suffixes: readonly string[] } };
  const onIds = new Set(allMods(item).map((m) => m.modId));
  const taken = takenFamilies(data, item);
  const out: ListRow[] = [];
  const groups: Array<[ModGroup, { prefixes: readonly string[]; suffixes: readonly string[] } | undefined]> = [
    ["normal", pools.normal], ["essence", pools.essence], ["desecrated", pools.desecrated], ["otherworldly", pools.otherworldly],
  ];
  for (const [group, pool] of groups) {
    if (!pool) continue;
    for (const side of ["prefix", "suffix"] as const) {
      const mods = (side === "prefix" ? pool.prefixes : pool.suffixes).map((id) => data.mods.get(id)).filter((m): m is Mod => !!m);
      const rows = mods.map((m): ListRow => {
        const ja = jaOfMod(m);
        const n = m.tiers.length;
        // 数値は画面の単位に (1 万分率の 400 → 4%。決まりは services/mods/stat-scale.ts、2026-10-03 に生の値が出ていた)
        const tiers = [...m.tiers].reverse().map((t, i): ListTier => ({ rank: `T${i + 1}`, name: t.name, ilvl: t.ilvl, weight: t.weight, text: fillHashes(ja, tierDisplayRanges(t)) }));
        const weight = tierWeight(m, 0, Infinity); // アイテムレベルは見ない (全部の段)
        const on = onIds.has(m.id);
        return {
          id: m.id, family: m.family, template: ja, side, group, text: tiers[0]?.text ?? ja, tags: [...m.tags], tiers, weight,
          topLevel: n ? m.tiers[n - 1]!.ilvl : 0, share: 0, on, blocked: !on && familyBlocked(m, taken),
        };
      });
      // 割合を普通と一緒に出してから、ルーンの MOD の行を「ルーン」の種類に
      out.push(...fillShares(rows).map((r) => (group === "normal" && data.mods.get(r.id)?.rune ? { ...r, group: "rune" as const } : r)));
    }
  }
  return out;
}

/** タグの日本語と色 (表は services/mods/tag-ja.ts に 1 つ) */
export { TAG_STYLE };
/** 出すタグ (細かすぎる物・重なる物は省く) */
export const shownTags = (tags: readonly string[]): string[] => tags.filter((t) => TAG_STYLE[t]);
