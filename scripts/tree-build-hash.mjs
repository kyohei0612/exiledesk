/**
 * tree-build-hash.mjs — 木の組み方の版 (S-104b)。木の組み直しに効くソースとデータ (シミュの木・エミュのエンジン・MOD の表) の中身の指紋。
 * 本番の作り (vite build) の時に vite.config.ts が __TREE_BUILD__ として埋める。組み方の決まり・箱の置き場の計算・エンジン・データのどれかを変えると
 * 指紋が変わり、前の版で保存した組み上がった木は使わずに打ち方から組み直す (上げ忘れが無いように手で上げる番号にしない、11-10)
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

/** 組み直しに効く所 (ここより外の画面の部品は木の箱を変えない) */
const ROOTS = ["src/services/simulator", "src/services/craft-stage", "src/services/htc", "src/vendor/poe2htc", "src/views/simulator/tree"];
const EXT = /\.(ts|js|mjs|json)$/;
/** 組み直しの結果 (箱・まとめ・判定) を変えない物 = 回す・最終チェック・題・画面の見張り・貼る口・値段 (入れると出しごとにほぼ毎回変わる、11-10 の数え) */
const SKIP = /tree-run\.ts|tree-check\.ts|tree-frame-check|run-price|tree-base-cost|hole-check|[\\/]use-tree|tree-names|tree-open-first|tree-whittle-hint|tree-whittle-marks|sim-monkey|tree-dev-log|tree-lines|[\\/]paste[\\/]|start-cost|recipe-worker/;

async function walk(dir) {
  const out = [];
  let ents = [];
  try { ents = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (EXT.test(e.name) && !/\.test\.ts$/.test(e.name) && !SKIP.test(p)) out.push(p);
  }
  return out;
}

export async function treeBuildHash(root = process.cwd()) {
  const h = createHash("sha256");
  for (const r of ROOTS) {
    const files = (await walk(join(root, r))).sort();
    // 改行の違い (CRLF / LF) では変えない
    for (const f of files) h.update(relative(root, f).replace(/\\/g, "/")).update("\0").update((await readFile(f, "utf8")).replace(/\r\n/g, "\n")).update("\0");
  }
  return h.digest("hex").slice(0, 16);
}
