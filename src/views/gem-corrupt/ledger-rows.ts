/**
 * ledger-rows.ts — ジェムコラプト収支の行 (経路ごとの使う物 / 売れた物 / 合計) の組み立て
 *
 * ledger.ts から切り出し (2026-09-26)。帳簿 (ledger) と相場から画面の行を作る computed だけで、
 * 帳簿への書き込みはしない。
 */
import { computed, type ComputedRef } from "vue";
import { roundMoney } from "../../state/display-currency";
import { expectedCounts, expectedSales, type RouteId, type SaleSlot } from "./model";
import { fmtQty, type EachKey, type GemLedger, type LedgerRowDef, type SoldKey } from "./ledger-book";
import type { useGemCorrupt } from "./useGemCorrupt";

type Gem = ReturnType<typeof useGemCorrupt>;

/** その経路で使う物の行 (名前・相場・1 回の数) */
export function routeRows(g: Gem, id: RouteId): LedgerRowDef[] {
  const m = g.materials.value;
  const s = g.sale.value;
  const r = g.routes.value.find((x) => x.id === id);
  const crystal: LedgerRowDef = { key: "crystal", label: "コラプトの結晶", market: m.crystal, buy: null, perAttempt: 1, hint: "" };
  /** 原石は結果次第なので 1 回の期待個数 (相場が揃うまでは埋めない) */
  const uncut = (hint: string): LedgerRowDef => ({
    key: "uncut20",
    label: g.uncutLabel.value,
    market: m.uncut20,
    buy: null,
    perAttempt: r?.ok ? (r.expectedUncut ?? 0) : null,
    hint: `${hint}。空欄は期待 ${r?.ok ? fmtQty(r.expectedUncut ?? 0) : "—"} 個 × 回数`,
  });
  switch (id) {
    case "craft":
    case "craftPlain":
      return [
        // 名前と値段は素材表と同じ物 (原石から作る / トレードで現物を買う で変わる。
        // オーナー 2026-09-19「収支のところ、原石と現物で変わるところ一緒に変えて同期して」)
        {
          key: "baseGem",
          label: g.baseGemLabel.value,
          market: m.baseGem,
          buy: null,
          perAttempt: 1,
          hint: g.baseSource.value === "buy" ? "原石から作れないので、トレードで現物 (コラプト無し) を買う" : "",
        },
        { key: "gcp", label: "宝石細工師のプリズム", market: m.gcp, buy: null, perAttempt: 4, hint: "" },
        { key: "perfectJeweller", label: "宝飾職人のオーブ (完全)", market: m.perfectJeweller, buy: null, perAttempt: 1, hint: "" },
        { key: "vaal", label: "ヴァールオーブ", market: m.vaal, buy: null, perAttempt: 1, hint: "" },
        {
          ...crystal,
          perAttempt: r?.ok ? (r.expectedCrystals ?? 0) : null,
          hint: `片方当たった時だけ使う。空欄は期待 ${r?.ok ? fmtQty(r.expectedCrystals ?? 0) : "—"} 本 × 回数`,
        },
        uncut("売る物にだけ使う"),
      ];
    case "buy21":
      return [{ key: "buyLevel21", label: "レベル 21 (品質 20%) のジェム", market: s.level21, buy: "buyLevel21", perAttempt: 1, hint: "買った物" }, crystal];
    case "buy23":
      return [
        { key: "buyQuality23", label: "品質 23% のジェム", market: s.quality23, buy: "buyQuality23", perAttempt: 1, hint: "買った物" },
        crystal,
        uncut("結晶の後、残った物にだけ使う"),
      ];
    case "buyFinished":
      return [{ key: "buyFinished", label: "完成品 (21 · 23%)", market: s.finished, buy: "buyFinished", perAttempt: 1, hint: "買った物" }];
  }
}

/** 帳簿の使った物 / 売れた物 / 合計の行 */
export function useLedgerTotals(g: Gem, ledger: ComputedRef<GemLedger>, ledgerRouteId: ComputedRef<RouteId>) {
  /**
   * N 回やった時の個数 (段ごとに切り下げ)。結晶・原石・売れた数の既定はこれ
   * (オーナー指示 2026-09-20:「コラプト結晶、ジェム 20、完成品の割合は期待値のデフォを必ず記載」)。
   */
  const counts = computed(() => {
    const route = g.routes.value.find((x) => x.id === ledgerRouteId.value);
    return route?.ok ? expectedCounts(route, ledger.value.attempts, { exact: true }) : null;
  });

  const ledgerRows = computed(() => {
    const l = ledger.value;
    const c = counts.value;
    return routeRows(g, ledgerRouteId.value).map((r) => {
      // 結晶と原石は「できた個数」から連鎖で数える (期待値 × 回数 ではない)
      const auto =
        r.key === "crystal" && c ? c.crystals : r.key === "uncut20" && c ? c.uncut20 : r.perAttempt == null ? 0 : r.perAttempt * l.attempts;
      const override = l.qty[r.key] ?? null;
      const qty = override ?? auto;
      const each = l.unit[r.key] ?? null;
      const pinned = l.prices[r.key] ?? null;
      const unit = each ?? pinned ?? r.market;
      // 費用は**切り上げた単価**で数え直す (オーナー指示 2026-09-20:「丸めた単価で計算し直す」
      // 「基本経費は多く、収入は厳しくのスタンス」)。画面の縦の掛け算が必ず合う
      const unitUp = unit == null ? null : (roundMoney(unit, "up")?.exalted ?? unit);
      return { ...r, auto, override, qty, each, pinned, unit: unitUp, cost: unitUp == null ? null : unitUp * qty };
    });
  });

  const ledgerSales = computed(() => {
    const l = ledger.value;
    const s = g.sale.value;
    const route = g.routes.value.find((x) => x.id === ledgerRouteId.value);
    // 経路の内訳から 1 回あたりの売れた数の期待値 (相場が揃うまでは自動で埋めない)
    const exp = route?.ok ? expectedSales(route) : null;
    const rows: { slot: SaleSlot; qtyKey: SoldKey; eachKey: EachKey; label: string; market: number | null; each: number | null }[] = [
      { slot: "level21", qtyKey: "soldLevel21", eachKey: "eachLevel21", label: "レベル 21 (品質 20%)", market: s.level21, each: l.eachLevel21 },
      { slot: "quality23", qtyKey: "soldQuality23", eachKey: "eachQuality23", label: "品質 23%", market: s.quality23, each: l.eachQuality23 },
      { slot: "finished", qtyKey: "soldFinished", eachKey: "eachFinished", label: "完成品 (21 · 23%)", market: s.finished, each: l.eachFinished },
      // 外れの生存品は相場が無いので、前提の割合 × 元の値段の平均を空欄時の売値にする
      { slot: "other", qtyKey: "soldOther", eachKey: "eachOther", label: "その他 (外れの生存品など)", market: exp?.other.price ?? null, each: l.eachOther },
    ];
    const c = counts.value;
    return rows.map((r) => {
      // 売れた数も連鎖で数えた個数 (切り下げ)。相場が揃っていない間は 0
      const auto = c ? c[r.slot] : exp ? Math.floor(exp[r.slot].qty * l.attempts) : 0;
      const override = l.sold[r.qtyKey] ?? null;
      const qty = override ?? auto;
      const price = r.each ?? r.market;
      // 売上は**切り下げた売値**で数え直す (収入は厳しく見る)
      const priceDown = price == null ? null : (roundMoney(price, "down")?.exalted ?? price);
      return { ...r, auto, override, qty, price: priceDown, revenue: priceDown == null ? (qty > 0 ? null : 0) : priceDown * qty };
    });
  });

  const ledgerTotals = computed(() => {
    const rows = ledgerRows.value;
    const sales = ledgerSales.value;
    const missingCost = rows.some((r) => r.qty > 0 && r.cost == null);
    const missingSale = sales.some((r) => r.qty > 0 && r.revenue == null);
    const cost = rows.reduce((s, r) => s + (r.cost ?? 0), 0);
    const revenue = sales.reduce((s, r) => s + (r.revenue ?? 0), 0);
    const n = ledger.value.attempts;
    const finished = sales.find((r) => r.slot === "finished")?.qty ?? 0;
    return {
      cost,
      revenue,
      profit: revenue - cost,
      missingCost,
      missingSale,
      /** 1 回あたりの損益 */
      perAttempt: n > 0 ? (revenue - cost) / n : null,
      /** 完成品 1 個あたりの実コスト */
      perFinished: finished > 0 ? cost / finished : null,
    };
  });

  return { ledgerRows, ledgerSales, ledgerTotals };
}
