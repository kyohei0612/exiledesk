#!/usr/bin/env node
/**
 * build-changelog.mjs — 更新履歴 (src/data/changelog.json) を git のタグから作る (2026-10-10)
 *
 * オーナー「更新したらポップアップで更新内容出して 1 回だけ、バージョン押したら更新履歴見れるように」。
 *   node scripts/build-changelog.mjs [次の版]
 *     次の版を渡すと、最後のタグから今までのコミットをその版の分として先頭に入れる (bump-version.mjs がリリースの時に呼ぶ)
 * 中身: 版ごとに、その版で入ったコミットの見出し (feat / fix / style / perf だけ。テスト・CI・リリースの作業は入れない)。
 * 利用者向けに書き直した文があれば src/data/changelog-notes.json ({ "0.1.448": ["…", "…"] }) を優先する
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "src/data/changelog.json");
const NOTES = resolve(ROOT, "src/data/changelog-notes.json");
/** 残す版の数 (古い物は落とす。JSON を小さく) */
const KEEP = 40;
const next = process.argv[2] ?? null;

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const tags = git("tag", "--list", "v*", "--sort=-v:refname").split("\n").filter(Boolean);
const notes = existsSync(NOTES) ? JSON.parse(readFileSync(NOTES, "utf8")) : {};

const SHOW = new Set(["feat", "fix", "style", "perf"]);
const KIND_JA = { feat: "追加", fix: "修正", style: "見た目", perf: "速さ" };
/** コミットの見出し 1 行 → 表示の 1 行 ({kind, area, text})。出さない物は null */
function itemOf(subject) {
  const m = /^(\w+)(?:\(([^)]*)\))?:\s*(.+)$/.exec(subject);
  if (!m || !SHOW.has(m[1])) return null;
  let text = m[3];
  // 長い説明は最初の区切りまで (— や 。の後は経緯の話)
  text = text.split(/\s—\s|。/)[0].trim();
  if (text.length > 90) text = text.slice(0, 89) + "…";
  return { kind: KIND_JA[m[1]], area: m[2] ?? "", text };
}
function entry(v, range, date) {
  const subjects = range ? git("log", range, "--no-merges", "--format=%s").split("\n").filter(Boolean) : [];
  const items = notes[v] ? notes[v].map((text) => ({ kind: "", area: "", text })) : subjects.map(itemOf).filter(Boolean).reverse();
  return { v, date, items };
}

const out = [];
if (next && tags[0] && `v${next}` !== tags[0]) out.push(entry(next, `${tags[0]}..HEAD`, new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)));
for (let i = 0; i < tags.length && out.length < KEEP; i++) {
  const v = tags[i].slice(1);
  if (out.some((e) => e.v === v)) continue;
  const prev = tags[i + 1];
  const date = git("log", "-1", "--format=%cs", tags[i]);
  out.push(entry(v, prev ? `${prev}..${tags[i]}` : null, date));
}
writeFileSync(OUT, JSON.stringify(out.filter((e) => e.items.length), null, 1) + "\n");
console.error(`changelog: ${out.length} 版 → src/data/changelog.json`);
