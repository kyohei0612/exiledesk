/**
 * sim-greater.ts — シミュレーターの「グレーターエッセンスを巻き込む道」(2026-10-20 オーナー)。
 *
 * マジックをレアにするエッセンス (レッサー・無印・グレーター、出どころ essence) で付ける狙いがあると、フラクチャー済み・4 MOD のレアは買えない
 * (「モッドの付け方を決める段階で、グレーター系で付ける奴はフラクチャー済み買いはできない」)。フラクチャーは自前だけで、
 * マジックのループでフラクチャーの候補と反対側の 1 つ (残す MOD) を揃える → そのエッセンスでレア → 冒涜の壁 → フラクチャー (固定できるのは 3 つに 1 つ)。
 * ⑤ は、残す MOD とエッセンスの MOD と壁が付いたまま固定されたレアから (見本の靴 S-7YHuq3-P4: 移動スピード + 耐性 T1 → 絢爛 → 壁 → フラクチャー)
 */
import type { PatchData, StageSide } from "../craft-stage/engine";
import { methodOfTarget, type SimTargetIn } from "./quiz-build";
import type { magicAugOdds } from "./sim-odds";
import { sideOfMod } from "../craft-stage/engine";

/** マジックをレアにするエッセンスで付ける狙い (無ければ null) */
export function magicEssenceTarget(data: PatchData, targets: readonly SimTargetIn[]): SimTargetIn | null {
  return targets.find((t) => methodOfTarget(data, t) === "essence" && data.mods.get(t.modId)?.source === "essence") ?? null;
}

/** その段のエッセンスの棚のキー (段の名前が Lesser / Greater / それ以外 = 無印) */
export function essenceKeyFor(data: PatchData, modId: string, minTierIndex: number): string {
  const name = data.mods.get(modId)?.tiers[minTierIndex]?.name ?? "";
  const grade = /^Lesser/.test(name) ? "lesser" : /^Greater/.test(name) ? "greater" : "normal";
  return `essence:${grade}:${modId}`;
}

/**
 * フラクチャーの候補の反対側に残す MOD: 反対側の普通の付け方 (高貴ガチャ・カオススパム) の狙いの 1 つ目 (「どれか」の候補ごと)。
 * マジックはプレ 1 つ・サフィ 1 つなので 1 つだけ
 */
export function keepTargetFor(data: PatchData, targets: readonly SimTargetIn[], fracSide: "prefix" | "suffix"): SimTargetIn | null {
  return targets.find((t) => {
    const m = methodOfTarget(data, t);
    if (m !== "exalt" && m !== "chaos") return false;
    const side = sideOfMod(data, t.modId);
    return side !== fracSide && (t.alts ?? []).every((a) => sideOfMod(data, a.modId) === side);
  }) ?? null;
}

/**
 * マジックのループの打つ数の平均 (変成の後): 外れがあれば消去 (どちらが消えるかは半々)、空いた側があれば増強。両側が当たりで終わり。
 * p = フラクチャーの側で当たる確率、q = 反対側で当たる確率 (null = 反対側は見ない)、share = 両側が空の時にフラクチャーの側に付く割合
 */
export function magicLoopCounts(p: number, q: number | null, share: number): { augment: number; annul: number } {
  // 状態: 側ごとに 0 空 / 1 当たり / 2 外れ。値 = ここから終わりまでの増強・消去の平均
  const need = q != null;
  const done = (a: number, b: number): boolean => a === 1 && (!need || b === 1);
  const aug = new Float64Array(9), ann = new Float64Array(9);
  const ix = (a: number, b: number): number => a * 3 + b;
  const qq = q ?? 0.5;
  for (let it = 0; it < 4000; it++) {
    let moved = 0;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      if (done(a, b)) continue;
      const i = ix(a, b);
      let na: number, nn: number;
      const badA = a === 2, badB = need && b === 2;
      if (badA || badB) {
        // 消去: 付いている MOD から 1 つ (半々。片側だけなら必ずそれ)
        const opts: Array<[number, number]> = [];
        if (a) opts.push([0, b]);
        if (b) opts.push([a, 0]);
        na = opts.reduce((s, [x, y]) => s + aug[ix(x, y)]!, 0) / opts.length;
        nn = 1 + opts.reduce((s, [x, y]) => s + ann[ix(x, y)]!, 0) / opts.length;
      } else {
        // 増強: 空いた側へ (両側が空なら重みの割合で)
        const toA = a === 0 && b === 0 ? share : a === 0 ? 1 : 0;
        const nexts: Array<[number, number, number]> = [];
        if (toA > 0) nexts.push([toA * p, 1, b], [toA * (1 - p), 2, b]);
        if (toA < 1) nexts.push([(1 - toA) * qq, a, 1], [(1 - toA) * (1 - qq), a, 2]);
        na = 1 + nexts.reduce((s, [w, x, y]) => s + w * aug[ix(x, y)]!, 0);
        nn = nexts.reduce((s, [w, x, y]) => s + w * ann[ix(x, y)]!, 0);
      }
      moved = Math.max(moved, Math.abs(na - aug[i]!), Math.abs(nn - ann[i]!));
      aug[i] = na; ann[i] = nn;
    }
    if (moved < 1e-9) break;
  }
  // 変成の後: 1 つ目は重みの割合で側が決まる
  const first: Array<[number, number, number]> = [[share * p, 1, 0], [share * (1 - p), 2, 0], [(1 - share) * qq, 0, 1], [(1 - share) * (1 - qq), 0, 2]];
  const val = (arr: Float64Array, a: number, b: number): number => (done(a, b) ? 0 : arr[ix(a, b)]!);
  return { augment: first.reduce((s, [w, a, b]) => s + w * val(aug, a, b), 0), annul: first.reduce((s, [w, a, b]) => s + w * val(ann, a, b), 0) };
}

export interface GreaterLine { name: string; n: number; each: number }
export interface GreaterRoute {
  /** レアにするエッセンスの棚のキーと狙い */
  essKey: string; ess: SimTargetIn;
  /** マジックで揃える反対側の MOD (無ければ null = エッセンスの後に高貴で 3 MOD) */
  keep: SimTargetIn | null;
  /** 反対側で当たる確率 (増強 1 回) */
  q: number | null;
  augment: number; annul: number;
  /** ループの中身 (分かれ方を引く用): 候補の側で当たる確率、両側が空の時に候補の側に付く割合、増強の等級 */
  p: number; share: number; augKey: string;
  lines: GreaterLine[];
  /** 1 回分 (フラクチャーまで)。フラクチャーで固定できるのは候補・残す MOD・エッセンスの MOD のどれか (壁は未発現で固定されない。当たりは sim-odds の fractureOdds) */
  once: number;
  /** 残す MOD が増強で付かない (段の下限が届かない) */
  cantKeep: boolean;
}

/**
 * 道の費用 (1 回分)。白 + 変成 + (増強 + 消去) × ループの平均 + エッセンス + (残す MOD が無ければ高貴) + 壁 (冒涜 + フラクチャーの側のネクロマンシー) + フラクチャー。
 * 1 個 = 1 回分 ÷ フラクチャーの当たり。固定の後の消去は無い (残す MOD を持ったまま進む)。
 * 反対側の当たり q・両側が空の時の側の割合は、その等級の増強の 1 手の確率 (odds = sim-odds の magicAugOdds、エンジンの入口) から
 */
export function greaterRouteCost(o: {
  data: PatchData; targets: readonly SimTargetIn[]; fracSide: StageSide; p: number;
  grade: { tra: string; aug: string };
  odds: ReturnType<typeof magicAugOdds>;
  white: number; runeLines?: GreaterLine[]; price: (k: string) => number; name: (k: string) => string;
}): GreaterRoute | null {
  const ess = magicEssenceTarget(o.data, o.targets);
  if (!ess) return null;
  const keep = keepTargetFor(o.data, o.targets, o.fracSide);
  const q = keep ? o.odds.hit(o.fracSide === "prefix" ? "suffix" : "prefix", [keep, ...(keep.alts ?? [])]) : null;
  const share = o.odds.share[o.fracSide];
  const { augment, annul } = magicLoopCounts(o.p, q, share);
  const essKey = essenceKeyFor(o.data, ess.modId, ess.minTierIndex);
  const necro = o.fracSide === "prefix" ? "OmenofSinistralNecromancy" : "OmenofDextralNecromancy";
  const lines: GreaterLine[] = [
    { name: "白のベース", n: 1, each: o.white },
    ...(o.runeLines ?? []),
    { name: o.name(o.grade.tra), n: 1, each: o.price(o.grade.tra) },
    { name: `${o.name(o.grade.aug)} (ループ)`, n: augment, each: o.price(o.grade.aug) },
    { name: `${o.name("annul")} (ループ)`, n: annul, each: o.price("annul") },
    { name: o.name(essKey), n: 1, each: o.price(essKey) },
    ...(keep ? [] : [{ name: `${o.name("exalt")} (3 MOD に)`, n: 1, each: o.price("exalt") }]),
    { name: `${o.name("desecrate")} (壁)`, n: 1, each: o.price("desecrate") },
    { name: o.name(necro), n: 1, each: o.price(necro) },
    { name: o.name("fracture"), n: 1, each: o.price("fracture") },
  ];
  const once = lines.reduce((a, l) => a + l.n * l.each, 0);
  return { essKey, ess, keep, q, augment, annul, p: o.p, share, augKey: o.grade.aug, lines, once, cantKeep: q === 0 };
}
