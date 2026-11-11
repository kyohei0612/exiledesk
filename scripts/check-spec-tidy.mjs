#!/usr/bin/env node
// 設計図の散らばりの見張り (G-29、フック G-46・G-47 が commit の時に呼ぶ)。読むだけ。
//   C (G-46) 番号と状態の食い違い: 同じ番号が 2 行・どの紙にも無い番号を指す・⑦ の表が「仮」なのに本文は「有効」・状態の語が無い
//   A (G-47) 経緯を項目に足した: 足した文に「前は」「以下は…の形」・撤回でない項目の「撤回」・2 つ目からのオーナーの「」・不具合の話
// 見るのは base (既定 HEAD) から「増えた分」だけ。前からある物では止めない (直す・短くする・移すは通る)。
// 使い方: node scripts/check-spec-tidy.mjs [--root <dir>] [--base <rev>] [--only A|C] [--warn]
//   落ちる時は 1 行ずつ訳を出して exit 1。--warn は出すだけで exit 0。
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const root = path.resolve(arg("--root") || process.cwd());
const base = arg("--base") || "HEAD";
const only = arg("--only");
const warn = process.argv.includes("--warn");
const SPEC = "docs/spec";
const NUM = "[GYEMSURTD]-\\d{2,3}[a-z]?\\d*x?";
const DEF = new RegExp(`^\\s*(?:- \\*\\*|\\| ?\\*{0,2})(${NUM})(?![\\w〜])`);
const REF = new RegExp(`(?<![A-Za-z0-9])${NUM}`, "g");
const STATE = /有効|オーナー OK 済み|仮|未決|撤回|開発版だけ/;

const git = (...a) => { try { return execFileSync("git", ["-C", root, ...a], { encoding: "utf8", maxBuffer: 1 << 27, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }); } catch { return null; } };
// --head <rev> = 作業場でなく、その commit の中身を見る (過去の commit への当て直し用)
const head = arg("--head");
const files = head
  ? (git("ls-tree", "--name-only", `${head}:${SPEC}`) || "").split(/\r?\n/).filter((f) => f.endsWith(".md"))
  : existsSync(path.join(root, SPEC)) ? readdirSync(path.join(root, SPEC)).filter((f) => f.endsWith(".md")) : [];
const now = new Map(), old = new Map();
for (const f of files) {
  now.set(f, head ? git("show", `${head}:${SPEC}/${f}`) ?? "" : readFileSync(path.join(root, SPEC, f), "utf8"));
  old.set(f, git("show", `${base}:${SPEC}/${f}`) ?? "");
}
const changed = files.filter((f) => now.get(f) !== old.get(f));
if (!changed.length) process.exit(0);

/** 紙を項目に割る: 番号の付いた行 = 1 項目 (同じ番号の 2 行目は「番号'」)。⑦ の章の中かも持つ */
const parse = (text) => {
  const items = new Map(); const dup = []; let sec7 = false; const rows7 = [];
  for (const ln of text.split(/\r?\n/)) {
    if (/^## /.test(ln)) sec7 = /^## ⑦/.test(ln);
    const m = ln.match(DEF);
    if (sec7) { const r = ln.match(new RegExp(`^\\|[^|]*\\|\\s*(${NUM})\\s*\\|.*\\|\\s*([^|]*)\\|\\s*$`)); if (r) rows7.push({ id: r[1], state: r[2] }); continue; }
    if (!m || !/^\s*- /.test(ln) && !/^\|/.test(ln)) continue;
    let id = m[1];
    if (items.has(id)) { dup.push(id); while (items.has(id)) id += "'"; }
    items.set(id, ln);
  }
  return { items, dup, rows7 };
};
const P = (map) => { const o = new Map(); for (const [f, t] of map) o.set(f, parse(t)); return o; };
const pn = P(now), po = P(old);
const defs = (pm) => { const s = new Set(); for (const p of pm.values()) for (const id of p.items.keys()) s.add(id.replace(/'+$/, "")); return s; };
const tail = (ln) => { const i = ln.lastIndexOf(" — "); return i < 0 ? "" : ln.slice(i); };
const retracted = (ln) => /^\s*(?:- \*\*|\|)[^*|]*\(撤回/.test(ln) || /^ — 撤回/.test(tail(ln));
const out = [];

if (only !== "A") {
  // C-1 同じ番号が 2 行 (増えた分)
  for (const f of changed) {
    const before = new Set(po.get(f).dup);
    for (const id of new Set(pn.get(f).dup)) if (!before.has(id)) out.push(`[番号] ${f}: ${id} が 2 行ある。後から足した方を空いている枝番に (G-29)`);
  }
  // C-2 どの紙にも無い番号を指す (増えた分)
  const dn = defs(pn), dold = defs(po);
  const missOf = (map, d) => { const s = new Map(); for (const [f, t] of map) for (const r of t.match(REF) || []) if (!d.has(r)) s.set(r, f); return s; };
  const mo = missOf(old, dold);
  for (const [r, f] of missOf(now, dn)) if (!mo.has(r) && changed.includes(f)) out.push(`[番号] ${f}: ${r} を指しているが、どの紙にもその番号の項目が無い`);
  // C-3 ⑦ の表は「仮」なのに本文は「有効」(増えた分)
  const clash = (p) => p.rows7.filter((r) => /仮|未決/.test(r.state) && /^ — 有効/.test(tail(p.items.get(r.id) || ""))).map((r) => r.id);
  for (const f of changed) { const b = new Set(clash(po.get(f))); for (const id of clash(pn.get(f))) if (!b.has(id)) out.push(`[状態] ${f}: ${id} は ⑦ の表では仮・未決、本文は有効。どちらかを直す`); }
  // C-4 触った項目に状態の語が無い (ほぼ全部の項目 = 95% に状態の語がある紙だけ見る。書き方の違う紙では止めない)
  for (const f of changed) {
    const its = [...pn.get(f).items].filter(([, ln]) => /^\s*- \*\*/.test(ln));
    if (its.length < 10 || its.filter(([, ln]) => STATE.test(ln)).length / its.length < 0.95) continue;
    for (const [id, ln] of its) if (po.get(f).items.get(id) !== ln && !STATE.test(ln)) out.push(`[状態] ${f}: ${id} の終わりに状態 (有効 / オーナー OK 済み・本番待ち / 仮 / 未決 / 撤回) が無い`);
  }
}

if (only !== "C") {
  // A 経緯を項目に足した。文 (。区切り) のうち base のどの紙にも無かった文だけを「足した文」と数える (項目の間で移した文は数えない)
  const sents = (ln) => ln.split(/(?<=。)|(?<=\) )(?=[^\s])/).map((s) => s.trim()).filter((s) => s.length >= 8);
  const had = new Set();
  for (const t of old.values()) for (const ln of t.split(/\r?\n/)) for (const s of sents(ln)) had.add(s);
  const quotes = (s) => (s.match(/オーナー[^「」。]{0,30}「/g) || []).length;
  for (const f of changed) {
    for (const [id, ln] of pn.get(f).items) {
      if (!/^\s*- \*\*/.test(ln)) continue;
      const before = po.get(f).items.get(id) || "";
      if (before === ln) continue;
      const add = sents(ln).filter((s) => !had.has(s));
      if (!add.length) continue;
      const txt = add.join(" ");
      const why = [];
      const m1 = txt.match(/前は[^。]{0,24}|以下は[^。]{0,24}(?:形|見方)|前の決め[^。]{0,16}|前の形[^。]{0,16}/);
      if (m1 && !/前の形は記録の紙|経緯は記録の紙/.test(m1[0])) why.push(`「${m1[0].slice(0, 22)}…」`);
      if (!retracted(ln) && /撤回/.test(txt)) why.push("撤回の話 (撤回は撤回の項目の 1 行に)");
      if (quotes(ln) - quotes(before) >= 2 || (!before && quotes(ln) >= 2)) why.push("オーナーの言葉が 2 つ以上 (出どころは 1 つ)");
      const m2 = txt.match(/\d+ 人中 \d+ 人/);
      if (m2) why.push(`不具合の話「${m2[0]}」`);
      if (why.length) out.push(`[経緯] ${f}: ${id.replace(/'+$/, "")} に経緯を足している = ${why.join("・")}。項目には今の決まりと出どころ 1 つだけ、経緯は部の記録の紙 (docs/org/<部>/notes/spec-<紙>-history.md) へ (G-29)`);
    }
  }
}

if (out.length) { console.log(out.join("\n")); process.exit(warn ? 0 : 1); }
