#!/usr/bin/env node
/**
 * check-htc-rulebook.mjs — クラフトのルールブックに書いた数字が今も合うか (2026-09-22)
 *
 * オーナー指示:「クラフトルールブックもチェックしてくれ」。
 *
 * ## なぜ要るか
 * `services/htc/*.ts` の冒頭コメントには「実測 ○○ 件」「○○%」という**根拠の数字**が
 * 書いてあります。これが古くなると、読んだ人 (次の自分を含む) が古い前提で判断します。
 * コメントは誰も実行しないので、**放っておくと必ず腐る**。ここで毎回突き合わせます。
 *
 * ## 直し方
 * 落ちたら、まず**実態が正しいか**を見てください。データ更新で変わったのなら、
 * ここの数字と該当ファイルのコメントを**両方**直す (片方だけ直すと意味がありません)。
 *
 *   node scripts/check-htc-rulebook.mjs
 */
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleEntry } from "./_bundle-ts.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
const data = M.loadPatchSync();
let failed = 0;
/** 主張 1 件。`where` はその数字が書いてあるファイル */
const claim = (where, what, got, want) => {
  const ok = got === want;
  console.log(`  ${ok ? "○" : "×"} ${what.padEnd(46)} ${String(got).padStart(7)}   ${where}`);
  if (!ok) {
    console.log(`     NG: コメントは ${want} と書いているが実態は ${got}`);
    failed++;
  }
};

console.log("ルールブックの数字:");

// buy-or-craft.ts:「同梱の冒涜 / エッセンス MOD は tiers[].stats を持っていません (上流の既知の穴、1,527 件)」
let noStats = 0;
for (const m of data.mods.values()) if ((m.tiers ?? []).every((t) => !(t.stats ?? []).length)) noStats++;
claim("buy-or-craft.ts", "stats を持たない MOD", noStats, 1527);

// buy-or-craft.ts:「対応表で同じ取引所 stat に落ちる 31 件のうち 17 件がこの形」
const map = JSON.parse(readFileSync(join(ROOT, "src/i18n/trade2-stat-mapping.json"), "utf8"));
const rev = {};
for (const [k, v] of Object.entries(map)) (rev[v] ??= []).push(k);
const dup = Object.entries(rev).filter(([, ks]) => ks.length > 1);
const norm = (x) => x.replace("minimum", "*").replace("maximum", "*");
const pairs = dup.filter(([, ks]) => ks.length === 2 && norm(ks[0]) === norm(ks[1]) && norm(ks[0]) !== ks[0]);
claim("buy-or-craft.ts", "同じ取引所 stat に落ちる対応", dup.length, 31);
claim("buy-or-craft.ts", "うち min-max の対", pairs.length, 17);

// essence-route.ts:「通常 MOD 1,274 件のうち 303 件 (23.8%) / MOD × ティアで 1,734 通り / T1 は 22 通り」
let mods = 0, withAlt = 0, anyPairs = 0, t1Pairs = 0;
for (const cls of data.bases.values()) {
  for (const ids of [cls.pools?.normal?.prefixes, cls.pools?.normal?.suffixes]) {
    for (const id of ids ?? []) {
      const m = data.mods.get(id);
      if (!m || m.source !== "normal") continue;
      mods++;
      let any = false;
      for (let i = 0; i < m.tiers.length; i++) {
        if (!M.essenceAlternativesFor(data, cls, { modId: id, minTierIndex: i }, 83).length) continue;
        any = true;
        anyPairs++;
        if (i === m.tiers.length - 1) t1Pairs++;
      }
      if (any) withAlt++;
    }
  }
}
claim("essence-route.ts", "通常プールの MOD", mods, 1274);
claim("essence-route.ts", "エッセンスで代替できる MOD", withAlt, 303);
claim("essence-route.ts", "MOD × ティアの組", anyPairs, 1734);
claim("essence-route.ts", "うち T1 に届く組", t1Pairs, 22);

// fracture-route.ts:「4 個以上のモッドを持つレアアイテム上のランダムなモッド 1 個」
claim("fracture-route.ts", "フラクチャーに要る MOD 数", M.FRACTURE_MIN_MODS, 4);

// quality.ts:「カタリストは指輪とアミュレットにしか存在しない」
const ring = data.mods.get("Rings/IncreasedMana");
const helm = data.mods.get("Helmets_int/LocalEnergyShield");
claim("quality.ts", "指輪にカタリストがある", ring ? M.hasCatalysts(ring) : null, true);
claim("quality.ts", "兜にカタリストは無い", helm ? M.hasCatalysts(helm) : null, false);

// extra-bases.json: 生成側の検算が通った状態のものが入っているか
const eb = JSON.parse(readFileSync(join(ROOT, "src/services/htc/extra-bases.json"), "utf8"));
claim("build-htc-bases", "ベースの素性", Object.keys(eb.baseInfo ?? {}).length, 1618);
claim("build-htc-bases", "枠が素と違うベース", Object.keys(eb.baseLimits ?? {}).length, 13);

// ---- 品質の割り戻し (一度やらかした所) ----
//
// `defences` も `life` もカタリストの種類であり、同時に**防具の MOD が持つタグ**でもある。
// タグだけ見ると兜の MOD を割り戻してしまい、ティアを実際より低く読む。2026-09-22 に実際に
// やらかして、クラスで弾く形に直した。ここはその再発を見る。
console.log("\n品質の割り戻し:");
{
  const amuletMana = data.mods.get("Amulets/IncreasedMana");
  const helmEs = data.mods.get("Helmets_int/LocalEnergyShield");
  claim("quality.ts", "アミュレットのマナは mana で底上げ", amuletMana ? M.boostedBy(amuletMana, "mana") : null, true);
  // 兜の ES は defences タグを持つが、兜にカタリストは無いので底上げされない
  claim("quality.ts", "兜の ES は defences でも底上げしない", helmEs ? M.boostedBy(helmEs, "defences") : null, false);
  // オーナーの実物で検算した数値 (マナのカタリスト 20%)
  claim("quality.ts", "182 → 表示 218", M.displayedValue(182, 20), 218);
  claim("quality.ts", "8 → 表示 9 (切り捨て)", M.displayedValue(8, 20), 9);
  // 戻すと切り捨てぶん下がる = 「素はこれ以上」の下限として使う
  claim("quality.ts", "表示 9 を戻すと 7.5", M.rawValue(9, 20), 7.5);
  claim("quality.ts", "品質 0 なら戻さない", M.rawValue(42, 0), 42);
}

// ---- アプリ本体の読み込み経路 ----
//
// 検算はどれも `loadPatchSync` (esbuild で束ねた同期の入口) を通る。だがアプリが実際に使うのは
// **`loadHtcPatch`** で、4MB の mods.json を動的 import する別の経路。ここが壊れても検算は
// 全部通ってしまい、UI を開いた瞬間に落ちる。だから 1 回だけ通す。
// 重ね方 (`applyExtras`) は両経路で共有しているので、ずれるとすればこの配線だけ。
console.log("\nアプリ本体の読み込み経路 (loadHtcPatch):");
{
  const app = await M.loadHtcPatch();
  claim("patch.ts", "MOD の数が同期経路と一致", app.mods.size, data.mods.size);
  claim("patch.ts", "クラスの数が同期経路と一致", app.bases.size, data.bases.size);
  claim("patch.ts", "重ねた追加分を保持している", M.htcPatchExtras() != null, true);
  const qs = M.itemBaseFor(app, "Aegis Quarterstaff");
  claim("patch.ts", "クライアント由来のベースが引ける", qs?.id ?? null, "Quarterstaves");
}

console.log(failed ? `\nNG: ${failed} 件。実態とコメントの両方を直してください` : "\n全部 OK");
process.exit(failed ? 1 : 0);
