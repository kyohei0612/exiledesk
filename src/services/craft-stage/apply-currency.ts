/**
 * クラフトステージ: クラフトに使える物 1 個を打った結果を 1 回抽選する (2026-09-27、ADR-001)
 *
 * オーナー:「カレンシーっていうかクラフトに使える奴全部だねこのステージは」。
 * オーブ・骨・発現・消去・エッセンス・品質・触媒・アーティフィサー・ルーンは、説明文の分解 (spec/、ADR-004) で打つ。
 * 2026-10-16 に、ここに書き足していた例外の作り (オーブの switch・apply-other.ts・applyBone / applyEssence など) を外した。
 * ここに残るのは、まだ移していない物の振り分け: 指名で付ける手・アクト中の物・フラックス・聖別 ([[apply-vaal.ts]])・
 * 液化した感情・処分・手で決める品質や暗黙の値。
 * お告げは持っている物を渡し、その手に関係する物だけ食う (omensUsed)。
 */
import { isEmotion } from "./apply-emotion";
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { inAny, inGroup, type ItemGroup } from "../mods/item-classes";
import { allMods, hasExtraCatalyst, maxQualityOf, skip, type Force } from "./stage-core";
import { applyForce, isForce } from "./apply-force";
/** 品質を手で決める手 (`qset:15` = 品質 15%、`qset:34:caster` = 宝飾品の品質の種類も) */
export const QUALITY_SET = "qset:";
export const qualitySetKey = (n: number, tag?: string | null): string => `${QUALITY_SET}${n}${tag ? `:${tag}` : ""}`;
export const isQualitySet = (key: string): boolean => key.startsWith(QUALITY_SET);
/** カタリストの品質を手で決める手 (ベースの品質とは別に持つグラスピングメイル。指輪・アミュレットは qset のまま) */
export const CATALYST_SET = "cqset:";
export const catalystSetKey = (n: number, tag: string): string => `${CATALYST_SET}${n}:${tag}`;
export const isCatalystSet = (key: string): boolean => key.startsWith(CATALYST_SET);
/**
 * 品質の欄の「最大」= 足し算: ベースの上限 (普通 20%、ブリーチの指輪 +20 / 洗練 +25) + 「品質の最大値 +#%」の MOD + ヴァールのインフューザーの +10
 * (指輪・アミュレット・防具・物理武器。クライアントの説明「上限を最大 10% 超えて」)。洗練されたブリーチの指輪 45 + 20 + 10 = 75 は取引所の上限と同じ。
 * 2026-10-10 オーナー「上限を固定値にせず合計で伸びるように、マックス値を設定できるだけで、これ以上つけれないってしないで」
 */
export const INFUSER_OVER = 10;
/** インフューザーがある部位 (指輪・アミュレット・防具・マーシャル武器・ワンド・スタッフ・セプター)。前の一覧はキャスターが漏れていた (2026-10-13 総点検) */
const INFUSABLE: readonly ItemGroup[] = ["ringAmulet", "armour", "martial", "caster"];
/** インフューザーを棚に出しているか (2026-10-09 にヴァールの道具と一緒に外した)。外している間は「今の最大」に +10 を足さない (2026-10-13 オーナー「インフューザー非表示じゃなかったっけ」) */
export const INFUSERS_ON_SHELF = false;
export function qualityFieldMax(item: StageItem): number {
  return maxQualityOf(item) + (INFUSERS_ON_SHELF && inAny(item.cls.category, INFUSABLE) ? INFUSER_OVER : 0);
}
/** 暗黙の MOD の値を手で決める手 (`iset:0:5` = 1 行目を 5、範囲が 2 つなら `iset:0:2,4`)。暗黙の行の上下のボタン (2026-10-12 オーナー「暗黙はティアとかないから上下できるボタン」)。費用 0 */
export const IMPLICIT_SET = "iset:";
export const implicitSetKey = (line: number, values: readonly number[]): string => `${IMPLICIT_SET}${line}:${values.join(",")}`;
/**
 * ジュエルはアイテムレベルを見ない (MOD は全部レベル 1・重みは全部同じで、画面にもアイテムレベルを出さない。2026-10-12 オーナー
 * 「ジュエルにアイテムレベルって意味あるんか」)。カレンシー・骨のアイテムレベルの制限も掛けない
 */
export const noIlvl = (item: StageItem): boolean => inGroup(item.cls.category, "jewel");
/** 品質の上限を手で決める手 (`qcap:40`)。品質の帯のプルダウン (2026-10-10 オーナー「エッセンス打つのが面倒な人はプルダウンで上限上げてね」) */
export const QUALITY_CAP = "qcap:";
export const qualityCapKey = (n: number): string => `${QUALITY_CAP}${n}`;
/**
 * アイテムレベルを変える手 (`ilvl:84`)。カオススパム確率機で狙いごとにアイテムレベルを選んで回した時に、手順にこの手を入れる
 * (2026-10-16 オーナー「MOD 決めた時点で再度レベル変わるからそこ都度都度」。前は手順の始めのアイテムレベルを書き換えていて、前の手まで別物になった)。費用 0
 */
export const ITEM_LEVEL_SET = "ilvl:";
export const itemLevelKey = (n: number): string => `${ITEM_LEVEL_SET}${n}`;
/** 今の品質の上限: 手で決めた値があればそれ、無ければ足し算 (ベース + 品質の最大値の MOD + インフューザー) */
export function qualityCapOf(item: StageItem): number {
  return item.qualityCap ?? qualityFieldMax(item);
}
import { applyJeweller, applyWisdom, collectShard, isShard, shardReason } from "./apply-act";
import { isFlask, isGem, uniqueBaseOf } from "./stage-bases";
import { itemBaseFor } from "../htc/bridge";
import { jaTypeName } from "../trade2/localize";
import { OMEN_FOR, REMOVED_OMENS, UNMODELLED_OMENS } from "./omens";
import type { StageApply, StageItem, StageMod, StageSide } from "./types";
import { ANY_STATE, applyExtra, FOR_CORRUPTED, isExtra } from "./apply-extra";
import { applyDispose, DISPOSE_JA, isDispose } from "./apply-dispose";
import { applyUnsocket, isUnsocket } from "./stage-runes";
import { tr } from "../../i18n/lang";

export { GNAWED_MAX_ILVL } from "./stage-core";
import { applyBySpec } from "./spec/run-spec";

/** カレンシーのキー (price-keys.json) → 種類と強さ */
function parseKey(key: string): { kind: string; strength: "base" | "greater" | "perfect" } {
  const m = /^(.*)_(greater|perfect)$/.exec(key);
  return m ? { kind: m[1]!, strength: m[2] as "greater" | "perfect" } : { kind: key, strength: "base" };
}

/** その手の種類 (お告げの対応を引く鍵) */
export function kindOf(currency: string): string {
  if (currency.startsWith("essence:")) return currency === "essence:breach" || currency.startsWith("essence:perfect:") ? "essence_perfect" : "essence";
  if (currency.startsWith("desecrate")) return "desecrate";
  if (currency.startsWith("reveal")) return "reveal";
  if (currency.startsWith("catalyst_") || currency.startsWith("jcatalyst_")) return "catalyst";
  if (isEmotion(currency)) return "emotion";
  return parseKey(currency).kind;
}
/**
 * 削減のお告げでカオスを打った時に消える候補: フラクチャー以外で MOD レベルが一番低い物 (同じなら全部、等しい確率)。
 * 左右の抹消のお告げも掛けていれば、その側の中で一番低い物 (side。2026-10-11 要望 aa132a4a: 併用できる)。
 * 打つ前に画面で色を付ける (ゲームと同じ、オーナー 2026-10-04) のにも使う
 */
export function whittleTargets(item: StageItem, side?: StageSide | null): StageMod[] {
  const rem = allMods(item).filter((m) => !m.fractured && (!side || m.side === side));
  if (!rem.length) return [];
  // 未発現の冒涜 MOD は MOD レベル 1 として数える (poe2wiki Omen of Whittling・0.3.1、POE2Tube 要望 ㉞-6。modLevel も 1、要望 ㉟-3)
  const lv = (m: StageMod): number => (m.unrevealed ? 1 : m.modLevel);
  const low = Math.min(...rem.map(lv));
  return rem.filter((m) => lv(m) === low);
}
/** その手に掛かるお告げ (持っている中から) */
export function omensFor(currency: string, held: readonly string[]): string[] {
  const ok = OMEN_FOR[kindOf(currency)] ?? [];
  const used = held.filter((o) => ok.includes(o));
  // 腐食のお告げは単体で効く (全部の MOD を置き換えるので、左右のネクロマンシー・勢力は関係が無い)。他のお告げは使わずに残す
  // (2026-10-05 オーナー「腐食は単体だよね、属さないはず」)
  return used.includes("OmenofPutrefaction") ? ["OmenofPutrefaction"] : used;
}


/**
 * 1 個打つ。打てない状態なら applied:false と理由 (item はそのまま)。
 * rng は 1 手ごとに mulberry32(seed) を渡す (同じ seed なら同じ結果)。omens は持っているお告げ
 */
/**
 * hint: 手順の手の追加の指定 (要望 ⑧)。collect = シャードを拾う手 (手で打つ画面でアイテムに使う時は無し → 打てない)、
 * outcome = 確率で分かれる物の結果を指定 (apply-extra.ts)
 */
export interface ApplyHint {
  collect?: boolean;
  outcome?: string;
  /** 付く MOD の指名 (要望 ⑱-1)。足す順 (錬金・大いなる高貴は複数)。足りない分は乱数 */
  pick?: Force[];
  /** 消える MOD の指名 (カオス) */
  remove?: string;
  /** 手順の再生: カタリストは 1 手 = 1 個 +1% (手で打つ画面は 1 個 +1〜2%) */
  oneCatalyst?: boolean;
}

/**
 * ユニークになった (ヴァール培養) 時は、そのユニークのベースに変える (説明文「同じアイテムクラスのランダムなユニーク」
 * = そのユニークのベースになる。2026-10-06 POE2Tube 要望 ㉝ の 6: サファイアの指輪 → ベレクの山道 なのにカードがサファイアの指輪のままだった)。
 * 計算機のベースに無いベースならそのまま
 */
function toUniqueBase(data: PatchData, r: StageApply): StageApply {
  const u = r.applied ? r.item.unique : undefined;
  const to = u ? uniqueBaseOf(u.en) : null;
  if (!u || !to || to === r.item.base) return r;
  const cls = itemBaseFor(data, to);
  if (!cls) return r;
  return { ...r, item: { ...r.item, base: to, baseJa: jaTypeName(to), cls } };
}

export function applyCurrency(data: PatchData, item: StageItem, currency: string, rng: () => number, omens: readonly string[] = [], hint: ApplyHint = {}): StageApply {
  // シャード: 手順では 1 個拾う (アイテムは変わらない)。アイテムに使おうとした時は打てない
  if (isShard(currency)) return hint.collect ? collectShard(item, currency) : skip(item, shardReason());
  if (item.destroyed) return skip(item, tr("壊れたアイテムには何も使えない", "Item is destroyed"));
  if (item.disposed) return skip(item, tr(`${DISPOSE_JA[item.disposed]}したアイテムには何も使えない`, `Item was ${item.disposed === "disenchant" ? "disenchanted" : "salvaged"}`));
  if (item.mirrored && !ANY_STATE.includes(currency)) return skip(item, tr("ミラーしたアイテムには使えない", "Can't modify a Mirrored item"));
  // 未鑑定は先に鑑定の巻物 (MOD が見えないアイテムには打てない)
  // 解呪・サルベージ (要望 ⑰-5) は未鑑定・コラプトでもできる
  if (isDispose(currency)) return applyDispose(item, currency);
  if (item.identified === false && currency !== "wisdom") return skip(item, tr("未鑑定 (先に鑑定の巻物で鑑定する)", "Unidentified (identify it with a Scroll of Wisdom first)"));
  // ADR-004 (2026-10-16): 移し終えた手 (spec/run-spec.ts の specCovers) は説明文の分解で打つ。まだ移していない手 (聖別など) は下で
  const bySpec = applyBySpec(data, item, currency, rng, omens, { oneCatalyst: hint.oneCatalyst, ...(hint.pick ? { pick: hint.pick } : {}), ...(hint.remove ? { remove: hint.remove } : {}) });
  if (bySpec) return bySpec;
  // コラプト・聖別の後は手を加えられない。腐食のお告げでコラプトした未発現の MOD の発現だけはできる (ゲームと同じ)
  // コラプトしたアイテムにだけ打つ物 (生贄のオーブ・アーキテクト等、apply-extra.ts) と、状態を問わない物 (鏡・抽出) は通す
 // ルーン (要望 ⑰-1) はコラプト・聖別の後でもはめられる物がある (クライアントの CanSocketInCorruptedSanctified、applyRune で見る)
  // 液化した感情 (デリリウム、ジュエル。2026-10-11)
  if (isUnsocket(currency)) return applyUnsocket(item, currency);
  // 品質を手で決める (アイテムのカードの品質の欄。2026-10-10 要望「品質欄を付けて防御値がシミュレーションできると便利」)。費用 0、コラプト後も試せる
  if (currency.startsWith(ITEM_LEVEL_SET)) {
    const lv = Math.max(1, Math.min(100, Number(currency.slice(ITEM_LEVEL_SET.length)) || 0));
    return { applied: true, item: { ...item, itemLevel: lv }, added: [], removed: [] };
  }
  if (currency.startsWith(QUALITY_CAP)) {
    const cap = Math.max(0, Number(currency.slice(QUALITY_CAP.length)) || 0);
    return { applied: true, item: { ...item, qualityCap: cap, quality: Math.min(item.quality, cap) }, added: [], removed: [] };
  }
  if (currency.startsWith(IMPLICIT_SET)) {
    const [line, vals] = currency.slice(IMPLICIT_SET.length).split(":");
    const values = (vals ?? "").split(",").map(Number).filter((v) => Number.isFinite(v));
    return { applied: true, item: { ...item, implicitFixed: { ...(item.implicitFixed ?? {}), [Number(line)]: values } }, added: [], removed: [] };
  }
  if (isCatalystSet(currency)) {
    const [num, tag] = currency.slice(CATALYST_SET.length).split(":");
    if (!hasExtraCatalyst(item.base) || !tag) return skip(item, tr("カタリストの品質を別に持てないベース", "This base has no separate Catalyst quality"));
    const n = Math.max(0, Math.min(maxQualityOf(item), Number(num) || 0));
    return { applied: true, item: { ...item, catalystQuality: n, qualityTag: tag }, added: [], removed: [] };
  }
  if (isQualitySet(currency)) {
    const [num, tag] = currency.slice(QUALITY_SET.length).split(":");
    const n = Math.max(0, Math.min(qualityCapOf(item), Number(num) || 0));
    return { applied: true, item: { ...item, quality: n, ...(tag ? { qualityTag: tag } : {}) }, added: [], removed: [] };
  }
  if (item.sanctified && !ANY_STATE.includes(currency)) return skip(item, tr("聖別したアイテムには使えない", "Can't modify a Sanctified item"));
  if (item.corrupted && kindOf(currency) !== "reveal" && !FOR_CORRUPTED.includes(currency) && !ANY_STATE.includes(currency)) return skip(item, tr("コラプトしたアイテムには使えない", "Can't modify a Corrupted item"));
  // 今のゲームに無いお告げ (相場に値段が無い) を掛けていたら打てない (2026-09-29 オーナー「錬金術のお告げとかない、王者のお告げやら」)
  const gone = omens.find((o) => REMOVED_OMENS.includes(o));
  if (gone) return skip(item, tr("今のゲームに無いお告げ", "This Omen is no longer in the game"));
  const used = omensFor(currency, omens);
  const bad = used.find((o) => UNMODELLED_OMENS.includes(o));
  if (bad) return skip(item, tr("このお告げの効果はまだ入れていない", "This Omen isn't supported yet"));
  const r = applyInner(data, item, currency, rng, hint);
  if (!r.applied) return r;
  // ヒネコラの予見は「アイテムを変えると消える」(説明文)
  const item2 = currency !== "hinekora" && r.item.foreseen ? { ...r.item, foreseen: false } : r.item;
  return { ...r, item: item2, omensUsed: used };
}

function applyInner(data: PatchData, item: StageItem, currency: string, rng: () => number, hint: ApplyHint): StageApply {
  // 指名で付ける手 (手で打つ画面の「付ける」。apply-force.ts)
  if (isForce(currency)) return applyForce(data, item, currency, rng);
  // アクト中に落ちる物 (要望 ⑧、apply-act.ts)
  if (currency === "wisdom") return applyWisdom(item);
  if (currency === "jeweller_lesser" || currency === "jeweller_greater" || currency === "jeweller_perfect") return applyJeweller(item, currency);
  if (isExtra(currency)) return toUniqueBase(data, applyExtra(item, currency, rng, hint.outcome));
  // フラスコ・スキルジェム (MOD の置き場が無い) には、上の物と熟練工以外は打てない
  if (isFlask(item.cls.category) || isGem(item.cls.category)) return skip(item, isGem(item.cls.category) ? tr("スキルジェムには使えない", "Can't be used on Skill Gems") : tr("フラスコには使えない (このステージでは MOD を扱わない)", "Can't be used on Flasks (flask mods aren't supported)"));
  // オーブ・骨・発現・消去・エッセンス・品質・触媒・アーティフィサー・ルーン・感情・フラックス・聖別は説明文の分解 (spec/) で打つ (ADR-004、2026-10-16〜17 に今の関数から外した)
  return skip(item, tr(`このアイテムはまだ使えない (${currency})`, `Not supported yet (${currency})`));
}
