/**
 * solve.mjs — 完成から逆に最適解を解く (S-177)。形 (stateKey) ごとに、エンジンで打てる手を全部打って行き先と確率を数え、完成を 0 に置いて残りの少ない形から
 * 「一番良い手」を決める。同じ形へ戻る手があるので動かなくなるまで繰り返す (確率的最短路の価値反復)。目標は 3 本: cost (1 個の費用)・steps (手数)・budget (予算内の完成率)。
 * 形はまとめた物で見本も偏るので見積もりは信じない: 答えの手順を本物のアイテムで回す → 通った形のアイテムで引き直す → 解き直す、を繰り返し、本物の数字が一番良い手順を残す (opt.evaluate)。
 */
import { aimCount, allowedHand, compileAims, matchesAim, omenClash, stateKey, targetsDone } from "./recipe.mjs";
import { nameOf } from "./prices.mjs";
import { revealChoice } from "./runner.mjs";

/** 形に持てない手: 予見 (次の結果が見える) */
const CANT_MODEL = ["hinekora"];
const MAX_OMENS = 3;
/** 買い直せない品が行き止まりになった時の重さ (神)。無限大にすると、低い確率で行き止まりに入る手が全部使えなくなる */
const GIVE_UP = 100000;

const omenSets = (list) => {
  const out = [[]];
  for (const o of list) for (const s of [...out]) if (s.length < MAX_OMENS) out.push([...s, o]);
  return out;
};

/** 試す手の一覧: 値段があり、ノーマル・マジック・レアのどれかに打てる手を全部 (S-177) */
function actionsOf(M, data, r, price, cls, item, rng) {
  const K = M.PRICE_KEYS;
  const deny = new Set([...CANT_MODEL, ...(r.solve?.deny ?? [])]);
  const aimIds = Object.values(r.aims).flatMap((a) => a.mods.map((m) => (typeof m === "string" ? m : m.id)));
  const tags = new Set(aimIds.flatMap((id) => data.mods.get(id)?.tags ?? []));
  const all = [...Object.keys(K.currency), "desecrate", "desecrate_ancient", "desecrate_gnawed", "desecrate_altered", ...Object.keys(M.ESSENCE_KEYS), ...Object.keys(M.RUNES).map((n) => `rune:${n}`), ...(r.solve?.allow ?? [])];
  const magic = M.applyCurrency(data, item, "transmute", rng).item, rare = M.applyCurrency(data, item, "alchemy", rng).item;
  // 始めが固定 1 つのレアだと打てない手 (カオスなど) もあるので、MOD を足したレアでも見る
  let full = rare;
  for (let i = 0; i < 3; i++) { const x = M.applyCurrency(data, full, "exalt", rng); if (x.applied) full = x.item; }
  const probes = [item, magic, rare, full, { ...full, sockets: 2 }];
  const dropped = { denied: [...deny], notOnShelf: [], noPrice: [], omenNoPrice: [], catalystNoAimTag: [], essenceNoAim: [] };
  const keys = [];
  for (const k of new Set(all)) {
    if (deny.has(k) || !nameOf(M, k, cls)) continue;
    if (!allowedHand(M, k, cls)) { dropped.notOnShelf.push(k); continue; }
    if (!probes.some((p) => !M.useReason(data, p, k, []))) continue;
    if (price(k) == null) { dropped.noPrice.push(k); continue; }
    // 狙いのタグに効かないカタリストは外れを伸ばすだけ
    // 完成の品質に種類が決まっていれば、ほかの種類に替える手は完成から離れるだけ
    const catTag = /^j?catalyst_/.test(k) ? k.replace(/^j?catalyst_/, "") : null;
    if (catTag && (r.goalQuality?.tag ? catTag !== r.goalQuality.tag : !tags.has(catTag))) { dropped.catalystNoAimTag.push(k); continue; }
    keys.push(k);
  }
  // 狙いの MOD を付けないエッセンスはレアにする手としてしか効かないので、安い順に 3 つだけ残す
  const essences = keys.filter((k) => k.startsWith("essence:") && !aimIds.some((id) => k.endsWith(`:${id}`))).sort((a, b) => price(a) - price(b));
  for (const k of essences.slice(3)) { keys.splice(keys.indexOf(k), 1); dropped.essenceNoAim.push(k); }
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
  const q40 = r.goalQuality;
  const qualityShort = (it) => (q40 && !(it.quality >= q40.min && (!q40.tag || it.qualityTag === q40.tag)) ? 1 : 0);
  const remOf = (it) => goalTotal + qualityShort(it) - Object.entries(r.goal).reduce((a, [k, v]) => a + Math.min(v, aimCount(M, aims[k], it)), 0);
  const states = new Map();
  const reach = (item) => {
    const key = stateKey(M, data, aims, item);
    let s = states.get(key);
    if (!s) {
      s = { key, reps: [], done: targetsDone(M, aims, r.goal, item, r.goalQuality), acts: [], rem: remOf(item) };
      states.set(key, s);
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

  /**
   * その手で狙いが付く確率をエミュの確率表 (heldOdds) から取る (1 回で 1 つ足す手だけ)。
   * 狙いの当たりは薄くて打って数えると見えないので、当たりは表の確率で、外れだけを打って数える
   */
  const hitCache = new Map();
  const hitsOf = (s, a) => {
    if (!/^(exalt|chaos|transmute|augment|regal)/.test(a.use)) return [];
    const k = `${s.key}#${a.use}#${a.omens.join()}`;
    if (!hitCache.has(k)) hitCache.set(k, hitsNow(s.reps[0], a));
    return hitCache.get(k);
  };
  const hitsNow = (item, a) => {
    const h = M.heldOdds(data, item, a.use, a.omens);
    if (!h?.single || !(h.total > 0)) return [];
    const out = [];
    for (const [id, x] of h.byMod) {
      const need = Object.values(aims).filter((g) => !g.fractured).flatMap((g) => g.targets).filter((t) => t.modId === id);
      if (!need.length) continue;
      const lo = Math.min(...need.map((t) => t.minTierIndex));
      for (const t of x.tiers) if (t.index >= lo) out.push({ id, index: t.index, rank: `T${M.tierRankOf(data, id, t.index)}`, p: t.w / h.total });
    }
    return out;
  };
  /** その形でその手を samples 回打って行き先を数える */
  const sample = (s, a, samples) => {
    const to = new Map(), used = new Set();
    let money = 0, n = 0;
    const hits = samples > 4 ? hitsOf(s, a) : [];
    const pHit = hits.reduce((x, h) => x + h.p, 0);
    const isHit = (res) => hits.some((h) => (res.added ?? []).some((m) => m.modId === h.id && m.tierIndex === h.index));
    const hitTo = new Map();
    for (const h of hits) {
      let got = 0;
      const here = new Map();
      for (let i = 0; i < Math.min(s.reps.length, 3); i++) {
        const res = M.applyCurrency(data, s.reps[i], a.use, M.mulberry32(Math.floor(rng() * 2 ** 32)), a.omens, { pick: [{ mod: h.id, tier: h.rank }] });
        applies++;
        if (!res.applied || !isHit(res)) continue;
        got++;
        for (const o of res.omensUsed ?? []) used.add(o);
        const next = reach(res.item);
        here.set(next, (here.get(next) ?? 0) + 1);
      }
      for (const [t, k] of here) hitTo.set(t, (hitTo.get(t) ?? 0) + h.p * k / got);
    }
    const pSeen = [...hitTo.values()].reduce((x, y) => x + y, 0);
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
      if (isHit(res)) continue; // 当たりは上で表の確率から入れた
      const next = reach(res.item);
      to.set(next, (to.get(next) ?? 0) + 1);
    }
    if (!n) return null;
    const m = money / n;
    const miss = [...to.values()].reduce((x, y) => x + y, 0);
    const rest = 1 - pSeen;
    const dist = new Map([...to].map(([t, k]) => [t, rest * k / (miss || 1)]));
    for (const [t, p] of hitTo) dist.set(t, (dist.get(t) ?? 0) + p);
    const total = [...dist.values()].reduce((x, y) => x + y, 0);
    return { ...a, m, c: objective === "steps" ? 1 + m * 1e-6 : m + lambda + 1e-9, to: [...dist].map(([t, p]) => [t, p / total]), n, used, exact: pHit };
  };
  /**
   * 定説の始め (S-178、問題の solve.opening): フラクチャーのスタートは 4 MOD まで高貴で埋めてから、狙いが 1 つ付くまでカオスだけ。
   * 固定の狙いは数えない。この間は比べない
   */
  const openingHands = (item) => {
    if (!r.solve?.opening) return null;
    const all = [...item.prefixes, ...item.suffixes];
    const hit = all.some((m) => !m.fractured && Object.values(aims).some((a) => matchesAim(M, a, m)));
    if (hit) return null;
    return all.length < 4 ? actions.filter((a) => a.use === "exalt" && !a.omens.length) : actions.filter((a) => a.use === "chaos" && !a.omens.length);
  };
  const expand = (s) => {
    s.acts = [];
    s.open = true;
    const fixed = openingHands(s.reps[0]);
    for (const a of fixed ?? actions) {
      if (M.useReason(data, s.reps[0], a.use === "reveal" ? "reveal:1" : a.use, a.omens)) continue;
      // 下見: 効かないお告げの組はここで落とす
      if (a.omens.length) { const look = sample(s, a, 4); if (!look || a.omens.some((o) => !look.used.has(o))) continue; }
      let x = sample(s, a, fixed ? Math.max(400, opt.samples) : opt.samples); // 定説の区間は手が 1 つで当たりが薄いので多めに
      // 全部同じ形でも確率の低い当たりを捨てないように、もう少し引いて決める
      if (x?.to.length === 1 && x.to[0][0] === s) x = sample(s, a, opt.samples * 6);
      if (!x || (x.to.length === 1 && x.to[0][0] === s)) continue;
      if (a.omens.some((o) => !x.used.has(o))) continue; // 効かなかったお告げの組は、掛けない組と同じ
      s.acts.push(x);
    }
  };
  let truncated = 0, opened = 0;

  // 保存の形とフラクチャーの品は買い直せない (代金を数えないだけで、タダで何度でも手に入る品ではない)
  const noRestart = !!r.start?.save || !!r.solve?.opening || !!r.solve?.noRestart;
  const restartCost = noRestart ? GIVE_UP : objective === "steps" ? 1 : (r.basePrice ?? 0) + lambda + 1e-9;
  let V = new Map(), sweeps = [];
  const q = (s, a) => {
    let self = 0, rest = a.c;
    for (const [t, p] of a.to) { if (t === s) self += p; else rest += p * V.get(t); }
    return self < 1 ? rest / (1 - self) : Infinity;
  };
  /** 残りの少ない形から順に解く。s.settled = 最善手が最後に変わった周 */
  const iterate = (tol = 1e-6, cap = 5000) => {
    const list = [...states.values()].filter((s) => !s.done && s.open).sort((a, b) => a.rem - b.rem);
    // 前の値から続ける (開くたびに 0 から解き直すと形の数 × 周で重い)
    // 開いていない形の値 = 残りの数 × 目安 (opt.h 神)。0 だと開き尽くすまで終わらない
    for (const s of states.values()) if (!V.has(s)) V.set(s, s.done ? 0 : s.rem * (opt.h ?? 0));
    sweeps = [];
    for (let it = 1; it <= cap; it++) {
      let changed = 0, delta = 0;
      for (const s of list) {
        let best = noRestart ? GIVE_UP : roots.has(s) ? Infinity : restartCost + V.get(start), pick = null;
        for (const a of s.acts) { const v = q(s, a); if (v < best) { best = v; pick = a; } }
        const d = Math.abs(best - V.get(s));
        delta = Math.max(delta, d);
        if (d > 1e-6 * Math.max(1, best)) changed++;
        if (pick !== s.best) s.settled = it;
        V.set(s, best);
        s.best = pick;
      }
      sweeps.push({ i: it, changed, start: Number.isFinite(V.get(start)) ? +V.get(start).toFixed(4) : null });
      if (delta < tol || !(V.get(start) < 1e12)) break;
    }
  };
  /** 今の答えで通る形 */
  const onPath = () => {
    const seen = new Set(roots), st = [...roots];
    while (st.length) for (const [t] of st.pop().best?.to ?? []) if (!t.done && !seen.has(t)) { seen.add(t); st.push(t); }
    return [...seen];
  };
  // 開くのは今の答えが通る形だけ (LAO*): 開いていない形の値は 0 = 楽観なので、良さそうなら答えが通って開かれ、悪い枝は開かれない
  const late = () => Date.now() > (opt.deadline ?? Infinity);
  const solveOpen = () => {
    const limit = opened + opt.maxStates; // 上限は 1 回ごと: 本物で通った形から続けて開く
    for (;;) {
      iterate(1e-3, 200);
      const todo = onPath().filter((s) => !s.done && !s.open);
      if (process.env.AI_TREE_VERBOSE) console.error(`開いた ${opened} 形 ${states.size} 次 ${todo.length} 打 ${applies} 値 ${V.get(start)?.toFixed(3)} 周 ${sweeps.length}`);
      if (process.env.AI_TREE_VERBOSE) console.error([...roots].slice(0, 1).map((s) => `${s.key} 手${s.acts.length} ${s.best?.use}`).join());
      if (!todo.length || late()) { iterate(1e-4, 500); return; }
      if (opened >= limit) { truncated = todo.length; iterate(1e-4, 500); return; }
      for (const s of todo) {
        opened++;
        expand(s);
      }
    }
  };
  const hand = (a) => [nameOf(M, a.use, cls)?.ja ?? "発現", ...a.omens.map((o) => nameOf(M, o, cls)?.ja ?? o)].join(" + ");
  const rest = r;
  const ruleOf = (a, cond) => (a
    ? { if: cond, use: a.use, ...(a.omens.length ? { omens: a.omens } : {}), ...(a.choose ? { choose: a.choose } : {}), note: hand(a) }
    : noRestart ? { if: cond, stop: true, note: "諦め" } : { if: cond, restart: true, note: "作り直し" });
  // 解けた形は全部載せる (見本で通らなかった形も本物では通る)。解いていない形は保存からなら諦め
  const recipeNow = () => {
    const open = [...states.values()].filter((s) => !s.done && s.open && (s.best || !noRestart));
    // 開いていない形に着いた人は、狙いの数が同じ形の手を借りる (通る形を先に)
    const path = onPath(), near = new Map();
    for (const s of [...path, ...open]) { const k = s.key.split("|")[1]; if (s.best && !s.done && !near.has(k)) near.set(k, s.best); }
    return { ...rest, limits: { steps: 3000, ...rest.limits }, rules: [...open.map((s) => ruleOf(s.best, { state: s.key })), ...[...near].map(([k, a]) => ruleOf(a, { shape: k })), noRestart ? { stop: true, note: "解いていない形" } : { restart: true, note: "解いていない形" }] };
  };

  solveOpen();
  let best = null;
  const history = [];
  const offset = objective === "cost" && !r.start?.save ? r.basePrice ?? 0 : 0;
  for (let round = 0; round <= opt.rounds; round++) {
    if (!(V.get(start) < 1e12)) return { recipe: null, info: { reachable: false, states: states.size, dropped } };
    const recipe = recipeNow();
    const real = opt.evaluate(recipe, round);
    history.push({ estimate: +(V.get(start) + offset).toFixed(3), real: real.score == null ? null : +real.score.toFixed(3), doneRate: real.doneRate, onPath: onPath().length });
    if (real.score != null && (!best || real.score < best.score)) best = { score: real.score, recipe, round };
    if (round === opt.rounds || late()) break;
    // 実際に通った形のアイテムで、上位の手を多めに引き直す
    for (const [key, items] of real.visits) {
      items.forEach(reach);
      const s = states.get(key);
      s.reps = items.slice(0, Math.max(opt.reps, items.length));
      if (s.done) continue;
      if (!s.open) { expand(s); continue; }
      const top = [...s.acts].sort((a, b) => q(s, a) - q(s, b)).slice(0, opt.top);
      for (const a of top) {
        const x = sample(s, a, opt.samples * 8);
        if (x) s.acts[s.acts.indexOf(a)] = x;
      }
    }
    solveOpen();
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
      reachable: !!best, objective, states: states.size, opened, truncated, handsTried: hands, actionsListed: actions.length, applies, lambda, bestRound: best?.round,
      history, dropped, ...(budgetInfo ? { budget: budgetInfo } : {}),
    },
    think: thinkOf(states, new Set(onPath()), sweeps, history, q, V, restartCost, start, hand, objective),
  };
}

/** 予算内の完成率を最大にする: 残り予算の帯ごとに逆から解く。手は費用の順位の上位 12 に絞る */
function budgetSolve({ states, start, restartPrice, rest, ruleOf, q }, budget, K) {
  const U = budget / K;
  const list = [...states.values()].filter((s) => !s.done && s.open).sort((a, b) => a.rem - b.rem);
  for (const s of list) {
    s.w = new Float64Array(K + 1);
    s.pick = new Array(K + 1).fill(undefined);
    s.short = [...s.acts].sort((a, b) => q(s, a) - q(s, b)).slice(0, 12);
  }
  const at = (t, x) => {
    if (t.done) return x >= -1e-9 ? 1 : 0;
    if (x < 0 || !t.w) return 0;
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
