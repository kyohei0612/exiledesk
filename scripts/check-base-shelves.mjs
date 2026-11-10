/**
 * check-base-shelves.mjs — 見張り: ベースの選び画面の札に全ベースが並ぶか (E-98、11-10)
 *
 * 要望「トラーサスキャノンが無い」(置き場の行 Crossbows_cannon が札の一覧に無く、検索でしか出なかった) の再発止め。
 *   A (落とす): baseCatalog() の全ベースの cls が札 (CATALOG_ROWS) にある。置き場の行が無いベースは
 *     「ユニーク専用 (Golden …)」か「今のゲームに無い (removed-bases.json)」だけ許す。それ以外は名前を出して落ちる
 *   B (知らせる): `--new=行1,行2` で、取り込みで新しく入った行の札の有る無しを一覧にする (落とさない。
 *     build-htc-bases-from-client.mjs の最後が呼ぶ)
 * 使い方: node scripts/check-base-shelves.mjs [--new=Crossbows_cannon,...]
 */
import { bundleEntry } from "./_bundle-ts.mjs";

const M = await bundleEntry("scripts/_base-shelves-entry.ts");
const d = M.loadPatchSync();
const shelves = new Set(M.CATALOG_ROWS.flatMap((r) => r.cls.map((c) => c[0])));
const RUNE_MADE = /^(Runeforged|Runemastered|Runefather's) /;
const UNIQUE_ONLY = /^Golden /;

const noShelf = []; // [ベース名, 並べた札の名前]
for (const r of M.baseCatalog(d, false)) if (!shelves.has(r.cls)) noShelf.push([r.en, r.cls]);
const noRow = Object.keys(M.htcBaseInfo()).filter((en) => !RUNE_MADE.test(en) && !M.classOfBase(d, en) && !UNIQUE_ONLY.test(en) && !M.isRemovedBase(en));

const newArg = process.argv.find((a) => a.startsWith("--new="));
if (newArg) {
  console.log("[B] 取り込みで新しく入った行と札:");
  for (const row of newArg.slice(6).split(",").filter(Boolean)) {
    const mine = M.baseCatalog(d, false).filter((r) => (M.classOfBase(d, r.en)?.id ?? "") === row);
    const bad = mine.filter((r) => !shelves.has(r.cls));
    console.log(`  ${row}: ベース ${mine.length} 件 → ${bad.length ? `札なし ${bad.length} 件 (${bad.slice(0, 3).map((r) => r.en).join("、")})` : "全部札に並ぶ"}`);
  }
}
if (noShelf.length || noRow.length) {
  for (const [en, cls] of noShelf) console.error(`✗ 札に出ない: ${en} (並べる札 ${cls} が CATALOG_ROWS に無い)`);
  for (const en of noRow) console.error(`✗ 置き場の行が無い: ${en}`);
  console.error("→ base-catalog.ts の札の一覧か shelfCls を直す (E-98)。ユニーク専用・消えたベースなら除外の理由をこの台本に足す");
  process.exit(1);
}
console.log(`OK: 全ベース ${M.baseCatalog(d, false).length} 件が札に並ぶ`);
