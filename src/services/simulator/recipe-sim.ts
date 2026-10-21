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
import { addOddsBySpec, hitShare, sideOfMod } from "../craft-stage/engine";
import { essenceLevelOf } from "../../vendor/poe2htc/optimizer/cost";
import { applyCurrency } from "../craft-stage/apply-currency";
import { revealOffers, unrevealedOf } from "../craft-stage/apply-desecrate";
import { mulberry32 } from "../htc/rng";
import { freshItem, startFrom } from "../craft-stage/run-plan";
import { runeIdByName } from "../../vendor/poe2htc/engine/runes";
import { RUNES } from "../craft-stage/stage-runes";
import { allMods, listOf, room } from "../craft-stage/stage-core";
import type { StageItem, StageMod, StageSide } from "../craft-stage/types";
import type { CraftStagePlan } from "../craft-stage/contract";
import { ESS, SIDE_OMEN, hits, membersOf, needOf, type RecipeRun, type RecipeSpec, type RecipeTarget, type RecipeResult } from "./recipe-defs";
import { runPattern, type RunState } from "./recipe-pattern-run";
export * from "./recipe-defs";

/** 1 回の挑戦 */
export function runRecipeOnce(spec: RecipeSpec, seed: number): RecipeRun {
  const cur = {} as RunState;
  const { data } = spec;
  const max = spec.maxSteps ?? 4000;
  const steps: RecipeRun["steps"] = [];
  cur.cost = 0;
  cur.replayFrom = 0;
  cur.bases = 0;
  const mod = (id: string) => data.mods.get(id)!;
  const sideOf = (id: string): StageSide => sideOfMod(data, id);
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
    const guard = listOf(cur.item, other).some((m) => !m.fractured && isGood(m));
    return guard ? play("annul", [SIDE_OMEN.annul[s0]]) : play("annul");
  };
  const junkOn = (it: StageItem, s: StageSide): StageMod[] => listOf(it, s).filter((m) => !m.fractured && !isGood(m));
  /** 狙いの段以上で一番高い段のレベル (等級の下限が届くか) */
  const reach = (t: RecipeTarget): number => Math.max(0, ...membersOf(t).flatMap((y) => mod(y.modId).tiers.filter((x, i) => i >= y.minTierIndex && x.ilvl <= spec.itemLevel).map((x) => x.ilvl)));
  /**
   * 等級 (無印 / 上級 / 完全) は「1 個の値段 ÷ 狙いが出る確率」が一番安い物 (2026-10-05)。下限 (高貴 35 / 50、変成・増強 44 / 70) が上がると低い段が
   * 出なくなるが、狙いの段も下限より下は出なくなる (ライフ T5 以上を完全で狙うと T1 しか出ず、変成・増強ガチャが回り続けた)。
   * 確率はエンジンの入口の 1 手の確率 (strengthOdds: 打つ処理と同じ候補・下限・差したルーン) で、MOD の無いアイテムに打った時の目安 (同じ系統の除外は見ない)
   */
  const gradeMemo = new Map<string, string>();
  const grade = (base: "exalt" | "transmute" | "augment", t: RecipeTarget): string => {
    const runeKey = (cur.item.augments ?? []).map((a) => a.key).join(",");
    const key = `${base}|${runeKey}|${membersOf(t).map((x) => `${x.modId}:${x.minTierIndex}`).join(",")}`;
    const hit = gradeMemo.get(key);
    if (hit) return hit;
    let best = base as string, bestCost = Infinity;
    // アイテムレベルが下限に届かない強さは候補 0 で打てない (2026-10-10 点検: ilvl 60 で完全の変成を選んで 1 手目で止まっていた)
    for (const { key: k, p } of strengthOdds(data, cur.item, base, sideOf(t.modId), membersOf(t))) {
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
  cur.item = fresh();
  if (spec.startItem) {
    // 手打ちの状態から: その写し 1 個 (ルーン・白は込みの値段)
    cur.item = { ...spec.startItem, prefixes: spec.startItem.prefixes.map((m) => ({ ...m })), suffixes: spec.startItem.suffixes.map((m) => ({ ...m })) };
    cur.cost += spec.startPrice ?? 0;
    cur.bases = 1;
  } else {
  cur.cost += runeCost;
  if (!(fractureT && spec.fractureStart?.kind === "bought")) { cur.cost += white; cur.bases = 1; }
  }
  if (!spec.startItem && fractureT && spec.fractureStart?.kind === "bought") {
    // 手順 JSON の始めの状態と同じ作り方 (再生で同じ物になる)
    const m = mod(fractureT.modId);
    cur.item = startFrom(data, spec.base, spec.itemLevel, { rarity: "rare", mods: [{ mod: m.id, tier: `T${m.tiers.length - fractureT.minTierIndex}`, fractured: true }], ...(sockets ? { sockets } : {}), ...(runes.length ? { runes } : {}) }, seed - 1);
    cur.cost += spec.fractureStart.price;
    // 買った固定済みのベースも 1 個 (前は 0 のままで、やり直しで買い直した時だけ +1 だった → 画面の「ベース × N 個」が 0 になっていた。2026-10-08)
    cur.bases = 1;
  }

  /** 1 手打つ。打てなければ理由 (その回は止める) */
  const play = (key: string, omens: string[] = []): string | null => {
    const n = steps.length + 1;
    const r = applyCurrency(data, cur.item, key, mulberry32(seed + n), omens);
    if (!r.applied) return r.reason ?? "打てない";
    const used = r.omensUsed ?? [];
    cur.cost += spec.price(key) * (r.count ?? 1) + used.reduce((a, o) => a + spec.price(o), 0);
    steps.push({ currency: key, omen: used.length ? used.join("+") : null });
    cur.item = r.item;
    return null;
  };
  /** 発現: 狙い (desire) があれば選ぶ。無ければ反響で引き直し、それでも無ければ 1 番 */
  const reveal = (desire: RecipeTarget | null, echoes = true): string | null => {
    const n = steps.length + 1;
    const offers = revealOffers(data, cur.item, mulberry32(seed + n));
    const hit = (list: StageMod[]) => (desire ? list.findIndex((m) => hits(desire, m)) : -1);
    const a = hit(offers.first);
    if (a >= 0) return play(`reveal:${a + 1}`);
    if (desire && echoes && offers.reroll.length) {
      const b = hit(offers.reroll);
      return play(`reveal:${b >= 0 ? b + 1 : 1}:reroll`, ["OmenofAbyssalEchoes"]);
    }
    return play("reveal:1");
  };
  const hitsNow = (): string[] => [...new Set(allMods(cur.item).filter((m) => !m.unrevealed && !m.fractured && spec.targets.some((t) => hits(t, m))).map((m) => m.modId))];
  /** 手ごとの打った数と費用 (runPattern の中で数える) */
  const stepPresses: number[] = [], stepCost: number[] = [];
  cur.accAt = -1; cur.accCost = 0;
  const flushStep = (): void => { if (cur.accAt >= 0) stepCost[cur.accAt] = (stepCost[cur.accAt] ?? 0) + (cur.cost - cur.accCost); cur.accAt = -1; };
  const fail = (reason: string): RecipeRun => { flushStep(); return { done: false, cost: cur.cost, steps, seed, reason, replayFrom: cur.replayFrom, bases: cur.bases, hits: hitsNow(), stepPresses, stepCost }; };
  /** 白のベースを買い直して始めから (再生はここから) */
  const restart = (): void => {
    cur.cost += white + runeCost;
    cur.bases++;
    cur.item = fresh();
    cur.replayFrom = steps.length;
  };
  /** マジックで外れた: 消去と「白を買い直して変成」の安い方 */
  const missMagic = (t: RecipeTarget): string | null => {
    if (spec.price("annul") <= white + spec.price(grade("transmute", t))) return play("annul");
    restart();
    return null;
  };
  /** 固定された MOD がフラクチャーの狙いのどれかか */
  const fixedHit = (): boolean => {
    const fixed = allMods(cur.item).find((m) => m.fractured);
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
        if (cur.item.rarity === "normal") e = play("alchemy");
        else if (!fractureTs.some((t) => meets(cur.item, t))) e = play("chaos");
        else { e = play("fracture"); if (!e) { if (fixedHit()) break; restart(); } }
      } else if (cur.item.rarity === "normal") {
        e = play(grade("transmute", fractureT));
      } else if (cur.item.rarity === "magic") {
        // 変成・増強ガチャ: 候補のどれか 1 つが付いたら王者 (2026-10-05 オーナー「始める MOD を選んでもらって、どれか付いたら始められる」。
        // 候補は同じ側)。その側に外れがある / 2 つ埋まっていれば外れ (消去か買い直しの安い方)
        // 候補は両側でも良い (2026-10-05 オーナー「シミュレーションだしどっちも選択できるでいい、推奨で出しておけば」)。
        // 候補のある側に外れが付いた / 2 つ埋まった時が外れ
        const fSides = new Set(fractureTs.map((t) => sideOf(t.modId)));
        if (fractureTs.some((t) => meets(cur.item, t))) e = play("regal");
        else if (allMods(cur.item).some((m) => !isF(m) && !m.fractured && fSides.has(m.side)) || allMods(cur.item).length >= 2) e = missMagic(fractureT);
        else e = play(grade("augment", fractureT));
      } else if (allMods(cur.item).length < 4) {
        // 4 つにする。壁 = 4 つ目を骨の未発現の冒涜に (フラクチャーされないので候補が 1 つ減る)
        const open = (["prefix", "suffix"] as StageSide[]).find((sd) => room(cur.item, sd));
        // 壁は骨 1 本だけ (空いている側に付く。側は問わないのでお告げは要らない。2026-10-05 オーナー「王者後は骨 1 個でいい、選ぶ必要ない」)
        if (fs.blocker && allMods(cur.item).length === 3 && open && !unrevealedOf(cur.item)) e = play("desecrate");
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
      if (!allMods(cur.item).some((m) => !m.fractured && !m.unrevealed)) break;
      const e = play("annul");
      if (e) return fail(`消去: ${e}`);
    }
  }

  if (spec.pattern) return runPattern({ cur, spec, max, steps, seed, runes, fractureTs, stepPresses, stepCost, play, reveal, fail, flushStep, annulOn, junkOn, isGood, meets, unmet, hitsNow, fixedHit, grade, sideOf, mod, cheapestPerfectEssence, magicEssenceKey }, spec.pattern);

  while (steps.length < max) {
    // 未発現の冒涜 MOD が残っていれば先に発現 (冒涜の狙いの手の中で選ぶ)
    // フラクチャーの狙い (候補) は、どれか 1 つが固定されていれば良い (固定されなかった候補は作らない)
    if (fractureTs.length && !fixedHit()) return fail("固定した MOD が消えた");
    const t = unmet(cur.item);
    if (!t) return { done: true, cost: cur.cost, steps, seed, replayFrom: cur.replayFrom, bases: cur.bases, hits: hitsNow() };
    const side = sideOf(t.modId);
    let e: string | null = null;
    if (unrevealedOf(cur.item)) {
      e = reveal(t.method === "desecrate" ? t : null);
    } else if (cur.item.rarity === "normal") {
      e = play(t.method === "exalt" || t.method === "chaos" ? grade("transmute", t) : "transmute");
    } else if (cur.item.rarity === "magic") {
      const essKey = t.method === "essence" ? magicEssenceKey(t) : null;
      if (essKey) e = play(essKey);
      else if ((t.method === "exalt" || t.method === "chaos") && mod(t.modId).source === "normal" && !allMods(cur.item).some(isGood)) {
        // マジックで最初の狙いを 1 つだけ作る (変成・増強、外れは消去)。その側に外れがある / 2 つ埋まっていれば消去。
        // 1 つ付いたら王者 (2 つ目までマジックで狙うと、消去が付けた物を消して回り続けた)
        e = junkOn(cur.item, side).length || allMods(cur.item).length >= 2 ? missMagic(t) : play(grade("augment", t));
      } else e = play("regal");
    } else if (t.method === "chaos") {
      // カオススパム: 狙いの側に空きがあれば側の高貴で埋め、外れが付いていれば側のカオス (抹消のお告げ) でその側だけ入れ替える
      // (2026-10-08 オーナー「プレフィックスに高貴ガチャではあるんだけど、カオススパムもこの中の MOD でやる。どれか 3 つ付けば終わり」。
      // 前は側を見ずにカオスを打ち、付いた当たりも消して 4,000 手で止まっていた)。外せる物が無ければ高貴で 1 つ足す
      const junk = junkOn(cur.item, side);
      if (junk.length) e = play("chaos", [side === "prefix" ? "OmenofSinistralErasure" : "OmenofDextralErasure"]);
      else if (room(cur.item, side)) e = play(grade("exalt", t), [SIDE_OMEN.exalt[side]]);
      else e = allMods(cur.item).some((m) => !m.fractured && !m.unrevealed) ? play("chaos") : play("exalt");
    } else if (t.method === "exalt") {
      if (junkOn(cur.item, side).length) e = annulOn(side);
      else if (room(cur.item, side)) e = play(grade("exalt", t), [SIDE_OMEN.exalt[side]]);
      else return fail("枠が足りない (狙いが多すぎる)");
    } else if (t.method === "desecrate" && allMods(cur.item).some((m) => m.desecrated && !m.unrevealed && isGood(m))) {
      // 冒涜で 1 つ付いた後の残り (どれか N つの N − 1 つ) は高貴で付ける (冒涜の MOD はアイテムに 1 つまで)
      if (junkOn(cur.item, side).length) e = annulOn(side);
      else if (room(cur.item, side)) e = play(grade("exalt", t), [SIDE_OMEN.exalt[side]]);
      else return fail("枠が足りない (狙いが多すぎる)");
    } else if (t.method === "desecrate") {
      const desec = allMods(cur.item).find((m) => m.desecrated && !m.unrevealed && !isGood(m));
      // 狙いと同じ系統の外れ (カオスで付いた低い段の混沌耐性など) があると、冒涜の候補にその系統が出ず回り続ける。先にその側を消す
      const fams = new Set(membersOf(t).map((x) => mod(x.modId).family));
      const sameFamily = allMods(cur.item).find((m) => !m.fractured && !m.unrevealed && !m.desecrated && !isGood(m) && fams.has(data.mods.get(m.modId)?.family ?? ""));
      if (desec) e = play("annul", ["OmenofLight"]);
      else if (sameFamily) e = annulOn(sameFamily.side);
      else if (!room(cur.item, side)) {
        if (junkOn(cur.item, side).length) e = annulOn(side);
        else return fail("冒涜する枠が足りない");
      } else e = play(boneFor(t), [SIDE_OMEN.necro[side]]);
    } else if (t.method === "essence") {
      const key = `essence:perfect:${t.modId}`;
      if (!ESS[key]) return fail("このエッセンスはマジックにしか使えない (レアになった後は付けられない)");
      const js = junkOn(cur.item, "prefix").length ? "prefix" : junkOn(cur.item, "suffix").length ? "suffix" : null;
      e = play(key, js ? [SIDE_OMEN.crystal[js]] : []);
    }
    if (e) return fail(e);
  }
  return fail(`手が多すぎる (${max.toLocaleString()} 手を超えた)`);


  
  /** その側に付けられる一番安いパーフェクトエッセンス (同じ系統が付いている物・値段の無い物は除く) */
  function cheapestPerfectEssence(sd: StageSide): string | null {
    const ids = cur.item.cls.pools.essence[sd === "prefix" ? "prefixes" : "suffixes"] ?? [];
    const taken = new Set(allMods(cur.item).map((m) => m.family));
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

/** 何百回も回してまとめる (画面に手を返しながら) */
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

/**
 * 変成・増強・高貴の強さ (無印・上級・完全) ごとに、MOD の無いアイテム (変成は白・増強はマジック・高貴はレア、差したルーンはそのまま) に 1 回打った時、
 * 狙いのどれか (その段以上) が付く割合。変成は両側、増強・高貴は狙いの側の候補の中で (2026-10-20 手 3: 前は modTierWeight と CURRENCY_FLOOR を自分で組んでいた)
 */
export function strengthOdds(data: RecipeSpec["data"], item: StageItem, base: "exalt" | "transmute" | "augment", side: StageSide, targets: ReadonlyArray<{ modId: string; minTierIndex: number }>): Array<{ key: string; p: number }> {
  const rarity: StageItem["rarity"] = base === "transmute" ? "normal" : base === "augment" ? "magic" : "rare";
  const empty: StageItem = { ...item, rarity, prefixes: [], suffixes: [] };
  return [base, `${base}_greater`, `${base}_perfect`].map((key) => {
    const o = addOddsBySpec(data, empty, key, []);
    const cands = (o?.cands ?? []).filter((c) => base === "transmute" || c.side === side);
    return { key, p: hitShare(cands, targets) };
  });
}
