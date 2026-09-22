#!/usr/bin/env node
/**
 * build-htc-essence-prices-from-client.mjs
 * --------------------------------------------------------------
 * エッセンス / 合金の**値段のキー**と、ゲーム内の英語名の対応表を作る (2026-09-22)。
 *
 * クラフトエンジンはエッセンスを `essence:<level>:<modId>` と**1 本ずつ**引きます
 * (`optimizer/cost.ts` の `currencyKey`)。同じグレーターでも 0.8 ex から 116 ex まで散るので、
 * 等級ごとの代表値では期待費用が狂うからです。だから 1 本ずつ名前を用意します。
 *
 * ## どこから取るか
 * 「どのエッセンスがどの MOD を確定させるか」は**同梱の `data/essences.json` に既にあります**
 * (`{ name: "Abrasion", tiers: { LESSER: [modId...], NORMAL: [...], ... } }`)。
 * 足りないのは「そのエッセンスはゲーム内で何という名前か」だけなので、
 * そこだけクライアントの `BaseItemTypes` で引きます。
 *
 * ## 名前の作り方 (クライアントで確認した規則)
 *   合金        … 名前そのまま (「Sovereign Alloy」。「Perfect Essence of 〜」にはならない)
 *   LESSER      … `Lesser Essence of {name}`
 *   NORMAL      … `Essence of {name}`
 *   GREATER     … `Greater Essence of {name}`
 *   PERFECT     … `Perfect Essence of {name}`
 *
 * **例外がある。**「the Breach」は同梱では PERFECT に入っていますが、ゲームの現物は
 * `Essence of the Breach` (Tier 1 / Perfect ではない) です。上流が「MOD を消して付ける」
 * 仕掛けを一括で perfect_essence 扱いにしているためで、名前は素の側にあります。
 * だから PERFECT は素の名前へ落ちる道も見ます。**合わなければ落とす**ので、
 * リーグで名前が変わったり新しいエッセンスが来たら気づけます。
 *
 * 出力: src/services/htc/essence-keys.json
 * Usage: node scripts/build-htc-essence-prices-from-client.mjs
 * --------------------------------------------------------------
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TABLES = resolve(ROOT, "data-cache/client-export/tables/English");
const TABLES_JA = resolve(ROOT, "data-cache/client-export/tables/Japanese");
const OUT = resolve(ROOT, "src/services/htc/essence-keys.json");

const rj = async (p) => JSON.parse(await readFile(p, "utf8"));

/** 突き合わせ用。アポストロフィ / 大小文字 / 余分な空白 / 先頭の "the " を落とす */
const norm = (s) =>
  (s ?? "")
    .replace(/[’']/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^the /, "")
    .trim();

/** 同梱の tier 名 -> エンジンの level */
const LEVEL = { LESSER: "lesser", NORMAL: "normal", GREATER: "greater", PERFECT: "perfect" };

const main = async () => {
  const [bJson, bJa, essences] = await Promise.all([
    rj(resolve(TABLES, "BaseItemTypes.json")),
    rj(resolve(TABLES_JA, "BaseItemTypes.json")),
    rj(resolve(ROOT, "src/vendor/poe2htc/data/essences.json")),
  ]);
  const B = Array.isArray(bJson) ? bJson : bJson.rows;
  const BJa = Array.isArray(bJa) ? bJa : bJa.rows;
  if (B.length !== BJa.length) {
    console.log(`NG: EN ${B.length} 行 / JA ${BJa.length} 行で行数が合わない`);
    process.exit(1);
  }
  /** 正規化した名前 -> { en, ja }。EN / JA は行が対応する */
  const byName = new Map();
  for (let i = 0; i < B.length; i++) {
    const r = B[i];
    if (r.Name) byName.set(norm(r.Name), { en: r.Name, ja: BJa[i]?.Name ?? r.Name });
  }

  const keys = {};
  const missing = [];
  let mods = 0;

  for (const e of essences.essences) {
    const isAlloy = /alloy$/i.test(e.name);
    for (const [tier, modIds] of Object.entries(e.tiers)) {
      if (!Array.isArray(modIds) || modIds.length === 0) continue;
      const level = LEVEL[tier];
      if (!level) {
        missing.push(`${e.name} の tier "${tier}" が読めない`);
        continue;
      }
      // 候補を順に試す。合金は名前そのまま、それ以外は等級の接頭辞つき。
      // PERFECT は素の名前へも落ちる (「Essence of the Breach」がこれ)
      const candidates = isAlloy
        ? [e.name]
        : level === "lesser"
          ? [`Lesser Essence of ${e.name}`]
          : level === "greater"
            ? [`Greater Essence of ${e.name}`]
            : level === "perfect"
              ? [`Perfect Essence of ${e.name}`, `Essence of ${e.name}`]
              : [`Essence of ${e.name}`];
      const hit = candidates.map((c) => byName.get(norm(c))).find(Boolean);
      if (!hit) {
        missing.push(`${e.name} / ${tier} … 候補 ${candidates.join(" | ")} がクライアントに無い`);
        continue;
      }
      for (const modId of modIds) {
        keys[`essence:${level}:${modId}`] = hit;
        mods++;
      }
    }
  }

  if (missing.length) {
    console.log(`NG: 名前が引けなかった組み合わせ ${missing.length} 件`);
    for (const m of missing) console.log(`   ${m}`);
    process.exit(1);
  }

  await writeFile(
    OUT,
    JSON.stringify(
      {
        generated: new Date().toISOString().slice(0, 10),
        source: "同梱 poe2htc の data/essences.json (どのエッセンスがどの MOD を確定させるか) + GGG クライアントの BaseItemTypes (名前)",
        keys,
      },
      null,
      1,
    ) + "\n",
    "utf8",
  );
  console.log(`エッセンス ${essences.essences.length} 種 -> 値段のキー ${mods} 件`);
  console.log(`-> ${OUT}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
