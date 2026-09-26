/**
 * 規格外の賭け — 状態 / 相場 / trade2 (2026-09-14、ソケット 2 固定)
 *
 *   レシピ (ES 兜 / ライフ耐性手袋 / 移動速度靴) を選ぶ
 *   → trade2 で「ベース (マジック + ベース MOD のティア)」「売値の段 ×3」「外れ」の最安を自動で取る (クエリごとに覚える)
 *   → 素材はカレンシーランキングの相場
 *   → 当たり方は sim.ts (poe2db の推定重み × クライアントのティア値)、売値の段で期待収支を出す
 *   → 選択肢 (エッセンス × 肋骨 × 反響のお告げ × 高貴なオーブ × 右側のお告げ × ルーン。高貴なオーブは毎回 偉大なる高貴なお告げ と一緒に使って 2 つ足す) を全部比べ、既定では一番収支がいい組み合わせを素材に出す
 * trade2 の検索は条件ごとに 5 回。擬似レート制限 (5 分 26 回 + サーバーの残り回数) の中で直列に取る。
 *
 * 2026-09-26 の分割: レシピと選択は useRareSelection.ts、選択肢の比較は useRareVariants.ts。返す物の形は変えていない。
 */
import { computed } from "vue";
import { marketStore } from "../../state/market-store";
import {
  ECHOES,
  EXALT_ADDS,
  EXALTS,
  RECIPES,
  RIBS,
  SIDES,
  bucketLabel,
  exaltLevelsFor,
  materialsFor,
  type EchoId,
  type ExaltId,
  type RibId,
  type SideId,
} from "./recipes";
import {
  effectiveExaltCount,
  simulate,
  slotsAfterSetup,
  type SimOptions,
} from "./sim";
import { evaluateLadder, type LadderBucket, type PostOptions } from "./ladder";
import { useRarePrices } from "./prices";
import { useRareSelection } from "./useRareSelection";
import { useRareVariants } from "./useRareVariants";

/** 比較表の 1 行 (useRareVariants.ts へ移した。ここから同じ名前で出す) */
export type { Variant } from "./useRareVariants";

export function useRareCraft() {
  // ---- レシピと選択 (useRareSelection.ts) ----
  const sel = useRareSelection();
  const {
    recipeId,
    recipe,
    pageId,
    page,
    ilvl,
    baseTier,
    sockets,
    quality,
    baseEs,
    essenceId,
    rib,
    exalt,
    echo,
    side,
    runeId,
    buckets,
    floorConds,
    normalShare,
    autoBest,
    resetThresholds,
    tiers,
    currentTier,
    essences,
  } = sel;

  // ---- 相場 (アプリ共通) ----
  const league = marketStore.league;
  const marketError = marketStore.error;
  const marketLabel = marketStore.fetchedLabel;
  const priceOf = marketStore.priceOf;
  const tradeLeague = computed(() => league.value?.Value ?? "Standard");
  /**
   * 通貨相場 (poe2scout) だけ用意する。
   *
   * オーナー指示 (2026-09-16 / 再指摘 2026-09-17): タブを開いただけで trade2 を
   * 叩かない。素材の値段は「取得」ボタンを押した時だけ取りに行く (レート制限対策)。
   */
  async function loadMarket(): Promise<void> {
    await marketStore.ensureMarket();
  }

  // ---- シミュレーションの条件 ----
  function simOptionsFor(o: { essenceId: string; exalt: ExaltId; side: SideId; rib: RibId; echo: EchoId }, samples: number): SimOptions {
    const r = recipe.value;
    const e = essences.value.find((x) => x.id === o.essenceId);
    const base = {
      page: pageId.value,
      ilvl: ilvl.value,
      baseMods: [{ family: r.baseMod.family, stat: r.baseMod.stat, tier: baseTier.value }],
      essence: e && e.ok ? { name: e.name, stat: e.stat } : null,
      desecrate: true,
    };
    const slots = slotsAfterSetup(base);
    const eff = effectiveExaltCount(slots, o.side, EXALT_ADDS);
    return {
      ...base,
      ribMinLevel: RIBS.find((x) => x.id === o.rib)?.minLevel ?? 0,
      normalShare: normalShare.value,
      echo: o.echo === "echoes",
      exaltLevels: exaltLevelsFor(o.exalt, eff),
      exaltSide: o.side,
      priority: r.priority,
      samples,
    };
  }
  const current = computed(() => ({ essenceId: essenceId.value, exalt: exalt.value, side: side.value, rib: rib.value, echo: echo.value }));
  const slots = computed(() => slotsAfterSetup(simOptionsFor(current.value, 0)));
  const effectiveCount = computed(() => effectiveExaltCount(slots.value, side.value, EXALT_ADDS));
  function postFor(rune: string): PostOptions {
    const rd = recipe.value.runes.find((x) => x.id === rune);
    return {
      baseEs: recipe.value.id === "es-helmet" ? baseEs.value : 0,
      quality: quality.value,
      rune: rd?.effect ?? {},
      runeCount: rd?.apiId ? sockets.value : 0,
    };
  }

  // ---- trade2 ----
  // ---- trade2 (相場を取る) は rare-craft/prices.ts へ (2026-09-19 の分割) ----
  const { get, tradeUrl, pricing, priceError, remaining, fetchPrices, missingCount } = useRarePrices({
    recipe,
    page,
    sockets,
    ilvl,
    currentTier,
    floorConds,
    buckets,
    tradeLeague,
    league,
  });

  // ---- 相場の値 ----
  const basePrice = computed(() => get("base")?.price ?? null);
  const floorFetched = computed(() => get("floor"));
  /** 外れの売値: 取れて出品が無ければ 0 */
  const floorPrice = computed(() => (floorFetched.value ? (floorFetched.value.price ?? 0) : null));
  const ladderBuckets = computed<LadderBucket[]>(() =>
    buckets.value.map((b) => ({ key: b.key, label: bucketLabel(b.conds), conds: b.conds, price: get(`b:${b.key}`)?.price ?? null })),
  );

  // ---- 素材と費用 ----
  function materialRows(o: { essenceId: string; exalt: ExaltId; count: number; side: SideId; rib: RibId; echo: EchoId; runeId: string }) {
    return materialsFor(recipe.value, { essenceId: o.essenceId, rib: o.rib, echo: o.echo, exalt: o.exalt, count: o.count, side: o.side, runeId: o.runeId, sockets: sockets.value, quality: quality.value }).map((m) => ({
      ...m,
      unit: priceOf(m.apiId),
    }));
  }
  const materials = computed(() => materialRows({ ...current.value, count: effectiveCount.value, runeId: runeId.value }));
  function costOf(rows: { unit: number | null; qty: number }[]): number | null {
    if (basePrice.value == null) return null;
    let c = basePrice.value;
    for (const m of rows) {
      if (m.unit == null) return null;
      c += m.unit * m.qty;
    }
    return c;
  }
  const cost = computed(() => costOf(materials.value));
  const missing = computed(() => {
    const out: string[] = [];
    if (basePrice.value == null) out.push("ベースの最安");
    if (floorPrice.value == null) out.push("外れの売値");
    for (const m of materials.value) if (m.unit == null) out.push(m.label);
    return out;
  });

  // ---- 計算 ----
  const sim = computed(() => simulate(simOptionsFor(current.value, 20000)));
  const result = computed(() => {
    const s = sim.value;
    if (!s.ok || cost.value == null || floorPrice.value == null) return null;
    return evaluateLadder(s, postFor(runeId.value), ladderBuckets.value, floorConds.value, floorPrice.value, cost.value);
  });
  /** 一番高い段 (N 回で 1 個以上当たる確率の対象) */
  const topRow = computed(() => {
    const r = result.value;
    if (!r) return null;
    const priced = r.rows.filter((x) => x.price != null);
    return priced.sort((a, b) => (b.price ?? 0) - (a.price ?? 0))[0] ?? null;
  });

  // ---- 選択肢の比較 / 収支の組み合わせ (useRareVariants.ts) ----
  const { variants, bestVariant, unpricedOptions, selectVariant, currentKey, variantLabel, detailFor } = useRareVariants({
    sel,
    basePrice,
    floorPrice,
    ladderBuckets,
    materials,
    result,
    priceOf,
    simOptionsFor,
    materialRows,
    costOf,
    postFor,
  });

  return {
    currentKey,
    variantLabel,
    detailFor,
    RECIPES,
    RIBS,
    EXALTS,
    SIDES,
    ECHOES,
    EXALT_ADDS,
    recipeId,
    recipe,
    pageId,
    page,
    ilvl,
    baseTier,
    tiers,
    currentTier,
    sockets,
    quality,
    baseEs,
    essenceId,
    essences,
    rib,
    exalt,
    echo,
    effectiveCount,
    side,
    runeId,
    normalShare,
    autoBest,
    slots,
    buckets,
    floorConds,
    resetThresholds,
    league,
    marketError,
    marketLabel,
    loadMarket,
    pricing,
    priceError,
    remaining,
    fetchPrices,
    missingCount,
    get,
    tradeUrl,
    basePrice,
    floorPrice,
    ladderBuckets,
    materials,
    cost,
    missing,
    sim,
    result,
    topRow,
    variants,
    bestVariant,
    unpricedOptions,
    selectVariant,
  };
}
