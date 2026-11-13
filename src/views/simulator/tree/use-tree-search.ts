/**
 * use-tree-search.ts — ツリーの始まりの欄の「ベースの値段」を取引所で探す (開くだけ。値段は手で入れる、メモ sim-no-trade-fetch)。
 * 検索の組み立ては ③ と同じ (use-sim-search.ts の searchWhite / searchFour / searchBought): 白 = ノーマル、4 MOD = ✦ の MOD が付いた 4 MOD 以下のレア、
 * フラクチャー済み = ✦ の MOD がフラクチャー。アイテムレベルの下限は ✦ の段を付けられる Lv (木の Lv まで)
 * ✦ が 2 つ以上 (11-10 直し、前は 1 つ目だけ): Lv の下限は ✦ 全部を付けられる Lv、4 MOD は ✦ の MOD を全部持つ物 (start-cost の 4 MOD 買いと同じ)、
 * フラクチャー済みは ✦ のどれか 1 つが固定された物 (S-42「どの ✦ が固定されても当たり」)
 */
import { computed } from "vue";
import { craftStage as s } from "../../../state/craft-stage";
import { minIlvlFor, tierIndexOf } from "../../../services/craft-stage/engine";
import { tradeFiltersFor } from "../../../services/htc/buy-or-craft";
import { buildSpecQuery } from "../../../services/trade2/query/spec";
import { openTradeQuery } from "../../../services/pob-check/trade-links";
import { fractureMarks } from "../../../services/simulator/tree/tree-model";
import { useTree } from "./use-tree";

/** 取引所の「MOD の数」の疑似 stat (4 以下 = 空きのあるレア、③ と同じ) */
const AFFIX_COUNT = "pseudo.pseudo_number_of_affix_mods";
export type TreeSearchKind = "white" | "four" | "fractured";
type Filter = { id: string; min?: number };

export function useTreeSearch() {
  const t = useTree();
  /** ✦ の MOD 全部 (段の下限つき) と、全部を付けられる Lv */
  const frac = computed(() => {
    const d = s.data.value;
    const marks = d ? fractureMarks(t.doc.value).filter((m) => d.mods.get(m.modId)) : [];
    return d && marks.length ? { d, mods: marks.map((m) => ({ modId: m.modId, minTierIndex: tierIndexOf(d, m.modId, m.tier) })), ilvl: minIlvlFor(d, marks) ?? 0 } : null;
  });
  const ilvlMin = computed(() => Math.min(Math.max(1, frac.value?.ilvl ?? 0), t.doc.value.itemLevel));
  /** ✦ の MOD ごとの条件 (kind: 普通 explicit / 固定済み fractured)。条件にできない ✦ が 1 つでもあれば null (抜けた検索を開かない) */
  function fracStats(kind: "explicit" | "fractured"): Filter[][] | null {
    const f = frac.value;
    if (!f) return null;
    const per = f.mods.map((m) => tradeFiltersFor(f.d, [m]).filters.map((x): Filter => ({ id: x.id.replace(/^explicit\./, `${kind}.`), ...(x.min != null ? { min: x.min } : {}) })));
    return per.every((fs) => fs.length) ? per : null;
  }
  /** 探せるか (4 MOD・フラクチャー済みは ✦ が要る) */
  const can = (k: TreeSearchKind): boolean => k === "white" || !!fracStats(k === "four" ? "explicit" : "fractured");
  /** skill = 付与スキル (英語の名前、U-12f・スイッチ tradeSkill。null = どれでも) */
  async function search(k: TreeSearchKind, skill: string | null = null): Promise<void> {
    const base = t.doc.value.base;
    const gs = skill ? { grantedSkill: skill } : {};
    if (k === "white") return openTradeQuery(buildSpecQuery({ ...gs, baseType: base, rarity: "normal", ilvlMin: ilvlMin.value, stats: [], noSanctified: true }));
    const per = fracStats(k === "four" ? "explicit" : "fractured");
    if (!per) return;
    // 4 MOD: ✦ の MOD を全部持つ (どれかを固定する)
    if (k === "four") return openTradeQuery(buildSpecQuery({ ...gs, baseType: base, rarity: "nonunique", ilvlMin: ilvlMin.value, stats: [...per.flat(), { id: AFFIX_COUNT, max: 4 }], anyOf: [], fracturedItem: false, noSanctified: true }));
    // フラクチャー済み: ✦ 1 つならその MOD (値が 2 つの MOD は両方) が固定、2 つ以上なら固定されるのは 1 つなので、どれか 1 つ
    const one = per.length === 1;
    return openTradeQuery(buildSpecQuery({ ...gs, baseType: base, rarity: "nonunique", ilvlMin: ilvlMin.value, stats: one ? per[0]! : [], anyOf: one ? [] : [{ filters: per.flat(), count: 1 }], fracturedItem: true, noSanctified: true }));
  }
  return { can, search };
}
