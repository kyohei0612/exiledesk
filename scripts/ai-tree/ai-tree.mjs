/**
 * ai-tree.mjs — AI 自動ツリー (仮名、S-170〜S-176)。AI が手順を試して数字で比べる内部の道具。使い方は README.md
 *   node scripts/ai-tree/ai-tree.mjs <hands|pool|odds|check|run|trace|compare|log|play> …
 * 出すのは全部 JSON (run だけ 1 行目の記録 id の下に JSON)
 */
import { bundleEntry } from "../_bundle-ts.mjs";
import { loadMarket, nameOf, priceTable } from "./lib/prices.mjs";
import { hashOf, lint, readRecipe } from "./lib/recipe.mjs";
import { compare, headOf, report } from "./lib/report.mjs";
import { makeRunner, makeStarts, personSeeds } from "./lib/runner.mjs";
import { appendLog, findRun, readLog, readSave, writeSave } from "./lib/store.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const flags = {}, args = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith("--")) flags[rest[i].slice(2)] = rest[i + 1]?.startsWith("--") || rest[i + 1] == null ? true : rest[++i];
  else args.push(rest[i]);
}
const out = (x) => console.log(JSON.stringify(x, null, 1));
const die = (msg) => { console.error(msg); process.exit(1); };
if (!cmd) die("hands | pool | odds | check | run | trace | compare | log | play (README.md)");

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

if (cmd === "hands") {
  // 棚の手と値段 (神)。--q で名前を絞る
  const cls = itemOf().cls, price = priceTable(M, market, cls);
  const K = M.PRICE_KEYS;
  const keys = [...Object.keys(K.currency), ...Object.keys(K.omens), "desecrate", "desecrate_ancient", "desecrate_gnawed", "desecrate_altered", ...Object.keys(M.ESSENCE_KEYS)];
  const q = typeof flags.q === "string" ? flags.q.toLowerCase() : null;
  const rows = keys.map((key) => ({ key, ...nameOf(M, key, cls), price: price(key) ?? null, omens: M.omensAllowedFor(key) }))
    .filter((x) => x.en && (!q || `${x.key} ${x.en} ${x.ja}`.toLowerCase().includes(q)));
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
  const N = Number(flags.n ?? 2000), seed = Number(flags.seed ?? 1);
  const runOne = makeRunner(M, data, r, price, makeStarts(M, data, r, save));
  const rec = { hits: {}, captured: {} };
  const t0 = Date.now();
  const rs = personSeeds(M, seed, N).map((s, i) => runOne(i, s, rec));
  const result = report(rs, price, r, Date.now() - t0);
  result.ruleHits = r.rules.map((x, i) => ({ rule: i, note: x.note ?? x.use ?? (x.restart ? "restart" : "stop"), hits: rec.hits[i] ?? 0 }));
  const row = appendLog({ recipeName: r.name, hash: hashOf(r), people: N, seed, boot: market.path, marketAt: market.at, note: typeof flags.note === "string" ? flags.note : undefined, recipe: r, result });
  for (const [as, items] of Object.entries(rec.captured)) writeSave(as, { from: row.id, items });
  out({ id: row.id, head: headOf(result), hash: row.hash, seed, warns, saved: Object.fromEntries(Object.entries(rec.captured).map(([k, v]) => [k, v.length])), ...result });
} else if (cmd === "trace") {
  // 1 人の道を再現して見せる (S-172: 頼んだ時だけ)
  const { r, save, price } = mustRun(args[0]);
  const person = Number(flags.person ?? 0), seed = Number(flags.seed ?? 1);
  const runOne = makeRunner(M, data, r, price, makeStarts(M, data, r, save));
  const trace = [];
  const x = runOne(person, personSeeds(M, seed, person + 1)[person], { hits: {}, captured: {} }, trace);
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
    if (key?.startsWith("reveal:") || !nameOf(M, key, slot.item.cls)) die(`棚に無い手 ${key} (S-173)`);
    const rng = M.mulberry32((Number(flags.seed ?? s.seed) * 7919 + s.step) >>> 0);
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
