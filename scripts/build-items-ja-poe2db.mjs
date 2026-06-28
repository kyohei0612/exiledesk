/**
 * build-items-ja-poe2db.mjs
 *
 * poe2db (JA) の各カテゴリ一覧ページから「英語名 -> 日本語名称」のマップを抽出し、
 * src/i18n/items-ja-poe2db.json として束ねる。
 *
 * 目的: カレンシーランキングで、新リーグの新アイテム(ルーン/タリスマン/蒸留/エッセンス等)が
 *       公式辞書 items-ja.json(RePoE 由来) に未掲載で英語のまま表示される穴を埋める。
 *       items-ja.json は凍結(無回帰)。本辞書は「穴埋め専用フォールバック」。
 *
 * 構造: アイテムアンカー <a ... data-hover="...BaseItemTypes..." href="Slug">日本語名称</a>
 *       href=Slug -> replace(/_/g," ") を英語名キー、アンカー内テキスト(stripTags)を日本語名。
 *       (build-currency-effects-ja.mjs と同じアンカー正規表現・fetchPage・stripTags を流用)
 *
 * 検証: 値が空 / 日本語文字を1つも含まない(純ASCII)ものは破棄(英語名そのままの混入防止)。
 *
 * 使い方: node scripts/build-items-ja-poe2db.mjs   (poe2db から取得)
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "i18n", "items-ja-poe2db.json");

// 取得対象の poe2db JA ページ slug。失敗(404 等)は SKIP。
const PAGES = [
  "Currency",
  "Essence",
  "Omen",
  "Tablet",
  "Soul_Core",
  "Rune",
  "Delirium",
  "Breach",
  "Expedition",
  "Ritual",
  "Ultimatum",
  "Abyss",
  "Incursion",
  "Lineage_Supports",
  // 追加試行(新リーグ系 / 別カテゴリ)。ヒットしなければ SKIP。
  "Talismans",
  "Catalysts",
  "Map_Fragments",
  "Pinnacle_Keys",
  "Splinter",
  "Distilled_Emotion",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stripTags = (s) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

// 日本語文字(ひらがな/カタカナ/漢字/長音/全角記号)を1つでも含むか。
const hasJapanese = (s) =>
  /[぀-ヿ㐀-䶿一-鿿ｦ-ﾟー]/.test(s);

async function fetchPage(slug) {
  const url = `https://poe2db.tw/jp/${slug}`;
  // poe2db は散発的に 5xx を返すため、5xx は数回リトライ。4xx(404 等)は即失敗で SKIP。
  let lastStatus = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(800 * attempt);
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 ExileDesk-build" },
    });
    if (res.ok) return res.text();
    lastStatus = res.status;
    if (res.status < 500) break; // 4xx は恒久エラー
  }
  throw new Error(`${slug}: HTTP ${lastStatus}`);
}

/** 1 ページから { englishName: japaneseName } を抽出。 */
function extract(html) {
  const anchor =
    /<a class="[^"]*"[^>]*data-hover="[^"]*BaseItemTypes[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const out = {};
  let m;
  while ((m = anchor.exec(html)) !== null) {
    const slug = decodeURIComponent(m[1]).split("?")[0].split("/").pop();
    const en = slug.replace(/_/g, " ").trim();
    const ja = stripTags(m[2]);
    if (!en) continue;
    // 開発用ダミー(DNT.../Unused...)は除外。
    if (/^(DNT|Unused)/i.test(en)) continue;
    // 検証: 日本語名が空 / 純ASCII(日本語を含まない) は捨てる。
    if (!ja || !hasJapanese(ja)) continue;
    // 同一英語名が複数回出る場合は最初のヒットを優先(後勝ちしない)。
    if (!out[en]) out[en] = ja;
  }
  return out;
}

async function main() {
  const all = {};
  for (const slug of PAGES) {
    try {
      const html = await fetchPage(slug);
      const got = extract(html);
      let added = 0;
      for (const [k, v] of Object.entries(got)) {
        if (!all[k]) {
          all[k] = v;
          added++;
        }
      }
      console.log(
        `  ${slug}: extracted ${Object.keys(got).length}, new ${added}`,
      );
    } catch (err) {
      console.warn(`  ${slug}: SKIP (${err.message})`);
    }
    await sleep(400);
  }
  // 0件ガード: 全ページが SKIP(ネットワーク障害等)した場合、既存ファイルを空上書きしない。
  if (Object.keys(all).length === 0) {
    console.warn("no items extracted; keeping existing file");
    return;
  }
  const sorted = Object.fromEntries(
    Object.entries(all).sort(([a], [b]) => a.localeCompare(b)),
  );
  await writeFile(OUT, JSON.stringify(sorted, null, 0) + "\n", "utf-8");
  console.log(`\nWrote ${Object.keys(sorted).length} names -> ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
