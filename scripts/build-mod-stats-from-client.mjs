#!/usr/bin/env node
/**
 * build-mod-stats-from-client.mjs — stat の id を持たない MOD (エッセンス・パーフェクトエッセンス・冒涜) に stat を付ける (2026-10-12)
 *
 * 同梱データ (poe2db から組んだエッセンス・冒涜のプール) は段の stats が空で、アイテムの上の数値 (アーマー・回避力・ES・物理ダメージ) に
 * 足せなかった (要望 6646644d「強化のエッセンス系を打ってもアーマー・回避・エナジーシールドの値が変化しない」)。
 *
 * 決め方 (推測で当てない):
 *   1. エッセンスの段は「実際に付く MOD」のクライアントの id (codes) を持っている。そのクラスの普通の MOD と stat の組が同じ code を選び、
 *      クライアントの Mods 表の Stat1..8 を使う (英雄の鎧の強化のエッセンス = LocalIncreasedArmourAndEvasion2 = local_armour_and_evasion_+%)。
 *      文も付く MOD の文に直す (「アーマー、回避力およびエナジーシールド」は説明文で、胴 (筋力/器用さ) に付くのは「アーマーと回避力」)
 *   2. codes の無い段 (冒涜など) は、同じクラスの普通の MOD に同じ文があればその stats (無ければ全クラスで stats が 1 通りに決まる時だけ)
 *   どちらでも決まらない物は付けない (ローカルでない物は上の数値に関係しない)。
 * 出力: src/services/htc/mod-stats.json { [modId]: { stats: string[][] (段ごと), fixed?, text?, tags? (中身のタグ、カタリストの品質用) } }。patch.ts の applyExtras が重ねる。
 *
 *   node scripts/build-mod-stats-from-client.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const T = resolve(ROOT, "data-cache/client-export-mods/tables/English");
const json = async (p) => JSON.parse(await readFile(p, "utf8"));
const [M, S, TG] = await Promise.all([json(`${T}/Mods.json`), json(`${T}/Stats.json`), json(`${T}/Tags.json`)]);
const byId = new Map(M.map((m) => [m.Id, m]));
/** クライアントの行の stat と値の幅 */
const rowStats = (m) => {
  const out = [];
  for (let i = 1; i <= 8; i++) if (m[`Stat${i}`] != null) out.push({ id: S[m[`Stat${i}`]].Id, lo: m[`Stat${i}Value`][0], hi: m[`Stat${i}Value`][1] });
  // 中身のタグ (implicit_tags。普通の MOD の tags と同じ物で、カタリストの品質はこれで伸びる)
  out.tags = (m.ImplicitTags ?? []).map((i) => TG[i]?.Id).filter(Boolean);
  return out;
};
// code の無い段 (冒涜 = クライアントの AbyssMod…・合金など) は段の名前 (「Kurgal's」「Transcendent Alloy」) で引く
const byName = new Map();
for (const m of M) if (m.Name) (byName.get(m.Name) ?? byName.set(m.Name, []).get(m.Name)).push(m);
// アプリと同じ applyExtras を通した MOD (poe2db の直しで足した盾・フォーカス・タリスマンのエッセンスも入る)
// 前回の mod-stats.json で文を差し替える前の MOD を見たいので、空にしてから束ねる (2 回回しても同じ答えになるように)
await writeFile(resolve(ROOT, "src/services/htc/mod-stats.json"), "{}");
const { bundleEntry } = await import("./_bundle-ts.mjs");
const { loadPatchSync, htcBaseInfo } = await bundleEntry("scripts/_htc-bridge-entry.ts");
const mods = [...loadPatchSync().mods.values()];

const cls = (id) => id.split("/")[0];
const key = (st) => [...st].sort().join("|");
// クラスごとの普通の MOD: stat の組 → 文、文 → stat の組
const normal = new Map();
const classStats = new Map();
const globalText = new Map();
for (const m of mods) {
  if (m.source !== "normal") continue;
  const st = m.tiers.find((t) => t.stats?.length)?.stats;
  if (!st) continue;
  const c = normal.get(cls(m.id)) ?? normal.set(cls(m.id), { byStats: new Map(), byText: new Map() }).get(cls(m.id));
  c.byStats.set(key(st), m.text);
  for (const id of st) (classStats.get(cls(m.id)) ?? classStats.set(cls(m.id), new Set()).get(cls(m.id))).add(id);
  // 段をまたいで値の動かない stat (「Adds 1 to #」の 1) は固定
  c.byText.set(m.text, st.map((id, i) => {
    const vs = m.tiers.map((t) => (t.ranges ?? [])[i] ?? [0, 0]);
    const fixed = vs.every((r) => Number(r[0]) === Number(r[1]) && Number(r[0]) === Number(vs[0][0]));
    return { id, lo: Number(vs[0][0]), hi: Number(vs[0][1]), fixed };
  }));
  c.byText.get(m.text).tags = [...(m.tags ?? [])];
  (globalText.get(m.text) ?? globalText.set(m.text, new Map()).get(m.text)).set(JSON.stringify(st), c.byText.get(m.text));
}
/**
 * クライアントの行を段の ranges に合わせる。数が同じならそのまま。多ければ幅の無い (lo = hi) stat を固定の値として外す
 * (「Adds 1 to # Lightning Damage」の 1、「15% reduced Attack Speed」の -15)。符号が逆の物は使わない
 */
function fit(rs, ranges) {
  const vary = rs.length === ranges.length ? rs : rs.filter((r) => (r.fixed ?? r.lo === r.hi) === false);
  if (vary.length !== ranges.length || !ranges.length) return null;
  if (vary.some((r, i) => Math.sign(r.lo + r.hi) !== Math.sign(Number(ranges[i][0]) + Number(ranges[i][1])))) return null;
  const fixed = rs.filter((r) => !vary.includes(r)).map((r) => [r.id, r.lo]);
  return { stats: vary.map((r) => r.id), fixed, tags: rs.tags ?? [] };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sameFit = (f, g) => same(f.stats, g.stats) && same(f.fixed, g.fixed);
/** 候補が割れた時: stat の id の語と MOD の文の語がよく重なる 1 つ (同点なら決めない) */
function bestByWords(cands, text) {
  const words = new Set(text.toLowerCase().match(/[a-z]+/g) ?? []);
  const score = (f) => f.stats.concat(f.fixed.map((x) => x[0])).join("_").split(/[_+%]+/).filter((w) => w.length > 2 && words.has(w)).length;
  const sc = cands.map(score);
  const top = Math.max(...sc);
  const best = cands.filter((_, i) => sc[i] === top);
  return top > 0 && best.every((f) => sameFit(f, best[0])) ? best[0] : null;
}
const abs2 = (r) => [Math.abs(Number(r[0])), Math.abs(Number(r[1]))];
/** 値の幅がちょうど同じ行を、段の ranges の順に並べ直して合わせる (合金の「物理 / 全能力値」は行と順が逆) */
function fitExact(rs, ranges, text = "") {
  // 幅が同じ stat が複数ある時は、その行の文と語が重なる方 (「Spell Damage / Minions deal …」の順)
  const lines = text.toLowerCase().split(/\n/);
  const hits = (r, i) => r.id.split(/[_+%]+/).filter((w) => w.length > 2 && (lines[i] ?? "").includes(w)).length;
  const vary = rs.filter((r) => r.lo !== r.hi);
  if (vary.length !== ranges.length || !ranges.length) return null;
  const used = new Set();
  const order = ranges.map((rg, i) => {
    const ok = vary.filter((r) => !used.has(r) && same(abs2([r.lo, r.hi]), abs2(rg))).sort((a, b) => hits(b, i) - hits(a, i));
    if (ok[0]) used.add(ok[0]);
    return ok[0];
  });
  if (order.some((r) => !r) || order.some((r, i) => Math.sign(r.lo + r.hi) !== Math.sign(Number(ranges[i][0]) + Number(ranges[i][1])))) return null;
  return { stats: order.map((r) => r.id), fixed: rs.filter((r) => r.lo === r.hi).map((r) => [r.id, r.lo]), tags: rs.tags ?? [] };
}
// 値の幅 → クライアントの行 (どれにも決まらない段の最後の手。クラスの普通の MOD が使う stat だけの行に絞る)
const byRange = new Map();
for (const m of M) {
  if (m.Domain !== 1) continue;
  const rs = rowStats(m).filter((r) => r.lo !== r.hi);
  if (rs.length) for (const r of rs) (byRange.get(`${Math.abs(r.lo)},${Math.abs(r.hi)}`) ?? byRange.set(`${Math.abs(r.lo)},${Math.abs(r.hi)}`, []).get(`${Math.abs(r.lo)},${Math.abs(r.hi)}`)).push(m);
}

const out = {};
const n = { code: 0, abyss: 0, text: 0, range: 0, none: 0 };
const unresolved = [];
for (const m of mods) {
  if (m.source === "normal" || m.tiers.every((t) => t.stats?.length)) continue;
  const c = normal.get(cls(m.id));
  let text;
  const tiers = m.tiers.map((t) => {
    if (t.stats?.length) return { stats: t.stats, fixed: [] };
    const ranges = t.ranges ?? [];
    // 1. エッセンス: 付く MOD の code。複数ならクラスの普通の MOD と stat の組が同じ物
    const picks = (t.codes ?? []).map((code) => byId.get(code)).filter(Boolean).map(rowStats).filter((rs) => rs.length);
    const inClass = picks.filter((rs) => c?.byStats.has(key(rs.map((r) => r.id))));
    const pick = picks.length === 1 ? picks[0] : inClass.length === 1 ? inClass[0] : null;
    if (pick) {
      const f = fit(pick, ranges);
      if (f) {
        n.code++;
        const tx = c?.byStats.get(key(pick.map((r) => r.id)));
        // 文は「#」の形の物だけ (クライアントから足した MOD の文は「(6-9)% increased [Spell] Damage」で、別の段の幅が入っている)
        const holes = (x) => (x.match(/#/g) ?? []).length;
        if (tx && !/[[(]/.test(tx) && holes(tx) === holes(m.text) && tx !== m.text) text = tx;
        return f;
      }
    }
    // 2. 冒涜: 段の名前と値の幅が同じクライアントの行 (stat の組が 1 通りに決まる時だけ)
    if (!t.codes?.length) {
      const hit = (byName.get(t.name) ?? []).map(rowStats).filter((rs) => {
        const vary = rs.filter((r) => r.lo !== r.hi || rs.length === ranges.length);
        return vary.length === ranges.length && vary.every((r, i) => same([r.lo, r.hi].map(Math.abs), ranges[i].map((x) => Math.abs(Number(x)))));
      }).map((rs) => fitExact(rs, ranges, m.text) ?? fit(rs, ranges)).filter(Boolean);
      const one = hit.length && (hit.every((f) => sameFit(f, hit[0])) ? hit[0] : bestByWords(hit, m.text));
      if (one) { n.abyss++; return one; }
    }
    // 3. 文が同じ普通の MOD
    let rs = c?.byText.get(m.text);
    if (!rs) { const g = globalText.get(m.text); if (g?.size === 1) rs = [...g.values()][0]; }
    const f = rs && fit(rs, ranges);
    if (f) { n.text++; return f; }
    // 4. 値の幅がちょうど同じ行 (クラスの普通の MOD が使う stat だけ)。stat の組が 1 通りの時だけ
    if (ranges.length && !t.codes?.length) {
      const known = classStats.get(cls(m.id)) ?? new Set();
      const cand = [...new Set(byRange.get(abs2(ranges[0]).join(",")) ?? [])].map(rowStats).filter((rs) => rs.some((r) => known.has(r.id))).map((rs) => fitExact(rs, ranges, m.text)).filter(Boolean);
      const one = cand.length && (cand.every((f) => sameFit(f, cand[0])) ? cand[0] : bestByWords(cand, m.text));
      if (one) { n.range++; return one; }
    }
    n.none++;
    unresolved.push(`${m.id} [${t.name}] ${m.text.replace(/\n/g, " / ")} ${JSON.stringify(ranges)}`);
    return { stats: [], fixed: [] };
  });
  if (!tiers.some((x) => x.stats.length)) continue;
  const o = { stats: tiers.map((x) => x.stats) };
  if (tiers.some((x) => x.fixed.length)) o.fixed = tiers.map((x) => x.fixed);
  if (text) o.text = text;
  // 冒涜の主の札 (kurgal_mod など)・unveiled_mod・drop は中身のタグではない (主の札は抽選に使うので、元の MOD の物を触らない)
  const tags = [...new Set(tiers.flatMap((x) => x.tags ?? []))].filter((t) => !/_mod$/.test(t) && t !== "drop");
  if (tags.length) o.tags = tags;
  out[m.id] = o;
}
await writeFile(resolve(ROOT, "src/services/htc/mod-stats.json"), JSON.stringify(out));

// ---- 暗黙の MOD (2026-10-12 オーナー「暗黙のタグは？」「カタリストで上がるよ、普通は」) ----
// extra-bases の baseInfo.implicits は文だけ。同じ並び (build-htc-bases-from-client.mjs と同じく、文のある行だけ) で stat の幅と中身のタグを出す
const rowsOf = (j) => (Array.isArray(j) ? j : j.rows);
const IDIR = resolve(ROOT, "data-cache/client-export-implicits/tables/English");
const [IB, IM, MEN] = await Promise.all([json(`${IDIR}/BaseItemTypes.json`), json(`${IDIR}/Mods.json`), json(resolve(ROOT, "data-cache/mods.en.json"))]).then(([a, b, c]) => [rowsOf(a), rowsOf(b), c]);
const info = htcBaseInfo();
const implicitOut = {};
let implicitMismatch = 0;
for (const r of IB) {
  const want = info[r.Name]?.implicits;
  if (!want?.length) continue;
  const list = [];
  for (const k of r.Implicit_Mods || []) {
    const m = MEN[(IM[k] || {}).Id];
    if (!m?.text) continue;
    list.push({ stats: (m.stats ?? []).map((st) => [st.id, st.min, st.max]), tags: (m.implicit_tags ?? []).filter((t) => !/_mod$/.test(t)) });
  }
  // 同じ名前の行が複数ある (Runeforged・Runemastered) 時は、数の合う行を使う
  if (list.length !== want.length) { if (!implicitOut[r.Name]) implicitMismatch++; continue; }
  implicitOut[r.Name] = list;
}
await writeFile(resolve(ROOT, "src/services/htc/implicit-stats.json"), JSON.stringify(implicitOut));
console.log(`暗黙: ベース ${Object.keys(implicitOut).length} (数が合わない ${implicitMismatch})`);
await writeFile(resolve(ROOT, "data-cache/mod-stats-unresolved.txt"), unresolved.join("\n"));
console.log(`mods ${Object.keys(out).length} / 段: エッセンスの code ${n.code}, 冒涜 ${n.abyss}, 文 ${n.text}, 値の幅 ${n.range}, 決まらない ${n.none} (data-cache/mod-stats-unresolved.txt)`);
