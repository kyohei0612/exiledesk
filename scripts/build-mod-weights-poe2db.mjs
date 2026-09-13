#!/usr/bin/env node
/**
 * build-mod-weights-poe2db.mjs
 * --------------------------------------------------------------
 * poe2db の装備クラスページに埋め込まれた ModsView の JSON から、MOD の「重み (DropChance)」を取り出して
 * クライアントの MOD (data-cache/mods.en.json) と突き合わせ、ティア値つきの重み表を作る (2026-09-14)。
 *
 * 注意: PoE2 のクライアントには重みが無い (0/1 のみ)。poe2db の値は「PoE1 で同系統の MOD が持っていた重み」を
 * 当てはめた推定値で、PoE2 の新 MOD や冒涜 MOD は 1 (未知) のまま。オーナー指示 (2026-09-14) で
 * 「DB の値をそのまま使って期待値をマシにする」ために取り込む。
 *
 *   in : https://poe2db.tw/us/<Page>  (data-cache/poe2db-mods/<Page>.html にキャッシュ)
 *        data-cache/mods.en.json
 *   out: src/i18n/mod-weights-poe2db.json
 *
 * Usage: node scripts/build-mod-weights-poe2db.mjs [--offline] [Page ...]
 *   既定のページ: Helmets_int Helmets_str_int Helmets_dex_int
 * --------------------------------------------------------------
 */
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CACHE_DIR = resolve(ROOT, "data-cache/poe2db-mods");
const OUT = resolve(ROOT, "src/i18n/mod-weights-poe2db.json");
const DEFAULT_PAGES = ["Helmets_int", "Helmets_str_int", "Helmets_dex_int"];
const UA = "ExileDesk/0.1 (+https://github.com/kyohei0612/exiledesk; mod weights build)";

const args = process.argv.slice(2);
const offline = args.includes("--offline");
const pages = args.filter((a) => !a.startsWith("--"));
const PAGES = pages.length ? pages : DEFAULT_PAGES;

const strip = (s) => String(s ?? "").replace(/<[^>]+>/g, "").replace(/—/g, "-").replace(/\s+/g, " ").trim();

async function fetchPage(page) {
  await mkdir(CACHE_DIR, { recursive: true });
  const file = resolve(CACHE_DIR, `${page}.html`);
  try {
    const st = await stat(file);
    if (offline || Date.now() - st.mtimeMs < 24 * 3600 * 1000) return readFile(file, "utf8");
  } catch {
    if (offline) throw new Error(`${page}: キャッシュが無い (offline)`);
  }
  const res = await fetch(`https://poe2db.tw/us/${page}`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${page}: HTTP ${res.status}`);
  const html = await res.text();
  await writeFile(file, html, "utf8");
  // 連続アクセスは 2 秒空ける
  await new Promise((r) => setTimeout(r, 2000));
  return html;
}

function extractModsView(html) {
  const i = html.indexOf("new ModsView(");
  if (i < 0) throw new Error("ModsView が見つからない");
  const start = i + "new ModsView(".length;
  // JSON の終端: 括弧の対応で探す (文字列内の括弧は無視)
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = start; j < html.length; j++) {
    const c = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return JSON.parse(html.slice(start, j + 1));
    }
  }
  throw new Error("ModsView の JSON が閉じていない");
}

const modsEn = JSON.parse(await readFile(resolve(ROOT, "data-cache/mods.en.json"), "utf8"));
/** (domain, gen, name, level, family) → client mod id 候補 */
const index = new Map();
for (const [id, m] of Object.entries(modsEn)) {
  const key = `${m.domain}|${m.generation_type}|${m.name}|${m.required_level}|${m.groups?.[0] ?? ""}`;
  const list = index.get(key) ?? [];
  list.push(id);
  index.set(key, list);
}
const GEN = { 1: "prefix", 2: "suffix" };

function matchClient(domain, gen, name, level, family, tags) {
  const key = `${domain}|${gen}|${name}|${level}|${family}`;
  const ids = index.get(key) ?? [];
  if (ids.length <= 1) return ids[0] ?? null;
  // 複数なら spawn タグが重なる物
  const tagSet = new Set(tags);
  const hit = ids.find((id) => modsEn[id].spawn_weights.some((w) => w.weight > 0 && tagSet.has(w.tag)));
  return hit ?? ids[0];
}

const out = { generatedAt: new Date().toISOString().slice(0, 10), note: "poe2db の推定重み (PoE1 由来、新 MOD と冒涜は 1)。ティア値はクライアント", pages: {} };
for (const page of PAGES) {
  const html = await fetchPage(page);
  const view = extractModsView(html);
  const conv = (domain) => (m) => {
    const gen = GEN[m.ModGenerationTypeID] ?? String(m.ModGenerationTypeID);
    const family = m.ModFamilyList?.[0] ?? "";
    const level = Number(m.Level);
    const weight = Number(m.DropChance) || 0;
    const name = strip(m.Name);
    const clientId = matchClient(domain, gen, name, level, family, m.spawn_no ?? []);
    const stats = clientId ? modsEn[clientId].stats.map((s) => ({ id: s.id, min: s.min, max: s.max })) : [];
    return { id: clientId, family, families: m.ModFamilyList ?? [], gen, name, level, weight, tags: m.spawn_no ?? [], text: strip(m.str), stats };
  };
  const normal = (view.normal ?? []).map(conv("item"));
  const desecrated = (view.desecrated ?? []).map(conv("desecrated"));
  const essence = (view.essence ?? []).concat(view.perfect_essence ?? []).map((m) => ({
    essence: strip(m.Name),
    code: m.Code,
    level: Number(m.Level),
    gen: GEN[m.ModGenerationTypeID] ?? String(m.ModGenerationTypeID),
    family: m.ModFamilyList?.[0] ?? "",
    text: strip(m.str),
    stats: modsEn[m.Code]?.stats?.map((s) => ({ id: s.id, min: s.min, max: s.max })) ?? [],
  }));
  out.pages[page] = { tags: view.baseitem?.tags ?? null, normal, desecrated, essence };
  const unmatched = [...normal, ...desecrated].filter((m) => !m.id);
  console.log(`[mod-weights] ${page}: normal ${normal.length} / desecrated ${desecrated.length} / essence ${essence.length} / 未照合 ${unmatched.length}`);
  if (unmatched.length) console.log("  未照合:", unmatched.map((m) => `${m.gen} ${m.name} L${m.level} ${m.family}`).join("; "));
}
await writeFile(OUT, JSON.stringify(out) + "\n", "utf8");
console.log(`[mod-weights] wrote ${OUT}`);
