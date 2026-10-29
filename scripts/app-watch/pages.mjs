/**
 * pages.mjs — シミュ以外の見張り: 全部のページを PC・スマホの幅 × 日英で開き、どの画面でも成り立つ決まりを数える (最終チェック長、10-28)。
 * 決まりの正は docs/spec/shared-ui.md ⑤・emu.md ⑤・system.md ⑤、回し方は docs/org/dev/app-watch.md。
 *
 *   node scripts/app-watch/pages.mjs                         … 手元の本番の作り http://127.0.0.1:1460
 *   node scripts/app-watch/pages.mjs http://localhost:1440   … dev サーバー (スイッチの下も入る)
 *   [--only craft] [--tabs 4] [--json] [--update]
 * 70 回 (ページ × 幅 × 言語) をタブ 4 枚 (それぞれ別の部屋 = 保存も別) で並べて開く。待つのは画面が落ち着くまで (lib.mjs の settle、G-21)
 *
 * 見る物 (ページ × 幅 × 言語ごと):
 *   U-80 / M-93  横のはみ出し 0 (scrollWidth ≦ 窓の幅、overflow-guard と同じ数え方で画面の外へ出た物 0)
 *   U-83  英語の画面に日本語が残らない (更新履歴の中身・「日本語」ボタンを除く)
 *   U-84 / M-93  スマホで「…」で切れた文が無い (text-overflow: ellipsis・line-clamp で実際に切れている物)
 *   U-85 / M-94  JS の例外・console.error が 0
 *   Y-102  本番のホストへ記録を送らない
 */
import { args, opt, openTabs, report, prodWrites } from "./lib.mjs";

const PAGES = [
  ["craft", "/web.html?base=Sapphire%20Ring"],
  ["base", "/web.html?page=base"],
  ["guide", "/web.html?page=guide"],
  ["feedback", "/web.html?page=feedback"],
  ["routes", "/web.html?page=routes"],
  ["recipes", "/web.html?page=recipes"],
  ["sim-tree", "/web.html?page=sim-tree"],
].filter(([k]) => !opt("--only") || k === opt("--only"));
const SIZES = [[1660, 860, false], [1440, 900, false], [414, 896, true], [375, 812, true], [320, 640, true]];
const LANGS = ["ja", "en"];

const { r, done } = report("pages");
const JOBS = PAGES.flatMap(([key, path]) => SIZES.flatMap(([w, h, mobile]) => LANGS.map((lang) => ({ key, path, w, h, mobile, lang }))));
const { tabs, close } = await openTabs(Number(process.env.WATCH_PORT ?? 9381), Math.max(1, Math.min(JOBS.length, Number(opt("--tabs") ?? 4))));
/** 1 回分 (ページ × 幅 × 言語) をタブ c で開いて数える */
async function one(c, { key, path, w, h, mobile, lang }) {
  const at = `${key} ${w} ${lang}`;
  c.errors.length = 0; c.consoleErr.length = 0;
  await c.fresh(`${path}${path.includes("?") ? "&" : "?"}lang=${lang}`, w, h, mobile);
  // 下まで送って戻す (遅れて出る物も入れる)。送るたびに次の描画まで、最後に落ち着くまで
  await c.ev(`(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 16)); } scrollTo(0, 0); return 1; })()`);
  await c.settle();
  const v = await c.ev(`(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
    const w = document.documentElement.clientWidth;
    const scrollerOf = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const x = getComputedStyle(p).overflowX; if ((x === "auto" || x === "scroll" || x === "hidden") && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
    const over = [];
    for (const e of document.querySelectorAll("#app *, body > div *")) {
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height || (r.right <= w + 1 && r.left >= -1)) continue;
      const cs = getComputedStyle(e);
      if (cs.position === "fixed" && r.left >= w) continue;
      if (cs.pointerEvents === "none" || e.getAnimations().length || e.closest("[data-overflow-ok]")) continue;
      if (r.right <= 0 || cs.opacity === "0") continue; // わざと左の外へ隠した物 (要望の窓の罠の入力 -left-[9999px]。横の送りは出ない・見えない)
      if (over.some((o) => o.contains(e)) || scrollerOf(e)) continue;
      over.push(e);
    }
    const name = (e) => e.tagName + "." + String(e.className).split(" ").slice(0, 3).join(".") + " 「" + (e.innerText || "").trim().replace(/\\s+/g, " ").slice(0, 24) + "」";
    // 「…」で切れている物 (ellipsis・line-clamp で実際に入っていない)
    const cut = [];
    for (const e of document.querySelectorAll("body *")) {
      if (!vis(e) || !e.textContent.trim()) continue;
      const cs = getComputedStyle(e);
      if (cs.textOverflow === "ellipsis" && e.scrollWidth > e.clientWidth + 1) cut.push(name(e));
      else if (cs.webkitLineClamp && cs.webkitLineClamp !== "none" && e.scrollHeight > e.clientHeight + 2) cut.push(name(e));
    }
    // 英語の画面の日本語 (見えている文字。更新履歴の中身・「日本語」ボタンは除く)
    const ja = [];
    const JA = /[ぁ-んァ-ヶ一-龠]/;
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const t = n.nodeValue.trim();
      if (!t || !JA.test(t) || t === "日本語") continue;
      const p = n.parentElement;
      if (!p || !vis(p) || p.closest("script, style, noscript, [data-changelog], [data-lang-ja-ok]")) continue;
      ja.push(t.replace(/\\s+/g, " ").slice(0, 40) + " ← " + p.tagName.toLowerCase());
    }
    return { sw: document.documentElement.scrollWidth, iw: innerWidth, cw: w, over: over.map(name), cut, ja: [...new Set(ja)] };
  })()`);
  if (!v) { r("U-80", "横のはみ出し 0").note.push(`${at}: 読めなかった`); return; }
  const u80 = r("U-80", "横のはみ出し 0 (scrollWidth ≦ 窓・画面の外に出た物 0)"); u80.seen++;
  if (v.sw > v.cw + 1) u80.bad.push(`${at}: ページの幅 ${v.sw} > 窓 ${v.cw}`);
  for (const o of v.over.slice(0, 3)) u80.bad.push(`${at}: ${o}`);
  if (lang === "en") { const u83 = r("U-83", "英語の画面に日本語が残らない"); u83.seen++; for (const j of v.ja.slice(0, 5)) u83.bad.push(`${at}: ${j}`); if (v.ja.length > 5) u83.bad.push(`${at}: …ほか ${v.ja.length - 5}`); }
  if (mobile) { const u84 = r("U-84", "スマホで「…」で切れた文が無い"); u84.seen++; for (const x of v.cut.slice(0, 4)) u84.bad.push(`${at}: ${x}`); }
  const u85 = r("U-85", "JS の例外・console.error が 0"); u85.seen++;
  for (const e of [...new Set([...c.errors, ...c.consoleErr])].slice(0, 3)) u85.bad.push(`${at}: ${e}`);
}
try {
  // 前から順に、空いたタブが次の 1 回を取る
  const queue = [...JOBS];
  await Promise.all(tabs.map(async (c) => { for (let j = queue.shift(); j; j = queue.shift()) await one(c, j); }));
  const reqs = tabs.flatMap((c) => c.reqs);
  const y = r("Y-102", "本番のホストへ記録を送らない"); y.seen = reqs.length;
  for (const q of prodWrites(reqs)) y.bad.push(`${q.method} ${q.url.slice(0, 100)}`);
} finally { close(); }
done();
void args;
