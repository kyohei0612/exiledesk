/**
 * aim-odds.ts — エミュレーターの「狙う」(2026-10-09)
 *
 * オーナー「MOD がプレフィックスに付いてて、次の MOD を狙いたい時に確率が分からん。狙うボタンを押すと、この状態で一番付く確率が高い物を順に、
 * 使えるカレンシーに確率を出す。並び順は付きやすい順。冒涜も含める。反響も使える (使わない選択肢は無い) からセットで。
 * 安いとかじゃなくて確率を出したい。高貴なら左側・完全高貴、場合によっては上級の方が付きやすいとか」。
 *
 * 出し方: ステージで実際に打つのと同じ applyCurrency を、今のアイテムから何百回も試して数える (お告げ・均質化・強さの下限・同じ系統の除外も
 * そのまま入る)。冒涜は骨を打った後の発現の候補 (反響の引き直しを含めて 6 つ) に狙いが出れば当たり (選べるので)。
 * 未発現の冒涜 MOD がもう付いている時は「発現」の 1 行 (反響込み)。
 */
import { applyCurrency, kindOf } from "./apply-currency";
import { revealOffers, unrevealedOf } from "./apply-desecrate";
import { mulberry32 } from "../htc/rng";
import type { StageItem, StageMod } from "./types";
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { isCraftedSource, tierNoOf } from "./tier-rank";
import { FACTION_TAG, omenFor } from "./spec/omen-layer";
import { OMEN_KEY } from "./spec/omen-keys";
import { actionClassOfKey } from "./spec/action-class";

export interface AimTarget { modId: string; minTierIndex: number }
/** 試す打ち方 (カレンシー + お告げ)。reveal = 付いている未発現の MOD を発現させる (反響込み) */
export interface AimCombo { currency: string; omens: string[] }
export interface AimOdd extends AimCombo { p: number; n: number }

export const REVEAL = "reveal";
const ECHOES = OMEN_KEY.echoes;

/**
 * お告げの組み合わせ (付く MOD の出方が変わる物だけ。片方の側のお告げは 1 つまで)。側のお告げ・勢力はお告げの層 (spec/omen-layer.ts) から引く。
 * 触媒の高貴 (重みが変わる) が高貴の組に無いのは 10-09 に作った時からの漏れ (その時から効いていた、外した理由の記録なし)。足すと「狙う」の行が増える = 振る舞いが変わるので、
 * 2026-11-07 のまとめ直しでは足さず、ブラックの決めを待つ (jin-base)
 */
function omenSets(kind: string): string[][] {
  const sides = (k: string): string[][] => [[], ...(["prefix", "suffix"] as const).flatMap((s) => { const o = omenFor(k, s); return o ? [[o]] : []; })];
  switch (kind) {
    case "exalt": {
      const side = sides("exalt");
      return [...side, ...side.map((s) => [...s, OMEN_KEY.greater])];
    }
    case "chaos":
      return [[], [OMEN_KEY.whittling], ...sides("chaos").slice(1)];
    case "essence_perfect":
      return sides("essence_perfect");
    case "desecrate": {
      const fac = [[], ...Object.keys(FACTION_TAG).map((o) => [o])];
      return sides("desecrate").flatMap((s) => fac.map((f) => [...s, ...f]));
    }
    default:
      return [[]];
  }
}

/**
 * 当たりの判定の設定 (入口の aimHits)。sameText = 同じ系統で効果の文も同じ別の一般の modId も当たり (エッセンスの MOD とは互いに当たらない、10-24 オーナー。
 * 2026-10-22 オーナー「シミュ用の違いはエンジンの入口の設定で切り替える」)。その時の段は段の名前の T の数字で比べる (エッセンスの MOD の段の名前は
 * ふつうの MOD の段に合わせてある、apply-essence の normalTierOf)。省略 = 同じ modId だけ・段の番号で比べる (今まで通り)
 */
export interface AimHitOpts { data: PatchData; sameText?: boolean }
/** 当たり = その狙いの MOD が付いている (未発現は数えない) */
export const hits = (m: StageMod, t: AimTarget, o?: AimHitOpts): boolean => {
  if (m.unrevealed) return false;
  const want = o?.sameText ? o.data.mods.get(t.modId) : undefined;
  if (!want) return m.modId === t.modId && m.tierIndex >= t.minTierIndex;
  // エッセンスの MOD と一般の MOD は別物 (2026-10-24 オーナー): 狙いがエッセンスの MOD なら同じ modId だけ、段はエッセンス自身の段 (T1 = グレーター)。
  // 狙いが一般の MOD なら、エッセンスの MOD は同じ文でも当たらない
  if (isEssenceSource(want.source)) return m.modId === t.modId && m.tierIndex >= t.minTierIndex;
  if (isEssenceSource(o!.data.mods.get(m.modId)?.source)) return false;
  const same = m.modId === t.modId || (!!want.family && m.family === want.family && o!.data.mods.get(m.modId)?.text === want.text);
  return same && tierNoOf(m) <= want.tiers.length - t.minTierIndex;
};
const isEssenceSource = isCraftedSource;
const has = (item: StageItem, t: AimTarget, o?: AimHitOpts): boolean => [...item.prefixes, ...item.suffixes].some((m) => hits(m, t, o));

/** お告げが効いているかを見る種の数 (同じ種でお告げ無しと全部同じ結果なら、そのお告げは効いていない) */
const SAME_SEEDS = 8;
/** 骨 (未発現を付ける部品の手、actionClassOfKey) = 発現の候補に出れば当たり。鍵の文字 (kindOf の "desecrate") でなく部品で見る */
const addsUnrevealed = (key: string): boolean => actionClassOfKey(key).parts.includes("addUnrevealed");
/** 1 回打った結果の印 (付いた MOD・値・側・レア度・品質。冒涜は発現の候補も) */
function outcomeOf(data: PatchData, item: StageItem, key: string, omens: string[], seed: number): string {
  const rng = mulberry32(seed);
  const r = applyCurrency(data, item, key, rng, omens);
  if (!r.applied) return `x:${r.reason ?? ""}`;
  const it = r.item;
  const ms = [...it.prefixes, ...it.suffixes].map((m) => `${m.side}:${m.modId}#${m.tierIndex}:${JSON.stringify(m.values ?? null)}${m.fractured ? "f" : ""}${m.desecrated ? "d" : ""}${m.unrevealed ? JSON.stringify(m.unrevealed) : ""}`);
  const offers = addsUnrevealed(key) && unrevealedOf(it) ? (({ first, reroll }) => [...first, ...reroll].map((m) => `${m.modId}#${m.tierIndex}`))(revealOffers(data, it, rng)) : [];
  return JSON.stringify([it.rarity, it.quality ?? 0, it.qualityTag ?? null, it.catalystQuality ?? 0, !!it.corrupted, ms, offers]);
}

/**
 * 試す打ち方の一覧 (今のアイテムに打てる物だけ。keys = 棚の使える物)。
 * 効かないお告げの組み合わせは出さない (2026-10-16 要望 0c542dae「プレが埋まっていれば右手のネクロマンシーがあっても無くても同じはず」):
 * 同じ種で何回か打って、お告げを 1 枚減らした組み合わせと結果が全部同じなら、その組み合わせは外す (全カレンシー)
 */
export function aimCombos(data: PatchData, item: StageItem, keys: readonly string[]): AimCombo[] {
  const out: AimCombo[] = [];
  if (unrevealedOf(item)) out.push({ currency: REVEAL, omens: [ECHOES] });
  for (const k of keys) {
    const kind = kindOf(k);
    const seen = new Map<string, string[]>();
    const outcomes = (om: string[]): string[] => {
      const id = [...om].sort().join("+");
      let v = seen.get(id);
      if (!v) seen.set(id, (v = Array.from({ length: SAME_SEEDS }, (_, i) => outcomeOf(data, item, k, om, 1000 + i * 7919))));
      return v;
    };
    const same = (a: string[], b: string[]): boolean => { const x = outcomes(a), y = outcomes(b); return x.every((v, i) => v === y[i]); };
    for (const om of omenSets(kind)) {
      // どれか 1 枚を外しても結果が全部同じなら、その 1 枚は効いていない (その組み合わせはお告げの少ない方で出る)
      if (om.length && om.some((o) => same(om, om.filter((x) => x !== o)))) continue;
      // お告げが全部効く時だけ (効かないお告げは使われず、お告げ無しと同じになる)
      const r = applyCurrency(data, item, k, mulberry32(1), om);
      // 当たり所で弾かれた (打つ前には分からない) 物は打てる手として残す。確率は aimOdds が弾かれた回も数えて出す
      if (!r.applied && !r.random) continue;
      // コラプトさせる物は狙う手にしない。打てばその先クラフトできず、外れも当たりも狙いの役に立たない
      // (2026-10-09 オーナー「ヴァールに関しては意味わからん」: 書き換えの目でまれに付くので 1 位に出ていた)
      if (r.item.corrupted && !item.corrupted) continue;
      out.push({ currency: k, omens: kind === "desecrate" ? [...om, ECHOES] : om });
    }
  }
  return out;
}

/** 1 手の費用 = カレンシー + 掛けたお告げの値段 (発現は 0。狙う・スパムの道の打ち手が同じ物) */
export const stepCost = (c: { currency: string; omens: readonly string[] }, price: (key: string) => number): number =>
  (c.currency === REVEAL ? 0 : price(c.currency)) + c.omens.reduce((a, o) => a + price(o), 0);
/**
 * aimChain の回し方の種類 (画面の「何をどう回した数字か」の文はこれで分ける)。reveal = 発現を今の状態から / bone = 骨 → 発現の候補、毎回今の状態に戻す /
 * spam = カオススパム (今の MOD が消えても揃えば当たり、外れはその結果に続ける) / add = 付ける手 (空きがあるうち続ける) / keep = それ以外 (今の MOD が残っていれば続ける)
 */
export type AimChainMode = "reveal" | "bone" | "spam" | "add" | "keep";
export function aimChainMode(c: AimCombo): AimChainMode {
  if (c.currency === REVEAL) return "reveal";
  if (addsUnrevealed(c.currency)) return "bone";
  if (kindOf(c.currency) === "chaos") return "spam";
  return actionClassOfKey(c.currency).cls === "add" ? "add" : "keep";
}
/** 1 つの打ち方で n 回試して、狙いが付いた (冒涜は候補に出た) 割合 */
/**
 * 1 つの打ち方で n 回試して、狙い (全部。最大 4 つ、錬金術で一度に付く数) が揃った割合。冒涜は発現の候補に残りの 1 つが出れば揃った扱い
 * hit = 当たりの式の設定 (aimHits と同じ。省略 = 同じ modId だけ、渡すと sameText などがそのまま効く)
 */
export function aimOdds(data: PatchData, item: StageItem, ts: AimTarget | readonly AimTarget[], c: AimCombo, n: number, seed: number, hit0?: AimHitOpts): number {
  const list = Array.isArray(ts) ? (ts as readonly AimTarget[]) : [ts as AimTarget];
  const missing = (it: StageItem): AimTarget[] => list.filter((t) => !has(it, t, hit0));
  const offered = (o: { first: StageMod[]; reroll: StageMod[] }, miss: AimTarget[]): boolean => miss.length === 0 || (miss.length === 1 && [...o.first, ...o.reroll].some((m) => hits(m, miss[0]!, hit0)));
  const bone = addsUnrevealed(c.currency);
  let hit = 0;
  for (let i = 0; i < n; i++) {
    const rng = mulberry32(seed + i * 7919);
    if (c.currency === REVEAL) {
      if (offered(revealOffers(data, item, rng), missing(item))) hit++;
      continue;
    }
    const used = c.omens.filter((o) => o !== ECHOES);
    const r = applyCurrency(data, item, c.currency, rng, used);
    if (!r.applied) continue;
    if (bone) {
      if (offered(revealOffers(data, r.item, rng), missing(r.item))) hit++;
    } else if (!missing(r.item).length) hit++;
  }
  return hit / n;
}

/**
 * 当たるまで続けて回す (2026-10-09 オーナー「シミュレーターと一緒じゃだめなんかな、何回で成功するかで成功率出して、それに通貨当てはめて費用対効果でランキング」
 * 「消えたら外れで、やり直しは回数で」)。今の状態から同じ打ち方を n 回打つ。
 * - 当たり = 狙いが全部付いて、今付いている MOD (未発現以外) が 1 つも消えていない。当たったら今の状態に戻って続ける
 * - 今の MOD が消えた・コラプトした・もう打てない時は、今の状態からやり直し (費用は足さない、打った回数だけ数える)
 * - 外れても続けられる時 (カオスで新しく付いた物だけ入れ替わった、高貴で空きがまだある) は、その状態から続ける
 * - 冒涜は骨 → 発現の候補に出れば当たり、外れたら今の状態から (次の骨はもう打てないため)
 * - カオスはカオススパム: 今の MOD が消えても狙いが揃えば当たり、外れたらその結果に続けて打つ (2026-10-16 要望 63f6d901
 *   「カオススパムも候補に」: MOD が 1 つのレアはカオスで必ずその MOD が消え、消えたら外れの決まりでいつも 0% になって一覧に出なかった)
 * 返すのは 打った回数あたりの当たりの割合 (1 回の費用 ÷ これ = 付くまでの平均費用)。hit = 当たりの式の設定 (aimOdds と同じ)
 */
export function aimChain(data: PatchData, start: StageItem, ts: readonly AimTarget[], c: AimCombo, n: number, seed: number, hit0?: AimHitOpts): number {
  const keepIds = [...start.prefixes, ...start.suffixes].filter((m) => !m.unrevealed).map((m) => m.modId);
  const keeps = (it: StageItem): boolean => !it.corrupted && keepIds.every((id) => [...it.prefixes, ...it.suffixes].some((m) => m.modId === id));
  const missing = (it: StageItem): AimTarget[] => ts.filter((t) => !has(it, t, hit0));
  const offered = (o: { first: StageMod[]; reroll: StageMod[] }, miss: AimTarget[]): boolean => miss.length === 0 || (miss.length === 1 && [...o.first, ...o.reroll].some((m) => hits(m, miss[0]!, hit0)));
  const rng = mulberry32(seed);
  const used = c.omens.filter((o) => o !== ECHOES);
  const mode = aimChainMode(c);
  const spam = mode === "spam", bone = mode === "bone";
  let item = start, tries = 0, hit = 0, stuck = 0;
  while (tries < n) {
    if (c.currency === REVEAL) {
      tries++;
      if (offered(revealOffers(data, start, rng), missing(start))) hit++;
      continue;
    }
    const r = applyCurrency(data, item, c.currency, rng, used);
    if (!r.applied) {
      // 今の状態でも打てないなら終わり (一覧には打てる物しか出ないので、普通は来ない)
      if (item === start || ++stuck > n) break;
      item = start;
      continue;
    }
    tries++;
    if (bone) {
      if (keeps(r.item) && offered(revealOffers(data, r.item, rng), missing(r.item))) hit++;
      item = start;
      continue;
    }
    if (spam) {
      if (r.item.corrupted) { item = start; continue; }
      if (!missing(r.item).length) { hit++; item = start; continue; }
      item = r.item;
      continue;
    }
    if (!keeps(r.item)) { item = start; continue; }
    if (!missing(r.item).length) { hit++; item = start; continue; }
    item = r.item;
  }
  return tries ? hit / tries : 0;
}

/** もう付いているか (o = 当たりの式の設定、aimHits と同じ。省略 = 同じ modId だけ) */
export const aimDone = (item: StageItem, ts: readonly AimTarget[], o?: AimHitOpts): boolean => ts.length > 0 && ts.every((t) => has(item, t, o));
