/**
 * emu.mjs — シミュ以外の見張り: エミュのクラフト台を窓なし Chrome の PC 幅で本物のマウス・キーで動かし、操作の決まりを数える (最終チェック長、10-28)。
 * 決まりの正は docs/spec/emu.md ⑤・shared-ui.md ③⑤・system.md ⑤、回し方は docs/org/dev/app-watch.md。
 * 外の正解 (ゲームの確率・MOD) とは突き合わせない。「画面が自分の言った事と食い違わないか」の見張り。
 *
 *   node scripts/app-watch/emu.mjs                         … 手元の本番の作り http://127.0.0.1:1460
 *   node scripts/app-watch/emu.mjs http://localhost:1440   … dev サーバー
 *   [--steps 60] [--seed 1] [--json] [--update]
 *
 * 見る物:
 *   M-91  持った時のオレンジ・緑と打った結果: オレンジでない MOD は消えも変わりもしない、付いた MOD は緑の枠の側
 *   M-90  1 手戻す (Ctrl+Z) の後のアイテム = その手の前 / 工程の行を押した後 = その手の直後
 *   U-81  Esc 1 回で閉じるのは一番後に開いた 1 つ (MOD 一覧の窓 → 持っている物の順)
 *   U-82  窓の外を押して閉じた時、その押下は下の物 (棚) に届かない
 *   U-23  2 回押し (白に戻す) の 1 回目は、外を押す・Esc で戻り、アイテムは変わらない
 *   Y-100 打つ・戻す・MOD 一覧・スパムシミュの間、Worker への取り物 0
 *   Y-102 本番のホストへ記録を送らない
 */
import { opt, open, report, prodWrites, workerHits, ORIGIN, sleep } from "./lib.mjs";

const STEPS = Number(opt("--steps") ?? 60);
let seed = Number(opt("--seed") ?? 1) >>> 0;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const BASE = "Sapphire%20Ring";
const { r, done } = report("emu");
const c = await open(Number(process.env.WATCH_PORT ?? 9382));

// カードの MOD の行 (左の札 span.text-left が P1・S2 の行。付いた直後の珍しい段は先頭に光の柱の span が入るので :scope > span では取れない)。doomed = オレンジ (この手で変わる候補)。持っている = カードの下の一言が amber (StageItemCard の hint)
const READ = `(() => {
  const card = document.querySelector("[data-stage-card]");
  if (!card) return null;
  // 素の値の文 (盛った値の括弧を外し、品質で伸びた表示は title の素の値に戻す)。ほかの MOD が消えると盛りの表示だけ変わるので (合金など)
  const bare = (p) => { const k = p.cloneNode(true); k.querySelectorAll("[data-boosted-value], .stage-rare-beam").forEach((x) => x.remove()); for (const sp of k.querySelectorAll("span[title]")) { const m = sp.title.match(/^(?:品質で伸びた数値 \\(素は |Boosted by quality \\(base: )(.+)\\)$/); if (m) sp.textContent = m[1]; } return k.innerText.replace(/\\s+/g, " ").trim(); };
  const rows = [...card.querySelectorAll("p")].map((p) => { const lab = p.querySelector(":scope > span.text-left")?.innerText?.trim() ?? ""; return /^[PS]\\d/.test(lab) ? { side: lab[0], text: bare(p), doomed: !!p.querySelector("[class*='ff8a3d']") } : null; }).filter(Boolean);
  const open = [...card.querySelectorAll("[data-open-slots] p")].map((p) => /プレフィックス|prefix/i.test(p.innerText) ? "P" : "S");
  const k = card.cloneNode(true); k.querySelectorAll("[data-rec-part=card-hint], [data-open-slots]").forEach((x) => x.remove());
  const steps = [...document.querySelectorAll("[data-rec^='step:']")].map((x) => x.getAttribute("data-rec")).filter((x) => x !== "step:start");
  return { rows, open, text: k.innerText.replace(/\\s+/g, " ").trim(), held: /amber-200/.test(card.querySelector("[data-rec-part=card-hint]")?.className ?? ""), dialogs: document.querySelectorAll("[role=dialog]").length, last: steps.at(-1) ?? null };
})()`;
const read = () => c.ev(READ);
const shelfKeys = () => c.ev(`[...document.querySelectorAll("[data-stage-root] [data-rec^='shelf:']")].filter((b) => { const r = b.getBoundingClientRect(); return r.width && r.height && !b.disabled; }).map((b) => b.getAttribute("data-rec")).filter((k) => !/vaal|corrupt/i.test(k))`); // ヴァールで壊すと棚が全部押せなくなるので打たない
/** 棚の物を持つ (持てたら true) */
const hold = async (k) => { await c.click(`[data-stage-root] [data-rec="${k}"]`); return (await read())?.held ?? false; };
/** 持っている物を打つ (「使う」があればそれ、無ければカード) */
const use = async () => {
  const u = await c.ev(`(() => { const b = [...document.querySelectorAll("button")].find((x) => /^(使う|Use)$/.test(x.textContent.trim()) && !x.disabled); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await c.click(u ?? "[data-stage-card]");
  await sleep(500);
};
const multiset = (a) => { const m = new Map(); for (const x of a) m.set(x, (m.get(x) ?? 0) + 1); return m; };

try {
  await c.fresh(`/web.html?base=${BASE}`, 1660, 860, false);
  if (!(await c.until(`!!document.querySelector("[data-stage-card]")`, 15000))) throw new Error(`クラフト台が開かない (${ORIGIN}/web.html?base=${BASE})`);
  const t0 = Date.now();

  // ---- M-91 と M-90 (打つ → 色分けと比べる → 戻す → 打ち直す) ----
  const m91 = r("M-91", "持った時のオレンジ・緑と打った結果が食い違わない");
  const m90 = r("M-90", "1 手戻す・工程の行の後のアイテムが前と同じ");
  const after = new Map(); // step:N → 打った直後のカード
  const prefer = /transmut|augment|regal|exalt|chaos|annul|alch|divine/i;
  // 工程の行を押すと、その手の直後と同じ (台を開き直す前と最後に、新しい方から 5 つ)
  const checkSteps = async () => {
    const steps = [...after.keys()].filter(Boolean);
    for (const st of steps.slice(-6, -1).reverse()) {
      if (!(await c.click(`[data-rec="${st}"]`))) { m90.note.push(`${st}: 工程の行が押せない`); continue; }
      await sleep(400);
      const v = await read();
      m90.seen++;
      if (v?.text !== after.get(st)) m90.bad.push(`${st} を押した: その手の直後と違う (直後「${after.get(st).slice(0, 50)}」/ 今「${(v?.text ?? "").slice(0, 50)}」)`);
    }
    after.clear();
  };
  let stuck = 0;
  for (let i = 0; i < STEPS; i++) {
    // 4 手続けて変わらない (満杯・打てる物が無い) なら、工程の行を見てから台を開き直す
    if (stuck >= 4) {
      await checkSteps();
      await c.fresh(`/web.html?base=${BASE}`, 1660, 860, false);
      await c.until(`!!document.querySelector("[data-stage-card]")`, 15000);
      stuck = 0;
    }
    const keys = await shelfKeys();
    const pool = keys.filter((k) => prefer.test(k));
    const from = pool.length && rnd() < 0.85 ? pool : keys;
    const k = from[Math.floor(rnd() * from.length)];
    if (!k || !(await hold(k))) { stuck++; continue; }
    // 色分けはお告げを掛けた時だけ出る (preview.ts、オーナー 10-17)。持った物に掛けられるお告げを 7 割で 1 つ掛ける
    const omens = await c.ev(`[...document.querySelectorAll("[data-held-omens] [data-rec^='shelf:']")].map((b) => b.getAttribute("data-rec"))`);
    if (omens.length && rnd() < 0.7) await c.click(`[data-held-omens] [data-rec="${omens[Math.floor(rnd() * omens.length)]}"]`);
    const before = await read();
    await use();
    const now = await read();
    if (!before || !now) { stuck++; continue; }
    if (now.text === before.text) { stuck++; await c.key("Escape"); continue; } // 打てなかった・変わらなかった
    stuck = 0;
    after.set(now.last, now.text);
    // M-91: オレンジでない行は残る、新しい行は緑の側。色分けが出ていない手 (お告げ無し) は何も言っていないので見ない
    const shown = before.rows.some((x) => x.doomed) || before.open.length;
    if (shown) m91.seen++;
    if (shown) {
      const left = multiset(now.rows.map((x) => x.text));
      for (const x of before.rows.filter((y) => !y.doomed)) {
        if (left.get(x.text)) left.set(x.text, left.get(x.text) - 1);
        else m91.bad.push(`${k}: オレンジでない行が消えた・変わった「${x.text.slice(0, 40)}」`);
      }
      const had = multiset(before.rows.map((x) => x.text));
      const added = now.rows.filter((x) => { const n = had.get(x.text); if (n) { had.set(x.text, n - 1); return false; } return true; });
      // 数値が変わる手 (オレンジの行の打ち直し) は新しい行に見えるので、オレンジの行と同じ側・同じ数までは付いた物と数えない
      const doomedSides = multiset(before.rows.filter((x) => x.doomed).map((x) => x.side));
      for (const a of added) {
        if (!before.open.length || before.open.includes(a.side)) continue; // 緑が出ていない手 (カオスなど消してから付ける手、preview.ts) は側を言っていない
        if (doomedSides.get(a.side)) { doomedSides.set(a.side, doomedSides.get(a.side) - 1); continue; }
        m91.bad.push(`${k}: 緑の枠 (${before.open.join("・") || "無し"}) でない側 ${a.side} に付いた「${a.text.slice(0, 40)}」`);
      }
    }
    // M-90: 戻すと前と同じ (3 手に 1 回。戻した後は持ち直して進む)
    if (rnd() < 0.34) {
      await c.key("Escape"); // 持っている物を離す (Ctrl+Z は持っていても効くが、色の出入りを外す)
      await c.key("z", true);
      const back = await read();
      m90.seen++;
      if (back?.text !== before.text) m90.bad.push(`${k} を Ctrl+Z: 戻した後が前と違う (前「${before.text.slice(0, 50)}」/ 後「${(back?.text ?? "").slice(0, 50)}」)`);
      after.delete(now.last);
    }
    await c.key("Escape");
  }
  await checkSteps();
  if (!m91.seen) m91.note.push("色分けの出た手が 1 つも無い (お告げを掛けられる手が無かった。--seed を替える)");

  // ---- ここから台を開き直して見る (前の手の状態に左右されない)。白に戻すが押せるよう 1 手だけ打つ ----
  await c.fresh(`/web.html?base=${BASE}`, 1660, 860, false);
  await c.until(`!!document.querySelector("[data-stage-card]")`, 15000);
  if (await hold("shelf:transmute")) { await use(); await c.key("Escape"); }

  // ---- U-81 Esc は一番後に開いた 1 つ ----
  const u81 = r("U-81", "Esc 1 回で閉じるのは一番後に開いた 1 つ");
  const keys = await shelfKeys();
  const orb = keys.find((k) => /transmut|augment|exalt/i.test(k)) ?? keys[0];
  if (await hold(orb)) {
    await c.key("Tab"); // MOD 一覧の窓 (持ったまま)
    const s1 = await read();
    if (!s1?.dialogs) u81.note.push("Tab で MOD 一覧の窓が開かない");
    else {
      u81.seen++;
      await c.key("Escape");
      const s2 = await read();
      if (s2.dialogs !== s1.dialogs - 1 || !s2.held) u81.bad.push(`持った + MOD 一覧: Esc 1 回で 窓 ${s1.dialogs}→${s2.dialogs}・持ち ${s2.held ? "残る" : "離れた"} (窓だけ閉じるはず)`);
      await c.key("Escape");
      const s3 = await read();
      u81.seen++;
      if (s3.held) u81.bad.push("2 回目の Esc で持っている物が離れない");
    }
  } else u81.note.push(`${orb} が持てない`);

  // ---- U-82 窓の外を押した押下は下に届かない ----
  // MOD 一覧の窓は 1660 幅だと台をほぼ覆うので、広い幅で開き、窓の外に見える台のボタン (棚・1 手戻す・白に戻す・今出ていない画面のタブ = 届けば画面が移る) を押す。
  // 押した後、窓が閉じて、台 (カード・持ち・工程・白に戻すの 1 回目) が押す前と同じなら届いていない
  const u82 = r("U-82", "窓の外を押して閉じた押下は下の物に届かない");
  const SIG = `(() => { const s = ${READ}; const b = document.querySelector("[data-rec=reset]"); return JSON.stringify([s?.text, s?.held, s?.last, b?.className, location.href]); })()`;
  let tried = false;
  for (const [w, h] of [[2560, 1000], [1920, 1080]]) {
    await c.size(w, h, false); await sleep(600);
    await c.key("Tab");
    const t = await c.ev(`(() => { const p = document.querySelector("[role=dialog]"); if (!p) return null; const pr = p.getBoundingClientRect();
      const out = [...document.querySelectorAll("[data-stage-root] [data-rec^='shelf:'], [data-rec=undo], [data-rec=reset], [data-mode-tab]:not(.on)")].map((b) => { const r = b.getBoundingClientRect(); return { k: b.getAttribute("data-rec") ?? b.innerText.trim().slice(0, 12), x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; })
        .filter((b) => b.w && b.y > 0 && b.y < innerHeight && (b.x < pr.left - 4 || b.x > pr.right + 4 || b.y < pr.top - 4 || b.y > pr.bottom + 4));
      return out[0] ?? null; })()`);
    if (!t) { await c.key("Escape"); continue; }
    tried = true;
    const sig0 = await c.ev(SIG);
    await c.click({ x: t.x, y: t.y });
    await sleep(1500); // 届いていれば画面が移る・持つのを待つ
    const o2 = await read();
    u82.seen++;
    if (o2?.dialogs) { u82.bad.push(`${w} 幅: 窓の外 (${t.k}) を押しても窓が閉じない`); await c.key("Escape"); }
    const sig1 = await c.ev(SIG);
    if (sig1 !== sig0 || o2?.held) u82.bad.push(`${w} 幅: 窓の外の押下が下の ${t.k} に届いた`);
    // 対照: 窓の無い時に同じ所を押すと台が変わる (= 届いていれば分かる所を押した)。閉じた直後の押しは捨てる作り (U-26) なので間を空ける
    await sleep(1200);
    await c.click({ x: t.x, y: t.y });
    await sleep(1500); // 画面が移るのを待つ
    const sig2 = await c.ev(SIG);
    if (sig2 === sig1) u82.note.push(`${t.k} は窓が無くても押して何も変わらない所だった (届いたかは分からない)`);
    break;
  }
  if (!tried) u82.note.push("2560・1920 幅でも窓の外に台のボタンが見えない");
  await c.size(1660, 860, false); await sleep(500);
  if ((await read())?.dialogs) await c.key("Escape");

  // ---- U-23 2 回押しの 1 回目は外・Esc で戻る (U-82 の対照で画面が移るので開き直す) ----
  await c.fresh(`/web.html?base=${BASE}`, 1660, 860, false);
  await c.until(`!!document.querySelector("[data-stage-card]")`, 15000);
  if (await hold("shelf:transmute")) { await use(); await c.key("Escape"); }
  const u23 = r("U-23", "2 回押しの 1 回目は外を押す・Esc で戻り、アイテムは変わらない");
  const armed = () => c.ev(`(() => { const b = document.querySelector("[data-rec=reset]"); return b ? /もう一度|again/i.test(b.innerText) : null; })()`);
  const before = (await read())?.text;
  if (await c.click(`[data-rec=reset]`)) {
    if (!(await armed())) u23.note.push("白に戻すの 1 回目で赤くならない (押せない状態か)");
    else {
      await c.key("Escape"); u23.seen++;
      if (await armed()) u23.bad.push("Esc で 1 回目が戻らない");
      await c.click(`[data-rec=reset]`);
      await c.click({ x: 8, y: 400 }); u23.seen++;
      if (await armed()) u23.bad.push("外を押しても 1 回目が戻らない");
      if ((await read())?.text !== before) u23.bad.push("1 回目と取り消しでアイテムが変わった");
    }
  } else u23.note.push("白に戻すのボタンが無い");

  // ---- スパムシミュを開いて回す (Y-100 の操作に足す) ----
  await c.go(`${ORIGIN}/web.html?page=routes`);
  await sleep(1500);
  if (await c.click(`[data-routes-start]`)) await sleep(3000);

  // ---- Y-100・Y-102 ----
  const y100 = r("Y-100", "操作の間 Worker への取り物 0");
  const ops = c.reqs.filter((q) => q.t >= t0);
  y100.seen = ops.length;
  for (const q of workerHits(ops)) y100.bad.push(`${q.method} ${q.url.slice(0, 100)}`);
  const y102 = r("Y-102", "本番のホストへ記録を送らない"); y102.seen = c.reqs.length;
  for (const q of prodWrites(c.reqs)) y102.bad.push(`${q.method} ${q.url.slice(0, 100)}`);
  const err = r("M-94", "JS の例外 0 (操作の間)"); err.seen = 1;
  for (const e of [...new Set([...c.errors, ...c.consoleErr])].slice(0, 6)) err.bad.push(e);
} finally { c.close(); }
done();
