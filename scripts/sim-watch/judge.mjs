/**
 * judge.mjs — 木の形に頼らない決まりの見張り (todo の B、10-30 見張り部長。決まりは judge-rules.mjs の J1〜J8)。
 * 見本の木 (trees.json の trees・owner・pass・rules) を窓なし Chrome で開き、S-160 の表の行ごとに決まりを数える。
 * 乱暴に育てた木 (モンキーの形、R-18) も: --grow 8 で、木ごとに手の無い箱へ猿の口で 8 手足してからもう一度数える (--grows 2 で種を替えて 2 本)。
 * 見つけても木は直さない (直すのはシミュ部長・並び部長)。基準 (baseline) は持たない = 毎回 0 が合格。
 *
 *   node scripts/sim-watch/judge.mjs [origin] [--only key,key] [--grow 8] [--grows 2] [--people 30] [--off flag,flag] [--plant] [--out <json>]
 *   --plant = 見張りの照らし: 木ごとに自動の ↩ を 1 つ外す (J2 が拾うはず) と、↩ を中身の違う箱へ張り替える (J1 が拾うはず)   … 既定 http://localhost:1474 (見張り部長の dev、hmr 無し)
 *   WATCH_PORT = Chrome の debugging の港 (既定 9473)
 * 開発版の口 (__simMonkey) と /src の見本 (sampleOf) を使うので、dev サーバー (開発版の作り) でだけ回る。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { judgeTree, rowOf, ROWS } from "./judge-rules.mjs";
const { openChrome, sleep } = await import("./cdp.mjs");

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const ORIGIN = (args.find((a) => /^https?:\/\//.test(a)) ?? "http://localhost:1474").replace(/\/$/, "");
const GROW = Number(opt("--grow") ?? 0), GROWS = Number(opt("--grows") ?? (GROW ? 1 : 0)), PEOPLE = Number(opt("--people") ?? 30);
const only = opt("--only")?.split(",");
const PLANT = args.includes("--plant");
// --off a,b = 開発版のスイッチを閉じて開く (前の作りで合わない所が出るか = 見張りが穴を拾えるかの照らし)
const OFF = opt("--off") ? `&off=${opt("--off")}` : "";
const here = (p) => new URL(p, import.meta.url);
const PAGE = readFileSync(here("./judge-page.js"), "utf8");
const T = JSON.parse(readFileSync(here("./trees.json"), "utf8"));
const TREES = [...T.trees, ...(T.owner ?? []), ...(T.pass ?? []).filter((t) => t.code), ...(T.rules ?? []).filter((t) => t.code)].filter((t) => !only || only.includes(t.key));

const c = await openChrome(Number(process.env.WATCH_PORT ?? 9473));
// 長い処理 (見本 4 つ × 箱全部・回す) は 30 秒を超えるので、ページに結果を置かせて待つ (build.mjs と同じ)
const long = async (js, ms = 600000) => { await c.ev(`(window.__done = undefined, (async () => { try { window.__done = { v: await (${js}) }; } catch (e) { window.__done = { err: String(e && e.stack || e) }; } })(), 1)`); if (!(await c.until("window.__done !== undefined", ms))) throw new Error("時間切れ"); const o = JSON.parse(await c.ev("JSON.stringify(window.__done)")); if (o.err) throw new Error(o.err); return o.v; };

async function open(t) {
  await c.size(1660, 860, false);
  await c.go(`${ORIGIN}/web.html`);
  await c.ev(`(() => { try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("exiledesk.changelog.seen", "9.9.9"); } catch {} return 1; })()`);
  await c.go(`${ORIGIN}/web.html?page=sim-tree${OFF}#recipe=${t.code}`);
  if (!(await c.until(`document.querySelectorAll("[data-tree-box]").length > 0 && !!window.__simMonkey?.dump()?.boxes`, 90000))) return false;
  await sleep(2000);
  // 消去の直線を畳んだ札 (S-28b) は開く (畳んだ間の箱は描かないので線・位置が読めない)
  for (let i = 0; i < 20 && (await c.ev(`(() => { const f = document.querySelector("[data-tree-strip-fold]"); f?.click(); return !!f; })()`)); i++) await sleep(400);
  await c.ev(PAGE);
  return true;
}
async function count(label) {
  const f = await long(`window.__judge.facts()`);
  const r = judgeTree(f, { key: label });
  // J6 の続き: 回して「行き先の箱が無い」(noBox) で止まる人
  const run = await long(`window.__judge.stops(${PEOPLE})`);
  for (const [id, w] of Object.entries(run?.stuckWhy ?? {})) {
    const p = f.doc.boxes[f.doc.boxes[id]?.parent];
    const row = p?.hand ? rowOf(p.hand, f.doc) : "(スタート)";
    r.seen[`J6|${row}`] = (r.seen[`J6|${row}`] ?? 0) + 1;
    // ふつうの未設定 (次の手・戻り先が無い) は数えない。行き先へ移ろうとして中身の同じ箱が無い時だけ
    if (w.noBox && /中身の同じ箱も無い/.test(w.reason ?? "")) r.found.push({ tree: label, rule: "J6", row, box: id, what: `回すと行き先の箱が無くて止まる: ${w.reason}` });
  }
  return { ...r, run: run && { n: run.n, finished: run.finished, stuck: run.stuck } };
}

const all = []; // 木ごとの結果
const planted = []; // --plant で植えた穴と拾えたか
try {
  for (const t of TREES) {
    if (!(await open(t))) { console.log(`${t.key}: 開かない`); all.push({ key: t.key, open: false }); continue; }
    const r = await count(t.key);
    all.push({ key: t.key, ...r });
    console.log(`${t.key}: 箱 ${r.boxes} (見本なし ${r.unknown}・混ざり ${r.mixed}) / 合わない ${r.found.length} / 回し ${JSON.stringify(r.run)}`);
    for (let g = 1; g <= GROWS; g++) {
      if (!(await open(t))) continue;
      const log = await long(`window.__judge.grow(${GROW}, ${g})`);
      await sleep(800);
      const label = `${t.key}+猿${g}`;
      const q = await count(label);
      all.push({ key: label, grow: log, ...q });
      console.log(`${label}: 箱 ${q.boxes} / 合わない ${q.found.length} / 打った ${log.length}`);
    }
    if (PLANT && (await open(t))) {
      // 見張りの照らし: わざと穴を植えて拾えるか (RELEASED のスイッチは ?off で閉じられないので、前の作りでは照らせない)
      const p = await long(`window.__judge.plant()`);
      if (!p.length) { console.log(`${t.key}: 植える所が無い`); continue; }
      const q = await count(`${t.key}+植え`);
      const got = p.map((x) => ({ tree: t.key, ...x, hit: q.found.some((f) => f.rule === x.rule && String(f.box).split("・").includes(x.box)) }));
      planted.push(...got);
      console.log(`${t.key}+植え: ${got.map((x) => `${x.rule} ${x.box} ${x.hit ? "拾えた" : "拾えない"}`).join(" / ")}`);
    }
  }
} finally { c.close(); }
if (PLANT) { const miss = planted.filter((x) => !x.hit); console.log(`\n植えた穴: ${planted.length}・拾えた ${planted.length - miss.length}`); for (const m of miss) console.log(`- 拾えない [${m.tree}] ${m.rule} ${m.box}: ${m.what}`); }

// S-160 の行ごと: 見本の木 (その行の手のある木)・比べた数・合わない数
const rules = ["J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8"];
const extra = [...new Set(all.flatMap((x) => x.rows ?? []))].filter((r) => !ROWS.includes(r));
console.log(`\n行ごと (比べた数 / 合わない数、木は手のある木):`);
for (const row of [...ROWS, ...extra]) {
  const trees = all.filter((x) => (x.rows ?? []).includes(row)).map((x) => x.key);
  const cells = rules.map((j) => { const n = all.reduce((a, x) => a + (x.seen?.[`${j}|${row}`] ?? 0), 0), b = all.reduce((a, x) => a + (x.found ?? []).filter((f) => f.rule === j && f.row === row).length, 0); return `${j} ${n}/${b}`; });
  console.log(`- ${row}: ${trees.length ? cells.join(" · ") : "見本の木が無い"}${trees.length ? `  [${trees.join(", ")}]` : ""}`);
}
const found = all.flatMap((x) => x.found ?? []);
console.log(`\n合わない所: ${found.length}`);
for (const f of found) console.log(`- [${f.tree}] ${f.rule} ${f.row} ${f.box}: ${f.what}`);
if (opt("--out")) writeFileSync(opt("--out"), JSON.stringify(all.map(({ found: fd, seen, ...x }) => ({ ...x, seen, found: fd })), null, 1));
process.exitCode = found.length ? 1 : 0;
