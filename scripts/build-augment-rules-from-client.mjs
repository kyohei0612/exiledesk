#!/usr/bin/env node
/**
 * build-augment-rules-from-client.mjs — オーグメント (ルーン / ソウルコア / アイドル / アビサルアイ / 凝固した霧) を
 * 「はめる・置き換える・取り外す」決まりの表 (2026-10-03)
 *
 * オーナー 2026-10-03「ルーン関係まだ手を入れてなかった。ソケットバウンド系と普通のルーンを確認しよう。
 *   アストリッドとか、ソケットバウンドじゃないのに付け替えできないとかある。チェック」。
 * 今までクラフトステージは「はめたら外せない・置き換えの手は無い」を全部に当てていた (stage-runes.ts)。
 * 決まりは 1 つ 1 つのオーグメントの**説明文**に書いてあるので、それを機械的に読んで表にする (推測で埋めない)。
 *
 *   node scripts/build-augment-rules-from-client.mjs [--export]
 *     --export: 手元のクライアントから表を書き出し直す (data-cache/client-export-augment-rules)。
 *               pathofexile-dat は表の形 (schema) を GitHub から取りに行くので、取りに行かずに手元の
 *               data-cache/client-export/schema.min.json を渡す (外には何も取りに行かない)
 *
 * 説明文の出どころ (ゲームの表示と同じ順に、最初にあった物):
 *   1. CurrencyItems.Description (アイテムごとの説明。ほとんどの特別なルーン・ソウルコア・アイドル)
 *   2. SoulCores.Description → ClientStrings2 (アビサルアイ等。例 ItemDescriptionAbyssGazeSocketable)
 *   3. ClientStrings.ItemDescriptionSoulCore (説明の無い物の既定文。普通のルーン「砂漠のルーン」など。
 *      「武器または防具の空のオーグメントソケットにはめることで効果を適用する。一度ソケットすると取り外すことはできないが、
 *       他のオーグメントアイテムで置き換えることができる」)
 *
 * 読む文の型 (これ以外の形は unexpected に出して、値は null のまま):
 *   - 置き方:   「<部位>の空の(空いている)オーグメントソケットに …」 → slots (部位の言葉。「いずれかの装備品」「装備品」 = 全部)
 *               部位の頭の「レアの」はレアリティの条件 (rarity: "rare")
 *   - 外し方:   「取り外すことも置き換えることもできない」                  → removable false / replaceable false (= ソケットバウンド)
 *               「取り外すことはできないが、他のオーグメントアイテムで置き換えることは(が)できる」 → removable false / replaceable true
 *               (アビサルアイは「取り出すことはできませんが … 置き換えることはできます」)
 *   - 照合:     SoulCores.IsSocketBound と「ソケットバウンド = 外せず置き換えもできない」が合わない物は unexpected
 * 置き換えた時の元のオーグメント (replacedGoes): 説明文は「取り外すことはできない (英語 cannot be retrieved) が置き換えられる」
 *   なので、置き換えで外れた物は手元に戻らない = "destroyed"。戻る経路は抽出のオーブ (装備を壊して、ソケットバウンドでない物を取り戻す)
 *   だけ (CurrencyItems の抽出のオーブの説明文)
 * 1 つのアイテムにはめられる数 (limit): SoulCores.Limit → SoulCoreLimits (Limit = 数、Text = 種類の言葉。
 *   「古代のオーグメント」「アルダーの遺産」は種類でまとめて数える。Text が空の GenericLimit は同じ物を数える)
 *
 * 出力: src/i18n/augment-rules.json
 *   { generated, source, rules: { <英語名>: { ja, type, removable, replaceable, bound, slots, rarity, limit, corruptOk,
 *     replacedGoes, text, textFrom, extra } }, unexpected: [{ en, ja, why, text }] }
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPORT_DIR = resolve(ROOT, "data-cache/client-export-augment-rules");
const SCHEMA = resolve(ROOT, "data-cache/client-export/schema.min.json");
const OUT = resolve(ROOT, "src/i18n/augment-rules.json");

/** 書き出す表 (列は使う物だけ) */
const CONFIG = {
  steam: "C:/Program Files (x86)/Steam/steamapps/common/Path of Exile 2",
  translations: ["English", "Japanese"],
  tables: [
    { name: "SoulCores", columns: ["BaseItemType", "Limit", "Description", "Type", "IsSocketBound", "ExtraDescription", "CanSocketInCorruptedSanctified"] },
    { name: "SoulCoreLimits", columns: ["Id", "Limit", "Text"] },
    { name: "SoulCoreTypes", columns: ["Id", "Name"] },
    { name: "ClientStrings2", columns: ["Id", "Text"] },
    { name: "ClientStrings", columns: ["Id", "Text"] },
    { name: "CurrencyItems", columns: ["BaseItemType", "Description"] },
    { name: "BaseItemTypes", columns: ["Id", "Name"] },
  ],
};

function exportTables() {
  mkdirSync(EXPORT_DIR, { recursive: true });
  writeFileSync(resolve(EXPORT_DIR, "config.json"), JSON.stringify(CONFIG, null, 2) + "\n");
  // 表の形は手元の schema.min.json を返す (pathofexile-dat は fetch(SCHEMA_URL) で取りに行く作りなので、fetch を差し替える)
  const hook = resolve(EXPORT_DIR, "local-schema.mjs");
  writeFileSync(hook, [
    `import { readFileSync } from "node:fs";`,
    `const orig = globalThis.fetch;`,
    `globalThis.fetch = async (u, ...a) => String(u).endsWith("schema.min.json") ? new Response(readFileSync(${JSON.stringify(SCHEMA)})) : orig(u, ...a);`,
  ].join("\n") + "\n");
  const cli = resolve(ROOT, "node_modules/pathofexile-dat/dist/cli/run.js");
  const r = spawnSync(process.execPath, ["--import", pathToFileURL(hook).href, cli], { cwd: EXPORT_DIR, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`pathofexile-dat exited with ${r.status}`);
}

const rows = (j) => (Array.isArray(j) ? j : j.rows || Object.values(j));
const T = (lang, name) => rows(JSON.parse(readFileSync(resolve(EXPORT_DIR, "tables", lang, `${name}.json`), "utf8")));
/** [Tag|表示] → 表示、[Tag] → Tag、改行は消して 1 つの文に */
const strip = (s) => String(s ?? "").replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2").replace(/\[([^|\]]+)\]/g, "$1").replace(/\r?\n/g, "").trim();

/**
 * 部位の言葉 (説明文に出てくる物)。画面側の部位 (計算機の category) への対応は src/services/craft-stage/augment-rules.ts。
 * ここに無い言葉が出たら unexpected に出す
 */
const KNOWN_SLOTS = new Set([
  "装備品", "武器", "防具", "マーシャル武器", "キャスター武器", "両手武器", "遠距離武器",
  "メイス", "片手メイス", "両手メイス", "クォータースタッフ", "スピア", "弓", "クロスボウ", "タリスマン",
  "ワンド", "スタッフ", "セプター", "フォーカス", "盾", "バックラー", "鎧", "兜", "手袋", "靴",
]);

/** 外し方の文の型 (どれか 1 つだけに当たる物を採る) */
const REMOVAL_RULES = [
  { id: "bound", re: /(取り外す|取り出す|取り除く)ことも置き換えることもでき(ない|ません)/, removable: false, replaceable: false },
  { id: "replace-only", re: /(取り外す|取り出す|取り除く)ことはでき(ない|ません)が、他のオーグメントアイテムで置き換えること[はが]でき(る|ます)/, removable: false, replaceable: true },
];

/** 置き方の文: 「<部位>の空のオーグメントソケットに」「<部位>の空いているオーグメントソケットに」 */
const PLACE_RE = /^(.+?)の空(?:の|いている)オーグメントソケットに/;

function parseSlots(head) {
  let rarity = null;
  let h = head.replace(/^いずれかの/, "");
  const rm = /^(レア)の(.+)$/.exec(h);
  if (rm) { rarity = "rare"; h = rm[2]; }
  const labels = h.split(/、|または/).map((x) => x.trim()).filter(Boolean);
  const unknown = labels.filter((l) => !KNOWN_SLOTS.has(l));
  if (unknown.length) return { error: `部位の言葉が分からない: ${unknown.join(" / ")}` };
  // 「装備品」 = どの装備にも (slots は null = 部位の制限なし)
  return { slots: labels.includes("装備品") ? null : labels, rarity };
}

function main() {
  if (process.argv.includes("--export")) exportTables();
  const cores = T("English", "SoulCores");
  const bEn = T("English", "BaseItemTypes");
  const bJa = T("Japanese", "BaseItemTypes");
  const ciJa = T("Japanese", "CurrencyItems");
  const cs2Ja = T("Japanese", "ClientStrings2");
  const csJa = T("Japanese", "ClientStrings");
  const limits = T("Japanese", "SoulCoreLimits");
  const types = T("English", "SoulCoreTypes");
  const DEFAULT = csJa.find((r) => r.Id === "ItemDescriptionSoulCore")?.Text;
  if (!DEFAULT) throw new Error("ClientStrings.ItemDescriptionSoulCore が無い");
  const descByBase = new Map();
  for (const r of ciJa) if (r.Description && !descByBase.has(r.BaseItemType)) descByBase.set(r.BaseItemType, r.Description);

  const rules = {};
  const unexpected = [];
  for (const c of cores) {
    const en = bEn[c.BaseItemType]?.Name?.trim();
    if (!en || en in rules) continue;
    const ja = bJa[c.BaseItemType]?.Name?.trim() || en;
    const own = descByBase.get(c.BaseItemType);
    const soul = c.Description != null ? cs2Ja[c.Description]?.Text : null;
    const textFrom = own ? "CurrencyItems" : soul ? `ClientStrings2.${cs2Ja[c.Description].Id}` : "ClientStrings.ItemDescriptionSoulCore";
    const text = strip(own || soul || DEFAULT);
    const why = [];

    // 外し方
    const hits = REMOVAL_RULES.filter((r) => r.re.test(text));
    let removable = null, replaceable = null;
    if (hits.length === 1) ({ removable, replaceable } = hits[0]);
    else why.push(hits.length ? "外し方の文が 2 つの型に当たる" : "外し方の文の型が分からない");

    // 置き方
    let slots = null, rarity = null, slotsKnown = false;
    const pm = PLACE_RE.exec(text);
    if (!pm) why.push("置き方の文の型が分からない (「<部位>の空のオーグメントソケットに」が無い)");
    else {
      const p = parseSlots(pm[1]);
      if (p.error) why.push(p.error);
      else { slots = p.slots; rarity = p.rarity; slotsKnown = true; }
    }

    // 置き方・外し方以外の文 (効き目の決まり。「そのユニークを破壊し…」「モッドを変化させる…」)
    const extra = text.split("。").map((s) => s.trim()).filter(Boolean)
      .filter((s) => !PLACE_RE.test(s) && !REMOVAL_RULES.some((r) => r.re.test(s)));
    // 置き方の文の後ろに効き目が続く物 (「…ソケットにはめて、アイテムに効果を適用する」は普通の言い回しなので extra に入れない)
    const extraClean = extra.filter((s) => !/^(アイテムに効果を適用する|その効果をそのアイテムに適用する)$/.test(s));

    const bound = removable === false && replaceable === false;
    if (removable != null && !!c.IsSocketBound !== bound) why.push(`IsSocketBound (${!!c.IsSocketBound}) と説明文 (ソケットバウンド ${bound}) が合わない`);

    const lim = c.Limit != null ? limits[c.Limit] : null;
    rules[en] = {
      ja,
      type: types[c.Type]?.Id ?? null,
      removable,
      replaceable,
      bound: removable == null ? null : bound,
      /** 部位の言葉 (null = どの装備にも)。slotsKnown が false なら分からない */
      slots: slotsKnown ? slots : null,
      slotsKnown,
      rarity,
      limit: lim ? { id: lim.Id, n: Number(lim.Limit) || 1, group: strip(lim.Text).replace(/\s*\{0\}個$/, "") || null } : null,
      corruptOk: !!c.CanSocketInCorruptedSanctified,
      replacedGoes: replaceable ? "destroyed" : null,
      text,
      textFrom,
      extra: extraClean.length ? extraClean : null,
    };
    if (why.length) unexpected.push({ en, ja, why, text });
  }
  const sorted = Object.fromEntries(Object.entries(rules).sort(([a], [b]) => a.localeCompare(b)));
  const out = {
    generated: new Date().toISOString().slice(0, 10),
    source: "GGG クライアント: CurrencyItems.Description → SoulCores.Description (ClientStrings2) → ClientStrings.ItemDescriptionSoulCore の順の説明文、SoulCores (IsSocketBound / Limit / CanSocketInCorruptedSanctified)、SoulCoreLimits",
    replacedGoesWhy: "説明文「取り外すことはできないが、他のオーグメントアイテムで置き換えることができる」(英語 cannot be retrieved but can be replaced): 置き換えで外れた物は手元に戻らない",
    rules: sorted,
    unexpected,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");

  // 件数の内訳 (取り外し × 置き換え)
  const count = {};
  for (const r of Object.values(sorted)) {
    const k = `取り外し${r.removable == null ? "?" : r.removable ? "可" : "不可"} × 置き換え${r.replaceable == null ? "?" : r.replaceable ? "可" : "不可"}`;
    count[k] = (count[k] ?? 0) + 1;
  }
  const from = {};
  for (const r of Object.values(sorted)) from[r.textFrom] = (from[r.textFrom] ?? 0) + 1;
  console.log(`augment-rules.json: ${Object.keys(sorted).length} 件`, count, from);
  console.log(`文の型が想定外: ${unexpected.length} 件`);
  for (const u of unexpected) console.log(`  - ${u.en} (${u.ja}): ${u.why.join(" / ")}`);
}

main();
