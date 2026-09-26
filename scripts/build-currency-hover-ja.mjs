// カレンシーランキングのホバー用の日本語辞書をクライアント原本から作る (2026-09-26)
//
// オーナー:「ホバーしたときの効果だけど詳細にデータ取ってほしい。合金とか特に中身ないみたいな説明だから、
//   ちゃんとエッセンスとしての効果書いて欲しい。フルチェックしてユニークとカレンシーランキング全て」
//   「リネージュとかまったくやってないしね、しっかりやろうか」「クライアントデーター照合して英語も日本語にしてね」。
// 今までの currency-effects-ja.json は CurrencyItems.Description だけで、そこに無い物 (リネージュサポート 77 件、
// ウェイストーン、聖廟の鍵、フラグメントなど) は空、エッセンス / 合金は「ランダムなモッドを…」の一般文だけだった。
//
// 元: data-cache/client-export-currency-hover/tables/{English,Japanese}/*.json (npx pathofexile-dat、config.json 参照)
//     + data-cache/mods.ja.json (MOD の日本語文、build-mods-from-client.mjs)
// 出力: src/i18n/currency-hover-ja.json  (画面側は使う時に読み込む)。説明と一覧の行は [Tag|表示] の印を残す
//   キー: 英語名を小文字英数に潰した物 (views/currency/format.ts の normName と同じ)
//   値: { n: 日本語名, e: 説明の行, s: "1 / 最大スタック", g: [{ h: 見出し, l: 行 }] }
//     g の例: エッセンス / 合金 = 装備の種類ごとに付く MOD、フラグメント = 付くモッド、ヴェリシウム = 作れる物
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = "data-cache/client-export-currency-hover/tables";
const T = (lang, name) => JSON.parse(readFileSync(join(root, DIR, lang, `${name}.json`), "utf8"));
const NL = String.fromCharCode(10);
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const strip = (t) => (t ?? "").replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]]+)\]/g, "$1").replace(/\r/g, "");
const lines = (t) => strip(t).split(NL).map((x) => x.trim()).filter(Boolean);
/** 行に分けるが [Tag|表示] の印は残す (画面でキーワードの説明のホバーにする) */
const rich = (t) => (t ?? "").replace(/\r/g, "").split(NL).map((x) => x.trim()).filter(Boolean);

const bE = T("English", "BaseItemTypes"), bJ = T("Japanese", "BaseItemTypes");
const modsE = T("English", "Mods");
const modsJa = JSON.parse(readFileSync(join(root, "data-cache/mods.ja.json"), "utf8"));
/** Mods の行番号 → 日本語の文 (複数行) */
const modText = (k) => {
  const id = modsE[k]?.Id;
  const t = id ? modsJa[id]?.text : null;
  return t ? rich(t) : [];
};
const nameJa = (i) => bJ[i]?.Name || bE[i]?.Name || "";

/** 1 件の入れ物 (英語名のキーで) */
const out = {};
function entry(i) {
  const en = bE[i]?.Name;
  if (!en) return null;
  const k = norm(en);
  out[k] ??= { n: nameJa(i) };
  return out[k];
}
function group(i, h, l) {
  const e = entry(i);
  if (!e || !l.length) return;
  e.g ??= [];
  const g = e.g.find((x) => x.h === h);
  if (g) for (const x of l) { if (!g.l.includes(x)) g.l.push(x); }
  else e.g.push({ h, l: [...l] });
}

// ---- 1. 通貨の説明と束ね (CurrencyItems) ----
const ciE = T("English", "CurrencyItems"), ciJ = T("Japanese", "CurrencyItems");
ciE.forEach((c, r) => {
  const i = c.BaseItemType;
  const e = entry(i);
  if (!e) return;
  const d = rich(ciJ[r]?.Description);
  if (d.length) e.e = d;
  if (c.StackSize > 1) e.s = `1 / ${c.StackSize}`;
  // シャード: 何個で何になるか
  const full = c.FullStack_BaseItemType;
  if (typeof full === "number" && full !== i && c.StackSize > 1) group(i, "束ねると", [`${c.StackSize}個で「${nameJa(full)}」1個になる`]);
});

// ---- 2. エッセンス / 合金: 装備の種類ごとに付く MOD (EssenceMods) ----
const essE = T("English", "Essences");
const emE = T("English", "EssenceMods");
const tcJ = T("Japanese", "EssenceTargetItemCategories");
emE.forEach((m) => {
  const ess = essE[m.Essence];
  if (!ess) return;
  const cat = strip(tcJ[m.TargetItemCategory]?.Text) || tcJ[m.TargetItemCategory]?.Id || "装備";
  const t = modText(m.DisplayMod ?? m.Mod);
  group(ess.BaseItemType, `${cat}に付く`, t);
});

// ---- 3. リネージュサポート / サポートジェム: 説明文 (GemEffects.SupportText) ----
const sgE = T("English", "SkillGems");
const geJ = T("Japanese", "GemEffects");
const supE = T("English", "SupportGems");
const lineage = new Set(supE.filter((s) => s.IsLineage).map((s) => s.SkillGem));
sgE.forEach((g, r) => {
  if (!lineage.has(r)) return;
  const e = entry(g.BaseItemType);
  if (!e) return;
  const d = (g.GemEffects ?? []).flatMap((k) => rich(geJ[k]?.SupportText));
  if (d.length) e.e = d;
});

// ---- 4. フラグメント / 聖廟の鍵など: 付くモッド (MapFragmentMods) ----
for (const f of T("English", "MapFragmentMods")) group(f.BaseItemType, "付くモッド", (f.Mods ?? []).flatMap(modText));

// ---- 5. 装備でない物の固有モッド (タリスマン等、Implicit_Mods) ----
const currencyish = new Set(ciE.map((c) => c.BaseItemType));
bE.forEach((b, i) => {
  if (!currencyish.has(i) && !/Talisman/.test(b.Name ?? "")) return;
  group(i, "効果", (b.Implicit_Mods ?? []).flatMap(modText));
});

// ---- 6. ヴェリシウム: 作れる物 (Expedition2VerisiumCrafts) ----
// UniqueName は Words の行。種別 6 (ユニーク名) の時だけユニークになる。それ以外 (「Void」など) はベースの上位化で、変わった後のベース名を出す
const wJ = T("Japanese", "Words");
for (const v of T("English", "Expedition2VerisiumCrafts")) {
  const w = wJ[v.UniqueName];
  const uniq = w?.Wordlist === 6 ? strip(w.Text2 || w.Text) : "";
  (v.CraftingItem ?? []).forEach((ci, j) => {
    const n = v.CraftingItemCount?.[j];
    group(ci, "作れる物", [`${nameJa(v.OriginalBaseType)} → ${uniq || nameJa(v.NewBaseType)}${n ? ` (${n}個)` : ""}`]);
  });
}

// ---- 7. ウェイストーン: 開くマップのエリアレベル (MapTiers) ----
const tiers = T("English", "MapTiers");
bE.forEach((b, i) => {
  const m = (b.Name ?? "").match(/^Waystone \(Tier (\d+)\)$/);
  if (!m) return;
  const t = tiers.find((x) => x.Tier === Number(m[1]));
  const e = entry(i);
  if (e && t) e.e = [`マップデバイスで使うと、エリアレベル${t.Level}のマップを開く`];
});

writeFileSync(join(root, "src/i18n/currency-hover-ja.json"), JSON.stringify(out) + NL);
const withG = Object.values(out).filter((x) => x.g?.length).length;
console.log(`書き出し ${Object.keys(out).length} 件 (見出し付き ${withG})`);
