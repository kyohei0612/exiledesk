/**
 * lines.mjs — 線の見張り (10-28 深夜ブラック、オーナー「途中で終わってる奴もあるし。線がマジで修正してくれ忘れ過ぎ」)。
 * 線を直すたびに必ず回し、どれも 0 になってから返す。「線を全部表示」を入れた PC の画面で、木の線と戻り・統合の線を数える:
 *  (L1) どの線も両端が箱・手の札・ほかの線 (枝分かれ) につながる (途中の空中で終わらない)
 *  (L2) 戻り・統合の札がある箱には、そこから出る線か印がある (始めに戻る・作り直しは数えない = 行き先の箱が無い)
 *  (L3) 線が出元・行き先でない箱や手の札を横切らない
 *  (L4) 線が木の外を回らない (左右は全部の箱の外へ 12、下は 40 出たら)
 * 画面の座標で測る (倍率はツリーの倍率を掛ける)。単独でも回せる:
 *   node scripts/sim-watch/lines.mjs [origin] [--only key] [--code <レシピ>] [--off a,b (開発版のスイッチを閉じて)]   … 既定 http://127.0.0.1:1440 (開発版、スイッチの下も入る)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * ページの中で数える式。返り値 = { k, lines, boxes, bad: [{ rule, line, what }] }。
 * only = 箱の id: その箱に乗せた時に光る線 (data-tree-merge-hot) だけを数える (再挑戦の線はふだん描かず乗せた時だけ = S-87c、スイッチ retryHover)
 */
export const linesExpr = (only = null) => `(() => {
  const ONLY = ${JSON.stringify(only)};
  const k = document.querySelector("[data-tree-lines] path")?.getScreenCTM()?.a ?? 1;
  const rectOf = (e) => { const r = e.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; };
  // 箱の範囲は箱の上に出ている札 (「…が付いた」) も含める
  const boxes = [...document.querySelectorAll("[data-tree-box]")].map((b) => { const r = rectOf(b), l = b.querySelector("[data-tree-legend]"); const g = l ? rectOf(l) : r; return { id: b.getAttribute("data-box-id"), x0: Math.min(r.x0, g.x0), y0: Math.min(r.y0, g.y0), x1: Math.max(r.x1, g.x1), y1: r.y1 }; });
  const chips = [...document.querySelectorAll("[data-tree-hand], [data-tree-split-chip], [data-tree-pass-next]")].map((c) => ({ id: "札 " + (c.getAttribute("data-hand-of") ?? c.getAttribute("data-box-id")), ...rectOf(c) }));
  const marks = [...document.querySelectorAll("[data-tree-join-mark]")].map((m) => ({ id: "印", from: m.getAttribute("data-from"), ...rectOf(m) }));
  const paths = [];
  for (const g of document.querySelectorAll("[data-tree-edge]")) for (const p of g.querySelectorAll("path")) paths.push({ el: p, name: "木の線 " + g.getAttribute("data-edge-id"), kind: "edge", from: g.getAttribute("data-edge-id") });
  for (const p of document.querySelectorAll(ONLY ? "[data-tree-merge-hot]" : "[data-tree-merge-line]")) if (!ONLY || p.getAttribute("data-from") === ONLY) paths.push({ el: p, name: p.getAttribute("data-kind") + " " + p.getAttribute("data-from") + "→" + p.getAttribute("data-to"), kind: p.getAttribute("data-kind"), from: p.getAttribute("data-from"), to: p.getAttribute("data-to") });
  const pts = (p) => { const n = p.el.getTotalLength(); if (!n) return []; const m = p.el.getScreenCTM(); const out = []; const step = Math.max(2, n / 400); for (let s = 0; s <= n + 0.01; s += step) { const q = p.el.getPointAtLength(Math.min(s, n)); out.push({ x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f }); } return out; };
  for (const p of paths) p.pts = pts(p);
  const near = (r, q, d) => q.x >= r.x0 - d && q.x <= r.x1 + d && q.y >= r.y0 - d && q.y <= r.y1 + d;
  const inside = (r, q, d) => q.x > r.x0 + d && q.x < r.x1 - d && q.y > r.y0 + d && q.y < r.y1 - d;
  const bad = [];
  const T = 4 * Math.max(k, 0.5);
  // (L1) 両端
  // only の時は乗せた箱から出る線だけを数える (木の線は端のつながりを見るためだけ)
  const mine = (p) => !ONLY || (p.kind !== "edge" && p.from === ONLY);
  for (const p of paths) {
    if (p.pts.length < 2 || !mine(p)) continue;
    for (const [end, q] of [["始め", p.pts[0]], ["終わり", p.pts.at(-1)]]) {
      const ok = boxes.some((r) => near(r, q, T)) || chips.some((r) => near(r, q, T)) || marks.some((r) => near(r, q, T))
        || paths.some((o) => o !== p && o.pts.some((z) => Math.abs(z.x - q.x) <= T && Math.abs(z.y - q.y) <= T));
      if (!ok) bad.push({ rule: "L1", line: p.name, what: end + "が空中で終わる (" + Math.round(q.x) + "," + Math.round(q.y) + ")" });
    }
  }
  // (L2) 札のある箱に線か印
  for (const b of document.querySelectorAll("[data-tree-box]")) {
    const tag = b.querySelector("[data-tree-back-tag]"); if (!tag) continue;
    if (ONLY && b.getAttribute("data-box-id") !== ONLY) continue;
    const id = b.getAttribute("data-box-id"), text = tag.innerText.replace(/\\s+/g, " ").trim();
    // 始めに戻る・作り直し は行き先の箱が無い (札だけ)
    if (/始め|作り直し/.test(text)) continue;
    const has = paths.some((p) => p.kind !== "edge" && p.from === id) || marks.some((m) => m.from === id);
    if (!has) bad.push({ rule: "L2", line: id, what: (ONLY ? "乗せても" : "") + "札「" + text + "」なのに線も印も無い", box: id });
  }
  // (L3) 横切り: 線の点が、出元・行き先でない箱 / 札の内側 (縁から 3 px 内) に入る
  const ends = (p) => { const a = p.pts[0], z = p.pts.at(-1); return [...boxes, ...chips].filter((r) => near(r, a, T) || near(r, z, T)); };
  for (const p of paths) {
    if (!mine(p)) continue;
    const skip = new Set(ends(p));
    if (p.kind !== "edge") for (const r of boxes) if (r.id === p.from || r.id === p.to) skip.add(r);
    // 木の線は自分の手の札の上を通る (札は線の上に置く作り)
    if (p.kind === "edge") for (const r of chips) if (r.id === "札 " + p.from) skip.add(r);
    const hit = new Set();
    for (const q of p.pts) for (const r of [...boxes, ...chips]) if (!skip.has(r) && inside(r, q, 3 * k)) hit.add(r.id);
    if (hit.size) bad.push({ rule: "L3", line: p.name, what: "横切る: " + [...hit].join("・") });
  }
  // (L4) 木の外
  // 左右は全部の箱の外へ 12 出たら (オーナーの絵 owner-1028-retry-lines の四角は木の縁のすぐ外を回った)。下は出口の帯 (箱の下 +20〜34) より下
  const X0 = Math.min(...boxes.map((r) => r.x0)), X1 = Math.max(...boxes.map((r) => r.x1)), Y1 = Math.max(...boxes.map((r) => r.y1));
  for (const p of paths) {
    if (!mine(p)) continue;
    const q = p.pts.find((q) => q.x < X0 - 12 * k || q.x > X1 + 12 * k || q.y > Y1 + 40 * k);
    if (q) bad.push({ rule: "L4", line: p.name, what: "木の外を回る (" + Math.round(q.x) + "," + Math.round(q.y) + ")" });
  }
  return { k: Math.round(k * 100) / 100, lines: paths.length, boxes: boxes.length, bad };
})()`;

/** 前の名前 (線を全部表示で数える式) */
export const LINES = linesExpr();

/** 線を全部表示にして数える (入れた時は数えた後に戻す)。全部表示に出ない再挑戦の線 (L2) は、その箱に乗せて光る線を数え直す (S-87c) */
export async function measureLines(ev, sleep) {
  // 線に印 (data-edge-id・data-from) の無い前の版では数えない (null)
  if (!(await ev(`!!document.querySelector("[data-tree-edge][data-edge-id]")`))) return null;
  const on = await ev(`document.querySelector("[data-tree-lines-all]")?.getAttribute("aria-pressed") === "true"`);
  if (!on) { await ev(`document.querySelector("[data-tree-lines-all]")?.click(), 1`); await sleep(600); }
  // 乗せている箱が無い状態で
  await ev(`document.querySelectorAll("[data-tree-box]").forEach((b) => b.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }))), 1`); await sleep(300);
  const r = await ev(LINES);
  const later = r.bad.filter((b) => b.rule === "L2" && b.box);
  if (later.length) {
    r.bad = r.bad.filter((b) => !later.includes(b));
    for (const b of later) {
      await ev(`document.querySelector('[data-tree-box][data-box-id="${b.box}"]')?.dispatchEvent(new PointerEvent("pointerenter")), 1`); await sleep(250);
      const h = await ev(linesExpr(b.box));
      r.bad.push(...h.bad.map((x) => ({ ...x, line: x.line + " (乗せた時)" })));
      r.hovered = (r.hovered ?? 0) + 1;
      await ev(`document.querySelector('[data-tree-box][data-box-id="${b.box}"]')?.dispatchEvent(new PointerEvent("pointerleave")), 1`); await sleep(150);
    }
  }
  // 入れた「線を全部表示」は戻す (このブラウザに覚えるので、後の見張りに残さない)
  if (!on) { await ev(`document.querySelector("[data-tree-lines-all]")?.click(), 1`); await sleep(300); }
  return r;
}

/** watch.mjs から: 木ごとに数えて、合わない所を bad に積む */
export function makeLineRules({ ev, sleep, count, bad, note }) {
  return {
    async checkLines(t) {
      const r = await measureLines(ev, sleep);
      if (!r) { note.push(`${t.key}: 線の見張りは線の印 (data-edge-id) の無い版では数えない`); return null; }
      count(t.key, "線");
      for (const b of r.bad) bad(t.key, `PC 線 ${b.line}`, `(${b.rule}) ${b.what}`, "", "0 件");
      return r;
    },
  };
}

// 単独で回す
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { openChrome, sleep } = await import("./cdp.mjs");
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const ORIGIN = (args.find((a) => /^https?:\/\//.test(a)) ?? "http://127.0.0.1:1440").replace(/\/$/, "");
  // --codes <file> = 1 行 1 つのレシピ (recipe= の後ろ。オーナーの木など) も足す
  const extra = [...(opt("--code") ? [opt("--code")] : []), ...(opt("--codes") ? readFileSync(opt("--codes"), "utf8").split(/\r?\n/) : [])]
    .map((s) => s.trim().replace(/^.*recipe=/, "")).filter(Boolean).map((code, i) => ({ key: `code${i + 1}`, code }));
  const trees = [...JSON.parse(readFileSync(new URL("./trees.json", import.meta.url), "utf8")).trees, ...extra].filter((t) => !opt("--only") || t.key === opt("--only"));
  const c = await openChrome(Number(process.env.WATCH_PORT ?? 9372));
  let total = 0;
  try {
    for (const t of trees) {
      await c.size(1660, 860, false);
      await c.go(`${ORIGIN}/web.html`);
      await c.ev(`(() => { try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("exiledesk.changelog.seen", "9.9.9"); } catch {} return 1; })()`);
      await c.go(`${ORIGIN}${/:146\d\b/.test(ORIGIN) ? "/" : "/web.html"}?page=sim-tree${opt("--off") ? `&off=${opt("--off")}` : ""}#recipe=${t.code}`);
      if (!(await c.until(`document.querySelectorAll("[data-tree-box]").length > 0`, 30000))) { console.log(`${t.key}: 木が開かない`); total++; continue; }
      await sleep(2500);
      const r = await measureLines(c.ev, sleep);
      if (!r) { console.log(`${t.key}: 線の印の無い版 (数えない)`); continue; }
      total += r.bad.length;
      const by = {}; for (const b of r.bad) by[b.rule] = (by[b.rule] ?? 0) + 1;
      console.log(`${t.key}: 箱 ${r.boxes} / 線 ${r.lines} / 乗せて数えた ${r.hovered ?? 0} / 倍率 ${r.k} / 合わない ${r.bad.length} ${JSON.stringify(by)}`);
      for (const b of r.bad) console.log(`  - (${b.rule}) ${b.line}: ${b.what}`);
      if (process.env.SHOT) await c.shot(`${process.env.SHOT}/${t.key}.png`);
    }
  } finally { c.close(); }
  console.log(`\n線の合わない所: ${total}`);
  process.exitCode = total ? 1 : 0;
}
