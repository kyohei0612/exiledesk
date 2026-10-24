#!/usr/bin/env node
/**
 * check-monkey-engine.mjs — 猿 (モンキー隊長の台本) がツリーで書き出した記録と、エンジンの入口を照らし合わせる (2026-10-24 オーナー「照らし合わせの相手はエンジン」、ジン部長)
 *   node scripts/check-monkey-engine.mjs <猿の JSON のフォルダー> [--out <書き出すフォルダー>]
 * 読む物: フォルダーの中の *.json のうち { steps: [{ card, shelf: [{ name, off, why }], pick, omens }] } の形の物 (1 匹 1 ファイル)。
 * 1 手ごとに、カードの文からベース・MOD (P7 文 = プレフィックス T7)・はまったクラフトのルーン (効き目の文) を読み、エンジンで同じ形のアイテムを作って:
 *   - 棚: 打てる札と打てない札 (理由つき)。打てるかはエンジンの useReason (お告げ無し、ツリーの棚と同じ並び)
 *   - 選んだ手 (pick) に掛けられるお告げ / 掛けられない物 (理由つき、omenBlock)
 *   - 選んだ手で付きうる MOD の候補 (1 手の行き先の全部の枝。錬金など枝が多すぎる手は数えない)
 * 猿が step に書けば使う欄: rarity ("normal" / "magic" / "rare"、箱のレアリティ。無ければ白・マジック・レアのうち棚の打てる札が猿と一番近い形)、
 *   mods ([{ modId, tier }]、箱の MOD。無ければカードの文から)、modsUnknown (true = 当たりの箱で MOD の見本が空。比べない)、baseEn (英語のベース名、step か記録の頭)。
 * 付いた MOD・当たり外れ (乱数) は step ごとには比べない。
 * 記録の頭に tree = { dump: __simMonkey.dump(), items: { 手の箱: __simMonkey.boxItem(id) }, run: __simMonkey.run(300, 1) } があれば、ツリーの数字も照らす (checkTree、10-24 ブラックの頼み)。
 * 書き出し (既定 <フォルダー>/engine/): 猿と同じ名前のファイルに、猿の step と同じ形で engine 欄 (rarity・shelf・pickKey・omens・candidates) と差 (diff) を足した物、
 * まとめは engine-check.json。画面には数と、違いの多い札。手元だけで、外へは出ない
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bundleEntry } from "./_bundle-ts.mjs";

const args = process.argv.slice(2);
const dir = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--out");
if (!dir) { console.error("使い方: node scripts/check-monkey-engine.mjs <猿の JSON のフォルダー> [--out <書き出すフォルダー>]"); process.exit(1); }
const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : join(dir, "engine");
mkdirSync(outDir, { recursive: true });

const E = await bundleEntry("scripts/_monkey-engine-entry.ts");
E.load();

/** カードの文: 「<ベース> <部位> …プロパティ… 暗黙 … P7 文 S5 文」。MOD は「[PS]数字 文」の並び (MOD なし の時は無い) */
function parseCard(card) {
  const head = card.match(/^(\S+) /);
  const mods = [];
  for (const m of card.matchAll(/ ([PS])(\d+) (.+?)(?= [PS]\d+ |$)/g)) mods.push({ side: m[1], tier: Number(m[2]), text: m[3].trim() });
  return { baseJa: head?.[1] ?? null, mods };
}
const usable = (list) => new Set((list ?? []).filter((x) => !x.off).map((x) => x.why || x.name));
const setDiff = (a, b) => [...a].filter((x) => !b.has(x));
/** ツリーの棚・お告げから外した物 (オーナー 10-24: 聖別・ヒネコラ・ミラー、神のオーブと祝福のお告げ。ルーンはクラフトのルーンだけで、shelfOf が既にそうしている)。エンジンにだけある時は違いに数えない */
const TREE_OFF = new Set(["OmenofSanctification", "hinekora", "mirror", "divine", "OmenoftheBlessed"]);
const usableEng = (list) => usable((list ?? []).filter((x) => !TREE_OFF.has(x.key)));
/** 猿の側からも外した物を除く (外す前の記録や、シミュ部長が直す前のツリーでは棚に残る)。名前はエンジンの札の名前で引く */
const withoutOff = (names, engList) => { const off = new Set((engList ?? []).filter((x) => TREE_OFF.has(x.key)).map((x) => x.name)); return new Set([...names].filter((n) => !off.has(n))); };

/**
 * ツリーの数字の照らし (記録の頭の tree = { dump, items: { 箱: boxItem }, run }。run は値段を全部 1 で回した物 = 費用は使った個数)。
 * 手のある箱ごとに、ツリーが渡したアイテム (boxItem の raw、触媒の時は preRaw) と手をエンジンの stepOutcomes に渡して、結果の箱の狙いが付く割合を出し、
 * run の edges (手の箱 > 結果の箱) ÷ その手の箱から出た数と比べる。繰り返しの手は 1 回の来訪あたりの個数 (spend × n ÷ visits) と 1 ÷ 当たりの割合。
 * 回した数なので幅で見る: 4σ を超え、差が 3 ポイントより大きい所・エンジンで 0 なのにツリーで出た所を「ずれ」に。見えている MOD から組み立てた物とツリーが渡した物の食い違いも書く
 */
const ECHO = "OmenofAbyssalEchoes";
function checkTree(tr, steps = []) {
  const doc = tr?.dump, run = tr?.run;
  if (!doc?.boxes || !run?.boxes) return null;
  const res = { n: run.n, finished: run.finished, stuckAt: run.stuckAt ?? {}, unexpected: run.unexpected ?? {}, boxes: [], skipped: [] };
  const flow = (from, to) => run.edges?.[`${from}>${to}`] ?? 0;
  for (const b of Object.values(doc.boxes)) {
    if (!b.hand || !b.outs?.length || b.hand.free) continue;
    const bi = tr.items?.[b.id];
    if (!bi?.raw) { res.skipped.push({ box: b.id, why: "boxItem が無い" }); continue; }
    const outs = b.outs.map((id) => doc.boxes[id]).filter(Boolean);
    const aims = outs.filter((o) => o.out === "hit" && o.aim).map((o) => o.aim);
    // 見えている形 = 猿がその箱で読んだ step (rarity・mods)。ツリーが渡した物 (boxItem の raw = 箱の手の前、preRaw = 触媒の時に品質を入れた後) と直に比べる
    const st = steps.find((x) => x.box === b.id && x.rarity && Array.isArray(x.mods) && !x.modsUnknown);
    const item = bi.preRaw ?? bi.raw;
    const allAims = Object.values(doc.boxes).filter((o) => o.out === "hit" && o.aim).map((o) => o.aim);
    const odds = E.oddsOf(item, b.hand.currency, b.hand.omens.filter((o) => o !== ECHO), aims, allAims, b.hand.omens.includes(ECHO));
    // 当たりと同時に狙いが消えた時: エッセンスの手は「狙いが消えた」の箱が先、ほかの手は当たりの箱が先 (その後 settle で形の箱へ。10-24 シミュ部長 19 本目)
    const hasLost = b.hand.currency.startsWith("essence:") && outs.some((o) => o.out === "lost");
    const row = { box: b.id, sampled: odds?.sampled ?? null, hand: b.hand.currency, omens: b.hand.omens, repeat: !!b.hand.repeat, itemDiff: st ? E.seenDiff(st, bi.raw) : [], seen: st ? "step" : null, rows: [], off: [] };
    if (!odds) { row.off.push("エンジンで打てない手 (applyCurrency が打てないと返した)"); res.boxes.push(row); continue; }
    const visits = run.boxes[b.id]?.visits ?? 0;
    if (b.hand.repeat) {
      const perVisit = visits ? ((run.boxes[b.id]?.spend ?? 0) * run.n) / visits : NaN, want = odds.any ? 1 / odds.any : Infinity;
      const sd = odds.any ? Math.sqrt((1 - odds.any) / odds.any ** 2 / Math.max(1, visits)) : 0;
      row.rows.push({ what: "当たるまでの個数 (1 回の来訪あたり)", tree: perVisit, engine: want, visits });
      if (visits >= 20 && (!Number.isFinite(want) || (Math.abs(perVisit - want) > 4 * sd && Math.abs(perVisit - want) / want > 0.1))) row.off.push(`当たるまでの個数 ツリー ${perVisit.toFixed(2)} / エンジン ${want.toFixed(2)}`);
    } else {
      const total = outs.reduce((s, o) => s + flow(b.id, o.id), 0);
      const check = (what, obs, p) => {
        row.rows.push({ what, tree: total ? obs / total : NaN, engine: p, n: total });
        if (total < 30) return;
        const q = obs / total, sd = Math.sqrt(Math.max(p * (1 - p), 1e-9) * (1 / total + (odds.sampled ? 1 / odds.sampled : 0)));
        if ((p === 0 && obs > 0) || (Math.abs(q - p) > 4 * sd && Math.abs(q - p) > 0.03)) row.off.push(`${what} ツリー ${(q * 100).toFixed(1)}% / エンジン ${(p * 100).toFixed(1)}% (${total} 回)`);
      };
      let hitObs = 0, hitP = 0;
      for (const o of outs.filter((o) => o.out === "hit" && o.aim)) {
        const k = `${o.aim.modId}|${o.aim.tier}`, p = (hasLost ? odds.hitKept[k] : odds.hit[k]) ?? 0, obs = flow(b.id, o.id);
        hitObs += obs; hitP += p;
        check(`当たり ${o.aim.modId} T${o.aim.tier}`, obs, p);
      }
      if (aims.length) check("当たり以外 (外れ・消えた・不成立)", total - hitObs, Math.max(0, 1 - hitP));
    }
    if (row.itemDiff.length) row.off.push(`渡したアイテムが見えている形と違う: ${row.itemDiff.join(" / ")}`);
    res.boxes.push(row);
  }
  return res;
}

/**
 * 完成した人の割合と手ごとの 1 人あたりの個数 (記録の頭の tree.result = 画面の「100 人回す」と同じ物、7 回目〜)。エンジンだけで同じ木を同じ人数辿らせて (walkTree) 比べる。
 * 値段の表は記録に無いので費用は個数で比べる。ツリーが打ち止め (値段の打ち止めもある) の人を出した木は比べない。
 * ずれ = 完成の割合が 4σ (両方の 2 項の幅) を超えて 10 ポイントより違う、または手の個数が 0.5 個以上・5 割より違う
 */
function checkWalk(tr) {
  const doc = tr?.dump, res = tr?.result, start = tr?.items?.start?.raw;
  if (!doc?.boxes || !res?.n) return null;
  if (!start) return { skipped: "始まりの boxItem が無い" };
  if (res.capped) return { skipped: `ツリーで打ち止め ${res.capped} 人 (値段の打ち止めは辿れない)` };
  const w = E.walkTree(doc.boxes, start, res.n, 1);
  if (w.unsupported) return { skipped: `辿らない形: ${w.unsupported}` };
  const off = [];
  const q1 = res.finished / res.n, q2 = w.finished / w.n, sd = Math.sqrt(Math.max(q1 * (1 - q1), q2 * (1 - q2), 1e-9) * (1 / res.n + 1 / w.n));
  if (Math.abs(q1 - q2) > 4 * sd && Math.abs(q1 - q2) > 0.1) off.push(`完成 ツリー ${(q1 * 100).toFixed(0)}% / エンジン ${(q2 * 100).toFixed(0)}%`);
  for (const k of new Set([...Object.keys(res.uses ?? {}), ...Object.keys(w.uses)])) {
    const a = res.uses?.[k] ?? 0, b = w.uses[k] ?? 0;
    if (Math.abs(a - b) >= 0.5 && Math.abs(a - b) > 0.5 * Math.max(a, b)) off.push(`個数 ${k} ツリー ${a.toFixed(2)} / エンジン ${b.toFixed(2)}`);
  }
  return { tree: { n: res.n, finished: res.finished, stuck: res.stuck, stuckAt: res.stuckAt, uses: res.uses }, engine: w, off };
}
const walkSum = { trees: 0, compared: 0, off: 0, skipped: {} };

const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "engine-check.json");
const treeSum = { trees: 0, boxes: 0, off: 0 };
const sum = { steps: 0, shelfSame: 0, shelfDiff: 0, omensSame: 0, omensDiff: 0, skipped: 0, skipWhy: {} };
const tally = new Map();
const add = (k) => tally.set(k, (tally.get(k) ?? 0) + 1);
const skip = (why) => { sum.skipped++; sum.skipWhy[why] = (sum.skipWhy[why] ?? 0) + 1; };
for (const f of files) {
  let rec;
  try { rec = JSON.parse(readFileSync(join(dir, f), "utf8")); } catch { continue; }
  if (!Array.isArray(rec?.steps)) continue;
  const outSteps = [];
  for (const st of rec.steps) {
    if (!st.card || !Array.isArray(st.shelf)) { outSteps.push(st); continue; }
    sum.steps++;
    const monkey = usable(st.shelf);
    // エッセンスの数え方を猿に合わせる: 猿の口の棚 (レッサーの札がある) は段ごと、画面を押す猿の棚 (系統ごとに一番上の段 1 枚) は系統ごと
    const allTiers = st.shelf.some((x) => /レッサーエッセンス/.test(x.name));
    let best = null, base = null;
    // 猿が step に boxItem (ツリーがその箱で持っているアイテム) を書いていれば、その raw をそのままエンジンに渡す (聖別・ルーン・冒涜・エッセンスの数もそのまま。10-24 隊長)
    const raw = st.boxItem?.raw;
    if (raw?.base && raw.cls) {
      base = raw.base;
      const shelf = E.shelfOf(raw, allTiers), eng = usableEng(shelf);
      const d = { 猿だけ: setDiff(withoutOff(monkey, shelf), eng), エンジンだけ: setDiff(eng, withoutOff(monkey, shelf)) };
      best = { rarity: raw.rarity, item: raw, shelf, d, n: d.猿だけ.length + d.エンジンだけ.length };
    } else {
      // 当たりの箱で MOD の見本が空 (猿が modsUnknown を付けた) の時は、白と取り違えないよう比べない
      if (st.modsUnknown) { skip("MOD の見本が空 (modsUnknown)"); outSteps.push({ ...st, engine: { error: "MOD の見本が空" } }); continue; }
      const c = parseCard(st.card);
      const baseEn = st.baseEn ?? rec.baseEn;
      base = (baseEn && E.isBase(baseEn) ? baseEn : null) ?? (c.baseJa && E.baseOfJa(c.baseJa));
      if (!base) { skip(`ベースが読めない (${c.baseJa})`); outSteps.push({ ...st, engine: { error: "ベースが読めない" } }); continue; }
      // MOD: 猿が mods [{ modId, tier }] を書いていればそれ、無ければカードの文から
      const ms = Array.isArray(st.mods) ? st.mods.map((m) => ({ side: "", tier: m.tier, text: m.modId, hit: { modId: m.modId, tier: m.tier } })) : c.mods.map((m) => ({ ...m, hit: E.modOf(base, m.side, m.tier, m.text) }));
      const miss = ms.filter((m) => !m.hit).map((m) => `${m.side}${m.tier} ${m.text}`);
      if (miss.length) { skip("MOD がエンジンの一覧に無い"); outSteps.push({ ...st, engine: { error: "MOD がエンジンの一覧に無い", mods: miss } }); continue; }
      // レアリティ: 猿が rarity ("normal" / "magic" / "rare") を書いていればそれだけ、無ければ棚の打てる札が猿と一番近い形
      for (const [rarity, item] of Object.entries(E.itemsFor(base, ms.map((m) => m.hit), st.card))) {
        if (!item || (st.rarity && st.rarity !== rarity)) continue;
        const shelf = E.shelfOf(item, allTiers);
        const eng = usableEng(shelf);
        const d = { 猿だけ: setDiff(withoutOff(monkey, shelf), eng), エンジンだけ: setDiff(eng, withoutOff(monkey, shelf)) };
        const n = d.猿だけ.length + d.エンジンだけ.length;
        if (!best || n < best.n) best = { rarity, item, shelf, d, n };
      }
      if (!best) { skip("どのレアリティでも組み立てられない"); outSteps.push({ ...st, engine: { error: "組み立てられない" } }); continue; }
    }
    const engine = { base, rarity: best.rarity, from: raw ? "boxItem" : "card", shelf: best.shelf.map(({ name, off, why }) => ({ name, off, why })) };
    const diff = {};
    if (best.n) { sum.shelfDiff++; diff.shelf = best.d; for (const x of best.d.猿だけ) add(`棚 猿だけ  ${x}`); for (const x of best.d.エンジンだけ) add(`棚 エンジンだけ  ${x}`); } else sum.shelfSame++;
    // 選んだ手: 猿の札の名前 (why が札の名前) → エンジンの鍵
    const pickCard = st.pick ? st.shelf.find((x) => x.name === st.pick) : null;
    const pickKey = pickCard ? E.keyOfName(best.shelf, pickCard.why || pickCard.name) : null;
    if (st.pick) {
      engine.pickKey = pickKey;
      if (pickKey) {
        engine.omens = E.omensOf(best.item, pickKey, raw ? st.boxItem.preRaw ?? null : null).map(({ name, off, why }) => ({ name, off, why }));
        engine.candidates = E.candidatesOf(best.item, pickKey);
        if (Array.isArray(st.omens)) {
          // 触媒の高貴のお告げ: 品質を入れた後の形 (preRaw) が無く品質 0 の時は比べない (どのカタリストで入れるかはツリーの決め、猿の口はその場で入れて見る)
          const noPre = raw && !st.boxItem.preRaw && !(raw.quality > 0), skipOmen = (n) => noPre && /触媒の高貴/.test(n);
          const mo = new Set([...withoutOff(usable(st.omens), engine.omens)].filter((n) => !skipOmen(n))), eo = new Set(engine.omens.filter((x) => !x.off && !skipOmen(x.name) && !TREE_OFF.has(x.key)).map((x) => x.name));
          const od = { 猿だけ: setDiff(mo, eo), エンジンだけ: setDiff(eo, mo) };
          if (od.猿だけ.length || od.エンジンだけ.length) { sum.omensDiff++; diff.omens = od; for (const x of od.猿だけ) add(`お告げ 猿だけ  ${x}`); for (const x of od.エンジンだけ) add(`お告げ エンジンだけ  ${x}`); } else sum.omensSame++;
        }
      } else diff.pick = `選んだ手 ${st.pick} がエンジンの棚に無い`;
    }
    outSteps.push({ ...st, engine, ...(Object.keys(diff).length ? { diff } : {}) });
  }
  const treeCheck = checkTree(rec.tree, rec.steps);
  const walk = checkWalk(rec.tree);
  if (walk) {
    walkSum.trees++;
    if (walk.skipped) walkSum.skipped[walk.skipped.replace(/\d+ 人/, "N 人")] = (walkSum.skipped[walk.skipped.replace(/\d+ 人/, "N 人")] ?? 0) + 1;
    else { walkSum.compared++; if (walk.off.length) { walkSum.off++; for (const x of walk.off) add(`完成・個数  ${x.replace(/ ツリー .*$/, "")}`); } }
  }
  if (treeCheck) {
    treeSum.trees++; treeSum.boxes += treeCheck.boxes.length;
    for (const r of treeCheck.boxes) if (r.off.length) { treeSum.off++; for (const x of r.off) add(`数字 ${r.hand}  ${x.replace(/ ツリー .*$/, "")}`); }
  }
  writeFileSync(join(outDir, f), JSON.stringify({ ...rec, steps: outSteps, ...(treeCheck ? { treeCheck } : {}), ...(walk ? { walk } : {}) }, null, 1));
}
writeFileSync(join(outDir, "engine-check.json"), JSON.stringify({ ...sum, tree: treeSum, walk: walkSum, top:[...tally].sort((a, b) => b[1] - a[1]) }, null, 1));
console.log(`手 ${sum.steps}: 棚が同じ ${sum.shelfSame} / 違う ${sum.shelfDiff} / 比べられない ${sum.skipped}。お告げ (猿が欄を開いた手) 同じ ${sum.omensSame} / 違う ${sum.omensDiff}`);
if (treeSum.trees) console.log(`ツリーの数字 (記録の頭の tree): 木 ${treeSum.trees}、手の箱 ${treeSum.boxes}、ずれのある箱 ${treeSum.off}`);
if (walkSum.trees) console.log(`完成・個数 (記録の頭の tree.result): 木 ${walkSum.trees}、比べた ${walkSum.compared}、ずれ ${walkSum.off}。比べない: ${Object.entries(walkSum.skipped).map(([k, n]) => `${k} ${n}`).join(" / ") || "無し"}`);
for (const [w, n] of Object.entries(sum.skipWhy)) console.log(`  比べられない: ${w} ${n}`);
for (const [k, n] of [...tally].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${n} 手  ${k}`);
console.log(`書き出し: ${outDir} (猿と同じ名前のファイルに engine 欄と diff、まとめは engine-check.json)`);
