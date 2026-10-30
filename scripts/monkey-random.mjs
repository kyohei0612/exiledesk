/**
 * monkey-random.mjs — 乱数の猿 (R-18)。シミュレーターを押した状態から、押せる物を種つき乱数で選んで本物の入力で触り、手順と結果の表・JS エラーを書き出す。合否は付けない。
 * 窓なし Chrome を 1 つ立てて、終わったら閉じる (sim-watch/cdp.mjs)。幅 768 未満はスマホ扱い (タッチ)。
 *
 *   node scripts/monkey-random.mjs <URL> <種> <手数> <幅> [--until-100] [--shots] [--out <置き場>] [--port <番号>]
 *   node scripts/monkey-random.mjs http://localhost:1440/web.html 20261031 20 1660
 *   node scripts/monkey-random.mjs http://localhost:1440/web.html 16600844 20 390
 *
 * 手数 = 画面の文字が変わった押しの数 (変わらない押しは「空振り」で数えない)。--until-100 は手数の後も 100 人が走るまで続ける (手数 + 50 まで)。
 * 道は決め打ちしない: 押せる物の全部が候補で、先へ進む物の確率だけを画面ごとに上げる。exiledesk.com への GET 以外の送信と広告・計測は切る (本番へ書かない・表示数を汚さない)。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openChrome, sleep } from "./sim-watch/cdp.mjs";

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); if (i < 0) return false; argv.splice(i, 1); return true; };
const opt = (n, d) => { const i = argv.indexOf(n); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const UNTIL100 = flag("--until-100"), SHOTS = flag("--shots");
const OUT = opt("--out", join(tmpdir(), "exiledesk-monkey")), PORT = Number(opt("--port", 9478));
const [URL_, seedArg, handsArg, widthArg] = argv;
if (!URL_ || !seedArg || !handsArg || !widthArg) { console.error("node scripts/monkey-random.mjs <URL> <種> <手数> <幅> [--until-100] [--shots] [--out <置き場>] [--port <番号>]"); process.exit(1); }
const SEED = Number(seedArg), HANDS = Number(handsArg), W = Number(widthArg), H = W < 768 ? 844 : 860, MOBILE = W < 768;
const MAX_HANDS = UNTIL100 ? HANDS + 50 : HANDS, MAX_PRESS = MAX_HANDS * 3;
mkdirSync(OUT, { recursive: true });
const base = `monkey-${SEED}-${W}`;

// 種つき乱数 (mulberry32)
let st = SEED >>> 0;
const rnd = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const GO = /決めた|次へ|完成|テスト|100 ?人|シェア|共有|付ける|ふつう|フラクチャー|冒涜|カオス|高貴|消去|エッセンス|骨|ルーン|合金|品質|始め|スタート|残したい|ベース|もう一度|回す/;
const NAV = /エミュ|チュートリアル|更新|要望|ガイド|プライバシー|利用規約|English|X で|ポスト|ツイート|Discord|YouTube|広告/;
const HEAD = /^(エミュレーター|デイリー|使い方|要望|アプリ版|本日の訪問者)/;
const CARD = "(手の窓のカード)";
let shelfUses = 0;

/** 押せる物 1 つの重み。0 だけが候補から外れる (言語の切り替え = 確率の語が日本語なので) */
const weight = (c, url, body) => {
  const t = c.t;
  if (/^(EN|日本語)$/.test(t)) return 0;
  if (NAV.test(t) || HEAD.test(t) || c.y < 90) return 0.1;
  if (/レシピを消す|^消す$/.test(t)) return 0.2;
  if (/レシピ ▾/.test(t)) return 0.3;
  if (url.includes("sim-base")) return /Lv \d+/.test(t) ? 40 : /\d+ 種/.test(t) ? 8 : c.tag === "input" ? 1 : 3;
  if (url.includes("sim-mods")) {
    const open = /の付け方/.test(body);
    if (/これで始める/.test(t)) return 80;
    if (/決めた/.test(t)) return /MOD なし/.test(body) ? 3 : 120;
    if (/^(ふつう|✦ フラクチャー|フラクチャー|冒涜)$/.test(t)) return open ? 150 : 2;
    if (/^付ける/.test(t)) return open ? 3 : 50;
    if (/\d+%$|\d+ \d+ \d+$/.test(t)) return 12;
    return /エッセンス|品質|フラクチャー|冒涜/.test(t) ? 6 : 1;
  }
  if (/^[12] (ベース|完成の MOD)|^ベース$|全画面|^[0-9]+%$/.test(t) && !c.modal) return 0.2;
  if (/^使う/.test(t)) return 200;
  if (/付く MOD を選ぶ/.test(t)) return 80;
  if (/^(完成|✓ 完成|この場合は完成)$/.test(t)) return 40;
  if (/^失敗$/.test(t)) return 10;
  if (/次へ$/.test(t)) return 40;
  if (t === CARD) return /押すと使う/.test(body) ? 200 : 0.2;
  if (c.tag === "textarea") return 0.5;
  if (c.modal) return /やめる|^×$/.test(t) ? 1 : /完成にする|決める|続ける|^これで/.test(t) ? 30 : c.tag === "input" ? 8 : GO.test(t) ? 20 : 6;
  if (/次に打つ手を足す/.test(t)) return 60;
  if (/メモ|白紙|新規|コピー$|^ツリー[①-⑨]/.test(t) && !/URL/.test(t)) return 0.3;
  if (/^＋MOD/.test(t)) return 3;
  if (/シェア/.test(t)) return /100 人: \d+ 個 [\d.]+/.test(body) ? 25 : 0.3;
  if (/URL をコピー/.test(t)) return 60;
  if (/100 人回す/.test(t)) return shelfUses >= 3 ? 40 : 1;
  if (/テストで回す|もう一度テスト/.test(t)) return shelfUses >= 2 ? 20 : 1;
  if (/完成にする/.test(t)) return 30;
  if (c.shelf) return 25;
  if (c.box) return 15;
  return GO.test(t) ? 8 : 1;
};
const pick = (cs, url, body) => {
  const ws = cs.map((c) => weight(c, url, body));
  let r = rnd() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < cs.length; i++) { r -= ws[i]; if (ws[i] > 0 && r <= 0) return cs[i]; }
  return cs[cs.length - 1];
};

/** ページの中: 今見えていて一番上にある押せる物の一覧 */
const CANDIDATES = `(() => {
  const sel = 'button, a[href], input, select, textarea, summary, [role="button"], [role="option"], [role="menuitem"], [role="checkbox"], [role="tab"], label, [data-tree-box], [data-box-id], .vue-flow__node';
  const out = [];
  const ptr = [...document.querySelectorAll("body *")].filter((e) => getComputedStyle(e).cursor === "pointer" && getComputedStyle(e.parentElement || e).cursor !== "pointer");
  for (const el of new Set([...document.querySelectorAll(sel), ...ptr])) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0 || cs.pointerEvents === "none") continue;
    if (el.disabled || el.getAttribute("aria-disabled") === "true") continue;
    if (el.tagName === "A" && (el.target === "_blank" || !el.href.startsWith(location.origin))) continue;
    const cx = (Math.max(r.left, 0) + Math.min(r.right, innerWidth)) / 2, cy = (Math.max(r.top, 0) + Math.min(r.bottom, innerHeight)) / 2;
    if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight || r.bottom <= 0 || r.top >= innerHeight) continue;
    const top = document.elementFromPoint(cx, cy);
    if (!top || !(el === top || el.contains(top) || (top.contains(el) && top.tagName === "LABEL"))) continue;
    const t = (el.innerText || el.value || el.getAttribute("aria-label") || el.title || el.placeholder || "").replace(/\\s+/g, " ").trim().slice(0, 70);
    out.push({ x: Math.round(cx), y: Math.round(cy), tag: el.tagName.toLowerCase(), type: el.type || "", t, shelf: !!el.closest("[data-tree-shelf]"), box: !!el.closest("[data-box-id]"), modal: !!el.closest('[aria-modal="true"]') });
  }
  const card = [...document.querySelectorAll('[aria-modal="true"] *')].filter((e) => /アイテムレベル:/.test(e.innerText || "") && e.getBoundingClientRect().height > 80).pop();
  if (card) { const r = card.getBoundingClientRect(); out.push({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), tag: "div", type: "", t: ${JSON.stringify(CARD)}, modal: true }); }
  const seen = new Set();
  return out.filter((c) => { const k = c.x + "," + c.y; if (seen.has(k)) return false; seen.add(k); return true; });
})()`;

const started = Date.now();
const c = await openChrome(PORT);
const rows = [], errs = [], blocked = [];
let hand = 0;
try {
  c.on("Runtime.consoleAPICalled", (p) => { if (["error", "warning"].includes(p.type)) errs.push({ hand, kind: p.type, text: p.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300) }); });
  c.on("Fetch.requestPaused", (p) => {
    if (p.request.method !== "GET") { blocked.push(`${p.request.method} ${p.request.url}`); c.send("Fetch.failRequest", { requestId: p.requestId, errorReason: "BlockedByClient" }); }
    else c.send("Fetch.continueRequest", { requestId: p.requestId });
  });
  // dev は画面を初めて開く時にファイルを読むので、通信の終わりも落ち着きの条件にする
  const inflight = new Map(); let lastNet = 0;
  const netDone = (p) => { if (inflight.delete(p.requestId)) lastNet = Date.now(); };
  c.on("Network.requestWillBeSent", (p) => { inflight.set(p.requestId, Date.now()); lastNet = Date.now(); });
  c.on("Network.loadingFinished", netDone);
  c.on("Network.loadingFailed", netDone);
  await c.send("Network.enable");
  // 猿に広告・計測を読ませない (表示数を汚す。終わらない通信で待ちも詰まる)
  await c.send("Network.setBlockedURLs", { urls: ["*doubleclick.net*", "*googlesyndication.com*", "*googleadservices.com*", "*adtrafficquality.google*", "*google-analytics.com*", "*googletagmanager.com*", "*google.com/recaptcha*", "*gstatic.com/recaptcha*"] });
  await c.send("Fetch.enable", { patterns: [{ urlPattern: "*exiledesk.com*" }] });
  await c.size(W, H, MOBILE);
  if (MOBILE) await c.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

  const textOf = () => c.ev("document.body.innerText").catch(() => "");
  const urlOf = () => c.ev("location.href").catch(() => "");
  /** DOM の変化が 300ms 止まるまで待つ (文字だけで見ると、押しの結果が出る前に落ち着いたと読む)。上限だけ固定 */
  const calm = async (limit = 6000) => {
    await c.ev(`window.__mut ?? (window.__mut = Date.now(), new MutationObserver(() => { window.__mut = Date.now(); }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true }), 0)`).catch(() => {});
    const t0 = Date.now();
    await sleep(350);
    while (Date.now() - t0 < limit) {
      for (const [id, at] of inflight) if (Date.now() - at > 5000) inflight.delete(id); // 終わらない通信は待たない
      if (!inflight.size &&Date.now() - lastNet >= 300 && (await c.ev("Date.now() - window.__mut").catch(() => 999)) >= 300) break;
      await sleep(80);
    }
    return textOf();
  };
  const lines = (t) => t.split("\n").map((s) => s.trim()).filter(Boolean);
  const press = async (x, y, button = "left") => {
    if (MOBILE) {
      await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      return;
    }
    await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button, clickCount: 1 });
    await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button, clickCount: 1 });
  };
  const key = async (k, code = k, vk = 27) => {
    await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk });
    await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk });
  };

  await c.go(URL_);
  await c.until("document.body && document.body.innerText.includes('シミュレーター')", 30000);
  await calm();
  const start = (await c.ev(CANDIDATES)).find((x) => /シミュレーター/.test(x.t));
  if (!start) throw new Error("シミュレーターのボタンが見つからない");
  await press(start.x, start.y);
  await calm();

  let presses = 0, reached100 = false;
  const ran100 = (b) => /100 人: \d+ 個 [\d.]+/.test(b);
  for (hand = 1; hand <= MAX_HANDS && presses < MAX_PRESS; presses++) {
    if (hand > HANDS && (!UNTIL100 || reached100)) break;
    const beforeText = await textOf(), before = lines(beforeText), url = await urlOf();
    const cs = (await c.ev(CANDIDATES)) ?? [];
    const roll = rnd();
    let act;
    if (roll < 0.05) { act = "Esc"; await key("Escape"); }
    else if (roll < 0.08 && !MOBILE) { act = "右クリック (真ん中)"; await press(W / 2, H / 2, "right"); }
    else if (roll < 0.14 && !MOBILE) { act = "下へ送る"; await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: W / 2, y: H / 2, deltaX: 0, deltaY: 400 + Math.floor(rnd() * 600) }); }
    else if (roll < 0.14) { act = "下へ送る"; await c.ev(`window.scrollBy(0, ${300 + Math.floor(rnd() * 400)})`); }
    else if (!cs.length) act = "押せる物なし";
    else {
      const p = pick(cs, url, before.join("|"));
      act = `${p.t || p.tag}`;
      if (p.shelf) shelfUses++;
      await press(p.x, p.y);
      if (["text", "number", "search", "textarea"].includes(p.type)) { const v = String(Math.floor(rnd() * 100)); await c.send("Input.insertText", { text: v }); act += ` に ${v} を入力`; }
    }
    let afterText = await calm();
    // 変化が見えない時は、空振りと決める前に遅れて出るのを待つ (初めて開く画面は反応が遅い)
    for (const t0 = Date.now(); afterText === beforeText && Date.now() - t0 < 1500;) { await sleep(150); afterText = await textOf(); }
    if (afterText !== beforeText) afterText = await calm();
    const after = lines(afterText), bs = new Set(before), as = new Set(after);
    const added = after.filter((l) => !bs.has(l)), removed = before.filter((l) => !as.has(l));
    const over = (await c.ev("document.documentElement.scrollWidth - innerWidth").catch(() => 0)) ?? 0;
    const changed = added.length > 0 || removed.length > 0;
    if (ran100(afterText)) reached100 = true;
    rows.push({ n: changed ? hand : "-", act, page: ((await urlOf()).match(/page=([\w-]+)/) ?? [])[1] ?? "", added, removed, over });
    if (SHOTS) await c.shot(join(OUT, `${base}-${String(presses).padStart(3, "0")}.png`));
    if (changed) hand++;
  }

  const cell = (s) => String(s).replace(/\|/g, "／").replace(/\s+/g, " ").slice(0, 90);
  const gone = (l) => (l.length ? `${l.slice(0, 3).map(cell).join(" / ")}${l.length > 3 ? ` …他 ${l.length - 3}` : ""}` : "");
  const secs = Math.round((Date.now() - started) / 1000);
  const jsErr = errs.filter((e) => e.kind === "error").length + c.errors.length, warn = errs.filter((e) => e.kind === "warning").length;
  const md = [
    `# 乱数の猿 種 ${SEED} 幅 ${W}${MOBILE ? " (スマホ)" : ""}`, "",
    `- 宛先 ${URL_} / 手数 ${HANDS} / 変化のあった手 ${hand - 1} / 押した数 ${rows.length} / 実時間 ${secs} 秒`,
    `- 100 人 ${reached100 ? "走った" : "届かず"} / JS のエラー ${jsErr} / warn ${warn} / 切った送信 ${blocked.length}`, "",
    "| 手 | 押した物 | 画面 | 増えた文字 | 減った文字 |", "|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.n} | ${cell(r.act)} | ${r.page}${r.over > 0 ? ` はみ出し ${r.over}px` : ""} | ${gone(r.added)} | ${gone(r.removed)} |`),
    "", "## JS のエラー・warn", "",
    ...(c.errors.length || errs.length ? [...c.errors.map((e) => `- pageerror ${e}`), ...errs.map((e) => `- 手 ${e.hand} ${e.kind} ${e.text}`)] : ["なし"]), "",
  ].join("\n");
  const file = join(OUT, `${base}.md`);
  writeFileSync(file, md);
  console.log(`種 ${SEED} 幅 ${W}: ${secs} 秒 / 手 ${hand - 1} / 押した数 ${rows.length} / 100 人 ${reached100 ? "走った" : "届かず"} / JS のエラー ${jsErr} / warn ${warn}\n→ ${file}`);
} finally {
  c.close();
}
