/**
 * ai-tree.mjs — AI 自動ツリー (仮名、S-170〜S-176)。AI が手順を試して数字で比べる内部の道具。使い方は README.md
 *   node scripts/ai-tree/ai-tree.mjs <hands|pool|odds|check|run|trace|compare|log|play> …
 * 出すのは全部 JSON
 */
import { bundleEntry } from "../_bundle-ts.mjs";
import { loadMarket, nameOf, priceTable } from "./lib/prices.mjs";
import { allowedHand, hashOf, lint, readRecipe } from "./lib/recipe.mjs";
import { compare, headOf, report } from "./lib/report.mjs";
import { makeRunner, makeStarts, personSeeds } from "./lib/runner.mjs";
import { solve } from "./lib/solve.mjs";
import { appendLog, findRun, readLog, readSave, writeSave, writeSolved, writeThink } from "./lib/store.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const flags = {}, args = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith("--")) flags[rest[i].slice(2)] = rest[i + 1]?.startsWith("--") || rest[i + 1] == null ? true : rest[++i];
  else args.push(rest[i]);
}
const out = (x) => console.log(JSON.stringify(x, null, 1));
const die = (msg) => { console.error(msg); process.exit(1); };
if (!cmd) die("hands | pool | odds | check | run | solve | trace | compare | log | play (README.md)");

const M = await bundleEntry("scripts/ai-tree/_entry.ts");
const data = M.loadPatch();
const market = loadMarket(flags.boot);
const list = (s) => (typeof s === "string" && s ? s.split(",") : []);

/** --from <保存> か --base <名前> [--ilvl 82] のアイテム */
function itemOf() {
  if (flags.from) return readSave(flags.from).items[Number(flags.index ?? 0)].item;
  if (!flags.base) die("--base か --from が要る");
  return M.startFrom(data, flags.base, Number(flags.ilvl ?? 82), {}, 1);
}

function loadRun(path) {
  const r = readRecipe(path);
  const save = r.start?.save ? readSave(r.start.save) : null;
  const cls = (save?.items[0].item ?? M.startFrom(data, r.base, r.itemLevel ?? 82, {}, 1)).cls;
  const price = priceTable(M, market, cls, r.prices);
  const { errs, warns } = lint(M, data, r, price, cls);
  return { r, save, price, errs, warns };
}
function mustRun(path) {
  const x = loadRun(path);
  if (x.errs.length) die(`手順を断った:\n- ${x.errs.join("\n- ")}`);
  return x;
}

/** 手順を N 人回して記録に足す */
function runRecipe(r, save, price, note, seed = Number(flags.seed ?? 1), extra = {}) {
  const N = Number(flags.n ?? 2000);
  const runOne = makeRunner(M, data, r, price, makeStarts(M, data, r, save));
  const rec = { hits: {}, captured: {}, graph: {} };
  const t0 = Date.now();
  const rs = personSeeds(M, seed, N).map((s, i) => runOne(i, s, rec));
  const result = report(rs, price, r, Date.now() - t0);
  result.ruleHits = r.rules.map((x, i) => ({ rule: i, note: x.note ?? x.use ?? (x.restart ? "restart" : "stop"), hits: rec.hits[i] ?? 0 })).sort((a, b) => b.hits - a.hits).slice(0, 30);
  const row = appendLog({ recipeName: r.name, hash: hashOf(r), people: N, seed, boot: market.path, marketAt: market.at, note, recipe: r.rules.length > 1000 ? { ...r, rules: [`${r.rules.length} 本は solved/ に`] } : r, result, graph: rec.graph, ...extra });
  for (const [as, items] of Object.entries(rec.captured)) writeSave(as, { from: row.id, items });
  return { id: row.id, head: headOf(result), hash: row.hash, seed, saved: Object.fromEntries(Object.entries(rec.captured).map(([k, v]) => [k, v.length])), ...result };
}

if (cmd === "hands") {
  // 棚の手と値段 (神)。--q で名前を絞る
  const cls = itemOf().cls, price = priceTable(M, market, cls);
  const K = M.PRICE_KEYS;
  const keys = [...Object.keys(K.currency), ...Object.keys(K.omens), "desecrate", "desecrate_ancient", "desecrate_gnawed", "desecrate_altered", ...Object.keys(M.ESSENCE_KEYS)];
  const q = typeof flags.q === "string" ? flags.q.toLowerCase() : null;
  const rows = keys.map((key) => ({ key, ...nameOf(M, key, cls), price: price(key) ?? null, omens: M.omensAllowedFor(key) }))
    .filter((x) => x.en && (M.PRICE_KEYS.omens[x.key] || allowedHand(M, x.key, cls)) && (!q || `${x.key} ${x.en} ${x.ja}`.toLowerCase().includes(q)));
  out(rows.map(({ omens, ...x }) => (flags.omens ? { ...x, omens } : x)));
} else if (cmd === "pool") {
  // エミュの MOD 一覧と同じ (段の重みまで)
  const rows = M.modListFor(data, itemOf()).filter((x) => !flags.side || x.side === flags.side).filter((x) => !flags.group || x.group === flags.group);
  out(rows.map((x) => ({ id: x.id, side: x.side, group: x.group, text: x.text, weight: x.weight, tags: x.tags, tiers: x.tiers.map((t) => [t.rank, t.ilvl, t.weight, t.text]) })));
} else if (cmd === "odds") {
  // エミュの「持った時の %」と同じ
  if (!flags.use) die("--use が要る");
  const it = itemOf(), omens = list(flags.omens);
  const reason = M.useReason(data, it, flags.use, omens);
  const h = M.heldOdds(data, it, flags.use, omens);
  out({ reason, odds: h && [...h.byMod].map(([id, x]) => ({ id, pct: Math.round(1e4 * x.w / h.total) / 100, tiers: x.tiers.map((t) => [M.tierRankOf(data, id, t.index), Math.round(1e4 * t.w / h.total) / 100]) })).sort((a, b) => b.pct - a.pct) });
} else if (cmd === "check") {
  const { errs, warns, r } = loadRun(args[0]);
  out({ ok: !errs.length, hash: hashOf(r), errs, warns });
  process.exit(errs.length ? 1 : 0);
} else if (cmd === "run") {
  const { r, save, price, warns } = mustRun(args[0]);
  out({ warns, ...runRecipe(r, save, price, typeof flags.note === "string" ? flags.note : undefined) });
} else if (cmd === "solve") {
  // 問題 (aims・goal) から最適な手順を解いて、本物のアイテムで回して確かめる (S-177)
  const r = readRecipe(args[0]);
  const save = r.start?.save ? readSave(r.start.save) : null;
  const cls = (save?.items[0].item ?? M.startFrom(data, r.base, r.itemLevel ?? 82, {}, 1)).cls;
  const price = priceTable(M, market, cls, r.prices);
  const { errs } = lint(M, data, { ...r, rules: [{ use: "chaos" }] }, (k) => price(k) ?? 0, cls);
  if (!(r.basePrice > 0) && !flags["free-base"]) errs.push("solve は basePrice (神、0 より大きい) が要る: タダだと作り直しを繰り返す答えになる。わざとなら --free-base");
  if (errs.length) die(`問題を断った:\n- ${errs.join("\n- ")}`);
  const num = (k, d) => Number(flags[k] ?? d);
  const t0 = Date.now();
  const starts = makeStarts(M, data, r, save), lambda = num("lambda", 0), seed0 = num("seed", 1), trial = num("trial", 800);
  const objective = typeof flags.objective === "string" ? flags.objective : "cost", budget = num("budget", 0);
  if (!["cost", "steps", "budget"].includes(objective)) die("--objective は cost / steps / budget");
  if (objective === "budget" && !(budget > 0)) die("--objective budget は --budget <神> が要る");
  // 本物のアイテムで回した点数 (小さいほど良い)。cost = 1 個の費用 + 手数 × lambda、steps = 手数、budget = 予算内の完成率の負
  const evaluate = (recipe, round) => {
    const runOne = makeRunner(M, data, recipe, price, starts);
    const rec = { hits: {}, captured: {}, graph: {}, visits: new Map(), keep: 24 };
    const rs = personSeeds(M, seed0 * 1000 + round, trial).map((s, i) => runOne(i, s, rec));
    const x = report(rs, price, recipe, 0);
    const score = objective === "budget" ? -(x.withinBudget ?? x.doneRate) : x.costPerItem == null ? null : objective === "steps" ? x.steps.perItem : x.costPerItem + lambda * x.steps.perItem;
    return { score, doneRate: x.doneRate, visits: new Map([...rec.visits].map(([k, v]) => [k, v.items])) };
  };
  const { recipe, info, think } = solve(M, data, r, price, cls, starts, { seed: seed0, samples: num("samples", 12), reps: num("reps", 6), maxStates: num("max-states", 6000), rounds: num("rounds", 6), top: num("top", 6), lambda, objective, budget, bands: num("bands", 40), startCount: save?.items.length, evaluate });
  if (!recipe) die(`届かない: ${JSON.stringify(info)}`);
  const name = `${r.name}-${objective}${objective === "budget" ? budget : ""}${info.lambda ? `-l${info.lambda}` : ""}`;
  const solved = { ...recipe, name };
  const path = writeSolved(name, solved);
  const { errs: bad } = lint(M, data, solved, price, cls);
  if (bad.length) die(`解いた手順を断った:\n- ${bad.join("\n- ")}`);
  // 選ぶのに使わなかった種で確かめる
  writeThink(name, think);
  const res = runRecipe(solved, save, price, `solve ${objective}`, seed0 + 7777, { think: name });
  // 計算とのずれ: 見積もりと、選ぶのに使わなかった種の実測
  const estimate = info.history.at(-1).estimate, realNow = objective === "cost" ? res.costPerItem : objective === "steps" ? res.steps.perItem : res.withinBudget;
  out({ solved: path, solve: info, gap: { estimate, real: realNow, off: realNow ? +((realNow - estimate) / realNow).toFixed(3) : null }, ...res, solveMs: Date.now() - t0 });
} else if (cmd === "trace") {
  // 1 人の道を再現して見せる (S-172: 頼んだ時だけ)
  const { r, save, price } = mustRun(args[0]);
  const person = Number(flags.person ?? 0), seed = Number(flags.seed ?? 1);
  const runOne = makeRunner(M, data, r, price, makeStarts(M, data, r, save));
  const trace = [];
  const x = runOne(person, personSeeds(M, seed, person + 1)[person], { hits: {}, captured: {}, graph: {} }, trace);
  out({ how: x.how, reason: x.reason, steps: x.steps, restarts: x.restarts, item: { rarity: x.it.rarity, mods: [...x.it.prefixes, ...x.it.suffixes].map((m) => `${m.tierName} ${m.textJa}`) }, trace: trace.slice(-Number(flags.tail ?? 200)) });
} else if (cmd === "compare") {
  if (args.length !== 2) die("compare <記録 id> <記録 id>");
  const [a, b] = args.map(findRun);
  const sameTerms = a.boot === b.boot && a.people === b.people;
  out({ a: { id: a.id, name: a.recipeName, head: headOf(a.result) }, b: { id: b.id, name: b.recipeName, head: headOf(b.result) }, sameTerms, ...compare(a.result, b.result) });
} else if (cmd === "log") {
  const tail = Number(flags.tail ?? 20);
  out(readLog().filter((x) => !flags.name || x.recipeName === flags.name).slice(-tail).map((x) => ({ id: x.id, at: x.at, name: x.recipeName, hash: x.hash, people: x.people, seed: x.seed, note: x.note, head: headOf(x.result) })));
} else if (cmd === "play") {
  play(args[0]);
} else die(`知らないコマンド ${cmd}`);

/** 1 手ずつ打つ (エミュを手で触るのと同じ)。new → use … → show。--as で別の名前に写して枝分かれ */
function play(sub) {
  const name = args[1];
  const view = (s) => {
    const it = s.items[0].item;
    return { name: s.name ?? name, rarity: it.rarity, quality: it.quality, itemLevel: it.itemLevel, step: s.step, spent: s.spent, mods: [...it.prefixes, ...it.suffixes].map((m) => ({ side: m.side, id: m.modId, tier: m.tierName, text: m.textJa, fractured: !!m.fractured || undefined, unrevealed: !!m.unrevealed || undefined })) };
  };
  if (sub === "new") {
    if (!flags.base) die("--base が要る");
    const seed = Number(flags.seed ?? 1);
    const item = M.startFrom(data, flags.base, Number(flags.ilvl ?? 82), {}, seed);
    const s = { seed, step: 0, spent: 0, items: [{ item, n: {} }] };
    writeSave(name, s);
    out(view(s));
  } else if (sub === "show") {
    out(view(readSave(name)));
  } else if (sub === "use") {
    const s = readSave(name), key = args[2], omens = list(flags.omens), slot = s.items[0];
    if (key?.startsWith("reveal:") || !allowedHand(M, key, slot.item.cls)) die(`棚に無い手 ${key} (S-173)`);
    const rng = M.mulberry32((s.seed * 7919 + s.step) >>> 0);
    const res = M.applyCurrency(data, slot.item, key, rng, omens);
    if (!res.applied) die(`打てない: ${res.reason}`);
    const price = priceTable(M, market, slot.item.cls);
    const used = [key, ...(res.omensUsed ?? [])];
    const missing = used.filter((k) => price(k) == null);
    if (missing.length) die(`値段が無い: ${missing.join(", ")}`);
    for (const k of used) slot.n[k] = (slot.n[k] ?? 0) + 1;
    const next = { ...s, step: s.step + 1, spent: s.spent + used.reduce((a, k) => a + price(k), 0), items: [{ item: res.item, n: slot.n }] };
    delete next.name;
    writeSave(typeof flags.as === "string" ? flags.as : name, next);
    out(view(next));
  } else die("play new <名前> --base … | play use <名前> <手> [--omens a,b] [--as 別の名前] | play show <名前>");
}
