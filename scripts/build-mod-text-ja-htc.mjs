// クラフト計算機 (poe2htc) の MOD 行で、mod-text-ja.json では日本語にならない行を、クライアント原本から訳す (2026-09-26)
//
// オーナー:「MOD 辞書の英語のやつ直しといて」。0 から組む一覧に「(0-60)% reduced Poison Duration on you」のように
// 英語のまま出ていた (340 行)。表 (mod-text-ja.json) に無い言い回し (reduced 側、「on You」の大文字など) が原因。
//
// 元: data-cache/mods.en.json / mods.ja.json (build-mods-from-client.mjs の出力。同じ MOD ID で英日が対応し、数字は描画済み)。
// poe2htc の行と原本の英語を「数字を # に潰して」突き合わせ、同じ MOD ID の日本語を取る。
// 数字は値で対応を取る: poe2htc で # の所は日本語も #、poe2htc で数字が書いてある所 (「Adds # to 3」の 3 など) は日本語も数字のまま。
//
// 出力: src/i18n/mod-text-ja-htc.json (poe2htc の英語 1 行 → 日本語テンプレート)。mod-text.ts が表の次に引く。
// poe2htc (src/vendor/poe2htc/data/mods.json) か原本を更新したら `node scripts/build-mod-text-ja-htc.mjs` で作り直す。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const J = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const table = J("src/i18n/mod-text-ja.json");
const htc = J("src/vendor/poe2htc/data/mods.json").mods;
const en = J("data-cache/mods.en.json");
const ja = J("data-cache/mods.ja.json");
const NL = String.fromCharCode(10);

/** mod-text.ts の normalise と同じ (数字を # に、+ を落とす、空白を詰めて小文字) */
const norm = (t) => t.replace(/[0-9]+(\.[0-9]+)?/g, "#").replace(/[+]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const byNorm = new Map();
for (const [k, v] of Object.entries(table)) { const n = norm(k); if (!byNorm.has(n)) byNorm.set(n, v); }
const inTable = (l) => table[l] != null || byNorm.has(norm(l));

/** 原本の数字の塊: 幅 (30-20) か 1 つの数 */
const TOKEN = /\(-?[0-9]+(?:\.[0-9]+)?[-—–]-?[0-9]+(?:\.[0-9]+)?\)|-?[0-9]+(?:\.[0-9]+)?/g;
const stripMarkup = (t) => t.replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]]+)\]/g, "$1");
const tpl = (t) => t.replace(TOKEN, "#");

/** 原本の英語 1 行 (# に潰した形) → [英語の行, 日本語の行] */
const client = new Map();
for (const id of Object.keys(en)) {
  const e = en[id]?.text, j = ja[id]?.text;
  if (!e || !j) continue;
  const el = e.split(NL).map(stripMarkup), jl = j.split(NL).map(stripMarkup);
  if (el.length !== jl.length) continue;
  el.forEach((x, i) => {
    const k = norm(tpl(x));
    if (!client.has(k)) client.set(k, [x, jl[i]]);
  });
}

/** 原本で引けない物 (poe2htc の言い回しが原本と違う)。日本語はクライアントの表記に合わせる */
const EXTRA = {
  // 原本は「Bears the Mark of the Abyssal Lord」
  "Mark of the Abyssal Lord": "アビサルロードの紋章を身につけている",
  // 表の「#% increased Spirit Reservation Efficiency」と同じ物 (日本語は「スキルの…」)
  "#% increased Spirit Reservation Efficiency of Skills": "スキルのスピリットリザーブ効率が#%増加する",
  // 原本はノータブルの名前が入る「0 を割り当てる」。ゲームの語 (ノータブルパッシブスキル / を割り当てる) で組んだ
  "Allocates a random Notable Passive Skill": "ランダムなノータブルパッシブスキル を割り当てる",
};

const out = {};
const skipped = [];
for (const m of htc) {
  if (!m.text || inTable(m.text)) continue;
  for (const line of m.text.split(NL)) {
    if (inTable(line) || out[line]) continue;
    if (EXTRA[line]) { out[line] = EXTRA[line]; continue; }
    const hit = client.get(norm(line));
    if (!hit) { skipped.push(line); continue; }
    const [eLine, jLine] = hit;
    // poe2htc の行の数字の並び (# か 書かれた数字) と、原本の英語の数字の並びを揃える
    const htcTokens = line.match(/#|[0-9]+(?:\.[0-9]+)?/g) ?? [];
    const enTokens = eLine.match(TOKEN) ?? [];
    if (htcTokens.length !== enTokens.length) { skipped.push(line); continue; }
    // 書かれた数字: 原本の描画の値 → poe2htc の値 (原本は別の段の値で描かれていることがある。「連鎖 1 回」が 2 回になっていた)
    const literal = new Map();
    enTokens.forEach((t, i) => { if (htcTokens[i] !== "#") literal.set(t, htcTokens[i]); });
    const jaTokens = jLine.match(TOKEN) ?? [];
    if (jaTokens.length !== enTokens.length) { skipped.push(line); continue; }
    out[line] = jLine.replace(TOKEN, (t) => literal.get(t) ?? "#");
  }
}

const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(join(root, "src/i18n/mod-text-ja-htc.json"), JSON.stringify(sorted, null, 2) + NL);
console.log(`書き出し ${Object.keys(sorted).length} 行 / 訳せなかった ${skipped.length} 行`);
if (skipped.length) console.log([...new Set(skipped)].join(NL));
