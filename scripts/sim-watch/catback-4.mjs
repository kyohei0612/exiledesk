/**
 * catback-4.mjs — S-51d B' (スイッチ catBack) の触る道 (R-18、シミュ部長 11-18 夜)。最終チェック長が 1461 でそのまま回す。
 *   node scripts/sim-watch/catback-4.mjs [origin] [--off] [--shots <dir>]   (SIZE=1920x1080 で画面の大きさ、ONLY=b40,b71 で一部だけ)
 *   既定 origin = http://dev.exiledesk.localhost:1461 (pnpm preview:prod -- --dev)。--off = ?off=catBack で前の形 (比べ用)
 * 道: 本番の共有 URL r/83ddRWvV (指輪) の中身で開く (R-18b) → オーナーが同じ手を置き直して戻した所の上の箱ごとに:
 *   手の札を押す → 窓の「この手を消す」→ 箱の ＋ → 棚から同じ手 (お告げも同じ) → カードを押す
 *   → 新しくできた下の箱に自動の ↩ が付くか (入り = 付く・切り = 未設定) を見る。b71 は手を消しただけでその箱に自動の ↩ (触媒の高貴の後で品質 0)
 * 箱の番号は開いた時の組み直しの番号 (木の並びで決まる、S-50f)。様子は開発版の口 __simMonkey.dump で読むだけ (組むのは全部画面の操作)。
 * 区切りごとに progress/sim-catalyst-b-run.log へ 1 行。終わりの値: 期待どおりなら 0
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { openChrome, sleep } from "./cdp.mjs";

const args = process.argv.slice(2);
const ORIGIN = (args.find((a) => /^https?:\/\//.test(a)) ?? "http://dev.exiledesk.localhost:1461").replace(/\/$/, "");
const OFF = args.includes("--off"), TAG = OFF ? "切り" : "入り";
const SHOTS = args.includes("--shots") ? args[args.indexOf("--shots") + 1] : null;
const say = (s) => { const l = `${new Date().toTimeString().slice(0, 8)} catback-4 ${TAG} ${s}`; console.log(l); try { appendFileSync(process.env.RUN_LOG ?? "C:/Users/kyohei/ExileDesk/progress/sim-catalyst-b-run.log", l + "\n"); } catch { /* 記録が書けなくても続ける */ } };
// 上の箱・置き直す手・お告げ。期待 = 入りなら新しい下の箱 (狙いが消えた・外れが消えた) に自動の ↩、b71 は消した箱そのものに自動の ↩
const CASES = [
  { box: "b61", key: "annul", omens: [] },
  { box: "b40", key: "exalt_perfect", omens: ["OmenofCatalysingExaltation", "OmenofDextralExaltation"] },
  { box: "b47", key: "exalt_perfect", omens: ["OmenofDextralExaltation", "OmenofCatalysingExaltation"] },
  { box: "b71", key: null, omens: [] },
];

async function recipeCode() {
  const html = await (await fetch("https://exiledesk.com/r/83ddRWvV")).text();
  const m = /location\.replace\("\/?#recipe=([A-Za-z0-9_-]+)"\)/.exec(html);
  if (!m) throw new Error("共有 URL の中身が取れない");
  return m[1];
}

const code = await recipeCode();
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const c = await openChrome(Number(process.env.WATCH_PORT ?? 9374));
let bad = 0;
const ev = (s) => c.ev(s);
const click = (sel, re) => ev(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(sel)})].filter((x) => ${re ? `new RegExp(${JSON.stringify(re)}).test(x.textContent)` : "true"}); const el = els.find((x) => x.offsetParent) ?? els[0]; if (!el) return false; el.scrollIntoView({ block: "center" }); el.click(); return true; })()`);
const rectOf = (sel) => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
const mouse = async (type, x, y) => c.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, pointerType: "mouse" });
/** 本物のマウスで押す (＋ は長押しの引っ張りも受けるので pointer の出来事が要る)。画面の外なら木の何も無い所を引いて寄せる */
async function mouseClick(sel) {
  let r = await rectOf(sel);
  const pane = await ev(`(() => { const p = document.querySelector(".vue-flow__pane")?.getBoundingClientRect(); return p ? [p.x, p.y, p.width, p.height] : null; })()`);
  const onFlow = await ev(`!!document.querySelector(${JSON.stringify(sel)})?.closest('.vue-flow')`);
  for (let i = 0; r && pane && onFlow && i < 8; i++) {
    const cx = pane[0] + pane[2] / 2, cy = pane[1] + pane[3] / 2;
    if (Math.abs(r[0] - cx) < pane[2] / 2 - 80 && Math.abs(r[1] - cy) < pane[3] / 2 - 60) break;
    const dx = Math.max(-pane[2] / 3, Math.min(pane[2] / 3, cx - r[0])), dy = Math.max(-pane[3] / 3, Math.min(pane[3] / 3, cy - r[1]));
    await mouse("mousePressed", cx, cy); for (let s = 1; s <= 8; s++) await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cx + (dx * s) / 8, y: cy + (dy * s) / 8, button: "left", buttons: 1 }); await mouse("mouseReleased", cx + dx, cy + dy);
    await sleep(300); r = await rectOf(sel);
  }
  if (!r) return false;
  await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r[0], y: r[1] }); await mouse("mousePressed", r[0], r[1]); await sleep(60); await mouse("mouseReleased", r[0], r[1]);
  return true;
}
const boxes = () => ev(`(() => { const B = window.__simMonkey.dump().boxes; return Object.fromEntries(Object.values(B).map((b) => [b.id, { p: b.parent ?? null, hand: b.hand?.currency ?? null, back: b.back ?? null, auto: !!b.autoBack, hb: !!b.handBack, out: b.out }])); })()`);
try {
  const [VW, VH] = (process.env.SIZE ?? "1440x900").split("x").map(Number); await c.size(VW, VH, false);
  for (const k of CASES.filter((x) => !process.env.ONLY || process.env.ONLY.split(",").includes(x.box))) {
    await c.go(`${ORIGIN}/web.html${OFF ? "?off=catBack" : ""}#recipe=${code}`);
    if (!(await c.until(`!!document.querySelector('[data-tree-box]') && !!window.__simMonkey`, 60000))) { say(`${k.box}: 木が出ない エラー`); bad++; continue; }
    // 言語の窓 (初めての時だけ)
    await ev(`(() => { const d = [...document.querySelectorAll("div")].find((x) => /表示する言語を選んでください/.test(x.textContent) && x.querySelectorAll("button").length <= 4 && x.offsetParent); const b = d && [...d.querySelectorAll("button")].find((x) => x.textContent.trim() === "日本語"); b?.click(); return !!b; })()`);
    await sleep(800);
    const before = await boxes();
    const kids0 = Object.keys(before).filter((i) => before[i].p === k.box);
    // 1 手の札 → この手を消す
    if (!(await click(`[data-tree-hand][data-hand-of="${k.box}"]`))) { say(`${k.box}: 手の札が無い エラー`); bad++; continue; }
    await sleep(800);
    if (!(await click("button", "この手を消す"))) { say(`${k.box}: 「この手を消す」が無い エラー`); bad++; continue; }
    await sleep(1000);
    let after = await boxes();
    if (!k.key) {
      const b = after[k.box];
      const ok = OFF ? !b.back : !!b.back && b.auto;
      say(`${k.box}: 手を消した後 ↩=${b.back ?? "未設定"}${b.auto ? "(自動)" : ""} → ${ok ? "期待どおり" : "期待と違う エラー"}`);
      if (!ok) bad++;
      if (SHOTS) await c.shot(`${SHOTS}/catback-${TAG}-${k.box}-${VW}.png`);
      continue;
    }
    // 2 ＋ → 棚から同じ手 → お告げ → カード
    await ev(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`); await sleep(400);
    if (!(await mouseClick(`[data-tree-box][data-box-id="${k.box}"] [data-tree-next]`))) { say(`${k.box}: ＋ が無い エラー`); bad++; continue; }
    await sleep(900);
    if (!(await mouseClick(`[data-shelf][data-key="${k.key}"]`))) { say(`${k.box}: 棚に ${k.key} が無い エラー (${await ev(`[...document.querySelectorAll('[data-shelf]')].slice(0, 40).map((x) => x.dataset.key).join(",")`)})`); bad++; continue; }
    await sleep(500);
    for (const o of k.omens) if (!(await mouseClick(`[data-held-omens] [data-key="${o}"]`))) { say(`${k.box}: お告げ ${o} が無い エラー`); bad++; }
    await sleep(400);
    if (!(await mouseClick("[data-tree-hand-card]"))) { say(`${k.box}: カードが無い エラー`); bad++; continue; }
    await sleep(2000);
    after = await boxes();
    const kids = Object.keys(after).filter((i) => after[i].p === k.box);
    const fresh = kids.filter((i) => !after[i].hand && after[i].out !== "hit");
    const autos = fresh.filter((i) => after[i].back && after[i].auto);
    const desc = kids.map((i) => `${i}[${after[i].out}]↩${after[i].back ?? "未設定"}${after[i].auto ? "a" : ""}`).join(" ");
    // 期待: 入りは自動の ↩ が前より 1 つ以上多い (オーナーが置き直した所)、切りは前のオーナーの手の戻りの箱が未設定に戻る
    const unset = fresh.filter((i) => !after[i].back).length;
    const ok = kids.length > 0 && (OFF ? unset > 0 : unset === 0 && autos.length > 0);
    say(`${k.box}: 置き直した (前の下 ${kids0.length} 箱 → ${kids.length} 箱) ${desc} → ${ok ? "期待どおり" : "期待と違う エラー"}`);
    if (!ok) bad++;
    if (SHOTS) await c.shot(`${SHOTS}/catback-${TAG}-${k.box}-${VW}.png`);
  }
  say(`JS エラー ${c.errors.length}${c.errors.length ? " " + c.errors.slice(0, 3).join(" / ") : ""}`);
  say(`済み (期待と違う ${bad})`);
} catch (e) { say(`エラー ${String(e).slice(0, 200)}`); bad++; } finally { c.close(); }
process.exit(bad ? 1 : 0);
