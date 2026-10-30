/**
 * runner.mjs — 手順を N 人回す (S-174・S-175)。打つのはエンジンの入口だけ。1 人ごとに種を分けるので、人の番号で同じ道を再現できる。
 * 費用は全部神。始めから作り直すと base をもう 1 個数える
 */
import { costOf } from "../../analysis/_ev-common.mjs";
import { compileAims, graphKey, matchesAim, stateKey, targetsDone, test } from "./recipe.mjs";

const DEFAULT_LIMITS = { steps: 20000, restarts: 100000, budget: 0 };

/** 種 → 1 人ごとの種の列 (乱数は E-82 の mulberry32) */
export function personSeeds(M, seed, n) {
  const rng = M.mulberry32(seed);
  return Array.from({ length: n }, () => Math.floor(rng() * 2 ** 32));
}

/** 手順 + 表から 1 人分を回す関数を作る */
export function makeRunner(M, data, r, price, starts) {
  const aims = compileAims(M, data, r.aims);
  const limits = { ...DEFAULT_LIMITS, ...r.limits };
  const table = new Proxy({}, { get: (_, k) => (k === "divine" ? 1 : k === "base" ? r.basePrice ?? 0 : price(k)) });
  const spentOf = (n) => costOf(n, table);
  const finished = (it) => targetsDone(M, aims, r.goal, it, r.goalQuality);
  // 形で書いた規則 (solve の答え) は引き表で 1 回で引く
  const byState = new Map();
  r.rules.forEach((x, i) => { if (x.if?.state) (byState.get(x.if.state) ?? byState.set(x.if.state, []).get(x.if.state)).push(i); });
  const budget = limits.budget, unit = r.bands?.unit;
  const pickState = (key, spent) => {
    const list = byState.get(key);
    if (!list) return undefined;
    if (!unit) return list[0];
    const b = Math.max(0, Math.floor((budget - spent) / unit));
    return list.find((i) => b >= r.rules[i].if.band[0] && b <= r.rules[i].if.band[1]);
  };
  const plain = r.rules.flatMap((x, i) => (x.if?.state ? [] : [i]));
  const labelOf = (x) => x.note ?? [x.use, ...(x.omens ?? [])].join(" + ");
  const capture = r.capture ?? [];

  /** rec = { hits, captured, graph } に足す。trace = 配列なら 1 手ずつ残す */
  return function runOne(index, seed, rec, trace = null) {
    const rng = M.mulberry32(seed);
    const n = {};
    /** 1 手打って数える。当たり所で弾かれた手 (random) は消費されず null、それ以外の打てない手は止まり */
    const apply = (item, cur, g, omens) => {
      const res = M.applyCurrency(data, item, cur, g, omens);
      if (!res.applied) {
        if (res.random) return null;
        throw new Error(res.reason);
      }
      const key = cur.startsWith("reveal:") ? "reveal" : cur;
      n[key] = (n[key] ?? 0) + 1;
      for (const o of res.omensUsed ?? []) n[o] = (n[o] ?? 0) + 1;
      return res;
    };
    let tryN = {}; // used の条件はこの作り直しの中の個数
    const from = starts(index, rng);
    Object.assign(n, from.n ?? {});
    let it = from.item, steps = 0, restarts = 0;
    const taken = new Set();
    const ctx = { get item() { return it; }, get tryN() { return tryN; }, get steps() { return steps; }, get restarts() { return restarts; }, spent: () => spentOf(n), key: () => stateKey(M, data, aims, it) };
    const box = (k) => (rec.graph[k] ??= { n: 0, moves: {}, ends: {} });
    const here = () => (finished(it) ? "done" : graphKey(M, aims, r.goal, it));
    const edge = (from, label) => { const m = (from.moves[label] ??= {}), to = here(); m[to] = (m[to] ?? 0) + 1; };
    const end = (how, reason) => {
      if (how !== "done") { const b = box(here()); b.ends[how] = (b.ends[how] ?? 0) + 1; }
      return { done: how === "done", how, reason, n, it, steps, restarts };
    };
    for (;;) {
      for (const c of capture) if (!taken.has(c.as) && test(M, aims, c.if, ctx)) {
        taken.add(c.as);
        const list = rec.captured[c.as] ??= [];
        if (list.length < (c.keep ?? 200)) list.push({ item: it, n: { ...n } });
      }
      if (finished(it)) return end("done");
      if (++steps > limits.steps) return end("limit");
      if (limits.budget > 0 && spentOf(n) > limits.budget) return end("budget");
      const at = pickState(ctx.key(), unit ? spentOf(n) : 0) ?? plain.find((i) => test(M, aims, r.rules[i].if, ctx)) ?? -1;
      if (at < 0) return end("stuck", "どの規則にも当たらない");
      const rule = r.rules[at];
      rec.hits[at] = (rec.hits[at] ?? 0) + 1;
      if (rec.visits) {
        const k = ctx.key(), v = rec.visits.get(k) ?? rec.visits.set(k, { n: 0, items: [] }).get(k);
        // 通った形の見本: 満杯の後は順に入れ替える (乱数を使わない)
        if (v.items.length < rec.keep) v.items.push(it);
        else v.items[v.n % rec.keep] = it;
        v.n++;
      }
      const from = box(here());
      from.n++;
      if (rule.stop) return end("stop", rule.note);
      if (rule.restart) {
        if (++restarts > limits.restarts) return end("limit");
        it = starts(index, rng).item;
        n.base = (n.base ?? 0) + 1;
        tryN = {};
        edge(from, labelOf(rule));
        trace?.push({ rule: at, do: "restart" });
        continue;
      }
      try {
        const before = it, was = { ...n };
        if (rule.use === "reveal") {
          const s = Math.floor(rng() * 2 ** 32);
          const key = revealChoice(M, data, aims, it, rule.choose, s, rule.omens ?? []);
          it = apply(it, key, M.mulberry32(s), rule.omens ?? [])?.item ?? it;
        } else it = apply(it, rule.use, rng, rule.omens ?? [])?.item ?? it;
        for (const k of Object.keys(n)) if (n[k] !== was[k]) tryN[k] = (tryN[k] ?? 0) + n[k] - (was[k] ?? 0);
        edge(from, labelOf(rule));
        trace?.push({ rule: at, use: rule.use, omens: rule.omens ?? [], added: diff(it, before), removed: diff(before, it), rarity: it.rarity });
      } catch (e) {
        return end("stuck", `${rule.use}: ${e.message}`);
      }
    }
  };
}

const diff = (a, b) => {
  const had = new Set([...b.prefixes, ...b.suffixes].map((m) => `${m.modId}:${m.tierIndex}`));
  return [...a.prefixes, ...a.suffixes].filter((m) => !had.has(`${m.modId}:${m.tierIndex}`)).map((m) => `${m.tierName} ${m.textJa}`);
};

/** 候補を見て、狙いの順に一番上を選ぶ (無ければ引き直し、それも無ければ 1 番目)。reveal:N の N は 1 始まり */
export function revealChoice(M, data, aims, it, choose, seed, omens) {
  const { first, reroll } = M.revealOffers(data, it, M.mulberry32(seed));
  const find = (list) => {
    for (const name of choose) {
      const i = list.findIndex((m) => matchesAim(M, aims[name], m));
      if (i >= 0) return i;
    }
    return -1;
  };
  const a = find(first);
  if (a >= 0) return `reveal:${a + 1}`;
  if (omens.length && reroll.length) {
    const b = find(reroll);
    return `reveal:${Math.max(b, 0) + 1}:reroll`;
  }
  return "reveal:1";
}

/** 始めの形を作る関数: 手順の start か、保存の形から (保存は人の番号で順に割り振る) */
export function makeStarts(M, data, r, save) {
  if (save) {
    const carry = r.start?.carry !== false;
    return (i) => { const s = save.items[i % save.items.length]; return { item: s.item, n: carry ? s.n : {} }; };
  }
  const spec = { ...r.start };
  delete spec.save; delete spec.carry; delete spec.qualityTag; delete spec.place;
  const tag = r.start?.qualityTag;
  return (_i, rng) => {
    let item = M.startFrom(data, r.base, r.itemLevel ?? 82, spec, Math.floor(rng() * 2 ** 31));
    // 途中の形を組むだけの手 (エッセンスの MOD は普通の指名で置けない)。打つ手の中では断る (S-173)
    for (const id of r.start?.place ?? []) {
      const res = M.applyCurrency(data, item, `force:${id}||e`, rng);
      if (!res.applied) throw new Error(`始めの形に置けない: ${id} ${res.reason}`);
      item = res.item;
    }
    return { item: tag ? { ...item, qualityTag: tag } : item, n: { base: 1 } };
  };
}
