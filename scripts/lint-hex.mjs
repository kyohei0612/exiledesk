// scripts/lint-hex.mjs
// 生 hex リテラル / Tailwind 任意値色を検出する CI 用 lint。
// 許可リスト: src/style.css のみ。それ以外で hex が見つかれば fail。
// 実行: node scripts/lint-hex.mjs
// 運用:
//   - Phase A.0: warning モード（既存違反はログ出力のみ・exit 0）
//   - Phase A.4 完了時点で error モードに昇格（LINT_HEX_STRICT=1 で exit 1）
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = 'src';
const ALLOW = new Set(['src/style.css']);
const EXT = /\.(vue|ts|tsx|js|jsx|css)$/;
const STRICT = process.env.LINT_HEX_STRICT === '1';

// bg-[#xxx] / text-[#xxxxxx] / 生 #xxxxxx (3/4/6/8 桁)
const HEX = /(?:bg|text|border|fill|stroke|from|to|via|outline|ring|shadow|caret|accent|divide|placeholder)-\[#[0-9A-Fa-f]{3,8}\b[^\]]*\]|(?<![\w&-])#[0-9A-Fa-f]{6}\b|(?<![\w&-])#[0-9A-Fa-f]{8}\b|(?<![\w&-])#[0-9A-Fa-f]{3}\b/g;

let hits = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) { walk(p); continue; }
    const rel = relative('.', p).replaceAll('\\', '/');
    if (ALLOW.has(rel) || !EXT.test(name)) continue;
    const src = readFileSync(p, 'utf8');
    let m; HEX.lastIndex = 0;
    while ((m = HEX.exec(src))) {
      const line = src.slice(0, m.index).split('\n').length;
      console.error(`[lint:hex] ${rel}:${line}  ${m[0]}`);
      hits++;
    }
  }
}
walk(ROOT);
if (hits > 0) {
  console.error(`\n[lint:hex] ${hits} violations found. Use --exile-color-* tokens instead.`);
  if (STRICT) process.exit(1);
  console.error('[lint:hex] (warning mode: LINT_HEX_STRICT=1 to fail CI)');
  process.exit(0);
}
console.log('[lint:hex] OK');
