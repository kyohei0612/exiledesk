#!/usr/bin/env node
/**
 * build-jewel-bases.mjs — ジュエルのベースと MOD (2026-10-11 オーナー「ジュエルクラフト、DB のデータから全部取って」)。
 *
 * 正は poe2db (オーナーの言う「DB」)。data-cache/poe2db-jewels/jewel-mods.json = poe2db の今のページ 8 枚から取った、
 * ベースごとの MOD の一覧 (プレ / サフィ・系統・文面・重み) と、液化した感情・コラプトの付与・冒涜の一覧。
 * クライアントのデータ (data-cache/mods.en.json) は、その MOD の stat の id と数値の幅、日本語の文面の元を借りるだけ
 * (名前・側・系統・文面で突き合わせ。合わない物があれば落とす)。日本語のベース名はクライアントの表から。
 *
 * 出す物: src/services/htc/jewel-bases.json — 部位 (クラス) 8 つ、MOD、ベースの情報 (日本語名・暗黙)、液化した感情の表。
 * 重み: poe2db は全部 1 (どの MOD も同じだけ出る。Craft of Exile も同じ)。他の部位と混ぜても割合が崩れないよう、
 * 普通は 1000、冒涜は他の部位と同じ仮の 2500 にそろえる (冒涜の発現は専用と普通を別々に引くので、混ぜ方には効かない)。
 *   node scripts/build-jewel-bases.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanDisplayTags } from "./_htc-mod-build.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rj = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));
const P2 = rj("data-cache/poe2db-jewels/jewel-mods.json").bases;
/** poe2db の日本語のページ (/jp/) の同じ行の文面 (英語の文 → 日本語の文)。並びと系統が全部一致するのを確かめて作った */
const JA_TEXT = rj("data-cache/poe2db-jewels/jewel-text-ja.json");
const MODS = rj("data-cache/mods.en.json");
const ja = rj("data-cache/client-export-baseinfo/tables/Japanese/BaseItemTypes.json");
const en = rj("data-cache/client-export-baseinfo/tables/English/BaseItemTypes.json");
const rowsOf = (t) => (Array.isArray(t) ? t : t.rows);

/** poe2db のページ名 → 部位の id。色ごとに付く MOD が違うので、ベース 1 つ = 部位 1 つ */
const CLASSES = {
  Ruby: "Jewels_str", Emerald: "Jewels_dex", Sapphire: "Jewels_int", Diamond: "Jewels_diamond",
  "Time-Lost_Ruby": "Jewels_radius_str", "Time-Lost_Emerald": "Jewels_radius_dex", "Time-Lost_Sapphire": "Jewels_radius_int", "Time-Lost_Diamond": "Jewels_radius_diamond",
};
const WEIGHT = { normal: 1000, desecrated: 2500 };
const DOMAIN = { normal: "misc", desecrated: "desecrated" };

// 文面は数・記号を # にして比べる (poe2db "(4-6)% increased Area of Effect" / クライアント "(4-6)% increased [Area of Effect]")
const norm = (t) => String(t ?? "").replace(/\[([^\]|]*\|)?([^\]]*)\]/g, "$2").replace(/^\+/gm, "")
  .replace(/\(\s*-?[\d.]+\s*[-—–]\s*-?[\d.]+\s*\)|-?[\d.]+/g, "#").replace(/\s+/g, " ").trim().toLowerCase();
const firstLine = (t) => norm(String(t ?? "").split("\n")[0]);
/** 行の順番が違っても同じ物 (冒涜の 2 行の MOD はクライアントと poe2db で行の順が逆) */
const lineSet = (t) => String(t ?? "").split("\n").map(norm).filter((l) => !l.startsWith("local ")).sort().join("|");
/** 文面から作る短い印 (クライアントに無い MOD の id 用) */
const hashOf = (t) => { let h = 5381; for (const ch of String(t)) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0; return h.toString(36); };
const clientList = Object.entries(MODS).map(([id, m]) => ({ id, ...m }));

function matchClient(e, pool) {
  const dom = DOMAIN[pool];
  const fam = new Set(e.families ?? []);
  const cands = clientList.filter((m) => m.domain === dom && m.generation_type === e.gen && (m.groups ?? []).some((g) => fam.has(g)));
  if (e.code) { const c = cands.find((m) => m.id === e.code) ?? clientList.find((m) => m.id === e.code); if (c) return c; }
  const full = cands.filter((m) => lineSet(m.text) === lineSet(e.text));
  const pick = (xs) => xs.find((m) => m.name === e.name) ?? (xs.length === 1 ? xs[0] : null);
  return pick(full) ?? pick(cands.filter((m) => firstLine(m.text) === firstLine(e.text))) ?? null;
}

const items = [];
const mods = new Map();
const baseInfo = {};
const emotions = {};
/** 液化した感情の英語名 → 日本語名 (クライアントの同じ行) */
const emotionNames = {};
const corrupted = {};
const misses = [];
/** 画面に出さない中の行 ("local jewel effect base radius [150]") を外す */
const clean = (t) => String(t ?? "").split("\n").filter((l) => !/^local .*\[/.test(l)).join("\n");
/** 文面の (a-b) を順に数値の幅に */
const rangesOf = (t) => [...String(t).matchAll(/\((-?[\d.]+)-(-?[\d.]+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]);
for (const [page, cls] of Object.entries(CLASSES)) {
  const b = P2[page];
  if (!b) { misses.push(`${page}: poe2db の行が無い`); continue; }
  const pools = { normal: { prefixes: [], suffixes: [] }, desecrated: { prefixes: [], suffixes: [] }, essence: { prefixes: [], suffixes: [] } };
  for (const pool of ["normal", "desecrated"]) {
    for (const e of b.pools[pool] ?? []) {
      if (e.gen !== "prefix" && e.gen !== "suffix") continue;
      // 文面・数値の幅は poe2db。クライアントは stat の id を借りるだけ (時を失ったジュエルの「範囲内の…」はクライアントの文が違うので、合わなければ id 無し)
      const c = matchClient(e, pool);
      const text = clean(e.text);
      const ranges = rangesOf(text);
      const stats = c && (c.stats ?? []).length === ranges.length ? c.stats.map((x) => x.id) : [];
      const key = c?.id ?? `${(e.families ?? [])[0] ?? "Mod"}_${hashOf(e.text)}`;
      const id = `${cls}/${key}`;
      if (mods.has(id)) { misses.push(`${page}: id がぶつかる ${id}`); continue; }
      if (!JA_TEXT[e.text]) misses.push(`${page}: 日本語の文が無い "${e.text}"`);
      const families = e.families?.length ? e.families : c?.groups ?? [];
      mods.set(id, {
        id, source: pool, type: e.gen, family: families[0], ...(families.length > 1 ? { families } : {}),
        tags: (e.spawn_tags ?? []).filter((t) => t !== "default"),
        displayTags: cleanDisplayTags([...(c?.implicit_tags ?? []), ...(e.mod_tags ?? [])]),
        text, textJa: clean(JA_TEXT[e.text] ?? ""),
        tiers: [{ name: e.name || c?.name || "", ilvl: e.level || 1, weight: WEIGHT[pool], ranges, stats }],
        weightSource: "poe2db-equal",
      });
      pools[pool][e.gen === "prefix" ? "prefixes" : "suffixes"].push(id);
    }
  }
  // ベース名: 英語は poe2db、日本語はクライアントの表 (同じ行。オーナー「日本語はクライアントから、タイムロストはそのまま」)
  const idx = rowsOf(en).findIndex((r) => r.Id === b.item_type);
  const jaName = idx >= 0 ? rowsOf(ja)[idx]?.Name : null;
  if (!jaName) misses.push(`${page}: クライアントに日本語名が無い (${b.item_type})`);
  const radius = page.startsWith("Time-Lost");
  // 時を失ったジュエルの暗黙 (範囲) は、ゲームの表示の文が poe2db に無い (中の値 "local jewel effect base radius" だけ) ので出さない。推測で訳さない (2026-10-11)
  void radius;
  baseInfo[b.name_en] = { cls, ja: jaName ?? b.name_ja, lvl: 20, implicits: [] };
  items.push({ id: cls, name: b.name_en, bases: [b.name_en], category: "Jewels", pools, limits: { prefixes: 2, suffixes: 2, crafted: 1 } });
  // 液化した感情 (デリリウム): 感情の名前 → 付く MOD (作った MOD)。中身はデリリウムの手 (後で) が読む
  // 感情で付く MOD は「作った MOD」(エッセンスと同じ扱い: 系統は crafted: で別、1 つまで)。置き場には入れず、感情の手だけが付ける
  emotions[cls] = (b.pools.liquid ?? []).map((e) => {
    const modId = `${cls}/Emotion_${e.code ?? hashOf(e.text)}`;
    const text = clean(e.text);
    if (!JA_TEXT[e.text]) misses.push(`${page}: 感情の日本語の文が無い "${e.text}"`);
    if (!mods.has(modId)) mods.set(modId, {
      id: modId, source: "essence", type: e.gen, family: (e.families ?? [])[0], ...((e.families ?? []).length > 1 ? { families: e.families } : {}),
      tags: [], displayTags: cleanDisplayTags(e.mod_tags ?? []), text, textJa: clean(JA_TEXT[e.text] ?? ""),
      tiers: [{ name: e.name, ilvl: 1, weight: 0, ranges: rangesOf(text), stats: [] }], weightSource: "poe2db-equal",
    });
    return { item: e.name, code: e.code, side: e.gen, families: e.families, text, modId };
  });
  for (const e of b.pools.liquid ?? []) {
    const i = rowsOf(en).findIndex((r) => r.Name === e.name && /DistilledEmotion/.test(r.Id ?? ""));
    if (i >= 0) emotionNames[e.name] = rowsOf(ja)[i].Name;
    else misses.push(`${page}: 感情の日本語名が無い ${e.name}`);
  }
  const cj = (e) => ({ name: e.name, families: e.families, text: clean(e.text), ja: clean(JA_TEXT[e.text] ?? "") });
  corrupted[cls] = { enchants: (b.pools.corrupted ?? []).map(cj), upgrades: (b.pools.corruption_upgrade ?? []).map(cj) };
}
if (misses.length) {
  console.log(`NG: poe2db の MOD とクライアントが合わない物 ${misses.length} 件`);
  for (const m of misses.slice(0, 40)) console.log("   " + m);
  process.exit(1);
}
const out = {
  generated: new Date().toISOString().slice(0, 10),
  source: "poe2db (2026-10-11 の今のページ) + クライアントの stat / 日本語名",
  items, mods: [...mods.values()], baseInfo, emotions, emotionNames, corrupted,
};
writeFileSync(resolve(ROOT, "src/services/htc/jewel-bases.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`ジュエル: 部位 ${items.length}・MOD ${mods.size}`);
for (const it of items) console.log(`  ${it.id} (${it.name} / ${baseInfo[it.name].ja}): 普通 ${it.pools.normal.prefixes.length}/${it.pools.normal.suffixes.length}・冒涜 ${it.pools.desecrated.prefixes.length}/${it.pools.desecrated.suffixes.length}・感情 ${emotions[it.id].length}`);
