// act-replay.mjs — 置いた順の記録 (S-104c、src/views/simulator/tree/act-log.ts) を手元の開発版 (1440) で順に置き直し、その人の置いた順どおりに木を組み直す。読むだけ (サーバーへは何も送らない)。
// 使い方: node scripts/sim-watch/act-replay.mjs <記録のファイル> [--off 名前,名前] [--from first|last] [--shot 絵.png] [--dump 道の写し.json] [--log progress/○○-run.log] [--port 9890] [--keep]
//   記録のファイル = { lines: [...] } の JSON / 要望の JSON (context.actLog の code か lines) / 詰めた code だけの文 (deflate-raw の base64url)
//   --from first = 最初の丸ごとの形 (snap) から (既定) / last = 最後の snap から
//   --keep = 終わっても Chrome を閉じず、木を開いたまま待つ (人が見る用、Ctrl+C で終わる)
// 置き方: snap = その保存の形をそのまま開く・base = 今の決めのまま前提だけ替えて開き直す・p = 道の札で箱を引いて見張りの place (手・狙いが前と同じなら手は置き直さず印だけ)・p- = 手と印を外す
// 結果: 置けた行・道の札の箱が無かった行 (今の決まりで箱ができない = 版の違いなど)・箱の数のずれ・最後の箱・未設定・JS エラー
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { openChrome, sleep } from "./cdp.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const file = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
if (!file) { console.log("記録のファイルを渡して (node scripts/sim-watch/act-replay.mjs <file>)"); process.exit(1); }
const LOG = opt("--log", "");
const say = (s) => { const l = `${new Date().toTimeString().slice(0, 8)} 置いた順の再現: ${s}`; console.log(l); if (LOG) appendFileSync(LOG, l + "\n"); };

/** 記録を読む (JSON の lines / 要望の context.actLog / 詰めた code) */
function readLines(path) {
  const raw = readFileSync(path, "utf8").trim();
  const unpack = (code) => JSON.parse(inflateRawSync(Buffer.from(code, "base64url")).toString("utf8")).lines;
  if (!raw.startsWith("{") && !raw.startsWith("[")) return unpack(raw);
  const j = JSON.parse(raw);
  if (Array.isArray(j)) return j;
  if (Array.isArray(j.lines)) return j.lines;
  const a = j.context?.actLog ?? j.actLog;
  if (a?.code) return unpack(a.code);
  if (Array.isArray(a?.lines)) return a.lines;
  throw new Error("記録が見つからない (lines / context.actLog)");
}
const lines = readLines(file);
const snaps = lines.map((l, i) => (l.k === "snap" ? i : -1)).filter((i) => i >= 0);
if (!snaps.length) { say("丸ごとの形 (snap) が無いので始められない"); process.exit(1); }
const s0 = opt("--from", "first") === "last" ? snaps[snaps.length - 1] : snaps[0];
const off = opt("--off", "");
const pack = (v) => deflateRawSync(Buffer.from(JSON.stringify(v))).toString("base64url");
const M = "window.__simMonkey";
const urlOf = (rec) => `http://localhost:1440/web.html?page=sim-tree${off ? `&off=${off}` : ""}#recipe=${pack({ v: 2, n: "置いた順の再現", t: rec })}`;

const c = await openChrome(Number(opt("--port", "9890")));
let jsErr = 0;
c.on("Runtime.exceptionThrown", () => { jsErr++; });
await c.send("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.setItem("exiledesk.lang", "ja"); } catch {}` });
await c.size(1920, 1080, false);
const inTree = () => c.ev(`!location.search.includes("sim-base") && !!${M} && ${M}.ready() && document.querySelectorAll(".vue-flow__node").length > 0`).catch(() => false);
/** 開く (開いた後にベース選びへ飛ぶ事があるので、8 秒木のままなら開けた事にし、飛んだら 3 回まで開き直す) */
async function open(rec) {
  for (let k = 0; k < 4; k++) {
    await c.send("Page.navigate", { url: urlOf(rec) });
    await c.until(`!!${M} && ${M}.ready() && document.querySelectorAll(".vue-flow__node").length > 0`, 150000);
    let ok = true;
    for (let t = 0; t < 8; t++) { await sleep(1000); if (!(await inTree())) { ok = false; break; } }
    if (ok) return;
  }
  throw new Error("木が開いたままにならない");
}
const ev = async (x) => JSON.parse(await c.ev(`JSON.stringify(${x})`));
const ready = () => c.until(`${M}.ready()`, 60000);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

try {
  const first = lines[s0];
  say(`始め 行 ${lines.length} (snap ${snaps.length} 個、${s0 + 1} 行目から)・版 ${lines.find((l) => l.k === "open")?.app ?? "-"}${off ? `・閉じたスイッチ ${off}` : ""}`);
  await open(first.r);
  // 今置いてある決め (道の札 → 決め)。base で開き直す時と、手が同じかを見るのに使う
  let picks = new Map((first.r.picks ?? []).map((p) => [p.at, p]));
  let base = { ...first.r };
  delete base.picks; delete base.built;
  const n = { p: 0, put: 0, mark: 0, noBox: 0, ng: 0, off: 0, gone: 0, base: 0, snap: 0, drift: 0 };
  const misses = [];
  for (let i = s0 + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.k === "snap") { n.snap++; await open(l.r); picks = new Map((l.r.picks ?? []).map((p) => [p.at, p])); base = { ...l.r }; delete base.picks; delete base.built; continue; }
    if (l.k === "base") { n.base++; base = l.r; await open({ ...base, picks: [...picks.values()] }); continue; }
    if (l.k !== "p" && l.k !== "p-") continue;
    const at = l.k === "p" ? l.p.at : l.at;
    const keys = await ev(`${M}.pathKeys()`);
    const id = Object.keys(keys).find((k) => keys[k] === at);
    // 外す箱がもう無い = 上の手を替えて下ごと消えた (置けない数には入れない)
    if (!id && l.k === "p-") { n.gone++; picks.delete(at); continue; }
    if (!id) { n.noBox++; misses.push({ i, at, why: "道の札の箱が無い" }); picks.set(at, l.p); continue; }
    const was = picks.get(at);
    if (l.k === "p-") {
      n.off++;
      await c.ev(`${M}.clear(${JSON.stringify(id)})`);
      if (was?.done) await c.ev(`JSON.stringify(${M}.setDone(${JSON.stringify(id)}, false))`);
      picks.delete(at);
    } else {
      n.p++;
      const p = l.p, handSame = same(was?.hand, p.hand) && same(was?.aims, p.aims) && same(was?.pre, p.pre);
      // 手も狙いも同じ = 印 (完成・メモ・× の MOD) だけの替え。手を置き直すと下の箱が作り直されるので、手は渡さない
      const put = handSame ? { ...p, hand: undefined, aims: undefined, pre: undefined } : p;
      if (!p.hand && was?.hand) await c.ev(`${M}.clear(${JSON.stringify(id)})`);
      if (was?.done && !p.done) await c.ev(`JSON.stringify(${M}.setDone(${JSON.stringify(id)}, false))`);
      const r = await ev(`${M}.place(${JSON.stringify(id)}, ${JSON.stringify(put)})`);
      await ready();
      const b = (await ev(`${M}.dump()`)).boxes[id];
      if (!r.ok || (p.hand && !b?.hand) || (p.done && b?.done !== p.done)) { n.ng++; misses.push({ i, at, why: r.ok ? (p.done && b?.done !== p.done ? "完成の印が付かない" : "手が付かない") : r.problem }); }
      else if (handSame) n.mark++; else n.put++;
      picks.set(at, p);
    }
    await ready();
    if (typeof l.boxes === "number") { const got = Object.keys((await ev(`${M}.dump()`)).boxes).length; if (got !== l.boxes) n.drift++; }
  }
  const end = await ev(`(() => { const bs = Object.values(${M}.dump().boxes); return { boxes: bs.length, hands: bs.filter((b) => b.hand).length, done: bs.filter((b) => b.done === "main").length, unset: ${M}.tidyState().unset.length }; })()`);
  say(`済み: 決めの行 ${n.p} (手を置いた ${n.put}・印だけ ${n.mark})・外した ${n.off} (下ごと消えていた ${n.gone})・前提の替え ${n.base}・丸ごと ${n.snap}・道の札の箱が無い ${n.noBox}・付かない ${n.ng}・箱の数のずれ ${n.drift}・最後 箱 ${end.boxes} (手 ${end.hands}・完成 ${end.done})・未設定 ${end.unset}・JS エラー ${jsErr}`);
  for (const m of misses.slice(0, 20)) say(`  置けない ${m.i + 1} 行目: ${m.why} (${String(m.at).slice(-80)})`);
  // --dump = 最後の木の道の札 → 手と完成の印 (見比べ用)
  const dump = opt("--dump", "");
  if (dump) { const d = await ev(`(() => { const k = ${M}.pathKeys(), bs = ${M}.dump().boxes, o = {}; for (const [id, p] of Object.entries(k)) o[p] = { hand: bs[id]?.hand ?? null, done: bs[id]?.done ?? null }; return o; })()`); writeFileSync(dump, JSON.stringify(d)); say(`道の写し ${dump}`); }
  const shot = opt("--shot", "");
  if (shot) { await c.ev(`document.querySelector("[data-tree-fit]")?.click()`); await sleep(2000); await c.shot(shot); say(`絵 ${shot}`); }
  if (args.includes("--keep")) { say("開いたまま待つ (Ctrl+C で終わる)"); await new Promise(() => {}); }
} catch (e) { say(`止まった ${e.message} (JS エラー ${jsErr})`); process.exitCode = 1; }
finally { if (!args.includes("--keep")) c.close(); }
