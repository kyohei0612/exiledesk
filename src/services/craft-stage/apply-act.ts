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
import { jaOfOmen } from "../htc/labels";
import { tr } from "../../i18n/lang";

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
  if (item.identified !== false) return skip(item, tr("鑑定済みのアイテムには使えない", "Item is already identified"));
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
/** SHARD_REASON の画面の言葉 (英語の画面では英語) */
export const shardReason = (): string => tr(SHARD_REASON, `${SHARDS_PER_ORB} shards make an orb (can't be used on items)`);

/** 宝飾職人のオーブ: スキルジェムのサポート枠を 3 (見習い) / 4 (上級) / 5 (完全) にする。それ以上ある時は打てない */
/** 宝飾職人のオーブ → サポート枠の数 (クライアントの説明文) */
export const JEWELLER_TO: Record<string, number> = { jeweller_lesser: 3, jeweller_greater: 4, jeweller_perfect: 5 };
export function applyJeweller(item: StageItem, key: string): StageApply {
  if (!isGem(item.cls.category)) return skip(item, tr("スキルジェムにだけ使える", "Skill Gems only"));
  const to = JEWELLER_TO[key] ?? 3;
  const now = item.gemSockets ?? 0;
  if (now >= to) return skip(item, tr(`サポート枠がもう ${now} つある (${to} つ未満にだけ使える)`, `Already has ${now} Support Gem Sockets (only usable below ${to})`));
  return { applied: true, item: { ...item, gemSockets: to }, added: [], removed: [] };
}

// ---- 品質 (砥石 / 端材 / 飾り玉 / プリズム) ----------------------------------------------------------------------
// 対象 (クライアントの説明文): 砥石「martial weapon」/ 端材「armour」/ 飾り玉「flask」/ プリズム「Skill Gem」
// 効果 (poe2db の Quality): 武器は品質 1% ごとに物理ダメージ 1% more、防具は防御力 1% more、フラスコは回復量 1% more。上限 20%
export const MARTIAL = ["Bows", "Crossbows", "OneHand_Maces", "TwoHand_Maces", "Quarterstaves", "Spears", "Talismans"];
export const CASTER = ["Wands", "Staves", "Sceptres"];
export const ARMOUR = ["Body_Armours", "Helmets", "Gloves", "Boots", "Shields", "Bucklers", "Foci"];
export const QUALITY_TARGET: Record<string, { cats: string[]; ja: string; en: string }> = {
  // ja は打てない時の短い理由にも使う。言葉はゲームの説明文 (currency-hover-ja.json) と同じ (POE2Tube 要望 ⑨「マーシャル武器」)
  whetstone: { cats: MARTIAL, ja: "マーシャル武器", en: "Martial Weapons" },
  scrap: { cats: ARMOUR, ja: "防具", en: "Armour" },
  bauble: { cats: ["LifeFlask", "ManaFlask"], ja: "フラスコ", en: "Flasks" },
  gemcutter: { cats: ["SkillGem"], ja: "スキルジェム", en: "Skill Gems" },
  // 2026-09-29: 秘術師の彫刻針「ワンド、スタッフまたはセプターの品質を向上させる」
  etcher: { cats: CASTER, ja: "ワンド・スタッフ・セプター", en: "Wands, Staves and Sceptres" },
};
export const QUALITY_MAX = 20;
/**
 * 1 回で上がる品質 (2026-10-06 オーナーがゲームで確認、POE2Tube 要望 ㉞-8)。レアリティに関係なく、
 * ガラス吹きの飾り玉 (フラスコ)・ヴァールインフューザーは 1 個 1%、宝石細工師のプリズム (ジェム) は 5%。
 * 装備の品質カレンシー (鍛冶屋の砥石・秘術師の彫刻針・鎧鍛冶の端材) は **1 個で +1% か +2% のランダム** (2026-10-07 オーナーの訂正、POE2Tube 要望 ㊱。
 * 1 と 2 の割合は公開値が無いので等分。上限 20% は超えない)。前は攻略サイトの「ノーマル 5 / マジック 2 / レア 1」
 */
export const QUALITY_STEP = { item: 1, gem: 5 } as const;
/** 装備の品質カレンシーで上がる量の候補 (等分で引く) */
export const QUALITY_STEP_ITEM_ROLLS: readonly number[] = [1, 2];
export const QUALITY_STEP_CONFIRMED = true;

export function applyQuality(item: StageItem, key: string, rng: () => number = Math.random): StageApply {
  const t = QUALITY_TARGET[key]!;
  if (!t.cats.includes(item.cls.category)) return skip(item, tr(`${t.ja}にだけ使える`, `${t.en} only`));
  if (item.quality >= QUALITY_MAX) return skip(item, tr(`品質が上限 (${QUALITY_MAX}%)`, `Quality is maxed (${QUALITY_MAX}%)`));
  // フラスコの飾り玉は 1 固定 (QUALITY_TARGET に無いのでここは装備かジェム)。装備は 1 か 2 を等分で引く (同じ seed なら再生でも同じ)
  const step = isGem(item.cls.category) ? QUALITY_STEP.gem : QUALITY_STEP_ITEM_ROLLS[Math.min(QUALITY_STEP_ITEM_ROLLS.length - 1, Math.floor(rng() * QUALITY_STEP_ITEM_ROLLS.length))]!;
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

/**
 * お告げ (2026-10-05): 可能性のお告げ = 壊さない (外れてもノーマルのまま残る)。古代人のお告げ = 同じアイテムクラスのランダムなユニーク
 * (候補は呼ぶ側が同じクラスの全部を渡す。ベースはそのユニークのベースに変わる: apply-currency.ts の toUniqueBase、要望 ㉝ の 6)
 */
export function applyChance(item: StageItem, rng: () => number, uniques: Array<{ en: string; ja: string }>, outcome?: string, used: readonly string[] = []): StageApply {
  if (item.rarity !== "normal") return skip(item, tr("ノーマルのアイテムにだけ使える", "Normal items only"));
  if (!uniques.length) return skip(item, tr("このベースのユニークが無い", "No Unique for this base"));
  const win = outcome === "unique" ? true : outcome === "destroyed" ? false : rng() < CHANCE_UNIQUE_P;
  if (!win) {
    if (used.includes("OmenofChance")) return { applied: true, item, added: [], removed: [], note: tr("可能性のお告げ: ユニークにはならなかったが、壊れずにノーマルのまま残った", "Omen of Chance: no Unique, but the item stayed Normal instead of being destroyed") };
    return { applied: true, item: { ...item, destroyed: true }, added: [], removed: [] };
  }
  const u = uniques[Math.floor(rng() * uniques.length)]!;
  const note = used.includes("OmenoftheAncients") ? tr(`${jaOfOmen("OmenoftheAncients") ?? "古代のお告げ"}: 同じ種類のユニーク ${uniques.length} 種類から選んだ`, `Omen of the Ancients: picked from ${uniques.length} Uniques of the same Item Class`) : undefined;
  return { applied: true, item: { ...item, rarity: "unique", unique: u, prefixes: [], suffixes: [] }, added: [], removed: [], ...(note ? { note } : {}) };
}
