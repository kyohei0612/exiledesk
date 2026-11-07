#!/usr/bin/env node
/**
 * check-engine-entry.mjs — エンジンと画面の見張り (2026-10-20 に入口の見張りとして作り、2026-10-25 夜に今の決まりへ。
 * オーナー 10-25 夜「ジンはMOD変更やカレンシールール変更等の修正でやっと動く」: 画面はエンジンの関数を何でも直接呼んでよい・入口を用意しなくてよい、
 * 画面はエンジンのファイルを書き換えない・打つ / 読む / MOD の文や値を作る中身を自前で書かない (無ければジン部長に頼む))。
 * 持ち主は docs/org/owners.txt (scripts/owner-of.mjs) から引く。数えるのは src/ の .ts・.vue。
 *   B 凍結: アプリ専用の services/simulator/htc/ を、その外の Web の物 (アプリの物以外) が読む
 *   C エンジンとシミュ・エミュの置き場: エンジン (services/craft-stage のジンの物) が services/simulator・services/emulator を読む、
 *     シミュの置き場 (services/simulator/sim-engine) とエミュの置き場 (services/emulator/emu-engine) が互いを読む (2026-10-26 に engine-sim / engine-emu をエンジンから出した)
 *   D 画面の混ざり: エミュの物がシミュ・チュートリアルの物を読む、シミュ・チュートリアルの物がエミュの物を読む (2026-10-22 深夜 オーナー
 *     「コードが混ざらないように」。両方が使う画面の部品は共通 src/components へ)
 *   E 画面の中のエンジンの中身らしき物: 画面 (エミュ・シミュ・チュートリアル・デザインの持ち物、src/utils は除く) の中で
 *     MOD の段・幅を直に触る (.tiers・.ranges)・文の # を自分で埋める (replace(/#/…))・エンジンの生のデータ (vendor/poe2htc/data・services/htc/*.json・
 *     services/craft-stage/*.json・i18n/mod-text-ja) を import する・Math.random で自前の乱数を引く。見せるために読む物もあるので、今ある分は控えに持ち、
 *     増えた時だけ落とす (増えたら: その中身がエンジンに無いならジン部長に頼む。見せるだけなら控えを取り直す)
 *   F ゲームの仕様の自前 (2026-11-07 オーナー「要は、自前でゲーム仕様をいじるなってフックだろうな」「ゲームシステムはジンだけ追加修正可能って話だね。フックで」):
 *     画面の部 (エミュ・シミュ・チュートリアル・デイリー・デザインの持ち物。src/utils・sim-engine・emu-engine も入る) が、エンジンに聞かずに
 *     ① MOD の当たりを自前で比べる (modId の === / includes など、aimHits を通さない一致) ② カレンシー・お告げの鍵の文字を読む
 *     (startsWith("essence:")・kindOf(…) === "…" など、parseKey / actionClassOfKey を通さない) ③ お告げの名前を文字で書く ("Omenof…") ④ ゲームの数字を書く
 *     (段の下限 33・35・40・44・50・70、冒涜専用の 85%・14%、聖別の 0.78・1.22、紋章の × 0.4)。コメントは数えない。今ある分は控え、増えた時だけ落とす
 *   A (入口の外) は 10-25 夜にやめた (画面はエンジンの関数を直接呼んでよい)
 * 今の数をファイルごとに控え (check-engine-entry.baseline.json) に持ち、決まりごとの合計が控えより増えた時だけ落ちる (オーナー 10-20 OK)。
 * ファイルを割って移っただけの時は合計が同じなので落とさず、ファイルごとの増えは知らせだけ。減ったら `--head --write` で控えを取り直す。
 *
 *   node scripts/check-engine-entry.mjs           … 作業ツリーで数えて控えと比べる (CI は checkout = HEAD)
 *   node scripts/check-engine-entry.mjs --head    … commit 済みの HEAD の中身で数える (書きかけを入れない)
 *   node scripts/check-engine-entry.mjs --write   … 控えを取り直す (--head と一緒に使う)
 *   node scripts/check-engine-entry.mjs --list    … 違反の行を全部出す
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadOwners, ownerOf } from "./owner-of.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = resolve(ROOT, "scripts/check-engine-entry.baseline.json");
const args = new Set(process.argv.slice(2));
const head = args.has("--head");

const sh = (cmd) => execSync(cmd, { windowsHide: true, cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });
// 作業ツリーはまだ追われていない新しいファイルも数える (フック G-40 は git add の前に回るので、add && commit の新しいファイルが抜けていた。2026-11-07 ブラック 57)
const files = sh(head ? "git ls-tree -r --name-only HEAD src" : "git ls-files -co --exclude-standard src")
  .split("\n").filter((f) => /\.(ts|vue)$/.test(f) && !f.endsWith(".d.ts"));
const all = new Set(head ? sh("git ls-tree -r --name-only HEAD src").split("\n") : sh("git ls-files -co --exclude-standard src").split("\n"));
const read = (f) => (head ? sh(`git show HEAD:"${f}"`) : existsSync(resolve(ROOT, f)) ? readFileSync(resolve(ROOT, f), "utf8") : "");

/** 相対の import の先 → リポジトリの根からのパス (見つからなければ null) */
function resolveSpec(from, spec) {
  if (!spec.startsWith(".")) return null;
  const base = posix.normalize(posix.join(posix.dirname(from), spec));
  for (const c of [base, `${base}.ts`, `${base}.vue`, `${base}.js`, `${base}.json`, `${base}/index.ts`]) if (all.has(c)) return c;
  return base;
}

const rows = loadOwners();
/** D の例外: エミュの画面がチュートリアルのコースを動かす差し込み口はこの 1 ファイルだけを通す (ブラック 10-23、シミュ部長 bfe9d291) */
const D_ALLOW = new Set(["src/views/tutorial/course-entry.ts"]);
/** 画面の混ざり (D) で数えるシミュの側 (チュートリアルはシミュ部長の持ち物) */
const SIM_SIDE = new Set(["シミュ", "チュートリアル"]);
/** E で見る画面の持ち主と、エンジンの中身らしき書き方 */
const SCREEN = new Set(["エミュ", "シミュ", "チュートリアル", "デザイン"]);
const RAW_DATA = /^src\/(vendor\/poe2htc\/data\/|services\/htc\/[^/]+\.json$|services\/craft-stage\/[^/]+\.json$|i18n\/mod-text-ja)/;
const OWN_LOGIC = [
  ["段・幅を直に (.tiers・.ranges)", /\.(?:tiers|ranges)\b/g],
  ["文の # を自分で埋める", /replace\(\s*\/#\//g],
  ["自前の乱数 (Math.random)", /Math\.random\(/g],
];
/** F で見る画面の部 (ゲームの仕様を足す・直すのはジンだけ。ジンの「共通」とアプリ・解析は数えない) */
const GAME_SCREEN = new Set(["エミュ", "シミュ", "チュートリアル", "デザイン", "デイリー"]);
/** カレンシー・お告げの鍵の頭 (price-keys.json の鍵・手順の鍵 key.ts の SET_PREFIX ほか) */
const KEY_HEAD = "essence:|reveal|desecrate|catalyst_|jcatalyst_|emotion:|rune:|spam|qset:|cqset:|qcap:|ilvl:|iset:|sset:|transmute|augment|regal|alchemy|exalt|chaos|annul|divine|fracture|artificer|hinekora|jeweller|vaal|flux_|Omen|_greater|_perfect";
const GAME_RULE = [
  ["① MOD の当たりを自前で比べる (aimHits を通さない modId の一致)", /\bmodId\s*[!=]==?|[!=]==?\s*[\w$.?![\]]*\bmodId\b|\.(?:includes|has|indexOf)\(\s*[\w$.?!]*\bmodId\s*\)/g],
  ["② 鍵の文字を読む (parseKey / actionClassOfKey を通さない)", new RegExp(String.raw`\.(?:startsWith|endsWith|includes)\(\s*["'` + "`" + String.raw`](?:${KEY_HEAD})|\bkindOf\([^)]*\)\s*[!=]==?\s*["'` + "`" + String.raw`]|[!=]==?\s*kindOf\(`, "g")],
  ["③ お告げの名前を文字で書く (OMEN_KEY・omenFor を通さない)", /["'`]Omen[oO]f\w+/g],
  ["④ ゲームの数字を書く (段の下限・冒涜専用の割合・聖別の幅・紋章の 0.4)", /(?:MOD ?レベル|mod level|[Ff][Ll][Oo][Oo][Rr]\w*|greater|perfect)\D{0,6}\b(?:33|35|40|44|50|70)\b|\b(?:85|14) ?%|\b0\.78\b|\b1\.22\b|(?:×|\*)\s*0\.4\b/g],
];
/** コメントを消す (F はコメントの説明を数えない)。文字列の中の // (URL など、: や引用符の直後) は残す */
const stripComments = (t) => t.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const CS = "src/services/craft-stage/";
/** シミュだけ・エミュだけの、エンジンを使う置き場 (2026-10-26 にエンジンから出した、オーナー「全部それシミュに渡して削除してくれ」) */
const SIM_ENGINE = ["src/services/simulator/sim-engine.ts", "src/services/simulator/sim-engine/", "src/services/simulator/paste/"];
const EMU_ENGINE = ["src/services/emulator/emu-engine.ts", "src/services/emulator/emu-engine/"];
const under = (path, list) => list.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p));
/** C で見る側: エンジン (core = craft-stage のジンの物)・シミュの置き場 (sim)・エミュの置き場 (emu)。画面は 10-25 夜から何を読んでもよい */
function sideOfEngine(path, who) {
  if (under(path, SIM_ENGINE)) return "sim";
  if (under(path, EMU_ENGINE)) return "emu";
  if (who === "ジン" && path.startsWith(CS)) return "core";
  return null;
}
/** 読んではいけない向き (読む側 → 読まれる側)。エンジンはシミュ・エミュの物を読まない、シミュの置き場とエミュの置き場は互いを読まない */
function crosses(a, b, t) {
  // エンジンはシミュ・エミュの置き場と、画面の置き場 (部品・画面・状態) を読まない (10-26 に貼り付けの読みをシミュへ、絵の材料をデザインの src/components/art へ移した)
  if (a === "core" && (b === "sim" || b === "emu" || /^src\/(services\/simulator|services\/emulator|components|views|state)\//.test(t))) return true;
  if (a === "sim" && b === "emu") return true;
  if (a === "emu" && b === "sim") return true;
  return false;
}
const IMPORT_RE = /(?:^|[\s;])(?:import|export)\s[^"'`;]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|^\s*import\s*["']([^"']+)["']/gm;

const hits = []; // { rule, file, target }
for (const f of files) {
  const who = ownerOf(f, rows);
  const text = read(f);
  // シミュ・エミュの置き場 (sim-engine・emu-engine) はエンジンを使うために決めた場所なので E で数えない
  const screen = SCREEN.has(who) && !f.startsWith("src/utils/") && !under(f, SIM_ENGINE) && !under(f, EMU_ENGINE);
  for (const m of text.matchAll(IMPORT_RE)) {
    const t = resolveSpec(f, m[1] ?? m[2] ?? m[3]);
    if (!t) continue;
    const tw = ownerOf(t, rows);
    if (sideOfEngine(f, who) && crosses(sideOfEngine(f, who), sideOfEngine(t, tw), t)) hits.push({ rule: "C", file: f, target: t });
    if (((who === "エミュ" && SIM_SIDE.has(tw)) || (SIM_SIDE.has(who) && tw === "エミュ")) && !D_ALLOW.has(t)) hits.push({ rule: "D", file: f, target: t });
    if (t.startsWith("src/services/simulator/htc/") && !f.startsWith("src/services/simulator/htc/") && who !== "アプリ") hits.push({ rule: "B", file: f, target: t });
    if (screen && RAW_DATA.test(t)) hits.push({ rule: "E", file: f, target: `生のデータ ${t}` });
  }
  if (screen) for (const [what, re] of OWN_LOGIC) for (const _ of text.matchAll(re)) hits.push({ rule: "E", file: f, target: what });
  if (GAME_SCREEN.has(who)) {
    const code = stripComments(text);
    for (const [what, re] of GAME_RULE) for (const m of code.matchAll(re)) hits.push({ rule: "F", file: f, target: `${what}: ${m[0].trim()}` });
  }
}

const RULES = ["B", "C", "D", "E", "F"];
const count = {};
for (const h of hits) count[`${h.rule} ${h.file}`] = (count[`${h.rule} ${h.file}`] ?? 0) + 1;
const total = (r) => hits.filter((h) => h.rule === r).length;
const filesOf = (r) => new Set(hits.filter((h) => h.rule === r).map((h) => h.file)).size;
console.log(`見張り: B 凍結の htc/ ${total("B")} 行・C エンジン ⇄ シミュ・エミュの置き場 ${total("C")} 行・D エミュ ⇄ シミュ ${total("D")} 行・E 画面の中のエンジンらしき物 ${total("E")} か所 (${filesOf("E")} ファイル)・F ゲームの仕様の自前 ${total("F")} か所 (${filesOf("F")} ファイル) (${head ? "HEAD" : "作業ツリー"})`);
if (args.has("--list")) for (const h of hits) console.log(`${h.rule}\t${h.file}\t→ ${h.target}`);

if (args.has("--write")) {
  writeFileSync(BASE, JSON.stringify(Object.fromEntries(Object.entries(count).sort()), null, 1) + "\n");
  console.log(`控えを書いた: ${BASE}`);
  process.exit(0);
}
// 控えの A (入口の外、10-25 夜にやめた) は見ない
const base = Object.fromEntries(Object.entries(existsSync(BASE) ? JSON.parse(readFileSync(BASE, "utf8")) : {}).filter(([k]) => RULES.includes(k[0])));
const worse = Object.entries(count).filter(([k, n]) => n > (base[k] ?? 0));
const better = Object.entries(base).filter(([k, n]) => (count[k] ?? 0) < n);
const sumOf = (o, r) => Object.entries(o).filter(([k]) => k.startsWith(`${r} `)).reduce((a, [, n]) => a + n, 0);
const over = RULES.filter((r) => sumOf(count, r) > sumOf(base, r));
const WHY = {
  B: "アプリ専用の services/simulator/htc/ は Web から読まない",
  C: "エンジン (craft-stage) はシミュ・エミュの物を読まない、sim-engine と emu-engine は互いを読まない",
  D: "エミュとシミュは互いの物を読まない。両方で使う部品は共通 src/components へ",
  E: "打つ・読む・MOD の文や値を作る中身は画面に書かず、エンジンの関数を呼ぶ (無ければジン部長に頼む)。見せるために読むだけなら --head --write で控えを取り直す",
  F: "ゲームの仕様はジンだけ。エンジンの関数を呼ぶか、無ければジンに頼む (G-40、オーナー 11-07「ゲームシステムはジンだけ追加修正可能」)",
};
// F はファイルごとに増えたら止める (ほかで減った分で増えが隠れないように。合計で見ると、寄せで減った後の新しい自前を通していた。2026-11-07 ブラック 57)。
// ファイルを割って移しただけの時は --head --write で控えを取り直す
const grew = (k) => over.includes(k[0]) || k[0] === "F";
// 止める行 (フック G-40 はファイル名の入った「増えた:」の行だけを見せる) に訳を付ける。何が増えたかは --list で
for (const [k, n] of worse) console.log(`${grew(k) ? "増えた" : "移った? (合計は増えていない)"}: ${k} … ${base[k] ?? 0} → ${n}${grew(k) ? ` (${WHY[k[0]]})` : ""}`);
for (const r of over) console.log(`増えた: ${r} の合計 ${sumOf(base, r)} → ${sumOf(count, r)} (${WHY[r]})`);
if (better.length) console.log(`減った ${better.length} ファイル: 良い。\`node scripts/check-engine-entry.mjs --head --write\` で控えを取り直す`);
if (over.length || worse.some(([k]) => k[0] === "F")) process.exit(1);
console.log("増えた所なし");
