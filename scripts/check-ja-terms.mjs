#!/usr/bin/env node
/**
 * check-ja-terms.mjs — 画面に出す日本語がゲーム公式の言い回しか見る (2026-09-22)
 *
 * オーナー指示:「そのルールブック、クライアントの日本語とずれてるところあるね。辞書引き直して
 * 全部正しい日本語に直さんと直訳のままいくぞ」。
 *
 * ## 何を見るか
 *   1. **禁止語** … 直訳と分かっている言い回し。公式の語に直させる (ここが落ちる = 直訳が混ざった)
 *   2. **生成物の突き合わせ** … price-keys / catalysts の ja が、いま手元のクライアント辞書と一致するか
 *   3. **見慣れない語** (参考) … クライアントの日本語コーパスに 1 度も出てこない語。
 *      うちの言い回し (「出品」「取引所」) も混ざるので**落としません**。増えたら目で見る用。
 *
 * ## 分かったこと (2026-09-22 の初回)
 *   接頭辞 / 接尾辞 → **プレフィックス / サフィックス**。ゲームのお告げ文面が
 *   「次に使用する消去のオーブはサフィックスモッドをのみを取り除く」なので公式はカタカナ。
 *   触媒 → **カタリスト**。ただし「触媒の高貴のお告げ」(Omen of Catalysing Exaltation) は
 *   公式にこの字なので、そこだけは触らない。
 *
 *   node scripts/check-ja-terms.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
const fail = (m) => { console.log(`   NG: ${m}`); failed++; };

/** 直訳と分かっている言い回し。`allow` に入る文脈だけは見逃す */
const BANNED = [
  { bad: "接頭辞", good: "プレフィックス", why: "ゲームのお告げ文面が「プレフィックスモッド」" },
  { bad: "接尾辞", good: "サフィックス", why: "ゲームのお告げ文面が「サフィックスモッド」" },
  { bad: "触媒", good: "カタリスト", why: "アイテムは「肉体のカタリスト」等", allow: ["触媒の高貴のお告げ"] },
];

/** 走査するディレクトリ (画面に出る物だけ。i18n の辞書そのものは対象外) */
const DIRS = ["src/services", "src/views", "src/components", "src/state"];
const files = [];
const walk = (d) => {
  let entries;
  try { entries = readdirSync(d); } catch { return; }
  for (const f of entries) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|vue)$/.test(p)) files.push(p);
  }
};
for (const d of DIRS) walk(join(ROOT, d));
const rel = (f) => f.slice(ROOT.length + 1).split(String.fromCharCode(92)).join("/");

// ---- 1. 禁止語 ----
console.log(`禁止語 (走査 ${files.length} ファイル):`);
for (const b of BANNED) {
  const hits = [];
  for (const f of files) {
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      if (!line.includes(b.bad)) return;
      if ((b.allow ?? []).some((a) => line.includes(a))) return;
      hits.push(`${rel(f)}:${i + 1}`);
    });
  }
  console.log(`  ${hits.length === 0 ? "○" : "×"} ${b.bad} → ${b.good}  (${b.why})`);
  for (const h of hits) fail(`${h} に「${b.bad}」(「${b.good}」のはず)`);
}

// ---- 2. 生成物がクライアント辞書と合っているか ----
const cl = JSON.parse(readFileSync(join(ROOT, "src/i18n/items-ja-client.json"), "utf8"));
const ja2 = JSON.parse(readFileSync(join(ROOT, "src/i18n/items-ja.json"), "utf8"));
const look = (en) => cl[en] ?? ja2[en] ?? null;
console.log("\n生成物とクライアント辞書:");
const pk = JSON.parse(readFileSync(join(ROOT, "src/services/htc/price-keys.json"), "utf8"));
let checked = 0, missing = 0;
for (const sec of ["currency", "bones", "omens"]) {
  for (const [k, v] of Object.entries(pk[sec] ?? {})) {
    const c = look(v.en);
    if (c == null) { missing++; continue; }
    checked++;
    if (c !== v.ja) fail(`price-keys ${sec}.${k}: 「${v.ja}」 (クライアントは「${c}」)`);
  }
}
console.log(`  price-keys  ${checked} 件を突き合わせ (辞書に無い ${missing} 件は飛ばした)`);
const cat = JSON.parse(readFileSync(join(ROOT, "src/services/htc/catalysts.json"), "utf8"));
let cc = 0;
for (const c of cat.catalysts ?? []) {
  const j = look(c.en);
  if (j == null) continue;
  cc++;
  if (j !== c.ja) fail(`catalysts ${c.en}: 「${c.ja}」 (クライアントは「${j}」)`);
}
console.log(`  catalysts   ${cc} 件を突き合わせ`);

// ---- 3. 見慣れない語 (参考、落とさない) ----
const CORPUS = [
  "items-ja-client.json", "items-ja.json", "items-ja-poe2db.json", "mod-text-ja.json",
  "mod-text-ja-manual.json", "currency-effects-ja.json", "poe2-flavour-ja.json",
  "gems-client.json", "skills-ja-client.json", "base-item-classes.json",
].map((f) => { try { return readFileSync(join(ROOT, "src/i18n", f), "utf8"); } catch { return ""; } }).join("|");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");
const seen = new Map();
for (const f of files) {
  strip(readFileSync(f, "utf8")).split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/["'`]([^"'`]*[ぁ-んァ-ヶ一-龠][^"'`]*)["'`]/g)) {
      for (const w of m[1].matchAll(/[一-龠]{2,}|[ァ-ヶー]{3,}/g)) {
        if (!seen.has(w[0])) seen.set(w[0], `${rel(f)}:${i + 1}`);
      }
    }
  });
}
const unknown = [...seen].filter(([w]) => !CORPUS.includes(w));
console.log(`\n参考: クライアントの日本語に出てこない語 ${unknown.length} / ${seen.size} 種`);
console.log("  (うちの言い回しも混ざるので落としません。ゲーム用語が混ざっていないか目で見る用)");

console.log(failed ? `\nNG: ${failed} 件` : "\n全部 OK");
process.exit(failed ? 1 : 0);
