/**
 * _blog-og.mjs — ブログの記事の OGP の絵 (1200×630) に題を描く (2026-10-22、build-blog-pages.mjs から)。
 * 記事に図が無い時だけ使う。手元の Chrome を窓なしで 1 回ずつ起こして撮る (--screenshot で撮ったら自分で閉じる、1 枚 0.5 秒くらい)。
 * Chrome が無い時は null (呼ぶ側がサイトの既定の絵 /web/og.png にする)。Chrome の場所は CHROME_PATH か既定の置き場
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const CANDIDATES = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
const chrome = CANDIDATES.find((p) => p && existsSync(p)) ?? null;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 題を描いた絵を out (.png) に書く。書けたら true */
export function titleCard({ title, date, lang, out }) {
  if (!chrome) return false;
  const dir = mkdtempSync(join(tmpdir(), "exiledesk-og-"));
  try {
    const html = join(dir, "card.html");
    const size = title.length > 34 ? 52 : title.length > 22 ? 60 : 68;
    writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1200px;height:630px;background:#0e0c09;color:#e8dfcf;font-family:"Yu Gothic UI","Meiryo","Hiragino Sans","Noto Sans JP",sans-serif}
.c{box-sizing:border-box;width:1200px;height:630px;padding:64px 80px;border:14px solid #3a3024;display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(160deg,#17130e,#0a0907)}
h1{font-size:${size}px;line-height:1.35;margin:0;color:#e0b062;font-weight:700}p{margin:0;font-size:28px;color:#a99b84}b{color:#e8dfcf;letter-spacing:.06em}
</style></head><body><div class="c"><p><b>ExileDesk</b> ${lang === "ja" ? "ブログ · Path of Exile 2 のクラフト" : "Blog · Path of Exile 2 crafting"}</p><h1>${esc(title)}</h1><p>exiledesk.com · ${esc(date)}</p></div></body></html>`);
    execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${join(dir, "profile")}`, "--window-size=1200,630", `--screenshot=${out}`, pathToFileURL(html).href], { windowsHide: true, stdio: "ignore", timeout: 30_000 });
    return existsSync(out);
  } catch {
    return false;
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* 消せなくてよい */ }
  }
}
