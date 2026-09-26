// ユニーク装備価格推移のホバー用の日本語辞書をクライアント原本から作る (2026-09-26)
//
// オーナー:「英語混在してて分かりづらい。クライアントのデータベースにのっとって日本語に全て訳して」
//          「武器なのか防具なのか、アミュレットなのかセプターなのかも詳細ホバーに」。
// 元 (どれもインストール済みのクライアントから pathofexile-dat で書き出した物):
//   - data-cache/mods.en.json / mods.ja.json (build-mods-from-client.mjs。同じ MOD ID で英日が対応、数字は描画済み)
//   - data-cache/client-export-uniques/tables/{English,Japanese}/UniqueMagesLegacy.json (メイジの遺産の名前)
//   - 同 BaseItemTypes.json / ItemClasses.json (ベース名 → 種類)
// 出力: src/i18n/unique-hover-ja.json
//   mods:    英語の型 (数字を # に潰して小文字) → { t: 日本語 ({0} {1} は英語の数字の何番目か), n: 数字の数 }
//   classes: ベースの英語名 → 種類の日本語 (「セプター」「アミュレット」)
// 作り直し: `node scripts/build-unique-hover-ja.mjs` (クライアント更新後は先に pnpm build:dicts:client と
//           data-cache/client-export-uniques で npx pathofexile-dat)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeCsd, parseStatDescriptions } from "./parse-stat-descriptions.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const J = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const NL = String.fromCharCode(10);

/** [Tag|表示] の印の外だけに fn を当てる (印の中の Tag 名の数字を置き換えないため) */
const outsideMarkup = (t, fn) => t.split(/(\[[^\]]+\])/).map((seg) => (seg.startsWith("[") ? seg : fn(seg))).join("");
const stripMarkup = (t) => t.replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]]+)\]/g, "$1");
/** 数字の塊 (幅 (a-b) か 1 つの数) */
// 「-(13-8)%」のようにマイナスの付いた幅もまとめて 1 つ (画面側の KEY_TOKEN と同じ)
const TOKEN = /-?\(-?[0-9]+(?:\.[0-9]+)?[-—–]-?[0-9]+(?:\.[0-9]+)?\)|-?[0-9]+(?:\.[0-9]+)?/g;
/** 画面側 (unique-mod-ja.ts) と同じ鍵: 数字を # に、+ を落とし、空白を詰めて小文字 */
const key = (t) => t.replace(TOKEN, "#").replace(/[+]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

// ---- MOD 文 ----
const en = J("data-cache/mods.en.json");
const ja = J("data-cache/mods.ja.json");
const mods = {};
let skipped = 0;
function add(eLine, jLine) {
  const k = key(eLine);
  if (!k || mods[k]) return;
  const eTok = eLine.match(TOKEN) ?? [];
  const jTok = stripMarkup(jLine).match(TOKEN) ?? [];
  if (jTok.length < eTok.length) { skipped++; return; }
  // 日本語の数字が英語の何番目か (語順が入れ替わる文がある) を値で対応させる。同じ値は前から順に使う。
  // 日本語にだけある数字 (「フレンジーチャージ1個ごとに」の 1) はそのまま残す
  const same = (a, b) => a.replace(/[—–]/g, "-") === b.replace(/[—–]/g, "-");
  const used = new Set();
  const t = outsideMarkup(jLine, (seg) => seg.replace(TOKEN, (tok) => {
    const at = eTok.findIndex((e, j) => !used.has(j) && same(e, tok));
    if (at < 0) return tok;
    used.add(at);
    return `{${at}}`;
  }));
  if (used.size !== eTok.length) { skipped++; return; }
  mods[k] = eTok.length ? { t, n: eTok.length } : { t };
}
// ユニーク (と コラプト) を先に入れ、ほかの区分 (タブレットの MOD などは prefix / suffix) は後から空いている所だけ
const isUniqueLike = (id) => ["unique", "corrupted"].includes(en[id]?.generation_type);
const ids = Object.keys(en).sort((a, b) => Number(isUniqueLike(b)) - Number(isUniqueLike(a)));
for (const id of ids) {
  const e = en[id]?.text, j = ja[id]?.text;
  if (!e || !j) continue;
  // 日本語は [Tag|表示] の印を残す (画面でキーワードの説明のホバーにする。オーナー 2026-09-26「詳細の詳細みれるように」)
  const el = e.split(NL).map(stripMarkup), jl = j.split(NL);
  // 英語は 2 行・日本語は 1 行の文がある (折り返しの違い)。英語を繋いで 1 行として入れる
  if (el.length !== jl.length) {
    if (jl.length === 1) add(el.join(" "), jl[0]);
    else skipped++;
    continue;
  }
  el.forEach((x, i) => add(x, jl[i]));
}
// メイジの遺産: 原本は「Legacy of (1-14)」(番号 → 名前は UniqueMagesLegacy)
const mlE = J("data-cache/client-export-uniques/tables/English/UniqueMagesLegacy.json");
const mlJ = J("data-cache/client-export-uniques/tables/Japanese/UniqueMagesLegacy.json");
mlE.forEach((r, i) => {
  const name = stripMarkup(r.DisplayText ?? r.Name ?? "");
  const nameJa = mlJ[i]?.DisplayText ?? "";
  if (name && nameJa) mods[key(`Legacy of ${name}`)] = { t: `${nameJa}の遺産` };
});

// ---- ゲームの全 MOD 文の定義 (stat_descriptions.csd) ----
// ユニーク MOD の表に無い言い回し (「Spell Physical Damage」など) を埋める。英日の行は同じ並び (条件の順) で対応する。
// プレースホルダ {0} {1:+d} {} は stat の番号。英語に出てくる順 = 画面の英語の数字の順なので、日本語側は英語の何番目かに直す
let csdAdded = 0;
{
  // 本体 + マップ / アトラス / タブレット / 上級 MOD の定義 (「Map also counts as …」などはマップ側にしか無い)
  const files = [
    "data-cache/client-export/files/Data@StatDescriptions@stat_descriptions.csd",
    ...["map", "atlas", "tablet", "advanced_mod"].map((n) => `data-cache/client-export-mapdesc/files/Data@StatDescriptions@${n}_stat_descriptions.csd`),
  ];
  const descriptors = files.flatMap((f) => parseStatDescriptions(decodeCsd(readFileSync(join(root, f)))).descriptors);
  const PH = /\{(\d*)(?::([^}]*))?\}/g;
  /** 行の中のプレースホルダの stat 番号を出てくる順に ({} は出てきた順に 0, 1, …) */
  const order = (text) => { let bare = 0; return [...text.matchAll(PH)].map((m) => (m[1] === "" ? bare++ : Number(m[1]))); };
  for (const d of descriptors) {
    const E = d.langs?.English, Jp = d.langs?.Japanese;
    if (!E || !Jp || E.length !== Jp.length) continue;
    E.forEach((el, li) => {
      const jl = Jp[li];
      const eParts = el.text.split(NL), jParts = jl.text.split(NL);
      if (eParts.length !== jParts.length) return;
      eParts.forEach((eText, pi) => {
        const eOrd = order(eText);
        const k = key(stripMarkup(eText).replace(PH, "#"));
        if (!k || mods[k]) return;
        let bare = 0;
        let ok = true;
        const t = jParts[pi].replace(PH, (_m, idx, spec) => {
          const stat = idx === "" ? bare++ : Number(idx);
          const pos = eOrd.indexOf(stat);
          if (pos < 0) { ok = false; return "#"; }
          return `${spec && spec.includes("+") ? "+" : ""}{${pos}}`;
        });
        if (!ok) return;
        mods[k] = eOrd.length ? { t, n: eOrd.length } : { t };
        csdAdded++;
      });
    });
  }
}

// ---- ベース名 → 種類 ----
const bE = J("data-cache/client-export-uniques/tables/English/BaseItemTypes.json");
const cJ = J("data-cache/client-export-uniques/tables/Japanese/ItemClasses.json");
const classes = {};
for (const b of bE) {
  const cls = typeof b.ItemClass === "number" ? cJ[b.ItemClass]?.Name : null;
  if (b.Name && cls && !classes[b.Name]) classes[b.Name] = cls;
}

// ---- パッシブの名前 (「Passives in Radius of Avatar of Fire …」の名前の所) ----
const pE = J("data-cache/client-export/tables/English/PassiveSkills.json");
const pJ = J("data-cache/client-export/tables/Japanese/PassiveSkills.json");
const passives = {};
pE.forEach((r, i) => {
  const n = r.Name, nj = pJ[i]?.Name;
  if (n && nj && n !== nj && !passives[n]) passives[n] = nj;
});

// ---- スキル名 (「+1 to Level of all Skeletal Brute Skills」の名前。表は「Skeletal Brute Minion」の形なので Minion を外した名前も) ----
const sE = J("data-cache/client-export/tables/English/ActiveSkills.json");
const sJ = J("data-cache/client-export/tables/Japanese/ActiveSkills.json");
const skills = {};
sE.forEach((r, i) => {
  const n = r.DisplayedName, nj = sJ[i]?.DisplayedName;
  if (!n || !nj || n === nj) return;
  if (!skills[n]) skills[n] = nj;
  const bare = n.replace(/ Minion$/, "");
  if (bare !== n && !skills[bare]) skills[bare] = nj.replace(/ミニオン$/, "");
});

writeFileSync(join(root, "src/i18n/unique-hover-ja.json"), JSON.stringify({ mods, classes, passives, skills }) + NL);
console.log(`MOD ${Object.keys(mods).length} (うち定義ファイルから ${csdAdded}) / 種類 ${Object.keys(classes).length} / パッシブ ${Object.keys(passives).length} / スキル ${Object.keys(skills).length} / 飛ばした ${skipped}`);
