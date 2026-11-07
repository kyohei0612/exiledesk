/**
 * route-race.ts — 狙いの MOD 1 つに、どのスパムが一番早く・安く着くか (2026-10-18 オーナー「エミュレーターに簡易シミュレーターページ。
 * 1 MOD を対象にどのルートが一番早く着くか。要はスパム。冒涜スパムは無し。高貴・増強・カオスのスパム」)。
 *
 * 打つのは全部エミュレーターと同じ applyCurrency (決まりはエンジンのまま)。白のベースから、等級 (無印 / 上級 / 完全) ごとに runs 人分打って平均を出す。
 * 白のベース代はどの道でも同じなので入れない。
 *   - 増強スパム: 変成でマジック → 狙いの側に狙い以外が付いていれば消去 (狙いの側が空くまで)、空いていれば増強 (狙いの側に付くまで) を、狙いが付くまで繰り返す。
 *     (オーナー「狙いたい側の接辞が消えるまで消去、増強は狙いたい側の接辞が付くまで増強、これを一生繰り返す」)。マジックに狙いの側の枠が無いベースは使えない
 *   - カオススパム: MOD 1 つのレアから、狙いが付くまでカオス (1 つ消えて 1 つ付くので MOD は 1 つのまま)
 *   - 高貴スパム: MOD 0 のレアから、高貴 + 偉大な高貴のお告げで 2 つ付ける → 外れたら消去 2 回で 0 に戻して繰り返す
 *     (2026-10-19 オーナー「カオスは 1 MOD レアで開始、高貴は 0 MOD レアで開始。偉大打って消去で 2 MOD でスパム、ベースは同じで 0 MOD レア」)
 *   始めのレア (MOD 0 / 1 つ) を作る費用はどの道にも入れない (カオスの 1 つは高貴 1 回で作るが数えない。狙いそのものが付いたら作り直す)
 *   from (始めのアイテム) を渡した時は、カオスの道だけをそのアイテムのまま (フラクチャー・品質・ルーン込み) 打つ (2026-10-22 要望 51092b58、
 *   オーナー「現在のクラフトを参照した状態からカオススパムできるようにしたらええんやない」)。ルーンの下ごしらえ (prep) はしない。
 *   そのアイテムがフラクチャーだけ (カオスで消せる MOD が無い) なら、頭で高貴 1 回を打って 1 つ足し、その値段も費用に入れる (2026-10-22 オーナー)
 *   100 人の競争 (raceOne)・その行の形 (RaceRow)・シェアの包み (packRace) はエミュのスパムシミュの画面だけなので engine-emu/spam-race.ts (2026-10-23)。
 *   当たりは複数並べられる (どれか 1 つが付いたら止める = OR。2026-10-22 オーナー)。結果には当たりごとの人数 (hitsBy) も持つ。
 *   増強の道はプレとサフィが独立に動く (マジックはプレ 1・サフィ 1。メモ sim-decisions-2026-10-20 の 10-21): 当たりのある側に外れが付いていたら消去、
 *   無ければ増強。当たりがプレとサフィの両方にある時は、どれか 1 つの数字に加えて「両方揃うまで (プレ 1 + サフィ 1)」の平均も出す (RaceRow.both。2026-10-22 オーナー)
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { hits as aimHits, stepCost } from "./aim-odds";
import { applyCurrency } from "./apply-currency";
import { freshItem } from "./run-plan";
import { limitOf, openSlots, sideOfMod } from "./stage-core";
import type { StageItem, StageMod, StageSide } from "./types";
import { OMEN_KEY } from "./spec/omen-keys";
import { tr } from "../../i18n/lang";

export type RouteKind = "augment" | "chaos" | "exalt";
export type Grade = "base" | "greater" | "perfect";
export interface RaceTarget { modId: string; minTierIndex: number }
/** 等級 → カレンシーの鍵の後ろ (spam-counts.ts・StageRoutesPage.vue も使う) */
export const GRADE_KEY: Record<Grade, string> = { base: "", greater: "_greater", perfect: "_perfect" };
/** r 人目の乱数の種 (raceOne と spam-counts.ts で同じ式) */
export const routeSeed = (seed: number | undefined, r: number, route: RouteKind, grade: Grade): number => (seed ?? 1) * 100003 + r * 7919 + route.length * 31 + grade.length;
const allMods = (it: StageItem) => [...it.prefixes, ...it.suffixes];
const sideList = (it: StageItem, side: "prefix" | "suffix") => (side === "prefix" ? it.prefixes : it.suffixes);
/**
 * 付いている当たりの番号 (targets の何番目か。無ければ -1)。当たりはどれか 1 つ (OR)。
 * 当たりの式はエミュの「狙う」・シミュの木と同じエンジンの aimHits (sameText = 同じ系統・同じ文の別 modId も当たり、エッセンスの MOD は別物)。
 * 前は modId の一致だけの自前の式 (11-07 J-01。寄せても高貴・増強・カオスの道で止まる手は変わらない = 広がる組は冒涜 ⇄ ルーンとハンドラップ専用だけ)。
 * data を渡さない呼び手 (運試しの画面 StageRouteLuck.vue の当たりの番号、エミュ部長の持ち物) は前の modId の一致のまま。渡すと同じ式になる
 */
export const routeHitIndex = (it: StageItem, targets: readonly RaceTarget[], data?: PatchData): number => targets.findIndex((t) => allMods(it).some((m) => aimHits(m, t, data ? { data, sameText: true } : undefined)));
const routeHit = (data: PatchData, it: StageItem, targets: readonly RaceTarget[]): boolean => routeHitIndex(it, targets, data) >= 0;
/** その MOD が当たりのどれかに当たるか (aimHits の sameText。spam-counts も同じ物) */
export const routeHitMod = (data: PatchData, targets: readonly RaceTarget[]) => (m: StageMod): boolean => targets.some((t) => aimHits(m, t, { data, sameText: true }));

/**
 * スパムの道の 1 手 (どれを打つか)。routeRun (エミュのスパムシミュ・運試し) と spam-counts (シミュの始まりの値段) が同じ物を呼ぶ
 * (11-07 オーナー「全て」= 2 つの打ち手が固定・消去の対象・偉大の条件・カオスの始めで違っていたのを 1 本に)。
 *   isHit = 当たりの MOD か (routeHitMod)、open = まだ当たりの要る側 (増強の道だけ見る)
 *   - 増強: ノーマルなら変成。まだ当たりの要る側に外れ (固定でない・当たりでない) があれば消去、無ければ増強
 *   - カオス: 消せる MOD (固定でない) があればカオス、無ければ先に高貴 1 回 (無印、費用に入る。オーナー 10-22)
 *   - 高貴: 消せる MOD (固定でない・当たりでない) があれば消去、無ければ高貴。空きが 2 つ以上なら偉大な高貴のお告げで 2 つ
 */
export function routeStep(it: StageItem, route: RouteKind, grade: Grade, isHit: (m: StageMod) => boolean, open: readonly StageSide[]): { key: string; omens: string[] } {
  const k = (id: RouteStepId) => routeStepKey(id, grade)!;
  if (route === "augment") {
    if (it.rarity === "normal") return { key: k("transmute"), omens: [] };
    return { key: open.some((sd) => sideList(it, sd).some((m) => !m.fractured && !isHit(m))) ? k("annulMiss") : k("augment"), omens: [] };
  }
  if (route === "chaos") return { key: allMods(it).some((m) => !m.fractured) ? k("chaos") : k("exaltFirst"), omens: [] };
  if (allMods(it).some((m) => !m.fractured && !isHit(m))) return { key: k("annulBack"), omens: [] };
  return { key: k("exaltPair"), omens: openSlots(it) >= 2 ? [OMEN_KEY.greater] : [] };
}

/**
 * 道の打ち方の定義 (① 14、11-07 jin-base4。エミュの道のページの手順の札と routeStep が同じ物を見る。文は画面が id ごとに持つ)。
 * start = 始めの品 (white = 白のベース・rare1 = MOD 1 つのレア・rare0 = MOD 0 のレア)、steps = 打つ順の手 (key = 札の絵のカレンシー / お告げ、無ければ null)。
 * fromItem = 今のアイテムから始める時に start の手と替わる 1 手 (カオスの道だけ、routeOff の chaosOnly)
 */
export type RouteStepId = "start" | "fromItem" | "transmute" | "annulMiss" | "augment" | "repeat" | "exaltFirst" | "chaos" | "exaltPair" | "annulBack";
export interface RouteStepDef { id: RouteStepId; key: string | null }
export interface RouteDef { route: RouteKind; main: string; grades: readonly Grade[]; start: "white" | "rare1" | "rare0"; steps: readonly RouteStepDef[] }
const GRADES: readonly Grade[] = ["base", "greater", "perfect"];
export const ROUTE_DEFS: readonly RouteDef[] = [
  { route: "augment", main: "augment", grades: GRADES, start: "white", steps: [{ id: "transmute", key: "transmute" }, { id: "annulMiss", key: "annul" }, { id: "augment", key: "augment" }, { id: "repeat", key: null }] },
  { route: "chaos", main: "chaos", grades: GRADES, start: "rare1", steps: [{ id: "start", key: "exalt" }, { id: "chaos", key: "chaos" }] },
  { route: "exalt", main: "exalt", grades: GRADES, start: "rare0", steps: [{ id: "start", key: null }, { id: "exaltPair", key: OMEN_KEY.greater }, { id: "annulBack", key: "annul" }] },
];
export const ROUTE_FROM_STEP: RouteStepDef = { id: "fromItem", key: null };
/** 道と等級の並び (道のページの行の順) */
export const ROUTE_ORDER: ReadonlyArray<{ route: RouteKind; grade: Grade }> = ROUTE_DEFS.flatMap((r) => r.grades.map((grade) => ({ route: r.route, grade })));
/** その手で打つカレンシーの鍵 (等級つき)。変成・増強・カオス・高貴の 2 つ付けは道の等級、消去と始めの高貴 1 回は無印。打たない手は null */
export function routeStepKey(id: RouteStepId, grade: Grade): string | null {
  const g = GRADE_KEY[grade];
  switch (id) {
    case "transmute": return `transmute${g}`;
    case "augment": return `augment${g}`;
    case "chaos": return `chaos${g}`;
    case "exaltPair": return `exalt${g}`;
    case "exaltFirst": return "exalt";
    case "annulMiss": case "annulBack": return "annul";
    default: return null;
  }
}
/** 当たりの側 (プレ / サフィ)。2 つ以上なら増強の道は使えない */
export const targetSides = (data: PatchData, targets: readonly RaceTarget[]) => [...new Set(targets.map((t) => sideOfMod(data, t.modId)))];
/** 道の主のカレンシーの鍵 (augment_greater など) */
export const routeKey = (route: RouteKind, grade: Grade): string => `${route}${GRADE_KEY[grade]}`;

/** 1 人分の打ち手。100 人の計算 (raceOne) と画面の運試し (StageRouteLuck.vue) が同じ物を使う */
export interface RouteRun {
  item: StageItem;
  /** 打った回数 (お告げは数えない)・費用・使った物 */
  n: number; cost: number; uses: Record<string, number>;
  /** 最後に打った物 (画面に出す) */
  last: { key: string; omens: string[] } | null;
  /** 付いた瞬間の確率 (MOD の id → 確率。エミュレーターの札の % と神演出に使う、run-plan.ts の chances と同じ) */
  chances: Map<string, number>;
  hit(): boolean;
  /** 付いている当たりの番号 (無ければ -1) */
  hitIndex(): number;
  /** 決まりどおりに 1 手打つ。打てなかったら false */
  step(): boolean;
}

/** 使えない理由 (無ければ null) */
/** prep = 始めのアイテムの下ごしらえ (ルーンを嵌める。route-runes.ts の runePrep) */
export type RoutePrep = ((it: StageItem) => StageItem) | undefined;

/**
 * スパムの道を使えない理由の鍵 (共有の詰め物 packRace にはこの鍵を入れ、文は開いた側の言葉で routeOffText が引く。11-07 エミュ部長の頼み)。
 * cap = 上限の手数までに付かなかった (100 人の競争 raceOne の結果)
 */
export type RouteOffKey = "chaosOnly" | "notRare" | "corrupted" | "noMods" | "hasTarget" | "noSlot" | "cap";
const OFF_WORDS: Record<RouteOffKey, readonly [string, string]> = {
  chaosOnly: ["今のアイテムから始める時はカオスだけ", "Only Chaos when starting from the current item"],
  notRare: ["今のアイテムがレアでない", "The current item isn't rare"],
  corrupted: ["コラプトしたアイテムにはカレンシーが打てない", "Currency can't be used on a Corrupted item"],
  noMods: ["今のアイテムに MOD が無い", "The current item has no mods"],
  hasTarget: ["今のアイテムにもう狙いが付いている", "The current item already has the target"],
  noSlot: ["マジックに狙いの側の枠が無いベース", "This base has no slot on the target side while magic"],
  cap: ["上限の手数までに付かなかった (この等級では付かない段かも)", "Didn't hit within the use cap (this grade may not roll that tier)"],
};
/** 理由の文 (日英、今の言葉)。鍵のほか、前の共有に入っている日本語の文もそのまま鍵に読み替える。知らない物はそのまま */
export function routeOffText(k: string): string {
  const key = (k in OFF_WORDS ? k : (Object.keys(OFF_WORDS) as RouteOffKey[]).find((x) => OFF_WORDS[x][0] === k)) as RouteOffKey | undefined;
  return key ? tr(OFF_WORDS[key][0], OFF_WORDS[key][1]) : k;
}
/** 今のアイテムからスパムを始められるか (MOD のあるレアでコラプトしていない、M-63)。始められなければ理由の鍵 */
export function routeFromBlockKey(from: StageItem): RouteOffKey | null {
  if (from.rarity !== "rare") return "notRare";
  if (from.corrupted) return "corrupted";
  if (!from.prefixes.length && !from.suffixes.length) return "noMods";
  return null;
}
/** routeFromBlockKey の文 (日英) */
export const routeFromBlock = (from: StageItem): string | null => { const k = routeFromBlockKey(from); return k ? routeOffText(k) : null; };
/** 道を使えない理由の鍵 (無ければ null) */
export function routeOffKey(data: PatchData, base: string, itemLevel: number, targets: readonly RaceTarget[], route: RouteKind, prep?: RoutePrep, from?: StageItem): RouteOffKey | null {
  const sides = targetSides(data, targets);
  if (from) {
    if (route !== "chaos") return "chaosOnly";
    const why = routeFromBlockKey(from);
    if (why) return why;
    if (routeHit(data, from, targets)) return "hasTarget";
    return null;
  }
  // 増強の道はマジックに狙いの側の枠が要る (不在のアミュレットなど、マジックで MOD が付かないベースは使えない)。当たりが両側にあれば両側とも
  if (route === "augment") {
    const magic: StageItem = { ...(prep ? prep(freshItem(data, base, itemLevel)) : freshItem(data, base, itemLevel)), rarity: "magic" };
    if (sides.some((sd) => limitOf(magic, sd) < 1)) return "noSlot";
  }
  return null;
}
/** routeOffKey の文 (日英) */
export function routeOff(...a: Parameters<typeof routeOffKey>): string | null {
  const k = routeOffKey(...a);
  return k ? routeOffText(k) : null;
}

/** 始めの状態を置いた 1 人分 (作れなければ null) */
/** need = 止める所: any = 当たりのどれか 1 つ、both = 当たりのある側が全部揃う (増強の道のプレ 1 + サフィ 1) */
export function routeRun(data: PatchData, base: string, itemLevel: number, targets: readonly RaceTarget[], route: RouteKind, grade: Grade, rng: () => number, price: (key: string) => number, prep?: RoutePrep, from?: StageItem, need: "any" | "both" = "any"): RouteRun | null {
  const sides = targetSides(data, targets);
  const onSide = (sd: "prefix" | "suffix") => targets.filter((t) => sideOfMod(data, t.modId) === sd);
  /** その側に当たりが付いている */
  const sideHit = (it: StageItem, sd: "prefix" | "suffix"): boolean => routeHit(data, { ...it, prefixes: sd === "prefix" ? it.prefixes : [], suffixes: sd === "suffix" ? it.suffixes : [] }, onSide(sd));
  const isHit = routeHitMod(data, targets);
  let it: StageItem = from ?? freshItem(data, base, itemLevel);
  if (from) { if (routeOff(data, base, itemLevel, targets, route, undefined, from)) return null; }
  else if (prep) it = prep(it);
  if (route === "chaos" && !from) {
    // MOD 1 つのレア (作る高貴 1 回は数えない)。始めの 1 つが狙いそのものなら作り直す (始めは「狙いでない MOD が 1 つ」)
    const blank: StageItem = { ...it, rarity: "rare" };
    for (let k = 0; k < 50 && (k === 0 || routeHit(data, it, targets)); k++) { const first = applyCurrency(data, blank, "exalt", rng, []); if (!first.applied) break; it = first.item; }
    if (!allMods(it).length || routeHit(data, it, targets)) return null;
  } else if (route === "exalt") it = { ...it, rarity: "rare" }; // MOD 0 のレア
  const run: RouteRun = {
    item: it, n: 0, cost: 0, uses: {}, last: null, chances: new Map(),
    hit: () => (need === "both" ? sides.every((sd) => sideHit(run.item, sd)) : routeHit(data, run.item, targets)),
    hitIndex: () => routeHitIndex(run.item, targets, data),
    step: () => {
      const use = (key: string, omens: string[] = []): boolean => {
        const res = applyCurrency(data, run.item, key, rng, omens);
        if (!res.applied) return false;
        run.item = res.item;
        run.n++;
        run.cost += stepCost({ currency: key, omens }, price);
        run.uses[key] = (run.uses[key] ?? 0) + 1;
        for (const o of omens) run.uses[o] = (run.uses[o] ?? 0) + 1;
        run.last = { key, omens };
        for (const x of res.rolled ?? []) run.chances.set(x.modId, x.chance);
        return true;
      };
      // 当たりのある側に外れが付いていたら消去 (どれが消えるかは運)、無ければ増強。カオス・高貴の決まりも routeStep
      const s = routeStep(run.item, route, grade, isHit, sides.filter((sd) => !sideHit(run.item, sd)));
      return use(s.key, s.omens);
    },
  };
  return run;
}
