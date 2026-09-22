#!/usr/bin/env node
/**
 * build-granted-skills-poe2db.mjs
 * --------------------------------------------------------------
 * ベースに元から乗っている**付与スキル**を poe2db から取る (2026-09-22)。
 *
 * オーナー指示:「付与スキル入れて。これは付くスキルを指定して作れると思う。
 * ベースを選んだ時点で何のスキルが付く奴を選ぶか決める方針でおｋ」。
 *
 * ## なぜクライアントから取らないのか
 * クライアントには `ItemInherentSkills` (253 行) という表があり、「不在のアミュレット」の行は
 * ちゃんと **7 個**入っています (poe2db の 7 個と一致)。**ですが参照先が解決できません**:
 *   格納値 [300, 303, 354, 411, 714, 968, 1076]
 *   ActiveSkills 直引き  → プロフェンディケイ / (空) / パーフォレイト …  ✗
 *   GrantedEffects 経由 → ペインオファリング / コマンド / …           ✗
 *   本来: ActiveSkills の trinity=948 / GrantedEffects の TrinityPlayer=7911
 * どちらとも合わず、**スキーマがこの表で PoE2 とずれている**と見ています
 * (`AlternateQualityTypes.ModEffectStat` が `level` を返すのと同じ壊れ方)。
 * 当てずっぽうで解決するより、正しく描画できている poe2db から取るほうが確実です。
 * 重みも同じ出どころなので経路も揃います。
 *
 * ## 取り方
 * クラスのページ (`/us/Amulets` 等) に全ベースが並んでいて、ベースごとに
 * `div.flex-grow-1.ms-2` の中へ `<div class="implicitMod">Grants Skill: Level N <a>名前</a></div>`
 * が入っています。クラス単位なので**ページは 20 枚ちょっと**で済みます。
 *
 * ## 付与スキルのレベル
 * poe2db が出すのは**素のレベル** (不在のアミュレットなら 12)。**パーフェクトフラックス**
 * (`CurrencyUpgradeInherentTo20`、「アイテムの固有スキルをレベル20にアップグレードする」) で
 * 20 に上げられます。確率は無く 1 個で確定なので、費用だけの話です。
 *
 * in : https://poe2db.tw/us/<Class>  (data-cache/poe2db-bases/<Class>.html にキャッシュ)
 * out: data-cache/poe2db-granted-skills.json
 *
 * Usage: node scripts/build-granted-skills-poe2db.mjs [--offline] [Class ...]
 * --------------------------------------------------------------
 */
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = resolve(ROOT, "data-cache/poe2db-bases");
const OUT = resolve(ROOT, "data-cache/poe2db-granted-skills.json");
const UA = "ExileDesk/0.1 (+https://github.com/kyohei0612/exiledesk; base granted skills)";

/** poe2db のクラスページ名。装備だけ (ジュエル / フラスコは扱わない) */
const PAGES = [
  "Amulets", "Rings", "Belts", "Body_Armours", "Helmets", "Gloves", "Boots",
  "Shields", "Foci", "Quivers", "Bucklers",
  "Wands", "Sceptres", "Staves", "Quarterstaves", "Bows", "Crossbows", "Spears",
  "One_Hand_Maces", "Two_Hand_Maces", "Talismans",
];

const args = process.argv.slice(2);
const offline = args.includes("--offline");
const pages = args.filter((a) => !a.startsWith("--"));
const TARGETS = pages.length ? pages : PAGES;

const log = (...a) => console.log("[granted-skills]", ...a);

/** 1 ページ取る。キャッシュがあればそれを使う */
async function fetchPage(name) {
  const path = resolve(CACHE_DIR, `${name}.html`);
  try {
    await stat(path);
    return { html: await readFile(path, "utf8"), cached: true };
  } catch {
    /* 無ければ取る */
  }
  if (offline) return null;
  const res = await fetch(`https://poe2db.tw/us/${name}`, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    log(`WARN ${name}: HTTP ${res.status}`);
    return null;
  }
  const html = await res.text();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(path, html, "utf8");
  // 連続で叩かない
  await new Promise((r) => setTimeout(r, 1200));
  return { html, cached: false };
}

const stripTags = (s) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/**
 * ページから「ベース名 → 付与スキル」を拾う。
 *
 * ベースの塊は `<div class="flex-grow-1 ms-2">` で、その中に名前 (`<a ...>Absent Amulet</a>`) と
 * `implicitMod` が並びます。塊ごとに切って、中の `Grants Skill: Level N 名前` を集めます。
 */
function parse(html) {
  const out = {};
  // 塊の開始位置で切る (終わりは次の塊の手前 / 終端)
  const marks = [...html.matchAll(/<div class="flex-grow-1 ms-2"/g)].map((m) => m.index);
  for (let i = 0; i < marks.length; i++) {
    const chunk = html.slice(marks[i], marks[i + 1] ?? html.length);
    // 名前は塊の先頭の `class="whiteitem <クラス>"` のリンク (相対 href)。
    // **スキルへのリンクと間違えないこと**: スキルは `/us/<名前>` の絶対 href で、
    // 先に拾うとベース名の代わりにスキル名が入る (最初の実装でやらかした)
    // `whiteitem` = ベースタイプ。`UniqueItem` はユニーク装備なので**除く** (作る対象ではない)
    const nameM = /<a[^>]*class="whiteitem[^"]*"[^>]*>([^<]{2,60})<\/a>/.exec(chunk);
    if (!nameM) continue;
    const base = stripTags(nameM[1]);
    const skills = [];
    // **レベルは付いていないことのほうが多い。**アミュレットは「Level 12 トリニティ」と出るが、
    // 盾 / 槍 / 杖などのベースは「Grants Skill: <名前>」だけ。必須にすると大半を取りこぼす。
    for (const m of chunk.matchAll(/Grants Skill:\s*(?:Level\s*(\d+)\s*)?<a[^>]*>([^<]+)<\/a>/g)) {
      skills.push({ ...(m[1] ? { level: Number(m[1]) } : {}), en: stripTags(m[2]) });
    }
    if (skills.length) out[base] = skills;
  }
  return out;
}

const main = async () => {
  const granted = {};
  let fetched = 0;
  let cachedN = 0;
  for (const name of TARGETS) {
    const got = await fetchPage(name);
    if (!got) {
      log(`${name}: 取れませんでした${offline ? " (--offline でキャッシュ無し)" : ""}`);
      continue;
    }
    got.cached ? cachedN++ : fetched++;
    const found = parse(got.html);
    const n = Object.keys(found).length;
    log(`${name.padEnd(16)} 付与スキルを持つベース ${n} 件${got.cached ? " (キャッシュ)" : ""}`);
    Object.assign(granted, found);
  }
  const bases = Object.keys(granted).length;
  const skills = new Set(Object.values(granted).flat().map((s) => s.en));
  await writeFile(
    OUT,
    JSON.stringify({ generated: new Date().toISOString().slice(0, 10), source: "poe2db.tw のクラスページ", granted }, null, 1) + "\n",
    "utf8",
  );
  log(`合計 ${bases} ベース / スキル ${skills.size} 種 (取得 ${fetched} / キャッシュ ${cachedN})`);
  log(`-> ${OUT}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
