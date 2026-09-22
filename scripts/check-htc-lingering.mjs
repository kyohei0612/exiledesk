#!/usr/bin/env node
/**
 * check-htc-lingering.mjs — 「載せている間だけ効く物を使い切ってから消す」作り方を検算する (2026-09-22)
 *
 * 2 つある。どちらも同じ形の話 (使い切ってから消すと結果だけ残る)。
 *   1. ルーン    … 差す → その枠で作る → 別のルーンに差し替える (`rune-route.ts`)
 *   2. 最大品質  … ブリーチのエッセンス → 触媒で品質を上げる → その MOD を消す (`lingering.ts`)
 *
 * 値段がまだ繋がっていないので費用は見ない。**道筋の中身**だけを見る検算。
 *
 *   node scripts/check-htc-lingering.mjs [ベース名 ...]
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bundleEntry } from "./_bundle-ts.mjs";

const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
const data = M.loadPatchSync();

const BASES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["Ancestral Tiara", "Fists of Stone", "Spiny Talisman", "Gold Ring", "Sacrificial Regalia"];

let failed = 0;
const fail = (msg) => {
  console.log(`   NG: ${msg}`);
  failed++;
};

for (const name of BASES) {
  const cls = M.classOfBase(data, name);
  if (!cls) {
    console.log(`\n${name}: エンジンが知らないベース`);
    fail(`${name} が引けない`);
    continue;
  }
  const routes = M.runeRoutes(cls);
  console.log(`\n${name} (${cls.id}): 道筋 ${routes.length} 本`);

  // 決め事 1: 先頭は必ず「差さない」で、断り書きが無い
  const plain = routes[0];
  if (plain.use !== "none" || plain.caveats.length) fail("先頭が素の道筋になっていない");

  const runeIds = [...new Set(routes.flatMap((r) => r.runeIds))];
  for (const id of runeIds) {
    const mine = routes.filter((r) => r.runeIds.includes(id));
    const keep = mine.find((r) => r.use === "keep");
    const pull = mine.find((r) => r.use === "pull");
    const pref = M.preferredRoute(routes, id);
    const grew =
      keep.limits.prefixes + keep.limits.suffixes + keep.limits.crafted >
      plain.limits.prefixes + plain.limits.suffixes + plain.limits.crafted;
    const poolGrew =
      (keep.base.pools.normal.prefixes.length + keep.base.pools.normal.suffixes.length) >
      (plain.base.pools.normal.prefixes.length + plain.base.pools.normal.suffixes.length);

    console.log(
      `   ${id} … ${M.runeEffectLabel(id)} | 枠 ${keep.limits.prefixes}/${keep.limits.suffixes}/クラフト${keep.limits.crafted}` +
        ` | プール ${keep.base.pools.normal.prefixes.length + keep.base.pools.normal.suffixes.length}` +
        ` | 勧める: ${pref.use}`,
    );

    // 決め事 2: 差して何も変わらないルーンは道筋に出さない (runeRoutes が弾いているはず)
    if (!grew && !poolGrew) fail(`${id}: 差しても枠もプールも増えていないのに道筋に出ている`);
    // 決め事 3: 外す道筋には必ず「外しても残る」の断りが付く
    if (pull && !pull.caveats.some((c) => c.includes("外しても"))) fail(`${id}: 外す道筋に裁定の断りが無い`);
    // 決め事 4: 外せるなら外すほうを勧める (ソケットが空くぶん常に得)
    if (pull && pref.use !== "pull") fail(`${id}: 外せるのに差したままを勧めている`);
    // 決め事 5: 変換ルーンは外す道筋を出さない (外した時の挙動が未確認)
    if (keep.reason === "convert" && pull) fail(`${id}: 変換ルーンに外す道筋が出ている`);
    // 決め事 6: プールのルーンには重みが仮である断りが付く
    if (keep.reason === "pool" && !keep.caveats.some((c) => c.includes("仮の値"))) {
      fail(`${id}: プールのルーンに重みの断りが無い`);
    }
    // 決め事 7: 差したままなら完成品にルーンが残る / 外すなら残らない
    if (!keep.keepsRune) fail(`${id}: keep なのに残らない扱いになっている`);
    if (pull && pull.keepsRune) fail(`${id}: pull なのに残る扱いになっている`);
    // 決め事 8: どちらもルーン代はかかる (装着した時点で払っている)
    if (!keep.priceKeys.length || (pull && !pull.priceKeys.length)) fail(`${id}: ルーン代が乗っていない`);
  }
}

// ---- 最大品質を上げてから消す ----
console.log("\n=== 最大品質を上げてから消す ===");
for (const name of ["Gold Ring", "Amber Amulet", "Ancestral Tiara"]) {
  const cls = M.classOfBase(data, name);
  if (!cls) continue;
  const route = M.maxQualityRoute(cls);
  const canUse = cls.category === "Rings" || cls.category === "Amulets";
  console.log(
    `${name} (${cls.category}): ` +
      (route ? `${route.essence} → 最大 ${route.maxQualityWhileOn}% / 残る物: ${route.keeps.join(" + ")}` : "使えない"),
  );
  if (canUse && !route) fail(`${name} で使えるはずの道筋が出ない`);
  if (!canUse && route) fail(`${name} で使えないはずの道筋が出ている`);
  if (route && !route.caveats.length) fail(`${name}: 裁定の断りが無い`);
  if (route && route.side !== "prefix") fail(`${name}: 載る側がプレフィックスになっていない`);
}

// ---- 完成品を見て跡を見分ける ----
console.log("\n=== 見分け ===");
const cases = [
  { name: "40% 品質 / 最大品質の MOD なし", item: { quality: 40, explicitMods: ["+47 to maximum Life"] }, want: true },
  { name: "40% 品質 / MOD が残っている", item: { quality: 40, explicitMods: ["+20% to Maximum Quality"] }, want: false },
  { name: "20% 品質 (素の上限)", item: { quality: 20, explicitMods: [] }, want: false },
  { name: "品質が読めない (古いキャッシュ)", item: { explicitMods: [] }, want: false },
];
for (const c of cases) {
  const v = M.judgeQuality(c.item);
  console.log(`  ${v.lingering ? "跡あり" : "跡なし"}  ${c.name}`);
  if (v.lingering !== c.want) fail(`${c.name}: 判定が逆`);
}

// ---- 手元のキャッシュで数える (取得結果が無ければ飛ばす) ----
const CACHE = join(process.env.APPDATA ?? "", "com.kyohei.exiledesk", "craft_v2_cache.json");
if (!existsSync(CACHE)) {
  console.log(failed ? `\nNG: ${failed} 件` : "\n全部 OK (手元に取得結果が無いので実物の数え上げは飛ばした)");
  process.exit(failed ? 1 : 0);
}
const cache = JSON.parse(readFileSync(CACHE, "utf8"));
let seen = 0;
let withQuality = 0;
let lingering = 0;
for (const a of cache.ascendancies ?? []) {
  for (const ch of a.characters ?? []) {
    for (const it of ch.rare_items ?? []) {
      seen++;
      if (it.quality == null) continue;
      withQuality++;
      if (M.judgeQuality({ quality: it.quality, explicitMods: it.explicit_mods }).lingering) lingering++;
    }
  }
}
console.log(`\n手元の上位プレイヤー装備 ${seen} 個 / 品質が入っている ${withQuality} 個 / 跡あり ${lingering} 個`);
if (withQuality === 0) {
  console.log("   品質はまだ保存されていません (2026-09-22 に足したところ)。次に取得すると入ります。");
}

console.log(failed ? `\nNG: ${failed} 件` : "\n全部 OK");
process.exit(failed ? 1 : 0);
