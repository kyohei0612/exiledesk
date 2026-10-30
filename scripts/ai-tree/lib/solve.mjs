/**
 * solve.mjs — 完成から逆に最適解を解く (S-177)。形 (stateKey) ごとに、エンジンで打てる手を全部打って行き先と確率を数え、完成を 0 に置いて残りの少ない形から
 * 「一番良い手」を決める。同じ形へ戻る手があるので動かなくなるまで繰り返す (確率的最短路の価値反復)。目標は 3 本: cost (1 個の費用)・steps (手数)・budget (予算内の完成率)。
 * 形はまとめた物で見本も偏るので見積もりは信じない: 答えの手順を本物のアイテムで回す → 通った形のアイテムで引き直す → 解き直す、を繰り返し、本物の数字が一番良い手順を残す (opt.evaluate)。
 */
import { aimCount, allowedHand, compileAims, omenClash, stateKey, targetsDone } from "./recipe.mjs";
import { nameOf } from "./prices.mjs";
import { revealChoice } from "./runner.mjs";

/** 形に持てない手: 予見 (次の結果が見える) */
const CANT_MODEL = ["hinekora"];
const MAX_OMENS = 3;

const omenSets = (list) => {
  const out = [[]];
  for (const o of list) for (const s of [...out]) if (s.length < MAX_OMENS) out.push([...s, o]);
  return out;
};

/** 試す手の一覧: 値段があり、ノーマル・マジック・レアのどれかに打てる手を全部 (S-177) */
function actionsOf(M, data, r, price, cls, item, rng) {
  const K = M.PRICE_KEYS;
  const deny = new Set([...CANT_MODEL, ...(r.solve?.deny ?? [])]);
  const all = [...Object.keys(K.currency), "desecrate", "desecrate_ancient", "desecrate_gnawed", "desecrate_altered", ...Object.keys(M.ESSENCE_KEYS), ...Object.keys(M.RUNES).map((n) => `rune:${n}`), ...(r.solve?.allow ?? [])];
  const magic = M.applyCurrency(data, item, "transmute", rng).item, rare = M.applyCurrency(data, item, "alchemy", rng).item;
  const probes = [item, magic, rare, { ...rare, sockets: 2 }];
  const dropped = { denied: [...deny], notOnShelf: [], noPrice: [], omenNoPrice: [] };
  const keys = [];
  for (const k of new Set(all)) {
    if (deny.has(k) || !nameOf(M, k, cls)) continue;
    if (!allowedHand(M, k, cls)) { dropped.notOnShelf.push(k); continue; }
    if (!probes.some((p) => !M.useReason(data, p, k, []))) continue;
    if (price(k) == null) { dropped.noPrice.push(k); continue; }
    keys.push(k);
  }
  const actions = keys.flatMap((use) => {
    const omens = M.omensAllowedFor(use).filter((o) => { if (deny.has(o)) return false; if (price(o) == null) { dropped.omenNoPrice.push(o); return false; } return true; });
    return omenSets(omens).filter((set) => !omenClash(M, set)).map((set) => ({ use, omens: set }));
  });
  actions.push(...[[], ["OmenofAbyssalEchoes"]].filter((o) => o.every((x) => price(x) != null)).map((omens) => ({ use: "reveal", omens, choose: Object.keys(r.goal) })));
  dropped.omenNoPrice = [...new Set(dropped.omenNoPrice)];
  return { actions, dropped, hands: keys.length };
}

export function solve(M, data, r, price, cls, starts, opt) {
  const aims = compileAims(M, data, r.aims);
  const rng = M.mulberry32(opt.seed);
  const objective = opt.objective ?? "cost", lambda = opt.lambda ?? 0;
  const goalTotal = Object.values(r.goal).reduce((a, b) => a + b, 0);
  const remOf = (it) => goalTotal - Object.entries(r.goal).reduce((a, [k, v]) => a + Math.min(v, aimCount(M, aims[k], it)), 0);
  const states = new Map();
  const queue = [];
  const reach = (item) => {
    const key = stateKey(M, data, aims, item);
    let s = states.get(key);
    if (!s) {
      s = { key, reps: [], done: targetsDone(M, aims, r.goal, item), acts: [], rem: remOf(item) };
      states.set(key, s);
      if (!s.done) queue.push(s);
    }
    if (s.reps.length < opt.reps) s.reps.push(item);
    return s;
  };
  const first = starts(0, rng).item;
  const start = reach(first);
  // 始めの形は人ごとに違う事がある (保存の形): 全部を答えに載せる
  const roots = new Set([start]);
  for (let i = 1; i < Math.max(opt.reps, opt.startCount ?? 0); i++) roots.add(reach(starts(i, rng).item));
  const { actions, dropped, hands } = actionsOf(M, data, r, price, cls, first, rng);
  let applies = 0;

  /** その形でその手を samples 回打って行き先を数える */
  const sample = (s, a, samples) => {
    const to = new Map(), used = new Set();
    let money = 0, n = 0;
    for (let i = 0; i < samples; i++) {
      const item = s.reps[i % s.reps.length];
      const seed = Math.floor(rng() * 2 ** 32);
      const key = a.use === "reveal" ? revealChoice(M, data, aims, item, a.choose, seed, a.omens) : a.use;
      const res = M.applyCurrency(data, item, key, M.mulberry32(seed), a.omens);
      applies++;
      if (!res.applied) continue;
      n++;
      money += price(a.use);
      for (const o of res.omensUsed ?? []) { money += price(o); used.add(o); }
      const next = reach(res.item);
      to.set(next, (to.get(next) ?? 0) + 1);
    }
    if (!n) return null;
    const m = money / n;
    return { ...a, m, c: objective === "steps" ? 1 + m * 1e-6 : m + lambda + 1e-9, to: [...to].map(([t, k]) => [t, k / n]), n, used };
  };
  const expand = (s) => {
    s.acts = [];
    for (const a of actions) {
      if (M.useReason(data, s.reps[0], a.use === "reveal" ? "reveal:1" : a.use, a.omens)) continue;
      let x = sample(s, a, opt.samples);
      // 全部同じ形でも確率の低い当たりを捨てないように、もう少し引いて決める
      if (x?.to.length === 1 && x.to[0][0] === s) x = sample(s, a, opt.samples * 6);
      if (!x || (x.to.length === 1 && x.to[0][0] === s)) continue;
      if (a.omens.some((o) => !x.used.has(o))) continue; // 効かなかったお告げの組は、掛けない組と同じ
      s.acts.push(x);
    }
  };
  let truncated = 0;
  const drain = () => {
    while (queue.length) {
      const s = queue.shift();
      if (states.size > opt.maxStates) { truncated++; continue; }
      expand(s);
    }
  };

  // 保存の形は買い直せない
  const restartCost = r.start?.save ? Infinity : objective === "steps" ? 1 : (r.basePrice ?? 0) + lambda + 1e-9;
  let V = new Map(), sweeps = [];
  const q = (s, a) => {
    let self = 0, rest = a.c;
    for (const [t, p] of a.to) { if (t === s) self += p; else rest += p * V.get(t); }
    return self < 1 ? rest / (1 - self) : Infinity;
  };
  /** 残りの少ない形から順に解く。s.settled = 最善手が最後に変わった周 */
  const iterate = () => {
    const list = [...states.values()].filter((s) => !s.done).sort((a, b) => a.rem - b.rem);
    V = new Map([...states.values()].map((s) => [s, 0]));
    sweeps = [];
    for (let it = 1; it <= 50000; it++) {
      let changed = 0, delta = 0;
      for (const s of list) {
        let best = roots.has(s) ? Infinity : restartCost + V.get(start), pick = null;
        for (const a of s.acts) { const v = q(s, a); if (v < best) { best = v; pick = a; } }
        const d = Math.abs(best - V.get(s));
        delta = Math.max(delta, d);
        if (d > 1e-6 * Math.max(1, best)) changed++;
        if (pick !== s.best) s.settled = it;
        V.set(s, best);
        s.best = pick;
      }
      sweeps.push({ i: it, changed, start: Number.isFinite(V.get(start)) ? +V.get(start).toFixed(4) : null });
      if (delta < 1e-7 || !(V.get(start) < 1e12)) break;
    }
  };
  /** 今の答えで通る形 */
  const onPath = () => {
    const seen = new Set(roots), st = [...roots];
    while (st.length) for (const [t] of st.pop().best?.to ?? []) if (!t.done && !seen.has(t)) { seen.add(t); st.push(t); }
    return [...seen];
  };
  const hand = (a) => [nameOf(M, a.use, cls)?.ja ?? "発現", ...a.omens.map((o) => nameOf(M, o, cls)?.ja ?? o)].join(" + ");
  const { solve: _drop, ...rest } = r;
  const ruleOf = (a, cond) => (a
    ? { if: cond, use: a.use, ...(a.omens.length ? { omens: a.omens } : {}), ...(a.choose ? { choose: a.choose } : {}), note: hand(a) }
    : { if: cond, restart: true, note: "作り直し" });
  // 解けた形は全部載せる (見本で通らなかった形も本物では通る)。解いていない形は保存からなら諦め
  const recipeNow = () => ({ ...rest, rules: [...states.values()].filter((s) => !s.done && (s.best || !r.start?.save)).map((s) => ruleOf(s.best, { state: s.key })).concat(r.start?.save ? { stop: true, note: "解いていない形" } : { restart: true, note: "解いていない形" }) });

  drain();
  iterate();
  let best = null;
  const history = [];
  const offset = objective === "cost" && !r.start?.save ? r.basePrice ?? 0 : 0;
  for (let round = 0; round <= opt.rounds; round++) {
    if (!(V.get(start) < 1e12)) return { recipe: null, info: { reachable: false, states: states.size, dropped } };
    const recipe = recipeNow();
    const real = opt.evaluate(recipe, round);
    history.push({ estimate: +(V.get(start) + offset).toFixed(3), real: real.score == null ? null : +real.score.toFixed(3), doneRate: real.doneRate, onPath: onPath().length });
    if (real.score != null && (!best || real.score < best.score)) best = { score: real.score, recipe, round };
    if (round === opt.rounds) break;
    // 実際に通った形のアイテムで、上位の手を多めに引き直す
    for (const [key, items] of real.visits) {
      items.forEach(reach);
      const s = states.get(key);
      s.reps = items.slice(0, Math.max(opt.reps, items.length));
      if (s.done) continue;
      if (!s.acts.length) { expand(s); continue; }
      const top = [...s.acts].sort((a, b) => q(s, a) - q(s, b)).slice(0, opt.top);
      for (const a of top) {
        const x = sample(s, a, opt.samples * 8);
        if (x) s.acts[s.acts.indexOf(a)] = x;
      }
    }
    drain();
    iterate();
  }

  let budgetInfo = null;
  if (objective === "budget") {
    const b = budgetSolve({ states, start, restartPrice: r.basePrice ?? 0, rest, ruleOf, q }, opt.budget, opt.bands);
    const real = opt.evaluate(b.recipe, opt.rounds + 1);
    history.push({ estimate: b.estimate, real: real.score == null ? null : +(-real.score).toFixed(3), doneRate: real.doneRate, onPath: b.recipe.rules.length - 1 });
    best = { score: real.score, recipe: b.recipe, round: "budget" };
    budgetInfo = { estimate: b.estimate, bands: opt.bands, topPerState: 12 };
  }

  return {
    recipe: best?.recipe ?? null,
    info: {
      reachable: !!best, objective, states: states.size, truncated, handsTried: hands, actionsListed: actions.length, applies, lambda, bestRound: best?.round,
      history, dropped, ...(budgetInfo ? { budget: budgetInfo } : {}),
    },
    think: thinkOf(states, new Set(onPath()), sweeps, history, q, V, restartCost, start, hand, objective),
  };
}

/** 予算内の完成率を最大にする: 残り予算の帯ごとに逆から解く。手は費用の順位の上位 12 に絞る */
function budgetSolve({ states, start, restartPrice, rest, ruleOf, q }, budget, K) {
  const U = budget / K;
  const list = [...states.values()].filter((s) => !s.done).sort((a, b) => a.rem - b.rem);
  for (const s of list) {
    s.w = new Float64Array(K + 1);
    s.pick = new Array(K + 1).fill(undefined);
    s.short = [...s.acts].sort((a, b) => q(s, a) - q(s, b)).slice(0, 12);
  }
  const at = (t, x) => {
    if (t.done) return x >= -1e-9 ? 1 : 0;
    if (x < 0) return 0;
    const lo = Math.floor(x), f = x - lo;
    return f ? t.w[lo] * (1 - f) + t.w[Math.min(K, lo + 1)] * f : t.w[lo];
  };
  for (let b = 0; b <= K; b++) {
    for (let sweep = 0; sweep < 30; sweep++) {
      let delta = 0;
      for (const s of list) {
        const again = s === start ? 0 : at(start, b - restartPrice / U);
        let best = again, pick = again > 0 ? null : undefined;
        for (const a of s.short) {
          let v = 0;
          for (const [t, p] of a.to) v += p * at(t, b - a.m / U);
          if (v > best + 1e-12) { best = v; pick = a; }
        }
        delta = Math.max(delta, Math.abs(best - s.w[b]));
        s.w[b] = best;
        s.pick[b] = pick;
      }
      if (delta < 1e-6) break;
    }
  }
  const rules = [];
  for (const s of list) {
    let lo = 0;
    for (let b = 1; b <= K + 1; b++) {
      if (b <= K && s.pick[b] === s.pick[lo]) continue;
      const p = s.pick[lo], cond = { state: s.key, band: [lo, b - 1] };
      if (p === undefined) rules.push({ if: cond, stop: true, note: "諦め" });
      else rules.push(ruleOf(p, cond));
      lo = b;
    }
  }
  rules.push({ stop: true, note: "解いていない形" });
  return { estimate: +at(start, K - restartPrice / U).toFixed(4), recipe: { ...rest, bands: { unit: U }, limits: { ...rest.limits, budget }, rules } };
}

const titleOf = (key) => {
  const [rarity, aims, slots, blocked, fixed, quality, flags] = key.split("|");
  return `${{ normal: "ノーマル", magic: "マジック", rare: "レア" }[rarity] ?? rarity} ${aims.replaceAll(":", " ").replaceAll(",", " / ")} [${slots} ${blocked} ${fixed} ${quality}${flags ? ` ${flags}` : ""}]`;
};

/** 考える工程の記録 (think.html が読む): 周ごとの動きと、形ごとの比べた手の順位。形が多い時は通る形 + 段ごとの上位だけ */
function thinkOf(states, path, sweeps, history, q, V, restartCost, start, hand, objective) {
  const all = [...states.values()];
  const tiers = [...new Set(all.map((s) => s.rem))].sort((a, b) => a - b).map((rem) => {
    const xs = all.filter((s) => s.rem === rem && !s.done);
    const vs = xs.map((s) => V.get(s)).filter(Number.isFinite).sort((a, b) => a - b);
    return { rem, states: xs.length, onPath: xs.filter((s) => path.has(s)).length, min: vs[0] ?? null, median: vs[vs.length >> 1] ?? null, max: vs.at(-1) ?? null };
  });
  const keep = new Set(path);
  for (const t of tiers) all.filter((s) => s.rem === t.rem && !s.done).sort((a, b) => V.get(a) - V.get(b)).slice(0, 150).forEach((s) => keep.add(s));
  const shown = [...keep].map((s) => {
    const rows = s.acts.map((a) => ({ hand: hand(a), v: +q(s, a).toFixed(3), m: +a.m.toFixed(4), to: [...a.to].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([t, p]) => [t.done ? "完成" : titleOf(t.key), +p.toFixed(3)]) }));
    if (s !== start) rows.push({ hand: "作り直し", v: +(restartCost + V.get(start)).toFixed(3), m: +restartCost.toFixed(4), to: [[titleOf(start.key), 1]] });
    rows.sort((a, b) => a.v - b.v);
    return { title: titleOf(s.key), key: s.key, rem: s.rem, v: +V.get(s).toFixed(3), settled: s.settled ?? 0, onPath: path.has(s), tried: s.acts.length, top: rows.slice(0, 8) };
  });
  const step = Math.ceil(sweeps.length / 400);
  return { objective, sweeps: sweeps.filter((_, i) => i % step === 0 || i === sweeps.length - 1), history, tiers, states: shown, startKey: start.key };
}
