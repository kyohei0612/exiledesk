/**
 * tutorial-walk.mjs — シミュのチュートリアル (tutorial.md T-21 PC / T-26 スマホ) を頭から最後まで、光る所を本物のマウス (タッチ) の出来事で押して通す (T-24 ①、チュートリアル部長 10-31)。
 * ベース選び (?page=sim-base) の入口の「始める」から、札の光る枠 ([data-tut-ring]) か札の中の光るボタンの真ん中を押すだけ。押す前に真ん中の要素が光る所かも見る (隠れの数え)。
 * 最後に木を猿の口で読む: 精査 (check) の合格・100 人で完成・止まり・役の箱が全部あるか。見張りの数え (合格の材料ではない = G-22)。
 *
 *   node scripts/sim-watch/tutorial-walk.mjs [origin] [--w 1440] [--h 900] [--phone] [--stray] [--shots <dir>] [--port 9482]
 *   --stray-kind 0|1|2 = 外れる手の種類を 1 つに (0 Esc・1 ☑ を入れずに決める・2 違う物を持つ)
 *   --stray = 4〜13 段で 1 回ずつ外れる手を混ぜる (Esc・☑ を入れずに決める・違う物を持つ)。赤い文は札の「1 つ戻す」で戻して続ける (モンキー 7 の後、10-31)
 *   既定 http://localhost:1440 (dev、開発版の口 __simMonkey とスイッチ simTutorial が要る)。--phone = 幅 390 のスマホ (タッチ)
 */
import { openChrome, sleep } from "./cdp.mjs";

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const ORIGIN = (args.find((a) => /^https?:\/\//.test(a)) ?? "http://localhost:1440").replace(/\/$/, "");
const PHONE = args.includes("--phone");
const W = Number(opt("--w") ?? (PHONE ? 390 : 1440)), H = Number(opt("--h") ?? (PHONE ? 844 : 900));
const SHOTS = opt("--shots");
const STRAY = args.includes("--stray");
/** --stray-kind 0|1|2 = 外れる手の種類を 1 つに決める (0 Esc・1 ☑ を入れずに決める・2 違う物を持つ) */
const STRAY_KIND = opt("--stray-kind");
const c = await openChrome(Number(opt("--port") ?? 9482));
const log = (s) => console.log(s);

/** 真ん中を押す (PC はマウス、スマホはタッチ)。押す前に真ん中の要素を返す */
async function press(x, y) {
  const hit = await c.ev(`(() => { const e = document.elementFromPoint(${x}, ${y}); if (!e) return "(無し)"; const a = [...e.attributes].filter((x) => x.name.startsWith("data-") && !x.name.startsWith("data-v-")).map((x) => x.name).slice(0, 2).join(" "); return e.tagName.toLowerCase() + (a ? " " + a : ""); })()`);
  if (PHONE) {
    await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  }
  return hit;
}
/** 札の今: 何手目・場面の鍵 (光らせる所の鍵は札に出さないので文の頭)・光る枠・札の中の光るボタン */
const STATE = `(() => {
  const card = document.querySelector("[data-tut-card]");
  const ring = document.querySelector("[data-tut-ring]")?.getBoundingClientRect();
  const btn = card?.querySelector("button.tut-ring")?.getBoundingClientRect();
  const n = card?.querySelector("header span")?.textContent?.trim() ?? "";
  const box = (r) => r && r.width > 0 ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), out: r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth } : null;
  const cr = card?.getBoundingClientRect();
  return { on: !!card, n, say: (card?.querySelector("[data-tut-say]")?.textContent ?? "").trim().slice(0, 70), off: !!card?.querySelector("[data-tut-off]"), wrong: !!card?.querySelector("[data-tut-say].text-rose-800"),
    ring: box(ring), btn: box(btn), card: cr ? { l: Math.round(cr.left), t: Math.round(cr.top), r: Math.round(cr.right), b: Math.round(cr.bottom) } : null };
})()`;

const report = { size: `${W}x${H}${PHONE ? " phone" : ""}`, steps: {}, stalls: [], covered: [], cardOver: [], strays: [], wrongs: [], errors: [] };
const strayed = new Set();
/** 外れる手 (段ごとに 1 回)。した事を返す。できる物が無ければ null (次の場面でまた試す) */
async function stray(n, say) {
  const kind = STRAY_KIND != null ? Number(STRAY_KIND) : n % 3;
  const vis = (sel) => c.ev(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.getClientRects().length && !e.disabled); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  if (kind === 0) {
    await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    return "Esc";
  }
  if (kind === 1) {
    if (!/☑/.test(say)) return null;
    const go = (await vis("[data-tree-hand-aim-go]")) ?? (await vis("[data-tree-hand-keep-go]")) ?? (await vis("[data-tree-hand-card]"));
    if (!go) return null;
    await press(go.x, go.y);
    return "☑ を入れずに決める";
  }
  if (!/棚の/.test(say)) return null;
  const other = await vis(`[data-tree-shelf] [data-shelf][data-key="chaos"]`);
  if (!other) return null;
  await press(other.x, other.y);
  return "違う物 (カオスオーブ) を持つ";
}
try {
  await c.size(W, H, PHONE);
  if (PHONE) await c.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await c.go(`${ORIGIN}/web.html`);
  await c.ev(`(() => { try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("exiledesk.changelog.seen", "9.9.9"); } catch {} return 1; })()`);
  await c.go(`${ORIGIN}/web.html?page=sim-base`);
  if (!(await c.until("!!document.querySelector('[data-tut-start]')?.getClientRects().length", 60000))) throw new Error("入口の帯 (data-tut-start) が出ない");
  const st = await c.ev(`(() => { const e = document.querySelector('[data-tut-start]'); e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  await sleep(300);
  await press(st.x, st.y);
  if (!(await c.until("!!document.querySelector('[data-tut-card]')", 20000))) throw new Error("札が出ない");
  let last = "", same = 0, waits = 0, shotN = 0;
  for (let i = 0; i < 260; i++) {
    const s = await c.ev(STATE);
    if (!s.on) { log("札が閉じた (終わる)"); break; }
    if (s.off) { report.stalls.push({ n: s.n, why: "チュートリアルの木から離れた" }); break; }
    const sig = `${s.n}|${s.say}`;
    same = sig === last ? same + 1 : 0; last = sig;
    report.steps[s.n.split("/")[0].trim()] ??= s.say;
    if (s.wrong && same === 0) report.wrongs.push(`${s.n} ${s.say}`);
    const num = Number(s.n.split("/")[0]);
    if (STRAY && !s.wrong && num >= 4 && num <= 13 && !strayed.has(num)) {
      const did = await stray(num, s.say);
      if (did) { strayed.add(num); report.strays.push(`${s.n} ${did} (場面: ${s.say})`); log(`${s.n.padEnd(7)} 外れる手: ${did}`); await sleep(900); continue; }
    }
    // 赤い文の時は札のボタン (1 つ戻す・完成形の設定へ) を先に
    const tgt = s.wrong && s.btn ? s.btn : s.ring && !s.ring.out ? s.ring : s.btn;
    if (!tgt) {
      // 待つ場面 (穴チェック・100 人を回している間)。長く光る所が無ければ止まり
      if (++waits > 120) { report.stalls.push({ n: s.n, why: `光る所が無いまま: ${s.say}` }); break; }
      await sleep(500); continue;
    }
    waits = 0;
    if (same > 6) { report.stalls.push({ n: s.n, why: `押しても進まない: ${s.say}` }); if (SHOTS) await c.shot(`${SHOTS}/tut-${PHONE ? "phone" : W}-stall.png`); break; }
    // 札が光る所に重なっていないか
    if (s.card && s.ring && !(s.card.r < s.ring.x - s.ring.w / 2 || s.card.l > s.ring.x + s.ring.w / 2 || s.card.b < s.ring.y - s.ring.h / 2 || s.card.t > s.ring.y + s.ring.h / 2)) report.cardOver.push(`${s.n} ${s.say}`);
    const hit = await press(tgt.x, tgt.y);
    if (s.ring && /data-tut-card|tut-note/.test(hit)) report.covered.push(`${s.n} ${s.say} → ${hit}`);
    log(`${s.n.padEnd(7)} ${s.say}  ⇒ ${hit}`);
    if (SHOTS && /^(6|12|14) \//.test(s.n) && shotN < 3 && same === 0) { await sleep(400); await c.shot(`${SHOTS}/tut-${PHONE ? "phone" : W}-${s.n.split("/")[0].trim()}.png`); shotN++; }
    await sleep(700);
  }
  // 木の答え合わせ (猿の口)
  const fin = await c.ev(`(async () => { const M = window.__simMonkey; if (!M) return null; const k = await M.check(); const r = M.run(100, 1); const d = M.dump(); return { passed: k.passed, issues: k.issues.map((x) => x.text).slice(0, 5), run: { n: r.n, finished: r.finished, stuck: r.stuck }, boxes: Object.keys(d.boxes).length, done: Object.values(d.boxes).filter((b) => b.done === "main").length, fracAsked: !!d.fracAsked, from: d.start?.from ?? null, qNo: !!d.goalQualityNo }; })()`);
  report.tree = fin;
  if (SHOTS) await c.shot(`${SHOTS}/tut-${PHONE ? "phone" : W}-end.png`);
} catch (e) { report.stalls.push({ why: String(e?.message ?? e) }); }
finally {
  report.errors = c.errors;
  log(JSON.stringify(report, null, 1));
  c.close();
}
