/**
 * 集計カウンタ: 1 キャラの items[] を読んでスロット別 MOD / ベース / ユニークを積む
 *
 * craft-discovery-v2.ts から切り出し (2026-09-07)。
 * カウンタ → UI 公開形式への変換は finalize.ts。
 */

import type {
  AffixKind,
  CharacterItems,
  SlotKey,
  UniqueRepresentative,
} from "./types";
import {
  classifyEquipItem,
  classifyUniqueItem,
  grantedSkillStrings,
  isPoeNinjaItem,
  parseGrantedSkill,
  socketedGemNames,
  type PoeNinjaItem,
} from "./ninja-item";
import { extractNumbers, normalizeModTemplate } from "../mods/normalize";
import { heuristicAffix, modBundleIndex } from "../mods/dictionaries";

// ============================================================================
// カウンタ型
// ============================================================================

export interface AggregatedModBucket {
  template: string;
  /** このテンプレートを持っていた人数 (重複排除済) */
  count: number;
  /** 全 occurrence の数値配列 (avg / max / min 計算用) */
  values: number[][];
  /** 日本語テンプレート (bundle 由来、なければ null) */
  textJaTemplate: string | null;
}

/** ベース集計バケット (スロット単位)。key = 英語 baseType。 */
export interface BaseBucket {
  nameEn: string;
  count: number;
  /** 付与スキル別の内訳 (key = 英語スキル名)。スキルを付与しないベースは空。(2026-09-12) */
  skills: Map<string, SkillBucket>;
}

export interface SkillBucket {
  nameEn: string;
  count: number;
  levelMin: number | null;
  levelMax: number | null;
  /** 付与スキルの穴に入っていたジェム名 → 人数 */
  gems: Map<string, number>;
}

export interface SlotCounter {
  prefix: Map<string, AggregatedModBucket>;
  suffix: Map<string, AggregatedModBucket>;
  bases: Map<string, BaseBucket>;
}

/** ユニーク集計用のバケット。key = nameEn (typeLine) で名寄せ。 */
export interface UniqueBucket {
  nameEn: string;
  count: number;
  /** 代表 itemData (最初に見たものを保持) */
  representative: UniqueRepresentative;
  icon: string;
}

export type AscendancySlotCounters = { [K in SlotKey]: SlotCounter };

/** スキル集計バケット (key = 英語スキル名) */
export interface SkillBucket2 {
  nameEn: string;
  count: number;
  mainCount: number;
  supports: Map<string, number>;
}

export interface AscendancyCounter {
  slots: AscendancySlotCounters;
  /** スキル使用率 (同キャラ重複除去済)。2026-09-12 */
  skills: Map<string, SkillBucket2>;
  /** 全スロット合算のユニーク集計 (互換維持)。同キャラ複数スロットでも 1。 */
  uniques: Map<string, UniqueBucket>;
  /** スロット別ユニーク集計。同キャラ × 同ユニーク × 同スロット は 1。 */
  uniquesBySlot: { [K in SlotKey]: Map<string, UniqueBucket> };
}

function emptySlotCounter(): SlotCounter {
  return {
    prefix: new Map<string, AggregatedModBucket>(),
    suffix: new Map<string, AggregatedModBucket>(),
    bases: new Map<string, BaseBucket>(),
  };
}

function emptySlotSets(): Record<SlotKey, Set<string>> {
  return {
    ring: new Set<string>(),
    amulet: new Set<string>(),
    weapon: new Set<string>(),
    weapon2: new Set<string>(),
    helm: new Set<string>(),
    gloves: new Set<string>(),
    body: new Set<string>(),
    boots: new Set<string>(),
  };
}

export function emptyAscendancyCounter(): AscendancyCounter {
  return {
    slots: {
      ring: emptySlotCounter(),
      amulet: emptySlotCounter(),
      weapon: emptySlotCounter(),
      weapon2: emptySlotCounter(),
      helm: emptySlotCounter(),
      gloves: emptySlotCounter(),
      body: emptySlotCounter(),
      boots: emptySlotCounter(),
    },
    uniques: new Map<string, UniqueBucket>(),
    skills: new Map<string, SkillBucket2>(),
    uniquesBySlot: {
      ring: new Map<string, UniqueBucket>(),
      amulet: new Map<string, UniqueBucket>(),
      weapon: new Map<string, UniqueBucket>(),
      weapon2: new Map<string, UniqueBucket>(),
      helm: new Map<string, UniqueBucket>(),
      gloves: new Map<string, UniqueBucket>(),
      body: new Map<string, UniqueBucket>(),
      boots: new Map<string, UniqueBucket>(),
    },
  };
}

// ============================================================================
// 積み上げ
// ============================================================================

/**
 * mod text を正規化し、bundle 索引から affix / ja template を引いて SlotCounter に登録する。
 *   - bundle hit: affix と textJaTemplate を採用
 *   - bundle miss: heuristic で affix 推定、textJaTemplate=null (英語フォールバック)
 *
 * 同キャラ重複 ("ring1 + ring2 同じ MOD") は count を 1 にする。
 * ただし values は 2 回目以降も push する (平均は MOD 個数 base)。
 * オーナー判断: 「装備個数で重み付くのは実装上の傾向値として許容、後日修正検討」。
 * 修正したい場合は perCharSeen ヒット時の `bucket.values.push` を削るだけ。
 */
function addModToSlot(
  slot: SlotCounter,
  modText: string,
  perCharSeen: Set<string>,
): void {
  if (!modText || typeof modText !== "string") return;
  const tpl = normalizeModTemplate(modText);
  if (!tpl) return;

  const idx = modBundleIndex.get(tpl);
  const affix: AffixKind = idx ? idx.affix : heuristicAffix(tpl);
  const textJaTemplate = idx ? idx.textJaTemplate : null;

  const seenKey = `${affix}::${tpl}`;
  if (perCharSeen.has(seenKey)) {
    const bucket = affix === "P" ? slot.prefix.get(tpl) : slot.suffix.get(tpl);
    if (bucket) bucket.values.push(extractNumbers(modText));
    return;
  }
  perCharSeen.add(seenKey);

  const map = affix === "P" ? slot.prefix : slot.suffix;
  let bucket = map.get(tpl);
  if (!bucket) {
    bucket = { template: tpl, count: 0, values: [], textJaTemplate };
    map.set(tpl, bucket);
  } else if (!bucket.textJaTemplate && textJaTemplate) {
    // 後発で bundle hit したら ja template を採用
    bucket.textJaTemplate = textJaTemplate;
  }
  bucket.count += 1;
  bucket.values.push(extractNumbers(modText));
}

/**
 * rare 装備の baseType を「人数ベース」で加算 (同キャラ同スロットは seenBases で de-dup)。
 * 付与スキル (不在のアミュレット等) があれば、そのスキルと装着ジェムも同じ人数単位で積む (2026-09-12)。
 */
function addBaseToSlot(
  slot: SlotCounter,
  item: PoeNinjaItem,
  seenBases: Set<string>,
): void {
  const baseType = item.itemData?.baseType;
  if (!baseType || typeof baseType !== "string") return;
  if (seenBases.has(baseType)) return;
  seenBases.add(baseType);
  let bucket = slot.bases.get(baseType);
  if (!bucket) {
    bucket = { nameEn: baseType, count: 0, skills: new Map<string, SkillBucket>() };
    slot.bases.set(baseType, bucket);
  }
  bucket.count += 1;

  const gems = socketedGemNames(item);
  for (const raw of grantedSkillStrings(item)) {
    const { level, name } = parseGrantedSkill(raw);
    if (!name) continue;
    let sk = bucket.skills.get(name);
    if (!sk) {
      sk = { nameEn: name, count: 0, levelMin: null, levelMax: null, gems: new Map<string, number>() };
      bucket.skills.set(name, sk);
    }
    sk.count += 1;
    if (level !== null) {
      sk.levelMin = sk.levelMin === null ? level : Math.min(sk.levelMin, level);
      sk.levelMax = sk.levelMax === null ? level : Math.max(sk.levelMax, level);
    }
    for (const g of new Set(gems)) sk.gems.set(g, (sk.gems.get(g) ?? 0) + 1);
  }
}

/**
 * 1 ユニークアイテムを全スロット集計 (`asc.uniques`) とスロット別集計に登録する。
 * representative は bucket 作成時 (= 最初に観測したインスタンス) で固定される。
 */
function addUniqueToAscendancy(
  asc: AscendancyCounter,
  item: PoeNinjaItem,
  slot: SlotKey,
  seenUniques: Set<string>,
  seenUniquesInSlot: Set<string>,
): void {
  const data = item.itemData;
  if (!data) return;
  const nameEn = data.typeLine;
  if (!nameEn || typeof nameEn !== "string") return;

  let representative: UniqueRepresentative | null = null;
  const ensureRepresentative = (): UniqueRepresentative => {
    if (representative) return representative;
    representative = {
      typeLine: data.typeLine,
      baseType: data.baseType,
      name: typeof data.name === "string" && data.name ? data.name : undefined,
      implicitMods: Array.isArray(data.implicitMods) ? [...data.implicitMods] : undefined,
      explicitMods: Array.isArray(data.explicitMods) ? [...data.explicitMods] : undefined,
      flavourText: data.flavourText,
      requirements: Array.isArray(data.requirements) ? [...data.requirements] : undefined,
      properties: Array.isArray(data.properties) ? [...data.properties] : undefined,
      level: typeof data.level === "number" ? data.level : undefined,
      ilvl: typeof data.ilvl === "number" ? data.ilvl : undefined,
    };
    return representative;
  };
  const iconUrl = typeof data.icon === "string" ? data.icon : "";

  if (!seenUniques.has(nameEn)) {
    seenUniques.add(nameEn);
    let bucket = asc.uniques.get(nameEn);
    if (!bucket) {
      bucket = { nameEn, count: 0, representative: ensureRepresentative(), icon: iconUrl };
      asc.uniques.set(nameEn, bucket);
    }
    bucket.count += 1;
  }

  if (!seenUniquesInSlot.has(nameEn)) {
    seenUniquesInSlot.add(nameEn);
    const slotMap = asc.uniquesBySlot[slot];
    let slotBucket = slotMap.get(nameEn);
    if (!slotBucket) {
      slotBucket = { nameEn, count: 0, representative: ensureRepresentative(), icon: iconUrl };
      slotMap.set(nameEn, slotBucket);
    }
    slotBucket.count += 1;
  }
}

interface RawSkillGroup {
  allGems?: { name?: string; itemData?: { support?: boolean } }[];
  dps?: { dps?: number }[];
}

/**
 * 1 character の skills[] (poe.ninja のスキルグループ) を集計する。
 *   - 同キャラで同じスキルが複数グループにあっても人数は 1
 *   - サポートは「そのスキルと同じグループにあった物」を人数単位で数える
 *   - DPS 最大のグループの (トリガー以外の) 先頭スキルを「主力」として数える
 */
function ingestCharacterSkills(asc: AscendancyCounter, raw: unknown[] | undefined, isMeta: (nameEn: string) => boolean): void {
  if (!Array.isArray(raw)) return;
  const seenSkill = new Set<string>();
  const seenPair = new Set<string>();
  let bestDps = -1;
  let bestMain: string | null = null;
  for (const g of raw as RawSkillGroup[]) {
    if (!g || !Array.isArray(g.allGems)) continue;
    const mains: string[] = [];
    const supports: string[] = [];
    for (const gem of g.allGems) {
      const n = typeof gem?.name === "string" ? gem.name.trim() : "";
      if (!n) continue;
      if (gem.itemData?.support) supports.push(n);
      else mains.push(n);
    }
    if (mains.length === 0) continue;
    const dps = Array.isArray(g.dps) ? g.dps.reduce((m, d) => Math.max(m, typeof d?.dps === "number" ? d.dps : 0), 0) : 0;
    if (dps > bestDps) {
      bestDps = dps;
      bestMain = mains.find((m) => !isMeta(m)) ?? mains[0];
    }
    for (const m of mains) {
      let b = asc.skills.get(m);
      if (!b) {
        b = { nameEn: m, count: 0, mainCount: 0, supports: new Map<string, number>() };
        asc.skills.set(m, b);
      }
      if (!seenSkill.has(m)) {
        seenSkill.add(m);
        b.count += 1;
      }
      for (const s of supports) {
        const key = `${m}::${s}`;
        if (seenPair.has(key)) continue;
        seenPair.add(key);
        b.supports.set(s, (b.supports.get(s) ?? 0) + 1);
      }
    }
  }
  if (bestMain && bestDps > 0) {
    const b = asc.skills.get(bestMain);
    if (b) b.mainCount += 1;
  }
}

/**
 * 1 character の items[] を見て:
 *   - レア装備 (frameType=2): スロット別に MOD 集計 + ベース集計
 *   - ユニーク装備 (frameType=3): キャラ単位 de-dup でユニーク使用率に加算
 */
export function ingestCharacterItems(asc: AscendancyCounter, charItems: CharacterItems, isMeta: (nameEn: string) => boolean = () => false): void {
  ingestCharacterSkills(asc, charItems.skills, isMeta);
  if (!Array.isArray(charItems.items)) return;

  const seenPerSlot = emptySlotSets();
  const seenBasesPerSlot = emptySlotSets();
  const seenUniques = new Set<string>();
  const seenUniquesPerSlot = emptySlotSets();

  for (const raw of charItems.items) {
    if (!isPoeNinjaItem(raw)) continue;

    const rareSlot = classifyEquipItem(raw);
    if (rareSlot) {
      const mods = Array.isArray(raw.itemData?.explicitMods) ? raw.itemData!.explicitMods! : [];
      const seen = seenPerSlot[rareSlot];
      const slotCounter = asc.slots[rareSlot];
      for (const modText of mods) {
        addModToSlot(slotCounter, modText, seen);
      }
      addBaseToSlot(slotCounter, raw, seenBasesPerSlot[rareSlot]);
      continue;
    }

    const uniqueSlot = classifyUniqueItem(raw);
    if (uniqueSlot) {
      addUniqueToAscendancy(asc, raw, uniqueSlot, seenUniques, seenUniquesPerSlot[uniqueSlot]);
    }
  }
}
