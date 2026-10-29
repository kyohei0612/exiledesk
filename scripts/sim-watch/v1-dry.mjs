// v1-dry.mjs — 利用者の共有した木の移し替えの空打ち (S-108、スイッチ recipeV1。シミュ部長 38 が 10-29 に作った)。
//   node scripts/sim-watch/v1-dry.mjs <shares.json> [origin] [--off] [--out <json>]   (--off = スイッチ recipeV1 を閉じて前の木をそのまま開く = 前からの止まりとの比べ)   (shares.json = wrangler d1 execute … --json の "SELECT id, code FROM recipe_shares" の出力。既定 origin http://localhost:1443)
// 木ごとに: 共有の code を解く → migrateTreeDoc → toRecipeV1 → v1 の形を JSON に通す → 画面の open (組み直し) → 精査・100 人。D1 には何も書かない。
// 数える物: 通った (開いて組み直せた)・要確認 (orphans) が出た・止まりが出た・落ちた (例外・開かない)
import { readFileSync, writeFileSync } from "node:fs";
const { openChrome } = await import("./cdp.mjs");
const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const OFF = args.includes("--off");
const [file, origin = "http://localhost:1443"] = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1] === "--out"));
const raw = JSON.parse(readFileSync(file, "utf8"));
const rows = (Array.isArray(raw) ? raw[0]?.results ?? raw : raw.results) ?? [];
const c = await openChrome(Number(process.env.WATCH_PORT ?? 9437));
const long = async (js, ms = 600000) => { await c.ev(`(window.__done = undefined, (async () => { try { window.__done = { v: await (${js}) }; } catch (e) { window.__done = { err: String(e && e.stack || e) }; } })(), 1)`); if (!(await c.until("window.__done !== undefined", ms))) throw new Error("時間切れ"); const o = JSON.parse(await c.ev("JSON.stringify(window.__done)")); if (o.err) throw new Error(o.err); return o.v; };
const ONE = (code) => `(async () => {
  const { unpackJson } = await import("/src/services/craft-stage/share.ts");
  const { migrateTreeDoc } = await import("/src/services/simulator/tree/tree-migrate.ts");
  const v = await import("/src/services/simulator/tree/tree-recipe-v1.ts");
  const { useTree } = await import("/src/views/simulator/tree/use-tree.ts");
  const p = await unpackJson(${JSON.stringify(code)});
  const m = migrateTreeDoc(p.t);
  if (!m) return { err: "migrateTreeDoc が読めない" };
  const old = m.doc, oldBoxes = Object.keys(old.boxes ?? {}).length;
  const rec = JSON.parse(JSON.stringify(v.toRecipeV1(old)));
  const t = useTree(); t.open(${OFF} ? old : rec);
  const d = t.doc.value;
  const before = v.isRecipeV1(old) ? null : new Set(v.pathKeysOf(old).values()), now = new Set(v.pathKeysOf(d).values());
  const M = window.__simMonkey, chk = await M.check(), res = await M.result(100, 1);
  return { schema: p.t?.schema ?? null, oldBoxes, boxes: Object.keys(d.boxes).length, picks: rec.picks.length, orphans: (d.orphans ?? []).map((o) => o.why + " " + o.at),
    fresh: Object.values(d.boxes).filter((b) => b.fresh).length, gone: before ? [...before].filter((k) => !now.has(k)).length : null,
    passed: chk.passed, issues: chk.issues.length, issueKinds: [...new Set(chk.issues.map((x) => x.kind))], stuck: res.stuck, finished: res.finished, failed: res.failed, n: res.n };
})()`;
const out = [];
try {
  await c.size(1660, 860, false);
  await c.go(`${origin}/web.html`);
  await c.ev(`(() => { try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("exiledesk.changelog.seen", "9.9.9"); } catch {} return 1; })()`);
  await c.go(`${origin}/web.html?page=sim-tree${OFF ? "&off=recipeV1" : ""}`);
  if (!(await c.until(`!!window.__simMonkey`, 60000))) throw new Error("ツリーのページが開かない");
  await c.until(`(async () => !!(await import("/src/state/craft-stage.ts")).craftStage.data.value)()`, 60000);
  for (const r of rows) {
    let x;
    try { x = await long(ONE(r.code)); } catch (e) { x = { err: String(e).slice(0, 300) }; }
    out.push({ id: r.id, ...x });
    console.log(`${r.id}: ${x.err ? "落ち " + x.err : `形 ${x.schema} 箱 ${x.oldBoxes} → ${x.boxes} / 決め ${x.picks} / 要確認 ${x.orphans.length}${x.orphans.length ? " " + JSON.stringify(x.orphans) : ""} / 増えた ${x.fresh} 消えた ${x.gone} / 合格 ${x.passed} 知らせ ${x.issues} ${JSON.stringify(x.issueKinds)} / 止まり ${x.stuck} 完成 ${x.finished} 失敗 ${x.failed}`}`);
  }
} finally { c.close(); }
const ok = out.filter((x) => !x.err);
console.log(`--- 全 ${out.length} 本: 通った ${ok.length} / 要確認が出た ${ok.filter((x) => x.orphans.length).length} ${JSON.stringify(ok.filter((x) => x.orphans.length).map((x) => x.id))} / 止まりが出た ${ok.filter((x) => x.stuck).length} ${JSON.stringify(ok.filter((x) => x.stuck).map((x) => x.id))} / 落ちた ${out.length - ok.length} ${JSON.stringify(out.filter((x) => x.err).map((x) => x.id))}`);
if (opt("--out")) writeFileSync(opt("--out"), JSON.stringify(out, null, 1));
