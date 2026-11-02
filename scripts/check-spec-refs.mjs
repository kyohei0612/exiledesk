#!/usr/bin/env node
/**
 * check-spec-refs.mjs — 設計図 (docs/spec/engine.md の E-xx) とエンジンのコードの札 (`// E-xx`) を照らす (2026-11-02、ジン)。
 * オーナー 11-02「おけ、それで進めて」(コードで決まりを実装している所に E-xx の札、札の抜けと食い違いを見つける台本)。
 * データ (mods.json など外から持ってくる物) / 使い方のコード / 設計図 (使い方の文) の 3 つで、設計図が正、コードはそれに従う (G-20)。
 * 数えるのは src/ の .ts のうち、持ち主がジンの物だけ (docs/org/owners.txt = scripts/owner-of.mjs)。シミュ・デザインの持ち物は見ない。
 *   ① 設計図の E-xx のうち、コードのどこからも札で指されていない物 (廃止・撤回の行は除く。コードでない決まり = 出どころ・手順の物もここに出る)
 *   ② コードの札のうち、設計図に無い番号
 *   ③ 札の無い決まりの候補: カレンシーごとの spec の置き場 (spec/*-specs.ts) で、手の定義の行 (key: / kind: … name:) に札が無い物
 * 落とさない (知らせだけ、終わりの値は 0)。フックにはしない (オーナーに聞いてから)。
 *
 *   node scripts/check-spec-refs.mjs          … 3 つの一覧
 *   node scripts/check-spec-refs.mjs --where  … ① に加えて、番号ごとに札の在りか (ファイル:行) を出す
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadOwners, ownerOf } from "./owner-of.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const where = process.argv.includes("--where");
const ID = /\bE-\d{2}[a-z]?\b/g;

// 設計図の番号 (行の頭の **E-xx …**)。状態に「廃止」「撤回」がある行は外す
const md = readFileSync(join(ROOT, "docs/spec/engine.md"), "utf8");
const rules = new Map();
for (const m of md.matchAll(/^- \*\*(E-\d{2}[a-z]?)\b([^\n]*)/gm)) {
  const status = m[2].split(" — ")[1] ?? "";
  rules.set(m[1], { dead: /^(廃止|撤回)/.test(status.trim()) || /\((廃止|撤回)\)/.test(m[2].slice(0, 20)), text: m[2].replace(/\*\*/g, "").slice(0, 60) });
}

// ジンの持ち物の .ts
const owners = loadOwners(ROOT);
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.ts$/.test(f) && ownerOf(relative(ROOT, p), owners) === "ジン") files.push(p);
  }
})(join(ROOT, "src"));

// 札 = コメントの中の E-xx (// の後ろ・/* */ の中)
const refs = new Map();
for (const f of files) {
  const lines = readFileSync(f, "utf8").split(/\r?\n/);
  lines.forEach((l, i) => {
    const c = l.includes("//") ? l.slice(l.indexOf("//")) : /^\s*(\/\*|\*)/.test(l) ? l : "";
    for (const id of c.match(ID) ?? []) (refs.get(id) ?? refs.set(id, []).get(id)).push(`${relative(ROOT, f).replace(/\\/g, "/")}:${i + 1}`);
  });
}

const live = [...rules].filter(([, r]) => !r.dead);
const unref = live.filter(([id]) => !refs.has(id));
const unknown = [...refs].filter(([id]) => !rules.has(id));
const deadRef = [...refs].filter(([id]) => rules.get(id)?.dead);

// ③ spec の置き場の手の定義で札の無い行
const specDir = join(ROOT, "src/services/craft-stage/spec");
const untagged = [];
// 札は定義の行か、そのすぐ上 2 行 (`export const X: CurrencySpec = {` の行など) にあれば良い
const tagged = (s) => /\bE-\d{2}[a-z]?\b/.test(s);
for (const f of readdirSync(specDir).filter((x) => /-specs\.ts$/.test(x))) {
  const lines = readFileSync(join(specDir, f), "utf8").split(/\r?\n/);
  const isDef = (s) => /^\s*(\{ )?key: "|^\s*kind: "[a-z_]+", name: "/.test(s);
  lines.forEach((l, i) => {
    if (!isDef(l)) return;
    // 上の行がほかの手の定義なら、その札は自分の物ではない
    const above = [lines[i - 1] ?? "", lines[i - 2] ?? ""].filter((s, k) => !isDef(s) && (k === 0 || !isDef(lines[i - 1] ?? "")));
    if (tagged(l) || above.some(tagged)) return;
    untagged.push(`src/services/craft-stage/spec/${f}:${i + 1}  ${l.trim().slice(0, 70)}`);
  });
}

console.log(`設計図の決まり ${rules.size} (生きている ${live.length})・ジンの .ts ${files.length} 本・札 ${[...refs.values()].flat().length} か所 / ${refs.size} 番号`);
console.log(`\n① 札で指されていない決まり ${unref.length}`);
for (const [id, r] of unref) console.log(`  ${id}  ${r.text}`);
console.log(`\n② 設計図に無い番号の札 ${unknown.length}${deadRef.length ? ` (ほかに廃止・撤回の番号を指す札 ${deadRef.length})` : ""}`);
for (const [id, at] of [...unknown, ...deadRef]) console.log(`  ${id}${rules.get(id)?.dead ? " (廃止・撤回)" : ""}  ${at.join(", ")}`);
console.log(`\n③ spec の置き場で札の無い手の定義 ${untagged.length}`);
for (const u of untagged) console.log(`  ${u}`);
if (where) {
  console.log("\n番号ごとの札の在りか");
  for (const [id] of live) if (refs.has(id)) console.log(`  ${id}  ${refs.get(id).join(", ")}`);
}
