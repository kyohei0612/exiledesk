/**
 * クラフト収支: 貼り付けた装備に使えるエッセンスと、その結果 (完成品の mod 構成) を列挙する
 *
 * ゲーム内の効果文 (クライアント CurrencyItems.Description):
 *   Lesser (tier 0)   : ノーマル → マジック + 保証モッド 1
 *   通常 / Greater    : マジック → レア + 保証モッド 1 (既存 mod はそのまま残る = 決定的)
 *   Perfect           : レアからランダムに 1 mod を取り除き、保証モッドを 1 つ追加 (取り除く mod ごとに結果を列挙)
 * 保証モッドの実値はランダム (ティア内でロール) なので、相場検索では最低ロール以上で絞る。
 *
 * クライアント由来の規則 (craft-rules.json、2026-09-08):
 *   - Rarity: レアは prefix 3 / suffix 3 まで (マジックは 1 / 1)
 *   - お告げ: 「次のパーフェクト / コラプトエッセンスは prefix (suffix) だけ取り除く」→ 外れる候補を絞る
 *   - mod ファミリー (groups): 同じファミリーの mod は 1 個まで (= エッセンス専用 mod が 1 個しか付かない理由)
 *   - Mods.Level: 保証モッドの必要 ilvl。装備 ilvl が届かないときは警告 (エッセンスが ilvl を無視するかは未確認)
 */

import essencesJson from "../../i18n/essences.json";
import craftRulesJson from "../../i18n/craft-rules.json";
import trade2StatMapping from "../../i18n/trade2-stat-mapping.json";
import { allMods, type Mod } from "../../data/mods";
import type { Trade2StatFilter } from "../../services/trade2/query";
import type { ItemMod, ParsedItem } from "./parse";

export interface EssenceTarget {
  category: string;
  itemClasses: string[];
  modId: string | null;
  outcomes?: Array<{ modId: string | null; weight: number }>;
}
export interface EssenceDef {
  id: string;
  nameEn: string;
  nameJa: string;
  tier: number;
  perfect: boolean;
  targets: EssenceTarget[];
}

export interface OmenDef {
  id: string;
  nameEn: string;
  nameJa: string;
  trigger: string;
  effect: string;
  descEn: string;
  descJa: string;
}

interface RarityLimit {
  minMods: number;
  maxMods: number;
  maxPrefix: number;
  maxSuffix: number;
}

const ESSENCES = (essencesJson as { essences: EssenceDef[] }).essences;
const CRAFT_RULES = craftRulesJson as { rarity: Record<string, RarityLimit>; omens: OmenDef[] };
const RARE_LIMIT: RarityLimit = CRAFT_RULES.rarity.Rare ?? { minMods: 4, maxMods: 6, maxPrefix: 3, maxSuffix: 3 };
/** パーフェクト / コラプトエッセンスの除去対象を prefix / suffix に限定するお告げ */
const ESSENCE_OMENS = CRAFT_RULES.omens.filter((o) => o.trigger === "perfectEssence" && (o.effect === "prefixOnly" || o.effect === "suffixOnly"));
const MODS_BY_KEY: Map<string, Mod> = new Map(allMods.map((m) => [m.key, m]));
const TRADE2_STAT_MAPPING = trade2StatMapping as Readonly<Record<string, string>>;

/** 完成品の 1 mod (既存 mod または保証モッド) */
export interface OutcomeMod {
  textEn: string;
  textJa: string;
  affix: "prefix" | "suffix" | "unknown";
  groups: string[];
  /** 相場検索の下限に使う値 (既存 = 実値、保証 = 最低ロール) */
  stats: Array<{ id: string; value: number }>;
  /** この mod がエッセンス由来 */
  guaranteed: boolean;
}

export interface Outcome {
  /** Perfect で取り除かれた mod (通常 / Greater は null) */
  removed: ItemMod | null;
  mods: OutcomeMod[];
  /** 結果のレアリティ */
  rarity: "magic" | "rare";
  /** 使うお告げ (除去対象を prefix / suffix に限定)。無ければ null */
  omen: OmenDef | null;
  /** この結果になる確率 (除去候補が N 個なら 1/N。決定的なら 1) */
  chance: number;
}

export interface EssencePlan {
  essence: EssenceDef;
  guaranteed: OutcomeMod;
  outcomes: Outcome[];
  /** 使えない理由 (null なら使える) */
  blocked: string | null;
  /** 使えるが注意 (必要 ilvl など) */
  warnings: string[];
}

const stripLinks = (s: string) => s.replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]]+)\]/g, "$1");

/**
 * 保証モッドの最低ロール。stats[].min はクライアント内部値で、クリティカル率や吸収 (permyriad) は
 * 表示値の 100 倍 / 10000 倍で入っている (例 local_critical_strike_chance: 表示 2.11% ↔ 内部 211)。
 * trade2 は表示値で受けるので、テンプレの範囲下限と内部値の比が 10 の冪なら表示値を採用する。
 * (2026-09-08: 探求のエッセンスで 211 以上を投げて 0 件になっていた)
 */
function displayMins(textEn: string): number[] {
  const out: number[] = [];
  const re = /\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(textEn))) out.push(Number(m[1]));
  return out;
}
function statMinForTrade(min: number, display: number | undefined): number {
  if (display === undefined || display === 0 || min === display) return min;
  const ratio = min / display;
  for (const p of [10, 100, 1000, 10000]) if (Math.abs(ratio - p) < 1e-6) return display;
  return min;
}

/** bundle の mod → 保証モッド (最低ロール表記) */
function guaranteedFromMod(m: Mod): OutcomeMod {
  const mins = displayMins(m.text_en);
  return {
    textEn: stripLinks(m.text_en),
    textJa: stripLinks(m.text_ja || m.text_en),
    affix: m.type === "prefix" || m.type === "suffix" ? m.type : "unknown",
    groups: m.groups ?? [],
    stats: (m.stats ?? []).map((s, i) => ({ id: s.id, value: statMinForTrade(s.min ?? 0, mins[i]) })),
    guaranteed: true,
  };
}

function fromItemMod(m: ItemMod): OutcomeMod {
  return { textEn: m.textEn, textJa: m.textJa, affix: m.affix, groups: m.groups, stats: m.stats, guaranteed: false };
}

function countAffix(mods: OutcomeMod[], affix: "prefix" | "suffix"): number {
  return mods.filter((m) => m.affix === affix).length;
}

function conflicts(mods: OutcomeMod[], g: OutcomeMod): boolean {
  return mods.some((m) => m.groups.some((x) => g.groups.includes(x)));
}

/** 保証モッドを足したときに prefix / suffix の上限 (Rarity テーブル) を超えるか */
function exceedsLimit(rest: OutcomeMod[], g: OutcomeMod): boolean {
  if (g.affix === "unknown") return false;
  const limit = g.affix === "prefix" ? RARE_LIMIT.maxPrefix : RARE_LIMIT.maxSuffix;
  return countAffix(rest, g.affix) >= limit;
}

/** コラプトエッセンス (アビス等)。effect 文は「パーフェクトまたはコラプト」なので Perfect と同じ扱い */
function isCorruptedEssence(e: EssenceDef): boolean {
  return /CorruptedEssence/.test(e.id);
}

/**
 * レアから 1 mod 除去 + 保証モッド。除去候補ごとに結果を作る。
 * omen があれば候補をその affix に絞る (確率 = 1 / 候補数)。
 */
function removeAndAddOutcomes(identified: ItemMod[], base: OutcomeMod[], guaranteed: OutcomeMod, omen: OmenDef | null): Outcome[] {
  const affixOnly = omen?.effect === "prefixOnly" ? "prefix" : omen?.effect === "suffixOnly" ? "suffix" : null;
  const candidates = affixOnly ? identified.filter((m) => m.affix === affixOnly) : identified;
  const out: Outcome[] = [];
  for (const removed of candidates) {
    const rest = base.filter((m) => m.textEn !== removed.textEn);
    if (conflicts(rest, guaranteed) || exceedsLimit(rest, guaranteed)) continue;
    out.push({ removed, mods: [...rest, guaranteed], rarity: "rare", omen, chance: 1 / candidates.length });
  }
  return out;
}

/** 装備 (ノーマル / マジック / レア) に対して使えるエッセンスと結果を列挙する */
export function planEssences(item: ParsedItem): EssencePlan[] {
  if (!item.itemClass) return [];
  const identified = item.mods.filter((m): m is ItemMod => m.identified);
  const plans: EssencePlan[] = [];

  for (const e of ESSENCES) {
    const target = e.targets.find((t) => t.itemClasses.includes(item.itemClass as string));
    if (!target) continue;
    // 保証モッドが複数候補からランダムなもの (属性系 / Greater 戦闘 等) は先頭候補で表示し、blocked にする
    const modId = target.modId ?? target.outcomes?.[0]?.modId ?? null;
    if (!modId) continue;
    const mod = MODS_BY_KEY.get(modId);
    if (!mod) continue;
    const guaranteed = guaranteedFromMod(mod);
    // 効果文どおり (CurrencyItems.Description、2026-09-08 再確認):
    //   Perfect / コラプト (Hysteria 等 + アビス / ブリーチ) / 0.3 の合金 (VerisiumAlloy)
    //     = "Removes a random modifier and augments a Rare item with a new guaranteed modifier"
    //   Lesser / 通常 / Greater = "Upgrades a Magic item to a Rare item, adding a guaranteed modifier"
    const removeAndAdd = e.perfect || isCorruptedEssence(e) || /VerisiumAlloy/.test(e.id);
    const usable = removeAndAdd ? item.rarity === "rare" : item.rarity === "magic";
    if (!usable) continue;

    const base = identified.map(fromItemMod);
    let blocked: string | null = null;
    const warnings: string[] = [];
    if (item.mods.some((m) => !m.identified)) blocked = "同定できない mod があるため結果を確定できません";
    if (target.outcomes && target.outcomes.length > 1) blocked = "保証モッドが複数候補からランダム (未対応)";
    if (item.itemLevel != null && mod.level > item.itemLevel) {
      warnings.push(`保証モッドの必要 ilvl ${mod.level} > 装備 ilvl ${item.itemLevel} (Mods.Level。エッセンスが ilvl を無視するかは未確認)`);
    }

    const outcomes: Outcome[] = [];
    if (removeAndAdd) {
      outcomes.push(...removeAndAddOutcomes(identified, base, guaranteed, null));
      // お告げは「パーフェクトまたはコラプトエッセンス」にだけ効く (合金には効果文が無い)
      if (e.perfect || isCorruptedEssence(e)) {
        for (const omen of ESSENCE_OMENS) {
          const affix = omen.effect === "prefixOnly" ? "prefix" : "suffix";
          const pool = identified.filter((m) => m.affix === affix).length;
          // お告げで除去候補が減らない (全部その affix) なら意味が無いので出さない
          if (pool === 0 || pool >= identified.length) continue;
          outcomes.push(...removeAndAddOutcomes(identified, base, guaranteed, omen));
        }
      }
      if (outcomes.length === 0 && !blocked) blocked = "どの mod を外しても保証モッドが入りません (同系統 / 枠なし)";
    } else {
      if (conflicts(base, guaranteed)) blocked = blocked ?? "同系統の mod が既に付いています";
      else if (exceedsLimit(base, guaranteed)) blocked = blocked ?? `${guaranteed.affix === "prefix" ? "prefix" : "suffix"} の枠が埋まっています`;
      else outcomes.push({ removed: null, mods: [...base, guaranteed], rarity: "rare", omen: null, chance: 1 });
    }
    plans.push({ essence: e, guaranteed, outcomes, blocked, warnings });
  }
  return plans;
}

/**
 * 完成品の mod 構成 → trade2 の stat filter。GGG stat ID → trade2 ID に変換し、
 * 同じ trade2 ID に複数値が乗る ("Adds X to Y" の min/max) ときは平均を下限にする。
 * 変換できない stat は missing に入れる (検索からは外す)。
 */
export function statFiltersForOutcome(mods: OutcomeMod[]): { filters: Trade2StatFilter[]; missing: string[] } {
  const byTrade = new Map<string, number[]>();
  const missing: string[] = [];
  for (const m of mods) {
    let hit = false;
    for (const s of m.stats) {
      const tid = TRADE2_STAT_MAPPING[s.id];
      if (!tid) continue;
      hit = true;
      if (!byTrade.has(tid)) byTrade.set(tid, []);
      byTrade.get(tid)!.push(s.value);
    }
    if (!hit) missing.push(m.textJa || m.textEn);
  }
  const filters: Trade2StatFilter[] = [];
  for (const [id, values] of byTrade) {
    const min = values.reduce((a, b) => a + b, 0) / values.length;
    filters.push({ id, disabled: false, value: { min: Math.floor(min * 100) / 100 } });
  }
  return { filters, missing };
}
