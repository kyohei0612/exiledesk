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

/** 値段のシート (手元にあれば聖別の検算に使う) */
const SHEET = join(
  process.env.TEMP ?? "",
  "claude/C--Users-kyohei-ExileDesk/241820d2-847f-4544-9d65-4e36f70398cf/scratchpad/upstream-prices.json",
);

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

// ---- 品質とカタリスト ----
console.log("\n=== 品質とカタリスト ===");
console.log(`  カタリスト ${M.CATALYSTS.length} 種 / 上限 ${M.BASE_MAX_QUALITY}% (ブリーチ等で ${M.RAISED_MAX_QUALITY}%)`);
if (M.CATALYSTS.length !== 13) fail(`カタリストが ${M.CATALYSTS.length} 種 (13 のはず)`);
// 素 -> 表示 (ゲームは切り捨て)
for (const [raw, q, want] of [
  [182, 20, 218],
  [8, 20, 9],
  [189, 40, 264],
  [50, 0, 50],
]) {
  const got = M.displayedValue(raw, q);
  console.log(`  素 ${raw} / 品質 ${q}% -> ${got}`);
  if (got !== want) fail(`素 ${raw} / ${q}% が ${got} (${want} のはず)`);
}
// オーナーの実物 (2026-09-22): 神経のカタリスト 20% で、マナの MOD だけ素に戻る
for (const [id, shown, tag, shouldAdjust] of [
  ["Amulets/IncreasedMana", 218, "mana", true],
  ["Amulets/MaximumManaIncreasePercent", 9, "mana", true],
  ["Amulets/BaseSpirit", 50, "mana", false],
  ["Amulets/CriticalStrikeMultiplier", 36, "mana", false],
]) {
  const mod = data.mods.get(id);
  if (!mod) {
    fail(`${id} が無い`);
    continue;
  }
  const { raw, adjusted } = M.rawValueOfMod(mod, shown, 20, tag);
  console.log(`  ${id.padEnd(42)} 表示 ${String(shown).padStart(4)} -> ${adjusted ? `${raw.toFixed(1)} (戻した)` : "素のまま"}`);
  if (adjusted !== shouldAdjust) fail(`${id}: 戻し判定が逆`);
  // 戻した値は T1 の範囲に収まるはず (表示値のままだと超えている)
  if (adjusted) {
    const top = mod.tiers[mod.tiers.length - 1];
    const max = Math.max(...top.ranges.map((r) => r[1]));
    if (raw > max + 1e-6) fail(`${id}: 戻しても T1 上限 ${max} を超えている (${raw.toFixed(1)})`);
  }
}

// ---- 防具はカタリストの対象外 ----
//
// 実物で確認 (2026-09-22): 品質 20% の兜で `P1 [39-42]` の MOD が **42** と表示されていた。
// 品質が乗るなら 50 になるはずで、乗っていない。防具の品質は**素の防御値**のほうを上げる。
//
// **タグだけでは弾けない。**`defences` も `life` もカタリストの種類であり、同時に防具の MOD が
// 持つタグでもある。クラスで弾かないと、知性の兜 20 件のうち 17 件を誤って割り戻す。
console.log("\n=== 防具はカタリストの対象外 ===");
const helm = data.bases.get("Helmets_int");
const catTags = M.CATALYSTS.map((c) => c.tag);
const helmMods = [...helm.pools.normal.prefixes, ...helm.pools.normal.suffixes].map((i) => data.mods.get(i)).filter(Boolean);
let overlap = 0;
let wrong = 0;
for (const m of helmMods) {
  // family のタグがカタリストと重なるか (クラスを無視して判定するとどうなるか)
  const shares = catTags.some((t) => (M.htcModTags?.()?.[m.family] ?? []).includes(t));
  if (shares) overlap++;
  for (const t of catTags) if (M.rawValueOfMod(m, 100, 20, t).adjusted) wrong++;
}
console.log(`  知性の兜 ${helmMods.length} 件 / カタリストのタグと重なる family ${overlap} 件 / 誤って割り戻した ${wrong} 件`);
if (wrong > 0) fail(`防具の MOD を ${wrong} 件 割り戻している (カタリストは指輪とアミュレットだけ)`);
// 対照: アミュレットは割り戻す
const amu = data.mods.get("Amulets/IncreasedMana");
if (!M.rawValueOfMod(amu, 218, 20, "mana").adjusted) fail("アミュレットのマナ MOD を割り戻していない");
if (M.catalystsFor(helmMods[0]).length) fail("防具の MOD に効くカタリストが出ている");
console.log(`  対照: Amulets/IncreasedMana は割り戻す / 兜の MOD に効くカタリストは ${M.catalystsFor(helmMods[0]).length} 件`);

// ---- 聖別 ----
//
// poe2db: 「MOD の数値に 78%〜122% のランダムな倍率が、MOD ごとに独立でかかる」。
// 丸めは未確認だが、**切り捨てだと +5 が数学的に不可能**になる (4 × 1.22 = 4.88)。
// 実在のレシピが +5 を作っている以上、四捨五入しかない ── という消去法で既定を決めている。
console.log("\n=== 聖別 ===");
if (!existsSync(SHEET)) {
  console.log("  値段のシートが手元にありません。聖別の検算はスキップします。");
  console.log(failed ? `\nNG: ${failed} 件` : "\n全部 OK");
  process.exit(failed ? 1 : 0);
}
const sheet2 = JSON.parse(readFileSync(SHEET, "utf8"));
sheet2.omens = { ...sheet2.omens, OmenofSanctification: 40 };
const sp = M.indexPrices(sheet2);
console.log(`  倍率 ${M.SANCTIFY_MIN}〜${M.SANCTIFY_MAX} (MOD ごとに独立)`);
const spell = { modId: "spell", raw: 3, want: 5, qualityPct: 34 };
const rRound = M.sanctifyOutlook(sp, [spell], { rounding: "round" });
const rFloor = M.sanctifyOutlook(sp, [spell], { rounding: "floor" });
console.log(`  素 +3 / キャスター品質 34% (表示 +4) から +5 を狙う:`);
console.log(`    四捨五入 … 要る倍率 ${rRound.mods[0].needed.toFixed(3)} / 届く ${(rRound.mods[0].pReach * 100).toFixed(1)}%`);
console.log(`    切り捨て … 要る倍率 ${rFloor.mods[0].needed.toFixed(3)} / 届く ${(rFloor.mods[0].pReach * 100).toFixed(1)}%`);
if (!(rRound.mods[0].pReach > 0.2 && rRound.mods[0].pReach < 0.25)) fail(`四捨五入で ${(rRound.mods[0].pReach * 100).toFixed(1)}% (約 23% のはず)`);
if (!rFloor.mods[0].impossible) fail("切り捨てなのに届く扱いになっている (4 × 1.22 = 4.88 で届かないはず)");
// 複数 MOD を同時に賭ける = 独立なので掛け算、そして大抵どれかが下がる
const many = M.sanctifyOutlook(sp, [
  spell,
  { modId: "mana", raw: 182, want: 218, qualityPct: 20 },
  { modId: "spirit", raw: 50, want: 50, qualityPct: 0 },
]);
console.log(`  3 個同時: 全部届く ${(many.pAll * 100).toFixed(2)}% / どれか下がる ${(many.pAnyWorse * 100).toFixed(1)}%`);
const product = many.mods.reduce((a, m) => a * m.pReach, 1);
if (Math.abs(many.pAll - product) > 1e-9) fail("全部届く確率が掛け算になっていない (MOD ごとに独立のはず)");
if (!(many.pAnyWorse > many.mods[0].pWorse)) fail("「どれか下がる」が 1 個ぶんより小さい");
if (many.caveats.length < 2) fail("断り書きが足りない (やり直せない / 丸めが未確認)");

console.log(failed ? `\nNG: ${failed} 件` : "\n全部 OK");
process.exit(failed ? 1 : 0);
