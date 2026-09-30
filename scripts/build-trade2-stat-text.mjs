// 取引所の MOD の文面 → 検索の条件の番号 (忍者ビルドコピーのレアの検索用、2026-09-26)
//
// 元: data-cache/trade2-stats.json (取引所の /api/trade2/data/stats の写し。scripts/build-trade2-stat-mapping.mjs が取る)
// 出力: src/i18n/trade2-stat-text.json  { 型: [番号, ...] }
//   型 = 文面の数字を # に、+ を落とし、空白を詰めて小文字 (「+25 to Intelligence」→「# to intelligence」)
//   明示 (explicit) と固有 (implicit)。同じ型に番号が複数ある (ローカル / グローバル) 時は全部入れる
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = JSON.parse(readFileSync(join(root, "data-cache/trade2-stats.json"), "utf8"));
const groups = src.result ?? src;
const key = (t) => t.replace(/[0-9]+(\.[0-9]+)?/g, "#").replace(/[+]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const out = {};
for (const g of groups) {
  if (g.id !== "explicit" && g.id !== "implicit") continue;
  for (const e of g.entries ?? []) {
    if (!e.text || !e.id) continue;
    // 複数行の文 (改行つき) は 1 行目だけでも引けるようにする
    for (const t of [e.text, e.text.split("\n")[0]]) {
      const k = key(t);
      (out[k] ??= []).includes(e.id) || out[k].push(e.id);
    }
  }
}
writeFileSync(join(root, "src/i18n/trade2-stat-text.json"), JSON.stringify(out) + "\n");
console.log(`型 ${Object.keys(out).length} 件`);

// 種類の有無 (2026-09-30 オーナー「他にも同じように検索出ないとかありそう」): 普通の MOD の番号ごとに、取引所に
// 普通 (e) / フラクチャー (f) / 冒涜 (d) のどれがあるか。「どれか 1 つ」の枠に無い種類を送らないため (無い番号は取引所で「使用不能なスタッツ」)
// 出力: src/i18n/trade2-stat-kinds.json  { "stat_123": "efd" }
const have = new Set(groups.flatMap((g) => (g.entries ?? []).map((e) => e.id)));
const kinds = {};
for (const id of have) {
  if (!id.startsWith("explicit.")) continue;
  const bare = id.slice("explicit.".length);
  kinds[bare] = "e" + (have.has(`fractured.${bare}`) ? "f" : "") + (have.has(`desecrated.${bare}`) ? "d" : "");
}
writeFileSync(join(root, "src/i18n/trade2-stat-kinds.json"), JSON.stringify(kinds) + "\n");
console.log(`種類 ${Object.keys(kinds).length} 件`);
