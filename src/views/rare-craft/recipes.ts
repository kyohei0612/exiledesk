/**
 * 規格外の賭け — レシピ定義 (2026-09-14)
 *
 * オーナー指示 (2026-09-14): 1 ソケットの通常ベースは作らない。規格外 (ルーンソケット 2) のベースだけで収支を出す
 * (1 ソケットは今の相場で全部赤字、規格外は完成品の値が 10〜40 倍で黒字)。
 *
 * 0.5 の基本形「マジックベース (MOD 1 つ) → グレーターエッセンス (クラフト MOD 枠) → 肋骨で冒涜 (必ずやる) → 高貴なオーブ 1 個 + 偉大なる高貴なお告げで MOD を 2 つ足す」。
 * オーナー指示 (2026-09-14): 偉大なる高貴なお告げは必ず使う (足す数の選択は無し)。アビスの反響のお告げ (冒涜の 3 択を 1 回引き直す) も選択肢に入れる。
 * 名前は全部クライアントの日本語 (items-ja-client.json)。単価の apiId は poe2scout。
 * 兜 / 手袋 / 靴の冒涜 MOD は接尾辞だけ (クライアントの MOD 表) なので、ネクロマンシーのお告げは使わない。
 */
import type { Metric } from "./sim";

export type RecipeId = "es-helmet" | "life-res-gloves" | "ms-boots";

/** 規格外のベース = ルーンソケット 2 (兜 / 手袋 / 靴の通常は 1) */
export const EXCEPTIONAL_SOCKETS = 2;

export interface PageDef {
  /** poe2db の重み表のページ */
  id: string;
  label: string;
  /** trade2 で同じ防御タイプに絞る下限 */
  defence: { arMin?: number; evMin?: number; esMin?: number };
  /** 素の ES (ES レシピのみ使う) */
  baseEs: number;
}
export interface EssenceDef {
  id: string;
  label: string;
  apiId: string;
  /** poe2db の英名 */
  name: string;
  stat: string;
}
export interface RuneDef {
  id: string;
  label: string;
  apiId: string | null;
  effect: Partial<Record<"esPct" | "life" | "res" | "ms", number>>;
}
export interface BucketDef {
  key: string;
  conds: Partial<Record<Metric, number>>;
}
export interface RecipeDef {
  id: RecipeId;
  label: string;
  note: string;
  /** trade2 の category */
  category: string;
  ilvl: number;
  pages: PageDef[];
  baseMod: { family: string; stat: string; label: string; tradeStat: string; defaultTier: number };
  essences: EssenceDef[];
  defaultEssence: string;
  runes: RuneDef[];
  defaultRune: string;
  /** 冒涜 3 択で何を優先するか */
  priority: Partial<Record<Metric, number>>;
  /** 売値の段 (上から高い想定。実際の並びは取れた売値で決める) */
  buckets: BucketDef[];
  /** 外れの売値を測る条件 */
  floor: Partial<Record<Metric, number>>;
  quality: number;
  /** 画面に出す指標 */
  metrics: Metric[];
}

const RES_ESSENCES: EssenceDef[] = [
  { id: "insulation", label: "断熱のグレーターエッセンス (火耐性)", apiId: "greater-essence-of-insulation", name: "Greater Essence of Insulation", stat: "base_fire_damage_resistance_%" },
  { id: "thawing", label: "解凍のグレーターエッセンス (冷気耐性)", apiId: "greater-essence-of-thawing", name: "Greater Essence of Thawing", stat: "base_cold_damage_resistance_%" },
  { id: "grounding", label: "接地のグレーターエッセンス (雷耐性)", apiId: "greater-essence-of-grounding", name: "Greater Essence of Grounding", stat: "base_lightning_damage_resistance_%" },
  { id: "ruin", label: "破滅のグレーターエッセンス (混沌耐性)", apiId: "greater-essence-of-ruin", name: "Greater Essence of Ruin", stat: "base_chaos_damage_resistance_%" },
];
const BODY_ESSENCE: EssenceDef = { id: "body", label: "肉体のグレーターエッセンス (ライフ)", apiId: "greater-essence-of-the-body", name: "Greater Essence of the Body", stat: "base_maximum_life" };

const RES_RUNES: RuneDef[] = [
  { id: "none", label: "ルーンなし", apiId: null, effect: {} },
  { id: "desert", label: "砂漠のグレータールーン (火耐性 +18%)", apiId: "greater-desert-rune", effect: { res: 18 } },
  { id: "glacial", label: "氷河のグレータールーン (冷気耐性 +18%)", apiId: "greater-glacial-rune", effect: { res: 18 } },
  { id: "storm", label: "嵐のグレータールーン (雷耐性 +18%)", apiId: "greater-storm-rune", effect: { res: 18 } },
  { id: "body", label: "肉体のグレータールーン (ライフ +60)", apiId: "greater-body-rune", effect: { life: 60 } },
];

export const RECIPES: readonly RecipeDef[] = [
  {
    id: "es-helmet",
    label: "ES 兜",
    note: "フラット ES 付きの規格外マジック兜 → 強化のグレーターエッセンス (%ES) → 肋骨で冒涜 (耐性 + 混沌耐性) → 高貴なオーブ + 偉大なる高貴なお告げで 2 つ足す → 鉄のルーン ×2",
    category: "armour.helmet",
    ilvl: 80,
    pages: [{ id: "Helmets_int", label: "知性 (ES) 兜", defence: { esMin: 100 }, baseEs: 109 }],
    baseMod: { family: "BaseLocalDefences", stat: "local_energy_shield", label: "最大エナジーシールド (フラット)", tradeStat: "explicit.stat_4052037485", defaultTier: 1 },
    essences: [{ id: "enhancement", label: "強化のグレーターエッセンス (%ES)", apiId: "greater-essence-of-enhancement", name: "Greater Essence of Enhancement", stat: "local_energy_shield_+%" }],
    defaultEssence: "enhancement",
    runes: [
      { id: "none", label: "ルーンなし", apiId: null, effect: {} },
      { id: "iron", label: "鉄のグレータールーン (防御 +18%)", apiId: "greater-iron-rune", effect: { esPct: 18 } },
      { id: "iron-perfect", label: "鉄のパーフェクトルーン (防御 +20%)", apiId: "perfect-iron-rune", effect: { esPct: 20 } },
    ],
    defaultRune: "iron",
    priority: { res: 1, chaos: 0.2 },
    buckets: [
      { key: "a", conds: { es: 450, res: 60 } },
      { key: "b", conds: { es: 400, res: 60 } },
      { key: "c", conds: { es: 450 } },
    ],
    floor: { es: 350 },
    quality: 20,
    metrics: ["es", "res", "chaos"],
  },
  {
    id: "life-res-gloves",
    label: "ライフ耐性手袋",
    note: "ライフ付きの規格外マジック手袋 → 耐性のグレーターエッセンス → 肋骨で冒涜 (耐性 + 混沌耐性) → 高貴なオーブ + 偉大なる高貴なお告げで 2 つ足す → 耐性ルーン ×2",
    category: "armour.gloves",
    ilvl: 82,
    pages: [
      { id: "Gloves_dex", label: "器用さ (回避) 手袋", defence: { evMin: 100 }, baseEs: 0 },
      { id: "Gloves_str_dex", label: "筋力 / 器用さ (アーマー + 回避) 手袋", defence: { arMin: 40, evMin: 40 }, baseEs: 0 },
    ],
    baseMod: { family: "IncreasedLife", stat: "base_maximum_life", label: "最大ライフ", tradeStat: "explicit.stat_3299347043", defaultTier: 1 },
    essences: RES_ESSENCES,
    defaultEssence: "insulation",
    runes: RES_RUNES,
    defaultRune: "storm",
    priority: { res: 1, chaos: 0.3 },
    buckets: [
      { key: "a", conds: { life: 120, res: 80 } },
      { key: "b", conds: { life: 100, res: 60 } },
      { key: "c", conds: { life: 100, res: 40 } },
    ],
    floor: { life: 100 },
    quality: 0,
    metrics: ["life", "res", "chaos"],
  },
  {
    id: "ms-boots",
    label: "移動速度靴",
    note: "移動速度付きの規格外マジック靴 → 肉体 / 耐性のグレーターエッセンス → 肋骨で冒涜 (耐性 + 混沌耐性) → 高貴なオーブ + 偉大なる高貴なお告げで 2 つ足す → 耐性ルーン ×2",
    category: "armour.boots",
    ilvl: 82,
    pages: [
      { id: "Boots_dex", label: "器用さ (回避) 靴", defence: { evMin: 100 }, baseEs: 0 },
      { id: "Boots_dex_int", label: "器用さ / 知性 (回避 + ES) 靴", defence: { evMin: 40, esMin: 20 }, baseEs: 0 },
      { id: "Boots_str_dex", label: "筋力 / 器用さ (アーマー + 回避) 靴", defence: { arMin: 40, evMin: 40 }, baseEs: 0 },
    ],
    baseMod: { family: "MovementVelocity", stat: "base_movement_velocity_+%", label: "移動速度", tradeStat: "explicit.stat_2250533757", defaultTier: 1 },
    essences: [BODY_ESSENCE, ...RES_ESSENCES],
    defaultEssence: "body",
    runes: [...RES_RUNES, { id: "chase", label: "ファルウルの追跡のルーン (移動速度 +5%)", apiId: "farruls-rune-of-the-chase", effect: { ms: 5 } }],
    defaultRune: "storm",
    priority: { res: 1, chaos: 0.3 },
    // 肉体のグレーターエッセンスがライフ枠を使う (85〜99) ので、ライフの段は 85 (100 は届かない)
    buckets: [
      { key: "a", conds: { ms: 35, life: 85, res: 60 } },
      { key: "b", conds: { ms: 35, res: 60 } },
      { key: "c", conds: { ms: 35, life: 85 } },
    ],
    floor: { ms: 35 },
    quality: 0,
    metrics: ["ms", "life", "res", "chaos"],
  },
];

export type RibId = "preserved" | "ancient";
export const RIBS: { id: RibId; label: string; apiId: string; minLevel: number }[] = [
  { id: "preserved", label: "保存された肋骨", apiId: "preserved-rib", minLevel: 0 },
  { id: "ancient", label: "古代の肋骨", apiId: "ancient-rib", minLevel: 40 },
];

export type ExaltId = "normal" | "greater" | "perfect";
/** 高貴なオーブは毎回 偉大なる高貴なお告げ と一緒に 1 個使い、MOD を 2 つ付ける */
export const EXALT_ADDS = 2;
export const EXALTS: { id: ExaltId; label: string; apiId: string; minLevel: number; note: string }[] = [
  { id: "normal", label: "高貴なオーブ", apiId: "exalted", minLevel: 1, note: "MOD レベルの下限なし" },
  { id: "greater", label: "高貴なオーブ (上級)", apiId: "greater-exalted-orb", minLevel: 35, note: "MOD レベル 35 以上" },
  { id: "perfect", label: "高貴なオーブ (完全)", apiId: "perfect-exalted-orb", minLevel: 50, note: "MOD レベル 50 以上" },
];
export type SideId = "any" | "suffix";
export const SIDES: { id: SideId; label: string }[] = [
  { id: "any", label: "お告げなし" },
  { id: "suffix", label: "右側の高貴なお告げ (接尾辞だけ)" },
];
export type EchoId = "none" | "echoes";
export const ECHOES: { id: EchoId; label: string }[] = [
  { id: "none", label: "使わない" },
  { id: "echoes", label: "アビスの反響のお告げ (3 択を 1 回引き直せる)" },
];
/** アビスの反響のお告げ (poe2scout の ApiId。trade2 の static id は旧名の omen-of-abyssal-favours なので混同しない) */
export const ECHO_API_ID = "omen-of-abyssal-echoes";

/** 1 回に使う素材 */
export interface MaterialRow {
  key: string;
  apiId: string;
  label: string;
  note: string;
  qty: number;
}

export function exaltLevelsFor(exalt: ExaltId, count: number): number[] {
  const lv = EXALTS.find((x) => x.id === exalt)?.minLevel ?? 1;
  return Array.from({ length: count }, () => lv);
}

export function materialsFor(
  r: RecipeDef,
  o: { essenceId: string; rib: RibId; echo: EchoId; exalt: ExaltId; count: number; side: SideId; runeId: string; sockets: number },
): MaterialRow[] {
  const rows: MaterialRow[] = [];
  const ess = r.essences.find((e) => e.id === o.essenceId);
  if (ess) rows.push({ key: "essence", apiId: ess.apiId, label: ess.label.replace(/ \(.+\)$/, ""), note: "クラフト MOD 枠。マジック → レア", qty: 1 });
  const rib = RIBS.find((x) => x.id === o.rib)!;
  rows.push({ key: "rib", apiId: rib.apiId, label: rib.label, note: "魂の井戸で冒涜 3 択 → 耐性 + 混沌耐性を優先して選ぶ", qty: 1 });
  if (o.echo === "echoes") rows.push({ key: "echo", apiId: ECHO_API_ID, label: "アビスの反響のお告げ", note: "最初の 3 択が悪ければ 1 回引き直す", qty: 1 });
  if (o.count > 0) {
    const ex = EXALTS.find((x) => x.id === o.exalt) ?? EXALTS[0];
    rows.push({ key: "exalt", apiId: ex.apiId, label: ex.label, note: `${ex.note}。1 個で ${o.count} つ付ける`, qty: 1 });
    if (o.count >= 2) rows.push({ key: "gomen", apiId: "omen-of-greater-exaltation", label: "偉大なる高貴なお告げ", note: "次の高貴なオーブで MOD を 2 つ付ける", qty: 1 });
    if (o.side === "suffix") rows.push({ key: "dextral", apiId: "omen-of-dextral-exaltation", label: "右側の高貴なお告げ", note: "高貴なオーブを接尾辞だけにする", qty: 1 });
  }
  const rune = r.runes.find((x) => x.id === o.runeId);
  if (rune?.apiId && o.sockets > 0) {
    rows.push({ key: "artificer", apiId: "artificers", label: "熟練工のオーブ", note: "ソケットが無ければ開ける", qty: o.sockets });
    rows.push({ key: "rune", apiId: rune.apiId, label: rune.label.replace(/ \(.+\)$/, ""), note: rune.label.match(/\((.+)\)$/)?.[1] ?? "", qty: o.sockets });
  }
  return rows;
}

export function bucketLabel(conds: Partial<Record<Metric, number>>): string {
  const L: Record<Metric, string> = { es: "ES", life: "ライフ", res: "元素耐性", chaos: "混沌耐性", ms: "移動速度" };
  const U: Record<Metric, string> = { es: "", life: "", res: "%", chaos: "%", ms: "%" };
  const parts = (Object.keys(conds) as Metric[]).filter((k) => conds[k] != null).map((k) => `${L[k]} ${conds[k]}${U[k]}+`);
  return parts.length ? parts.join(" · ") : "条件なし";
}
