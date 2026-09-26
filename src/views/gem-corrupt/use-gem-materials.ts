/**
 * use-gem-materials.ts — ジェムコラプト収支の素材 (原石 / 現物 / 取引所の比較)
 *
 * useGemCorrupt.ts から切り出し (2026-09-26)。
 *   素材価格: poe2scout (ヴァール / プリズム / 宝飾職人 (完全) / コラプトの結晶 / 原石 Lv20)
 *             と公式取引所 (通貨ごとの実レート) の安い方
 */
import { computed, ref, type ComputedRef, type Ref } from "vue";
import { marketStore } from "../../state/market-store";
import { isSpiritGem, spiritGemMeasured } from "../../state/gem-spirit";
import { baseBuyTotal, baseSourceOf, cachedBaseBuy, type BaseSource } from "../../state/gem-base-source";
import { cachedBuy, fetchBuy, payable, type BestBuy, type PayCurrency } from "../../services/trade2/exchange";
import type { MaterialPrices } from "./model";
import { baseGemSourceFor, finisherIsFlux, FINISHER_JA, materialPricesFor, MATERIAL_API, uncut20ApiId, type BaseGemSource } from "./materials";
import type { GemInfo } from "./gem-list";

export function useGemMaterials(selected: Ref<GemInfo | null>, tradeLeague: ComputedRef<string>) {
  /**
   * 低レベルのジェム本体 = 原石のうち一番安い物 (2026-09-16 オーナー指示「スキルジェムとスピリットジェムの 15 以上を対象に一番安いのを表示」)。
   * 以前は「相場が無いので手入力」で既定 1 高貴のままだったため、ジェムが高い今は自作の収支が良く出すぎていた。
   * 決め方は materials.ts (自動ジェム監視の期待値と共通)
   */
  /** 実測 (出品のリザーブ) が入ったら作り直すための目印 */
  const spiritBump = ref(0);
  /**
   * そのジェムがスピリットジェムの原石で作る物か。
   * 出品から読めていればそれを、まだならクライアントの推定 (gems-client.json) を使う。
   */
  const isSpirit = computed(() => {
    void spiritBump.value;
    const gem = selected.value;
    return gem ? isSpiritGem(gem.en, gem.spirit) : false;
  });
  /** その判定が実測か推定か (画面の説明に出す) */
  const spiritMeasured = computed(() => {
    void spiritBump.value;
    return spiritGemMeasured(selected.value?.en);
  });
  /** 調達先 (原石 / 現物) や現物の値段が変わった時に作り直すための目印 */
  const baseBump = ref(0);
  /** 低レベルのジェム本体の調達先 ("uncut" = 原石から作る / "buy" = トレードで現物を買う) */
  const baseSource = computed<BaseSource>(() => {
    void baseBump.value;
    return baseSourceOf(selected.value?.en);
  });
  const baseGemSource = computed<BaseGemSource>(() => {
    if (!selected.value) return { apiId: null, level: null, price: null, mode: "uncut" };
    void marketStore.items.value; // 相場が入ったら取り直す
    void baseBump.value;
    return baseGemSourceFor(isSpirit.value, selected.value.en);
  });
  /** 現物を N 個買う時の合計 (高貴)。最安から N 件を積む。現物でなければ null */
  function baseBuyTotalFor(n: number): { total: number; covered: number } | null {
    void baseBump.value;
    return baseSource.value === "buy" ? baseBuyTotal(selected.value?.en, n) : null;
  }
  /** 現物を買うジェムの、覚えている最安・件数・時刻 (素材表のホバー用) */
  const baseBuyInfo = computed(() => {
    void baseBump.value;
    return baseSource.value === "buy" ? cachedBaseBuy(selected.value?.en) : null;
  });
  /** 素材表に出す名前 (どのレベルの原石を使うか / 現物を買うか) */
  const baseGemLabel = computed(() => {
    if (baseGemSource.value.mode === "buy") return "低レベルのジェム本体 (トレードで現物を買う)";
    const lv = baseGemSource.value.level;
    const kind = isSpirit.value ? "スピリットジェムの原石" : "スキルジェムの原石";
    return lv == null ? "低レベルのジェム本体" : `低レベルのジェム本体 (${kind} レベル ${lv})`;
  });
  /** 素材の単価 = 相場と取引所 (繰り上げ後) の安い方。自動ジェム監視の期待値と同じ決め方 */
  const materials = computed<MaterialPrices>(() => {
    void marketStore.items.value;
    void exchange.value;
    return materialPricesFor(isSpirit.value, (apiId) => bestBuy(apiId)?.exalted ?? null, baseGemSource.value);
  });
  /**
   * 取引所 (exchange) で素材を通貨ごとに比べる (2026-09-16 オーナー指示「たまにカオスで買った方が安い」)。
   * poe2scout の相場は高貴建て 1 本なので通貨差が出ない。実レートは公式取引所から取る (ボタンで手動、30 分キャッシュ)。
   */
  const materialApiIds = computed<{ key: string; apiId: string }[]>(() => [
    ...(baseGemSource.value.apiId ? [{ key: "baseGem", apiId: baseGemSource.value.apiId }] : []),
    { key: "gcp", apiId: MATERIAL_API.gcp },
    { key: "perfectJeweller", apiId: MATERIAL_API.perfectJeweller },
    { key: "vaal", apiId: MATERIAL_API.vaal },
    { key: "crystal", apiId: MATERIAL_API.crystal },
    { key: "uncut20", apiId: uncut20ApiId(isSpirit.value, baseGemSource.value.mode) },
  ]);
  const exchange = ref<Record<string, BestBuy>>({});
  const exchangeLoading = ref(false);
  const exchangeError = ref<string | null>(null);
  const exchangeDone = computed(() => materialApiIds.value.filter((m) => exchange.value[m.apiId]).length);
  function loadExchangeCache(): void {
    const next = { ...exchange.value };
    for (const m of materialApiIds.value) {
      const c = cachedBuy(m.apiId);
      if (c) next[m.apiId] = c;
    }
    exchange.value = next;
  }
  async function fetchExchange(): Promise<void> {
    if (exchangeLoading.value) return;
    exchangeLoading.value = true;
    exchangeError.value = null;
    try {
      for (const m of materialApiIds.value) {
        try {
          const b = await fetchBuy(tradeLeague.value, m.apiId);
          if (b) exchange.value = { ...exchange.value, [m.apiId]: b };
        } catch (e) {
          exchangeError.value = e instanceof Error ? e.message : String(e);
          break;
        }
      }
    } finally {
      exchangeLoading.value = false;
    }
  }
  /** その素材を一番安く買える通貨 (高貴換算つき)。取っていなければ null */
  function bestBuy(apiId: string | null | undefined): { currency: PayCurrency; perUnit: number; rawPerUnit: number; exalted: number } | null {
    if (!apiId) return null;
    const e = exchange.value[apiId];
    const b = e?.best;
    if (!b) return null;
    // 単価は「実際に払う額」に繰り上げる (rawPerUnit は繰り上げ前の取引所レート)
    const p = payable(b);
    return { currency: b.currency, perUnit: p.payPerUnit, rawPerUnit: b.perUnit, exalted: p.payExalted };
  }
  /**
   * 仕上げ (レベル 20 に上げる) に使う物の名前。
   * オーナー指摘 2026-09-19: 仕上げは ソーマタージ・フラックス (レベル 20)。
   * 相場一覧に無い時だけ、これまで通り原石の名前を出す。
   */
  const uncutLabel = computed(() => {
    void marketStore.items.value;
    if (finisherIsFlux(baseGemSource.value.mode)) return FINISHER_JA;
    return isSpirit.value ? "スピリットジェムの原石 (レベル 20)" : "スキルジェムの原石 (レベル 20)";
  });

  return {
    spiritBump,
    isSpirit,
    spiritMeasured,
    baseBump,
    baseSource,
    baseGemSource,
    baseBuyTotalFor,
    baseBuyInfo,
    baseGemLabel,
    materials,
    materialApiIds,
    exchangeLoading,
    exchangeError,
    exchangeDone,
    loadExchangeCache,
    fetchExchange,
    bestBuy,
    uncutLabel,
  };
}
