// 記事のサムネ (OGP 1200×630、一覧のカードにも使う) を日英で作る。オーナー 10-22「題ドーン・右にアイテムドーン、ガビガビを直す」。
// 形: 濃い紺の地・左上に小さなカテゴリの札・その下に「Path of Exile 2 | 0.5 / 0.5.5」・左半分に太い大きな題 (白、2 行まで)・小さな副題 1 行・右半分にアイテムの絵 1〜3 個・右下に ExileDesk。
// ぼけさせない: 1200×630 を等倍で撮る (deviceScaleFactor 1)。手元の絵は 128px (アイテム)・108px (お告げ・骨) が最大で、外からは取らない (決まり)。元の大きさより大きくしない。
// 使い方: node docs/org/blog/charts/og/make-og.mjs [slug…]   (OUT_DIR を付けると src/data/blog/img の代わりにそこへ書く。見本を作る時に使う)
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../../../../..");
const TMP = process.env.OG_TMP ?? resolve(ROOT, ".og-tmp");
const OUT = process.env.OUT_DIR ?? resolve(ROOT, "src/data/blog/img");
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const f = (p) => `file:///${resolve(ROOT, p).replace(/\\/g, "/")}`;
const base = (n) => f(`public/base-art/${n}.webp`);
const hd = (n) => f(`video/assets/icons_hd/${n}.png`);
const ic = (n) => f(`video/assets/icons/${n}.png`);
const A = {
  ring: base("Rings_Basetypes_GoldRing"), glove: base("Armours_Gloves_Basetypes_GlovesInt03"), amulet: base("Amulets_Basetypes_AbsentAmulet"),
  mace: base("Weapons_OneHandWeapons_OneHandMaces_Basetypes_1HMace03"), cranium: base("Currency_Abyss_PreservedCranium"),
  chaos: ic("chaos"), annul: ic("annul"), exalt: ic("exalt"), exaltG: ic("exalt_greater"), exaltP: ic("exalt_perfect"), divine: ic("divine"),
  collar: hd("collarbone"), rib: hd("rib"), ribA: hd("rib_ancient"), jaw: hd("jawbone"), necroR: ic("OmenofDextralNecromancy"),
};

// slug: [絵 1〜3, ja [札, 題 (\n で 2 行), 副題], en [...]]。副題の数字は記事の本文にある物だけ。
const POSTS = {
  "dont-hoard-misses": [[A.ring, A.annul, A.chaos], ["消去のオーブ", "外れは\n溜めるな", "すぐ消すと 400 → 220 神"], ["Orb of Annulment", "Don't hoard\nyour misses", "Annul at once: 400 → 220 div"]],
  "desecration-bone-sides": [[A.collar, A.rib, A.necroR], ["冒涜", "骨の左右は\n半々", "CoE に合わせて直した話"], ["Desecration", "Bones land\n50/50", "How we fixed the side rule"]],
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
// 絵の置き場 (中心)。光の輪 2 重の中に、1 個は真ん中・2 個は斜め・3 個は三角に。
const POS = { 1: [[880, 315]], 2: [[810, 255], [955, 380]], 3: [[880, 205], [775, 395], [990, 395]] };
const arts = (list) => list.map((src, i) => {
  const [x, y] = POS[list.length][i];
  return `<div class="glow" style="left:${x}px;top:${y}px"></div><img src="${src}" style="left:${x}px;top:${y}px">`;
}).join("");
const page = (imgs, [chip, title, sub], lang) => `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0f1b2d;font-family:${lang === "ja" ? '"Yu Gothic UI","Meiryo","Noto Sans JP"' : '"Segoe UI","Noto Sans JP"'},sans-serif;color:#fff}
.bg{position:absolute;inset:0;background:radial-gradient(circle at 74% 50%,#1d3150 0%,#13213a 40%,#0f1b2d 72%)}
.ring{position:absolute;left:665px;top:95px;width:440px;height:440px;border-radius:50%;border:2px solid rgba(201,162,93,.40)}
.ring2{position:absolute;left:725px;top:155px;width:320px;height:320px;border-radius:50%;border:1px solid rgba(201,162,93,.25)}
.glow{position:absolute;width:190px;height:190px;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,rgba(233,201,135,.30) 0%,rgba(233,201,135,.10) 45%,rgba(233,201,135,0) 70%)}
img{position:absolute;transform:translate(-50%,-50%);filter:drop-shadow(0 8px 16px rgba(0,0,0,.6))}
.chip{position:absolute;left:64px;top:58px;padding:6px 18px;border-radius:999px;background:#c9a25d;color:#10192a;font-size:24px;font-weight:700;letter-spacing:.04em}
.ver{position:absolute;left:66px;top:116px;font-size:22px;color:#9fb3cf;letter-spacing:.03em}
.t{position:absolute;left:62px;top:168px;width:580px;font-size:${lang === "ja" ? 92 : 82}px;line-height:1.14;font-weight:700;white-space:pre-line}
.s{position:absolute;left:66px;top:440px;width:580px;font-size:30px;font-weight:700;color:#e9c987}
.b{position:absolute;right:56px;bottom:40px;font-size:24px;font-weight:700;color:#9fb3cf;letter-spacing:.08em}
</style><div class="bg"></div><div class="ring"></div><div class="ring2"></div>${arts(imgs)}
<div class="chip">${esc(chip)}</div><div class="ver">Path of Exile 2 | 0.5 / 0.5.5</div><div class="t">${esc(title)}</div><div class="s">${esc(sub)}</div><div class="b">ExileDesk</div>`;

const only = process.argv.slice(2);
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });
const prof = resolve(TMP, "chrome-prof");
for (const [slug, [imgs, ja, en]] of Object.entries(POSTS)) {
  if (only.length && !only.includes(slug)) continue;
  for (const [lang, t] of [["ja", ja], ["en", en]]) {
    const html = resolve(TMP, `${slug}.${lang}.html`);
    writeFileSync(html, page(imgs, t, lang));
    const out = resolve(OUT, `${slug}-og.${lang}.png`);
    execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--allow-file-access-from-files", `--user-data-dir=${prof}`, "--window-size=1200,630", `--screenshot=${out}`, `file:///${html.replace(/\\/g, "/")}`], { stdio: ["ignore", "ignore", "pipe"], timeout: 60000 });
    console.log(out);
  }
}
rmSync(TMP, { recursive: true, force: true });
