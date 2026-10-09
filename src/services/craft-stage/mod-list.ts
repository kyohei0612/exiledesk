/**
 * mod-list.ts — クラフトステージの「このベースに付く MOD」一覧の中身 (2026-09-29)
 *
 * オーナー「そのベースに付く MOD 全て、アイテムレベルは無視して、重み付きで。DB (poe2db) にならって。
 * ただ DB は海外向けで見づらいので、UI はシンプルに色や形にこだわって」。
 * 中身は計算機のエンジンの行 (item.cls.pools) そのまま = クラフトステージの抽選と同じ。
 *   - 種類: 普通 / エッセンス / 冒涜 / 異界 (変質した鎖骨)
 *   - 1 行 = 1 系統の MOD。重みは全段の合計、出やすさは同じ種類・同じ側の合計に対する割合
 */
import { ESSENCE_KIND, essenceKindOf } from "../mods/essence-kind";
import type { Mod, PatchData } from "../../vendor/poe2htc/engine/types";
import { fillModText, jaOfMod } from "../htc/mod-text";
import type { StageItem, StageSide } from "./types";
import { allMods, effectiveCls, oneOfMod, stageRuneIds, takenFamilies } from "./stage-core";
import { RUNES } from "./stage-runes";
import { RUNE_BY_ID } from "../../vendor/poe2htc/engine/runes";
import { TAG_STYLE } from "../mods/tag-ja";
import { familyBlocked, fillShares, tierWeight } from "../mods/mod-rules";
import { tierDisplayRanges } from "../mods/stat-scale";

/** エッセンスはパーフェクト (合金も) とそれ以外を分ける (使い道が違う、[[essence-kind.ts]]) */
export type ModGroup = "normal" | "rune" | "essence" | "perfect_essence" | "desecrated" | "otherworldly" | "special";
/**
 * special = 創生の樹・ハンドラップ専用の MOD (ベースの special の置き場、重み 0)。カレンシーでは付かないが MOD としてはあるので、手で付ける分だけ出す
 * (2026-10-09 オーナー「創生の樹産の奴がクラフトでは付かないけど MOD としては存在する。カレンシーで出ちゃだめだけど、手動で付ける分はいる。分かりやすいように置いといて」)
 */
export const GROUP_JA: Record<ModGroup, string> = { normal: "普通", rune: "ルーンの特殊 MOD (重みは Craft of Exile の実測)", essence: ESSENCE_KIND.essence.label, perfect_essence: ESSENCE_KIND.perfect_essence.label, desecrated: "冒涜", otherworldly: "異界 (変質した鎖骨)", special: "創生の樹など (カレンシーでは付かない)" };

/** modId = その段の MOD (同じ系統をまとめた行では段ごとに違う、2026-10-05) */
export interface ListTier { rank: string; name: string; ilvl: number; weight: number; text: string; modId?: string }
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
  /** ルーンの特殊 MOD: どのルーンの物か (日本語名) と、今差しているか */
  runeJa?: string;
  socketed?: boolean;
}

/**
 * 特殊 MOD のルーンの色 (アイコンのメインカラー、2026-10-05 オーナー「カトラは紫でコルは緑、アイコンのメインカラーに」)。
 * tab = 節の見出し・切り替え、bar = 出やすさの帯、badge = 狙う MOD の左の札。日本語名で引く
 */
const RUNE_TONE_EN: Record<string, { tab: string; bar: string; badge: string }> = {
  "Kolr's Hunt": { tab: "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/60", bar: "bg-emerald-500/15", badge: "border-emerald-400/60 text-emerald-200" },
  "Katla's Gloom": { tab: "bg-purple-500/20 text-purple-100 ring-1 ring-purple-400/60", bar: "bg-purple-500/15", badge: "border-purple-400/60 text-purple-200" },
  "Thrud's Might": { tab: "bg-orange-500/20 text-orange-100 ring-1 ring-orange-400/60", bar: "bg-orange-500/15", badge: "border-orange-400/60 text-orange-200" },
  "Medved's Tending": { tab: "bg-slate-300/20 text-slate-100 ring-1 ring-slate-300/60", bar: "bg-slate-300/15", badge: "border-slate-300/60 text-slate-100" },
  "Uhtred's Sidereus": { tab: "bg-violet-400/20 text-violet-100 ring-1 ring-violet-300/60", bar: "bg-violet-400/15", badge: "border-violet-300/60 text-violet-200" },
  "Vorana's Carnage": { tab: "bg-red-500/20 text-red-100 ring-1 ring-red-400/60", bar: "bg-red-500/15", badge: "border-red-400/60 text-red-200" },
};
const RUNE_TONE = new Map(Object.entries(RUNE_TONE_EN).map(([en, t]) => [RUNES[en]?.ja ?? en, t]));
export const runeToneOf = (ja: string | null | undefined): { tab: string; bar: string; badge: string } | null => (ja ? RUNE_TONE.get(ja) ?? null : null);

/** 特殊 MOD のルーンの日本語名 (エンジンの id → ステージの表。名前の ’ は ' に) */
export function runeJaOf(id: string): string {
  const en = RUNE_BY_ID.get(id)?.name.replace(/’/g, "'") ?? id;
  return RUNES[en]?.ja ?? en;
}

/**
 * 「このベースに付く MOD」(2026-10-04 オーナー「差したら見えるとかじゃなくて、MOD は全て最初から見える状態がいい、異界とかも含め全部」)。
 * 普通 / エッセンス / 冒涜 / 異界 (このベースに有る物全部) に加えて、このベースに差せる特殊 MOD のルーンの MOD を全部
 * 「ルーンの特殊 MOD」に出す。差していないルーンの行は runeJa (「○○を差すと」) 付きで、出やすさはそのルーンを差した時の割合
 */
export function modListFor(data: PatchData, item: StageItem): ListRow[] {
  // 普通の置き場は差した特殊 MOD のルーンの MOD 込み (要望 ㉙)。出やすさは普通と一緒に引くので一緒に割る
  const eff = effectiveCls(item);
  const pools = eff.pools as typeof item.cls.pools & { otherworldly?: { prefixes: readonly string[]; suffixes: readonly string[] } };
  const onIds = new Set(allMods(item).map((m) => m.modId));
  const taken = takenFamilies(data, item);
  const socketed = new Set(stageRuneIds(item));
  const out: ListRow[] = [];
  const rowOf = (raw: Mod, side: StageSide, group: ModGroup): ListRow => {
    const m = oneOfMod(raw);
    const ja = jaOfMod(m);
    const n = m.tiers.length;
    // 数値は画面の単位に (1 万分率の 400 → 4%。決まりは services/mods/stat-scale.ts、2026-10-03 に生の値が出ていた)
    const tiers = [...m.tiers].reverse().map((t, i): ListTier => ({ rank: `T${i + 1}`, name: t.name, ilvl: t.ilvl, weight: t.weight, text: fillModText(m, tierDisplayRanges(t)) }));
    const weight = tierWeight(m, 0, Infinity); // アイテムレベルは見ない (全部の段)
    const on = onIds.has(m.id);
    return {
      id: m.id, family: m.family, template: ja, side, group, text: tiers[0]?.text ?? ja, tags: [...(m.displayTags ?? m.tags)], tiers, weight,
      topLevel: n ? m.tiers[n - 1]!.ilvl : 0, share: 0, on, blocked: !on && familyBlocked(m, taken),
    };
  };
  const modsOf = (ids: readonly string[]) => ids.map((id) => data.mods.get(id)).filter((m): m is Mod => !!m);
  const groups: Array<[ModGroup, { prefixes: readonly string[]; suffixes: readonly string[] } | undefined]> = [
    ["normal", pools.normal], ["essence", pools.essence], ["desecrated", pools.desecrated], ["otherworldly", pools.otherworldly], ["special", pools.special],
  ];
  for (const [group, pool] of groups) {
    if (!pool) continue;
    for (const side of ["prefix", "suffix"] as const) {
      const rows = modsOf(side === "prefix" ? pool.prefixes : pool.suffixes).map((m) => rowOf(m, side, group === "essence" ? essenceKindOf(m) ?? "essence" : group));
      // 割合を普通と一緒に出してから、差したルーンの MOD の行を「ルーン」の種類に
      out.push(...fillShares(rows).map((r) => {
        const rune = group === "normal" ? data.mods.get(r.id)?.rune : undefined;
        return rune ? { ...r, group: "rune" as const, runeJa: runeJaOf(rune), socketed: true } : r;
      }));
    }
  }
  // 差していないルーン: そのルーンを差した時の割合 (今の普通の置き場 + そのルーンの MOD で割る)
  for (const [id, pool] of Object.entries(item.cls.pools.rune ?? {})) {
    if (socketed.has(id)) continue;
    for (const side of ["prefix", "suffix"] as const) {
      const k = side === "prefix" ? "prefixes" : "suffixes";
      const own = new Set(pool[k]);
      const rows = modsOf([...pools.normal[k], ...pool[k]]).map((m) => rowOf(m, side, "normal"));
      out.push(...fillShares(rows).filter((r) => own.has(r.id)).map((r) => ({ ...r, group: "rune" as const, runeJa: runeJaOf(id), socketed: false })));
    }
  }
  return mergeFamilies(out);
}

/**
 * 同じ系統 (どちらか片方しか付かない) の MOD を 1 行にまとめる (2026-10-05 オーナー「この表示だとスキルレベルが 2 個被って付くんじゃねってなる、
 * 同じグループ内では共存できないから」)。poe2db と同じく行の文は「呪印スキルのレベル # / 投射物スキルのレベル #」、重み・出やすさは合計、
 * 段の表に全部の段 (段ごとの MOD の id つき = 「付ける」はその段の MOD)。抽選は段ごとの重みのまま (rune-split.ts で分けた物もここで見た目だけ戻す)
 */
function mergeFamilies(rows: ListRow[]): ListRow[] {
  const groups = new Map<string, ListRow[]>();
  for (const r of rows) {
    const k = `${r.group}|${r.side}|${r.runeJa ?? ""}|${r.family}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const out: ListRow[] = [];
  for (const g of groups.values()) {
    if (g.length === 1) { out.push(g[0]!); continue; }
    const first = g[0]!;
    out.push({
      ...first,
      template: g.map((r) => r.template).join(" / "),
      text: g.map((r) => r.text).join(" / "),
      tags: [...new Set(g.flatMap((r) => r.tags))],
      tiers: g.flatMap((r) => r.tiers.map((t) => ({ ...t, modId: r.id }))),
      weight: g.reduce((a, r) => a + r.weight, 0),
      share: g.reduce((a, r) => a + r.share, 0),
      topLevel: Math.max(...g.map((r) => r.topLevel)),
      on: g.some((r) => r.on),
      blocked: g.every((r) => r.blocked),
    });
  }
  return out;
}

/** タグの日本語と色 (表は services/mods/tag-ja.ts に 1 つ) */
export { TAG_STYLE };
/** 出すタグ (細かすぎる物・重なる物は省く) */
export const shownTags = (tags: readonly string[]): string[] => tags.filter((t) => TAG_STYLE[t]);
