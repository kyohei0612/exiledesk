/**
 * _htc-mod-tags.mjs — family ごとのタグと stat (2026-09-22)
 *
 * `build-htc-bases-from-client.mjs` から切り出し。同梱の MOD が持っていない 2 つを
 * クライアントから渡すための物で、どちらも **family 単位**。
 *   - カタリストが見るタグ … 装飾品の品質がどの MOD を押し上げるか ([[quality.ts]])
 *   - stat の id          … 取引所の検索に使う ([[buy-or-craft.ts]])
 */
import { readFileSync } from "node:fs";
import { familyOf } from "./_htc-base-tags.mjs";
import { normalizeModTemplate, stripRichTextMarkers } from "../src/services/mods/normalize.ts";

/**
 * 文面 -> どちら側の枠に入るか (`P` / `S` / `?`)。
 *
 * **繋がらなかった行の枠を引くために要ります。**クラフトでは付かない MOD (ブリーチの樹の
 * 指輪など) も枠は使うので、数えないと「まだ空いている」と思い込んで、実際には入らない構成を
 * 「作れます」と言います。エンジンに無い MOD でも**クライアントには側が入っている**ので、
 * 文面で引けるようにしておきます。
 *
 * 両側に同じ文面がある物は `?` にします (どちらとも決められないので、呼び出し側が
 * 「どちらか 1 枠」として扱う)。実測 2026-09-23: 530 種 / プレ 195・サフ 316・両方 19。
 */
export function buildModSides(MODS) {
  const key = (t) => normalizeModTemplate(stripRichTextMarkers(t)).toLowerCase().replace(/\s+/g, " ");
  const sides = {};
  for (const m of Object.values(MODS)) {
    if (m.domain !== "item" || !m.text) continue;
    if (m.generation_type !== "prefix" && m.generation_type !== "suffix") continue;
    const k = key(m.text);
    const v = m.generation_type === "prefix" ? "P" : "S";
    if (sides[k] && sides[k] !== v) sides[k] = "?";
    else sides[k] ??= v;
  }
  return sides;
}

/**
 * 創生の樹 (ブリーチ) からしか出ない MOD。文面 -> `{ tag, side, name }`。
 *
 * オーナー指摘 2026-09-23:「創生の樹 MOD のみ DB から片っ端から見つけて覚えておかないと
 * 厄介かもね」。**クラフトでは付かない**ので、狙いに入っていたら「買うしかない」と断れます。
 *
 * ## タグは 4 系統ある
 * `breach_desecration` だけ見ると**足りません** (最初にそれで 36 件と数えて漏らした):
 * ```
 * genesis_tree_caster    83 件   ← スペルのマナコスト効率 6 ティアはここ
 * genesis_tree_minion    68 件
 * breach_desecration     36 件
 * tower_augment_breach    7 件
 * ```
 *
 * ## 通常プールでも出る物は**入れません**
 * 194 件のうち 16 件は他のタグでも重み > 0 で、**普通に作れます**。それを「買うしかない」と
 * 断ると嘘になるので、**創生の樹でしか出ない 178 件だけ**を出します。
 */
/**
 * カタリストが見るタグ。**手で書かず `src/services/htc/catalysts.json` (クライアントの
 * AlternateQualityTypes 由来) から引く** ── タグとカタリストを 1 か所で同期させる (2026-09-23 オーナー指示)。
 */
const QUALITY_TAGS = new Set(
  JSON.parse(readFileSync(new URL("../src/services/htc/catalysts.json", import.meta.url), "utf8")).catalysts.map((c) => c.tag),
);

export function buildDropOnly(MODS) {
  const key = (t) => normalizeModTemplate(stripRichTextMarkers(t)).toLowerCase().replace(/\s+/g, " ");
  const TREE = /^(genesis_tree_caster|genesis_tree_minion|breach_desecration|tower_augment_breach)$/;
  const out = {};
  for (const m of Object.values(MODS)) {
    if (m.domain !== "item" || !m.text) continue;
    const w = m.spawn_weights || [];
    const tree = w.filter((x) => TREE.test(x.tag) && x.weight > 0);
    if (!tree.length) continue;
    // 他のタグでも出るなら普通に作れる。入れない
    if (w.some((x) => !TREE.test(x.tag) && x.weight > 0)) continue;
    const k = key(m.text);
    out[k] ??= {
      tag: tree[0].tag,
      side: m.generation_type === "prefix" ? "P" : "S",
      name: m.name || "",
      // 取引所の条件を組むための stat id。**この MOD はエンジンに無い**ので、
      // 普通の経路 (`tradeFiltersFor`) では引けません。買うしか無い MOD なのに検索も
      // 組めない、では手詰まりになるので、ここだけクライアントから直に持ってきます。
      stats: (m.stats || []).map((x) => x.id).filter(Boolean),
      // 品質で底上げされるか。**品質を外してから段を決める**のに要る ([[quality.ts]])
      qualityTags: (m.implicit_tags || []).filter((t) => QUALITY_TAGS.has(t)),
      tiers: [],
    };
    // **段は全部持つ。**同じ文面の段 (Thoughtful 7-9 … Calculating 23-26) は 1 つのキーに
    // 潰れるので、`??=` だけだと最初の 1 段しか残りません (2026-09-23 に実際そうなっていた)
    const range = /\((-?\d+)-(-?\d+)\)/.exec(m.text);
    if (range) {
      out[k].tiers.push({
        name: m.name || "",
        min: Number(range[1]),
        max: Number(range[2]),
        level: m.required_level ?? m.level ?? 0,
      });
    }
  }
  // 低い段から並べる (エンジンの `mod.tiers` と同じ向き。添字が大きいほど良い)
  for (const v of Object.values(out)) v.tiers.sort((a, b) => a.min - b.min);
  return out;
}

/** クライアントの MOD 表から `{ modTags, familyStats }` を作る */
export function buildModTags(MODS) {
  /**
   * family -> カタリストが見るタグ。
   *
   * 装飾品の品質は種類つきで、**その種類のタグを持つ MOD だけ**が倍率で押し上げられる
   * (`services/htc/quality.ts`)。同梱の MOD はこのタグを持っていないので、クライアントから渡す。
   * カタリストに使われる 13 個のタグだけに絞って小さく保つ。
   */
  const CATALYST_TAGS = QUALITY_TAGS;
  /**
   * **冒涜 (アビス) の MOD のタグは、普通の MOD がいる family には混ぜない。**2026-09-23 に踏んだ:
   * `IncreasedCastSpeed` family に Kurgal の「マナ満タン中のキャスピ」が居て、その `mana` が
   * family 全体に付き、マナ品質でキャスピまで割り戻して段を 2 つ低く読み、マナのカタリストで
   * キャスピの重みまで押し上げていた。冒涜の MOD しかいない family だけ、そのタグを使う。
   * 複数の family にまたがる MOD (同じ所に居た合金の「攻撃速度」、groups が 2 つ) も同じ扱い。
   */
  const isAbyss = (m) => m.domain === "desecrated" || (m.implicit_tags || []).includes("unveiled_mod")
    || (m.groups || []).length > 1;
  const plain = {};
  const abyss = {};
  for (const m of Object.values(MODS)) {
    if (m.domain !== "item" && m.domain !== "desecrated") continue;
    const f = familyOf(m);
    if (!f) continue;
    const tags = (m.implicit_tags || []).filter((t) => CATALYST_TAGS.has(t));
    if (!tags.length) continue;
    const into = isAbyss(m) ? abyss : plain;
    into[f] = [...new Set([...(into[f] ?? []), ...tags])].sort();
  }
  const modTags = { ...abyss, ...plain };

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
