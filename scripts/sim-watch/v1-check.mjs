// 新旧システム (S-104〜S-109、スイッチ recipeV1) の終わりの条件をオーナーの木 2 本で測る (1 回だけ)。
//   node scripts/sim-watch/v1-check.mjs [origin]   (既定 http://localhost:1443、WATCH_PORT で Chrome の番号。シミュ部長 38 が 10-29 に作った)
// 1 今の本番の形 (schema 2 の TreeDoc、trees.json の owner の code) の URL で開く → 組み直した木の精査・100 人・決めの数・要確認・増えた箱・前の木の札との差
// 2 その木を v1 の形で URL にして (treeShareUrl)、空のブラウザで開き直す → もう一度 同じ物を測る + 開いた直後に「保存していない変更」が無いか
import { readFileSync } from "node:fs";
const { openChrome, sleep } = await import("./cdp.mjs");
const ORIGIN = process.argv[2] ?? "http://localhost:1443";
const KIT = readFileSync(new URL("./kit.js", import.meta.url), "utf8");
const list = JSON.parse(readFileSync(new URL("./trees.json", import.meta.url), "utf8"));
const c = await openChrome(Number(process.env.WATCH_PORT ?? 9437));
const long = async (js, ms = 600000) => { await c.ev(`(window.__done = undefined, (async () => { try { window.__done = { v: await (${js}) }; } catch (e) { window.__done = { err: String(e && e.stack || e) }; } })(), 1)`); if (!(await c.until("window.__done !== undefined", ms))) throw new Error("時間切れ"); const o = JSON.parse(await c.ev("JSON.stringify(window.__done)")); if (o.err) throw new Error(o.err); return o.v; };
// 開いた木が落ち着くまで (箱の数が 3 回続けて同じ)
const settle = () => c.until(`(() => { const n = document.querySelectorAll("[data-tree-box]").length; window.__n = window.__n ?? []; window.__n.push(n); const l = window.__n.slice(-6); return n > 1 && !!window.__simMonkey && l.length === 6 && l.every((x) => x === n); })()`, 60000);
const MEASURE = `(async () => {
  const { useTree } = await import("/src/views/simulator/tree/use-tree.ts");
  const v = await import("/src/services/simulator/tree/tree-recipe-v1.ts");
  const { unpackJson } = await import("/src/services/craft-stage/share.ts");
  const { treeRecipes, currentTreeRecipe } = await import("/src/state/simulator/tree-recipes.ts");
  const { unsaved } = await import("/src/views/simulator/tree/tree-save.ts");
  const { treeShareUrl } = await import("/src/views/simulator/recipe-share.ts");
  const d = useTree().doc.value, rec = v.toRecipeV1(d);
  const old = OLD ? (await unpackJson(OLD)).t : null;
  const keysNow = new Set(v.pathKeysOf(d).values()), keysOld = old ? new Set(v.pathKeysOf(old).values()) : null;
  const saved = treeRecipes.value[0]?.tree;
  const M = window.__simMonkey, chk = await M.check(), res = await M.result(100, 1);
  const code = (await treeShareUrl({ name: "v1", tree: d })).replace(/^.*recipe=/, "");
  return {
    boxes: Object.keys(d.boxes).length, picks: rec.picks.length, pickHands: rec.picks.filter((p) => p.hand).length, pickDoneOnly: rec.picks.filter((p) => !p.hand && p.done).length,
    orphans: (d.orphans ?? []).length, fresh: Object.values(d.boxes).filter((b) => b.fresh).map((b) => b.id),
    oldMissing: keysOld ? [...keysOld].filter((k) => !keysNow.has(k)) : null, newExtra: keysOld ? [...keysNow].filter((k) => !keysOld.has(k)) : null,
    savedSchema: saved?.schema ?? null, savedBoxes: saved ? Object.keys(saved.boxes ?? {}).length : null, savedPicks: saved?.picks?.length ?? null,
    unsavedAfterOpen: currentTreeRecipe.value ? unsaved(d) : null,
    passed: chk.passed, issues: chk.issues.map((x) => x.boxId + " " + x.kind + ": " + x.text.slice(0, 120)),
    finished: res.finished, n: res.n, stuck: res.stuck, failed: res.failed, capped: res.capped,
    code, codeSchema: (await unpackJson(code)).t.schema,
  };
})()`;
const out = {};
try {
  for (const t of list.owner) {
    out[t.key] = {};
    for (const [step, code, old] of [["1 前の形 (schema 2)", t.code, t.code], ["2 v1 で開き直し", null, null]]) {
      const use = code ?? out[t.key]["1 前の形 (schema 2)"].code;
      await c.size(1660, 860, false);
      await c.go(`${ORIGIN}/web.html`);
      await c.ev(`(() => { try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("exiledesk.changelog.seen", "9.9.9"); } catch {} return 1; })()`);
      await c.go(`${ORIGIN}/web.html?page=sim-tree#recipe=${use}`);
      if (!(await settle())) { out[t.key][step] = { err: "開かない" }; continue; }
      await sleep(800);
      await c.ev(KIT);
      try { out[t.key][step] = await long(MEASURE.replace("OLD ?", `${JSON.stringify(old)} ?`).replace("unpackJson(OLD)", `unpackJson(${JSON.stringify(old)})`)); } catch (e) { out[t.key][step] = { err: String(e).slice(0, 600) }; }
      const r = out[t.key][step];
      console.log(`=== ${t.key} / ${step}: 箱 ${r.boxes} / 決め ${r.picks} (手 ${r.pickHands}・完成 / 失敗だけ ${r.pickDoneOnly}) / 要確認 ${r.orphans} / 増えた ${JSON.stringify(r.fresh)} / 前に有って今無い ${JSON.stringify(r.oldMissing)} / 今だけ ${JSON.stringify(r.newExtra)} / 保存 ${r.savedSchema} 箱 ${r.savedBoxes} 決め ${r.savedPicks} / 開いた直後の未保存 ${r.unsavedAfterOpen} / 合格 ${r.passed} 知らせ ${r.issues?.length} / 完成 ${r.finished}/${r.n} 止まり ${r.stuck} 失敗 ${r.failed} 打ち止め ${r.capped} / URL の形 ${r.codeSchema}${r.err ? " / 落ち " + r.err : ""}`);
      for (const x of r.issues ?? []) console.log("  - " + x);
    }
  }
} finally { c.close(); }
