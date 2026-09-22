#!/usr/bin/env node
/**
 * check-htc-runes.mjs — 「クラフト途中にルーンを差す」道筋を検算する (2026-09-22)
 *
 * `src/services/htc/rune-route.ts` が並べる道筋を実データで作って、決め事が守られているか見る。
 * 値段がまだ繋がっていないので費用は見ない。**道筋の中身**だけを見る検算。
 *
 *   node scripts/check-htc-runes.mjs [ベース名 ...]
 */
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

console.log(failed ? `\nNG: ${failed} 件` : "\n全部 OK");
process.exit(failed ? 1 : 0);
