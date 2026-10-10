/**
 * クラフトステージ: クラフトに使える物 1 個を打った結果を 1 回抽選する (2026-09-27、ADR-001)
 *
 * オーナー:「カレンシーっていうかクラフトに使える奴全部だねこのステージは」。
 * ここはオーブ (変成 / 増強 / 王者 / 錬金 / 高貴 / カオス / 消去) とそれに掛かるお告げ、そして他の物への振り分け:
 *   エッセンス → [[apply-essence.ts]]、骨と発現 → [[apply-desecrate.ts]]、神 / フラクチャー / カタリスト / アーティファサー → [[apply-other.ts]]、
 *   ヴァールと聖別 → [[apply-vaal.ts]]
 * 規則は計算機 (sim-route-helpers.ts の roll / usable / apply、エンジンの probability.ts) と同じ:
 *   - 足す MOD は、その側の普通の MOD の置き場から、**付いている系統を除き**、アイテムレベル以下 (上級・完全は段の下限以上) の段の重みで引く
 *   - 上級・完全の段の下限はエンジンの CURRENCY_FLOOR (変成・増強 55 / 70、王者・高貴 35 / 50)。カオスは計算機と同じ 35 / 50
 *   - 消す (カオス・消去) のは固定済み (フラクチャー) 以外から等しく 1 つ
 * お告げは持っている物を渡し、その手に関係する物だけ食う (omensUsed)。
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { CURRENCY_FLOOR } from "../../vendor/poe2htc/engine/types";
import { catalysingMultiplier } from "../htc/catalysing-multiplier";
import { boostedBy } from "../htc/quality";
import { addForced, addOne, allMods, candidates, maxQualityOf, removeForced, removeOne, room, SIDES, skip, without, type Candidate, type Force, type PoolOpts } from "./stage-core";
import { applyEssence } from "./apply-essence";
import { applyForce, isForce } from "./apply-force";
/** 品質を手で決める手 (`qset:15` = 品質 15%、`qset:34:caster` = 宝飾品の品質の種類も) */
export const QUALITY_SET = "qset:";
export const qualitySetKey = (n: number, tag?: string | null): string => `${QUALITY_SET}${n}${tag ? `:${tag}` : ""}`;
export const isQualitySet = (key: string): boolean => key.startsWith(QUALITY_SET);
/**
 * 品質の欄の「最大」= 足し算: ベースの上限 (普通 20%、ブリーチの指輪 +20 / 洗練 +25) + 「品質の最大値 +#%」の MOD + ヴァールのインフューザーの +10
 * (指輪・アミュレット・防具・物理武器。クライアントの説明「上限を最大 10% 超えて」)。洗練されたブリーチの指輪 45 + 20 + 10 = 75 は取引所の上限と同じ。
 * 2026-10-10 オーナー「上限を固定値にせず合計で伸びるように、マックス値を設定できるだけで、これ以上つけれないってしないで」
 */
export const INFUSER_OVER = 10;
const INFUSABLE = /^(Rings|Amulets|Body_Armours|Helmets|Gloves|Boots|Shields|Bucklers|Foci|OneHand_Maces|TwoHand_Maces|Spears|Quarterstaves|Bows|Crossbows|Talismans)/;
export function qualityFieldMax(item: StageItem): number {
  return maxQualityOf(item) + (INFUSABLE.test(item.cls.category) ? INFUSER_OVER : 0);
}
/** 品質の上限を手で決める手 (`qcap:40`)。品質の帯のプルダウン (2026-10-10 オーナー「エッセンス打つのが面倒な人はプルダウンで上限上げてね」) */
export const QUALITY_CAP = "qcap:";
export const qualityCapKey = (n: number): string => `${QUALITY_CAP}${n}`;
/** 今の品質の上限: 手で決めた値があればそれ、無ければ足し算 (ベース + 品質の最大値の MOD + インフューザー) */
export function qualityCapOf(item: StageItem): number {
  return item.qualityCap ?? qualityFieldMax(item);
}
import { applyBone, applyReveal } from "./apply-desecrate";
import { applyOther, OTHER_KINDS } from "./apply-other";
import { applySanctify, applyVaal } from "./apply-vaal";
import { applyChance, applyJeweller, applyQuality, applyWisdom, collectShard, isShard, QUALITY_TARGET, shardReason } from "./apply-act";
import { isFlask, isGem, uniqueBaseOf, uniquesForBase, uniquesOfClassForBase } from "./stage-bases";
import { itemBaseFor } from "../htc/bridge";
import { jaTypeName } from "../trade2/localize";
import { OMEN_FOR, REMOVED_OMENS, UNMODELLED_OMENS } from "./omens";
import type { StageApply, StageItem, StageMod, StageSide } from "./types";
import { ANY_STATE, applyExtra, FOR_CORRUPTED, isExtra } from "./apply-extra";
import { applyFlux, isFlux } from "./apply-flux";
import { applyDispose, DISPOSE_JA, isDispose } from "./apply-dispose";
import { applyRune, isRune, applyUnsocket, isUnsocket } from "./stage-runes";
import { tr } from "../../i18n/lang";

/** 噛み切られた骨が使えるアイテムレベルの上限 (クライアントの AbyssBenchTicketTypes.MaximumItemLevel、2026-09-29) */
export const GNAWED_MAX_ILVL = 64;

/** カレンシーのキー (price-keys.json) → 種類と強さ */
function parseKey(key: string): { kind: string; strength: "base" | "greater" | "perfect" } {
  const m = /^(.*)_(greater|perfect)$/.exec(key);
  return m ? { kind: m[1]!, strength: m[2] as "greater" | "perfect" } : { kind: key, strength: "base" };
}
/** 強さの段の下限 */
function floorOf(kind: string, strength: "base" | "greater" | "perfect"): number {
  if (kind === "chaos") return { base: 0, greater: 35, perfect: 50 }[strength];
  const t = CURRENCY_FLOOR[kind as keyof typeof CURRENCY_FLOOR];
  return t ? t[strength] : 0;
}

/** その手の種類 (お告げの対応を引く鍵) */
export function kindOf(currency: string): string {
  if (currency.startsWith("essence:")) return currency === "essence:breach" || currency.startsWith("essence:perfect:") ? "essence_perfect" : "essence";
  if (currency.startsWith("desecrate")) return "desecrate";
  if (currency.startsWith("reveal")) return "reveal";
  if (currency.startsWith("catalyst_")) return "catalyst";
  return parseKey(currency).kind;
}
/**
 * 削減のお告げでカオスを打った時に消える候補: フラクチャー以外で MOD レベルが一番低い物 (同じなら全部、等しい確率)。
 * 打つ前に画面で色を付ける (ゲームと同じ、オーナー 2026-10-04) のにも使う
 */
export function whittleTargets(item: StageItem): StageMod[] {
  const rem = allMods(item).filter((m) => !m.fractured);
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

/** お告げの側 (左 = プレ / 右 = サフィ) */
function sideOmen(used: readonly string[], left: string, right: string): StageSide | null {
  if (used.includes(left)) return "prefix";
  if (used.includes(right)) return "suffix";
  return null;
}

/**
 * 1 個打つ。打てない状態なら applied:false と理由 (item はそのまま)。
 * rng は 1 手ごとに mulberry32(seed) を渡す (同じ seed なら同じ結果)。omens は持っているお告げ
 */
/**
 * hint: 手順の手の追加の指定 (要望 ⑧)。collect = シャードを拾う手 (手で打つ画面でアイテムに使う時は無し → 打てない)、
 * outcome = 可能性のオーブの結果を指定 ("unique" / "destroyed")
 */
export interface ApplyHint {
  collect?: boolean;
  outcome?: string;
  /** 付く MOD の指名 (要望 ⑱-1)。足す順 (錬金・大いなる高貴は複数)。足りない分は乱数 */
  pick?: Force[];
  /** 消える MOD の指名 (カオス) */
  remove?: string;
  /** 手順の再生: カタリストは 1 手 = 1 個 (手で打つ画面は 1 手で上限まで。要望 ㉜ の 2) */
  oneCatalyst?: boolean;
}
/** 指名が通らなかった時 (理由つきで打てない、pickError) */
const pickFail = (item: StageItem, why: string): StageApply => ({ ...skip(item, tr(`指名できない: ${why}`, `Can't force: ${why}`)), pickError: true });

/**
 * ユニークになった (古代のお告げの可能性・ヴァール培養) 時は、そのユニークのベースに変える (説明文「同じアイテムクラスのランダムなユニーク」
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
  // コラプト・聖別の後は手を加えられない。腐食のお告げでコラプトした未発現の MOD の発現だけはできる (ゲームと同じ)
  // コラプトしたアイテムにだけ打つ物 (生贄のオーブ・アーキテクト等、apply-extra.ts) と、状態を問わない物 (鏡・抽出) は通す
 // ルーン (要望 ⑰-1) はコラプト・聖別の後でもはめられる物がある (クライアントの CanSocketInCorruptedSanctified、applyRune で見る)
  if (isRune(currency)) return applyRune(item, currency, data);
  if (isUnsocket(currency)) return applyUnsocket(item, currency);
  // 品質を手で決める (アイテムのカードの品質の欄。2026-10-10 要望「品質欄を付けて防御値がシミュレーションできると便利」)。費用 0、コラプト後も試せる
  if (currency.startsWith(QUALITY_CAP)) {
    const cap = Math.max(0, Number(currency.slice(QUALITY_CAP.length)) || 0);
    return { applied: true, item: { ...item, qualityCap: cap, quality: Math.min(item.quality, cap) }, added: [], removed: [] };
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
  const r = applyInner(data, item, currency, rng, used, hint);
  if (!r.applied) return r;
  // ヒネコラの予見は「アイテムを変えると消える」(説明文)
  const item2 = currency !== "hinekora" && r.item.foreseen ? { ...r.item, foreseen: false } : r.item;
  return { ...r, item: item2, omensUsed: used };
}

function applyInner(data: PatchData, item: StageItem, currency: string, rng: () => number, used: readonly string[], hint: ApplyHint): StageApply {
  // 指名で付ける手 (手で打つ画面の「付ける」。apply-force.ts)
  if (isForce(currency)) return applyForce(data, item, currency, rng);
  const kind = kindOf(currency);
  // アクト中に落ちる物 (要望 ⑧、apply-act.ts)
  if (currency === "wisdom") return applyWisdom(item);
  if (currency in QUALITY_TARGET) return applyQuality(item, currency, rng);
  if (currency === "jeweller_lesser" || currency === "jeweller_greater" || currency === "jeweller_perfect") return applyJeweller(item, currency);
  if (currency === "chance") return toUniqueBase(data, applyChance(item, rng, used.includes("OmenoftheAncients") ? uniquesOfClassForBase(item.base) : uniquesForBase(item.base), hint.outcome, used));
  if (isExtra(currency)) return toUniqueBase(data, applyExtra(item, currency, rng, hint.outcome));
  if (isFlux(currency)) return applyFlux(data, item, currency);
  // フラスコ・スキルジェム (MOD の置き場が無い) には、上の物と熟練工以外は打てない
  if (isFlask(item.cls.category) || isGem(item.cls.category)) return skip(item, isGem(item.cls.category) ? tr("スキルジェムには使えない", "Can't be used on Skill Gems") : tr("フラスコには使えない (このステージでは MOD を扱わない)", "Can't be used on Flasks (flask mods aren't supported)"));
  if (kind === "essence" || kind === "essence_perfect") return applyEssence(data, item, currency, rng, used);
  // 噛み切られた骨はアイテムレベル 64 以下だけ (クライアントの AbyssBenchTicketTypes.MaximumItemLevel)
  if (currency === "desecrate_gnawed" && item.itemLevel > GNAWED_MAX_ILVL) return skip(item, tr(`アイテムレベル ${GNAWED_MAX_ILVL} 以下にだけ使える`, `Item Level ${GNAWED_MAX_ILVL} or lower only`));
  if (kind === "desecrate") return applyBone(data, item, currency, rng, used);
  if (kind === "reveal") return applyReveal(data, item, currency, rng, used);
  if (kind === "vaal") return applyVaal(data, item, rng, used);
  if (kind === "divine" && used.includes("OmenofSanctification")) return applySanctify(data, item, rng);
  // 祝福のお告げ: 暗黙 MOD だけを振り直す (クライアントの説明)。このステージは暗黙 MOD の数値を持たないので、明示 MOD はそのまま
  if (kind === "divine" && used.includes("OmenoftheBlessed")) return { applied: true, item, added: [], removed: [], note: tr("祝福のお告げ: 暗黙 MOD だけを振り直した (明示 MOD は変わらない。このステージは暗黙の数値を持たない)", "Omen of the Blessed: rerolled implicit values only (explicit mods unchanged; implicit values aren't tracked here)") };
  if (kind === "catalyst" || OTHER_KINDS.includes(kind)) return applyOther(data, item, currency, rng, !!hint.oneCatalyst);

  const { strength } = parseKey(currency);
  const floor = floorOf(kind, strength);
  // 用語集 BetterCurrencyMinimumLevel「最低 MOD レベルのあるカレンシーは、アイテムレベルがそれより低い品には使えない」(要望 ㉝ の 3)
  if (floor > 0 && item.itemLevel < floor) return skip(item, tr(`アイテムレベルが ${floor} 未満には使えない`, `Requires Item Level ${floor}+`));
  const count = allMods(item).length;
  const add = (it: StageItem, n: number, pick: (k: number, cur: StageItem) => readonly StageSide[] = () => SIDES, boost?: PoolOpts["boost"]): StageApply => {
    let cur = it;
    const added: StageMod[] = [];
    const picked: NonNullable<StageApply["picked"]> = [];
    const rolled: NonNullable<StageApply["rolled"]> = [];
    if ((hint.pick?.length ?? 0) > n) return pickFail(item, tr(`この手で付く MOD は ${n} つまで`, `this adds at most ${n} mod${n === 1 ? "" : "s"}`));
    for (let i = 0; i < n; i++) {
      const f = hint.pick?.[i];
      if (f) {
        const r = addForced(data, cur, floor, rng, f, { sides: pick(i, cur), boost });
        if ("error" in r) return pickFail(item, r.error);
        cur = r.item;
        added.push(r.mod);
        picked.push({ modId: r.mod.modId, tierName: r.mod.tierName, chance: r.chance });
        continue;
      }
      const r = addOne(data, cur, floor, rng, { sides: pick(i, cur), boost });
      if (!r) break;
      cur = r.item;
      added.push(r.mod);
      rolled.push({ modId: r.mod.modId, tierName: r.mod.tierName, chance: r.chance });
    }
    return added.length ? { applied: true, item: cur, added, removed: [], ...(picked.length ? { picked } : {}), ...(rolled.length ? { rolled } : {}) } : skip(item, tr("付けられる MOD が無い", "No mod can be added"));
  };
  switch (kind) {
    case "transmute":
      if (item.rarity !== "normal") return skip(item, tr("ノーマルのアイテムにだけ使える", "Normal items only"));
      return add({ ...item, rarity: "magic" }, 1);
    case "augment":
      if (item.rarity !== "magic") return skip(item, tr("マジックのアイテムにだけ使える", "Magic items only"));
      if (count >= 2) return skip(item, tr("MOD が 2 つ付いている (マジックはプレ 1 / サフィ 1 まで)", "Already has 2 mods (Magic: 1 prefix / 1 suffix)"));
      return add(item, 1);
    case "regal": {
      if (item.rarity !== "magic") return skip(item, tr("マジックのアイテムにだけ使える", "Magic items only"));
      // 左右の戴冠のお告げ: 足すのをその側だけに
      const side = sideOmen(used, "OmenofSinistralCoronation", "OmenofDextralCoronation");
      const rare = { ...item, rarity: "rare" as const };
      if (side && !room(rare, side)) return skip(item, tr("お告げの側に空きが無い", "No open slot on the Omen's side"));
      return add(rare, 1, () => (side ? [side] : SIDES));
    }
    case "alchemy": {
      // ノーマルかマジック → MOD 4 個のレア (クライアントの説明文)。マジックに使った時は**付いている MOD は残らない**
      // (0.3.1「When used on Magic items the original modifiers are not retained」、POE2Tube 要望 ㉞-1。前は残して 4 個まで足していた)
      if (item.rarity !== "normal" && item.rarity !== "magic") return skip(item, tr("ノーマルかマジックのアイテムにだけ使える", "Normal or Magic items only"));
      // 左右の錬金のお告げ: その側を上限まで (残りは反対側)
      const side = sideOmen(used, "OmenofSinistralAlchemy", "OmenofDextralAlchemy");
      const gone = allMods(item);
      const r = add({ ...item, rarity: "rare", prefixes: [], suffixes: [] }, 4, (_k, cur) => (side ? (room(cur, side) ? [side] : SIDES.filter((s) => s !== side)) : SIDES));
      return r.applied ? { ...r, removed: [...gone, ...r.removed] } : r;
    }
    case "exalt": {
      if (item.rarity !== "rare") return skip(item, tr("レアのアイテムにだけ使える", "Rare items only"));
      const side = sideOmen(used, "OmenofSinistralExaltation", "OmenofDextralExaltation");
      const sides = side ? [side] : SIDES;
      if (!sides.some((s) => room(item, s))) return skip(item, side ? tr("お告げの側に空きが無い", "No open slot on the Omen's side") : tr("足す枠が無い", "No open affix slot"));
      // 大いなる高貴のお告げ: 2 つ足す (枠が 1 つなら 1 つ)。触媒の高貴のお告げ: 品質の種類の MOD を重く引いて、品質を使い切る
      const n = used.includes("OmenofGreaterExaltation") ? 2 : 1;
      if (used.includes("OmenofCatalysingExaltation")) {
        const tag = item.qualityTag;
        if (!tag || !(item.quality > 0)) return skip(item, tr("触媒の高貴のお告げは品質 (カタリスト) が要る", "Omen of Catalysing Exaltation needs Catalyst quality"));
        const r = add(item, n, () => sides, { test: (m) => boostedBy(m, tag), mult: catalysingMultiplier(item.quality) });
        return r.applied ? { ...r, item: { ...r.item, quality: 0 } } : r;
      }
      return add(item, n, () => sides);
    }
    case "chaos": {
      if (item.rarity !== "rare") return skip(item, tr("レアのアイテムにだけ使える", "Rare items only"));
      let r: { item: StageItem; mod: StageMod } | null;
      if (hint.remove) {
        // 消える MOD の指名 (要望 ⑱-1)
        const f = removeForced(item, hint.remove);
        if ("error" in f) return pickFail(item, f.error);
        r = f;
      } else if (used.includes("OmenofWhittling")) {
        // 削りのお告げ: 一番 MOD レベルの低い物を消す (同じなら等しく)
        const lows = whittleTargets(item);
        const mod = lows[Math.floor(rng() * lows.length)];
        r = mod ? { item: without(item, mod), mod } : null;
      } else {
        // 左右の抹消のお告げ: 消すのをその側だけに (足す側は選べない)
        const side = sideOmen(used, "OmenofSinistralErasure", "OmenofDextralErasure");
        r = removeOne(item, rng, side ? [side] : SIDES);
      }
      if (!r) return skip(item, tr("外せる MOD が無い", "No mod can be removed"));
      const f = hint.pick?.[0];
      if (f) {
        const a = addForced(data, r.item, floor, rng, f);
        if ("error" in a) return pickFail(item, a.error);
        return { applied: true, item: a.item, added: [a.mod], removed: [r.mod], picked: [{ modId: a.mod.modId, tierName: a.mod.tierName, chance: a.chance }] };
      }
      const a = addOne(data, r.item, floor, rng);
      return { applied: true, item: a?.item ?? r.item, added: a ? [a.mod] : [], removed: [r.mod], ...(a ? { rolled: [{ modId: a.mod.modId, tierName: a.mod.tierName, chance: a.chance }] } : {}) };
    }
    case "annul": {
      if (item.rarity === "normal") return skip(item, tr("マジックかレアのアイテムにだけ使える", "Magic or Rare items only"));
      if (used.includes("OmenofLight")) {
        // 光のお告げ: 冒涜の MOD を消す
        const d = allMods(item).find((m) => m.desecrated && !m.fractured);
        if (!d) return skip(item, tr("光のお告げ: 冒涜の MOD が無い", "Omen of Light: no Desecrated mod"));
        return { applied: true, item: without(item, d), added: [], removed: [d] };
      }
      const side = sideOmen(used, "OmenofSinistralAnnulment", "OmenofDextralAnnulment");
      const n = used.includes("OmenofGreaterAnnulment") ? 2 : 1;
      let cur = item;
      const removed: StageMod[] = [];
      for (let i = 0; i < n; i++) {
        const r = removeOne(cur, rng, side ? [side] : SIDES);
        if (!r) break;
        cur = r.item;
        removed.push(r.mod);
      }
      if (!removed.length) return skip(item, side ? tr("お告げの側に外せる MOD が無い", "No removable mod on the Omen's side") : tr("外せる MOD が無い", "No mod can be removed"));
      return { applied: true, item: cur, added: [], removed };
    }
    default:
      return skip(item, tr(`このアイテムはまだ使えない (${currency})`, `Not supported yet (${currency})`));
  }
}

/**
 * 持っているカレンシーで次に付く MOD の候補と重み (2026-10-09 オーナー「カレンシー持った時に MOD の確率票変化。増強の時そもそも確率票が動いてない、
 * 完全とか使うと付かない MOD とか出てくるから確率票もだし、付かない MOD はグレーアウト」)。打つ処理 (applyCurrency) と同じ決まり:
 * 変成はマジックにしてから・増強は空きのある側・王者は戴冠のお告げの側・錬金は空のレア・高貴は側のお告げと触媒の高貴のお告げ・カオスは消した後どちらにも。
 * 強さの下限 (上級・完全) とアイテムレベルは candidates が見る。MOD を足さない物・確定で付く物 (エッセンスなど) は null
 */
export function addCandidates(data: PatchData, item: StageItem, currency: string, omens: readonly string[]): Candidate[] | null {
  const kind = kindOf(currency);
  const used = omensFor(currency, omens);
  const floor = floorOf(kind, parseKey(currency).strength);
  if (floor > 0 && item.itemLevel < floor) return [];
  const open = (it: StageItem, sides: readonly StageSide[]): StageSide[] => sides.filter((sd) => room(it, sd));
  switch (kind) {
    case "transmute": {
      if (item.rarity !== "normal") return null;
      const it = { ...item, rarity: "magic" as const };
      return candidates(data, it, open(it, SIDES), floor);
    }
    case "augment":
      if (item.rarity !== "magic") return null;
      return candidates(data, item, open(item, SIDES), floor);
    case "regal": {
      if (item.rarity !== "magic") return null;
      const side = sideOmen(used, "OmenofSinistralCoronation", "OmenofDextralCoronation");
      const it = { ...item, rarity: "rare" as const };
      return candidates(data, it, open(it, side ? [side] : SIDES), floor);
    }
    case "alchemy": {
      if (item.rarity !== "normal" && item.rarity !== "magic") return null;
      const it = { ...item, rarity: "rare" as const, prefixes: [], suffixes: [] };
      return candidates(data, it, SIDES, floor);
    }
    case "exalt": {
      if (item.rarity !== "rare") return null;
      const side = sideOmen(used, "OmenofSinistralExaltation", "OmenofDextralExaltation");
      const boost = used.includes("OmenofCatalysingExaltation") && item.qualityTag && item.quality > 0
        ? { test: (m: Parameters<typeof boostedBy>[0]) => boostedBy(m, item.qualityTag!), mult: catalysingMultiplier(item.quality) }
        : undefined;
      return candidates(data, item, open(item, side ? [side] : SIDES), floor, boost ? { boost } : {});
    }
    case "chaos": {
      // 1 つ消してから足す: 消える MOD (削減・抹消のお告げで絞る) ごとに、消えた後の候補で付く割合を足し合わせる。消えた MOD と同じ系統も付きうる
      // (2026-10-09 確率表の突き合わせ: 前は付いている系統を全部外していて、消えた系統の付き直しが 0% と出ていた)
      if (item.rarity !== "rare") return null;
      const side = sideOmen(used, "OmenofSinistralErasure", "OmenofDextralErasure");
      const gone = used.includes("OmenofWhittling") ? whittleTargets(item) : allMods(item).filter((m) => !m.fractured && (!side || m.side === side));
      if (!gone.length) return null;
      const acc = new Map<string, Candidate>();
      for (const r of gone) {
        // 足せるのは消えた後に空きのある側だけ (両側が埋まったレアなら消えた側だけ。2026-10-10 点検)
        const rest = without(item, r);
        const cs = candidates(data, rest, open(rest, SIDES), floor);
        const total = cs.reduce((a, c) => a + c.w, 0);
        if (!(total > 0)) continue;
        const k = 1 / gone.length / total;
        for (const c of cs) {
          const cur = acc.get(c.mod.id);
          if (!cur) { acc.set(c.mod.id, { ...c, w: c.w * k, tiers: c.tiers.map((t) => ({ ...t, w: t.w * k })) }); continue; }
          cur.w += c.w * k;
          for (const t of c.tiers) { const x = cur.tiers.find((y) => y.index === t.index); if (x) x.w += t.w * k; else cur.tiers.push({ ...t, w: t.w * k }); }
        }
      }
      return [...acc.values()];
    }
    default:
      return null;
  }
}
