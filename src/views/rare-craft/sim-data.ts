/**
 * 規格外の賭け — シミュレーターの土台 (重み表・型・列・ティア・枠の数え方)
 * sim.ts から切り出し (2026-09-26)。中身は変えていない。sim.ts が同じ名前で出し直すので、読み込み側は sim.ts のまま。
 */
import weightsJson from "../../i18n/mod-weights-poe2db.json";

export interface WStat {
  id: string;
  min: number;
  max: number;
}
export interface WMod {
  id: string | null;
  family: string;
  families: string[];
  gen: string;
  name: string;
  level: number;
  weight: number;
  tags: string[];
  text: string;
  stats: WStat[];
}
export interface WEssence {
  essence: string;
  code: string;
  level: number;
  gen: string;
  family: string;
  text: string;
  stats: WStat[];
}
export interface WPage {
  tags: string | null;
  normal: WMod[];
  desecrated: WMod[];
  essence: WEssence[];
}
export const WEIGHT_PAGES = (weightsJson as unknown as { pages: Record<string, WPage> }).pages;

export type Metric = "es" | "life" | "res" | "chaos" | "ms";
export const METRIC_LABEL: Record<Metric, string> = { es: "ES", life: "ライフ", res: "元素耐性", chaos: "混沌耐性", ms: "移動速度" };
export const METRIC_UNIT: Record<Metric, string> = { es: "", life: "", res: "%", chaos: "%", ms: "%" };

/** 冒涜の 3 択のうち、2 つ目・3 つ目が通常の MOD になる確率 (Sift の推定) */
export const DEFAULT_NORMAL_SHARE = 0.5;

/** 1 回ぶんの素の値 (列) */
export const COL = { esFlat: 0, esPct: 1, life: 2, res: 3, chaos: 4, ms: 5 } as const;
export const NCOL = 6;

/** stat id → 列への足し方 */
export const STAT_TO_COLS: Record<string, [number, number][]> = {
  local_energy_shield: [[COL.esFlat, 1]],
  "local_energy_shield_+%": [[COL.esPct, 1]],
  "local_armour_and_energy_shield_+%": [[COL.esPct, 1]],
  "local_evasion_and_energy_shield_+%": [[COL.esPct, 1]],
  base_maximum_life: [[COL.life, 1]],
  "base_fire_damage_resistance_%": [[COL.res, 1]],
  "base_cold_damage_resistance_%": [[COL.res, 1]],
  "base_lightning_damage_resistance_%": [[COL.res, 1]],
  "base_chaos_damage_resistance_%": [[COL.chaos, 1]],
  "fire_and_chaos_damage_resistance_%": [
    [COL.res, 1],
    [COL.chaos, 1],
  ],
  "cold_and_chaos_damage_resistance_%": [
    [COL.res, 1],
    [COL.chaos, 1],
  ],
  "lightning_and_chaos_damage_resistance_%": [
    [COL.res, 1],
    [COL.chaos, 1],
  ],
  "base_movement_velocity_+%": [[COL.ms, 1]],
};
export const COL_METRIC: Partial<Record<number, Metric>> = { [COL.life]: "life", [COL.res]: "res", [COL.chaos]: "chaos", [COL.ms]: "ms" };

export interface BaseModSpec {
  family: string;
  stat: string;
  /** 1 = ilvl で付く最上位 */
  tier: number;
}

export interface SimOptions {
  page: string;
  ilvl: number;
  baseMods: BaseModSpec[];
  essence: { name: string; stat: string } | null;
  desecrate: boolean;
  /** 冒涜の候補の最低 MOD レベル (保存 0 / 古代 40)。アビス専用 MOD と通常の MOD の両方に効く */
  ribMinLevel: number;
  /** 3 択の 2 つ目・3 つ目が通常の MOD になる確率 */
  normalShare: number;
  /** アビスの反響のお告げを使う (3 択を 1 回引き直せる) */
  echo: boolean;
  /** エグザルトごとの MOD レベル下限 (配列の長さ = 足す数) */
  exaltLevels: number[];
  /** 右側の高貴なお告げ = サフィックスだけ */
  exaltSide: "any" | "suffix";
  /** 冒涜 3 択の選び方 (指標ごとの重み) */
  priority: Partial<Record<Metric, number>>;
  samples: number;
}

export interface SimResult {
  ok: boolean;
  reason?: string;
  n: number;
  raw: Float32Array;
  /** 反響で引き直した割合 */
  pReroll: number;
  /** 使ったベース MOD のティア値 (表示用) */
  baseRanges: { family: string; tier: number; level: number; min: number; max: number }[];
}

export interface Slots {
  prefixUsed: number;
  suffixUsed: number;
  desecrateGen: "prefix" | "suffix" | null;
  prefixOpen: number;
  suffixOpen: number;
}

/** ベース MOD のティア一覧 (レベル降順 = T1, T2, …) */
export function baseModTiers(page: string, family: string, stat: string, ilvl: number): { tier: number; level: number; min: number; max: number; mod: WMod }[] {
  const p = WEIGHT_PAGES[page];
  if (!p) return [];
  return p.normal
    .filter((m) => m.family === family && m.level <= ilvl && m.stats.some((s) => s.id === stat))
    .sort((a, b) => b.level - a.level)
    .map((m, i) => {
      const s = m.stats.find((x) => x.id === stat)!;
      return { tier: i + 1, level: m.level, min: s.min, max: s.max, mod: m };
    });
}

export function findEssence(page: string, name: string, stat: string): WEssence | null {
  return WEIGHT_PAGES[page]?.essence.find((e) => e.essence === name && e.stats.some((s) => s.id === stat)) ?? null;
}

/** プレフィックス / サフィックスの空き (ベース MOD + エッセンス + 冒涜のあと) */
export function slotsAfterSetup(o: Pick<SimOptions, "page" | "ilvl" | "baseMods" | "essence" | "desecrate">): Slots {
  const page = WEIGHT_PAGES[o.page];
  let prefixUsed = 0;
  let suffixUsed = 0;
  for (const b of o.baseMods) {
    const t = baseModTiers(o.page, b.family, b.stat, o.ilvl)[0];
    if (t?.mod.gen === "prefix") prefixUsed++;
    else if (t) suffixUsed++;
  }
  if (o.essence) {
    const e = findEssence(o.page, o.essence.name, o.essence.stat);
    if (e?.gen === "prefix") prefixUsed++;
    else if (e) suffixUsed++;
  }
  let desecrateGen: Slots["desecrateGen"] = null;
  if (o.desecrate && page) {
    // アビス専用 MOD がある側に冒涜が付く (兜 / 手袋 / 靴はサフィックスだけ)
    const pool = page.desecrated.filter((m) => m.level <= o.ilvl);
    const suffixes = pool.filter((m) => m.gen === "suffix").length;
    const prefixes = pool.length - suffixes;
    desecrateGen = suffixes >= prefixes ? (3 - suffixUsed > 0 ? "suffix" : null) : 3 - prefixUsed > 0 ? "prefix" : null;
    if (desecrateGen === "suffix") suffixUsed++;
    else if (desecrateGen === "prefix") prefixUsed++;
  }
  return { prefixUsed, suffixUsed, desecrateGen, prefixOpen: Math.max(0, 3 - prefixUsed), suffixOpen: Math.max(0, 3 - suffixUsed) };
}

/** 指定した数のうち実際に付けられる数 (空きと、右側のお告げの制限) */
export function effectiveExaltCount(slots: Slots, side: "any" | "suffix", count: number): number {
  const open = side === "suffix" ? slots.suffixOpen : slots.prefixOpen + slots.suffixOpen;
  return Math.max(0, Math.min(count, open));
}
