/**
 * build-currency-effects-ja.mjs
 *
 * poe2db (JA) のカテゴリ一覧ページから「カレンシー/エッセンス等の効果説明(日本語)」を抽出し、
 * src/i18n/currency-effects-ja.json として束ねる。通貨ランキングのホバー詳細効果に使う。
 * (オーナー指示 2026-06-03: ホバーで詳細効果。データ源=poe2db JA。)
 *
 * 構造: アイテムアンカー <a ... data-hover="...BaseItemTypes...Items..." href="Slug">名称</a>
 *       の直後に続く <div class="explicitMod">効果</div>(複数行可) を効果テキストとする。
 *       "KeywordPopups"(最低モッドレベル等) はノイズなので名称アンカーには採らない。
 *
 * キーは EN 名を正規化(小文字・英数のみ)したもの。フロントは同じ正規化で引く。
 * 使い方: node scripts/build-currency-effects-ja.mjs   (poe2db から取得)
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "i18n", "currency-effects-ja.json");

// 取得対象の poe2db JA ページ slug（効果説明を持つカテゴリ）。
const PAGES = [
  "Currency",
  "Essence",
  "Omen",
  "Tablet",
  "Soul_Core",
  "Rune",
  "Lineage_Supports",
  "Verisium",
  "Delirium",
  "Breach",
  "Expedition",
  "Ritual",
  "Ultimatum",
  "Abyss",
  "Incursion",
];

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
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

async function fetchPage(slug) {
  const url = `https://poe2db.tw/jp/${slug}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 ExileDesk-build" },
  });
  if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`);
  return res.text();
}

/** 1 ページから { normalizedEnName: {e:[効果], s:スタック, lv:レベル} } を抽出。 */
function extract(html) {
  const anchor =
    /<a class="[^"]*"[^>]*data-hover="[^"]*BaseItemTypes[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const items = [];
  let m;
  while ((m = anchor.exec(html)) !== null) {
    const slug = decodeURIComponent(m[1]).split("?")[0].split("/").pop();
    items.push({ pos: m.index, en: slug.replace(/_/g, " ") });
  }
  // 効果テキスト: explicitMod(カレンシー/エッセンス等) と implicitMod(ルーン/ソウルコア等) の両方。
  const emRe = /<div class="(?:explicitMod|implicitMod)">([\s\S]*?)<\/div>/g;
  // スタック数 / 装備条件(レベル) は property / requirements div から。
  const stackRe = /<div class="property">スタック数:\s*<span[^>]*>([^<]+)<\/span>/;
  const reqRe = /<div class="requirements">[\s\S]*?<span[^>]*>([^<]+)<\/span>/;
  const out = {};
  for (let i = 0; i < items.length; i++) {
    const start = items[i].pos;
    const end = i + 1 < items.length ? items[i + 1].pos : start + 2500;
    const seg = html.slice(start, end);
    const effs = [];
    let e;
    emRe.lastIndex = 0;
    while ((e = emRe.exec(seg)) !== null) {
      const t = stripTags(e[1]);
      if (t && !effs.includes(t)) effs.push(t);
    }
    if (!effs.length) continue;
    const sm = seg.match(stackRe);
    const rm = seg.match(reqRe);
    const entry = { e: effs };
    if (sm) entry.s = stripTags(sm[1]);
    if (rm) entry.lv = stripTags(rm[1]);
    const key = norm(items[i].en);
    // 既出キーは効果行が多い(=情報量多い)方を優先
    if (!out[key] || effs.length > out[key].e.length) out[key] = entry;
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
        } else if (v.e.length > all[k].e.length) {
          all[k] = v;
        }
      }
      console.log(`  ${slug}: extracted ${Object.keys(got).length}, new ${added}`);
    } catch (err) {
      console.warn(`  ${slug}: SKIP (${err.message})`);
    }
  }
  const sorted = Object.fromEntries(
    Object.entries(all).sort(([a], [b]) => a.localeCompare(b)),
  );
  await writeFile(OUT, JSON.stringify(sorted, null, 0) + "\n", "utf-8");
  console.log(`\nWrote ${Object.keys(sorted).length} effects -> ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
