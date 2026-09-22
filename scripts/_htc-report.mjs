/**
 * _htc-report.mjs — 生成の結果を読める形で出す (2026-09-22)
 *
 * `build-htc-bases-from-client.mjs` から切り出し。**数えて出すだけ**で、何も決めない。
 * 重み 1 のまま残った MOD をここで名指しするのが肝で、放っておくと事実上出ない MOD が
 * 黙って混ざる。
 */

/** 生成の結果を出す。`o` は本体が持っている物をそのまま渡す */
export function report(o) {
  const { OUT, addedBases, baseInfo, baseLimits, modTags, modSides, dropOnly, familyStats, grantedN,
    outItems, outMods, addedPools, borrowed, placeholder, ASSUMED } = o;
  const addedCount = [...addedBases.values()].reduce((a, b) => a + b.length, 0);
  console.log(`\n既存クラスに足したベース: ${addedCount} 件`);
  for (const [k, v] of addedBases) console.log(`   ${k}: ${v.length} 件 (${v.slice(0, 3).join(", ")}${v.length > 3 ? ", …" : ""})`);
  console.log(`ベースの素性: ${Object.keys(baseInfo).length} 件 / 防御値 ${Object.values(baseInfo).filter((b) => b.defence).length} 件 / 武器 ${Object.values(baseInfo).filter((b) => b.weapon).length} 件 / 付与スキルあり ${grantedN} 件 / うち枠が素と違う ${Object.keys(baseLimits).length} 件 / 暗黙あり ${Object.values(baseInfo).filter((b) => b.implicits).length} 件`);
  console.log(`カタリストのタグを持つ family: ${Object.keys(modTags).length} 件 / stat を貸せる family: ${Object.keys(familyStats).length} 件 / 側が引ける文面: ${Object.keys(modSides).length} 件 / 創生の樹だけの文面: ${Object.keys(dropOnly).length} 件`);
  console.log(`新しいクラス: ${outItems.length} 個`);
  for (const it of outItems) {
    const n = outMods.filter((m) => m.id.startsWith(`${it.id}/`)).length;
    console.log(`   ${it.id}: ベース ${it.bases.length} 件 / MOD ${n} 件`);
  }
  const cnt = (p) => (p ? p.prefixes.length + p.suffixes.length : 0);
  const desAdds = Object.values(addedPools).reduce((a, p) => a + cnt(p.desecrated), 0);
  const runeAdds = Object.values(addedPools).reduce((a, p) => a + Object.values(p.rune ?? {}).reduce((x, q) => x + cnt(q), 0), 0);
  console.log(`既存クラスに足した MOD: 冒涜 ${desAdds} 件 / ルーン ${runeAdds} 件 (${Object.keys(addedPools).length} クラス)`);
  const stillOne = outMods.filter((m) => m.tiers.some((t) => t.weight === 1));
  console.log(`重み: 同梱から借りた ${borrowed} ティア / 借りられず仮の値を置いた ${placeholder} ティア`);
  console.log(`   仮の値: 冒涜 ${ASSUMED.desecrated} / ルーン ${ASSUMED.rune} (上流 POE2HTC と同じ値。どちらも実測ではない)`);
  if (stillOne.length) {
    console.log(`   **重み 1 のまま ${stillOne.length} MOD** (通常プールの新しい family で、置く根拠が無い)。`);
    console.log("   このままだと事実上出ない扱いになる。poe2db の該当ページを取れば埋まる:");
    for (const m of stillOne) console.log(`      ${m.id}`);
  }
  console.log(`-> ${OUT}`);
}
