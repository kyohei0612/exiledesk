/** sim-route.ts から切り出し (2026-09-26): ツリーを回す本体 (simulateTree) と、画面を止めずに小分けで回す simulateTreeChunked */
import { mulberry32 } from "./rng";
import { CERTAIN, type SimCtx, type SimNode, type SimResult, type SimState } from "./sim-route-types";
import { simHelpers } from "./sim-route-helpers";

/**
 * 少しずつ回す (画面が固まらないように。chunk 回ごとに一息つき、進み具合を知らせる)。
 * 乱数の種を chunk ごとに変えて、結果は 1 回で回したのと同じ形にまとめる
 */
export async function simulateTreeChunked(
  inp: Parameters<typeof simulateTree>[0],
  onProgress?: (done: number, total: number) => void,
  chunk = 200,
): Promise<SimResult> {
  const total = inp.runs ?? 4000;
  const parts: SimResult[] = [];
  // 画面を止めないように、12 ミリ秒ごとに手を離す (小分けは 2 回ずつ。helpers は使い回すので小分けでも重くならない)
  const step = Math.min(chunk, 2);
  let t0 = performance.now();
  for (let i = 0; i < total; i += step) {
    parts.push(simulateTree({ ...inp, runs: Math.min(step, total - i), seed: 20260924 + i }));
    if (performance.now() - t0 > 12) {
      onProgress?.(Math.min(total, i + step), total);
      await new Promise((r) => setTimeout(r, 0));
      t0 = performance.now();
    }
  }
  onProgress?.(total, total);
  const runs = parts.reduce((a, p) => a + p.runs, 0);
  const done = parts.flatMap((p) => p.doneCosts).sort((a, b) => a - b);
  const q = (f: number): number => done[Math.min(done.length - 1, Math.floor(done.length * f))] ?? 0;
  const stops = new Map<string, number>();
  for (const p of parts) for (const x of p.stops) stops.set(x.reason, (stops.get(x.reason) ?? 0) + x.p * p.runs);
  return {
    runs,
    pDone: done.length / runs,
    pBudget: inp.budget != null ? done.filter((c) => c <= inp.budget!).length / runs : null,
    expected: done.length ? done.reduce((a, b) => a + b, 0) / done.length : 0,
    perDone: done.length ? parts.reduce((a, p) => a + p.spentAll, 0) / done.length : Infinity,
    spentAll: parts.reduce((a, p) => a + p.spentAll, 0),
    p50: q(0.5), p80: q(0.8), p90: q(0.9),
    perNode: (parts[0]?.perNode ?? []).map((n, i) => ({
      id: n.id,
      tries: parts.reduce((a, p) => a + p.perNode[i]!.tries * p.runs, 0) / runs,
      cost: parts.reduce((a, p) => a + p.perNode[i]!.cost * p.runs, 0) / runs,
    })),
    stops: [...stops].map(([reason, c]) => ({ reason, p: c / runs })).sort((a, b) => b.p - a.p),
    doneCosts: done,
    socketCost: parts[0]?.socketCost ?? 0,
  };
}

/** 回す。手 0 から、○×の行き先をたどる。「完成」で終わり、未設定・打てない所で止まる */
export function simulateTree(inp: {
  ctx: SimCtx; start: SimState; nodes: readonly SimNode[]; runs?: number; budget?: number; maxActions?: number; seed?: number;
  /** 調べ用: 1 回目の各手 (打った手の id と、打った後の指輪) を知らせる */
  trace?: (at: string, s: SimState) => void;
}): SimResult {
  const { ctx, nodes } = inp;
  const h = simHelpers(ctx, nodes);
  const byId = new Map(nodes.map((n, i) => [n.id, i]));
  const runs = inp.runs ?? 4000;
  const maxActions = inp.maxActions ?? 20000;
  const rnd = mulberry32(inp.seed ?? 20260924);
  const costs: number[] = [];
  const doneCosts: number[] = [];
  const stops = new Map<string, number>();
  const tries = nodes.map(() => 0), spent = nodes.map(() => 0);
  // 本線 = 手 1 から○の行き先をたどった並び (輪になったら止める)
  const main: number[] = [];
  let mainEndsDone = false;
  for (let i: number | undefined = nodes.length ? 0 : undefined; i != null && !main.includes(i);) {
    main.push(i);
    const g = nodes[i]!.onHit;
    if (g === "done") { mainEndsDone = true; break; }
    i = g && g !== "auto" ? byId.get(g) : undefined;
  }
  const goalMet = (st: SimState, x: SimNode): boolean =>
    h.targetsMet(st, x) && x.keep.every((id) => (id === "__breach__" ? st.breach : h.has(st, id)));
  /** 狙いのある手 (狙う MOD がある / ブリーチの手)。狙いの無い手 (品質だけ・削減・確認) は順番に打つ手 */
  const hasGoal = (x: SimNode): boolean => x.targets.length > 0 || x.action?.kind === "breach";
  /**
   * 自動の行き先 (上の決まり)。本線を上から見て、揃っていない狙いの手か、狙いの無い手 (順番に打つ手) の先に来る方。
   * 狙いの無い手を「揃っている」と見て飛ばすと、品質の仕上げや削減を抜かしてしまう (2026-09-24 見本のツリーで踏んだ)
   */
  /**
   * 品質の手は、今その種類の品質が入っていれば自動の戻り先にしない (品質は消去・カオスで消えない)。違う種類が入っていれば
   * 入れ直す (種類を替えると 0 から。オーナー 2026-09-24)。前は 1 回打ったら戻らないにしていて、途中で種類を替えた後に
   * 戻ると倍率が効かないままだった
   */
  // その品質の手の次の手 (本線) が狙いのある手で、もう揃っていれば、その品質は要らない (耐性が付いた後に知性用に替えた品質を、
  // 耐性用に戻しに行かない)
  const qualityReady = (st: SimState, pos: number): boolean => {
    const x = nodes[main[pos]!]!;
    if (x.action?.kind !== "quality") return false;
    // その種類で上限まで入っている時だけ (触媒の高貴で使い切った後の 0 は入れ直す)
    if (st.quality != null && st.qualityTag === x.action.catalyst && st.quality >= (ctx.baseQuality ?? 20) + (st.breach ? 20 : 0)) return true;
    const next = main[pos + 1] != null ? nodes[main[pos + 1]!]! : null;
    return !!next && hasGoal(next) && goalMet(st, next);
  };
  /**
   * ブリーチはもう要らないか: 本線の最後の品質の手の種類で、ブリーチ込みの上限まで入っていれば、品質は残るので付け直さない
   * (2026-09-24: 最後の品質の後で外れを消去した時に、ブリーチの手が未完了に見えて付け直しに戻り、満杯の側で止まった)
   */
  // 本線の最後の品質の手を、この回で通った後だけ (途中で同じ種類の品質を入れる手があっても、そこでは要る)
  const lastQualityAt = [...main].reverse().find((i) => nodes[i]!.action?.kind === "quality");
  let finalQualityDone = false;
  const breachDone = (st: SimState): boolean => {
    const a = lastQualityAt != null ? nodes[lastQualityAt]!.action : null;
    return finalQualityDone && a?.kind === "quality" && st.quality != null && st.qualityTag === a.catalyst && st.quality >= (ctx.baseQuality ?? 20) + 20;
  };
  const autoNext = (st: SimState, cur: number): string | "done" | null => {
    const mp = main.findIndex((i, pos) => (!hasGoal(nodes[i]!) && !qualityReady(st, pos))
      || (hasGoal(nodes[i]!) && !goalMet(st, nodes[i]!) && !(nodes[i]!.action?.kind === "breach" && breachDone(st))));
    const m = mp >= 0 ? main[mp] : undefined;
    if (m == null) return mainEndsDone ? "done" : null;
    const target = nodes[m]!;
    // カオスの手へ戻る時は、外せる物が 1 つになるまで今の消去を続けてから (「スパムの狙いが消えたら剥がして最初から」オーナー)。
    // 剥がさずに戻ると外れが居残り、最後に冒涜の枠を塞いでいた (2026-09-24 見本のツリー)
    if (target.action?.kind === "chaos") {
      // 側を決めた消去なら、その側の物だけ数える (反対側の MOD まで数えると剥がし切れず「外せる物が無い」で止まった)
      const ca0 = nodes[cur]!.action;
      const side0 = ca0?.kind === "annul" ? ca0.side : null;
      const removableCount = st.slots.filter((x) => !x.fixed && !x.keep && (!side0 || x.side === side0)).length
        + (st.breach && side0 !== "suffix" ? 1 : 0);
      return removableCount > 1 && ca0?.kind === "annul" ? nodes[cur]!.id : target.id;
    }
    // 外れが残っていれば今の消去を続ける。ただし側を決めた消去なら、その側の外れだけを見る (反対側の外れで打ち続けて
    // 「外せる物が無い」で止まっていた。2026-09-24 自動で組んだツリー)
    const ca = nodes[cur]!.action;
    const annulSide = ca?.kind === "annul" ? ca.side : null;
    const junkHere = st.slots.some((x) => !x.fixed && !x.keep && !x.modId && (!annulSide || x.side === annulSide))
      || (st.breach && (!h.breachKept || h.breachSpent(st)) && annulSide !== "suffix");
    // (今の手が消去の時だけ。光などから自動で戻る時は狙いの手へ。2026-09-24 光に戻り続けて止まっていた)
    if (junkHere && hasGoal(target) && ca?.kind === "annul") return nodes[cur]!.id;
    return target.id;
  };
  const keepCount = inp.start.slots.filter((x) => x.keep).length;
  // ソケットに差す物 (ルーン + 熟練工のオーブ) は 1 回の作成に 1 度、初めに払う。相場に無ければ回さずに止める
  const socketCost = ctx.socketCost ?? 0;
  for (let r = 0; r < runs; r++) {
    finalQualityDone = false;
    let s: SimState = { ...inp.start, slots: inp.start.slots.map((x) => ({ ...x })) };
    let cost = Number.isFinite(socketCost) ? socketCost : 0;
    let at = nodes.length ? 0 : -1;
    let end: string | null = !Number.isFinite(socketCost) ? "ソケットに差す物 (ルーン・熟練工のオーブ) が相場に無い" : nodes.length ? null : "STEP が無い";
    if (end) at = -1;
    for (let k = 0; k < maxActions && at >= 0; k++) {
      const n = nodes[at]!;
      // 飛ばす手: ブリーチが無い時の「ブリーチがある時だけ」の手、本線の品質の手で要らない物 (今その種類が入っている /
      // 次の狙いの手が揃っている。仕上げの後で戻った時に途中の種類へ入れ替えて品質を落としていた)
      const mpos = main.indexOf(at);
      if (((n.onlyWithBreach && !s.breach) || (mpos >= 0 && qualityReady(s, mpos))) && n.onHit) {
        const g = n.onHit === "auto" ? autoNext(s, at) : n.onHit;
        if (g === "done") { end = "done"; break; }
        const j = g ? byId.get(g) : undefined;
        if (j != null && j !== at) { at = j; continue; }
      }
      // 本線の手で、もう揃っていれば飛ばす (カオスでスパムの狙いを付け直した時、前の触媒の高貴のお告げの成功品が残っていれば次へ)
      if (main.includes(at) && hasGoal(n) && goalMet(s, n) && n.onHit) {
        const g = n.onHit === "auto" ? autoNext(s, at) : n.onHit;
        if (g === "done") { end = "done"; break; }
        const j = g ? byId.get(g) : undefined;
        if (j != null && j !== at) { at = j; continue; }
      }
      const why = h.usable(s, n.action);
      // 打てない (枠が無い等) けれど外れがあるなら、先に × の行き先 (消去の手) へ回す (費用は掛からない)。
      // × の行き先が「自動」なら外れが無くても回す (消えた狙いを取り返しに戻る)
      if (why && (h.hasJunk(s) || n.onMiss === "auto") && n.onMiss && n.onMiss !== "done") {
        const g = n.onMiss === "auto" ? autoNext(s, at) : n.onMiss;
        const j = g && g !== "done" ? byId.get(g) : undefined;
        if (j != null && j !== at) { at = j; continue; }
      }
      if (why) { end = `STEP ${at + 1} が打てない: ${why}`; break; }
      const price = h.priceOf(s, n.action!);
      if (!Number.isFinite(price)) { end = `STEP ${at + 1} が相場に無い物を使っている`; break; }
      cost += price; tries[at]! += 1; spent[at]! += price;
      s = h.apply(s, n, rnd);
      if (at === lastQualityAt) finalQualityDone = true;
      if (r === 0) inp.trace?.(n.id, s);
      // 消えたら終わりの MOD (樹 MOD) が消えたら止める
      if (s.slots.filter((x) => x.keep).length < keepCount) { end = `STEP ${at + 1} で消えたら終わりの MOD (樹 MOD など) が消えた`; break; }
      // 本線の手は「それより上の本線の手で揃えた物が全部まだある」ことも○の条件 (残したい MOD は自動。オーナー 2026-09-24:
      // 「残したい MOD とか分からん。ハズレ以外だろ残したいのなんて」)
      const pos = main.indexOf(at);
      // ブリーチの MOD は品質のための一時的な物 (最後に削減で消す) なので、自動で残す物には入れない
      const pass = h.passes(s, n) && (pos < 0 || main.slice(0, pos).every((i) => !nodes[i]!.targets.length || h.targetsMet(s, nodes[i]!)));
      // 確定の手は × が未設定なら○の行き先へ (必ず付くので × は来ない前提)
      let next = pass ? n.onHit : n.onMiss == null && n.action && CERTAIN.has(n.action.kind) ? n.onHit : n.onMiss;
      if (next === "auto") next = autoNext(s, at);
      if (next === "done") { end = "done"; break; }
      if (next == null) { end = `STEP ${at + 1} の${h.passes(s, n) ? "○" : "×"}の行き先が未設定`; break; }
      const j = byId.get(next);
      if (j == null) { end = `STEP ${at + 1} の行き先が無い STEP`; break; }
      at = j;
    }
    if (end == null) end = `STEP の数が上限 (${maxActions}) に届いて止まった`;
    costs.push(cost);
    if (end === "done") doneCosts.push(cost);
    else stops.set(end, (stops.get(end) ?? 0) + 1);
  }
  const sorted = [...doneCosts].sort((a, b) => a - b);
  const q = (f: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))] ?? 0;
  return {
    runs,
    pDone: doneCosts.length / runs,
    pBudget: inp.budget != null ? doneCosts.filter((c) => c <= inp.budget!).length / runs : null,
    expected: doneCosts.length ? doneCosts.reduce((a, b) => a + b, 0) / doneCosts.length : 0,
    perDone: doneCosts.length ? costs.reduce((a, b) => a + b, 0) / doneCosts.length : Infinity,
    spentAll: costs.reduce((a, b) => a + b, 0),
    p50: q(0.5), p80: q(0.8), p90: q(0.9),
    perNode: nodes.map((n, i) => ({ id: n.id, tries: tries[i]! / runs, cost: spent[i]! / runs })),
    stops: [...stops].map(([reason, c]) => ({ reason, p: c / runs })).sort((a, b) => b.p - a.p),
    doneCosts,
    socketCost: Number.isFinite(socketCost) ? socketCost : 0,
  };
}
