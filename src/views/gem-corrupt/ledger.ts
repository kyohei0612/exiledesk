/**
 * ledger.ts — ジェムコラプトの収支 (実績入力) を GemCorrupt.vue から切り出した (2026-09-18)
 *
 * 画面 (GemCorrupt.vue) が 1300 行あって、期待値の表示と実績の帳簿が混ざっていた。
 * 帳簿はジェムごとに localStorage へ持つ独立した状態なので、ここにまとめる。
 * 画面側に残るのはテンプレートへの受け渡しだけ。
 *
 * 仕様 (オーナー指示):
 *   - 2026-09-13: 単価は相場、買ったジェムと売れた物は相場か実際の額。ジェムごとに別帳簿 (この PC だけ)
 *   - 2026-09-14: 経路 (既定は最も得) と回数を入れると、その経路で使う物が「1 回の数 × 回数」で埋まる
 *     (空欄 = 自動、違う数だけ上書き)。使うのは基本「最も得」の経路なのに帳簿が空だったため
 *   - 2026-09-15: 売れた数も「1 回の期待数 × 回数」で埋める。結果次第の結晶と原石も期待数で。
 *     回数を入れた時点の経路を固定する (相場で「最も得」が変わっても、やった分を数え直さない)
 *   - 2026-09-16: 単価も回数を入れた時点で固定する。取引所で比べた後は固定単価も入れ替える
 */
import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import { expectedSales, type RouteId, type SaleSlot } from "./model";
import type { useGemCorrupt } from "./useGemCorrupt";

const LEDGER_KEY = "exiledesk.gem.ledger";

type BuyKey = "buyLevel21" | "buyQuality23" | "buyFinished";
export type RowKey = "baseGem" | "gcp" | "perfectJeweller" | "vaal" | "crystal" | "uncut20" | BuyKey;
export type SoldKey = "soldLevel21" | "soldQuality23" | "soldFinished" | "soldOther";
export type EachKey = "eachLevel21" | "eachQuality23" | "eachFinished" | "eachOther";

export interface GemLedger {
  /** null = 最も得の経路に合わせる */
  route: RouteId | null;
  /** やった回数 */
  attempts: number;
  /** 手で上書きした使った数 (無い行は 1 回の数 × 回数) */
  qty: Partial<Record<RowKey, number>>;
  /** 手で入れた 1 個の値段 (高貴)。無ければ下の固定値 → 今の相場 の順 */
  unit: Partial<Record<RowKey, number>>;
  /** 回数を入れた時点の単価 (高貴)。あとで相場が動いても、やった分の費用を数え直さない (2026-09-16) */
  prices: Partial<Record<RowKey, number>>;
  /** 上の単価を取った時刻 (ms) */
  pricesAt: number;
  /** 手で上書きした売れた数 (無い行は 1 回の期待数 × 回数) */
  sold: Partial<Record<SoldKey, number>>;
  /** 実売の 1 個あたり (高貴)。null なら相場 */
  eachLevel21: number | null;
  eachQuality23: number | null;
  eachFinished: number | null;
  eachOther: number | null;
}

const EMPTY_LEDGER: GemLedger = {
  route: null, attempts: 0, qty: {}, unit: {}, prices: {}, pricesAt: 0, sold: {},
  eachLevel21: null, eachQuality23: null, eachFinished: null, eachOther: null,
};

/** 旧形式 (素材ごとの使った数を全部手で入れていた) のキー。0 より大きい物は上書きとして引き継ぐ */
const OLD_QTY_KEYS = ["baseGem", "gcp", "perfectJeweller", "vaal", "crystal", "uncut20"] as const;
/** 旧形式 (売れた数を全部手で入れていた、2026-09-15 まで) のキー。0 より大きい物は上書きとして引き継ぐ */
const OLD_SOLD_KEYS = ["soldLevel21", "soldQuality23", "soldFinished", "soldOther"] as const;

type StoredGemLedger = Partial<GemLedger> & Partial<Record<(typeof OLD_QTY_KEYS)[number] | SoldKey, number>>;
type LedgerBook = Record<string, StoredGemLedger>;

function loadBook(): LedgerBook {
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    return raw ? (JSON.parse(raw) as LedgerBook) : {};
  } catch {
    return {};
  }
}

/** 個数の表示 (整数はそのまま、期待値は小数 2 桁)。帳簿の説明文と素材表で使う */
export const fmtQty = (q: number | null): string => (q == null ? "—" : Number.isInteger(q) ? String(q) : q.toFixed(2));

export interface LedgerRowDef {
  key: RowKey;
  label: string;
  market: number | null;
  /** 買った物 (実際の買値を入れられる) */
  buy: BuyKey | null;
  /** 1 回の数。null は結果次第 (自動では埋めない) */
  perAttempt: number | null;
  hint: string;
}

export interface GemLedgerApi {
  ledger: ComputedRef<GemLedger>;
  /** 帳簿の経路 (既定は最も得。相場が揃わず決まらない間は自作) */
  ledgerRouteId: ComputedRef<RouteId>;
  ledgerRows: ComputedRef<(LedgerRowDef & {
    auto: number; override: number | null; qty: number;
    each: number | null; pinned: number | null; unit: number | null; cost: number | null;
  })[]>;
  ledgerSales: ComputedRef<{
    slot: SaleSlot; qtyKey: SoldKey; eachKey: EachKey; label: string;
    market: number | null; each: number | null;
    auto: number; override: number | null; qty: number; price: number | null; revenue: number | null;
  }[]>;
  ledgerTotals: ComputedRef<{
    cost: number; revenue: number; profit: number;
    missingCost: boolean; missingSale: boolean;
    perAttempt: number | null; perFinished: number | null;
  }>;
  setAttempts: (ev: Event) => void;
  setRoute: (ev: Event) => void;
  setQty: (key: RowKey, ev: Event) => void;
  setSold: (key: SoldKey, ev: Event) => void;
  setUnit: (key: RowKey, v: number | null) => void;
  /** 実売の 1 個あたり (空欄なら相場) */
  setEach: (key: EachKey, v: number | null) => void;
  resetLedger: () => void;
  refreshLedgerPrices: () => void;
  fetchExchangeAndRepin: () => Promise<void>;
}

/** 数の入力。空欄は null (= 自動) */
function readCount(ev: Event): number | null {
  const raw = (ev.target as HTMLInputElement).value.trim();
  if (raw === "") return null;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : null;
}

export function useGemLedger(g: ReturnType<typeof useGemCorrupt>): GemLedgerApi {
  const book: Ref<LedgerBook> = ref(loadBook());
  const ledgerGem = computed(() => g.selected.value?.en ?? "");

  const ledger = computed<GemLedger>(() => {
    const raw = book.value[ledgerGem.value] ?? {};
    const qty: Partial<Record<RowKey, number>> = { ...(raw.qty ?? {}) };
    if (!raw.qty) {
      for (const k of OLD_QTY_KEYS) {
        const v = raw[k];
        if (typeof v === "number" && v > 0) qty[k] = v;
      }
    }
    const sold: Partial<Record<SoldKey, number>> = { ...(raw.sold ?? {}) };
    if (!raw.sold) {
      for (const k of OLD_SOLD_KEYS) {
        const v = raw[k];
        if (typeof v === "number" && v > 0) sold[k] = v;
      }
    }
    return {
      ...EMPTY_LEDGER,
      route: raw.route ?? null,
      attempts: raw.attempts ?? 0,
      qty,
      unit: { ...((raw as { buyEach?: Partial<Record<RowKey, number>> }).buyEach ?? {}), ...(raw.unit ?? {}) },
      prices: { ...(raw.prices ?? {}) },
      pricesAt: raw.pricesAt ?? 0,
      sold,
      eachLevel21: raw.eachLevel21 ?? null,
      eachQuality23: raw.eachQuality23 ?? null,
      eachFinished: raw.eachFinished ?? null,
      eachOther: raw.eachOther ?? null,
    };
  });

  function setLedger<K extends keyof GemLedger>(key: K, v: GemLedger[K]): void {
    if (!ledgerGem.value) return;
    book.value = { ...book.value, [ledgerGem.value]: { ...ledger.value, [key]: v } };
  }

  const ledgerRouteId = computed<RouteId>(() => ledger.value.route ?? g.best.value?.id ?? "craft");

  function routeRows(id: RouteId): LedgerRowDef[] {
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
        return [
          { key: "baseGem", label: "低レベルのジェム本体", market: m.baseGem, buy: null, perAttempt: 1, hint: "" },
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

  /** 今の単価を写し取る (行ごと、相場 or 取引所の安い方) */
  function snapshotPrices(routeId: RouteId): Partial<Record<RowKey, number>> {
    const out: Partial<Record<RowKey, number>> = {};
    for (const r of routeRows(routeId)) if (r.market != null) out[r.key] = r.market;
    return out;
  }

  function setAttempts(ev: Event): void {
    if (!ledgerGem.value) return;
    const n = Math.floor(readCount(ev) ?? 0);
    const l = ledger.value;
    // 回数を入れた時点の「最も得」で経路を固定し (2026-09-15)、単価もその時点で固定する (2026-09-16 オーナー指示)。
    // あとで相場が動いても、やった分の費用を数え直さない
    const route = l.route ?? (n > 0 && g.best.value ? g.best.value.id : null);
    const needPrices = n > 0 && Object.keys(l.prices).length === 0;
    if (route !== l.route || needPrices) {
      book.value = {
        ...book.value,
        [ledgerGem.value]: {
          ...l,
          attempts: n,
          route,
          prices: needPrices ? snapshotPrices(route ?? ledgerRouteId.value) : l.prices,
          pricesAt: needPrices ? Date.now() : l.pricesAt,
        },
      };
      return;
    }
    setLedger("attempts", n);
  }

  /** 固定した単価を今の相場で取り直す */
  function refreshLedgerPrices(): void {
    if (!ledgerGem.value) return;
    book.value = {
      ...book.value,
      [ledgerGem.value]: { ...ledger.value, prices: snapshotPrices(ledgerRouteId.value), pricesAt: Date.now() },
    };
  }

  /**
   * 取引所で比べた後は、収支の固定単価もその値に入れ替える (2026-09-16 オーナー指示)。
   * 手入力した単価 (l.unit) は固定単価より優先されるので、ここで上書きされない。
   */
  async function fetchExchangeAndRepin(): Promise<void> {
    await g.fetchExchange();
    if (!ledgerGem.value) return;
    if (Object.keys(ledger.value.prices).length === 0) return; // まだ回数を入れていない = 固定前
    refreshLedgerPrices();
  }

  /** 単価の手入力 (空欄なら固定値 → 相場) */
  function setUnit(key: RowKey, v: number | null): void {
    const unit = { ...ledger.value.unit };
    if (v == null) delete unit[key];
    else unit[key] = v;
    setLedger("unit", unit);
  }
  function setEach(key: EachKey, v: number | null): void {
    setLedger(key, v);
  }
  function setRoute(ev: Event): void {
    const v = (ev.target as HTMLSelectElement).value;
    setLedger("route", v === "" ? null : (v as RouteId));
  }
  function setQty(key: RowKey, ev: Event): void {
    const v = readCount(ev);
    const qty = { ...ledger.value.qty };
    if (v == null) delete qty[key];
    else qty[key] = v;
    setLedger("qty", qty);
  }
  function setSold(key: SoldKey, ev: Event): void {
    const v = readCount(ev);
    const sold = { ...ledger.value.sold };
    if (v == null) delete sold[key];
    else sold[key] = v;
    setLedger("sold", sold);
  }
  function resetLedger(): void {
    if (!ledgerGem.value) return;
    const next = { ...book.value };
    delete next[ledgerGem.value];
    book.value = next;
  }

  watch(
    book,
    (v) => {
      try {
        localStorage.setItem(LEDGER_KEY, JSON.stringify(v));
      } catch {
        /* 保存できなくても動く */
      }
    },
    { deep: true },
  );

  const ledgerRows = computed(() => {
    const l = ledger.value;
    return routeRows(ledgerRouteId.value).map((r) => {
      const auto = r.perAttempt == null ? 0 : r.perAttempt * l.attempts;
      const override = l.qty[r.key] ?? null;
      const qty = override ?? auto;
      const each = l.unit[r.key] ?? null;
      const pinned = l.prices[r.key] ?? null;
      const unit = each ?? pinned ?? r.market;
      return { ...r, auto, override, qty, each, pinned, unit, cost: unit == null ? null : unit * qty };
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
    return rows.map((r) => {
      const auto = exp ? exp[r.slot].qty * l.attempts : 0;
      const override = l.sold[r.qtyKey] ?? null;
      const qty = override ?? auto;
      const price = r.each ?? r.market;
      return { ...r, auto, override, qty, price, revenue: price == null ? (qty > 0 ? null : 0) : price * qty };
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

  return {
    ledger,
    ledgerRouteId,
    ledgerRows,
    ledgerSales,
    ledgerTotals,
    setAttempts,
    setRoute,
    setQty,
    setSold,
    setUnit,
    setEach,
    resetLedger,
    refreshLedgerPrices,
    fetchExchangeAndRepin,
  };
}
