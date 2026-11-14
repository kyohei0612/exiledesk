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
import { offeredMods, revealOffers, unrevealedOf } from "./apply-desecrate";
import { OMEN_FOR } from "./omens";
import { mulberry32 } from "../htc/rng";
import type { StageItem, StageMod } from "./types";
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { isCraftedSource, tierNoOf } from "./tier-rank";
import { omenRivals } from "./spec/omen-layer";
import { OMEN_KEY } from "./spec/omen-keys";
import { actionClassOfKey } from "./spec/action-class";

/**
 * 狙いの札。anyEle = 「いずれかの元素耐性」の n 番 (1〜3、S-10h ②): 一般の火・冷気・雷耐性のどれかが段 (T = modId の段の数 − minTierIndex) 以上なら当たり、
 * n 番は当たる元素耐性が n 個で付いている。eleSkip = 数えない系統 (元素を決めた狙いの系統)。modId は火・冷気・雷のどれか (段の数を見る札、S-10h ③)
 */
export interface AimTarget { modId: string; minTierIndex: number; anyEle?: number; eleSkip?: readonly string[] }
/** 試す打ち方 (カレンシー + お告げ)。reveal = 付いている未発現の MOD を発現させる (反響込み) */
export interface AimCombo { currency: string; omens: string[] }
export interface AimOdd extends AimCombo { p: number; n: number }

export const REVEAL = "reveal";
const ECHOES = OMEN_KEY.echoes;

/** 付く MOD の出方が変わる手 (狙うでお告げの組を試す手) */
const AIM_OMEN_KINDS: ReadonlySet<string> = new Set(["exalt", "chaos", "essence_perfect", "desecrate"]);
/**
 * お告げの組み合わせ = その手に掛かるお告げ (OMEN_FOR) の組のうち、一緒に掛けられない物 (OMEN_EXCLUSIVE、左と右・勢力 2 枚) を含まない物全部。
 * 効かない組は aimCombos が結果の比べで外す (腐食と側のお告げ など)。前は手ごとの手書きの組で、触媒の高貴・削減 + 抹消・腐食が抜けていた
 * (11-07 jin-base4、ブラック 57 の決め A10「お告げの層から組を作り触媒の高貴も入れる」)
 */
function omenSets(kind: string): string[][] {
  if (!AIM_OMEN_KINDS.has(kind)) return [[]];
  let sets: string[][] = [[]];
  for (const o of OMEN_FOR[kind] ?? []) {
    const rivals = new Set(omenRivals(o));
    sets = [...sets, ...sets.filter((s) => !s.some((x) => rivals.has(x))).map((s) => [...s, o])];
  }
  return sets;
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
  if (t.anyEle) return eleHit(m, t, o);
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
/** 「いずれかの元素耐性」に数える系統 (一般の火・冷気・雷耐性だけ。全ての元素耐性・2 元素・混沌・冒涜・エッセンスは数えない、S-10h ①) */
export const ANY_ELE_FAMILIES: readonly string[] = ["FireResistance", "ColdResistance", "LightningResistance"];
/**
 * 「いずれかの元素耐性」の当たり (S-10h ②): 一般の MOD (クラフト・冒涜・エッセンスでない) で系統が火・冷気・雷耐性のどれか、eleSkip に無く、段が狙いの T 以上。
 * data があれば出どころ normal と段の名前の T で比べ、無ければ段の番号で比べる (3 元素とも段の数が同じ 8 なので同じ答え)
 */
function eleHit(m: StageMod, t: AimTarget, o?: AimHitOpts): boolean {
  if (m.crafted || m.desecrated || !ANY_ELE_FAMILIES.includes(m.family) || t.eleSkip?.includes(m.family)) return false;
  if (!o) return m.tierIndex >= t.minTierIndex;
  const mod = o.data.mods.get(m.modId), want = o.data.mods.get(t.modId);
  if (!mod || !want || mod.source !== "normal") return false;
  return tierNoOf(m) <= want.tiers.length - t.minTierIndex;
}
/**
 * 品の MOD に狙いが付いているか: 当たる MOD が anyEle の数 (無ければ 1) 以上 (S-10h ②。元素耐性は 1 つの品に同じ系統が 2 つ付かないので、数 = 違う元素の数)。
 * 「もう付いているか」(aimDone)・次の手で狙う (aimOdds・aimChain) はこれで見る
 */
export const aimHeldIn = (mods: readonly StageMod[], t: AimTarget, o?: AimHitOpts): boolean => {
  const need = t.anyEle ?? 1;
  let n = 0;
  for (const m of mods) if (hits(m, t, o) && ++n >= need) return true;
  return false;
};
/**
 * 狙いの札どうしが同じ MOD か (aimHits の sameText と同じ見方: 同じ modId か、同じ系統で効果の文も同じ一般の MOD。エッセンスの MOD は同じ modId だけ)。
 * tier: true = 段の T も同じ (sameText の段は段の名前の T = その MOD の段の数 − 段の番号)。省略 = 段は見ないが、aimHits と同じく a の T が b の段の数を超える時は別物
 * (11-07 jin-base4、シミュ部長の頼み: 木の sameAimMod / sameAim が札から部分だけの MOD を組んで aimHits に当てていた)
 */
export function sameAimTarget(data: PatchData, a: AimTarget, b: AimTarget, o: { tier?: boolean } = {}): boolean {
  const ma = data.mods.get(a.modId), mb = data.mods.get(b.modId);
  const tA = (ma?.tiers.length ?? 0) - a.minTierIndex, tB = (mb?.tiers.length ?? 0) - b.minTierIndex;
  // 「いずれかの元素耐性」は元素を見ない (両方なら同じ MOD、片方だけなら別物。S-10h ③)
  if (!!a.anyEle !== !!b.anyEle) return false;
  if (a.anyEle) return !o.tier || tA === tB;
  if (a.modId === b.modId) return !o.tier || a.minTierIndex === b.minTierIndex;
  if (!ma || !mb || isEssenceSource(ma.source) || isEssenceSource(mb.source)) return false;
  if (!mb.family || ma.family !== mb.family || ma.text !== mb.text) return false;
  return o.tier ? tA === tB : tA <= (mb.tiers.length ?? 0);
}
const has = (item: StageItem, t: AimTarget, o?: AimHitOpts): boolean => aimHeldIn([...item.prefixes, ...item.suffixes], t, o);

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
      // 骨は反響のお告げ無し (発現の候補 1 組) と有り (2 組、反響の値段も費用に) の両方 (E-69。確率の表と同じく反響を掛けた時だけ 2 組目を数える、11-07 A27)
      if (kind === "desecrate") out.push({ currency: k, omens: om }, { currency: k, omens: [...om, ECHOES] });
      else out.push({ currency: k, omens: om });
    }
  }
  return out;
}

/** 1 手の費用 = カレンシー + 掛けたお告げの値段 (発現は 0。狙う・スパムの道の打ち手が同じ物) */
export const stepCost = (c: { currency: string; omens: readonly string[] }, price: (key: string) => number): number =>
  (c.currency === REVEAL ? 0 : price(c.currency)) + c.omens.reduce((a, o) => a + price(o), 0);
/**
 * aimChain の回し方の種類 (画面の「何をどう回した数字か」の文はこれで分ける)。reveal = 発現を今の状態から / bone = 骨 → 発現の候補、毎回今の状態に戻す /
 * spam = カオススパム (今の MOD が消えても揃えば当たり、外れはその結果に続ける) / keep = それ以外 (今の MOD が残っていれば続ける、打てなくなったら今の状態へ)。
 * aimChain の本当の分かれ方の 4 つだけ (高貴も keep。11-07 エミュ部長: add を分けると変成・増強・王者・エッセンスの説明が変わる)
 */
export type AimChainMode = "reveal" | "bone" | "spam" | "keep";
export function aimChainMode(c: AimCombo): AimChainMode {
  if (c.currency === REVEAL) return "reveal";
  if (addsUnrevealed(c.currency)) return "bone";
  if (kindOf(c.currency) === "chaos") return "spam";
  return "keep";
}
/** 1 つの打ち方で n 回試して、狙いが付いた (冒涜は候補に出た) 割合 */
/**
 * 1 つの打ち方で n 回試して、狙い (全部。最大 4 つ、錬金術で一度に付く数) が揃った割合。冒涜は発現の候補に残りの 1 つが出れば揃った扱い
 * hit = 当たりの式の設定 (aimHits と同じ。省略 = 同じ modId だけ、渡すと sameText などがそのまま効く)
 */
export function aimOdds(data: PatchData, item: StageItem, ts: AimTarget | readonly AimTarget[], c: AimCombo, n: number, seed: number, hit0?: AimHitOpts): number {
  const list = Array.isArray(ts) ? (ts as readonly AimTarget[]) : [ts as AimTarget];
  const missing = (it: StageItem): AimTarget[] => list.filter((t) => !has(it, t, hit0));
  const offered = (o: { first: StageMod[]; reroll: StageMod[] }, miss: AimTarget[]): boolean => miss.length === 0 || (miss.length === 1 && offeredMods(o, c.omens.includes(ECHOES)).some((m) => hits(m, miss[0]!, hit0)));
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
  const offered = (o: { first: StageMod[]; reroll: StageMod[] }, miss: AimTarget[]): boolean => miss.length === 0 || (miss.length === 1 && offeredMods(o, c.omens.includes(ECHOES)).some((m) => hits(m, miss[0]!, hit0)));
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
