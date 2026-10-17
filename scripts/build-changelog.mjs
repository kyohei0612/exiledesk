#!/usr/bin/env node
/**
 * build-changelog.mjs — 更新履歴 (src/data/changelog.json) を git のタグから作る (2026-10-10)
 *
 * オーナー「更新したらポップアップで更新内容出して 1 回だけ、バージョン押したら更新履歴見れるように」。
 *   node scripts/build-changelog.mjs [次の版]
 *     次の版を渡すと、最後のタグから今までのコミットをその版の分として先頭に入れる (bump-version.mjs がリリースの時に呼ぶ)
 * 中身: 版ごとに、その版で入ったコミットの見出し (feat / fix / style / perf だけ。テスト・CI・リリースの作業は入れない)。
 * 利用者向けに書き直した文があれば src/data/changelog-notes.json ({ "0.1.448": ["…", "…"] }) を優先する。
 * 英語は src/data/changelog-notes-en.json (同じ版・同じ順、2026-10-17)。
 * タグの無い版 (Web だけのリリース、2026-10-16〜) も、changelog-notes.json にあれば入れる (日付は package.json にその版の番号を書いたコミットの日)
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "src/data/changelog.json");
const NOTES = resolve(ROOT, "src/data/changelog-notes.json");
const NOTES_EN = resolve(ROOT, "src/data/changelog-notes-en.json");
/** 残す版の数 (古い物は落とす。JSON を小さく) */
const KEEP = 40;
const next = process.argv[2] ?? null;

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const tags = git("tag", "--list", "v*", "--sort=-v:refname").split("\n").filter(Boolean);
const notes = existsSync(NOTES) ? JSON.parse(readFileSync(NOTES, "utf8")) : {};
const notesEn = existsSync(NOTES_EN) ? JSON.parse(readFileSync(NOTES_EN, "utf8")) : {};
const vnum = (v) => v.split(".").map(Number);
const cmp = (a, b) => { const x = vnum(a), y = vnum(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; };

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
  const items = notes[v] ? notes[v].map((text, i) => ({ kind: "", area: "", text, ...(notesEn[v]?.[i] ? { en: notesEn[v][i] } : {}) })) : subjects.map(itemOf).filter(Boolean).reverse();
  return { v, date, items };
}

const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const tagged = new Set(tags.map((t) => t.slice(1)));
// 版の並び: タグ + 書き直した文のある版 (タグの無い Web だけのリリース) + 次の版
const versions = [...new Set([...tags.map((t) => t.slice(1)), ...Object.keys(notes), ...(next ? [next] : [])])].sort(cmp).slice(0, KEEP);
const out = [];
for (const v of versions) {
  if (tagged.has(v)) {
    const i = tags.indexOf(`v${v}`);
    const prev = tags[i + 1];
    out.push(entry(v, prev ? `${prev}..${tags[i]}` : null, git("log", "-1", "--format=%cs", tags[i])));
  } else if (v === next && !notes[v]) {
    out.push(entry(v, tags[0] ? `${tags[0]}..HEAD` : null, today));
  } else {
    // タグの無い版: package.json にその版の番号を書いたコミットの日 (無ければ今日 = これから出す版)
    const date = git("log", "--reverse", "--format=%cs", `-S"version": "${v}"`, "--", "package.json").split(/\r?\n/)[0] || today;
    out.push(entry(v, null, date));
  }
}
writeFileSync(OUT, JSON.stringify(out.filter((e) => e.items.length), null, 1) + "\n");
console.error(`changelog: ${out.length} 版 → src/data/changelog.json`);
// 英語の文の忘れ (英語はセットで。2026-10-17)
if (next && notes[next] && (notesEn[next]?.length ?? 0) !== notes[next].length) console.error(`⚠ changelog-notes-en.json に ${next} の英語が無い (または数が違う)`);
