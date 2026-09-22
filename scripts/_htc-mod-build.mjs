/**
 * _htc-mod-build.mjs — クライアントの MOD を同梱エンジンの形に組む (2026-09-22)
 *
 * `build-htc-bases-from-client.mjs` から切り出し。**重みの出どころ**がここの肝で、
 * クライアントの重みは全 MOD 1 なのでそのままでは使えない。同梱データが同じ family を
 * 別クラスで持っていればその ilvl の重みを借り、借りられなければ上流と同じ仮の値を置く。
 */
import { weightOn } from "./_htc-base-tags.mjs";

/**
 * 同梱の MOD から「family@ilvl -> 重み」を作り、それを使う組み立て関数を返す。
 * 借りた数 / 置いた数は `stats()` で取れる (生成の最後に報告する)。
 */
export function makeModBuilder(hmods) {
  // ---- 同梱の重みを family + ilvl で借りる ----
  const borrow = new Map();
  for (const m of hmods.values())
    for (const t of m.tiers || []) {
      const k = `${m.family}@${t.ilvl}`;
      if (!borrow.has(k)) borrow.set(k, t.weight);
    }
  let borrowed = 0;
  let placeholder = 0;
  /**
   * 借りられなかった重みの置き場所。
   *
   * クライアントの重みは全 MOD 1 なので、そのまま残すと**通常 MOD (数百〜数千) に対して
   * 1000 分の 1** になり、そのプールが事実上出ないことになる。上流 POE2HTC は同じ問題に
   * 一律の値を置いて対処していて (`README` の但し書き)、こちらも同じ値に合わせる。
   * どちらも**実測ではない**ので `weightSource` は `client-placeholder` のままにする。
   */
  const ASSUMED = { desecrated: 2500, rune: 1000 };

  const buildMod = (classId, family, kind, list, tagSet, source, assumed) => {
    let allBorrowed = true;
    const tiers = list
      .slice()
      .sort((a, b) => (a.required_level || 0) - (b.required_level || 0))
      .map((m) => {
        const ilvl = m.required_level || 0;
        const got = borrow.get(`${family}@${ilvl}`);
        if (got == null) {
          placeholder++;
          allBorrowed = false;
        } else borrowed++;
        return {
          name: m.name || "",
          ilvl,
          weight: got != null ? got : (assumed ?? weightOn(m, tagSet)),
          ranges: (m.stats || []).map((s) => [s.min, s.max]),
          // stat の id。取引所の検索に使う (`services/htc/buy-or-craft.ts` が
          // `i18n/trade2-stat-mapping.json` 越しに trade2 の stat id へ変える)。
          // 同梱の MOD も `tiers[].stats` に同じ物を持っている
          stats: (m.stats || []).map((s) => s.id).filter(Boolean),
        };
      });
    const tags = new Set();
    for (const m of list) for (const sw of m.spawn_weights || []) if (sw.weight > 0 && tagSet.has(sw.tag)) tags.add(sw.tag);
    return {
      id: `${classId}/${family}`,
      source,
      type: kind,
      family,
      tags: [...tags],
      text: list[0].text ?? null,
      tiers,
      weightSource: allBorrowed ? "poe2htc" : "client-placeholder",
    };
  };

  return { buildMod, ASSUMED, stats: () => ({ borrowed, placeholder }) };
}
