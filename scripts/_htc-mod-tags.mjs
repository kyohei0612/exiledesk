/**
 * _htc-mod-tags.mjs — family ごとのタグと stat (2026-09-22)
 *
 * `build-htc-bases-from-client.mjs` から切り出し。同梱の MOD が持っていない 2 つを
 * クライアントから渡すための物で、どちらも **family 単位**。
 *   - カタリストが見るタグ … 装飾品の品質がどの MOD を押し上げるか ([[quality.ts]])
 *   - stat の id          … 取引所の検索に使う ([[buy-or-craft.ts]])
 */
import { familyOf } from "./_htc-base-tags.mjs";

/** クライアントの MOD 表から `{ modTags, familyStats }` を作る */
export function buildModTags(MODS) {
  /**
   * family -> カタリストが見るタグ。
   *
   * 装飾品の品質は種類つきで、**その種類のタグを持つ MOD だけ**が倍率で押し上げられる
   * (`services/htc/quality.ts`)。同梱の MOD はこのタグを持っていないので、クライアントから渡す。
   * カタリストに使われる 13 個のタグだけに絞って小さく保つ。
   */
  const CATALYST_TAGS = new Set([
    "life", "mana", "defences", "physical", "fire", "cold", "lightning",
    "chaos", "attack", "caster", "speed", "attribute", "minion",
  ]);
  const modTags = {};
  for (const m of Object.values(MODS)) {
    if (m.domain !== "item" && m.domain !== "desecrated") continue;
    const f = familyOf(m);
    if (!f) continue;
    const tags = (m.implicit_tags || []).filter((t) => CATALYST_TAGS.has(t));
    if (!tags.length) continue;
    const cur = modTags[f] ?? [];
    modTags[f] = [...new Set([...cur, ...tags])].sort();
  }

  /**
   * family -> 「stat が何個の時はこの id 並び」。
   *
   * **同梱の冒涜 / エッセンス MOD は `tiers[].stats` を持っていません** (上流の既知の穴)。
   * stat が無いと取引所の条件に変えられないので、`services/htc/buy-or-craft.ts` が
   * 同じ family のクライアント MOD から借ります。
   *
   * **個数で引けるようにする**のが肝心です。同じ family でも複合 MOD (2 行) と単独 (1 行) が
   * 混ざることがあり、個数が違う並びを当てると**範囲と stat の対応がずれて下限が別物になる**。
   * 借りる側は `tier.ranges.length` で引き、無ければ借りません。
   */
  const familyStats = {};
  for (const m of Object.values(MODS)) {
    const f = familyOf(m);
    const ids = (m.stats || []).map((x) => x.id).filter(Boolean);
    if (!f || !ids.length) continue;
    const slot = (familyStats[f] ??= {});
    // 同じ個数で違う並びが来たら先勝ち (ほぼ起きないが、起きても静かに入れ替えない)
    slot[ids.length] ??= ids;
  }

  return { modTags, familyStats };
}
