// 記事のサムネ (OGP 1200×630、一覧のカードにも使う) を日英で作る。オーナー 10-22「題ドーン・右にアイテムドーン、ガビガビを直す」。
// 形 (10-22 夜、オーナー「文字も小さい」で大きく): 濃い紺の地・左上に小さなカテゴリの札・その下に「Path of Exile 2 | 0.5 / 0.5.5」・左半分に太い大きな題 (白、2 行まで)・小さな副題 1 行・右半分にアイテムの絵 1〜3 個・右下に ExileDesk。
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
  mace: base("Weapons_OneHandWeapons_OneHandMaces_Basetypes_1HMace03"), cranium: base("Currency_Abyss_PreservedCranium"), jewel: base("Jewels_RubyJewel"), jewel2: base("Jewels_EmeraldJewel"),
  chaos: ic("chaos"), divine: ic("divine"), fracture: ic("fracture"), catLife: ic("catalyst_life"), catDef: ic("catalyst_defences"),
  kolr: ic("rune__Kolr's Hunt"),
  collar: hd("collarbone"), collarA: hd("collarbone_ancient"), rib: hd("rib"), ribA: hd("rib_ancient"), jaw: hd("jawbone"),
  sinEx: hd("OmenofSinistralExaltation"), dexEx: hd("OmenofDextralExaltation"), grEx: hd("OmenofGreaterExaltation"), whittle: hd("OmenofWhittling"),
  light: hd("OmenofLight"), sanct: hd("OmenofSanctification"), liege: hd("OmenoftheLiege"), sovereign: hd("OmenoftheSovereign"),
  echoes: hd("OmenofAbyssalEchoes"), grAnnul: hd("OmenofGreaterAnnulment"), artificer: hd("artificer"),
  necroR: ic("OmenofDextralNecromancy"), catEx: ic("OmenofCatalysingExaltation"), sinEr: ic("OmenofSinistralErasure"),
};

// slug: [絵 1〜3, ja [札, 題 (\n で 2 行), 副題], en [...] (null なら日本語だけ)]。副題の数字は記事の題・本文にある物だけ。
const POSTS = {
  "dont-hoard-misses": [[A.ring, A.cranium, A.glove], ["消去のオーブ", "外れは\n溜めるな", "すぐ消すと 400 → 220 神"], ["Orb of Annulment", "Don't hoard\nmisses", "Annul at once: 400 → 220 div"]],
  "optimal-move-vs-intuition": [[A.glove, A.sinEr, A.grAnnul], ["期待値", "最善手は\n勘と違う", "3,400 → 105 神"], ["Expected cost", "Best move?\nNot intuitive", "3,400 → 105 div"]],
  "sanctify-quality-order": [[A.amulet, A.sanct], ["聖別・品質", "順番で\n+6 になる", "+5 はどの倍率でも出ない"], ["Sanctify & Quality", "Order\nmakes +6", "+5 never appears"]],
  "poe2db-cast-speed-weight": [[A.ring, A.dexEx], ["重み", "poe2db\nは 1", "CoE は 1,000"], ["Mod weight", "poe2db\nsays 1", "Craft of Exile says 1,000"]],
  "es-gloves-greater-exalt": [[A.glove, A.sinEx], ["高貴なオーブ", "完全より\n上級", "ES 手袋は 1 個 105 神"], ["Exalted Orb", "Greater\nbeats Perfect", "ES gloves: 105 div"]],
  "crafting-cost-variance": [[A.ring, A.divine], ["費用と運", "平均だけ\n見ない", "10 人に 1 人は平均の 2 倍"], ["Cost & luck", "Don't trust\nthe average", "1 in 10 pays 2× the average"]],
  "chaos-spam-odds": [[A.glove, A.chaos], ["カオススパム", "1 回\n0.3%", "平均 313 個"], ["Chaos spam", "0.3%\nper try", "313 orbs on average"]],
  "desecration-weights": [[A.collar, A.rib, A.jaw], ["冒涜", "重みは\n誰も知らない", "85 / 14 / 1%"], ["Desecration", "Nobody knows\nthe weights", "85 / 14 / 1%"]],
  "fracture-desecrated": [[A.cranium, A.fracture], ["フラクチャー", "冒涜は\n固定できない", "24 回打って 0 回"], ["Fracturing Orb", "Desecrated?\nCan't fix it", "0 hits in 24 tries"]],
  "quality-rounding-down": [[A.amulet, A.catDef], ["品質", "丸めは\n切り捨て", "33% は +3、34% は +4"], ["Quality", "It rounds\ndown", "33% → +3, 34% → +4"]],
  "catalysing-exaltation-multiplier": [[A.ring, A.catEx], ["お告げ", "倍率は\n誰も知らない", "既定は 1 + 0.2 × 品質"], ["Omen", "Nobody knows\nthe multiplier", "Default: 1 + 0.2 × Quality"]],
  "mana-ring-craft": [[A.ring, A.catLife], ["金の指輪", "マナの指輪\n5 つ揃え", "1 個 1,991 神・完成 64%"], ["Gold Ring", "Mana ring,\nall five", "1,991 div · 64% finish"]],
  "kolrs-hunt-gloves": [[A.glove, A.kolr], ["ルーン", "コルの狩り\nの手袋", "費用は 1.8 倍"], ["Rune", "Kolr's Hunt\ngloves", "Cost goes up 1.8×"]],
  "arcane-surge-desecrated-gloves": [[A.glove, A.collar], ["冒涜", "アーケイン\nサージ", "候補に出るのは 7.4%"], ["Desecration", "Arcane\nSurge", "Offered 7.4% of the time"]],
  "desecration-bone-sides": [[A.collar, A.rib, A.necroR], ["冒涜", "骨の左右は\n半々", "CoE に合わせて直した話"], ["Desecration", "Bones land\n50/50", "How we fixed the side rule"]],
  "desecration-lords-tag-audit": [[A.mace, A.liege, A.sovereign], ["冒涜の陣営", "93 MOD を\n直した", "poe2db に合わせた"], ["Desecration lords", "93 mods\nfixed", "Matched to poe2db"]],
  "crafting-calculator-mistakes": [[A.glove, A.artificer], ["直した話", "計算の\n3 つの間違い", "乱数・最低レベル・印"], ["Correction", "3 bugs\nwe caught", "RNG, floors, markers"]],
  "are-omens-worth-it": [[A.sinEr, A.grAnnul, A.light], ["お告げ", "お告げは\n高い？", "消去 0.44 神で足りる場面"], ["Omens", "Omens\nworth it?", "When a 0.44 div Annul is enough"]],
  "chaos-reroll-vs-restart": [[A.glove, A.chaos], ["カオスオーブ", "付け直すか\n作り直すか", "31 神と 580 神"], ["Chaos Orb", "Reroll or\nrestart?", "31 div vs 580 div"]],
  "crafting-order-cost": [[A.glove, A.chaos, A.sinEx], ["計算の試し", "順番で\n費用が変わる", "記録した順番で 58.7〜249 神"], ["Experiment", "Order\nchanges cost", "58.7 to 249 div (recorded orders)"]],
  "coe-desecrate-no-handler": [[A.glove, A.rib, A.ribA], ["冒涜", "CoE では\n計算できない", "No handler、重みも無い"], ["Desecration", "Craft of Exile\ncan't do it", "No handler, no weights"]],
  "custom-mod-weights": [[A.ring, A.dexEx], ["重み", "重みを\n自分で変える", "1000 → 200 で 5.4% が 1.1%"], ["Mod weight", "Edit the\nweights", "1000 → 200: 5.4% to 1.1%"]],
  "crafting-simulator-no-exceptions": [[A.amulet, A.liege], ["作り方", "例外を\n書かない", "説明文で動かすシミュレーター"], ["Design", "No hand-written\nexceptions", "A simulator driven by item text"]],
  "spam-simulator": [[A.ring, A.chaos, A.divine], ["シミュレーター", "スパム\nシミュレーター", "増強・カオス・高貴を 100 人ずつ"], ["Simulator", "Spam\nsimulator", "Augment, Chaos, Exalt × 100 runs"]],
  "x-share-bug": [[A.ring, A.chaos], ["お詫び", "シェアが\n壊れていた", "1,500 文字の壁"], null],
  "greater-perfect-orb-difference": [[A.grEx, A.ring, A.glove], ["オーブ", "上級と完全の\n違い", "最低モッドレベルの早見表"], ["Orbs", "Greater vs\nPerfect", "Minimum modifier levels"]],
  "desecration-bone-types": [[A.rib, A.ribA, A.collarA], ["冒涜", "骨の\n種類", "噛み切られた・保存された・古代"], ["Desecration", "Bone\ntypes", "Gnawed, Preserved, Ancient"]],
  "exaltation-omens-guide": [[A.sinEx, A.dexEx, A.grEx], ["お告げ", "高貴の\nお告げ", "左右・偉大なるの使い分け"], ["Omens", "Exaltation\nomens", "Sinistral, Dextral, Greater"]],
  "liquid-emotions-jewels": [[A.jewel, A.jewel2], ["ジュエル", "液化した\n感情", "軽蔑と獰猛の仕組み"], ["Jewel", "Liquid\nEmotions", "How Contempt and Ferocity work"]],
  "catalyst-types": [[A.ring, A.catLife, A.catDef], ["カタリスト", "カタリスト\nの種類", "どの MOD にどれが効くか"], ["Catalyst", "Catalyst\ntypes", "Which mods each one boosts"]],
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
// 絵の置き場 (中心)。光の輪 2 重の中に、1 個は真ん中・2 個は斜め・3 個は三角に。
const POS = { 1: [[880, 315]], 2: [[810, 255], [955, 380]], 3: [[880, 205], [775, 395], [990, 395]] };
const arts = (list) => list.map((src, i) => {
  const [x, y] = POS[list.length][i];
  return `<div class="glow" style="left:${x}px;top:${y}px"></div><img src="${src}" style="left:${x}px;top:${y}px">`;
}).join("");
// 題の大きさ: 一番長い行が幅 600px に収まる一番大きな大きさ (日本語 1 字 = 1em、英語 1 字 = 約 0.56em)、上限は日本語 118・英語 104
const tsize = (title, lang) => { const n = Math.max(...title.split("\n").map((l) => [...l].reduce((w, c) => w + (/[\u3000-\u9fff\uff00-\uffef]/.test(c) ? 1 : 0.56), 0))); return Math.floor(Math.min(lang === "ja" ? 118 : 104, 600 / n)); };
const page = (imgs, [chip, title, sub], lang) => `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0f1b2d;font-family:${lang === "ja" ? '"Yu Gothic UI","Meiryo","Noto Sans JP"' : '"Segoe UI","Noto Sans JP"'},sans-serif;color:#fff}
.bg{position:absolute;inset:0;background:radial-gradient(circle at 74% 50%,#1d3150 0%,#13213a 40%,#0f1b2d 72%)}
.ring{position:absolute;left:665px;top:95px;width:440px;height:440px;border-radius:50%;border:2px solid rgba(201,162,93,.40)}
.ring2{position:absolute;left:725px;top:155px;width:320px;height:320px;border-radius:50%;border:1px solid rgba(201,162,93,.25)}
.glow{position:absolute;width:190px;height:190px;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,rgba(233,201,135,.30) 0%,rgba(233,201,135,.10) 45%,rgba(233,201,135,0) 70%)}
img{position:absolute;transform:translate(-50%,-50%);filter:drop-shadow(0 8px 16px rgba(0,0,0,.6))}
.chip{position:absolute;left:62px;top:52px;padding:6px 22px;border-radius:999px;background:#c9a25d;color:#10192a;font-size:32px;font-weight:700;letter-spacing:.04em}
.ver{position:absolute;left:64px;top:124px;font-size:26px;color:#9fb3cf;letter-spacing:.03em}
.t{position:absolute;left:60px;top:172px;width:680px;font-size:${tsize(title, lang)}px;line-height:1.1;font-weight:800;white-space:pre-line;letter-spacing:-.01em}
.s{position:absolute;left:64px;top:452px;width:640px;font-size:38px;line-height:1.2;font-weight:700;color:#e9c987}
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
    if (!t) continue;
    const html = resolve(TMP, `${slug}.${lang}.html`);
    writeFileSync(html, page(imgs, t, lang));
    const out = resolve(OUT, `${slug}-og.${lang}.png`);
    execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--allow-file-access-from-files", `--user-data-dir=${prof}`, "--window-size=1200,630", `--screenshot=${out}`, `file:///${html.replace(/\\/g, "/")}`], { stdio: ["ignore", "ignore", "pipe"], timeout: 60000 });
    console.log(out);
  }
}
rmSync(TMP, { recursive: true, force: true });
