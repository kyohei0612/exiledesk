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
import { addForced, addOne, allMods, removeForced, removeOne, room, SIDES, skip, without, type Force, type PoolOpts } from "./stage-core";
import { applyEssence } from "./apply-essence";
import { applyBone, applyReveal } from "./apply-desecrate";
import { applyOther, OTHER_KINDS } from "./apply-other";
import { applySanctify, applyVaal } from "./apply-vaal";
import { applyChance, applyJeweller, applyQuality, applyWisdom, collectShard, isShard, QUALITY_TARGET, SHARD_REASON } from "./apply-act";
import { isFlask, isGem, uniqueBaseOf, uniquesForBase, uniquesOfClassForBase } from "./stage-bases";
import { itemBaseFor } from "../htc/bridge";
import { jaTypeName } from "../trade2/localize";
import { OMEN_FOR, REMOVED_OMENS, UNMODELLED_OMENS } from "./omens";
import type { StageApply, StageItem, StageMod, StageSide } from "./types";
import { ANY_STATE, applyExtra, FOR_CORRUPTED, isExtra } from "./apply-extra";
import { applyFlux, isFlux } from "./apply-flux";
import { applyDispose, DISPOSE_JA, isDispose } from "./apply-dispose";
import { applyRune, isRune } from "./stage-runes";

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
  // 未発現の冒涜 MOD は MOD レベル 1 として数える (poe2wiki Omen of Whittling・0.3.1、POE2Tube 要望 ㉞-6。前は 0 扱い)
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
const pickFail = (item: StageItem, why: string): StageApply => ({ ...skip(item, `指名できない: ${why}`), pickError: true });

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
  if (isShard(currency)) return hint.collect ? collectShard(item, currency) : skip(item, SHARD_REASON);
  if (item.destroyed) return skip(item, "壊れたアイテムには何も使えない");
  if (item.disposed) return skip(item, `${DISPOSE_JA[item.disposed]}したアイテムには何も使えない`);
  if (item.mirrored && !ANY_STATE.includes(currency)) return skip(item, "ミラーしたアイテムには使えない");
  // 未鑑定は先に鑑定の巻物 (MOD が見えないアイテムには打てない)
  // 解呪・サルベージ (要望 ⑰-5) は未鑑定・コラプトでもできる
  if (isDispose(currency)) return applyDispose(item, currency);
  if (item.identified === false && currency !== "wisdom") return skip(item, "未鑑定 (先に鑑定の巻物で鑑定する)");
  // コラプト・聖別の後は手を加えられない。腐食のお告げでコラプトした未発現の MOD の発現だけはできる (ゲームと同じ)
  // コラプトしたアイテムにだけ打つ物 (生贄のオーブ・アーキテクト等、apply-extra.ts) と、状態を問わない物 (鏡・抽出) は通す
 // ルーン (要望 ⑰-1) はコラプト・聖別の後でもはめられる物がある (クライアントの CanSocketInCorruptedSanctified、applyRune で見る)
  if (isRune(currency)) return applyRune(item, currency, data);
  if (item.sanctified && !ANY_STATE.includes(currency)) return skip(item, "聖別したアイテムには使えない");
  if (item.corrupted && kindOf(currency) !== "reveal" && !FOR_CORRUPTED.includes(currency) && !ANY_STATE.includes(currency)) return skip(item, "コラプトしたアイテムには使えない");
  // 今のゲームに無いお告げ (相場に値段が無い) を掛けていたら打てない (2026-09-29 オーナー「錬金術のお告げとかない、王者のお告げやら」)
  const gone = omens.find((o) => REMOVED_OMENS.includes(o));
  if (gone) return skip(item, "今のゲームに無いお告げ");
  const used = omensFor(currency, omens);
  const bad = used.find((o) => UNMODELLED_OMENS.includes(o));
  if (bad) return skip(item, "このお告げの効果はまだ入れていない");
  const r = applyInner(data, item, currency, rng, used, hint);
  if (!r.applied) return r;
  // ヒネコラの予見は「アイテムを変えると消える」(説明文)
  const item2 = currency !== "hinekora" && r.item.foreseen ? { ...r.item, foreseen: false } : r.item;
  return { ...r, item: item2, omensUsed: used };
}

function applyInner(data: PatchData, item: StageItem, currency: string, rng: () => number, used: readonly string[], hint: ApplyHint): StageApply {
  const kind = kindOf(currency);
  // アクト中に落ちる物 (要望 ⑧、apply-act.ts)
  if (currency === "wisdom") return applyWisdom(item);
  if (currency in QUALITY_TARGET) return applyQuality(item, currency);
  if (currency === "jeweller_lesser" || currency === "jeweller_greater" || currency === "jeweller_perfect") return applyJeweller(item, currency);
  if (currency === "chance") return toUniqueBase(data, applyChance(item, rng, used.includes("OmenoftheAncients") ? uniquesOfClassForBase(item.base) : uniquesForBase(item.base), hint.outcome, used));
  if (isExtra(currency)) return toUniqueBase(data, applyExtra(item, currency, rng, hint.outcome));
  if (isFlux(currency)) return applyFlux(data, item, currency);
  // フラスコ・スキルジェム (MOD の置き場が無い) には、上の物と熟練工以外は打てない
  if (isFlask(item.cls.category) || isGem(item.cls.category)) return skip(item, isGem(item.cls.category) ? "スキルジェムには使えない" : "フラスコには使えない (このステージでは MOD を扱わない)");
  if (kind === "essence" || kind === "essence_perfect") return applyEssence(data, item, currency, rng, used);
  // 噛み切られた骨はアイテムレベル 64 以下だけ (クライアントの AbyssBenchTicketTypes.MaximumItemLevel)
  if (currency === "desecrate_gnawed" && item.itemLevel > GNAWED_MAX_ILVL) return skip(item, `アイテムレベル ${GNAWED_MAX_ILVL} 以下にだけ使える`);
  if (kind === "desecrate") return applyBone(data, item, currency, rng, used);
  if (kind === "reveal") return applyReveal(data, item, currency, rng, used);
  if (kind === "vaal") return applyVaal(data, item, rng, used);
  if (kind === "divine" && used.includes("OmenofSanctification")) return applySanctify(data, item, rng);
  // 祝福のお告げ: 暗黙 MOD だけを振り直す (クライアントの説明)。このステージは暗黙 MOD の数値を持たないので、明示 MOD はそのまま
  if (kind === "divine" && used.includes("OmenoftheBlessed")) return { applied: true, item, added: [], removed: [], note: "祝福のお告げ: 暗黙 MOD だけを振り直した (明示 MOD は変わらない。このステージは暗黙の数値を持たない)" };
  if (kind === "catalyst" || OTHER_KINDS.includes(kind)) return applyOther(data, item, currency, rng, !!hint.oneCatalyst);

  const { strength } = parseKey(currency);
  const floor = floorOf(kind, strength);
  // 用語集 BetterCurrencyMinimumLevel「最低 MOD レベルのあるカレンシーは、アイテムレベルがそれより低い品には使えない」(要望 ㉝ の 3)
  if (floor > 0 && item.itemLevel < floor) return skip(item, `アイテムレベルが ${floor} 未満には使えない`);
  const count = allMods(item).length;
  const add = (it: StageItem, n: number, pick: (k: number, cur: StageItem) => readonly StageSide[] = () => SIDES, boost?: PoolOpts["boost"]): StageApply => {
    let cur = it;
    const added: StageMod[] = [];
    const picked: NonNullable<StageApply["picked"]> = [];
    if ((hint.pick?.length ?? 0) > n) return pickFail(item, `この手で付く MOD は ${n} つまで`);
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
    }
    return added.length ? { applied: true, item: cur, added, removed: [], ...(picked.length ? { picked } : {}) } : skip(item, "付けられる MOD が無い");
  };
  switch (kind) {
    case "transmute":
      if (item.rarity !== "normal") return skip(item, "ノーマルのアイテムにだけ使える");
      return add({ ...item, rarity: "magic" }, 1);
    case "augment":
      if (item.rarity !== "magic") return skip(item, "マジックのアイテムにだけ使える");
      if (count >= 2) return skip(item, "MOD が 2 つ付いている (マジックはプレ 1 / サフィ 1 まで)");
      return add(item, 1);
    case "regal": {
      if (item.rarity !== "magic") return skip(item, "マジックのアイテムにだけ使える");
      // 左右の戴冠のお告げ: 足すのをその側だけに
      const side = sideOmen(used, "OmenofSinistralCoronation", "OmenofDextralCoronation");
      const rare = { ...item, rarity: "rare" as const };
      if (side && !room(rare, side)) return skip(item, "お告げの側に空きが無い");
      return add(rare, 1, () => (side ? [side] : SIDES));
    }
    case "alchemy": {
      // ノーマルかマジック → MOD 4 個のレア (クライアントの説明文)。マジックに使った時は**付いている MOD は残らない**
      // (0.3.1「When used on Magic items the original modifiers are not retained」、POE2Tube 要望 ㉞-1。前は残して 4 個まで足していた)
      if (item.rarity !== "normal" && item.rarity !== "magic") return skip(item, "ノーマルかマジックのアイテムにだけ使える");
      // 左右の錬金のお告げ: その側を上限まで (残りは反対側)
      const side = sideOmen(used, "OmenofSinistralAlchemy", "OmenofDextralAlchemy");
      const gone = allMods(item);
      const r = add({ ...item, rarity: "rare", prefixes: [], suffixes: [] }, 4, (_k, cur) => (side ? (room(cur, side) ? [side] : SIDES.filter((s) => s !== side)) : SIDES));
      return r.applied ? { ...r, removed: [...gone, ...r.removed] } : r;
    }
    case "exalt": {
      if (item.rarity !== "rare") return skip(item, "レアのアイテムにだけ使える");
      const side = sideOmen(used, "OmenofSinistralExaltation", "OmenofDextralExaltation");
      const sides = side ? [side] : SIDES;
      if (!sides.some((s) => room(item, s))) return skip(item, side ? "お告げの側に空きが無い" : "足す枠が無い");
      // 大いなる高貴のお告げ: 2 つ足す (枠が 1 つなら 1 つ)。触媒の高貴のお告げ: 品質の種類の MOD を重く引いて、品質を使い切る
      const n = used.includes("OmenofGreaterExaltation") ? 2 : 1;
      if (used.includes("OmenofCatalysingExaltation")) {
        const tag = item.qualityTag;
        if (!tag || !(item.quality > 0)) return skip(item, "触媒の高貴のお告げは品質 (カタリスト) が要る");
        const r = add(item, n, () => sides, { test: (m) => boostedBy(m, tag), mult: catalysingMultiplier(item.quality) });
        return r.applied ? { ...r, item: { ...r.item, quality: 0 } } : r;
      }
      return add(item, n, () => sides);
    }
    case "chaos": {
      if (item.rarity !== "rare") return skip(item, "レアのアイテムにだけ使える");
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
      if (!r) return skip(item, "外せる MOD が無い");
      const f = hint.pick?.[0];
      if (f) {
        const a = addForced(data, r.item, floor, rng, f);
        if ("error" in a) return pickFail(item, a.error);
        return { applied: true, item: a.item, added: [a.mod], removed: [r.mod], picked: [{ modId: a.mod.modId, tierName: a.mod.tierName, chance: a.chance }] };
      }
      const a = addOne(data, r.item, floor, rng);
      return { applied: true, item: a?.item ?? r.item, added: a ? [a.mod] : [], removed: [r.mod] };
    }
    case "annul": {
      if (item.rarity === "normal") return skip(item, "マジックかレアのアイテムにだけ使える");
      if (used.includes("OmenofLight")) {
        // 光のお告げ: 冒涜の MOD を消す
        const d = allMods(item).find((m) => m.desecrated && !m.fractured);
        if (!d) return skip(item, "光のお告げ: 冒涜の MOD が無い");
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
      if (!removed.length) return skip(item, side ? "お告げの側に外せる MOD が無い" : "外せる MOD が無い");
      return { applied: true, item: cur, added: [], removed };
    }
    default:
      return skip(item, `このアイテムはまだ使えない (${currency})`);
  }
}
