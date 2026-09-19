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

/**
 * 配られた側 (サブ機) から配り直さないための止め。
 *
 * オーナー 2026-09-20「サブ PC でそれやったらそっちのデータはどうなんだ」:
 * サブ機の記録は「配られた分 + サブが測った分」なので、そのまま書き出すと
 * 母機がその後に測った分より古い値で上書きされることがある。
 * 同梱データを 1 度でも取り込んだ機体では止めて、--force でだけ通す。
 */
const importedMark = join(process.env.APPDATA ?? "", "com.kyohei.exiledesk", "flow-seed-imported.json");
if (existsSync(importedMark) && !process.argv.includes("--force")) {
  const at = JSON.parse(readFileSync(importedMark, "utf8")).imported_at ?? 0;
  console.error("この PC は配られたデータを取り込んでいます (" + new Date(at * 1000).toLocaleString("ja-JP") + ")。");
  console.error("受け取った側から配り直すと、母機で測った新しい記録が古い値に戻ることがあります。");
  console.error("測っている PC で実行してください。どうしても配るなら --force を付けてください。");
  process.exit(2);
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
let dropped = 0;
for (const st of Object.values(store.states ?? {})) {
  // **まだ並んでいる出品は配らない** (Rust 側 market_flow_export_seed と同じ)。
  // 追跡中の分を渡すと、受け取った機体が次に回した時「一覧に無い = 売れた」と数えてしまい、
  // 消えた時刻がその機体の取得時刻になって、寿命が伸びて何でも「遅い」に寄る。
  // 測り終わった分 (売れた / 打ち切った) だけ配れば判定はそのまま引き継げる。
  const before = (st.tracked ?? []).length;
  st.tracked = (st.tracked ?? []).filter((t) => t.gone_at != null);
  dropped += before - st.tracked.length;
  for (const t of st.tracked) {
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
console.log(`銘柄 ${states} / ${kb} KB / 出品者名 ${masked} 件を伏字 / 追跡中 ${dropped} 件は配らない`);
console.log(json === before ? "same" : "changed");
