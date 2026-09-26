/**
 * ledger-book.ts — ジェムコラプト収支の帳簿の型と保存 (localStorage の読み込み・版の移行)
 *
 * ledger.ts から切り出し (2026-09-26)。帳簿の中身の型、空の帳簿、旧形式の片付け、
 * 画面と受け渡す API の型をここに置く。状態 (ref) は持たない。
 */
import type { ComputedRef } from "vue";
import type { RouteId, SaleSlot } from "./model";

export const LEDGER_KEY = "exiledesk.gem.ledger";

export type BuyKey = "buyLevel21" | "buyQuality23" | "buyFinished";
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

export const EMPTY_LEDGER: GemLedger = {
  route: null, attempts: 0, qty: {}, unit: {}, prices: {}, pricesAt: 0, sold: {},
  eachLevel21: null, eachQuality23: null, eachFinished: null, eachOther: null,
};

/**
 * 旧形式 (回数を入れる前、素材ごとの数と売れた数を全部手で入れていた 2026-09-15 まで) の置き場。
 *
 * 2026-09-19 オーナー「なにも触ってないね。そこデフォルトで期待値入れて欲しい」:
 * これを「手で入れた上書き」として引き継いでいたので、回数を入れても期待値が出ず、
 * 何年も前の数が居座って見えていた。旧形式の数は回数と結びついていない
 * (当時の記録は attempts が 0 のまま) ので、もう引き継がない。
 */
type StoredGemLedger = Partial<GemLedger> & Partial<Record<RowKey | SoldKey, number>>;
export type LedgerBook = Record<string, StoredGemLedger>;

/**
 * 帳簿の版。2 = 売れた物の「1 個の売値」の上書き (each*) を一度全部消した後。
 *
 * オーナー報告 2026-09-21 (サイフォンエレメント):「完成品の値段が同期されてなくね、2 神じゃんコレ。
 * 他もそうだけど平均売値かなこれ。最安値同期して欲しい」。
 * 売値は旧形式 (2026-09-15 まで) の記録から each* として引き継がれていて、完成品 2 神のような
 * 今の相場と無関係な値が「手で入れた値」として居座っていた (数の方は 09-19 に引き継ぎをやめたが、
 * 売値は残っていた)。一度きり全部消して、以後は空欄 = 上の売値 (取引所の最安) を使う。
 * 手で入れた実売の額があれば、また入れれば効く。
 */
const LEDGER_VERSION_KEY = "exiledesk.gem.ledger.v";
const LEDGER_VERSION = "2";

export function loadBook(): LedgerBook {
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    const book = raw ? (JSON.parse(raw) as LedgerBook) : {};
    if (localStorage.getItem(LEDGER_VERSION_KEY) !== LEDGER_VERSION) {
      let cleared = 0;
      for (const l of Object.values(book)) {
        for (const k of ["eachLevel21", "eachQuality23", "eachFinished", "eachOther"] as const) {
          if (l[k] != null) {
            delete l[k];
            cleared++;
          }
        }
      }
      if (cleared > 0) localStorage.setItem(LEDGER_KEY, JSON.stringify(book));
      localStorage.setItem(LEDGER_VERSION_KEY, LEDGER_VERSION);
    }
    return book;
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
  setAttemptsValue: (n: number | null) => void;
  setRoute: (ev: Event) => void;
  setQtyValue: (key: RowKey, v: number | null) => void;
  setSoldValue: (key: SoldKey, v: number | null) => void;
  setUnit: (key: RowKey, v: number | null) => void;
  /** 実売の 1 個あたり (空欄なら相場) */
  setEach: (key: EachKey, v: number | null) => void;
  resetLedger: () => Promise<void>;
  /** 使った数 / 売れた数の上書きだけ消す (回数・経路・単価は残す) */
  clearCounts: () => void;
  /** 売れた物の 1 個の売値の上書きを消す (空欄 = 上の売値に戻る)。2026-09-20 */
  clearEach: () => void;
  refreshLedgerPrices: () => void;
  fetchExchangeAndRepin: () => Promise<void>;
}
