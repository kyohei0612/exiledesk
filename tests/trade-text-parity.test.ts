/**
 * 取引所の検索の条件が MOD の文と合っているかの総当たり (2026-10-12 要望: 獰猛の「サフィックスの効果」がプレフィックスの効果で検索されていた。
 * オーナー「何でこんなことが起こるんだ、フルチェックしてくれ」)。全部の MOD (普通・エッセンス・冒涜・ジュエル・ルーン) の条件の stat の文が、
 * MOD の文のどれかの行と同じであること。引けない MOD は条件にしない (違う MOD で探すより、探さない方がいい)
 */
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { normStatLine, tradeFiltersFor } from "../src/services/htc/buy-or-craft";
import statText from "../src/i18n/trade2-stat-text.json";

const data = loadPatch();
const byId = new Map<string, string[]>();
for (const [k, ids] of Object.entries(statText as Record<string, string[]>)) for (const id of ids) (byId.get(id) ?? byId.set(id, []).get(id)!).push(k);
/** 言い方だけ違う物を揃える (増加 / 減少、遅い / 速い、単数 / 複数、「付く確率」の書き方、ローカルの印) */
const same = (k: string): string =>
  k.replace(/ \(local\)$/, "").replace(/ \(jewel\)$/, "")
    .replace(/\breduced\b/g, "increased").replace(/\bless\b/g, "more").replace(/\bslower\b/g, "faster")
    .replace(/\bseconds\b/g, "second")
    .replace(/^#% chance to daze on hit$/, "dazes on hit")
    .replace(/^#% chance for attack hits to apply incision$/, "attack hits apply incision");

describe("取引所の条件の文 = MOD の文", () => {
  it("全部の MOD", () => {
    const bad: string[] = [];
    for (const mod of data.mods.values()) {
      // 創生の樹・ハンドラップ (カレンシーでは付かない、文面を引くだけの置き場) は除く
      if (!mod.text || !mod.tiers.length || /\/Special_/.test(mod.id)) continue;
      const attr = /Strength|Dexterity|Intelligence/.exec(mod.id)?.[0]?.toLowerCase();
      const lines = mod.text.split(/\n/).map(normStatLine).map((l) => same(attr ? l.replace("strength, dexterity or intelligence", attr) : l));
      for (const f of tradeFiltersFor(data, [{ modId: mod.id, minTierIndex: 0 } as never]).filters) {
        const key = f.id.replace(/^[a-z]+\./, "explicit.");
        const texts = [...(byId.get(f.id) ?? []), ...(byId.get(key) ?? [])].map(same);
        if (!texts.some((t) => lines.includes(t))) bad.push(`${mod.id} | ${mod.text.replace(/\n/g, " / ")} => ${f.id}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it("ジュエルだけ別の stat がある物 (マナの % 回復) は、ジュエルはジュエルの、それ以外は普通の stat で探す", () => {
    const f = (id: string) => tradeFiltersFor(data, [{ modId: id, minTierIndex: 0 } as never]).filters.map((x) => x.id);
    expect(f("Jewels_int/JewelManaonKill")).toEqual(["explicit.stat_1604736568"]);
    expect(f("Rings/Desecrated_ManaGainedOnKillPercentage")).toEqual(["explicit.stat_1030153674"]);
  });
  it("獰猛: サフィックスの効果はサフィックス、プレフィックスの効果はプレフィックスで探す", () => {
    const f = (id: string) => tradeFiltersFor(data, [{ modId: id, minTierIndex: 0 } as never]).filters.map((x) => x.id);
    expect(f("Jewels_str/Emotion_CraftedJewelSuffixEffect")).toEqual(["explicit.stat_2475221757"]);
    expect(f("Jewels_str/Emotion_CraftedJewelPrefixEffect")).toEqual(["explicit.stat_1443502073"]);
  });
});
