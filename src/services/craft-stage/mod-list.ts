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
import { allMods, familyKeys } from "./stage-core";

export type ModGroup = "normal" | "essence" | "desecrated" | "otherworldly";
export const GROUP_JA: Record<ModGroup, string> = { normal: "普通", essence: "エッセンス", desecrated: "冒涜", otherworldly: "異界 (変質した鎖骨)" };

export interface ListTier { rank: string; name: string; ilvl: number; weight: number; text: string }
export interface ListRow {
  id: string;
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
  const pools = item.cls.pools as typeof item.cls.pools & { otherworldly?: { prefixes: readonly string[]; suffixes: readonly string[] } };
  const onIds = new Set(allMods(item).map((m) => m.modId));
  const taken = new Set(allMods(item).flatMap((m) => { const md = data.mods.get(m.modId); return md ? familyKeys(md) : [m.family]; }));
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
        const tiers = [...m.tiers].reverse().map((t, i): ListTier => ({ rank: `T${i + 1}`, name: t.name, ilvl: t.ilvl, weight: t.weight, text: fillHashes(ja, t.ranges as number[][]) }));
        const weight = m.tiers.reduce((a, t) => a + t.weight, 0);
        const on = onIds.has(m.id);
        return {
          id: m.id, side, group, text: tiers[0]?.text ?? ja, tags: [...m.tags], tiers, weight,
          topLevel: n ? m.tiers[n - 1]!.ilvl : 0, share: 0, on, blocked: !on && familyKeys(m).some((f) => taken.has(f)),
        };
      });
      const total = rows.reduce((a, r) => a + r.weight, 0);
      for (const r of rows) r.share = total ? r.weight / total : 0;
      out.push(...rows);
    }
  }
  return out;
}

/** タグの日本語と色 (ゲームの色に寄せる: 火 = 赤、冷気 = 青、雷 = 黄、混沌 = 紫) */
export const TAG_STYLE: Record<string, { ja: string; cls: string }> = {
  life: { ja: "ライフ", cls: "bg-rose-500/20 text-rose-200" },
  mana: { ja: "マナ", cls: "bg-blue-500/20 text-blue-200" },
  defences: { ja: "防御", cls: "bg-slate-400/20 text-slate-200" },
  armour: { ja: "アーマー", cls: "bg-stone-400/20 text-stone-200" },
  evasion: { ja: "回避", cls: "bg-lime-500/20 text-lime-200" },
  energy_shield: { ja: "ES", cls: "bg-cyan-500/20 text-cyan-200" },
  damage: { ja: "ダメージ", cls: "bg-orange-500/20 text-orange-200" },
  physical: { ja: "物理", cls: "bg-zinc-400/20 text-zinc-200" },
  elemental: { ja: "元素", cls: "bg-teal-500/20 text-teal-200" },
  fire: { ja: "火", cls: "bg-red-600/25 text-red-200" },
  cold: { ja: "冷気", cls: "bg-sky-500/25 text-sky-200" },
  lightning: { ja: "雷", cls: "bg-yellow-400/25 text-yellow-100" },
  chaos: { ja: "混沌", cls: "bg-fuchsia-600/25 text-fuchsia-200" },
  resistance: { ja: "耐性", cls: "bg-emerald-500/20 text-emerald-200" },
  attack: { ja: "アタック", cls: "bg-amber-600/20 text-amber-200" },
  caster: { ja: "キャスター", cls: "bg-violet-500/20 text-violet-200" },
  speed: { ja: "スピード", cls: "bg-green-500/20 text-green-200" },
  attribute: { ja: "能力値", cls: "bg-amber-400/20 text-amber-100" },
  critical: { ja: "クリティカル", cls: "bg-pink-500/20 text-pink-200" },
  minion: { ja: "ミニオン", cls: "bg-indigo-400/20 text-indigo-200" },
  ailment: { ja: "状態異常", cls: "bg-purple-400/20 text-purple-200" },
  gem: { ja: "ジェム", cls: "bg-sky-400/20 text-sky-100" },
  curse: { ja: "呪い", cls: "bg-purple-600/20 text-purple-200" },
  aura: { ja: "オーラ", cls: "bg-yellow-600/20 text-yellow-100" },
  flask: { ja: "フラスコ", cls: "bg-red-400/20 text-red-100" },
  charm: { ja: "チャーム", cls: "bg-red-300/20 text-red-100" },
  block: { ja: "ブロック", cls: "bg-stone-500/20 text-stone-200" },
  drop: { ja: "ドロップ", cls: "bg-yellow-500/15 text-yellow-100" },
  ulaman_mod: { ja: "ウラマン", cls: "bg-rose-700/30 text-rose-200" },
  amanamu_mod: { ja: "アマナム", cls: "bg-rose-700/30 text-rose-200" },
  kurgal_mod: { ja: "クルガル", cls: "bg-rose-700/30 text-rose-200" },
};
/** 出すタグ (細かすぎる物・重なる物は省く) */
export const shownTags = (tags: readonly string[]): string[] => tags.filter((t) => TAG_STYLE[t]);
