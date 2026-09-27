/**
 * クラフトステージ: クラフトに使える物 1 個を打った結果を 1 回抽選する (2026-09-27、ADR-001)
 *
 * オーナー:「カレンシーっていうかクラフトに使える奴全部だねこのステージは」。
 * ここはオーブ (変成 / 増強 / 王者 / 錬金 / 高貴 / カオス / 消去) とそれに掛かるお告げ、そして他の物への振り分け:
 *   エッセンス → [[apply-essence.ts]]、骨と開示 → [[apply-desecrate.ts]]、神 / 破砕 / カタリスト / アーティファサー → [[apply-other.ts]]
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
import { addOne, allMods, removeOne, room, SIDES, skip, without, type PoolOpts } from "./stage-core";
import { applyEssence } from "./apply-essence";
import { applyBone, applyReveal } from "./apply-desecrate";
import { applyOther, OTHER_KINDS } from "./apply-other";
import { OMEN_FOR, UNMODELLED_OMENS } from "./omens";
import type { StageApply, StageItem, StageMod, StageSide } from "./types";

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
/** その手に掛かるお告げ (持っている中から) */
export function omensFor(currency: string, held: readonly string[]): string[] {
  const ok = OMEN_FOR[kindOf(currency)] ?? [];
  return held.filter((o) => ok.includes(o));
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
export function applyCurrency(data: PatchData, item: StageItem, currency: string, rng: () => number, omens: readonly string[] = []): StageApply {
  if (item.corrupted) return skip(item, "コラプトしたアイテムには使えない");
  const used = omensFor(currency, omens);
  const bad = used.find((o) => UNMODELLED_OMENS.includes(o));
  if (bad) return skip(item, "このお告げの効果はまだ入れていない");
  const r = applyInner(data, item, currency, rng, used);
  return r.applied ? { ...r, omensUsed: used } : r;
}

function applyInner(data: PatchData, item: StageItem, currency: string, rng: () => number, used: readonly string[]): StageApply {
  const kind = kindOf(currency);
  if (kind === "essence" || kind === "essence_perfect") return applyEssence(data, item, currency, rng, used);
  if (kind === "desecrate") return applyBone(data, item, currency, rng, used);
  if (kind === "reveal") return applyReveal(data, item, currency, rng, used);
  if (kind === "catalyst" || OTHER_KINDS.includes(kind)) return applyOther(data, item, currency, rng);

  const { strength } = parseKey(currency);
  const floor = floorOf(kind, strength);
  const count = allMods(item).length;
  const add = (it: StageItem, n: number, pick: (k: number, cur: StageItem) => readonly StageSide[] = () => SIDES, boost?: PoolOpts["boost"]): StageApply => {
    let cur = it;
    const added: StageMod[] = [];
    for (let i = 0; i < n; i++) {
      const r = addOne(data, cur, floor, rng, { sides: pick(i, cur), boost });
      if (!r) break;
      cur = r.item;
      added.push(r.mod);
    }
    return added.length ? { applied: true, item: cur, added, removed: [] } : skip(item, "付けられる MOD が無い");
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
      if (item.rarity !== "normal") return skip(item, "ノーマルのアイテムにだけ使える");
      // 左右の錬金のお告げ: その側を上限まで (残りは反対側)
      const side = sideOmen(used, "OmenofSinistralAlchemy", "OmenofDextralAlchemy");
      return add({ ...item, rarity: "rare" }, 4, (_k, cur) => (side ? (room(cur, side) ? [side] : SIDES.filter((s) => s !== side)) : SIDES));
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
      if (used.includes("OmenofWhittling")) {
        // 削りのお告げ: 一番 MOD レベルの低い物を消す (同じなら等しく)
        const rem = allMods(item).filter((m) => !m.fractured);
        const low = Math.min(...rem.map((m) => m.modLevel));
        const lows = rem.filter((m) => m.modLevel === low);
        const mod = lows[Math.floor(rng() * lows.length)];
        r = mod ? { item: without(item, mod), mod } : null;
      } else {
        // 左右の抹消のお告げ: 消すのをその側だけに (足す側は選べない)
        const side = sideOmen(used, "OmenofSinistralErasure", "OmenofDextralErasure");
        r = removeOne(item, rng, side ? [side] : SIDES);
      }
      if (!r) return skip(item, "外せる MOD が無い");
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
