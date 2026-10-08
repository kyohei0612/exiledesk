/**
 * recipe-sim.ts — 決めた順番と付け方どおりに作るシミュレーション (2026-10-05、実験)
 *
 * オーナー「この MOD 群をどういう順番で付けるかを最初に選ばせて、それぞれフラクチャー・冒涜をする箇所を選ばせて、順番通りに作る」
 * 「フラクチャーの場合は確率的にそこからスタートさせて、フラクチャー、1 MOD の状態まで消去打たせてのところからスタート、
 * またはその MOD が付いた状態でスタートもできるように」「ほとんど挙動は一緒か、使いやすいようにリメイクって感じ」。
 *
 * ステージの 1 手 (applyCurrency) をそのまま使って、何百回も打つ。1 回の挑戦の n 手目の乱数は mulberry32(seed + n) で、
 * 手順 JSON の再生 ([[run-plan.ts]] playPlan) と同じなので、記録した手順はステージでそのまま再生できる。
 *
 * 決まり (どの回も同じ):
 *   - 順番の上から、まだ付いていない (段が足りない) 最初の狙いを作る。前に付けた物が消えたら、また上から
 *   - 高貴: その側に外れがあれば、その側の消去 (左右の消去のお告げ) で消す。空きがあればその側の高貴 (左右の高貴のお告げ)。
 *     変成・増強・高貴の等級は「1 個の値段 ÷ 狙いが出る確率」が一番安い物
 *   - カオス: 狙いが付くまでカオス (お告げ無し)
 *   - 冒涜: その側に空きが無く外れがあれば側の消去。骨 (左右のネクロマンシー) → 発現は狙いがあれば選ぶ、無ければアビスの反響で
 *     引き直し、それでも無ければ 1 番を選んで、光のお告げ + 消去で消して打ち直し。骨は異界の MOD = 変質、段 40 以上 = 古代
 *   - エッセンス: パーフェクト (レアに。外れのある側を結晶化のお告げで消す)。パーフェクトが無い物は、マジックの時に普通の
 *     エッセンス (段が届く一番下の等級)
 *   - 白から: 最初の狙いが普通の MOD なら 変成 → 増強 (外れなら消去) で付けてから王者。それ以外は 変成 → 王者
 *   - フラクチャー: 「作る」= 変成・増強ガチャ → 王者 → 骨の壁 → フラクチャー (1/3、外れたら白から作り直し)。固定した後の外れは
 *     消さずに残す (カオスは入れ替える、高貴・冒涜は要る時にその側を消す)。「付いた状態」= その MOD を固定済みにしたレアから (費用は手で入れたベースの値段)
 */
import { modTierWeight } from "../../vendor/poe2htc/engine/pool";
import { CURRENCY_FLOOR, type PatchData } from "../../vendor/poe2htc/engine/types";
import { essenceLevelOf } from "../../vendor/poe2htc/optimizer/cost";
import { applyCurrency } from "./apply-currency";
import { revealOffers, unrevealedOf } from "./apply-desecrate";
import { mulberry32 } from "../htc/rng";
import { freshItem, startFrom } from "./run-plan";
import { runeIdByName } from "../../vendor/poe2htc/engine/runes";
import { LOST_RESTART, ONCE_KINDS, type MissRule, type PatternKind } from "./pattern";
import { RUNES } from "./stage-runes";
import { allMods, limitOf, listOf, room } from "./stage-core";
import type { StageItem, StageMod, StageSide } from "./types";
import type { CraftStagePlan } from "./contract";
import essenceKeys from "../htc/essence-keys.json";

export type RecipeMethod = "exalt" | "chaos" | "desecrate" | "essence" | "fracture";
/**
 * 狙いの 1 手順。alts があれば「どれか 1 つが付けば当たり」(2026-10-05 オーナー「マークスマンの MOD をプレで複数選んで狙いたい。
 * その 1 つの MOD の所は他の MOD でも当たりとする」)。alts は modId と同じ側・同じ付け方 (普通 / 冒涜) の物だけ
 */
export interface RecipeTarget {
  modId: string; minTierIndex: number; method: RecipeMethod; alts?: ReadonlyArray<{ modId: string; minTierIndex: number }>;
  /** 候補 (本体 + alts) のうちいくつ付けば当たりか (既定 1。2026-10-05 オーナー「どれか 2 つとかも選ばせたい」)。その数だけ枠を使う */
  need?: number;
}
/** その手順で当たりになる MOD (本体 + alts) */
export const membersOf = (t: RecipeTarget): Array<{ modId: string; minTierIndex: number }> => [{ modId: t.modId, minTierIndex: t.minTierIndex }, ...(t.alts ?? [])];
/**
 * 候補のうちいくつ付けば当たりか (どれか N つ)。冒涜の手順でも N はそのまま: 冒涜で付けるのは候補のどれか 1 つ (冒涜の MOD は
 * アイテムに 1 つまで)、残りの N − 1 つは高貴で付ける (2026-10-05 オーナー「3 つのうちどれかは 3 つのうちどれが当たりでも可能とする話、
 * 今回の奴に関しては結局 3 パターンいる」)
 */
export const needOf = (t: RecipeTarget): number => Math.max(1, Math.min(t.need ?? 1, membersOf(t).length));
const hits = (t: RecipeTarget, m: StageMod): boolean => membersOf(t).some((x) => m.modId === x.modId && m.tierIndex >= x.minTierIndex);
/** パターンの 1 手 (pattern.ts の手を狙いとつないだ物。打つ物はエッセンス以外セットで決まる) */
export interface CompiledStep {
  kind: PatternKind; currency: string; omens: string[];
  /** 狙う MOD の手順 (無ければ付ける物の無い手: 消去・ルーン) */
  target: RecipeTarget | null;
  /** 偉大の手で片方当たった後、残りを打つ手 (無ければ偉大だけ外す) */
  single?: { kind?: PatternKind; currency: string; omens: string[] };
  /** この手の間に消えた MOD (modId) → 戻る手の番号 (パターンの中の 0 始まり) */
  lostGoto?: Record<string, number>;
  /** ルーンを差す手の英語名 */
  rune?: string;
  onMiss: MissRule;
  /** 外す時の打つ物 + お告げ (無ければ自動)。kind はパーフェクトエッセンス (一番安い物を選ぶ)・冒涜 (発現まで) を見分ける */
  miss?: { kind?: PatternKind; currency: string; omens: string[] };
  /** お告げ無しの消去で反対の側が消えたら、もう一度消去 (PatternStep.otherGone) */
  otherGone?: "annul";
  /** お告げ無しの消去で外す時、外れが反対の側に付いたら消さずにもう一度打つ (PatternStep.otherJunk) */
  otherJunk?: "keep";
}
export interface RecipeSpec {
  /**
   * パターン (2026-10-06): あれば、フラクチャーまで (か白) の後はこの手の通りに打つ (自動の付け方は使わない)。
   * ルーンもパターンの手で差す (白から差しておくのはやめる)
   */
  pattern?: readonly CompiledStep[];
  /**
   * 外れの消し方 (側ごと): 素の消去 / 側の消去のお告げ。計算機のやり直しの費用 (redo-cost.ts の annulSides) から決めた物。
   * 無ければ「反対側に当たりがあれば側のお告げ」(2026-10-06)
   */
  annulSides?: Partial<Record<StageSide, "plain" | "side">>;
  data: PatchData;
  base: string;
  itemLevel: number;
  /** 上から順に作る */
  targets: readonly RecipeTarget[];
  /**
   * フラクチャーの狙い (付け方 fracture、いくつでも = 同じ側の候補で、どれか 1 つが付いたら進み、どれが固定されても良い) の始め方。"bought" = 付いた状態のベースを買う (price は高貴建て)。
   * "make" = 確率込みで作る。route "alch" = 錬金 → 狙いが付くまでカオス、"magic" = 変成・増強ガチャ (狙いが全部揃うまで) → 王者 → 高貴
   * (blocker = 4 つ目を骨の未発現の冒涜にして、フラクチャーの候補を 1 つ減らす)
   */
  fractureStart?: { kind: "make"; route?: "alch" | "magic"; blocker?: boolean } | { kind: "bought"; price: number };
  /**
   * 白のベースの値段 (高貴建て、手で入れる。規格外のソケット付きならその値段)。白から始める時・作り直す時に数え、マジックで外れた時に
   * 「消去」と「白を買い直して変成」の安い方を選ぶ (2026-10-05 オーナー「消去もバカにならんが」「フラクチャーと消去の値段、ベースの規格外の値段次第」)
   */
  whiteBasePrice?: number;
  /**
   * 手で打つ画面から持ってきた始めの状態 (その MOD が付いた状態から先を回す。2026-10-08)。これがある時は白・固定済みの始まりは使わず、
   * 1 人ごとにこのアイテムの写しから始める。「最初から」はこの状態を買い直す (startPrice = 手打ちの累計 + 白ベース代)
   */
  startItem?: StageItem;
  startPrice?: number;
  /** 白のベースのソケットの数 (0 / 1 / 2、規格外のベース。2026-10-05 オーナー「ベース選択後ソケット何個か選ばせて、これだとただの通常品のベース」) */
  sockets?: number;
  /** 1 個の値段 (高貴建て) */
  price: (key: string) => number;
  runs: number;
  /** 1 回の挑戦の手の上限 (超えたら失敗) */
  maxSteps?: number;
  seed?: number;
}
export interface RecipeRun {
  done: boolean; cost: number; steps: Array<{ currency: string; omen: string | null }>; seed: number; reason?: string;
  /** 白から作り直した時の、最後の作り直しの手の番号 (再生はここから。前の手は費用にだけ入る) */
  replayFrom: number;
  /** 使った白のベースの数 (始めの 1 個 + 作り直し。付いた状態で始めた時は 0) */
  bases: number;
  /** 終わった時に付いていた狙いの MOD (固定以外) */
  hits?: string[];
  /** パターンの手ごと (並べた後の番号): その手のカレンシーを打った数と、その手にいる間にかかった費用 (外しの消去なども込み)。「この手だけ回す」用 */
  stepPresses?: number[];
  stepCost?: number[];
}
export interface RecipeResult {
  runs: number;
  pDone: number;
  /** 1 個できるまでの平均 (全部の回の費用 ÷ 完成した回数) */
  perDone: number;
  p50: number; p80: number; p90: number;
  /** 打った物ごとの、1 個できるまでの平均の数と費用 */
  usage: Array<{ key: string; count: number; cost: number }>;
  /** 止まった理由と割合 */
  stops: Array<{ reason: string; p: number }>;
  /** 費用が真ん中くらいの完成した回 (ステージで再生する用) */
  sample: RecipeRun | null;
  /** 1 個できるまでに使った白のベースの平均 */
  bases: number;
  /** 狙いの MOD ごとの、終わった時に付いていた割合 (全部の回で。未完成のパターンで「どこまで付くか」を見る) */
  hitRates: Array<{ modId: string; p: number }>;
  /** パターンの手ごとの平均 (全部の回で、打った数と費用)。「この手だけ回す」の結果 (2026-10-07) */
  stepAvg?: Array<{ presses: number; cost: number; p80Presses: number; p80Cost: number }>;
}

const ESS = (essenceKeys as unknown as { keys: Record<string, { en: string; ja: string }> }).keys;
/** 結晶化のお告げの側 (無ければ両側) */
const crystalSides = (omens: readonly string[]): StageSide[] => (omens.some((o) => /SinistralCrystallisation/.test(o)) ? ["prefix"] : omens.some((o) => /DextralCrystallisation/.test(o)) ? ["suffix"] : ["prefix", "suffix"]);
const SIDE_OMEN = {
  exalt: { prefix: "OmenofSinistralExaltation", suffix: "OmenofDextralExaltation" },
  annul: { prefix: "OmenofSinistralAnnulment", suffix: "OmenofDextralAnnulment" },
  necro: { prefix: "OmenofSinistralNecromancy", suffix: "OmenofDextralNecromancy" },
  crystal: { prefix: "OmenofSinistralCrystallisation", suffix: "OmenofDextralCrystallisation" },
} as const;

/** 1 回の挑戦 */
export function runRecipeOnce(spec: RecipeSpec, seed: number): RecipeRun {
  const { data } = spec;
  const max = spec.maxSteps ?? 4000;
  const steps: RecipeRun["steps"] = [];
  let cost = 0;
  let replayFrom = 0;
  let bases = 0;
  const mod = (id: string) => data.mods.get(id)!;
  const sideOf = (id: string): StageSide => (mod(id).type === "suffix" ? "suffix" : "prefix");
  /**
   * まだ当たっていない一番上の手順。付いている MOD は 1 つの手順にしか数えない (同じ候補のグループをコピーして並べた時、1 つの MOD で
   * 両方を満たしたことにしない。2026-10-05 オーナー「その MOD 群は 1 MOD としての扱い」「コピーボタンでもう 1 個同じのができる」)。上から順に取る
   */
  const unmet = (it: StageItem): RecipeTarget | null => {
    const claimed = new Set<string>();
    const present = allMods(it).filter((m) => !m.unrevealed);
    for (const x of spec.targets) {
      if (x.method === "fracture") continue;
      for (let k = 0; k < needOf(x); k++) {
        const m = present.find((y) => hits(x, y) && !claimed.has(y.modId));
        if (!m) return x;
        claimed.add(m.modId);
      }
    }
    return null;
  };
  // 候補のうち need 個 (違う MOD で) 付いていれば当たり
  const meets = (it: StageItem, t: RecipeTarget): boolean =>
    new Set(allMods(it).filter((m) => !m.unrevealed && hits(t, m)).map((m) => m.modId)).size >= needOf(t);
  // 冒涜の MOD は、付け方が冒涜の狙いに当たる時だけ当たり (骨の壁が発現でフラクチャーの候補などになっても、冒涜は 1 つまでなので
  // 冒涜の狙いの邪魔になる。外れとして光 + 消去で外す。2026-10-05 流れの確かめで 36% が「冒涜の MOD はアイテムに 1 つまで」で止まっていた)
  const isGood = (m: StageMod): boolean => !m.unrevealed && spec.targets.some((t) => hits(t, m)
    && (!m.desecrated || t.method === "desecrate" || !spec.targets.some((x) => x.method === "desecrate")));
  /**
   * 外れを消す手: 反対側に守る物 (固定でない当たり) が無ければ素の消去 (お告げは反対側を守るだけなので、守る物が無いなら要らない)。
   * あれば側の消去のお告げ (計算機と同じ決まり、[[htc-craft-engine-direction]] の「外れの消し方」)
   */
  const annulOn = (s0: StageSide): string | null => {
    const other: StageSide = s0 === "prefix" ? "suffix" : "prefix";
    const guard = listOf(item, other).some((m) => !m.fractured && isGood(m));
    return guard ? play("annul", [SIDE_OMEN.annul[s0]]) : play("annul");
  };
  const junkOn = (it: StageItem, s: StageSide): StageMod[] => listOf(it, s).filter((m) => !m.fractured && !isGood(m));
  /** 狙いの段以上で一番高い段のレベル (等級の下限が届くか) */
  const reach = (t: RecipeTarget): number => Math.max(0, ...membersOf(t).flatMap((y) => mod(y.modId).tiers.filter((x, i) => i >= y.minTierIndex && x.ilvl <= spec.itemLevel).map((x) => x.ilvl)));
  /**
   * 等級 (無印 / 上級 / 完全) は「1 個の値段 ÷ 狙いが出る確率」が一番安い物 (2026-10-05)。下限 (高貴 35 / 50、変成・増強 55 / 70) が上がると低い段が
   * 出なくなるが、狙いの段も下限より下は出なくなる (ライフ T5 以上を完全で狙うと T1 しか出ず、変成・増強ガチャが回り続けた)。
   * 確率は普通の置き場の重み (その側、変成は両側) で、同じ系統の除外は見ない目安
   */
  const gradeMemo = new Map<string, string>();
  const grade = (base: "exalt" | "transmute" | "augment", t: RecipeTarget): string => {
    const key = `${base}|${membersOf(t).map((x) => `${x.modId}:${x.minTierIndex}`).join(",")}`;
    const hit = gradeMemo.get(key);
    if (hit) return hit;
    const cls = item.cls;
    const sides = base === "transmute" ? (["prefixes", "suffixes"] as const) : ([sideOf(t.modId) === "prefix" ? "prefixes" : "suffixes"] as const);
    const ids = sides.flatMap((k) => cls.pools.normal[k]);
    const w = (id: string, minIdx: number, floor: number): number => {
      const m = data.mods.get(id);
      return m ? modTierWeight(m, floor, spec.itemLevel, minIdx) : 0;
    };
    let best = base as string, bestCost = Infinity;
    // 下限はエンジンの表 (変成・増強 55 / 70、高貴 35 / 50)
    const fl = CURRENCY_FLOOR[base];
    for (const [k, floor] of [[base, fl.base], [`${base}_greater`, fl.greater], [`${base}_perfect`, fl.perfect]] as const) {
      const total = ids.reduce((a, id) => a + w(id, 0, floor), 0);
      const p = total > 0 ? membersOf(t).reduce((a, x) => a + w(x.modId, x.minTierIndex, floor), 0) / total : 0;
      const c = p > 0 ? (spec.price(k) || 1e-9) / p : Infinity;
      if (c < bestCost) { bestCost = c; best = k; }
    }
    gradeMemo.set(key, best);
    return best;
  };

  const fractureTs = spec.targets.filter((t) => t.method === "fracture");
  const fractureT = fractureTs[0] ?? null;
  const white = spec.whiteBasePrice ?? 0;
  /** 白のベース (ソケット付きならその数) */
  const { runes, sockets } = runeStart(spec);
  /** 白のベースに差しておくルーンの値段 (ソケットに縛られるので、作り直す白ごとに買う) */
  const runeCost = runes.reduce((a, en) => a + spec.price(`rune:${en}`), 0);
  const fresh = (): StageItem => {
    if (runes.length) return startFrom(data, spec.base, spec.itemLevel, { rarity: "normal", sockets, runes }, seed - 1);
    const it = freshItem(data, spec.base, spec.itemLevel);
    return sockets ? { ...it, sockets } : it;
  };
  let item = fresh();
  if (spec.startItem) {
    // 手打ちの状態から: その写し 1 個 (ルーン・白は込みの値段)
    item = { ...spec.startItem, prefixes: spec.startItem.prefixes.map((m) => ({ ...m })), suffixes: spec.startItem.suffixes.map((m) => ({ ...m })) };
    cost += spec.startPrice ?? 0;
    bases = 1;
  } else {
  cost += runeCost;
  if (!(fractureT && spec.fractureStart?.kind === "bought")) { cost += white; bases = 1; }
  }
  if (!spec.startItem && fractureT && spec.fractureStart?.kind === "bought") {
    // 手順 JSON の始めの状態と同じ作り方 (再生で同じ物になる)
    const m = mod(fractureT.modId);
    item = startFrom(data, spec.base, spec.itemLevel, { rarity: "rare", mods: [{ mod: m.id, tier: `T${m.tiers.length - fractureT.minTierIndex}`, fractured: true }], ...(sockets ? { sockets } : {}), ...(runes.length ? { runes } : {}) }, seed - 1);
    cost += spec.fractureStart.price;
    // 買った固定済みのベースも 1 個 (前は 0 のままで、やり直しで買い直した時だけ +1 だった → 画面の「ベース × N 個」が 0 になっていた。2026-10-08)
    bases = 1;
  }

  /** 1 手打つ。打てなければ理由 (その回は止める) */
  const play = (key: string, omens: string[] = []): string | null => {
    const n = steps.length + 1;
    const r = applyCurrency(data, item, key, mulberry32(seed + n), omens);
    if (!r.applied) return r.reason ?? "打てない";
    const used = r.omensUsed ?? [];
    cost += spec.price(key) * (r.count ?? 1) + used.reduce((a, o) => a + spec.price(o), 0);
    steps.push({ currency: key, omen: used.length ? used.join("+") : null });
    item = r.item;
    return null;
  };
  /** 発現: 狙い (desire) があれば選ぶ。無ければ反響で引き直し、それでも無ければ 1 番 */
  const reveal = (desire: RecipeTarget | null, echoes = true): string | null => {
    const n = steps.length + 1;
    const offers = revealOffers(data, item, mulberry32(seed + n));
    const hit = (list: StageMod[]) => (desire ? list.findIndex((m) => hits(desire, m)) : -1);
    const a = hit(offers.first);
    if (a >= 0) return play(`reveal:${a + 1}`);
    if (desire && echoes && offers.reroll.length) {
      const b = hit(offers.reroll);
      return play(`reveal:${b >= 0 ? b + 1 : 1}:reroll`, ["OmenofAbyssalEchoes"]);
    }
    return play("reveal:1");
  };
  const hitsNow = (): string[] => [...new Set(allMods(item).filter((m) => !m.unrevealed && !m.fractured && spec.targets.some((t) => hits(t, m))).map((m) => m.modId))];
  /** 手ごとの打った数と費用 (runPattern の中で数える) */
  const stepPresses: number[] = [], stepCost: number[] = [];
  let accAt = -1, accCost = 0;
  const flushStep = (): void => { if (accAt >= 0) stepCost[accAt] = (stepCost[accAt] ?? 0) + (cost - accCost); accAt = -1; };
  const fail = (reason: string): RecipeRun => { flushStep(); return { done: false, cost, steps, seed, reason, replayFrom, bases, hits: hitsNow(), stepPresses, stepCost }; };
  /** 白のベースを買い直して始めから (再生はここから) */
  const restart = (): void => {
    cost += white + runeCost;
    bases++;
    item = fresh();
    replayFrom = steps.length;
  };
  /** マジックで外れた: 消去と「白を買い直して変成」の安い方 */
  const missMagic = (t: RecipeTarget): string | null => {
    if (spec.price("annul") <= white + spec.price(grade("transmute", t))) return play("annul");
    restart();
    return null;
  };
  /** 固定された MOD がフラクチャーの狙いのどれかか */
  const fixedHit = (): boolean => {
    const fixed = allMods(item).find((m) => m.fractured);
    return !!fixed && fractureTs.some((t) => fixed.modId === t.modId && fixed.tierIndex >= t.minTierIndex);
  };
  const isF = (m: StageMod): boolean => !m.unrevealed && fractureTs.some((t) => m.modId === t.modId && m.tierIndex >= t.minTierIndex);
  // フラクチャーで作る (外れを固定したら白を買い直して始めから) → 外れが無くなるまで消去
  const fs = spec.fractureStart;
  if (fractureT && fs?.kind === "make" && !spec.startItem) {
    const magicRoute = fs.route === "magic";
    for (;;) {
      if (steps.length >= max) return fail(`手が多すぎる (フラクチャーまでで ${max.toLocaleString()} 手を超えた)`);
      let e: string | null = null;
      if (!magicRoute) {
        // 錬金 → 狙いが付くまでカオス (2 つの時はどちらか 1 つ付けば良い)
        if (item.rarity === "normal") e = play("alchemy");
        else if (!fractureTs.some((t) => meets(item, t))) e = play("chaos");
        else { e = play("fracture"); if (!e) { if (fixedHit()) break; restart(); } }
      } else if (item.rarity === "normal") {
        e = play(grade("transmute", fractureT));
      } else if (item.rarity === "magic") {
        // 変成・増強ガチャ: 候補のどれか 1 つが付いたら王者 (2026-10-05 オーナー「始める MOD を選んでもらって、どれか付いたら始められる」。
        // 候補は同じ側)。その側に外れがある / 2 つ埋まっていれば外れ (消去か買い直しの安い方)
        // 候補は両側でも良い (2026-10-05 オーナー「シミュレーションだしどっちも選択できるでいい、推奨で出しておけば」)。
        // 候補のある側に外れが付いた / 2 つ埋まった時が外れ
        const fSides = new Set(fractureTs.map((t) => sideOf(t.modId)));
        if (fractureTs.some((t) => meets(item, t))) e = play("regal");
        else if (allMods(item).some((m) => !isF(m) && !m.fractured && fSides.has(m.side)) || allMods(item).length >= 2) e = missMagic(fractureT);
        else e = play(grade("augment", fractureT));
      } else if (allMods(item).length < 4) {
        // 4 つにする。壁 = 4 つ目を骨の未発現の冒涜に (フラクチャーされないので候補が 1 つ減る)
        const open = (["prefix", "suffix"] as StageSide[]).find((sd) => room(item, sd));
        // 壁は骨 1 本だけ (空いている側に付く。側は問わないのでお告げは要らない。2026-10-05 オーナー「王者後は骨 1 個でいい、選ぶ必要ない」)
        if (fs.blocker && allMods(item).length === 3 && open && !unrevealedOf(item)) e = play("desecrate");
        else e = play("exalt");
      } else {
        e = play("fracture");
        if (!e) { if (fixedHit()) break; restart(); }
      }
      if (e) return fail(e);
    }
    // 固定できたら消去を 2 つ (2026-10-05 オーナー「消去 2 は必ずいるよ、完成後」: 固定した物と骨の壁のほかの外れ 2 つ)。
    // 1 MOD まで消し切りはしない (前は 3 つ消して、カオスが「外せる MOD が無い」で止まっていた)。残りの外れはカオスが入れ替え、高貴・冒涜は要る時にその側を消す
    for (let k = 0; k < 2; k++) {
      if (!allMods(item).some((m) => !m.fractured && !m.unrevealed)) break;
      const e = play("annul");
      if (e) return fail(`消去: ${e}`);
    }
  }

  if (spec.pattern) return runPattern(spec.pattern);

  while (steps.length < max) {
    // 未発現の冒涜 MOD が残っていれば先に発現 (冒涜の狙いの手の中で選ぶ)
    // フラクチャーの狙い (候補) は、どれか 1 つが固定されていれば良い (固定されなかった候補は作らない)
    if (fractureTs.length && !fixedHit()) return fail("固定した MOD が消えた");
    const t = unmet(item);
    if (!t) return { done: true, cost, steps, seed, replayFrom, bases, hits: hitsNow() };
    const side = sideOf(t.modId);
    let e: string | null = null;
    if (unrevealedOf(item)) {
      e = reveal(t.method === "desecrate" ? t : null);
    } else if (item.rarity === "normal") {
      e = play(t.method === "exalt" || t.method === "chaos" ? grade("transmute", t) : "transmute");
    } else if (item.rarity === "magic") {
      const essKey = t.method === "essence" ? magicEssenceKey(t) : null;
      if (essKey) e = play(essKey);
      else if ((t.method === "exalt" || t.method === "chaos") && mod(t.modId).source === "normal" && !allMods(item).some(isGood)) {
        // マジックで最初の狙いを 1 つだけ作る (変成・増強、外れは消去)。その側に外れがある / 2 つ埋まっていれば消去。
        // 1 つ付いたら王者 (2 つ目までマジックで狙うと、消去が付けた物を消して回り続けた)
        e = junkOn(item, side).length || allMods(item).length >= 2 ? missMagic(t) : play(grade("augment", t));
      } else e = play("regal");
    } else if (t.method === "chaos") {
      // カオススパム: 狙いの側に空きがあれば側の高貴で埋め、外れが付いていれば側のカオス (抹消のお告げ) でその側だけ入れ替える
      // (2026-10-08 オーナー「プレフィックスに高貴ガチャではあるんだけど、カオススパムもこの中の MOD でやる。どれか 3 つ付けば終わり」。
      // 前は側を見ずにカオスを打ち、付いた当たりも消して 4,000 手で止まっていた)。外せる物が無ければ高貴で 1 つ足す
      const junk = junkOn(item, side);
      if (junk.length) e = play("chaos", [side === "prefix" ? "OmenofSinistralErasure" : "OmenofDextralErasure"]);
      else if (room(item, side)) e = play(grade("exalt", t), [SIDE_OMEN.exalt[side]]);
      else e = allMods(item).some((m) => !m.fractured && !m.unrevealed) ? play("chaos") : play("exalt");
    } else if (t.method === "exalt") {
      if (junkOn(item, side).length) e = annulOn(side);
      else if (room(item, side)) e = play(grade("exalt", t), [SIDE_OMEN.exalt[side]]);
      else return fail("枠が足りない (狙いが多すぎる)");
    } else if (t.method === "desecrate" && allMods(item).some((m) => m.desecrated && !m.unrevealed && isGood(m))) {
      // 冒涜で 1 つ付いた後の残り (どれか N つの N − 1 つ) は高貴で付ける (冒涜の MOD はアイテムに 1 つまで)
      if (junkOn(item, side).length) e = annulOn(side);
      else if (room(item, side)) e = play(grade("exalt", t), [SIDE_OMEN.exalt[side]]);
      else return fail("枠が足りない (狙いが多すぎる)");
    } else if (t.method === "desecrate") {
      const desec = allMods(item).find((m) => m.desecrated && !m.unrevealed && !isGood(m));
      // 狙いと同じ系統の外れ (カオスで付いた低い段の混沌耐性など) があると、冒涜の候補にその系統が出ず回り続ける。先にその側を消す
      const fams = new Set(membersOf(t).map((x) => mod(x.modId).family));
      const sameFamily = allMods(item).find((m) => !m.fractured && !m.unrevealed && !m.desecrated && !isGood(m) && fams.has(data.mods.get(m.modId)?.family ?? ""));
      if (desec) e = play("annul", ["OmenofLight"]);
      else if (sameFamily) e = annulOn(sameFamily.side);
      else if (!room(item, side)) {
        if (junkOn(item, side).length) e = annulOn(side);
        else return fail("冒涜する枠が足りない");
      } else e = play(boneFor(t), [SIDE_OMEN.necro[side]]);
    } else if (t.method === "essence") {
      const key = `essence:perfect:${t.modId}`;
      if (!ESS[key]) return fail("このエッセンスはマジックにしか使えない (レアになった後は付けられない)");
      const js = junkOn(item, "prefix").length ? "prefix" : junkOn(item, "suffix").length ? "suffix" : null;
      e = play(key, js ? [SIDE_OMEN.crystal[js]] : []);
    }
    if (e) return fail(e);
  }
  return fail(`手が多すぎる (${max.toLocaleString()} 手を超えた)`);

  /**
   * パターンの通りに打つ。1 手打って、狙いの候補が増えた (か揃った) ら当たりで次の手へ。外れたら手ごとの決まり:
   * そのまま次へ / 同じ手をもう一度 / 外れを消去してもう一度 / 最初から (ここまで = フラクチャー済みのベースを手に入れ直す)。
   * 最後の手まで来て狙いが揃っていなければ失敗
   */
  function runPattern(pat: readonly CompiledStep[]): RecipeRun {
    const startItem = item, startCost = cost;
    let preRunes = new Set(runes);
    /** 消えた狙いを取り直す時の手 (元の手の番号 → 替えた手) */
    const regain = new Map<number, CompiledStep>();
    /** 前の手の後に付いていた狙い (消えた物を見つけて、その手の「MOD が消えたら」で戻る) と、最後に打った手 */
    // 固定した物も数える (自前のフラクチャーで固定した狙いが「消えた」ことにならないように)
    const metIds = (): Set<string> => new Set(allMods(item).filter((m) => !m.unrevealed && spec.targets.some((t) => hits(t, m))).map((m) => m.modId));
    let prevMet = metIds();
    let lastAt = -1;
    const count = (t: RecipeTarget): number => new Set(allMods(item).filter((m) => !m.unrevealed && hits(t, m)).map((m) => m.modId)).size;
    let i = 0;
    /** 新しいベースで最初から */
    const restartPattern = (): void => { cost += startCost; bases++; item = startItem; i = 0; replayFrom = steps.length; preRunes = new Set(runes); regain.clear(); prevMet = metIds(); };
    /** もう一度打てる手 (レアに打てる物。変成・増強・王者・錬金はレアリティが変わるので戻れない) */
    const REDO = new Set<PatternKind>(["exalt", "chaos", "desecrate", "essence_perfect"]);
    while (steps.length < max) {
      // 手ごとの費用: 前の周の分をその手に足し、この周の始まりを覚える
      flushStep(); accAt = i; accCost = cost;
      if (fractureTs.length && !fixedHit()) return fail("固定した MOD が消えた");
      // 打った手で消えた MOD に、その手の「MOD が消えたら」があればそこへ戻る (無ければ下の、付けた手に戻る)
      {
        const now = metIds();
        const gone = [...prevMet].filter((id) => !now.has(id));
        prevMet = now;
        let goto = lastAt >= 0 ? gone.map((id) => pat[lastAt]?.lostGoto?.[id]).find((g) => g != null) : undefined;
        // 決めていなければ、マジックの手 (変成・増強・王者・錬金・エッセンス) で付けた物は打ち直せないので新しいベースで最初から
        // (2026-10-07 靴で試すと、レアで移動スピードが消えても画面は「2 手目 (増強) に戻る」、計算は戻らず最後に失敗していた)
        // まだマジックで、消えた物がこの増強の手の狙い (候補) なら、この手をもう一度 (増強で 2 つ狙う時、普通の消去で当たった方が消えた。
        // 2026-10-07 前は新しいベースからで、指輪のライフ + 火耐性でベースを 10 個使っていた。オーナー「最初増強で 2 MOD 狙うやり方も作れる道」)
        if (goto == null && lastAt >= 0 && item.rarity === "magic" && pat[lastAt]?.kind === "augment" && pat[lastAt]!.target && gone.length && gone.every((id) => membersOf(pat[lastAt]!.target!).some((a) => a.modId === id))) goto = lastAt;
        // 付けた手 = その MOD を狙った一番後ろの手 (画面の placedAt と同じ。2026-10-08 レビュー C2: 前は一番前の手を見ていて、変成 → 高貴で取り直した物でも新しいベースにしていた)
        const placedAt = (id: string): number => { for (let k = lastAt - 1; k >= 0; k--) { const q = pat[k]!; if (q.target && membersOf(q.target).some((a) => a.modId === id)) return k; } return -1; };
        if (goto == null && lastAt >= 0 && gone.some((id) => { const j = placedAt(id); return j >= 0 && ONCE_KINDS.has(pat[j]!.kind); })) goto = LOST_RESTART;
        // 「そのまま次へ」の高貴・カオス・骨などで付けた物が消えたら、その手へ戻ってもう一度 (画面の既定「N 手目に戻る」と同じ。
        // 2026-10-08 レビュー N2: lost の引き戻しを「そのまま次へ」で止めたので、ここで戻さないと取り直さず最後まで行って失敗していた)
        if (goto == null && lastAt >= 0) { for (const id of gone) { const j = placedAt(id); if (j >= 0 && REDO.has(pat[j]!.kind)) { goto = j; break; } } }
        lastAt = -1;
        if (goto === LOST_RESTART) { restartPattern(); continue; }
        if (goto != null && goto !== i && goto < pat.length) { i = goto; continue; }
      }
      // 前の手で付けた狙いが消えていたら (消去・カオスで)、その手に戻る (自動の付け方と同じ「前に付けた物が消えたら、また上から」)
      // 戻れるのはもう一度打てる手だけ (変成・増強・王者・錬金はレアリティが変わるので戻れない。その時は最後まで行って揃わなければ失敗)
      // 「付かなかった → そのまま次へ」の手は戻らない (外れを諦めて進む手。後の手で同じ MOD をもう一度狙う時は maybe で繋ぐ。2026-10-08 レビュー B1:
      // 前は onMiss を見ずに毎周その手へ戻していて、高貴・カオス・骨の「そのまま次へ」が実質「もう一度打つ」になっていた)
      const lost = pat.findIndex((q, j) => j < i && q.target && REDO.has(q.kind) && q.onMiss !== "next" && !meets(item, q.target));
      if (lost >= 0) {
        i = lost;
        // 消えた狙いをカオスの手で取り直すと、付いている他の狙いもランダムに消してしまう (2026-10-07 手袋の比べで 9 割が止まった)。
        // 取り直しは完全高貴 + その側のお告げ (外れは普通の消去) に替える。オーナー「完全高貴スパム、削減は消える可能性があるので使わない」
        const q = pat[lost]!;
        if (q.kind === "chaos" && q.target && !regain.has(lost)) {
          regain.set(lost, { kind: "exalt", currency: "exalt_perfect", omens: [SIDE_OMEN.exalt[sideOf(q.target.modId)]], target: q.target, onMiss: "annul_redo", miss: { kind: "annul", currency: "annul", omens: [] } });
        }
      }
      if (i >= pat.length) { accAt = -1; return unmet(item) ? fail("パターンの最後まで来たが狙いが揃っていない") : { done: true, cost, steps, seed, replayFrom, bases, hits: hitsNow(), stepPresses, stepCost }; }
      let p = regain.get(i) ?? pat[i]!;
      lastAt = i;
      // 自前のフラクチャー: 狙いが固定されていれば次へ。打って違う MOD が固定されたら外れ (既定は新しいベースで最初から)
      if (p.kind === "fracture") {
        const fixedNow = (): StageMod | undefined => allMods(item).find((m) => m.fractured);
        const ok = (): boolean => { const f = fixedNow(); return !!f && !!p.target && hits(p.target, f); };
        if (!ok()) {
          if (!fixedNow()) {
            stepPresses[i] = (stepPresses[i] ?? 0) + 1;
            const e = play(p.currency || "fracture");
            if (e) return fail(`${i + 1} 手目: ${e}`);
          }
          if (!ok()) {
            if (p.onMiss === "next") { i++; continue; }
            restartPattern();
            continue;
          }
        }
        i++;
        continue;
      }
      // 偉大の手 (候補のどれか 2 つ) は、もう 2 つ付いていれば次へ。1 つ付いている時は偉大を外して残りの 1 つだけ狙う (2 つ足すと外れが 1 つ増える)
      const two = !!p.target && needOf(p.target) >= 2;
      if (two && meets(item, p.target!)) { i++; continue; }
      // 狙いがもう付いている手は打たない (消えた物の手に戻った後、続く手の狙いが残っていればそのまま次へ。
      // 2026-10-07 パターンで試すと、付いている MOD の手もまた打っていた)
      if (!two && p.target && p.kind !== "rune" && meets(item, p.target)) { i++; continue; }
      if (two && count(p.target!) === 1 && p.omens.includes("OmenofGreaterExaltation")) p = { ...p, ...(p.single ? { currency: p.single.currency, omens: [...p.single.omens] } : { omens: p.omens.filter((o) => o !== "OmenofGreaterExaltation") }) };
      const before = p.target ? count(p.target) : 0;
      let e: string | null = null;
      // 始めから差さっているルーン (固定する MOD に要る物) の手は打たずに次へ
      if (p.kind === "rune" && p.rune && preRunes.has(p.rune)) { preRunes.delete(p.rune); i++; continue; }
      // もう差さっているルーンは差し直さない (消えた物の手に戻った後。2026-10-07 戻るたびにアストリッドを買い直していた)
      if (p.kind === "rune" && p.rune && (item.augments ?? []).some((x) => x.key === `rune:${p.rune}`)) { i++; continue; }
      if (p.kind === "rune") e = p.rune ? play(`rune:${p.rune}`) : "ルーンが選ばれていない";
      else if (p.kind === "essence_perfect" && p.target && allMods(item).some((m) => !m.fractured && !isGood(m) && m.family === mod(p.target!.modId).family)) {
        // 狙いと同じ系統の外れ (埋めの高貴で付いた低い段など) があるとパーフェクトエッセンスが打てないので、先にその側を消す
        // (2026-10-07 パターンで試すと、どのパターンも 2% ほどが「同じ系統の MOD が付いている」で止まっていた)
        e = annulOn(sideOf(p.target.modId));
        if (e) return fail(`${i + 1} 手目の前の消去: ${e}`);
        continue;
      } else if (p.kind === "essence_perfect" && p.target && !(["prefix", "suffix"] as StageSide[]).filter((x) => crystalSides(p.omens).includes(x)).some((x) => junkOn(item, x).length) && crystalSides(p.omens).some((x) => room(item, x))) {
        // パーフェクトエッセンスは (結晶化の側の) MOD を 1 つ消してから付く。外れが無いと付けた当たりが消える (ソウルコアとクリティカルが消し合って回り続けた。
        // 2026-10-07)。先に高貴でその側に外れを 1 つ足す
        e = play("exalt", [SIDE_OMEN.exalt[crystalSides(p.omens).find((x) => room(item, x))!]]);
        if (e) return fail(`${i + 1} 手目の前の高貴: ${e}`);
        continue;
      } else if (p.kind === "essence" || p.kind === "essence_perfect") {
        // セットのエッセンス (1 個ずつ選んだ物)。古いパターン (エッセンスが空) は付ける物から引く
        const key = p.currency || (p.target ? (p.kind === "essence" ? magicEssenceKey(p.target) : `essence:perfect:${p.target.modId}`) : null);
        e = key && ESS[key] ? play(key, p.omens) : "このエッセンスが無い";
      } else {
        // 高貴・冒涜は狙いの側に空きが無ければ、先にその側の外れを消す (戻った手で、外れが残ったまま埋まっていることがある)
        const ts = p.target ? sideOf(p.target.modId) : null;
        // 偉大 (2 つ狙い) は、その側に 2 枠空くまで外れを消してから打つ (空きが 1 つだと偉大でも 1 つしか付かない。狙いはまだ付いていないので消去で失う物が無い。
        // 2026-10-07 手順を追うと、外れが残ったまま偉大を打っていた)
        const free = ts ? limitOf(item, ts) - listOf(item, ts).length : 0;
        // 狙いがまだ 1 つも付いていない時は外れを全部消す (2 枠空いていても外れを残すと、偉大で 2 つ当たった時にその側が満杯になり、
        // 次の手 (骨など) の前の消去で当たりを巻き込んでいた。2026-10-07 オーナー「パターン 2 計算合ってる？」)
        if (p.kind === "exalt" && two && p.omens.includes("OmenofGreaterExaltation") && ts && (free < 2 || count(p.target!) === 0) && junkOn(item, ts).length) {
          e = annulOn(ts);
          if (e) return fail(`${i + 1} 手目の前の消去: ${e}`);
          continue;
        }
        // 増強も同じ (変成の外れが狙いの側に付いた時、そのまま増強すると反対の側にしか付かない。2026-10-07 オーナー「付かなかったら消去で増強やん、1 手目から」)
        if ((p.kind === "exalt" || p.kind === "desecrate" || (p.kind === "augment" && membersOf(p.target!).length === 1)) && ts && !room(item, ts) && junkOn(item, ts).length) {
          e = annulOn(ts);
          if (e) return fail(`${i + 1} 手目の前の消去: ${e}`);
          continue;
        }
        // 打つだけの高貴は埋めるための手なので、お告げの側 (無ければ両側) に空きが無ければ打たずに次へ
        // (2026-10-07 パターンで試すと、プレが満杯の時に「お告げの側に空きが無い」で止まっていた)
        if (p.kind === "exalt" && !p.target) {
          const sds: StageSide[] = p.omens.includes(SIDE_OMEN.exalt.prefix) ? ["prefix"] : p.omens.includes(SIDE_OMEN.exalt.suffix) ? ["suffix"] : ["prefix", "suffix"];
          if (!sds.some((x) => room(item, x))) { i++; continue; }
        }
        // カオスで外せる物がその側 (抹消のお告げの側、無ければ両側) に無い時は、先に高貴でその側に 1 つ足す
        // (2026-10-07 左の抹消のカオスでサフィが付くとプレが空になり、次のカオスが「外せる MOD が無い」で止まっていた)
        if (p.kind === "chaos") {
          const sd: StageSide | null = p.omens.includes("OmenofSinistralErasure") ? "prefix" : p.omens.includes("OmenofDextralErasure") ? "suffix" : null;
          const sds: StageSide[] = sd ? [sd] : ["prefix", "suffix"];
          if (!sds.some((x) => listOf(item, x).some((m) => !m.fractured))) {
            const to = sds.find((x) => room(item, x));
            e = to ? play("exalt", [SIDE_OMEN.exalt[to]]) : "カオスで外せる MOD が無い";
            if (e) return fail(`${i + 1} 手目の前の高貴: ${e}`);
            continue;
          }
        }
        // アビスの反響は発現の手で使う (骨には掛けない)。セットに入っている時だけ引き直す
        const echoes = p.omens.includes("OmenofAbyssalEchoes");
        stepPresses[i] = (stepPresses[i] ?? 0) + 1;
        e = play(p.currency, p.omens.filter((o) => o !== "OmenofAbyssalEchoes"));
        // 打つだけの骨で、後ろに自前のフラクチャーの手があれば発現させない (未発現の冒涜はフラクチャーされない = 壁。2026-10-07 発現させていて当たりが 1/5 に下がっていた)
        const wall = !p.target && pat.slice(i + 1).some((q) => q.kind === "fracture");
        if (!e && p.kind === "desecrate" && unrevealedOf(item) && !wall) e = reveal(p.target, echoes);
      }
      if (e) return fail(`${i + 1} 手目: ${e}`);
      if (!p.target || (two ? meets(item, p.target) : count(p.target) > before || meets(item, p.target))) { i++; continue; }
      // 外れ
      if (p.onMiss === "next") { i++; continue; }
      // 狙いの側に外れが付いて埋まっていたら消去してから次へ (反対の側なら残して次へ: 次の増強は必ず狙いの側に付く)
      if (p.onMiss === "annul_next") {
        const sides = [...new Set(p.target ? membersOf(p.target).map((a) => sideOf(a.modId)) : [])];
        const blocked = sides.find((sd) => !room(item, sd) && junkOn(item, sd).length);
        if (blocked) { e = annulOn(blocked); if (e) return fail(`${i + 1} 手目の外し: ${e}`); }
        i++;
        continue;
      }
      if (p.onMiss === "restart") { restartPattern(); continue; }
      // カオスの手のやり直しがカオス (同じ物・お告げ) なら、次のカオスがそのまま入れ替えになる。やり直しのカオスを別に打つと、
      // その結果を見ないまま次のカオスを打つので 2 回打って 1 回分しか判定していなかった (2026-10-07 オーナー「回る速度遅くね」「500 回の 50 神以内で付くかなと思ってた」)
      if (p.onMiss === "annul_redo" && p.kind === "chaos" && p.miss?.kind === "chaos" && p.miss.currency === p.currency && p.miss.omens.join("+") === p.omens.join("+")) continue;
      if (p.onMiss === "annul_redo" && p.miss) {
        // 外す物を手で決めた手 (消去 + お告げ / カオス + 削減 / パーフェクトエッセンス + 結晶化 / 骨 + ネクロマンシー)。打ってから同じ手をもう一度
        if (p.miss.kind === "essence_perfect") {
          // 外れの側 (結晶化の側、無ければ狙いの側) に付く一番安いパーフェクトエッセンスで上書き (計算機の「天体」と同じ)
          const sd: StageSide = p.miss.omens.some((o) => /Sinistral/.test(o)) ? "prefix" : p.miss.omens.some((o) => /Dextral/.test(o)) ? "suffix" : sideOf(p.target!.modId);
          const key = p.miss.currency || cheapestPerfectEssence(sd);
          e = key ? play(key, p.miss.omens) : "外れの側に使えるパーフェクトエッセンスが無い";
        } else if (p.miss.kind === "desecrate") {
          e = play(p.miss.currency, p.miss.omens.filter((o) => o !== "OmenofAbyssalEchoes"));
          if (!e && unrevealedOf(item)) e = reveal(null, false);
        } else {
          // お告げ無しの消去は、どちらの側が消えたかで枝分かれ (PatternStep.otherGone)。反対の側が消えて、狙いの側に外れが残っていれば、もう一度消去
          // 狙いが 1 つの手だけ (2 つ狙い・候補のある手は、どちらの側が狙いか決まらない)
          const ts = p.target && membersOf(p.target).length === 1 ? sideOf(p.target.modId) : null;
          const plain = p.miss.kind === "annul" && !p.miss.omens.length;
          // 外れが反対の側に付いた (狙いの側に外れが無く空きがある) なら、消さずにもう一度打つ (反対の側を壁にする)
          const keep = plain && ts && p.otherJunk === "keep" && !junkOn(item, ts).length && room(item, ts);
          for (let k = 0; k < 6 && !keep; k++) {
            const otherBefore = ts ? listOf(item, ts === "prefix" ? "suffix" : "prefix").length : 0;
            e = play(p.miss.currency, p.miss.omens);
            if (e || !plain || !ts || p.otherGone !== "annul") break;
            const otherGone = listOf(item, ts === "prefix" ? "suffix" : "prefix").length < otherBefore;
            if (!otherGone || !junkOn(item, ts).length) break;
          }
        }
        if (e) return fail(`${i + 1} 手目の外し: ${e}`);
      } else if (p.onMiss === "annul_redo") {
        // 冒涜の外れは光のお告げで冒涜の MOD を消す。ほかは外れのある側 (狙いの側を先に)
        if (p.kind === "desecrate" && allMods(item).some((m) => m.desecrated && !m.unrevealed && !isGood(m))) e = play("annul", ["OmenofLight"]);
        else {
          const ts = sideOf(p.target!.modId);
          const side = junkOn(item, ts).length ? ts : junkOn(item, ts === "prefix" ? "suffix" : "prefix").length ? (ts === "prefix" ? "suffix" : "prefix") : null;
          const mode = side ? spec.annulSides?.[side] : undefined;
          e = !side ? null : mode === "side" ? play("annul", [SIDE_OMEN.annul[side]]) : mode === "plain" ? play("annul") : annulOn(side);
        }
        if (e) return fail(`${i + 1} 手目の消去: ${e}`);
      }
      // redo / annul_redo: 同じ手をもう一度
    }
    return fail(`手が多すぎる (${max.toLocaleString()} 手を超えた)`);
  }

  /** その側に付けられる一番安いパーフェクトエッセンス (同じ系統が付いている物・値段の無い物は除く) */
  function cheapestPerfectEssence(sd: StageSide): string | null {
    const ids = item.cls.pools.essence[sd === "prefix" ? "prefixes" : "suffixes"] ?? [];
    const taken = new Set(allMods(item).map((m) => m.family));
    let best: string | null = null, bestP = Infinity;
    for (const id of ids) {
      const m = data.mods.get(id);
      const key = `essence:perfect:${id}`;
      if (!m || m.source !== "perfect_essence" || taken.has(m.family) || !ESS[key]) continue;
      const pr = spec.price(key);
      if (pr > 0 && pr < bestP) { bestP = pr; best = key; }
    }
    return best;
  }

  function boneFor(t: RecipeTarget): string {
    if (mod(t.modId).tags.includes("breach_desecration")) return "desecrate_altered";
    return reach(t) >= 40 ? "desecrate_ancient" : "desecrate";
  }
  /** マジックに使う普通のエッセンス (狙いの段が出る一番下の等級)。パーフェクトしか無い物は null */
  function magicEssenceKey(t: RecipeTarget): string | null {
    const m = mod(t.modId);
    for (const lv of ["lesser", "normal", "greater"] as const) {
      const key = `essence:${lv}:${t.modId}`;
      if (!ESS[key]) continue;
      const idx = m.tiers.findIndex((x) => essenceLevelOf(String(x.name ?? "")) === lv);
      if (idx >= t.minTierIndex) return key;
    }
    return null;
  }
}

/**
 * 画面に手を返す (数字の描き直し・ボタンの反応のため)。setTimeout(0) は 4 ms ほど待つが、40 ms ごとなので 1 割ほどで済む。
 * scheduler.yield / MessageChannel は計算の続きが優先されて描画が後回しになり、進み具合の数字が止まって見えた (2026-10-07 オーナー「数字の描写遅い、前は 1 単位で回ってるの見えた」)
 */
const yieldToUi = (): Promise<void> => new Promise<void>((r) => setTimeout(r, 0));

/**
 * 1 回分を軽くした物 (並列で回す時に作業場所から送り返す形。手の並び steps は送らず、打った物ごとの数と費用 tally にまとめる)
 */
export type RunLite = Omit<RecipeRun, "steps"> & { tally: Record<string, [number, number]> };
export function liteOf(spec: Pick<RecipeSpec, "price">, r: RecipeRun): RunLite {
  const tally: Record<string, [number, number]> = {};
  for (const s of r.steps) {
    for (const k of [s.currency, ...(s.omen ? s.omen.split("+") : [])]) {
      const key = k.replace(/^reveal:.*$/, "reveal");
      const x = (tally[key] ??= [0, 0]);
      x[0]++;
      x[1] += key === "reveal" ? 0 : spec.price(k);
    }
  }
  const { steps: _steps, ...rest } = r;
  return { ...rest, tally };
}

/** 回した結果をまとめる。sample は費用が真ん中の完成した回を、同じ seed で回し直して手の並びごと取る */
export function summarizeRuns(spec: RecipeSpec, runs: readonly RunLite[]): RecipeResult {
  const done = runs.filter((r) => r.done);
  const spent = runs.reduce((a, r) => a + r.cost, 0);
  const costs = done.map((r) => r.cost).sort((a, b) => a - b);
  const q = (p: number): number => (costs.length ? costs[Math.min(costs.length - 1, Math.floor(p * costs.length))]! : Infinity);
  const tally = new Map<string, { count: number; cost: number }>();
  for (const r of runs) for (const [key, [n, c]] of Object.entries(r.tally)) {
    const x = tally.get(key) ?? { count: 0, cost: 0 };
    x.count += n; x.cost += c;
    tally.set(key, x);
  }
  const per = done.length || 1;
  const usage = [...tally].map(([key, x]) => ({ key, count: x.count / per, cost: x.cost / per })).sort((a, b) => b.cost - a.cost);
  const stopMap = new Map<string, number>();
  for (const r of runs) if (!r.done) stopMap.set(r.reason ?? "?", (stopMap.get(r.reason ?? "?") ?? 0) + 1);
  const mid = q(0.5);
  const mids = done.length ? done.reduce((a, b) => (Math.abs(b.cost - mid) < Math.abs(a.cost - mid) ? b : a)) : null;
  const sample = mids ? runRecipeOnce(spec, mids.seed) : null;
  return {
    runs: runs.length,
    pDone: done.length / runs.length,
    perDone: done.length ? spent / done.length : Infinity,
    p50: q(0.5), p80: q(0.8), p90: q(0.9),
    usage,
    stops: [...stopMap].map(([reason, n]) => ({ reason, p: n / runs.length })).sort((a, b) => b.p - a.p),
    sample,
    bases: runs.reduce((a, r) => a + r.bases, 0) / per,
    hitRates: (() => {
      const m = new Map<string, number>();
      for (const r of runs) for (const id of r.hits ?? []) m.set(id, (m.get(id) ?? 0) + 1);
      return [...m].map(([modId, n]) => ({ modId, p: n / runs.length })).sort((a, b) => b.p - a.p);
    })(),
    stepAvg: (() => {
      const len = Math.max(0, ...runs.map((r) => Math.max(r.stepPresses?.length ?? 0, r.stepCost?.length ?? 0)));
      // 8 割の人: 打った数・費用を並べて 8 割目 (2026-10-07 オーナー「8 割の人の完成度で出した方が良さそう」)
      const p80 = (xs: number[]): number => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(0.8 * a.length))]! : 0; };
      return Array.from({ length: len }, (_, j) => {
        const pr = runs.map((r) => r.stepPresses?.[j] ?? 0), co = runs.map((r) => r.stepCost?.[j] ?? 0);
        return { presses: pr.reduce((a, x) => a + x, 0) / runs.length, cost: co.reduce((a, x) => a + x, 0) / runs.length, p80Presses: p80(pr), p80Cost: p80(co) };
      });
    })(),
  };
}

/**
 * 回す人ごとの seed (並列でも 1 本でも同じ seed を使うので、結果は同じになる)。n 手目の乱数は seed + n なので、
 * 人の間隔は 1 人の上限の手の数より広く取る (10,000 ずつだった時、上限 20,000 / 50,000 手で隣の人と同じ乱数を使っていた。2026-10-07)
 */
export const seedsOf = (spec: Pick<RecipeSpec, "seed" | "runs" | "maxSteps">): number[] => {
  const gap = Math.max(10_000, (spec.maxSteps ?? 4000) + 1_000);
  const seed0 = spec.seed ?? Math.floor(Date.now() % 1_000_000) * 10_000;
  return Array.from({ length: spec.runs }, (_, i) => seed0 + i * gap);
};

/** 何百回も回してまとめる (画面に手を返しながら。1 本で回す。並列は recipe-parallel.ts) */
export async function runRecipe(spec: RecipeSpec, onProgress?: (done: number, total: number) => void, stopped?: () => boolean): Promise<RecipeResult | null> {
  const seeds = seedsOf(spec);
  const runs: RunLite[] = [];
  let last = Date.now();
  for (let i = 0; i < seeds.length; i++) {
    runs.push(liteOf(spec, runRecipeOnce(spec, seeds[i]!)));
    if (Date.now() - last > 40) {
      // 進み具合は手を返すたびに渡す (受け取る側は数字の部品 SimProgress.vue だけを描き直す。2026-10-07 オーナー「さっきまでぬるぬるだったのに」)
      onProgress?.(i + 1, spec.runs);
      await yieldToUi();
      if (stopped?.()) return null;
      last = Date.now();
    }
  }
  onProgress?.(spec.runs, spec.runs);
  return summarizeRuns(spec, runs);
}

/**
 * 狙いにルーンの MOD (コルの狩りなど、差した時だけ付く) がある時は、白のベースにそのルーンを差してから始める。
 * ソケットが足りなければルーンの数まで増やす (2026-10-05 オーナー「シミュレーションだからコルも選べるように」)
 */
export function runeStart(spec: Pick<RecipeSpec, "data" | "targets" | "sockets" | "pattern">): { runes: string[]; sockets: number } {
  // パターンではルーンも手で差す。ただし固定する MOD (フラクチャー) に要るルーンは、固定済みのベースに始めから差さっている
  // (2026-10-07: 手袋の「全ての投射物スキルのレベル」はコルの狩りが無いと付かず、固定済みのベースを作れずに止まっていた)。
  // ソケットは始めのルーン + パターンのルーンの手 (始めに差さっている物は除く) の数まで
  const ids = new Set<string>();
  for (const t of spec.pattern ? spec.targets.filter((x) => x.method === "fracture") : spec.targets) for (const x of [t, ...(t.alts ?? [])]) { const r = spec.data.mods.get(x.modId)?.rune; if (r) ids.add(r); }
  // ステージのルーンの名前 (相場・絵のキー) で持つ。エンジンの名前とは ' と ’ が違う事がある
  const runes = [...ids].flatMap((id) => { const en = Object.keys(RUNES).find((k) => runeIdByName(k) === id); return en ? [en] : []; });
  if (spec.pattern) {
    const steps = spec.pattern.filter((p) => p.kind === "rune" && !(p.rune && runes.includes(p.rune))).length;
    return { runes, sockets: Math.max(spec.sockets ?? 0, runes.length + steps) };
  }
  return { runes, sockets: Math.max(spec.sockets ?? 0, runes.length) };
}

/** 記録した 1 回を手順 JSON に (ステージで再生する用)。付いた状態から始める時は始めの MOD を固定済みで */
export function recipePlan(spec: RecipeSpec, run: RecipeRun): CraftStagePlan {
  const fractureT = spec.targets.find((t) => t.method === "fracture");
  const bought = fractureT && spec.fractureStart?.kind === "bought";
  const m = bought ? spec.data.mods.get(fractureT.modId) : null;
  const { runes, sockets } = runeStart(spec);
  const extra = { ...(sockets ? { sockets } : {}), ...(runes.length ? { runes } : {}) };
  return {
    title: "シミュレーションの 1 回",
    base: spec.base,
    item_level: spec.itemLevel,
    // 作り直した回は最後の作り直しから (n 手目の乱数は seed + n なので、seed をずらすと同じ結果になる)
    seed: run.seed + run.replayFrom,
    ...(bought && m ? ({ start: { rarity: "rare", mods: [{ mod: m.id, tier: `T${m.tiers.length - fractureT.minTierIndex}`, fractured: true }], ...extra } } as object)
      : sockets ? ({ start: { rarity: "normal", ...extra } } as object) : {}),
    steps: run.steps.slice(run.replayFrom).map((s) => ({ currency: s.currency, ...(s.omen ? { omen: s.omen } : {}) })) as CraftStagePlan["steps"],
  } as CraftStagePlan;
}
