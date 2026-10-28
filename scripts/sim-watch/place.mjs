/**
 * place.mjs — 箱の置き方の見張り (並べ方の章 S-148 の 1・2 と S-141・S-141b、10-28 深夜オーナー「なおってないなー…下の縦ラインに被ってる」「大きい奴に合わせた方が良いかもね」)。
 * 描いた箱の位置 (Vue Flow の箱の translate と大きさ) で数える:
 *  (P1) 箱どうしが重ならない
 *  (P2) 子の帯の真上に別の箱が無い = 子 c の親 p と同じ段に、p でも c の先祖でもない箱があり、c と横に重なる
 *  (P3) 同じ段の箱の上の枠が揃う
 *  (P4) 同じ段の箱の下の枠が揃う (S-141b、スイッチの下でだけ数える: --bottom)
 * 開いた時と、兄弟のいる手の無い箱にカオス (狙い無し) を --grow 回足した後の両方で数える (__simMonkey、開発版だけ)。
 *   node scripts/sim-watch/place.mjs [origin] [--codes <1 行 1 レシピ>] [--only key] [--grow 2] [--off a,b] [--bottom]   … 既定 http://localhost:1442
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const PLACE = `(() => {
  const d = window.__simMonkey.dump();
  const pos = {};
  for (const n of document.querySelectorAll(".vue-flow__node")) {
    const m = /translate\\((-?[\\d.]+)px, (-?[\\d.]+)px\\)/.exec(n.style.transform);
    const box = n.querySelector("[data-tree-box]");
    if (m && box) pos[n.getAttribute("data-id")] = { x: +m[1], y: +m[2], w: box.offsetWidth, h: box.offsetHeight };
  }
  const anc = (id) => { const s = new Set(); for (let x = id; x; x = d.boxes[x]?.parent) s.add(x); return s; };
  const ids = Object.keys(pos), bad = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = pos[ids[i]], b = pos[ids[j]];
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) bad.push({ rule: "P1", what: ids[i] + " と " + ids[j] + " が重なる" });
  }
  for (const c of Object.values(d.boxes)) {
    const p = c.parent, pc = pos[c.id], pp = pos[p]; if (!p || !pc || !pp) continue;
    const up = anc(c.id);
    for (const [id, b] of Object.entries(pos)) {
      if (up.has(id) || Math.abs(b.y - pp.y) > 4) continue;
      if (b.x < pc.x + pc.w && b.x + b.w > pc.x) bad.push({ rule: "P2", what: id + " が " + c.id + " (親 " + p + ") の真上" });
    }
  }
  // 段 = 深さ (描く箱だけ)
  const dep = (id) => { let n = 0; for (let x = d.boxes[id]; x?.parent; x = d.boxes[x.parent]) n++; return n; };
  const rows = {};
  for (const id of ids) (rows[dep(id)] ??= []).push(id);
  for (const [r, list] of Object.entries(rows)) {
    const tops = list.map((id) => pos[id].y), bots = list.filter((id) => d.boxes[id]?.out !== "pass").map((id) => pos[id].y + pos[id].h);
    if (Math.max(...tops) - Math.min(...tops) > 1) bad.push({ rule: "P3", what: (+r + 1) + " 段目の上の枠が " + Math.round(Math.max(...tops) - Math.min(...tops)) + " ずれる" });
    if (bots.length && Math.max(...bots) - Math.min(...bots) > 1) bad.push({ rule: "P4", what: (+r + 1) + " 段目の下の枠が " + Math.round(Math.max(...bots) - Math.min(...bots)) + " ずれる" });
  }
  return JSON.stringify({ boxes: ids.length, bad: [...new Map(bad.map((b) => [b.rule + b.what, b])).values()] });
})()`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { openChrome, sleep } = await import("./cdp.mjs");
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const ORIGIN = (args.find((a) => /^https?:\/\//.test(a)) ?? "http://localhost:1442").replace(/\/$/, "");
  const grow = Number(opt("--grow") ?? 0), bottom = args.includes("--bottom");
  const extra = (opt("--codes") ? readFileSync(opt("--codes"), "utf8").split(/\r?\n/) : []).map((s) => s.trim().replace(/^.*recipe=/, "")).filter(Boolean).map((code, i) => ({ key: `code${i + 1}`, code }));
  const trees = [...JSON.parse(readFileSync(new URL("./trees.json", import.meta.url), "utf8")).trees, ...extra].filter((t) => !opt("--only") || t.key === opt("--only"));
  const c = await openChrome(Number(process.env.WATCH_PORT ?? 9372));
  let total = 0;
  const count = async () => { const r = JSON.parse(await c.ev(PLACE)); r.bad = r.bad.filter((b) => bottom || b.rule !== "P4"); return r; };
  try {
    for (const t of trees) {
      await c.size(1660, 860, false);
      await c.go(`${ORIGIN}/web.html`);
      await c.ev(`(() => { try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("exiledesk.changelog.seen", "9.9.9"); } catch {} return 1; })()`);
      await c.go(`${ORIGIN}/web.html?page=sim-tree${opt("--off") ? `&off=${opt("--off")}` : ""}#recipe=${t.code}`);
      if (!(await c.until(`document.querySelectorAll("[data-tree-box]").length > 0 && !!window.__simMonkey`, 30000))) { console.log(`${t.key}: 開かない`); continue; }
      await sleep(2500);
      let r = await count();
      const steps = [`開いた時 ${r.bad.length}`];
      let bad = r.bad.map((b) => ({ ...b, at: "開いた時" }));
      for (let g = 0; g < grow; g++) {
        const id = await c.ev(`(() => { const d = window.__simMonkey.dump(); const ok = new Set(window.__simMonkey.addable().map((a) => a.id)); const xs = Object.values(d.boxes).filter((b) => ok.has(b.id) && !b.hand && !b.back && !b.done && b.parent && d.boxes[b.parent].outs.length > 1).sort((a, z) => a.x - z.x); return xs[0]?.id ?? null; })()`);
        if (!id) break;
        const res = JSON.parse((await c.ev(`JSON.stringify(window.__simMonkey.add(${JSON.stringify(id)}, "chaos", [], { hitAims: [] }) ?? { ok: false })`)) ?? "{}");
        if (!res.ok) { steps.push(`${id} に足せない`); break; }
        await sleep(1800);
        r = await count();
        steps.push(`${id} にカオス → ${r.bad.length}`);
        bad.push(...r.bad.map((b) => ({ ...b, at: `${id} にカオスの後` })));
      }
      bad = [...new Map(bad.map((b) => [b.rule + b.what, b])).values()];
      total += bad.length;
      console.log(`${t.key}: 箱 ${r.boxes} / ${steps.join(" / ")}`);
      for (const b of bad) console.log(`  - (${b.rule}) ${b.what} [${b.at}]`);
    }
  } finally { c.close(); }
  console.log(`\n置き方の合わない所: ${total}`);
  process.exitCode = total ? 1 : 0;
}
