/**
 * augment-rules.ts — オーグメント (ルーン / ソウルコア / アイドル / アビサルアイ) をはめる・置き換える・取り外す決まり (2026-10-03)
 *
 * オーナー 2026-10-03「ルーン関係まだ手を入れてなかった。ソケットバウンド系と普通のルーンを確認しよう。
 *   アストリッドとか、ソケットバウンドじゃないのに付け替えできないとかある。チェック」。
 * 表は src/i18n/augment-rules.json (scripts/build-augment-rules-from-client.mjs がクライアントの説明文から機械的に作る)。
 * 「外せるか・置き換えられるか・どの部位に・何個まで」はここだけで決める (クラフトステージ・クラフト計算機のソケットとも)。
 *
 * ゲームの決まり (説明文):
 *   - 普通のルーンなど (ClientStrings.ItemDescriptionSoulCore):「一度ソケットすると取り外すことはできないが、他のオーグメントアイテムで置き換えることができる」
 *   - アストリッドの創造性:「一度ソケットすると取り外すことはできないが、他のオーグメントアイテムで置き換えることはできる」
 *   - ソケットバウンド (セールの凱旋・アトジリのソウルコア・アルダーの○○ など):「ソケットすると取り外すことも置き換えることもできない」
 *   - 置き換えで外れた物は手元に戻らない (取り外せないので) = 壊れる。戻す手は抽出のオーブ (装備を壊して、ソケットバウンドでない物を取り戻す) だけ
 */
import rulesRaw from "../i18n/augment-rules.json";
import { lang, tr } from "../i18n/lang";

/**
 * 部位のまとまり (craft-stage/apply-act.ts の MARTIAL / CASTER / ARMOUR と同じ。クラフト計算機からも読むので、
 * クラフトステージの重い部分を引き込まないようここに写す。同じであることは tests/augment-rules.test.ts で見る)
 */
const MARTIAL = ["Bows", "Crossbows", "OneHand_Maces", "TwoHand_Maces", "Quarterstaves", "Spears", "Talismans"];
const CASTER = ["Wands", "Staves", "Sceptres"];
const ARMOUR = ["Body_Armours", "Helmets", "Gloves", "Boots", "Shields", "Bucklers", "Foci"];

export interface AugmentRule {
  ja: string;
  /** SoulCoreTypes (Rune / SoulCore / Idol / AbyssalEye / CongealedMist) */
  type: string | null;
  /** 取り外せる (null = 説明文の型が想定外で分からない) */
  removable: boolean | null;
  /** 他のオーグメントで置き換えられる (null = 分からない) */
  replaceable: boolean | null;
  /** ソケットバウンド (取り外しも置き換えもできない)。null = 分からない */
  bound: boolean | null;
  /** はめられる部位の言葉 (説明文のまま)。null = どの装備にも (slotsKnown が false の時は分からない) */
  slots: string[] | null;
  slotsKnown: boolean;
  /** レアリティの条件 (「レアの武器」) */
  rarity: "rare" | null;
  /** 1 つのアイテムにはめられる数。group があればその種類 (古代のオーグメント / アルダーの遺産) でまとめて数える */
  limit: { id: string; n: number; group: string | null } | null;
  /** コラプト・聖別の後でもはめられる */
  corruptOk: boolean;
  /** 置き換えた時に元の物がどうなるか ("destroyed" = 壊れる、手元に戻らない) */
  replacedGoes: "destroyed" | null;
  /** 決まりを読んだ説明文 */
  text: string;
  textFrom: string;
  /** 置き方・外し方以外の文 (効き目の決まり) */
  extra: string[] | null;
}

const RAW = rulesRaw as unknown as { rules: Record<string, AugmentRule>; unexpected: Array<{ en: string; ja: string; why: string[] }> };
export const AUGMENT_RULES = RAW.rules;
/** 説明文の型が想定外だった物 (決まりを推測で埋めていない) */
export const AUGMENT_RULES_UNEXPECTED = RAW.unexpected;

export const augmentRule = (en: string): AugmentRule | null => AUGMENT_RULES[en] ?? null;

const TWO_HAND = ["TwoHand_Maces", "Quarterstaves", "Bows", "Crossbows", "Staves", "Talismans"];
/** 説明文の部位の言葉 → 計算機の部位 (ItemBase.category) */
export const SLOT_CLASSES: Record<string, string[]> = {
  武器: [...MARTIAL, ...CASTER],
  防具: ARMOUR,
  マーシャル武器: MARTIAL,
  キャスター武器: CASTER,
  両手武器: TWO_HAND,
  遠距離武器: ["Bows", "Crossbows"],
  メイス: ["OneHand_Maces", "TwoHand_Maces"],
  片手メイス: ["OneHand_Maces"],
  両手メイス: ["TwoHand_Maces"],
  クォータースタッフ: ["Quarterstaves"],
  スピア: ["Spears"],
  弓: ["Bows"],
  クロスボウ: ["Crossbows"],
  タリスマン: ["Talismans"],
  ワンド: ["Wands"],
  スタッフ: ["Staves"],
  セプター: ["Sceptres"],
  フォーカス: ["Foci"],
  盾: ["Shields"],
  バックラー: ["Bucklers"],
  鎧: ["Body_Armours"],
  兜: ["Helmets"],
  手袋: ["Gloves"],
  靴: ["Boots"],
};
const EQUIP = [...MARTIAL, ...CASTER, ...ARMOUR];

/** その部位にはめられるか (null = 説明文から部位が読めず分からない) */
export function slotOk(rule: AugmentRule, category: string): boolean | null {
  if (!rule.slotsKnown) return null;
  if (!rule.slots) return EQUIP.includes(category);
  return rule.slots.some((s) => SLOT_CLASSES[s]?.includes(category));
}

/** 部位の言葉の英語 (英語の画面用。2026-10-10 英語版) */
const SLOT_EN: Record<string, string> = {
  武器: "Weapon", 防具: "Armour", マーシャル武器: "Martial Weapon", キャスター武器: "Caster Weapon", 両手武器: "Two-Handed Weapon",
  遠距離武器: "Ranged Weapon", メイス: "Mace", 片手メイス: "One-Handed Mace", 両手メイス: "Two-Handed Mace", クォータースタッフ: "Quarterstaff",
  スピア: "Spear", 弓: "Bow", クロスボウ: "Crossbow", タリスマン: "Talisman", ワンド: "Wand", スタッフ: "Staff", セプター: "Sceptre",
  フォーカス: "Focus", 盾: "Shield", バックラー: "Buckler", 鎧: "Body Armour", 兜: "Helmet", 手袋: "Gloves", 靴: "Boots",
};
/** 部位の言葉の画面用 (英語の画面では英語) */
const slotLabelShown = (rule: AugmentRule): string => (lang.value === "en"
  ? (!rule.slotsKnown ? "unknown" : !rule.slots ? "any equipment" : rule.slots.map((s) => SLOT_EN[s] ?? s).join(" / "))
  : slotLabel(rule));
/** 部位の言葉 (札・説明用。「靴」「兜またはセプター」「どの装備にも」) */
export const slotLabel = (rule: AugmentRule): string => (!rule.slotsKnown ? "分からない" : !rule.slots ? "どの装備にも" : rule.slots.join("・"));

/** はめる前の決まり (部位・レアリティ・コラプト)。はめられるなら null、だめなら理由 (ゲームの言葉で) */
/**
 * はめられるか。effectFits = 効果のデータ (SoulCoreStats) でこの部位に効果の行があるか。渡されたら部位の判定は**そちらを正**にする
 * (2026-10-03: 説明文の部位と効果の部位が食い違う 5 件。説明文は大まかな言葉 (盾 ⊃ バックラー、遠距離武器 ⊃ スピア等) か古いまま
 * (グロルドのアイドル: 説明文「手袋」、取引所の出品は 靴 883 件 / 手袋 0 件) だったので、オーナーと決めて効果のデータに合わせた)
 */
export function placeBlock(rule: AugmentRule | null, item: { category: string; rarity: string; corrupted?: boolean; sanctified?: boolean }, effectFits?: boolean): string | null {
  if (!rule || !rule.slotsKnown || rule.removable == null) {
    return tr(`決まりがクライアントの説明文から読めない${rule?.extra?.length ? ` (${rule.extra.join("。")})` : ""}`, "Socketing rules couldn't be read from the game data");
  }
  if ((item.corrupted || item.sanctified) && !rule.corruptOk) return tr("コラプト・聖別したアイテムにははめられない", "Can't be socketed into Corrupted or Sanctified items");
  if (effectFits === false || (effectFits === undefined && slotOk(rule, item.category) === false)) return tr(`${slotLabel(rule)}の空のオーグメントソケットにだけはめられる`, `Only socketable into an empty augment socket on: ${slotLabelShown(rule)}`);
  if (rule.rarity === "rare" && item.rarity !== "rare") return tr("レアのアイテムにだけはめられる", "Rare items only");
  return null;
}

/** はまっている物を置き換えられるか。置き換えられるなら null、だめなら理由 (ゲームの言葉で) */
export function replaceBlock(occupant: { en: string; ja: string }): string | null {
  const r = augmentRule(occupant.en);
  if (!r || r.replaceable == null) return tr(`${occupant.ja}は置き換えられるか分からない (説明文の型が想定外)`, `Unknown whether ${occupant.en} can be replaced`);
  if (!r.replaceable) return tr(`${occupant.ja}はソケットバウンドなので置き換えられない`, `${occupant.en} is socket-bound and can't be replaced`);
  return null;
}

/**
 * 1 つのアイテムにはめられる数を超えるか。others = 置き換える物を除いた、はまっている物の英語名。
 * 種類 (group) のある上限は同じ種類をまとめて数える。種類の無い上限 (GenericLimit) は同じ物を数える
 */
export function limitBlock(en: string, others: readonly string[]): string | null {
  const r = augmentRule(en);
  const lim = r?.limit;
  if (!lim) return null;
  const same = others.filter((o) => (lim.group ? augmentRule(o)?.limit?.id === lim.id : o === en)).length;
  if (same < lim.n) return null;
  return lim.group
    ? tr(`${lim.group}は 1 つのアイテムに ${lim.n} 個まで`, `Only ${lim.n} of this kind per item`)
    : tr(`${r!.ja}は 1 つのアイテムに ${lim.n} 個まで`, `Only ${lim.n} ${en} per item`);
}

/** 棚の説明に出す決まりの行 */
export function ruleLines(en: string): string[] {
  const r = augmentRule(en);
  if (!r) return [tr("決まりの表に無い", "Not in the rules table")];
  if (r.removable == null || !r.slotsKnown) return [tr(`決まりがクライアントの説明文から読めない: ${r.text}`, "Socketing rules couldn't be read from the game data")];
  const out = [tr(`はめられる部位: ${r.rarity === "rare" ? "レアの" : ""}${slotLabel(r)}`, `Socketable into: ${r.rarity === "rare" ? "Rare " : ""}${slotLabelShown(r)}`)];
  out.push(r.bound
    ? tr("**ソケットバウンド**: 一度はめると取り外すことも置き換えることもできない", "**Socket-bound**: once socketed it can't be removed or replaced")
    : r.replaceable
      ? tr("一度はめると取り外せないが、**他のオーグメントで置き換えられる** (置き換えた方は壊れて戻らない)", "Can't be removed once socketed, but **can be replaced by another augment** (the replaced one is destroyed)")
      : tr("一度はめると取り外せない", "Can't be removed once socketed"));
  if (r.limit) out.push(r.limit.group ? tr(`${r.limit.group}は 1 つのアイテムに ${r.limit.n} 個まで`, `Only ${r.limit.n} of this kind per item`) : tr(`1 つのアイテムに ${r.limit.n} 個まで`, `Only ${r.limit.n} per item`));
  if (!r.corruptOk) out.push(tr("コラプト・聖別したアイテムにははめられない", "Can't be socketed into Corrupted or Sanctified items"));
  // 説明文の補足 (日本語だけの物) は英語の画面では出さない
  if (lang.value !== "en") for (const x of r.extra ?? []) out.push(x);
  return out;
}
