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
import { CURRENCY_FLOOR, type PatchData } from "../../vendor/poe2htc/engine/types";
import { essenceLevelOf } from "../../vendor/poe2htc/optimizer/cost";
import { applyCurrency } from "./apply-currency";
import { revealOffers, unrevealedOf } from "./apply-desecrate";
import { mulberry32 } from "../htc/rng";
import { freshItem, startFrom } from "./run-plan";
import { allMods, listOf, room } from "./stage-core";
import type { StageItem, StageMod, StageSide } from "./types";
import type { CraftStagePlan } from "./contract";
import essenceKeys from "../htc/essence-keys.json";

export type RecipeMethod = "exalt" | "chaos" | "desecrate" | "essence" | "fracture";
/**
 * 狙いの 1 手順。alts があれば「どれか 1 つが付けば当たり」(2026-10-05 オーナー「マークスマンの MOD をプレで複数選んで狙いたい。
 * その 1 つの MOD の所は他の MOD でも当たりとする」)。alts は modId と同じ側・同じ付け方 (普通 / 冒涜) の物だけ
 */
export interface RecipeTarget { modId: string; minTierIndex: number; method: RecipeMethod; alts?: ReadonlyArray<{ modId: string; minTierIndex: number }> }
/** その手順で当たりになる MOD (本体 + alts) */
export const membersOf = (t: RecipeTarget): Array<{ modId: string; minTierIndex: number }> => [{ modId: t.modId, minTierIndex: t.minTierIndex }, ...(t.alts ?? [])];
const hits = (t: RecipeTarget, m: StageMod): boolean => membersOf(t).some((x) => m.modId === x.modId && m.tierIndex >= x.minTierIndex);
export interface RecipeSpec {
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
}

const ESS = (essenceKeys as unknown as { keys: Record<string, { en: string; ja: string }> }).keys;
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
  const meets = (it: StageItem, t: RecipeTarget): boolean => allMods(it).some((m) => !m.unrevealed && hits(t, m));
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
      return m ? m.tiers.reduce((a, x, i) => a + (i >= minIdx && x.ilvl >= floor && x.ilvl <= spec.itemLevel ? x.weight : 0), 0) : 0;
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
  let item = freshItem(data, spec.base, spec.itemLevel);
  if (!(fractureT && spec.fractureStart?.kind === "bought")) { cost += white; bases = 1; }
  if (fractureT && spec.fractureStart?.kind === "bought") {
    // 手順 JSON の始めの状態と同じ作り方 (再生で同じ物になる)
    const m = mod(fractureT.modId);
    item = startFrom(data, spec.base, spec.itemLevel, { rarity: "rare", mods: [{ mod: m.id, tier: `T${m.tiers.length - fractureT.minTierIndex}`, fractured: true }] }, seed - 1);
    cost += spec.fractureStart.price;
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
  const reveal = (desire: RecipeTarget | null): string | null => {
    const n = steps.length + 1;
    const offers = revealOffers(data, item, mulberry32(seed + n));
    const hit = (list: StageMod[]) => (desire ? list.findIndex((m) => hits(desire, m)) : -1);
    const a = hit(offers.first);
    if (a >= 0) return play(`reveal:${a + 1}`);
    if (desire && offers.reroll.length) {
      const b = hit(offers.reroll);
      return play(`reveal:${b >= 0 ? b + 1 : 1}:reroll`, ["OmenofAbyssalEchoes"]);
    }
    return play("reveal:1");
  };
  const fail = (reason: string): RecipeRun => ({ done: false, cost, steps, seed, reason, replayFrom, bases });
  /** 白のベースを買い直して始めから (再生はここから) */
  const restart = (): void => {
    cost += white;
    bases++;
    item = freshItem(data, spec.base, spec.itemLevel);
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
  if (fractureT && fs?.kind === "make") {
    const magicRoute = fs.route === "magic";
    for (;;) {
      if (steps.length >= max) return fail("手が多すぎる (フラクチャーまで)");
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
        const fSide = sideOf(fractureT.modId);
        if (fractureTs.some((t) => meets(item, t))) e = play("regal");
        else if (junkOn(item, fSide).some((m) => !isF(m)) || allMods(item).length >= 2) e = missMagic(fractureT);
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

  while (steps.length < max) {
    // 未発現の冒涜 MOD が残っていれば先に発現 (冒涜の狙いの手の中で選ぶ)
    // フラクチャーの狙い (候補) は、どれか 1 つが固定されていれば良い (固定されなかった候補は作らない)
    if (fractureTs.length && !fixedHit()) return fail("固定した MOD が消えた");
    const t = spec.targets.find((x) => x.method !== "fracture" && !meets(item, x));
    if (!t) return { done: true, cost, steps, seed, replayFrom, bases };
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
      // カオスは外して付ける。外せる物 (固定でない・未発現でない) が無ければ、先に高貴で 1 つ足す
      e = allMods(item).some((m) => !m.fractured && !m.unrevealed) ? play("chaos") : play("exalt");
    } else if (t.method === "exalt") {
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
  return fail("手が多すぎる");

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

/** 何百回も回してまとめる (画面に手を返しながら) */
export async function runRecipe(spec: RecipeSpec, onProgress?: (done: number, total: number) => void, stopped?: () => boolean): Promise<RecipeResult | null> {
  const seed0 = spec.seed ?? Math.floor(Date.now() % 1_000_000) * 10_000;
  const runs: RecipeRun[] = [];
  let last = Date.now();
  for (let i = 0; i < spec.runs; i++) {
    runs.push(runRecipeOnce(spec, seed0 + i * 10_000));
    if (Date.now() - last > 15) {
      onProgress?.(i + 1, spec.runs);
      await new Promise((r) => setTimeout(r, 0));
      if (stopped?.()) return null;
      last = Date.now();
    }
  }
  onProgress?.(spec.runs, spec.runs);
  const done = runs.filter((r) => r.done);
  const spent = runs.reduce((a, r) => a + r.cost, 0);
  const costs = done.map((r) => r.cost).sort((a, b) => a - b);
  const q = (p: number): number => (costs.length ? costs[Math.min(costs.length - 1, Math.floor(p * costs.length))]! : Infinity);
  const tally = new Map<string, { count: number; cost: number }>();
  for (const r of runs) for (const s of r.steps) {
    for (const k of [s.currency, ...(s.omen ? s.omen.split("+") : [])]) {
      const key = k.replace(/^reveal:.*$/, "reveal");
      const x = tally.get(key) ?? { count: 0, cost: 0 };
      x.count++;
      x.cost += key === "reveal" ? 0 : spec.price(k);
      tally.set(key, x);
    }
  }
  const per = done.length || 1;
  const usage = [...tally].map(([key, x]) => ({ key, count: x.count / per, cost: x.cost / per })).sort((a, b) => b.cost - a.cost);
  const stopMap = new Map<string, number>();
  for (const r of runs) if (!r.done) stopMap.set(r.reason ?? "?", (stopMap.get(r.reason ?? "?") ?? 0) + 1);
  const mid = q(0.5);
  const sample = done.length ? done.reduce((a, b) => (Math.abs(b.cost - mid) < Math.abs(a.cost - mid) ? b : a)) : null;
  return {
    runs: runs.length,
    pDone: done.length / runs.length,
    perDone: done.length ? spent / done.length : Infinity,
    p50: q(0.5), p80: q(0.8), p90: q(0.9),
    usage,
    stops: [...stopMap].map(([reason, n]) => ({ reason, p: n / runs.length })).sort((a, b) => b.p - a.p),
    sample,
    bases: runs.reduce((a, r) => a + r.bases, 0) / per,
  };
}

/** 記録した 1 回を手順 JSON に (ステージで再生する用)。付いた状態から始める時は始めの MOD を固定済みで */
export function recipePlan(spec: RecipeSpec, run: RecipeRun): CraftStagePlan {
  const fractureT = spec.targets.find((t) => t.method === "fracture");
  const bought = fractureT && spec.fractureStart?.kind === "bought";
  const m = bought ? spec.data.mods.get(fractureT.modId) : null;
  return {
    title: "シミュレーションの 1 回",
    base: spec.base,
    item_level: spec.itemLevel,
    // 作り直した回は最後の作り直しから (n 手目の乱数は seed + n なので、seed をずらすと同じ結果になる)
    seed: run.seed + run.replayFrom,
    ...(bought && m ? ({ start: { rarity: "rare", mods: [{ mod: m.id, tier: `T${m.tiers.length - fractureT.minTierIndex}`, fractured: true }] } } as object) : {}),
    steps: run.steps.slice(run.replayFrom).map((s) => ({ currency: s.currency, ...(s.omen ? { omen: s.omen } : {}) })) as CraftStagePlan["steps"],
  } as CraftStagePlan;
}
