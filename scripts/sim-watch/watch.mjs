/**
 * watch.mjs — シミュレーターの見張り (最終チェック長の持ち物、10-27 オーナー「リリース時に全部集まるから、決まりつくならコイツ」)。
 * 出す前に、見本の木 (trees.json) を窓なし Chrome の PC 幅・スマホ幅で開き、決まりと合わない所・画面の文と木の中身の食い違いを数える。
 * ツリーの中身は直さない (見つけたらシミュ部長へ)。これは「前と変わっていないか・文と中身が合っているか」の見張りで、外の正解ではない。
 * 回し方と見る物は docs/org/dev/sim-watch.md。
 *
 *   node scripts/sim-watch/watch.mjs                         … 手元の本番の作り http://127.0.0.1:1460 (pnpm preview:prod)
 *   node scripts/sim-watch/watch.mjs --dev                   … 手元の開発版 http://127.0.0.1:1461 (スイッチの下も入る)
 *   node scripts/sim-watch/watch.mjs <origin> [--only amuB] [--update] [--shots <dir>]
 *   --update で今の数を baseline.json に書く (わざと動きを変えた時だけ。書いたら commit)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openChrome, sleep } from "./cdp.mjs";
import { MISS_OUTS, expectBack, isStrip, missBoxes, pathAims, sameHand, setDepthSteps, stepOf, stepsInText, stripMiddles } from "./doc.mjs";
import { DISPLAY, makeRules } from "./rules.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const DEV = args.includes("--dev");
const UPDATE = args.includes("--update");
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const ORIGIN = (args.find((a) => /^https?:\/\//.test(a)) ?? (DEV ? "http://127.0.0.1:1461" : "http://127.0.0.1:1460")).replace(/\/$/, "");
const MODE = DEV || /:1461\b|dev\./.test(ORIGIN) ? "dev" : "prod";
const ONLY = opt("--only");
const SHOTS = opt("--shots");
if (SHOTS && !existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });
const TREES = JSON.parse(readFileSync(join(HERE, "trees.json"), "utf8")).trees.filter((t) => !ONLY || t.key === ONLY);
const BASE_PATH = join(HERE, "baseline.json");
const baseline = existsSync(BASE_PATH) ? JSON.parse(readFileSync(BASE_PATH, "utf8")) : {};

const found = []; // 合わない所 { tree, where, what, text, want }
const note = []; // 見られなかった所 (数えない)
const seenN = {}; // 比べた数 (木ごと・種類ごと。0 なら見ていない)
const count = (tree, k) => { (seenN[tree] ??= {})[k] = (seenN[tree][k] ?? 0) + 1; };
const bad = (tree, where, what, text, want) => found.push({ tree, where, what, text: String(text ?? "").slice(0, 140), want: String(want ?? "").slice(0, 140) });
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

const c = await openChrome(Number(process.env.WATCH_PORT ?? 9371));
const { ev, until, size, go } = c;
const snap = async (name) => { if (SHOTS) await c.shot(join(SHOTS, `${name}.png`)); };
// どの木でも成り立つ決まり (rules.mjs)。openTree は下で定義する関数を後から呼ぶ
const ruleBad = (...a) => { bad(...a); found.at(-1).rule = true; };
const rules = makeRules({ ev, sleep, count, bad: ruleBad, note, openTree: (...a) => openTree(...a), mode: MODE });

/** 木を新しく開く (手元の保存を消してから #recipe= で)。開いたらその木 (画面が保存した形) を返す */
async function openTree(t, w, h, mobile) {
  await size(w, h, mobile);
  await go(`${ORIGIN}/web.html`);
  await ev(`(() => { try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("exiledesk.changelog.seen", "9.9.9"); } catch {} return 1; })()`);
  await go(`${ORIGIN}/?page=sim-tree#recipe=${t.code}`);
  const sel = mobile ? "[data-phone-tree]" : "[data-tree-box]";
  if (!(await until(`document.querySelectorAll(${JSON.stringify(sel)}).length > 0`, 30000))) return null;
  await sleep(2500);
  setDepthSteps(await ev(`document.documentElement.hasAttribute("data-flag-lineshort")`));
  return readDoc();
}
/** 画面が持っている今の木 (保存したレシピの今の物)。保存していない変更は「保存」を押してから読む */
async function readDoc() {
  return ev(`(() => { const id = localStorage.getItem("exiledesk.tree.recipes.current"); const list = JSON.parse(localStorage.getItem("exiledesk.tree.recipes") || "[]"); return (list.find((r) => r.id === id) ?? list[0])?.tree ?? null; })()`);
}
async function saveAndRead() {
  await ev(`document.querySelector("[data-tree-recipe-save]")?.click()`); await sleep(800);
  await ev(`(() => { const p = document.querySelector("[data-tree-recipe-save-pop]"); const b = p && [...p.querySelectorAll("button")].find((x) => /保存/.test(x.innerText)); b?.click(); return 1; })()`); await sleep(600);
  return readDoc();
}

/** (1)(3) PC: 箱の札・次の手・精査の印を読んで木と比べる。次の手の文を箱ごとに返す (スマホと比べる) */
async function checkPc(t, doc) {
  const boxes = await ev(`[...document.querySelectorAll("[data-tree-box]")].map((b) => ({ id: b.getAttribute("data-box-id"), back: b.querySelector("[data-tree-back-tag]")?.innerText ?? null, hand: b.querySelector("[data-tree-next-hand]")?.innerText ?? null, issues: [...b.querySelectorAll("[data-tree-issue]")].map((x) => x.getAttribute("title") || x.innerText) }))`);
  const hands = {}, issues = [];
  const seen = new Set(boxes.map((b) => b.id));
  for (const id of Object.keys(doc.boxes)) if (!seen.has(id)) bad(t.key, `PC ${id}`, "木にある箱が画面に無い", "", id);
  for (const b of boxes) {
    const d = doc.boxes[b.id];
    if (!d) { bad(t.key, `PC ${b.id}`, "画面の箱が木に無い", b.id, ""); continue; }
    for (const s of b.issues) { issues.push(`${b.id} ${norm(s).replace(/\s*\(押すと[^)]*\)\s*$/, "")}`); if (t.done) bad(t.key, `PC ${b.id}`, "精査の足りない所 (完成した木なのに)", s, "0 件"); }
    count(t.key, "PC の箱");
    if (b.hand) hands[b.id] = norm(b.hand).replace(/^→\s*/, "");
    if (!!d.hand !== !!b.hand) bad(t.key, `PC ${b.id}`, "次の手の札と木の手が合わない", b.hand ?? "(札なし)", d.hand ? d.hand.currency : "(手なし)");
    const want = expectBack(doc, b.id);
    if (!want) { if (b.back) bad(t.key, `PC ${b.id}`, "戻りの札があるのに木に戻りが無い", b.back, "(戻りなし)"); continue; }
    if (!b.back) { bad(t.key, `PC ${b.id}`, "木に戻りがあるのに札が無い", "(札なし)", `${want.kind} → ${want.to ?? ""}`); continue; }
    const text = norm(b.back);
    count(t.key, "PC の戻りの札");
    if (want.kind === "broken") bad(t.key, `PC ${b.id}`, "戻り先の箱が木に無い", text, want.to);
    if (want.kind === "back" || want.kind === "merge") {
      const got = stepsInText(text);
      if (got.join(",") !== want.steps.join(",")) bad(t.key, `PC ${b.id}`, "札の n 段目が戻り先の箱の段と違う", text, `${want.steps.join("・")} 段目 (${want.to})`);
      if (want.kind === "merge" && !/統合/.test(text)) bad(t.key, `PC ${b.id}`, "当たりどうしの合流なのに「統合」でない", text, "同じ MOD 群のため統合");
      if (want.kind === "back" && /再度挑戦/.test(text) !== want.retry) bad(t.key, `PC ${b.id}`, want.retry ? "同じ手へ戻るのに「再度挑戦」が無い" : "違う手へ戻るのに「再度挑戦」", text, want.retry ? "再度挑戦 · n 段目へ戻る" : "n 段目へ戻る");
    }
  }
  return { hands, issues: issues.sort() };
}

const MISS = "外れ MOD";
/**
 * (7) PC の箱の中のアイテム枠の札 (見本は種 1 で決まる。フラクチャーの行は数えない)。消去の直線の箱はフラクチャー以外が全部「外れ MOD」(heldTags)、
 * 外れの側の箱は外れ MOD でない行が道の上の狙いの数まで (junkByCheck)。箱ごとの札の並びを返す (前と比べる)
 */
async function checkCards(t, doc) {
  // 札の無い未発現の行 (開発版の boneLater は緑の崩れた文字のまま) は中身が分からないので「未発現」と書き、外れ MOD でない行に数えない
  const rows = await ev(`Object.fromEntries([...document.querySelectorAll("[data-tree-box]")].map((b) => [b.getAttribute("data-box-id"), [...b.querySelectorAll("p.group\\\\/row")].filter((p) => !p.classList.contains("text-mod-fractured")).map((p) => p.querySelector("[data-row-tag-name]")?.innerText.trim() ?? (p.querySelector("[data-unrevealed]") ? "未発現" : ""))]))`);
  const sig = {};
  for (const [id, tags] of Object.entries(rows)) {
    const b = doc.boxes[id];
    if (!b || !tags.length) continue;
    sig[id] = tags.map((x) => x || "-").join("|");
    const ok = tags.filter((x) => x !== MISS && x !== "未発現").length;
    if (isStrip(b)) {
      count(t.key, "消去の箱のカード");
      if (ok) bad(t.key, `PC ${id} のカード`, "全部消えてよい消去の箱なのに外れ MOD でない行がある", sig[id], `全部 ${MISS}`);
    } else if (b.out && MISS_OUTS.includes(b.out)) {
      count(t.key, "外れの箱のカード");
      const n = pathAims(doc, id).size;
      if (ok > n) bad(t.key, `PC ${id} のカード`, "外れの箱で、道の上の狙いより多くの行が外れ MOD でない (☑ の無い MOD が狙いに見える)", sig[id], `外れ MOD でない行は ${n} まで`);
    }
  }
  return sig;
}
/** (8) 消去の直線の途中の箱に乗せても線が出ない (heldTags)。比べのため直線の終わりの箱 (戻りあり) では線が出るのも見る */
async function checkStripLines(t, doc) {
  const hover = async (id) => {
    await ev(`(() => { document.querySelectorAll("[data-tree-box]").forEach((b) => b.dispatchEvent(new PointerEvent("pointerleave"))); document.querySelector('[data-box-id="${id}"]')?.dispatchEvent(new PointerEvent("pointerenter")); return 1; })()`);
    await sleep(500);
    const n = await ev(`document.querySelectorAll("[data-tree-merge-hot]").length`);
    await ev(`document.querySelector('[data-box-id="${id}"]')?.dispatchEvent(new PointerEvent("pointerleave")), 1`);
    return n;
  };
  for (const b of stripMiddles(doc)) {
    count(t.key, "消去の途中の箱の線");
    const n = await hover(b.id);
    if (n) bad(t.key, `PC ${b.id} に乗せる`, "消去の直線の途中の箱に乗せたのに線が出た", `線 ${n} 本`, "0 本");
  }
  const end = Object.values(doc.boxes).find((b) => b.back && isStrip(doc.boxes[b.parent]));
  if (end && stripMiddles(doc).length && !(await hover(end.id))) note.push(`${t.key}: 直線の終わりの箱 ${end.id} に乗せても線が出ない (乗せ方が効いていないかも)`);
}
/** (8) 手の窓で消去を持った時 (既定は全部消えてよい) のカードは、フラクチャー以外が全部「外れ MOD」(heldTags)。手の無い箱 1 つで ＋ → 棚の消去 */
async function checkHeldAnnul(t) {
  const doc = await openTree(t, 1660, 860, false);
  const box = doc && Object.values(doc.boxes).find((b) => !b.hand && b.out !== "start" && !isStrip(doc.boxes[b.parent]));
  if (!box) { note.push(`${t.key}: 消去を持てる手の無い箱が無い`); return; }
  await ev(`document.querySelector('[data-box-id="${box.id}"] button[title="戻りの矢印を外す"]')?.click()`); await sleep(600);
  await ev(`(() => { const x = document.querySelector('[data-box-id="${box.id}"] [data-tree-next]'); if (!x) return false; const o = { bubbles: true, pointerId: 1, isPrimary: true, button: 0 }; x.dispatchEvent(new PointerEvent("pointerdown", o)); window.dispatchEvent(new PointerEvent("pointerup", o)); document.dispatchEvent(new PointerEvent("pointerup", o)); return true; })()`);
  await sleep(1200);
  const held = await ev(`(() => { const b = document.querySelector('[data-tree-shelf] [data-key="annul"]'); b?.click(); return !!b; })()`);
  await sleep(800);
  const tags = held && await ev(`[...document.querySelectorAll("[data-tree-hand-card] p.group\\\\/row")].filter((p) => !p.classList.contains("text-mod-fractured")).map((p) => p.querySelector("[data-row-tag-name]")?.innerText.trim() ?? "")`);
  if (!tags?.length) { note.push(`${t.key}: ${box.id} で消去を持ったカードが読めない (棚 ${!!held})`); return; }
  count(t.key, "消去を持った時のカード");
  if (tags.some((x) => x !== MISS)) bad(t.key, `PC ${box.id} で消去を持つ`, "全部消えてよい消去を持ったのに外れ MOD でない行がある", tags.map((x) => x || "-").join("|"), `全部 ${MISS}`);
}
/** (9) 完成形の窓: 品質の ☑・品質の %・「途中で消える」の札 (押された数 = 木の途中で消える MOD の数)。札の並びを返す */
async function checkGoal(t, doc) {
  await ev(`document.querySelector("[data-tree-goal-open='mods']")?.click(), 1`);
  if (!(await until(`!!document.querySelector("[data-tree-goal-card]")`, 10000))) { note.push(`${t.key}: 完成形の窓が開かない`); return null; }
  await sleep(800);
  const g = await ev(`(() => { const q = document.querySelector("[data-tree-goal-quality-on]"); return { on: q ? q.checked : null, card: document.querySelector("[data-tree-goal-card] [data-stage-card]")?.innerText ?? document.querySelector("[data-tree-goal-card]").innerText, toggles: [...document.querySelectorAll("[data-tree-goal-card] [data-row-toggle]")].map((b) => ({ on: b.getAttribute("aria-pressed") === "true", row: b.closest("p")?.innerText.replace(/\\s+/g, " ").trim() ?? "" })) }; })()`);
  count(t.key, "完成形の窓");
  if (g.on !== null && g.on !== !!doc.goalQualityOn) bad(t.key, "完成形の窓", "品質の ☑ が木と違う", g.on ? "☑ あり" : "☑ なし", doc.goalQualityOn ? "☑ あり" : "☑ なし");
  if (doc.goalQualityOn && doc.goalQuality && !norm(g.card).includes(`+${doc.goalQuality}%`)) bad(t.key, "完成形の窓", "カードの品質が木の品質と違う", norm(g.card).slice(0, 120), `+${doc.goalQuality}%`);
  const way = doc.wayMods?.length ?? 0, pressed = g.toggles.filter((x) => x.on).length;
  if (pressed !== way) bad(t.key, "完成形の窓", "「途中で消える」が押された行の数が木の途中で消える MOD の数と違う", `${pressed} 行`, `${way} 個`);
  if (way && g.toggles.length < 2) bad(t.key, "完成形の窓", "途中で消える MOD があるのにカードの行に札が 2 つ未満 (クラフト MOD 2 つ以上で出る)", `${g.toggles.length} 個`, "2 個以上");
  return g.toggles.map((x) => `${x.on ? "消える" : "残る"} ${x.row}`);
}

/** (2) テスト走行と 100 人回す (どちらも種 1 で決まる)。数の文と止まった箱を返す */
async function runs(t) {
  const out = {};
  if (await until(`!!document.querySelector("[data-tree-test]") && !document.querySelector("[data-tree-test]").disabled`, 30000)) {
    await ev(`document.querySelector("[data-tree-test]").click()`); await sleep(1200);
    await until(`!document.querySelector("[data-tree-test]").disabled`, 120000);
    out.test = norm(await ev(`(document.querySelector("[data-tree-test-ok]") ?? document.querySelector("[data-tree-test-holes]"))?.innerText ?? ""`));
    out.testStuck = await ev(`[...document.querySelectorAll("[data-tree-run-stuck]")].map((b) => b.getAttribute("data-box-id")).sort()`);
  } else note.push(`${t.key}: テストで回すが押せない`);
  if (await until(`!!document.querySelector("[data-tree-run]") && !document.querySelector("[data-tree-run]").disabled`, 30000)) {
    await ev(`document.querySelector("[data-tree-run]").click()`); await sleep(1500);
    await ev(`document.querySelector("[data-tree-run-skip]")?.click()`);
    await until(`!document.querySelector("[data-tree-run]").disabled && !/進んでいる/.test(document.querySelector("[data-tree-run-sum]")?.innerText ?? "")`, 180000);
    // 費用 (1 個 N 神) は相場で毎日動き、手元の本番の作りと開発版で相場の出どころも違うので比べない。完成の割合・人数だけ
    out.run = norm(await ev(`document.querySelector("[data-tree-run-sum]")?.innerText ?? ""`)).replace(/1 個 [\d,.]+ \S+ · /, "");
    out.runStuck = await ev(`[...document.querySelectorAll("[data-tree-run-stuck]")].map((b) => b.getAttribute("data-box-id") + " " + (b.innerText.match(/(\\d+) 人がここで止まった/)?.[1] ?? "")).sort()`);
  } else note.push(`${t.key}: 100 人回すが押せない`);
  return out;
}

/** (4) スマホ: 全体図の箱を 1 つずつ押して重ね窓の文 (段・次の手・行き先) を木と PC の札と比べる */
async function checkPhone(t, doc, pcHands) {
  await ev(`document.querySelector("[data-phone-map-unfold]")?.click()`); await sleep(1000);
  const rects = await ev(`[...document.querySelectorAll("[data-phone-map] rect[data-map-box]")].filter((r) => !r.closest("[data-mini]")).map((r) => { const b = r.getBoundingClientRect(); return { id: r.getAttribute("data-map-box"), x: b.left + b.width / 2, y: b.top + b.height / 2 }; })`);
  if (!rects?.length) { note.push(`${t.key}: スマホの全体図が開けない`); return; }
  for (const r of rects) {
    const d = doc.boxes[r.id];
    if (!d) { bad(t.key, `スマホ ${r.id}`, "全体図の箱が木に無い", r.id, ""); continue; }
    await ev(`(() => { const r = document.querySelector('[data-phone-map] rect[data-map-box="${r.id}"]'); r?.scrollIntoView({ block: "center" }); return 1; })()`); await sleep(150);
    const pos = await ev(`(() => { const b = document.querySelector('[data-phone-map] rect[data-map-box="${r.id}"]')?.getBoundingClientRect(); return b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null; })()`);
    if (!pos) continue;
    await ev(`(() => { const v = document.querySelector("[data-phone-map-view]"); v.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: ${pos.x}, clientY: ${pos.y} })); return 1; })()`);
    if (!(await until(`!!document.querySelector("[data-phone-sheet]")`, 3000))) { note.push(`${t.key}: スマホ ${r.id} の窓が開かない`); continue; }
    const s = await ev(`(() => { const w = document.querySelector("[data-phone-sheet]"); return { id: w.getAttribute("data-box-id"), step: w.querySelector("[data-phone-sheet-step]")?.innerText ?? null, hand: ([...w.querySelectorAll("p")].map((p) => p.innerText).find((x) => /^この箱から次に打つ/.test(x)) ?? null), outs: [...w.querySelectorAll("[data-phone-sheet-out]")].map((li) => li.innerText) }; })()`);
    if (s.id !== r.id) { note.push(`${t.key}: スマホ ${r.id} を押して ${s.id} が開いた`); }
    const id = s.id;
    count(t.key, "スマホの窓");
    const box = doc.boxes[id];
    if (box && s.step && stepsInText(s.step)[0] !== stepOf(doc, id)) bad(t.key, `スマホ ${id}`, "窓の「n 段目」が箱の段と違う", s.step, `${stepOf(doc, id)} 段目`);
    if (box && s.hand) {
      const h = norm(s.hand).replace(/^この箱から次に打つ\s*[:：]\s*/, "");
      if (pcHands[id] && pcHands[id] !== h) bad(t.key, `スマホ ${id}`, "次の手の名前が PC の札と違う", h, pcHands[id]);
    }
    if (box?.hand) {
      box.outs.forEach((cid, i) => {
        const want = expectBack(doc, cid), text = norm(s.outs[i]);
        if (!want || !(want.kind === "back" || want.kind === "merge")) return;
        const got = stepsInText(text);
        count(t.key, "スマホの行き先");
        if (got.join(",") !== want.steps.join(",")) bad(t.key, `スマホ ${id} の結果 ${cid}`, "行き先の n 段目が戻り先の箱の段と違う", text, `${want.steps.join("・")} 段目 (${want.to})`);
      });
    }
    await ev(`document.querySelector("[data-phone-sheet-close]")?.click()`); await sleep(250);
  }
}

/** (4) スマホ: 「次へ」で進める画面ごとに、下の帯の「n 段目」が出している箱の段と合うか */
async function walkPhone(t, doc) {
  for (let i = 0; i < 40; i++) {
    const s = await ev(`(() => { const a = document.querySelector("[data-phone-ask]"); const o = document.querySelector("[data-phone-out]"); const band = [...document.querySelectorAll("[data-phone-progress]")].map((x) => x.innerText).join(" "); return { ask: a?.getAttribute("data-box-id") ?? null, out: o?.getAttribute("data-box-id") ?? null, band, done: !!document.querySelector("[data-phone-all-done]") }; })()`);
    const id = s.out ?? s.ask;
    if (id && doc.boxes[id]) {
      const n = stepsInText(s.band)[0];
      if (n) count(t.key, "スマホの下の帯");
      if (n && n !== stepOf(doc, id)) bad(t.key, `スマホの画面 ${id}`, "下の帯の「n 段目」が出している箱の段と違う", norm(s.band), `${stepOf(doc, id)} 段目`);
    }
    if (s.done) break;
    const r = await ev(`(() => { const b = [...document.querySelectorAll("button")].filter((x) => x.getBoundingClientRect().width > 0 && /^次へ/.test(x.innerText.trim())).at(-1); if (!b || b.disabled) return false; b.click(); return true; })()`);
    if (!r) break;
    await sleep(900);
  }
}

/** (6) 外れで打つ前と同じ手を選んだら、新しい箱を作らず打つ前 / 同じ形の箱へ戻るか (PC。手は棚で持ってカードを押す) */
async function checkSameHand(t) {
  const doc = await readDoc();
  const cands = missBoxes(doc).filter((b) => !b.hand && (doc.boxes[b.parent].hand.omens ?? []).length === 0).slice(0, 2);
  // 同じ形の箱 (自動の戻り先) と同じ手も 1 つ (cd9e053f): 自動の戻り先に手があり、お告げの無い物
  const auto = missBoxes(doc).find((b) => !b.hand && b.autoBack && doc.boxes[b.back]?.hand && !(doc.boxes[b.back].hand.omens ?? []).length && !cands.includes(b));
  const plans = [...cands.map((b) => ({ box: b.id, hand: doc.boxes[b.parent].hand, why: "打つ前の手" })), ...(auto ? [{ box: auto.id, hand: doc.boxes[auto.back].hand, why: "同じ形の箱 (自動の戻り先) の手" }] : [])];
  if (!plans.length) { note.push(`${t.key}: (6) 試せる外れの箱が無い (お告げの無い手の外れが無い)`); return; }
  for (const p of plans) {
    await openTree(t, 1660, 860, false);
    const before = await readDoc();
    const n0 = Object.keys(before.boxes).length;
    // 戻りがあれば外して、＋ から手の窓を開く
    await ev(`document.querySelector('[data-box-id="${p.box}"] button[title="戻りの矢印を外す"]')?.click()`); await sleep(600);
    const plus = await ev(`(() => { const x = document.querySelector('[data-box-id="${p.box}"] [data-tree-next]'); if (!x) return false; const o = { bubbles: true, pointerId: 1, isPrimary: true, button: 0 }; x.dispatchEvent(new PointerEvent("pointerdown", o)); window.dispatchEvent(new PointerEvent("pointerup", o)); document.dispatchEvent(new PointerEvent("pointerup", o)); return true; })()`);
    await sleep(1200);
    const held = plus && await ev(`(() => { const b = document.querySelector('[data-tree-shelf] [data-key="${p.hand.currency}"]'); b?.click(); return !!b; })()`);
    await sleep(800);
    const used = held && await ev(`(() => { const c = document.querySelector("[data-tree-hand-card] [data-stage-card]"); c?.click(); return !!c; })()`);
    await sleep(2000);
    if (!used) { note.push(`${t.key}: (6) ${p.box} に ${p.hand.currency} を選べなかった (＋ ${!!plus} / 棚 ${!!held})`); continue; }
    const after = await saveAndRead();
    if (!after?.boxes) { note.push(`${t.key}: (6) ${p.box} に ${p.hand.currency} を打った後の木を保存から読めなかった`); continue; }
    const n1 =Object.keys(after.boxes).length, b = after.boxes[p.box];
    const label = `PC ${p.box} に${p.why} ${p.hand.currency}`;
    count(t.key, "同じ手");
    if (n1 > n0) bad(t.key, label, "外れで同じ手を選んだのに箱が増えた (段が伸びる)", `箱 ${n0} → ${n1}`, `箱 ${n0} のまま`);
    if (!b?.back) bad(t.key, label, "外れで同じ手を選んだのに戻りが付かない", b?.hand ? `手 ${b.hand.currency} が付いた` : "(戻りなし)", "打つ前 / 同じ形の箱へ戻る");
    else if (b.back !== "match" && !sameHand(after.boxes[b.back]?.hand, p.hand)) bad(t.key, label, "戻り先の箱の手が選んだ手と違う", `${b.back}: ${after.boxes[b.back]?.hand?.currency ?? "(手なし)"}`, p.hand.currency);
    await snap(`${t.key}-same-${p.box}`);
  }
}

try {
  console.log(`見張り: ${ORIGIN} (${MODE === "dev" ? "開発版の作り" : "本番の作り"})、木 ${TREES.length}`);
  const now = {};
  for (const t of TREES) {
    const doc = await openTree(t, 1660, 860, false);
    if (!doc) { bad(t.key, "開く", "木が開かない", "", ""); continue; }
    await snap(`${t.key}-pc`);
    const { hands: pcHands, issues } = await checkPc(t, doc);
    const cards = await checkCards(t, doc);
    const view = await ev(DISPLAY); // 箱ごとの題・戻りの札・次の手の札・カードの行 (整理の前後で比べる、10-28)
    await rules.checkHeads(t);
    const handNames = await rules.checkHandNames(t, doc);
    await rules.checkLinkShape(t, doc);
    await checkStripLines(t, doc);
    const r = await runs(t);
    const goal = doc.goalQualityOn || doc.wayMods?.length ? { goal: await checkGoal(t, doc) } : {};
    now[t.key] = { boxes: Object.keys(doc.boxes).length, issues, ...r, cards, ...goal };
    await checkHeldAnnul(t);
    if (await openTree(t, 1660, 860, false)) await rules.checkShelfNames(t, doc, handNames);
    await rules.checkParentStable(t);
    // 決まり (rules.mjs) の合わない所も前と比べる (整理で増えた / 消えたが分かる)
    now[t.key].rules = found.filter((f) => f.tree === t.key && f.rule).map((f) => `${f.where}: ${f.what} | ${f.text}`).sort();
    now[t.key].view = view;
    // 開発版の基準が無ければ本番の作りの基準 (出した版) と比べる = 出した後に変わった所が出る。前の基準に無い欄 (後から足した見る物) は比べない
    const was = baseline[MODE]?.[t.key] ?? baseline.prod?.[t.key];
    if (was && !UPDATE) for (const k of ["boxes", "issues", "test", "testStuck", "run", "runStuck", "cards", "goal", "rules"]) {
      if (!(k in was)) continue;
      if (JSON.stringify(was[k]) !== JSON.stringify(now[t.key][k])) bad(t.key, `回し ${k}`, "前 (baseline) と違う", JSON.stringify(now[t.key][k]), JSON.stringify(was[k]));
    }
    // 箱ごとの表示は箱ごとに違う所だけ出す
    if (was?.view && !UPDATE) for (const id of new Set([...Object.keys(was.view), ...Object.keys(view)])) {
      const a = was.view[id], b = view[id];
      if (JSON.stringify(a) !== JSON.stringify(b)) bad(t.key, `表示 ${id}`, "前 (baseline) と箱の表示が違う", JSON.stringify(b ?? "(箱なし)"), JSON.stringify(a ?? "(箱なし)"));
    }
    const pdoc = await openTree(t, 390, 844, true);
    if (!pdoc) { bad(t.key, "スマホ", "スマホで木が開かない", "", ""); continue; }
    await snap(`${t.key}-phone`);
    await walkPhone(t, pdoc);
    await openTree(t, 390, 844, true);
    await checkPhone(t, pdoc, pcHands);
    if (t.sameHand) await checkSameHand(t);
    console.log(`  ${t.key}: 合わない所 ${found.filter((f) => f.tree === t.key).length} / 比べた数 ${JSON.stringify(seenN[t.key] ?? {})} / 回し ${JSON.stringify({ ...now[t.key], view: undefined, cards: undefined })}`);
  }
  // 書く直前に読み直す (1460 と 1461 を同時に回すと、後から書いた方が先の分を消す)
  if (UPDATE) { const baseline = existsSync(BASE_PATH) ? JSON.parse(readFileSync(BASE_PATH, "utf8")) : {}; baseline[MODE] = { ...(baseline[MODE] ?? {}), ...now, _at: new Date().toISOString(), _origin: ORIGIN }; writeFileSync(BASE_PATH, JSON.stringify(baseline, null, 1) + "\n"); console.log(`baseline.json の ${MODE} を書いた`); }
  if (c.errors.length) for (const e of [...new Set(c.errors)]) bad("(全体)", "ページ", "JS のエラー", e, "0 件");
  console.log(`\n合わない所: ${found.length}`);
  for (const f of found) console.log(`- [${f.tree}] ${f.where}: ${f.what}\n    画面: ${f.text}${f.want ? `\n    木・前: ${f.want}` : ""}`);
  if (note.length) { console.log(`\n見られなかった所 (数えない): ${note.length}`); for (const n of note) console.log(`- ${n}`); }
  process.exitCode = found.length ? 1 : 0;
} finally { c.close(); }
