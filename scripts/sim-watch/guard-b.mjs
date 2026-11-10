/**
 * guard-b.mjs — バグの戻りを止める見張り B (シミュ部長、11-10。docs/org/simulator/todo.md の「後でやる: 見張り B」)。
 * 木の形に頼らない決まりを、開いた木 (と乱暴に育てた木) の全部の箱で数える。見つけても木は直さない。外の正解ではなく「決まりどおりか」の見張り。
 *   ① 同じ中身の箱は 1 つ: 手も戻りも無い箱が、手のある箱と同じ中身なら自動の ↩ が要る (S-50。外れの道 = 外れ・狙いが消えた は除く、S-190b)。
 *      同じ親の手も戻りも無い結果の箱どうしが同じ中身ならまとめる (S-66)。中身は開発版の口 __simMonkey.shapeOf (自動のつなぎと同じ tree-box-shape)
 *   ② 当たりの見本は持っていた狙いを全部持つ: 当たりの箱 (out = hit) の見本に、その箱の当たりの MOD と、親の見本が持っていた完成の狙いが全部ある
 *      (消す手 = カオス・無効化・完璧なエッセンス の後は親の狙いは比べない)。見本は __simMonkey.boxItem (エンジンに渡すアイテムそのもの)
 *   ③ 形の合う箱へ (back = match) の行き先が空でない: 手のある箱のどれかへ __simMonkey.sameShape で行ける
 *
 *   node scripts/sim-watch/guard-b.mjs <レシピの URL か URL を書いたファイル> [--grow 40] [--seed 1] [--log <run.log>] [--origin http://localhost:1440]
 * レシピの URL の住所は --origin (既定 dev 1440、開発版の口が要る) に置き換える。--grow N = 開いた木に猿の口で手を N 回足してからもう 1 回数える (乱暴に育てた木)。
 * 終わりの値: 合わない所が 0 なら 0、あれば 1。
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { openTabs } from "../app-watch/lib.mjs";

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const ORIGIN = (opt("--origin") ?? "http://localhost:1440").replace(/\/$/, "");
const GROW = Number(opt("--grow") ?? 0);
const SEED = Number(opt("--seed") ?? 1);
const LOG = opt("--log");
const BASE = opt("--base"); // 白紙から育てる時の「部位:ベース」(例 指輪:Gold Ring)。レシピの代わり
const src = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
if (!src && !BASE) { console.error("レシピの URL か、URL を書いたファイルを渡す (白紙からは --base 部位:ベース)"); process.exit(2); }
const raw = src ? (existsSync(src) ? readFileSync(src, "utf8").trim().split(/\s/)[0] : src) : "";
const code = /#recipe=([A-Za-z0-9_-]+)/.exec(raw)?.[1];
if (!code && !BASE) { console.error("#recipe= の長い URL が要る (短い URL /r/ は本番の住所なので、長い URL に開いてから渡す)"); process.exit(2); }
const log = (s) => { const l = `${new Date().toISOString().slice(11, 19)} guard-b ${s}`; console.log(l); if (LOG) appendFileSync(LOG, l + "\n"); };

/** 画面の中で数える (開発版の口だけを使う。エンジンの答えを読むだけで、決まりを自作しない) */
const CHECK = `(() => {
  const m = window.__simMonkey, d = m.dump(), boxes = d.boxes, ids = Object.keys(boxes), bad = [], seen = { same: 0, sib: 0, hit: 0, match: 0 }, noBranch = [];
  const body = Object.fromEntries(ids.map((id) => [id, m.shapeOf(id)?.body ?? null]));
  const ok = (b) => b && !String(b).startsWith("mixed:");
  const withHand = ids.filter((id) => boxes[id].hand);
  const loose = ids.filter((id) => !boxes[id].hand && !boxes[id].back && !boxes[id].done && id !== "start");
  // ① S-50: 外れの道でない手の無い箱が、手のある箱と同じ中身
  for (const id of loose) {
    if (!ok(body[id]) || boxes[id].out === "junk" || boxes[id].out === "lost") continue;
    seen.same++;
    const to = withHand.find((h) => h !== id && body[h] === body[id]);
    if (to) bad.push({ rule: "1-S50", box: id, what: "手のある " + to + " と同じ中身なのに ↩ が無い", out: boxes[id].out });
  }
  // ① S-66: 同じ親の手も戻りも無い結果の箱どうしが同じ中身
  const byParent = {};
  // 「エッセンスと同じ MOD」(blocked) は中身が同じでも普通の外れと分ける決まりの箱 (S-33e) なので比べない
  for (const id of loose) if (ok(body[id]) && boxes[id].out !== "blocked") (byParent[boxes[id].parent] ??= []).push(id);
  for (const [p, xs] of Object.entries(byParent)) for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
    seen.sib++;
    const head = (id) => document.querySelector('[data-box-id="' + id + '"] [data-tree-legend]')?.innerText.replace(/\\s+/g, " ").trim() ?? "";
    if (body[xs[i]] === body[xs[j]]) bad.push({ rule: "1-S66", box: xs[i] + "," + xs[j], what: p + " の結果の 2 つの箱が同じ中身 (手 " + JSON.stringify(boxes[p]?.hand ?? null) + "、題「" + head(xs[i]) + "」「" + head(xs[j]) + "」、中身 " + String(body[xs[i]]).slice(0, 90) + ")", out: boxes[xs[i]].out + "/" + boxes[xs[j]].out });
  }
  // ② 当たりの見本は狙いを全部持つ
  const goal = new Set((d.memoAims ?? []).map((a) => a.modId));
  const has = (it, modId) => !!it && it.mods.some((x) => x.modId === modId);
  const CUT = /^(chaos|annul|essence:perfect)/;
  for (const id of ids) {
    const b = boxes[id];
    if (b.out !== "hit" || !b.aim) continue;
    seen.hit++;
    const bi = m.boxItem(id), it = bi?.item, pit = b.parent ? m.boxItem(b.parent)?.item : null;
    // 来る枝の無い箱 (見本の注記 none = 親の品の代わり) は当たりの見本が無いので比べず、気付きとして別に数える
    if (bi?.note === "none") { noBranch.push(id + " (" + (boxes[b.parent]?.hand?.currency ?? "") + " " + JSON.stringify(b.aim) + ")"); continue; }
    const aims = (Array.isArray(b.aim) ? b.aim : [b.aim]).map((a) => a.modId);
    const want = [...aims];
    const ph = boxes[b.parent]?.hand?.currency ?? "";
    if (pit && !CUT.test(ph)) for (const x of goal) if (has(pit, x)) want.push(x);
    const miss = [...new Set(want)].filter((x) => !has(it, x));
    // 当たりの MOD は「どれか」(anyOf) の時は 1 つあればよい
    const anyOk = Array.isArray(b.aim) && b.aim.length > 1 && aims.some((x) => has(it, x));
    const left = anyOk ? miss.filter((x) => !aims.includes(x)) : miss;
    const mods = (x) => (x?.mods ?? []).map((y) => y.modId.split("/").pop() + ":" + y.tier).join(" ");
    if (left.length) bad.push({ rule: "2-hit", box: id, what: "当たりの見本に無い狙い " + left.join(" ") + " / 当たり " + JSON.stringify(b.aim) + " / 親 " + b.parent + " [" + mods(pit) + "] → [" + mods(it) + "] 手 " + JSON.stringify(boxes[b.parent]?.hand ?? null) + " 注記 " + JSON.stringify(bi?.note ?? null) + " 札 " + JSON.stringify(document.querySelector('[data-box-id="' + id + '"]')?.getAttribute("data-sample-note") ?? null), out: ph });
  }
  // ③ 形の合う箱へ の行き先
  for (const id of ids) {
    if (boxes[id].back !== "match") continue;
    seen.match++;
    if (!withHand.some((h) => h !== id && m.sameShape(id, h))) bad.push({ rule: "3-match", box: id, what: "形の合う箱へ の行き先が無い", out: boxes[id].out });
  }
  return { n: ids.length, seen, bad, noBranch };
})()`;

/** 乱暴に育てる: 手を足せる箱から 1 つ、棚の打てる物から 1 つを決まった乱数で選んで足す (当たりの MOD が要る箱は先に候補の 1 つ目) */
const GROW_STEP = (seed) => `(() => {
  let s = ${seed} >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const m = window.__simMonkey, xs = m.addable();
  if (!xs.length) return { ok: false, why: "足せる箱が無い" };
  const b = xs[Math.floor(rnd() * xs.length)];
  if (b.needAim) { const c = m.goalCandidates?.()[0]; if (!c) return { ok: false, why: "当たりの MOD の候補が無い" }; }
  const sh = m.shelf(b.id).filter((x) => x.ok);
  if (!sh.length) return { ok: false, why: b.id + " に打てる物が無い" };
  const k = sh[Math.floor(rnd() * sh.length)].key;
  const om = (m.omens(b.id, k) ?? []).filter((x) => x.ok);
  const o = om.length && rnd() < 0.4 ? [om[Math.floor(rnd() * om.length)].key] : [];
  let hit;
  if (b.needAim) { const hc = m.hitChoices(b.id, k, o) ?? []; hit = hc.length ? [hc[0].modId] : []; }
  const r = m.add(b.id, k, o, hit ? { hitAims: hit } : undefined);
  return { ok: !!r?.ok, at: b.id, key: k, omens: o, problem: r?.problem ?? null };
})()`;

const { tabs: [t], close } = await openTabs(9353, 1);
let total = 0;
try {
  await t.fresh("/web.html?page=sim-tree", 1920, 1080, false);
  if (BASE) {
    // 白紙のベースから: 部位とベース、完成の MOD は候補から決まった乱数で 4 つ (段は表の真ん中)
    const [part, base] = BASE.split(":");
    await t.until(`!!window.__simMonkey`, 60000);
    const r = await t.ev(`(() => { const m = window.__simMonkey; const b = m.setBase(${JSON.stringify(part)}, ${JSON.stringify(base ?? "")}); return b; })()`);
    await t.settle({ quiet: 500 });
    const g = await t.ev(`(() => { let s = ${SEED} >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
      const m = window.__simMonkey, cs = [...m.goalCandidates()], pick = [];
      while (cs.length && pick.length < 4) { const c = cs.splice(Math.floor(rnd() * cs.length), 1)[0]; const ti = c.tiers[Math.floor(c.tiers.length / 2)]; if (ti) pick.push({ modId: ti.modId, tier: ti.tier }); }
      return m.setGoal(pick); })()`);
    await t.settle({ quiet: 500 });
    log(`白紙 ${BASE}: ${JSON.stringify(r).slice(0, 120)} 完成の MOD ${JSON.stringify(g?.goals ?? g).slice(0, 200)}`);
  } else {
    await t.go(`${ORIGIN}/web.html#recipe=${code}`);
  }
  await t.until(`window.__simMonkey && document.querySelectorAll('[data-box-id]').length > 0`, 90000);
  await t.settle({ quiet: 800 });
  const report = (label, r) => {
    log(`${label}: 箱 ${r.n} / 比べた数 同じ中身 ${r.seen.same}・兄弟 ${r.seen.sib}・当たり ${r.seen.hit}・形の合う箱へ ${r.seen.match} / 合わない所 ${r.bad.length} / JS エラー ${t.errors?.length ?? 0}`);
    for (const b of r.bad.slice(0, 20)) log(`  ${b.rule} ${b.box} (${b.out}) ${b.what}`);
    if (r.noBranch?.length) log(`  (気付き、数えない) 来る枝の無い当たりの箱 ${r.noBranch.length}: ${r.noBranch.slice(0, 6).join(" / ")}`);
    total += r.bad.length;
  };
  report("開いた木", await t.ev(CHECK));
  if (GROW > 0) {
    let added = 0;
    const why = new Set();
    for (let i = 0; i < GROW; i++) {
      const g = await t.ev(GROW_STEP(SEED * 1000 + i));
      if (g?.ok) added++;
      else if (!why.has(g?.why ?? g?.problem)) { why.add(g?.why ?? g?.problem); log(`  足せない ${JSON.stringify(g).slice(0, 200)}`); }
      await t.settle({ quiet: 300 });
      if ((i + 1) % 10 === 0) log(`育てる ${i + 1} / ${GROW} (足せた ${added})`);
    }
    report(`育てた木 (${added} 手)`, await t.ev(CHECK));
  }
} finally { close(); }
log(`済み 合わない所 ${total}`);
process.exit(total ? 1 : 0);
