// 記事のサムネ (OGP 1200×630、一覧のカードにも使う) を日英で作る。白い紙面の色、題 2〜3 語を大きく、記事にある数字を 1 つ、右にゲームの絵。
// 16:9 に切られても読めるよう、中身は左右 40px より内側。1 本目 (dont-hoard-misses) は charts/og/dont-hoard-misses.<言語>.html のまま。
// 使い方: node docs/org/blog/charts/og/make-og.mjs [slug…]  → scratchpad に HTML を書き、窓なしの Chrome で撮って src/data/blog/img/<slug>-og.<言語>.png
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../../../../..");
const TMP = process.env.OG_TMP ?? resolve(ROOT, ".og-tmp");
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const art = (f) => `file:///${ROOT.replace(/\\/g, "/")}/public/${f}`;
const RING = art("base-art/Rings_Basetypes_GoldRing.webp");
const GLOVE = art("base-art/Armours_Gloves_Basetypes_GlovesInt03.webp");
const AMULET = art("base-art/Amulets_Basetypes_AbsentAmulet.webp");
const BONE = art("base-art/Currency_Abyss_PreservedCranium.webp");
const MACE = art("base-art/Weapons_OneHandWeapons_OneHandMaces_Basetypes_1HMace03.webp");
const ABYSS = art("ui-art/abyss-emblem.webp");

// slug: [絵, ja [上の小さい字, 題, 数字], en [...]] 数字は記事の本文にある物だけ
const POSTS = {
  "optimal-move-vs-intuition": [GLOVE, ["PoE2 クラフトの期待値", "最善手は勘と違う", "3,400 → 105 神"], ["PoE2 crafting expected cost", "The best move isn't intuitive", "3,400 → 105 div"]],
  "sanctify-quality-order": [AMULET, ["PoE2 聖別と品質", "順番で +6 になる", "+5 は出ない"], ["PoE2 Sanctify & Quality", "The order makes +6", "+5 never appears"]],
  "gold-ring-video-decoded": [RING, ["PoE2 金の指輪のクラフト手順", "字幕を名前つきで解く", ""], ["PoE2 Gold Ring craft", "Captions, decoded", ""]],
  "poe2db-cast-speed-weight": [RING, ["PoE2 キャストスピードの重み", "poe2db は 1", "1 vs 1,000"], ["PoE2 Cast Speed weight", "poe2db says 1", "1 vs 1,000"]],
  "es-gloves-greater-exalt": [GLOVE, ["PoE2 ES 手袋のクラフト", "高貴は上級が安い", "105 神"], ["PoE2 Energy Shield gloves", "Greater beats Perfect", "105 div"]],
  "crafting-cost-variance": [RING, ["PoE2 クラフトの費用と運", "平均だけ見ない", "10 人に 1 人は 2 倍"], ["PoE2 crafting cost & luck", "Don't trust the average", "1 in 10 pays 2×"]],
  "chaos-spam-odds": [GLOVE, ["PoE2 カオススパム", "1 回 0.3%", "平均 313 個"], ["PoE2 chaos spam", "0.3% per try", "313 orbs on average"]],
  "desecration-weights": [BONE, ["PoE2 冒涜 MOD の重み", "誰も知らない", "85 / 14 / 1%"], ["PoE2 desecration weights", "Nobody knows them", "85 / 14 / 1%"]],
  "fracture-desecrated": [BONE, ["PoE2 フラクチャー", "冒涜は固定できない", "24 回で 0 回"], ["PoE2 Fracturing Orb", "Desecrated can't be fractured", "0 in 24 tries"]],
  "quality-rounding-down": [AMULET, ["PoE2 品質の丸め", "切り捨てだった", "33% +3 / 34% +4"], ["PoE2 quality rounding", "It rounds down", "33% +3 / 34% +4"]],
  "catalysing-exaltation-multiplier": [RING, ["触媒の高貴のお告げ", "倍率は誰も知らない", "1 + 0.2 × 品質"], ["Catalysing Exaltation", "Nobody knows the multiplier", "1 + 0.2 × Quality"]],
  "mana-ring-craft": [RING, ["PoE2 マナの指輪", "5 つ揃えると", "1,991 神"], ["PoE2 mana ring", "All five targets", "1,991 div"]],
  "kolrs-hunt-gloves": [GLOVE, ["PoE2 コルの狩り", "ルーンで MOD が混ざる", "1.8 倍"], ["PoE2 Kolr's Hunt", "The rune adds mods", "1.8×"]],
  "arcane-surge-desecrated-gloves": [GLOVE, ["PoE2 アーケインサージ", "出る手袋と割合", "7.4%"], ["PoE2 Arcane Surge", "Which gloves, what odds", "7.4%"]],
  "desecration-bone-sides": [BONE, ["PoE2 冒涜の骨", "左右は半々", "50 : 50"], ["PoE2 desecration bones", "The sides are 50/50", "50 : 50"]],
  "desecration-lords-tag-audit": [MACE, ["PoE2 冒涜の陣営", "poe2db に合わせた", "93 MOD"], ["PoE2 desecration lords", "Matched to poe2db", "93 mods"]],
  "essence-of-the-abyss-mark": [ABYSS, ["アビスのエッセンス", "紋章で冒涜の準備", ""], ["Essence of the Abyss", "Prepare with the Mark", ""]],
  "crafting-calculator-mistakes": [GLOVE, ["PoE2 期待値の計算", "3 つの間違い", ""], ["PoE2 crafting math", "3 bugs we caught", ""]],
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const page = (img, [kick, title, num], lang) => `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;width:1200px;height:630px;background:#fff;font-family:"Zen Kaku Gothic New","Yu Gothic UI","Meiryo",sans-serif;color:#2b2620;overflow:hidden}
.f{position:absolute;inset:24px;border:3px solid #d9c9a6;border-radius:18px;background:#faf7f0}
.k{position:absolute;left:76px;top:70px;right:420px;font-size:32px;color:#6b6255;letter-spacing:.04em}
.t{position:absolute;left:76px;top:122px;right:420px;font-size:${lang === "ja" ? 74 : 66}px;line-height:1.2;font-weight:700}
.n{position:absolute;left:76px;bottom:120px;right:420px;font-size:72px;font-weight:800;color:#b97d12;white-space:nowrap}
.b{position:absolute;left:76px;bottom:62px;font-size:28px;font-weight:700;color:#94650c;letter-spacing:.08em}
.a{position:absolute;right:70px;top:115px;width:330px;height:330px;border-radius:50%;background:radial-gradient(circle,#f1e6cc 0%,#faf7f0 70%);display:grid;place-items:center}
.a img{max-width:270px;max-height:270px;filter:drop-shadow(0 8px 14px rgba(60,40,10,.28))}
</style><div class="f"></div><div class="a"><img src="${img}"></div>
<div class="k">${esc(kick)}</div><div class="t">${esc(title)}</div>${num ? `<div class="n">${esc(num)}</div>` : ""}<div class="b">ExileDesk</div>`;

const only = process.argv.slice(2);
mkdirSync(TMP, { recursive: true });
const prof = resolve(TMP, "chrome-prof");
for (const [slug, [img, ja, en]] of Object.entries(POSTS)) {
  if (only.length && !only.includes(slug)) continue;
  for (const [lang, t] of [["ja", ja], ["en", en]]) {
    const html = resolve(TMP, `${slug}.${lang}.html`);
    writeFileSync(html, page(img, t, lang));
    const out = resolve(ROOT, `src/data/blog/img/${slug}-og.${lang}.png`);
    execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files", `--user-data-dir=${prof}`, "--window-size=1200,630", `--screenshot=${out}`, `file:///${html.replace(/\\/g, "/")}`], { stdio: ["ignore", "ignore", "pipe"], timeout: 60000 });
    console.log(out);
  }
}
rmSync(TMP, { recursive: true, force: true });
