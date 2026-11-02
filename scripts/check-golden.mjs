#!/usr/bin/env node
/**
 * check-golden.mjs — カレンシーの結果の控え (tests/currency-spec-golden) を回し、控えと違う群を返す (2026-11-03、G-42)。
 * オーナー 11-03「フックしといてくれ」: golden が 10-21 から回されず 6 群とも落ちていた (「チェック入れててよかったけど、意味ないやん」)。
 * フック exiledesk-guard.js がエンジン (src/services/craft-stage/**・docs/spec/engine.md・控え) を含む commit の時だけ呼ぶ (1 回 約 25 秒)。
 *
 * 既知の落ち check-golden.drift.json (無ければ無し): 群 → 「控えとは違うが、今は止めない値」の並び。直せない落ちが残る間だけ置き、
 * その値と同じなら通し、違う値 (= 新しく増えた落ち) だけ止める。11-03 の 6 群の落ちはジン部長 4 が取り直し済み (a6610de02) で置き無し。
 * 控えを取り直したら (GOLDEN_WRITE=1、commit の文に「設計図どおり」) drift の群は消す。全部消えたらファイルごと消す。
 *
 *   node scripts/check-golden.mjs   … 0 = 通る、1 = 新しい落ち・回らなかった (理由を 1 行ずつ)
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const drift = (() => { try { return JSON.parse(readFileSync(join(root, "scripts/check-golden.drift.json"), "utf8")); } catch { return {}; } })();
const vitest = join(root, "node_modules/vitest/vitest.mjs");
if (!existsSync(vitest)) { console.log("回らなかった: node_modules/vitest が無い (worktree なら node_modules を本体へ繋ぐ)"); process.exit(1); }

const dir = mkdtempSync(join(tmpdir(), "golden-"));
const outFile = join(dir, "out.json");
let text = "";
try {
  text = execFileSync(process.execPath, [vitest, "run", "tests/currency-spec-golden", "--reporter=default", "--reporter=json", `--outputFile.json=${outFile}`], {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true, timeout: 150000, env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", GOLDEN_WRITE: "" },
  });
} catch (e) { text = String(e.stdout ?? "") + String(e.stderr ?? ""); } // 落ちた群があると exit 1。群の合否は outFile、違った値はふだんの出力の差で見る
text = text.replace(/\x1b\[[0-9;]*m/g, "");
/** 群 → 今の値 (ふだんの出力の「AssertionError: <群>: …」の後の差の + 側) */
const gotOf = (name) => text.split(/AssertionError: /).find((s) => s.startsWith(`${name}:`))?.match(/\+\s+"hash":\s*"([0-9a-f]{64})"/)?.[1];
let report;
try { report = JSON.parse(readFileSync(outFile, "utf8")); } catch {}
rmSync(dir, { recursive: true, force: true });
const tests = report?.testResults?.flatMap((f) => f.assertionResults ?? []) ?? [];
// 全部飛ばし・0 件は通さない (11-03 の二分探索が vitest の起きないまま回り続けた)
if (!tests.length || tests.every((t) => t.status !== "passed" && t.status !== "failed")) { console.log("回らなかった: golden の群が 1 つも走っていない (vitest が起きない・全部飛ばし)"); process.exit(1); }

const bad = [];
for (const t of tests) {
  if (t.status === "passed") continue;
  const got = gotOf(t.title);
  if (got && (drift[t.title] ?? []).includes(got)) continue;
  bad.push(`${t.title}: 控えと違う${got ? ` (今の値 ${got})` : ""}`);
}
if (bad.length) { bad.forEach((l) => console.log(l)); process.exit(1); }
