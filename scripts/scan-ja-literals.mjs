/**
 * scan-ja-literals.mjs — Web に出る画面の「tr を通っていない日本語の直書き」を洗い出す (2026-10-16 英語版の仕上げ)。
 *
 * src/web/main.ts から import をたどって Web に載るファイルだけを見る (アプリだけの画面は入らない)。
 * 見る物: .vue の文 (タグの間)・静的な属性 (title="…")・式 ({{ }} / :title / v-if など) と <script> の文字列。
 * 外す物: コメント・tr("日本語", …) の 1 つ目・ja: / textJa: などの日本語の欄・isEn / lang を見ている式の中・console.* / logRecord の引数。
 * 誤検知 (日本語の文を照らし合わせる表など) は残るので、テストは「増えていないか」を基準の件数で見る (tests/i18n-ja-literals.test.ts)。
 *
 *   node scripts/scan-ja-literals.mjs          … ファイルごとの件数
 *   node scripts/scan-ja-literals.mjs --detail … 1 件ずつ (行と中身)
 *   node scripts/scan-ja-literals.mjs --all    … src の全部 (アプリだけの画面も)
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const JA = /[぀-ヿ㐀-鿿ｦ-ﾟ]/;

/** import をたどる (相対パスだけ。json・css・画像は見ない) */
export function webFiles(entry = join(ROOT, "src/web/main.ts")) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    const src = readFileSync(f, "utf8");
    const specs = [];
    for (const m of src.matchAll(/(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/g)) specs.push(m[1]);
    for (const m of src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) specs.push(m[1]);
    for (const m of src.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) specs.push(m[1]);
    for (const m of src.matchAll(/new URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url/g)) specs.push(m[1]);
    for (const s0 of specs) {
      if (!s0.startsWith(".")) continue;
      const s = s0.replace(/\?.*$/, "");
      if (/\.(json|css|png|webp|svg|jpg|txt|wasm)$/.test(s)) continue;
      const base = resolve(dirname(f), s);
      const hit = [base, `${base}.ts`, `${base}.vue`, `${base}.js`, join(base, "index.ts")].find((p) => existsSync(p) && statSync(p).isFile());
      if (hit && !hit.includes(`${join("vendor")}`)) stack.push(hit);
    }
  }
  return [...seen].filter((f) => /\.(ts|vue)$/.test(f));
}

/** src の全部 (--all) */
function allFiles(dir = join(ROOT, "src")) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== "vendor" && n !== "data") out.push(...allFiles(p)); }
    else if (/\.(ts|vue)$/.test(n) && !n.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

const lineOf = (src, i) => src.slice(0, i).split("\n").length;

/** 文字列の前の文脈から、画面に出ない / 訳し済みの物を外す */
function skippedByContext(code, start) {
  const before = code.slice(Math.max(0, start - 160), start);
  if (/\btr\(\s*$/.test(before)) return true; // tr("日本語", …) の 1 つ目
  if (/\b\w*(?:[jJ]a|JA)\s*:\s*$/.test(before)) return true; // { ja: "…" } / textJa: "…"
  if (/\b\w*Ja\s*(?:===?|!==?)\s*$/.test(before) || /\b\w*Ja\s*\?\?\s*$/.test(before)) return true;
  if (/console\.\w+\([^;]*$/.test(before) || /\blogRecord\([^;]*$/.test(before) || /\brecordHistory\([^;]*$/.test(before)) return true;
  // isEn ? "English" : "日本語" / lang.value === "en" ? … の形 (同じ式の中、近く)
  const stmt = before.split(/[;{}]\s*\n|\n\s*\n/).pop() ?? "";
  if (/\bisEn\b|\blang\.value\b|lang === "en"|=== "en"|\ben\s*\?/.test(stmt.slice(-140))) return true;
  return false;
}

/**
 * JS (script・{{ }} の中・:属性の式) の文字列を拾う。コメントは飛ばす。
 * 戻り値: [{ index, text }] (index は code の中の位置)
 */
export function jsJaStrings(code) {
  const out = [];
  let i = 0;
  const n = code.length;
  const tplDepth = []; // `${ の入れ子
  while (i < n) {
    const c = code[i];
    const d = code[i + 1];
    if (c === "/" && d === "/") { const e = code.indexOf("\n", i); i = e < 0 ? n : e; continue; }
    if (c === "/" && d === "*") { const e = code.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === "}" && tplDepth.length && tplDepth[tplDepth.length - 1] === 0) { tplDepth.pop(); i = readTpl(i + 1); continue; }
    if (c === "{" && tplDepth.length) tplDepth[tplDepth.length - 1]++;
    if (c === "}" && tplDepth.length) tplDepth[tplDepth.length - 1]--;
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && code[j] !== c && code[j] !== "\n") j += code[j] === "\\" ? 2 : 1;
      const s = code.slice(i + 1, j);
      if (JA.test(s) && !skippedByContext(code, i)) out.push({ index: i, text: s });
      i = j + 1;
      continue;
    }
    if (c === "`") { tplStart = i; tplText = ""; i = readTpl(i + 1); continue; }
    i++;
  }
  return out;

  // テンプレート文字列: ${ までの文を集める。最初の ` の位置で判定する
  var tplStart, tplText;
  function readTpl(j) {
    while (j < n) {
      if (code[j] === "\\") { tplText += code.slice(j, j + 2); j += 2; continue; }
      if (code[j] === "`") {
        if (JA.test(tplText) && !skippedByContext(code, tplStart)) out.push({ index: tplStart, text: tplText.replace(/\s+/g, " ").slice(0, 120) });
        tplText = "";
        return j + 1;
      }
      if (code[j] === "$" && code[j + 1] === "{") { tplDepth.push(0); tplText += "${…}"; return j + 2; }
      tplText += code[j];
      j++;
    }
    return j;
  }
}

/** 1 ファイルの日本語の直書き: [{ line, text, kind }] */
export function scanFile(file) {
  const src = readFileSync(file, "utf8");
  const found = [];
  if (file.endsWith(".ts")) {
    for (const s of jsJaStrings(src)) found.push({ line: lineOf(src, s.index), text: s.text, kind: "script" });
    return found;
  }
  // .vue: <script> と <template> に分ける
  for (const m of src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    const off = m.index + m[0].indexOf(">") + 1;
    for (const s of jsJaStrings(m[1])) found.push({ line: lineOf(src, off + s.index), text: s.text, kind: "script" });
  }
  const tm = /<template\b[^>]*>([\s\S]*)<\/template>/.exec(src);
  if (!tm) return found;
  const tOff = tm.index + tm[0].indexOf(">") + 1;
  // コメントは同じ長さの空白に (位置を保つ)
  const tpl = tm[1].replace(/<!--[\s\S]*?-->/g, (x) => x.replace(/[^\n]/g, " "));
  const blank = (s) => s.replace(/[^\n]/g, " ");
  let rest = tpl;
  // {{ 式 }}
  rest = rest.replace(/\{\{([\s\S]*?)\}\}/g, (all, expr, idx) => {
    for (const s of jsJaStrings(expr)) found.push({ line: lineOf(src, tOff + idx + 2 + s.index), text: s.text, kind: "expr" });
    return blank(all);
  });
  // :属性 / v-* / @ の式
  rest = rest.replace(/(\s)((?::|v-|@|#)[\w.:\-[\]]*)=("([^"]*)"|'([^']*)')/g, (all, sp, _name, _q, a, b, idx) => {
    const expr = a ?? b ?? "";
    for (const s of jsJaStrings(expr)) found.push({ line: lineOf(src, tOff + idx + all.indexOf(expr) + s.index), text: s.text, kind: "expr" });
    return sp + blank(all.slice(1));
  });
  // 静的な属性 (title="日本語" など)
  rest = rest.replace(/(\s)([\w-]+)=("([^"]*)"|'([^']*)')/g, (all, sp, name, _q, a, b, idx) => {
    const v = a ?? b ?? "";
    if (JA.test(v) && !/^(class|style|data-[\w-]+)$/.test(name)) found.push({ line: lineOf(src, tOff + idx), text: `${name}="${v}"`, kind: "attr" });
    return sp + blank(all.slice(1));
  });
  // タグの間の文
  for (const m of rest.matchAll(/>([^<>]+)</g)) {
    const t = m[1].trim();
    if (JA.test(t)) found.push({ line: lineOf(src, tOff + m.index + 1 + m[1].search(/\S/)), text: t.replace(/\s+/g, " "), kind: "text" });
  }
  return found.sort((a, b) => a.line - b.line);
}

/** { "src/…": 件数 } (件数 0 は出さない) */
export function scanCounts(files = webFiles()) {
  const out = {};
  for (const f of files) {
    const k = relative(ROOT, f).replace(/\\/g, "/");
    const c = scanFile(f).length;
    if (c) out[k] = c;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const all = process.argv.includes("--all");
  const files = all ? allFiles() : webFiles();
  if (process.argv.includes("--json")) { console.log(JSON.stringify(scanCounts(files), null, 2)); process.exit(0); }
  let total = 0;
  for (const f of files.sort()) {
    const hits = scanFile(f);
    if (!hits.length) continue;
    total += hits.length;
    console.log(`${relative(ROOT, f).replace(/\\/g, "/")}\t${hits.length}`);
    if (process.argv.includes("--detail")) for (const h of hits) console.log(`  ${h.line}\t${h.kind}\t${h.text.slice(0, 100)}`);
  }
  console.log(`files ${files.length}, hits ${total}`);
}
