/**
 * POE2 Mod データの読み込みとユーティリティ
 *
 * バンドル `src/i18n/mods-bundle.json` は RePoE fork (poe2) の
 * mods.json (English / Japanese) から以下を統合してスリム化:
 *   - normal: domain in (item|misc|flask|jewel) かつ generation_type in (prefix|suffix)
 *   - essence: is_essence_only=true（PoE2 のエッセンス専用 mod シェル）
 *   - corrupt: generation_type=corrupted (Vaal Orb)
 *   - desecrated: domain=desecrated (Abyss/Ulaman/Kurgal/Amanamu)
 *
 * 抽出は `scripts/extract-mods-bundle.mjs` で再現可能。
 * License: コードは MIT (RePoE)、データは GGG 所有 (ToS 準拠)。
 */

import modsBundleRaw from "../i18n/mods-bundle.json";
import essenceModsRaw from "../i18n/essence-mods.json";
import statOrderRaw from "../i18n/stat-order.json";
import poedbOrderRaw from "../i18n/poedb-mod-order.json";

/** PoB Mod*.lua から抽出した key → statOrder 数値の map（GGG 公式 stat ID 順） */
const STAT_ORDER = statOrderRaw as Record<string, number>;

/** POE2DB から抽出した group key の表示順序（slot × prefix/suffix × kind 別） */
const POEDB_ORDER = poedbOrderRaw as unknown as Record<
  string,
  Record<string, string[] | undefined>
>;

/** mod の statOrder を取得（未登録なら大きい値で末尾に push） */
export function statOrderOf(mod: Mod): number {
  return STAT_ORDER[mod.key] ?? 999999;
}

/**
 * POE2DB 順序に基づいた mod の order index を取得。
 * @returns 0..N: POE2DB に登録された order、null: 未登録（fallback で statOrder + alphabetical 使用）
 */
export function poedbOrderOf(
  mod: Mod,
  itemTag: string,
  isSpecialKind: boolean,
): number | null {
  const slotMap = POEDB_ORDER[itemTag];
  if (!slotMap) return null;
  // 簡易: normal mod のみ POE2DB の prefix_normal / suffix_normal を参照
  if (isSpecialKind) return null;
  const list =
    mod.type === "prefix" ? slotMap.prefix_normal : slotMap.suffix_normal;
  if (!list) return null;
  const groupKey = mod.groups[0];
  if (!groupKey) return null;
  const idx = list.indexOf(groupKey);
  return idx === -1 ? null : idx;
}

/** PoB の Data/Essence.lua から抽出した「essence で焼ける mod key → 該当 slot 配列」 */
const ESSENCE_MODS = essenceModsRaw as Record<string, string[]>;

/** essence で焼ける全 mod key の Set（kind 判定で使う） */
export const ESSENCE_MOD_KEYS = new Set(Object.keys(ESSENCE_MODS));

/** 指定 itemTag に対し、essence で焼ける mod key の Set を返す */
export function essenceModKeysForSlot(itemTag: string): Set<string> {
  const out = new Set<string>();
  for (const [k, tags] of Object.entries(ESSENCE_MODS)) {
    if (tags.includes(itemTag)) out.add(k);
  }
  return out;
}

export interface SpawnWeight {
  t: string;
  w: number;
}

export interface ModStat {
  id: string;
  min?: number;
  max?: number;
}

export interface Mod {
  key: string;
  name_en: string;
  name_ja: string;
  text_en: string;
  text_ja: string;
  type: "prefix" | "suffix";
  groups: string[];
  level: number;
  stats: ModStat[];
  spawn: SpawnWeight[];
  tags: string[];
  /** Essence currency 固有 mod */
  essence?: number;
  /** Vaal Orb コラプトでのみ付く mod */
  corrupt?: number;
  /** 冒涜 (Desecrated) ドメインの mod */
  desecrated?: number;
}

/** 特殊 mod 分類のラベル（自動判定用） */
export function modSpecialKind(
  m: Mod,
): "essence" | "corrupt" | "desecrated" | null {
  if (m.essence) return "essence";
  if (m.corrupt) return "corrupt";
  if (m.desecrated) return "desecrated";
  return null;
}

/** 指定アイテムタグでの spawn weight を返す（無ければ 0） */
export function modWeightFor(mod: Mod, itemTag: string): number {
  const sw = mod.spawn.find((s) => s.t === itemTag);
  return sw?.w ?? 0;
}

/** mod group：同 group 内に T1 / T2 / T3 ... と複数 tier */
export interface ModGroup {
  id: string;
  type: "prefix" | "suffix";
  /** 高 lv → 低 lv の降順。tiers[0] が T1（最高 tier） */
  tiers: Mod[];
}

/**
 * 指定アイテムタグ + ilvl で、各 group の利用可能な全 tier を含むグループ配列を返す。
 * tier 別選択 UI で使う。
 */
export function getModGroupsForItem(
  itemTag: string,
  maxLevel = 99,
  baseTags?: string[],
): ModGroup[] {
  const filtered = allMods.filter(
    (m) =>
      modCanSpawnOn(m, itemTag) &&
      m.level <= maxLevel &&
      (baseTags === undefined || modMatchesArmourType(m, baseTags)),
  );
  // 同じ groupId でも type (prefix/suffix) が違えば別 group として扱う。
  // 例: EssenceAbyss group は prefix と suffix の両方を持つ → 別 group に分離する
  // ことで suffix section にも EssenceAbyssSuffix が出る。
  const byGroupAndType = new Map<string, Mod[]>();
  for (const m of filtered) {
    const g = m.groups[0];
    if (!g) continue;
    const key = `${m.type}:${g}`;
    if (!byGroupAndType.has(key)) byGroupAndType.set(key, []);
    byGroupAndType.get(key)!.push(m);
  }
  const groups: ModGroup[] = [];
  for (const mods of byGroupAndType.values()) {
    mods.sort((a, b) => b.level - a.level);
    groups.push({
      id: mods[0].groups[0],
      type: mods[0].type,
      tiers: mods,
    });
  }
  return groups.sort((a, b) => {
    if (a.type !== b.type) return a.type === "prefix" ? -1 : 1;
    // POE2DB の表示順序を最優先（slot 別 group order）
    const aSpecial = !!modSpecialKind(a.tiers[0]);
    const bSpecial = !!modSpecialKind(b.tiers[0]);
    const aIdx = poedbOrderOf(a.tiers[0], itemTag, aSpecial);
    const bIdx = poedbOrderOf(b.tiers[0], itemTag, bSpecial);
    if (aIdx !== null && bIdx !== null) return aIdx - bIdx;
    if (aIdx !== null) return -1; // a だけ登録 → a を先
    if (bIdx !== null) return 1;
    // 両方未登録 → statOrder + 名前順 fallback
    const so = statOrderOf(a.tiers[0]) - statOrderOf(b.tiers[0]);
    if (so !== 0) return so;
    return a.tiers[0].text_ja.localeCompare(b.tiers[0].text_ja, "ja");
  });
}

const raw = modsBundleRaw as Record<string, Omit<Mod, "key">>;
export const allMods: Mod[] = Object.entries(raw).map(([key, m]) => ({
  key,
  ...m,
}));

/** タグに該当するか（weight > 0） */
export function modCanSpawnOn(mod: Mod, itemTag: string): boolean {
  return mod.spawn.some((s) => s.t === itemTag && s.w > 0);
}

/** 指定 itemTag・baseTags 制約下での全 prefix or suffix の総 weight */
export function totalSpawnWeightForTypeOnSlot(
  itemTag: string,
  type: "prefix" | "suffix",
  baseTags?: string[],
): number {
  let total = 0;
  for (const m of allMods) {
    if (m.type !== type) continue;
    if (modSpecialKind(m)) continue; // essence/corrupt/desecrated は通常クラフトで出ないので除外
    if (baseTags && !modMatchesArmourType(m, baseTags)) continue;
    const w = modWeightFor(m, itemTag);
    if (w > 0) total += w;
  }
  return total;
}

/**
 * 指定 mod が、指定 itemTag・baseTags 下でクラフト時に出る個別確率 (0..1)。
 * 計算: mod の weight / 全同 type 通常 mod の weight 合計
 *
 * これは「1 つの affix slot が空のとき、Exalt 等で 1 mod 追加した結果がこの mod になる確率」の近似。
 * 実際にはアイテム class や元素タグで weight 補正が入る場合があるが、簡易計算。
 */
export function probabilityOfMod(
  mod: Mod,
  itemTag: string,
  baseTags?: string[],
): number {
  const w = modWeightFor(mod, itemTag);
  if (w === 0) return 0;
  const total = totalSpawnWeightForTypeOnSlot(itemTag, mod.type, baseTags);
  return total === 0 ? 0 : w / total;
}

/**
 * POE2 防具 base type tag。helmet/body/gloves/boots は同じ base type 7 種
 * (Str / Dex / Int / Str+Dex / Str+Int / Dex+Int / Str+Dex+Int) のいずれかに分類される。
 * 各 mod の spawn に「str_armour」等が weight > 0 で含まれていれば、その base type のみに出る。
 */
const ARMOUR_TYPE_TAGS = new Set([
  "str_armour",
  "dex_armour",
  "int_armour",
  "str_dex_armour",
  "str_int_armour",
  "dex_int_armour",
  "str_dex_int_armour",
]);

/**
 * mod が指定 base の type 制約を満たすかチェック。
 * - mod が armour type tag を 1 つも spawn に持たない → 全 base type に乗る (制約なし、true)
 * - mod が armour type tag を持つ → baseTags にいずれかが含まれていれば true、なければ false
 */
export function modMatchesArmourType(mod: Mod, baseTags: string[]): boolean {
  const modArmourTypes = mod.spawn
    .filter((s) => ARMOUR_TYPE_TAGS.has(s.t) && s.w > 0)
    .map((s) => s.t);
  if (modArmourTypes.length === 0) return true;
  return baseTags.some((t) => modArmourTypes.includes(t));
}

/**
 * 特殊 mod (essence / corrupt / desecrated) は spawn tag が item slot と
 * 別系統（default / ulaman_mod / amanamu_mod / kurgal_mod / *jewel 等）のため、
 * `modCanSpawnOn(itemTag)` では UI から漏れる。
 * kind ごとに「装備に乗りうる」を判定するロジックを別に持つ。
 */
export function modCanAppearAsKindOnSlot(
  mod: Mod,
  kind: "essence" | "corrupt" | "desecrated",
  itemTag: string,
): boolean {
  // 通常の item-tag spawn weight はまず最優先でチェック
  if (modCanSpawnOn(mod, itemTag)) return true;

  if (kind === "essence") {
    // kind="essence" の 44 件はほぼ全て spawn を持たない（OR タイプ EssenceDisplay 系・
    // is_essence_only=true 群）。slot 別表示の根拠が無いため、ここでは spawn match のみで通す。
    // 「ゲーム内エッセンスサフィックス/プレフィックス」(画像3 等で見える) の正体は、
    // normal kind だが key に `Essence` を含む 191 件で、CraftHelper の partitionBySpecialKind の
    // tierEffectiveKind() が essence section に振り分ける。
    return false;
  }

  if (kind === "corrupt") {
    // corrupt は Vaal Orb で付くため、`default` weight を持つ汎用 mod は全 slot 候補。
    // ただし one_hand_weapon / two_hand_weapon のような大分類タグも weapon 系 slot に該当。
    if ((mod.spawn ?? []).some((s) => s.t === "default" && s.w > 0)) return true;
    return false;
  }

  if (kind === "desecrated") {
    // desecrated は **必ず slot 別の spawn weight を持つ**。例えば
    // `AbyssModArmourJewelleryAmanamuPrefixXxx` は ring/amulet/armour 等の slot tag に
    // weight を持つ。 boss tag (`ulaman_mod` 等) があってもそれだけで全 slot 候補扱いに
    // すると武器用 mod が指輪に出るなど過剰表示になる。
    // → 既に冒頭の modCanSpawnOn(mod, itemTag) で true なら通過、それ以外は false。
    return false;
  }
  return false;
}

/**
 * 指定 itemTag に対し、特定 kind の全 ModGroup を返す。
 * essence/corrupt/desecrated section に表示されない問題を解決するために導入。
 */
export function getModGroupsByKindForItem(
  itemTag: string,
  kind: "essence" | "corrupt" | "desecrated",
  maxLevel = 99,
): ModGroup[] {
  const filtered = allMods.filter(
    (m) =>
      modSpecialKind(m) === kind &&
      m.level <= maxLevel &&
      modCanAppearAsKindOnSlot(m, kind, itemTag),
  );
  // 同じ groupId でも type が違えば別 group として扱う（getModGroupsForItem と同様）
  const byGroupAndType = new Map<string, Mod[]>();
  for (const m of filtered) {
    const g = m.groups[0];
    if (!g) continue;
    const key = `${m.type}:${g}`;
    if (!byGroupAndType.has(key)) byGroupAndType.set(key, []);
    byGroupAndType.get(key)!.push(m);
  }
  const groups: ModGroup[] = [];
  for (const mods of byGroupAndType.values()) {
    mods.sort((a, b) => b.level - a.level);
    groups.push({
      id: mods[0].groups[0],
      type: mods[0].type,
      tiers: mods,
    });
  }
  return groups.sort((a, b) => {
    if (a.type !== b.type) return a.type === "prefix" ? -1 : 1;
    // POE2DB の表示順序を最優先（slot 別 group order）
    const aSpecial = !!modSpecialKind(a.tiers[0]);
    const bSpecial = !!modSpecialKind(b.tiers[0]);
    const aIdx = poedbOrderOf(a.tiers[0], itemTag, aSpecial);
    const bIdx = poedbOrderOf(b.tiers[0], itemTag, bSpecial);
    if (aIdx !== null && bIdx !== null) return aIdx - bIdx;
    if (aIdx !== null) return -1; // a だけ登録 → a を先
    if (bIdx !== null) return 1;
    // 両方未登録 → statOrder + 名前順 fallback
    const so = statOrderOf(a.tiers[0]) - statOrderOf(b.tiers[0]);
    if (so !== 0) return so;
    return a.tiers[0].text_ja.localeCompare(b.tiers[0].text_ja, "ja");
  });
}

/**
 * 指定アイテムタグ + アイテム lvl 上限に対し、各グループで required_level ≤ maxLevel
 * の中で最高 tier の mod のみを返す。6 mod 選択 UI で「最大値の組合せ」用。
 *
 * @param itemTag spawn 対象タグ（"helmet"|"ring"|...）
 * @param maxLevel アイテム lvl（required_level がこれ以下の mod のみ表示）
 */
export function getMaxTierMods(itemTag: string, maxLevel = 99): Mod[] {
  const filtered = allMods.filter(
    (m) => modCanSpawnOn(m, itemTag) && m.level <= maxLevel,
  );
  const byGroup = new Map<string, Mod>();
  for (const m of filtered) {
    for (const g of m.groups) {
      const cur = byGroup.get(g);
      if (!cur || m.level > cur.level) byGroup.set(g, m);
    }
  }
  return Array.from(byGroup.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === "prefix" ? -1 : 1;
    return a.text_ja.localeCompare(b.text_ja, "ja");
  });
}

/** よく使うアイテムタグ（日本語表示） — POE2 全装備カテゴリ */
export const ITEM_TAGS: { id: string; label: string }[] = [
  // 防具
  { id: "helmet", label: "兜" },
  { id: "body_armour", label: "鎧" },
  { id: "gloves", label: "手袋" },
  { id: "boots", label: "靴" },
  // オフハンド
  { id: "shield", label: "盾" },
  { id: "focus", label: "フォーカス" },
  { id: "quiver", label: "矢筒" },
  // 宝飾品
  { id: "belt", label: "ベルト" },
  { id: "amulet", label: "アミュレット" },
  { id: "ring", label: "指輪" },
  { id: "talisman", label: "タリスマン" },
  // 片手武器
  { id: "claw", label: "鉤爪" },
  { id: "dagger", label: "短剣" },
  { id: "wand", label: "ワンド" },
  { id: "sword", label: "片手剣" },
  { id: "axe", label: "片手斧" },
  { id: "mace", label: "片手メイス" },
  { id: "sceptre", label: "セプター" },
  { id: "spear", label: "スピア" },
  { id: "flail", label: "フレイル" },
  // 両手武器
  { id: "bow", label: "弓" },
  { id: "staff", label: "スタッフ" },
  { id: "warstaff", label: "クォータースタッフ" },
  { id: "crossbow", label: "クロスボウ" },
  { id: "fishing_rod", label: "釣り竿" },
  { id: "trap", label: "トラップ" },
];

/**
 * bundle 由来のタグマーカーを剥がして人間可読 / POE2 公式 paste 互換テキストに整形。
 *
 * bundle 形式は `[link|displayed]` の link/text 表記:
 *   text_ja: "[Physical|物理]ダメージを..." → 表示「物理ダメージを...」
 *   text_en: "[Resistances|Cold Resistance]" → 表示「Cold Resistance」
 *   単独: "[Lightning]" → 「Lightning」（POE2 hover タグ）
 *
 * 常に表示部分 ($2) を採用、`[X]` 単独マーカーも括弧除去。これで
 * 日英どちらの bundle テキストでも CoE 互換の純 POE2 paste 形式が得られる。
 */
export function cleanModText(text: string): string {
  return text
    .replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2")
    .replace(/\[([^\]]+)\]/g, "$1");
}
