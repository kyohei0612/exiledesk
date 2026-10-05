/**
 * スロットへの積み上げ (MOD / ベース / ユニーク)
 *
 * ingest.ts から切り出し (2026-09-26)。
 */
import type { AffixKind, SlotKey, UniqueRepresentative } from "../types";
import { grantedSkillStrings, parseGrantedSkill, socketedGemNames, type PoeNinjaItem } from "../ninja-item";
import { extractNumbers, normalizeModTemplate } from "../../mods/normalize";
import { heuristicAffix, modBundleIndex } from "../../mods/dictionaries";
import { engineJaTemplate, engineSide } from "../../mods/engine-mods";
import type { ItemBase } from "../../../vendor/poe2htc/engine/types";
import type { AscendancyCounter, SkillBucket, SlotCounter } from "./counters";

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
export function addModToSlot(
  slot: SlotCounter,
  modText: string,
  perCharSeen: Set<string>,
  /** その装備のエンジンの行 (側を装備で引く。[[engine-mods.ts]] rowsForSlot) */
  rows?: readonly ItemBase[],
): void {
  if (!modText || typeof modText !== "string") return;
  const tpl = normalizeModTemplate(modText);
  if (!tpl) return;

  // 側と日本語はエンジン (クラフトステージと同じ MOD のデータ、[[engine-mods.ts]]) から。エンジンに無い MOD (ハンドラップ等の
  // まだ入れていない種類) だけ、クライアントから作った前の表、それも無ければ文面の目安
  const side = engineSide(tpl, rows);
  const idx = side ? null : modBundleIndex.get(tpl);
  const affix: AffixKind = side ?? idx?.affix ?? heuristicAffix(tpl);
  const textJaTemplate = engineJaTemplate(tpl) ?? idx?.textJaTemplate ?? modBundleIndex.get(tpl)?.textJaTemplate ?? null;

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
export function addBaseToSlot(
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
export function addUniqueToAscendancy(
  asc: AscendancyCounter,
  item: PoeNinjaItem,
  slot: SlotKey,
  seenUniques: Set<string>,
  seenUniquesInSlot: Set<string>,
): void {
  const data = item.itemData;
  if (!data) return;
  // 2026-09-29: ユニークの名前 (Svalinn) で数える。typeLine はベースの名前 (Crucible Tower Shield) なので、
  // 同じベースの別のユニーク (指輪など) が 1 つにまとまっていた
  const nameEn = (typeof data.name === "string" && data.name) || data.typeLine;
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
