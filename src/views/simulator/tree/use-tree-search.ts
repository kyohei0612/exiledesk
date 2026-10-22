/**
 * use-tree-search.ts — ツリーの始まりの欄の「ベースの値段」を取引所で探す (開くだけ。値段は手で入れる、メモ sim-no-trade-fetch)。
 * 検索の組み立ては ③ と同じ (use-sim-search.ts の searchWhite / searchFour / searchBought): 白 = ノーマル、4 MOD = ✦ の MOD が付いた 4 MOD 以下のレア、
 * フラクチャー済み = ✦ の MOD がフラクチャー。アイテムレベルの下限は ✦ の段を付けられる Lv (木の Lv まで)
 */
import { computed } from "vue";
import { craftStage as s } from "../../../state/craft-stage";
import { minIlvlFor, tierIndexOf } from "../../../services/craft-stage/engine";
import { tradeFiltersFor } from "../../../services/htc/buy-or-craft";
import { buildSpecQuery } from "../../../services/trade2/query/spec";
import { openTradeQuery } from "../../../services/pob-check/trade-links";
import { startOf } from "../../../services/simulator/tree/tree-model";
import { useTree } from "./use-tree";

/** 取引所の「MOD の数」の疑似 stat (4 以下 = 空きのあるレア、③ と同じ) */
const AFFIX_COUNT = "pseudo.pseudo_number_of_affix_mods";
export type TreeSearchKind = "white" | "four" | "fractured";

export function useTreeSearch() {
  const t = useTree();
  /** ✦ の MOD (段の下限つき) */
  const frac = computed(() => {
    const d = s.data.value, m = startOf(t.doc.value).mods.find((x) => x.fractured);
    return d && m && d.mods.get(m.modId) ? { d, modId: m.modId, minTierIndex: tierIndexOf(d, m.modId, m.tier), ilvl: minIlvlFor(d, [m]) ?? 0 } : null;
  });
  const ilvlMin = computed(() => Math.min(Math.max(1, frac.value?.ilvl ?? 0), t.doc.value.itemLevel));
  /** ✦ の MOD の条件 (kind: 普通 explicit / 固定済み fractured) */
  function fracStats(kind: "explicit" | "fractured"): Array<{ id: string; min?: number }> | null {
    const f = frac.value;
    if (!f) return null;
    const fs = tradeFiltersFor(f.d, [{ modId: f.modId, minTierIndex: f.minTierIndex }]).filters.map((x) => ({ id: x.id.replace(/^explicit\./, `${kind}.`), ...(x.min != null ? { min: x.min } : {}) }));
    return fs.length ? fs : null;
  }
  /** 探せるか (4 MOD・フラクチャー済みは ✦ が要る) */
  const can = (k: TreeSearchKind): boolean => k === "white" || !!fracStats(k === "four" ? "explicit" : "fractured");
  async function search(k: TreeSearchKind): Promise<void> {
    const base = t.doc.value.base;
    if (k === "white") return openTradeQuery(buildSpecQuery({ baseType: base, rarity: "normal", ilvlMin: ilvlMin.value, stats: [], noSanctified: true }));
    const st = fracStats(k === "four" ? "explicit" : "fractured");
    if (!st) return;
    if (k === "four") return openTradeQuery(buildSpecQuery({ baseType: base, rarity: "nonunique", ilvlMin: ilvlMin.value, stats: [...st, { id: AFFIX_COUNT, max: 4 }], anyOf: [], fracturedItem: false, noSanctified: true }));
    return openTradeQuery(buildSpecQuery({ baseType: base, rarity: "nonunique", ilvlMin: ilvlMin.value, stats: st, anyOf: [], fracturedItem: true, noSanctified: true }));
  }
  return { can, search };
}
