/**
 * export-flow-seed.mjs — 測った捌き速度の記録を、配布用に書き出す (2026-09-20)
 *
 * オーナー指示:「まとめて 1 コマンドにして」。release-data.bat から呼ばれる。
 * アプリの 設定 →「配布データを書き出す」と同じことを、アプリを開かずにやる。
 *
 *   %APPDATA%\com.kyohei.exiledesk\market_flow.json
 *     → src/data/flow-seed.json  (出品者名は 4 文字目から伏字 / 監視リストは外す)
 *
 * 出力: 変わったかどうかを標準出力に 1 行 (changed / same)。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(process.env.APPDATA ?? "", "com.kyohei.exiledesk", "market_flow.json");
const dst = join(repo, "src", "data", "flow-seed.json");

/**
 * 出品者名を 4 文字目から伏せる ("KyoheiPoE" → "Kyo******")。
 * Rust 側 (market_flow.rs の mask_account) と同じ規則。同じ人は同じ文字列になるので、
 * 「同じ出品者がすぐ並べ直した物を売れた扱いにしない」判定は効いたまま。
 */
function maskAccount(name) {
  const chars = [...name];
  if (chars.length <= 3) return "*".repeat(chars.length);
  return chars.slice(0, 3).join("") + "*".repeat(chars.length - 3);
}

if (!existsSync(src)) {
  console.error(`記録が見つかりません: ${src}`);
  console.error("一括取得を 1 回でも回すとできます。");
  process.exit(1);
}

const store = JSON.parse(readFileSync(src, "utf8"));
// 監視リスト (どのジェムを追うか) は機体ごとの設定なので配らない
delete store.watches;
let masked = 0;
for (const st of Object.values(store.states ?? {})) {
  for (const t of st.tracked ?? []) {
    if (typeof t.account === "string" && t.account) {
      t.account = maskAccount(t.account);
      masked++;
    }
  }
}

const json = JSON.stringify(store);
const before = existsSync(dst) ? readFileSync(dst, "utf8") : "";
mkdirSync(dirname(dst), { recursive: true });
writeFileSync(dst, json);

const states = Object.keys(store.states ?? {}).length;
const kb = Math.round(json.length / 1024);
console.log(`銘柄 ${states} / ${kb} KB / 出品者名 ${masked} 件を伏字`);
console.log(json === before ? "same" : "changed");
