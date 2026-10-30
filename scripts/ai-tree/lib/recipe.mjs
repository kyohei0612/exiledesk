/**
 * recipe.mjs — 手順 (schema ai-tree/1) の読み・断り・条件の判定 (S-173・S-174)。形の説明は ../README.md
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import { nameOf } from "./prices.mjs";

const NUM_LEAVES = ["aim", "mods", "open", "junk", "fractured", "unrevealed", "quality", "used", "spent", "steps", "restarts"];
const SIDE_LEAVES = ["mods", "open", "junk", "fractured", "unrevealed"];
const SIDE = new Set(["prefix", "suffix", "any"]);
const RARITY = new Set(["normal", "magic", "rare"]);
const RULE_KEYS = new Set(["if", "use", "omens", "choose", "restart", "stop", "note"]);
const TOP_KEYS = new Set(["schema", "name", "base", "itemLevel", "basePrice", "start", "aims", "goal", "rules", "capture", "limits", "prices", "note"]);

export const hashOf = (recipe) => createHash("sha256").update(JSON.stringify(recipe)).digest("hex").slice(0, 12);

export function readRecipe(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

/** 手として打ってよいか (棚にある手と発現だけ、S-173) */
export function allowedHand(M, key, cls) {
  if (key === "reveal") return true;
  return !!nameOf(M, key, cls);
}

function checkCond(c, aims, where, errs) {
  if (c == null) return;
  if (typeof c !== "object") { errs.push(`${where}: 条件が形になっていない`); return; }
  for (const k of ["all", "any"]) if (k in c) { if (!Array.isArray(c[k])) errs.push(`${where}: ${k} は配列`); else c[k].forEach((x, i) => checkCond(x, aims, `${where}.${k}[${i}]`, errs)); return; }
  if ("not" in c) return checkCond(c.not, aims, `${where}.not`, errs);
  if ("rarity" in c) { if (!RARITY.has(c.rarity)) errs.push(`${where}: rarity ${c.rarity}`); return; }
  const leaf = NUM_LEAVES.find((k) => k in c);
  if (!leaf) { errs.push(`${where}: 知らない条件 ${JSON.stringify(c)}`); return; }
  if (c.min == null && c.max == null) errs.push(`${where}: min か max が要る`);
  if (leaf === "aim" && !aims[c.aim]) errs.push(`${where}: 無い狙い ${c.aim}`);
  if (SIDE_LEAVES.includes(leaf) && !SIDE.has(c[leaf])) errs.push(`${where}: ${leaf} は prefix / suffix / any`);
}

/** 手順の断り (実行前に全部出す)。price = priceTable の結果 */
export function lint(M, data, r, price, cls) {
  const errs = [], warns = [];
  if (r.schema !== "ai-tree/1") errs.push(`schema は ai-tree/1 (今 ${r.schema})`);
  for (const k of Object.keys(r)) if (!TOP_KEYS.has(k)) errs.push(`知らない項目 ${k}`);
  if (!r.name) errs.push("name が無い");
  if (!r.start?.save && !r.base) errs.push("base が無い");
  if (r.start?.mods?.length && r.basePrice == null) errs.push("始めの MOD を決めるならベースの代金 basePrice (神) を書く (タダの素材にしない)");
  for (const [name, a] of Object.entries(r.aims ?? {})) {
    if (!Array.isArray(a.mods) || !a.mods.length) { errs.push(`狙い ${name}: mods が無い`); continue; }
    for (const m of a.mods) {
      const id = typeof m === "string" ? m : m.id;
      if (!data.mods.has(id)) errs.push(`狙い ${name}: 無い MOD ${id}`);
    }
  }
  if (!r.goal || !Object.keys(r.goal).length) errs.push("goal が無い");
  for (const k of Object.keys(r.goal ?? {})) if (!r.aims?.[k]) errs.push(`goal: 無い狙い ${k}`);
  if (!Array.isArray(r.rules) || !r.rules.length) errs.push("rules が無い");
  (r.rules ?? []).forEach((x, i) => {
    const at = `rules[${i}]`;
    for (const k of Object.keys(x)) if (!RULE_KEYS.has(k)) errs.push(`${at}: 知らない項目 ${k}${k === "pick" || k === "remove" ? " (MOD の指名は使えない、S-173)" : ""}`);
    checkCond(x.if, r.aims ?? {}, at, errs);
    const acts = [x.use, x.restart, x.stop].filter((v) => v).length;
    if (acts !== 1) errs.push(`${at}: use / restart / stop のどれか 1 つ`);
    if (x.use) {
      if (!allowedHand(M, x.use, cls)) errs.push(`${at}: 棚に無い手 ${x.use} (S-173)`);
      else if (price(x.use) == null) errs.push(`${at}: 値段が無い ${x.use} (手順の prices に神で書く)`);
      for (const o of x.omens ?? []) {
        if (!M.PRICE_KEYS.omens[o]) errs.push(`${at}: 無いお告げ ${o}`);
        else if (!M.omensAllowedFor(x.use).includes(o)) errs.push(`${at}: ${x.use} に掛けられないお告げ ${o}`);
        else if (price(o) == null) errs.push(`${at}: 値段が無い ${o} (手順の prices に神で書く)`);
      }
      if (x.use === "reveal" && !x.choose?.length) errs.push(`${at}: 発現は choose (狙いの順) が要る`);
      for (const c of x.choose ?? []) if (!r.aims?.[c]) errs.push(`${at}: 無い狙い ${c}`);
    }
  });
  if (r.start?.save && r.basePrice == null && r.rules?.some((x) => x.restart)) warns.push("保存の形からの restart は basePrice が無いとタダで同じ形に戻る");
  const last = r.rules?.at(-1);
  if (last?.if) warns.push("最後の規則に条件がある: どれにも当たらない人は止まりで数える");
  (r.capture ?? []).forEach((c, i) => {
    checkCond(c.if, r.aims ?? {}, `capture[${i}]`, errs);
    if (!c.as) errs.push(`capture[${i}]: as が無い`);
  });
  return { errs, warns };
}

/** 狙い → 当たりの目標の一覧 (aimHits の形) */
export function compileAims(M, data, aims) {
  return Object.fromEntries(Object.entries(aims ?? {}).map(([name, a]) => [name, {
    value: a.value ?? null,
    targets: a.mods.map((m) => {
      const id = typeof m === "string" ? m : m.id, tier = (typeof m === "string" ? null : m.tier) ?? a.tier ?? null;
      return { modId: id, minTierIndex: tier == null ? 0 : M.tierIndexOf(data, id, tier) };
    }),
  }]));
}

const sideMods = (it, s) => (s === "prefix" ? it.prefixes : s === "suffix" ? it.suffixes : [...it.prefixes, ...it.suffixes]);
const hitsAim = (M, a, m) => a.targets.some((t) => M.aimHits(m, t)) && (a.value == null || (m.values?.[0] ?? 0) >= a.value);
export const aimCount = (M, a, it) => sideMods(it, "any").filter((m) => hitsAim(M, a, m)).length;
const isJunk = (M, aims, m) => !m.unrevealed && !Object.values(aims).some((a) => hitsAim(M, a, m));
export const matchesAim = hitsAim;

function metric(M, aims, leaf, c, ctx) {
  const it = ctx.item;
  switch (leaf) {
    case "aim": return aimCount(M, aims[c.aim], it);
    case "mods": return sideMods(it, c.mods).length;
    case "open": return c.open === "any"
      ? M.limitOf(it, "prefix") + M.limitOf(it, "suffix") - it.prefixes.length - it.suffixes.length
      : M.limitOf(it, c.open) - M.listOf(it, c.open).length;
    case "junk": return sideMods(it, c.junk).filter((m) => isJunk(M, aims, m)).length;
    case "fractured": return sideMods(it, c.fractured).filter((m) => m.fractured).length;
    case "unrevealed": return sideMods(it, c.unrevealed).filter((m) => m.unrevealed).length;
    case "quality": return it.quality;
    case "used": return ctx.tryN[c.used] ?? 0;
    case "spent": return ctx.spent();
    case "steps": return ctx.steps;
    case "restarts": return ctx.restarts;
  }
  throw new Error(`知らない条件 ${leaf}`);
}

export function test(M, aims, c, ctx) {
  if (c == null) return true;
  if (c.all) return c.all.every((x) => test(M, aims, x, ctx));
  if (c.any) return c.any.some((x) => test(M, aims, x, ctx));
  if ("not" in c) return !test(M, aims, c.not, ctx);
  if ("rarity" in c) return ctx.item.rarity === c.rarity;
  const leaf = NUM_LEAVES.find((k) => k in c);
  const v = metric(M, aims, leaf, c, ctx);
  return (c.min == null || v >= c.min) && (c.max == null || v <= c.max);
}
