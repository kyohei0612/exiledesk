#!/usr/bin/env node
/**
 * build-unique-mods-ja.mjs
 * --------------------------------------------------------------
 * 目的:
 *   POE2DB のユニーク特殊 MOD (例: `Reflects opposite Ring`) を
 *   `<英文 MOD>` -> `<日本語訳>` の flat 辞書として生成し、
 *   `src/i18n/unique-mods-ja.json` に書き出す。
 *
 *   UniqueTooltip.vue が `strip(modText)` でこの辞書を引き、
 *   `mods-bundle.json` テンプレ照合では拾えない特殊 MOD を日本語化する。
 *
 * データソース:
 *   POE2DB の種別一覧ページ (静的 HTML)
 *     - 英: https://poe2db.tw/us/<Category>
 *     - 日: https://poe2db.tw/jp/<Category>
 *   <Category> は Rings, Amulets, Belts, ... (POE2 アイテムクラスの複数形)
 *
 *   各ページに <div class="d-flex border-top rounded">...</div> 単位で
 *   ユニーク 1 個分のブロックがあり、内部に
 *     <a class="UniqueItems UniqueItem" href="<slug>">
 *     <div class="explicitMod">[mod html]</div> *
 *   が並ぶ。slug (例: "Kalandras_Touch") で EN/JP ブロックを突合し、
 *   位置順に explicitMod テキストをペアリングして辞書化する。
 *
 * 出力:
 *   src/i18n/unique-mods-ja.json
 *     { "<英文 explicit mod>": "<日本語訳>", ... }
 *
 * 礼節:
 *   - User-Agent に contact 明記
 *   - 1 リクエスト/秒のレート (30 カテゴリ × 2 言語 = 60req で約 1 分)
 *   - 全体で ~60 GET / リーグ初回のみ実行
 *
 * 失敗時の挙動:
 *   - 個別ページの 4xx/5xx/network error は skip (他のページから取得継続)
 *   - 全カテゴリ全滅 → empty `{}` を書き出して進める (UniqueTooltip は英語 fallback)
 *
 * Usage:
 *   node scripts/build-unique-mods-ja.mjs
 *   node scripts/build-unique-mods-ja.mjs --offline   # data-cache 既存ファイル使用
 *
 * @author craft-discovery 君B (Phase κ)
 * @date 2026-05-22
 */

import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CACHE_DIR = resolve(ROOT, "data-cache");
const OUT_FILE = resolve(ROOT, "src/i18n/unique-mods-ja.json");

const USER_AGENT =
  "ExileDesk/0.1 (POE2 personal economy dashboard, +https://github.com/kyohei0612/exiledesk)";

const ARGS = new Set(process.argv.slice(2));
const OFFLINE = ARGS.has("--offline");

/** POE2 主要アイテムクラス (複数形)。`/jp/<cat>` `/us/<cat>` で 200 を確認済 (2026-05-22)。 */
const CATEGORIES = [
  // アクセサリ
  "Rings",
  "Amulets",
  "Belts",
  "Quivers",
  // 防具
  "Shields",
  "Bucklers",
  "Helmets",
  "Boots",
  "Gloves",
  "Body_Armours",
  "Foci",
  // ジュエル系
  "Jewels",
  "Charms",
  "Relics",
  // フラスコ
  "Life_Flasks",
  "Mana_Flasks",
  // 武器
  "Two_Hand_Swords",
  "One_Hand_Swords",
  "Two_Hand_Maces",
  "One_Hand_Maces",
  "Two_Hand_Axes",
  "One_Hand_Axes",
  "Daggers",
  "Claws",
  "Sceptres",
  "Staves",
  "Quarterstaves",
  "Wands",
  "Bows",
  "Crossbows",
  "Spears",
  "Flails",
];

const BASE_URL = "https://poe2db.tw";
const FETCH_DELAY_MS = 1000;

function log(...args) {
  console.log("[build-unique-mods-ja]", ...args);
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 1 カテゴリ × 1 言語の HTML を取得。
 * cache (data-cache/poe2db_<cat>_<lang>.html) 経由。
 */
async function fetchCategoryHtml(lang, cat) {
  const cachePath = resolve(CACHE_DIR, `poe2db_${cat}_${lang}.html`);
  if (OFFLINE) {
    if (!(await exists(cachePath))) {
      log(`offline: cache miss ${cat}/${lang} → skip`);
      return null;
    }
    return await readFile(cachePath, "utf8");
  }

  const url = `${BASE_URL}/${lang}/${cat}`;
  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": lang === "jp" ? "ja" : "en" },
    });
  } catch (e) {
    log(`fetch error ${url}: ${e.message}`);
    if (await exists(cachePath)) {
      return await readFile(cachePath, "utf8");
    }
    return null;
  }
  if (!res.ok) {
    log(`HTTP ${res.status} ${url}`);
    if (await exists(cachePath)) {
      return await readFile(cachePath, "utf8");
    }
    return null;
  }
  const html = await res.text();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, html);
  return html;
}

/**
 * HTML 文字列から `<` `>` タグを除去してプレーンテキストに。
 * `<span class="ndash">—</span>` 等を含むので、まずタグだけ削る。
 * その後 `&amp;` `&nbsp;` `&#39;` 等の最低限の HTML エンティティを復元。
 *
 * Data-L2 修正 (2026-05-22): poe2db 側で 1 つの `<div class="explicitMod">` 内に
 * 複数の MOD 行が `<br>` 区切りで連結されているケース (例:
 *   `Accuracy Rating is Doubled<br>Never deal Critical Hits`)
 * があるため、`<br>` を強制的に改行に変換してからタグ除去する。
 * 戻り値は `splitByNewlines=true` の場合 string[] になり、呼び側で個別 MOD と
 * して使える (false 互換: 単一 string、空白圧縮で連結).
 */
function htmlToText(html, opts = {}) {
  const splitByNewlines = opts.splitByNewlines === true;
  let s = html;
  // Data-L2: `<br>` `<br/>` `<br />` を改行マーカーに変換 (タグ除去前にやる)
  s = s.replace(/<br\s*\/?>/gi, "\n");
  // tag remove
  s = s.replace(/<[^>]+>/g, "");
  // HTML entities (最低限)
  s = s.replace(/&nbsp;/g, " ");
  s = s.replace(/&amp;/g, "&");
  s = s.replace(/&lt;/g, "<");
  s = s.replace(/&gt;/g, ">");
  s = s.replace(/&quot;/g, '"');
  s = s.replace(/&#39;/g, "'");
  s = s.replace(/&apos;/g, "'");
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
  if (splitByNewlines) {
    // 各行ごとに空白圧縮 + trim、空行除外
    return s
      .split(/\n+/)
      .map((line) => line.replace(/[\t ]+/g, " ").trim())
      .filter((line) => line.length > 0);
  }
  // 旧互換: 改行も空白扱いでまとめる
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * 1 ページ HTML を「ユニーク単位ブロック」に分解。
 *
 * 観測 (2026-05-22, /jp/Ring):
 *   <div class="d-flex border-top rounded">
 *     <div class="flex-shrink-0"><a class="UniqueItems UniqueItem" ... href="<Slug>">...</a></div>
 *     <div class="flex-grow-1 ms-2">
 *       <div><a class="UniqueItem" ... href="/<lang>/<Slug>"><span class="uniqueName">...</span> <span class="uniqueTypeLine">...</span></a></div>
 *       <div class="explicitMod">...</div>
 *       <div class="explicitMod">...</div>
 *       ...
 *     </div>
 *   </div>
 *
 * 戻り値: [{ slug, mods: [<plain text>, ...] }, ...]
 *   - slug は `<a class="UniqueItems UniqueItem" ... href="...">` の最初に出る
 *     href (バーストラ無し ナマ slug)。Sekhema's Resolve が 3 ベース分繰り返される
 *     ようなページもあるが、slug ベースなのでマージできる。
 */
function parseUniqueBlocks(html) {
  const blocks = [];
  // d-flex border-top rounded で split (最初の要素はヘッダ部分なので捨てる)
  const parts = html.split(/<div class="d-flex border-top rounded">/);
  if (parts.length <= 1) return blocks;
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    // 次の </div></div></div></div> 系で end が来るが、ここでは
    // 同一文字列内で「class="UniqueItems UniqueItem" ... href="<slug>"」を取り、
    // 続く explicitMod を貪欲に集める (block 終端は次の "d-flex border-top rounded"
    // 分割で自然に確定するため、現在の chunk 内に閉じこめられる)
    // 2026-09-07: poe2db が 2026-05-22〜06-01 の間に class の casing を
    // "UniqueItems uniqueitem" → "UniqueItems UniqueItem" に変えており、
    // 以降この match が全ページで空振りして entries: 0 → 辞書を空で上書きしていた。
    // 再発防止として大文字小文字を無視する (i フラグ)。
    const m =
      chunk.match(/class="UniqueItems UniqueItem"[^>]*href="([^"\/]+)"/i);
    if (!m) continue;
    const slug = m[1];
    const modMatches = [
      ...chunk.matchAll(
        /<div class="explicitMod">([\s\S]*?)<\/div>(?=\s*(?:<div class="(?:explicitMod|implicitMod|enchantMod|flavourText|d-flex)|<\/div>))/g,
      ),
    ];
    // フォールバック: 上の lookahead が空振りした場合は単純 lazy match
    const fallback =
      modMatches.length === 0
        ? [...chunk.matchAll(/<div class="explicitMod">([\s\S]*?)<\/div>/g)]
        : modMatches;
    // Data-L2: 1 explicitMod の中身を `<br>` で分割可能なら個別 MOD として展開する。
    // 旧実装は htmlToText が改行を空白圧縮するため、
    // `Accuracy Rating is Doubled<br>Never deal Critical Hits` のような MOD が
    // 1 文字列に潰れて辞書キーが「Accuracy Rating is DoubledNever deal Critical Hits」
    // のような連結文字列で固定化されていた (unique-mods-ja.json の混入バグ)。
    const mods = [];
    for (const m2 of fallback) {
      const lines = htmlToText(m2[1], { splitByNewlines: true });
      for (const line of lines) {
        if (line.length > 0) mods.push(line);
      }
    }
    if (mods.length === 0) continue;
    blocks.push({ slug, mods });
  }
  return blocks;
}

/**
 * 1 カテゴリ分の EN/JP HTML を読み、slug をキーに同じ位置の mod 同士で
 * { en -> ja } のペアを返す。
 *
 * 同じ slug が複数ブロックで現れた場合 (例: Sekhema's Resolve のベース違い):
 *   - 各ブロック内で順番にペア化、辞書には全て登録 (重複は後勝ち上書き)
 *   - EN と JP で同じ slug かつ同じ mod 数を持つブロック数が一致しない場合は
 *     重複出現の順序で zip するため、ズレが起きるリスクはあるがフラット辞書
 *     なので影響範囲は限定的 (同種ベースは同じ mod を共有するケースが多い)
 */
function pairModsByCategory(enHtml, jaHtml) {
  const enBlocks = parseUniqueBlocks(enHtml);
  const jaBlocks = parseUniqueBlocks(jaHtml);

  // slug -> 配列 (出現順)
  const enBySlug = new Map();
  const jaBySlug = new Map();
  for (const b of enBlocks) {
    if (!enBySlug.has(b.slug)) enBySlug.set(b.slug, []);
    enBySlug.get(b.slug).push(b.mods);
  }
  for (const b of jaBlocks) {
    if (!jaBySlug.has(b.slug)) jaBySlug.set(b.slug, []);
    jaBySlug.get(b.slug).push(b.mods);
  }

  /** @type {Array<[string, string]>} */
  const pairs = [];
  let blocksPaired = 0;
  let blocksSkipped = 0;
  for (const [slug, enList] of enBySlug) {
    const jaList = jaBySlug.get(slug);
    if (!jaList) {
      blocksSkipped += enList.length;
      continue;
    }
    const len = Math.min(enList.length, jaList.length);
    for (let i = 0; i < len; i++) {
      const enMods = enList[i];
      const jaMods = jaList[i];
      if (enMods.length !== jaMods.length) {
        // mod 数が違うブロック: 位置突合が崩れるので skip
        blocksSkipped++;
        continue;
      }
      for (let k = 0; k < enMods.length; k++) {
        const en = enMods[k];
        const ja = jaMods[k];
        if (!en || !ja) continue;
        if (en === ja) continue; // 翻訳されてないものは入れない (英字残しの可能性)
        pairs.push([en, ja]);
      }
      blocksPaired++;
    }
  }
  return {
    pairs,
    stats: {
      enBlocks: enBlocks.length,
      jaBlocks: jaBlocks.length,
      slugIntersect:
        [...enBySlug.keys()].filter((s) => jaBySlug.has(s)).length,
      blocksPaired,
      blocksSkipped,
    },
  };
}

async function main() {
  /** @type {Record<string, string>} */
  const dict = {};
  let dupOverwrite = 0;
  const visitedUrls = [];
  let categoriesFetched = 0;
  let categoriesSkipped = 0;

  for (const cat of CATEGORIES) {
    if (!OFFLINE) {
      // online 時のみ待機 (連続 fetch のレート抑制)
      await sleep(FETCH_DELAY_MS);
    }
    const enHtml = await fetchCategoryHtml("us", cat);
    if (!OFFLINE) {
      await sleep(FETCH_DELAY_MS);
    }
    const jaHtml = await fetchCategoryHtml("jp", cat);
    if (!enHtml || !jaHtml) {
      categoriesSkipped++;
      log(`skipped category ${cat} (en=${!!enHtml}, ja=${!!jaHtml})`);
      continue;
    }
    categoriesFetched++;
    visitedUrls.push(`${BASE_URL}/jp/${cat}`);
    visitedUrls.push(`${BASE_URL}/us/${cat}`);

    const { pairs, stats } = pairModsByCategory(enHtml, jaHtml);
    let added = 0;
    for (const [en, ja] of pairs) {
      if (Object.prototype.hasOwnProperty.call(dict, en)) {
        if (dict[en] !== ja) dupOverwrite++;
      }
      dict[en] = ja;
      added++;
    }
    log(
      `${cat}: en=${stats.enBlocks} ja=${stats.jaBlocks} pair-blocks=${stats.blocksPaired} skip=${stats.blocksSkipped} mods+=${added}`,
    );
  }

  // キーをアルファベット順にして diff を見やすく
  const sorted = {};
  for (const k of Object.keys(dict).sort()) sorted[k] = dict[k];

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(sorted, null, 2) + "\n");

  log("─".repeat(60));
  log(`OUTPUT: ${OUT_FILE}`);
  log(`entries: ${Object.keys(sorted).length}`);
  log(`categories fetched: ${categoriesFetched}, skipped: ${categoriesSkipped}`);
  log(`duplicate-en overwrites (same key, different ja): ${dupOverwrite}`);
  log(`scraped pages: ${visitedUrls.length} (${visitedUrls.slice(0, 5).join(", ")}${visitedUrls.length > 5 ? ", ..." : ""})`);
}

main().catch((e) => {
  console.error("[build-unique-mods-ja] FAILED:", e);
  process.exit(1);
});
