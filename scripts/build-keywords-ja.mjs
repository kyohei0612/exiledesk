// ゲームのキーワードの説明 (下線の所にカーソルを乗せると出る説明) をクライアント原本から作る (2026-09-26)
//
// オーナー:「ゲーム内みたいな感じで、詳細にさらに下線の所の詳細みれるじゃん？ あんな感じで詳細の詳細みれるようにして。
//   どうせクライアントに原文全てあるでしょ。ユニークも一緒で、神聖とかそういう細かい所ゲーム内と一緒にしてほしい」。
// 元: data-cache/client-export-keywords/tables/{English,Japanese}/KeywordPopups.json (npx pathofexile-dat、config.json 参照)
// 出力: src/i18n/keywords-ja.json  { Id: { t: 見出し (日本語), d: 説明 (日本語、[Tag|表示] の印は残す = さらに奥へ辿れる) } }
// MOD 文の [Tag|表示] の Tag が Id。画面側は使う時に読み込む。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const T = (lang) => JSON.parse(readFileSync(join(root, "data-cache/client-export-keywords/tables", lang, "KeywordPopups.json"), "utf8"));
const E = T("English"), Jp = T("Japanese");
const out = {};
E.forEach((e, i) => {
  const j = Jp[i];
  if (!e.Id || !j?.Definition) return;
  out[e.Id] = { t: j.Term || e.Term || e.Id, d: j.Definition.replace(/\r/g, "") };
});
writeFileSync(join(root, "src/i18n/keywords-ja.json"), JSON.stringify(out) + String.fromCharCode(10));
console.log(`キーワード ${Object.keys(out).length} 件`);
