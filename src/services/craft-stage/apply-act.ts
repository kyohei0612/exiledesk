/**
 * クラフトステージ: アクト中に落ちるカレンシー (2026-09-28、POE2Tube 要望 ⑧「アクト中に落ちるカレンシーの解説」)
 *
 * 出典はクライアントの BaseItemTypes / CurrencyItems (data-cache/base_items.json の description / directions / stack_size):
 *   - 鑑定の巻物 (Scroll of Wisdom)「Identifies an item」→ 未鑑定 (identified: false) を鑑定する
 *   - シャード 4 種「A stack of 10 shards becomes an Orb of …」→ 10 個で 1 個のオーブ。アイテムには使えない
 *     (手順の shard の手 = 1 個拾う。棚の個数 (item.shards) が 10 になるとオーブに変わる)
 *   - 宝飾職人のオーブ (見習い / 上級)「Sets a Skill Gem to have 3 / 4 Support Gem Sockets … fewer than 3 / 4」
 *   - 品質 4 種 (砥石 = martial weapon / 端材 = armour / 飾り玉 = flask / プリズム = skill gem) と可能性のオーブは
 *     数値の出典 (上がり幅・確率) を ADR-001 に書く (apply-act-quality.ts)
 */
import type { StageApply, StageItem } from "./types";
import { skip } from "./stage-core";
import { isGem } from "./stage-bases";

/** シャードのキー → 揃った時に変わるオーブのキー (クライアントの full_stack_turns_into) */
export const SHARD_TO_ORB: Record<string, string> = {
  transmute_shard: "transmute",
  regal_shard: "regal",
  artificer_shard: "artificer",
  chance_shard: "chance",
};
/** 何個で 1 個になるか (クライアントの stack_size。4 種とも 10) */
export const SHARDS_PER_ORB = 10;
export const isShard = (key: string): boolean => key in SHARD_TO_ORB;

/** 鑑定の巻物 */
export function applyWisdom(item: StageItem): StageApply {
  if (item.identified !== false) return skip(item, "鑑定済みのアイテムには使えない");
  return { applied: true, item: { ...item, identified: true }, added: [...item.prefixes, ...item.suffixes], removed: [] };
}

/**
 * シャードを 1 個拾う (アイテムは変わらない)。10 個になったらオーブ 1 個に変わる (棚の個数は 0 に戻る)。
 * 手で打つ画面でアイテムに使おうとした時は打てない (useShardOnItem)
 */
export function collectShard(item: StageItem, key: string): StageApply & { madeOrb?: string } {
  const now = (item.shards?.[key] ?? 0) + 1;
  const made = now >= SHARDS_PER_ORB;
  const shards = { ...item.shards, [key]: made ? now - SHARDS_PER_ORB : now };
  return { applied: true, item: { ...item, shards }, added: [], removed: [], ...(made ? { madeOrb: SHARD_TO_ORB[key] } : {}) };
}
export const SHARD_REASON = `シャードは ${SHARDS_PER_ORB} 個集めるとオーブになる (アイテムには使えない)`;

/** 宝飾職人のオーブ: スキルジェムのサポート枠を 3 (見習い) / 4 (上級) / 5 (完全) にする。それ以上ある時は打てない */
/** 宝飾職人のオーブ → サポート枠の数 (クライアントの説明文) */
export const JEWELLER_TO: Record<string, number> = { jeweller_lesser: 3, jeweller_greater: 4, jeweller_perfect: 5 };
export function applyJeweller(item: StageItem, key: string): StageApply {
  if (!isGem(item.cls.category)) return skip(item, "スキルジェムにだけ使える");
  const to = JEWELLER_TO[key] ?? 3;
  const now = item.gemSockets ?? 0;
  if (now >= to) return skip(item, `サポート枠がもう ${now} つある (${to} つ未満にだけ使える)`);
  return { applied: true, item: { ...item, gemSockets: to }, added: [], removed: [] };
}

// ---- 品質 (砥石 / 端材 / 飾り玉 / プリズム) ----------------------------------------------------------------------
// 対象 (クライアントの説明文): 砥石「martial weapon」/ 端材「armour」/ 飾り玉「flask」/ プリズム「Skill Gem」
// 効果 (poe2db の Quality): 武器は品質 1% ごとに物理ダメージ 1% more、防具は防御力 1% more、フラスコは回復量 1% more。上限 20%
const MARTIAL = ["Bows", "Crossbows", "OneHand_Maces", "TwoHand_Maces", "Quarterstaves", "Spears", "Talismans"];
const ARMOUR = ["Body_Armours", "Helmets", "Gloves", "Boots", "Shields", "Bucklers", "Foci"];
export const QUALITY_TARGET: Record<string, { cats: string[]; ja: string }> = {
  // ja は打てない時の短い理由にも使う。言葉はゲームの説明文 (currency-hover-ja.json) と同じ (POE2Tube 要望 ⑨「マーシャル武器」)
  whetstone: { cats: MARTIAL, ja: "マーシャル武器" },
  scrap: { cats: ARMOUR, ja: "防具" },
  bauble: { cats: ["LifeFlask", "ManaFlask"], ja: "フラスコ" },
  gemcutter: { cats: ["SkillGem"], ja: "スキルジェム" },
};
export const QUALITY_MAX = 20;
/**
 * 1 回で上がる品質。**一次ソースなし (未確定)**。装備は攻略サイト (aoeah) の「ノーマル 5% / マジック 2% / レア・ユニーク 1%」
 * (PoE1 と同じ)、プリズムは 1% と 5% の記述が食い違う (5% を仮に置く)。確かめたらここだけ直す (ADR-001 に出典を書く)
 */
export const QUALITY_STEP = { normal: 5, magic: 2, rare: 1, unique: 1, gem: 5 } as const;
export const QUALITY_STEP_CONFIRMED = false;

export function applyQuality(item: StageItem, key: string): StageApply {
  const t = QUALITY_TARGET[key]!;
  if (!t.cats.includes(item.cls.category)) return skip(item, `${t.ja}にだけ使える`);
  if (item.quality >= QUALITY_MAX) return skip(item, `品質が上限 (${QUALITY_MAX}%)`);
  const step = isGem(item.cls.category) ? QUALITY_STEP.gem : QUALITY_STEP[item.rarity];
  return { applied: true, item: { ...item, quality: Math.min(QUALITY_MAX, item.quality + step) }, added: [], removed: [] };
}

// ---- 可能性のオーブ ------------------------------------------------------------------------------------------------
// クライアントの説明文「Unpredictably either upgrades a Normal item to Unique rarity or destroys it」: ノーマルにだけ、ユニークか破壊。
// なるユニークは そのベースのユニーク (src/i18n/vaal-enchants.json の uniques、ベースごと)。ユニークの間の重みは公開値なし → 等分
/**
 * ユニークになる確率。**公開値なし (未確定)**。maxroll も「非公開のレアリティの段で決まる」とだけ書く。
 * 動画では手順の outcome ("unique" / "destroyed") で結果を指定する前提。指定が無い時だけこの仮の値で引く
 */
export const CHANCE_UNIQUE_P = 0.1;
export const CHANCE_P_CONFIRMED = false;

export function applyChance(item: StageItem, rng: () => number, uniques: Array<{ en: string; ja: string }>, outcome?: string): StageApply {
  if (item.rarity !== "normal") return skip(item, "ノーマルのアイテムにだけ使える");
  if (!uniques.length) return skip(item, "このベースのユニークが無い");
  const win = outcome === "unique" ? true : outcome === "destroyed" ? false : rng() < CHANCE_UNIQUE_P;
  if (!win) return { applied: true, item: { ...item, destroyed: true }, added: [], removed: [] };
  const u = uniques[Math.floor(rng() * uniques.length)]!;
  return { applied: true, item: { ...item, rarity: "unique", unique: u, prefixes: [], suffixes: [] }, added: [], removed: [] };
}
