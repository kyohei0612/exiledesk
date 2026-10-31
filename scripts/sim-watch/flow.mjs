/**
 * flow.mjs — 木の中身でなく流れの見張り (10-31、オーナー「新システムに切り替えて」)。本物の押しで、今の流れが通るかを見る。開発版だけ (口 __simMonkey とスイッチが要る)
 *   A S-10c: 完成形の MOD 0 個はレアリティを問わず「決めた」で窓が出て止まる。狙いがあれば進む (PC・スマホ)
 *   B S-107: 見本から白紙にすると要確認が消え、手を足して合格すれば「100 人回す」が押せる
 *   C S-70: 穴チェックに合格するまで「100 人回す」は灰色 (data-run-locked)、合格で押せる
 *   D S-57c: 手だけ替える → 回すと結果の帯に 替える前 → 今
 *   E S-10c: MOD 0 個の保存の木が開けて回る
 * 合わない所があれば終わりの値 1。--port で Chrome の口
 *   node scripts/sim-watch/flow.mjs [origin] [--port 9481]
 */
import { readFileSync } from "node:fs";
import { openChrome, sleep } from "./cdp.mjs";

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const ORIGIN = (args.find((a) => /^https?:\/\//.test(a)) ?? "http://localhost:1440").replace(/\/$/, "");
const c = await openChrome(Number(opt("--port") ?? 9481));
const O = `${ORIGIN}/web.html`;
const bad = [];
const check = (name, ok, got) => { console.log(`${ok ? "ok" : "NG"} ${name}${ok ? "" : ` → ${got}`}`); if (!ok) bad.push(name); };
const vis = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.getClientRects().length && !e.disabled)`;
const click = async (sel, touch) => {
  const r = await c.ev(`(() => { const e = ${vis(sel)}; if (!e) return null; e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!r) return false;
  await sleep(150);
  if (touch) { await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [r] }); await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); } else {
    await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...r });
    await c.send("Input.dispatchMouseEvent", { type: "mousePressed", ...r, button: "left", clickCount: 1 });
    await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...r, button: "left", clickCount: 1 });
  }
  return true;
};
const fresh = async (w, h, m, q = "lang=ja", hash = "") => {
  await c.go("about:blank"); await c.size(w, h, m);
  await c.go(`${O}?page=sim-tree&${q}${hash}`);
  await c.until(`!!window.__simMonkey?.dump`, 60000); await sleep(1200);
};
const openGoal = `(async () => { const m = await import("/src/views/simulator/tree/use-tree.ts"); m.useTree().goalPage.value = true; })()`;
const goalState = `({ win: document.querySelector("[data-tree-goal-need-mod]")?.innerText ?? null, ask: !!document.querySelector("[data-tree-start-ask]") })`;
const passed = `!!document.querySelector("[data-tree-test-ok]") && !document.querySelector("[data-tree-test]").disabled`;
const runState = `(() => { const b = document.querySelector("[data-tree-run]"); return { off: !!b?.disabled, locked: !!b?.hasAttribute("data-run-locked") }; })()`;

try {
  for (const [name, w, h, m] of [["PC", 1660, 900, false], ["スマホ", 390, 844, true]]) {
    for (const [cs, setup, stops] of [["0 個レア", "", true], ["0 個マジック", `t.setRarity("magic");`, true], ["0 個ノーマル", `t.setRarity("normal");`, true], ["狙いありレア", "M.setGoal(pick);", false]]) {
      await fresh(w, h, m);
      await c.ev(`(async () => { const M = __simMonkey, t = (await import("/src/views/simulator/tree/use-tree.ts")).useTree(); M.setBase("両手メイス", "", 82); const g = M.goalCandidates().slice(0, 1); const pick = g.map((x) => ({ modId: x.tiers[0].modId, tier: x.tiers[0].tier })); ${setup} })()`);
      await c.ev(openGoal); await sleep(1200);
      await click("[data-tree-goal-done]", m); await sleep(800);
      const s = await c.ev(goalState);
      check(`A ${name} ${cs}`, stops ? !!s.win && !s.ask : !s.win && s.ask, JSON.stringify(s));
    }
  }

  const trees = JSON.parse(readFileSync(new URL("./trees.json", import.meta.url), "utf8"));
  const amuB = trees.trees.find((t) => t.key === "amuB");
  await fresh(1660, 900, false, "lang=ja", `#recipe=${amuB.code}`);
  await c.until(`Object.keys(__simMonkey.dump().boxes).length > 5`, 60000); await sleep(1500);
  await c.ev(`[...document.querySelectorAll("button")].filter((e) => e.getClientRects().length).find((e) => e.innerText.trim() === "白紙")?.click()`); await sleep(800);
  await c.ev(`[...document.querySelectorAll("button")].filter((e) => e.getClientRects().length).find((e) => /保存せず/.test(e.innerText))?.click()`); await sleep(1000);
  const blank = await c.ev(`(() => { const d = __simMonkey.dump(); return { boxes: Object.keys(d.boxes).length, orphans: d.orphans?.length ?? 0 }; })()`);
  check("B 白紙で要確認が消える", blank.boxes === 1 && !blank.orphans, JSON.stringify(blank));
  await c.ev(`(() => { const a = __simMonkey.add("start", "exalt", [], { hitAims: [] }); a.boxes.forEach((b) => __simMonkey.setDone(b.id, true)); })()`);
  check("B 白紙の後に合格できる", await c.until(passed, 30000), "合格しない");
  const after = await c.ev(runState);
  check("B 白紙の後に 100 人が押せる", !after.off, JSON.stringify(after));

  await fresh(1660, 900, false);
  await c.ev(`(() => { const M = __simMonkey; M.setBase("指輪", "", 82); const g = M.goalCandidates().filter((x) => /耐性/.test(x.text)).slice(0, 1); M.setGoal(g.map((x) => ({ modId: x.tiers[0].modId, tier: x.tiers[x.tiers.length - 1].tier }))); M.add("start", "transmute", [], {}); })()`);
  await sleep(2500);
  const open = await c.ev(runState);
  check("C 決めていない箱がある間は灰色", open.off && open.locked, JSON.stringify(open));
  await c.ev(`(() => { const M = __simMonkey, d = M.dump().boxes; for (const b of Object.values(d)) if (b.id !== "start" && !b.hand && !b.done && !b.back) M.setDone(b.id, b.out === "hit" ? true : "fail"); })()`);
  check("C 自動の穴チェックで合格", await c.until(passed, 30000), "合格しない");
  const ok = await c.ev(runState);
  check("C 合格で押せる", !ok.off && !ok.locked, JSON.stringify(ok));

  await click("[data-tree-run]"); await sleep(600);
  await c.ev(`document.querySelector("[data-tree-run-skip]")?.click()`);
  await c.until(`!!document.querySelector("[data-tree-run-report]")`, 60000); await sleep(400);
  await click("[data-tree-run-report-close]"); await sleep(400);
  await click("[data-tree-hand]"); await sleep(1200);
  await click(`[data-tree-shelf] [data-shelf][data-key="alchemy"]`); await sleep(1000);
  const warn = await c.ev(`!!document.querySelector("[data-tree-hand-warn-swap]")`);
  check("D 手を替える窓に手だけ替える", warn, "ボタンが無い");
  await click("[data-tree-hand-warn-swap]"); await sleep(700);
  await click("[data-tree-hand-card]"); await sleep(2000);
  await c.ev(`(() => { const M = __simMonkey, d = M.dump().boxes; for (const b of Object.values(d)) if (b.id !== "start" && !b.hand && !b.done && !b.back) M.setDone(b.id, b.out === "hit" ? true : "fail"); })()`);
  await c.until(passed, 30000);
  await click("[data-tree-run]"); await sleep(600);
  await c.ev(`document.querySelector("[data-tree-run-skip]")?.click()`);
  await c.until(`!!document.querySelector("[data-tree-run-report]")`, 60000); await sleep(400);
  await click("[data-tree-run-report-close]"); await sleep(400);
  const txt = await c.ev(`document.body.innerText`);
  check("D 回すと 替える前 → 今", /替える前[^\n]*→ 今/.test(txt), "帯に出ない");

  await fresh(1660, 900, false);
  const code = await c.ev(`(async () => { const M = __simMonkey; M.setBase("指輪", "", 82); const a = M.add("start", "transmute", [], { hitAims: [] }); M.setDone(a.boxes[0].id, "fail"); await new Promise((r) => setTimeout(r, 500)); const m = await import("/src/views/simulator/recipe-share.ts"); return /#recipe=(.+)$/.exec(await m.treeShareUrl({ name: "zero", tree: JSON.parse(JSON.stringify(M.dump())) }))[1]; })()`);
  await fresh(1660, 900, false, "lang=ja", `#recipe=${code}`);
  await c.until(`Object.keys(__simMonkey.dump().boxes).length > 1`, 30000);
  const z = await c.ev(`(async () => { const M = __simMonkey; await M.check(); const r = M.run(30, 1); return { boxes: Object.keys(M.dump().boxes).length, n: r.n }; })()`);
  check("E MOD 0 個の保存の木が開けて回る", z.boxes > 1 && z.n === 30, JSON.stringify(z));
  check("JS のエラー 0", !c.errors.length, c.errors.slice(0, 3).join(" / "));
} catch (e) { bad.push(String(e)); console.log("NG 台本が落ちた", e.message); } finally { c.close(); }
console.log(bad.length ? `合わない所 ${bad.length}` : "全部通った");
process.exit(bad.length ? 1 : 0);
