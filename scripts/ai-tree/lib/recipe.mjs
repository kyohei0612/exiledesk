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
const TOP_KEYS = new Set(["schema", "name", "base", "itemLevel", "basePrice", "start", "aims", "goal", "rules", "capture", "limits", "prices", "note", "solve", "bands"]);

export const hashOf = (recipe) => createHash("sha256").update(JSON.stringify(recipe)).digest("hex").slice(0, 12);

export function readRecipe(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

/** 手として打ってよいか (棚にある手と発現だけ、S-173)。棚の正は ORBS と、エッセンス・カタリスト・骨・ルーンの棚 */
export function allowedHand(M, key, cls) {
  if (key === "reveal") return true;
  if (!nameOf(M, key, cls)) return false;
  return M.ORBS.some((g) => g.keys.includes(key)) || /^(essence:|j?catalyst_|desecrate|rune:)/.test(key);
}

/** 一緒に掛けられないお告げの組が入っているか */
export const omenClash = (M, omens) => M.OMEN_EXCLUSIVE.some((g) => g.filter((o) => omens.includes(o)).length > 1);

function checkCond(c, aims, where, errs) {
  if (c == null) return;
  if (typeof c !== "object") { errs.push(`${where}: 条件が形になっていない`); return; }
  for (const k of ["all", "any"]) if (k in c) { if (!Array.isArray(c[k])) errs.push(`${where}: ${k} は配列`); else c[k].forEach((x, i) => checkCond(x, aims, `${where}.${k}[${i}]`, errs)); return; }
  if ("not" in c) return checkCond(c.not, aims, `${where}.not`, errs);
  if ("rarity" in c) { if (!RARITY.has(c.rarity)) errs.push(`${where}: rarity ${c.rarity}`); return; }
  if ("state" in c) return;
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
  const s = r.start ?? {};
  if (!(r.basePrice > 0) && (s.mods?.length || s.runes?.length || s.quality || (s.rarity && s.rarity !== "normal"))) errs.push("始めの形を決めるならベースの代金 basePrice (神、0 より大きい) を書く (タダの素材にしない)");
  if (s.save && s.carry === false && !(r.basePrice > 0)) errs.push("carry:false は保存の形の代金 basePrice (神) を書く (途中の品をタダにしない)");
  if (s.save && r.rules?.some((x) => x.restart)) errs.push("保存の形からは restart できない (同じ品は買い直せない)");
  for (const [k, v] of Object.entries(r.prices ?? {})) if (!(v > 0)) errs.push(`prices: ${k} は 0 より大きく`);
  if (r.basePrice != null && !(r.basePrice >= 0)) errs.push("basePrice は 0 以上");
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
      if (omenClash(M, x.omens ?? [])) errs.push(`${at}: 一緒に掛けられないお告げ ${x.omens.join(", ")}`);
      for (const o of x.omens ?? []) {
        if (!M.PRICE_KEYS.omens[o]) errs.push(`${at}: 無いお告げ ${o}`);
        else if (!M.omensAllowedFor(x.use).includes(o)) errs.push(`${at}: ${x.use} に掛けられないお告げ ${o}`);
        else if (price(o) == null) errs.push(`${at}: 値段が無い ${o} (手順の prices に神で書く)`);
      }
      if (x.use === "reveal" && !x.choose?.length) errs.push(`${at}: 発現は choose (狙いの順) が要る`);
      for (const c of x.choose ?? []) if (!r.aims?.[c]) errs.push(`${at}: 無い狙い ${c}`);
    }
  });
  if (s.save) warns.push("保存までの費用は着いた人の分だけで、諦めた人の分は入らない");
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
export const targetsDone = (M, aims, goal, it) => Object.entries(goal).every(([k, v]) => aimCount(M, aims[k], it) >= v);

/** 解く時の形 (S-177): 手を決めるのに見える物だけ。ゲームの画面で全部分かる */
export function stateKey(M, data, aims, it) {
  const all = sideMods(it, "any");
  const counts = Object.entries(aims).map(([k, a]) => `${k}:${aimCount(M, a, it)}`).join(",");
  const families = new Set(Object.values(aims).flatMap((a) => a.targets.map((t) => data.mods.get(t.modId)?.family)));
  const blocked = all.filter((m) => families.has(m.family) && !Object.values(aims).some((a) => hitsAim(M, a, m))).length;
  const fixed = all.filter((m) => m.fractured), fixedHit = fixed.filter((m) => Object.values(aims).some((a) => hitsAim(M, a, m))).length;
  const hidden = all.find((m) => m.unrevealed);
  const flags = [it.corrupted && "c", hidden && `u${hidden.side[0]}`,  all.some((m) => m.desecrated) && "d", all.some((m) => m.crafted) && "e"].filter(Boolean).join("");
  // 品質は確率を変える時だけ持つ (カタリストの品質と種類)。ソケットは差した特殊 MOD のルーンだけ (確率を変えるルーン)
  const quality = it.qualityTag || it.catalystQuality ? `q${it.quality}${it.qualityTag ?? ""}c${it.catalystQuality ?? 0}` : "";
  const runes = [...M.stageRuneIds(it)].sort().join("+");
  return `${it.rarity}|${counts}|p${it.prefixes.length}s${it.suffixes.length}|b${blocked}|f${fixed.length}h${fixedHit}|${quality}|${flags}${runes ? `|r${runes}` : ""}`;
}

/** 木の箱 (S-170b): レアリティ + 完成の狙いの数 */
export function graphKey(M, aims, goal, it) {
  return `${it.rarity}|${Object.entries(goal).map(([k, v]) => `${k}:${Math.min(v, aimCount(M, aims[k], it))}`).join(",")}`;
}

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
  if ("state" in c) return ctx.key() === c.state;
  const leaf = NUM_LEAVES.find((k) => k in c);
  const v = metric(M, aims, leaf, c, ctx);
  return (c.min == null || v >= c.min) && (c.max == null || v <= c.max);
}
