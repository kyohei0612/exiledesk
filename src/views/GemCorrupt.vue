<!--
  GemCorrupt.vue — ジェムコラプトの賭け (2026-09-12、「ヴァールの天秤」の 1 つ)
  ジェムを選ぶ → 売値 3 つ (レベル 21 / 品質 23% / 完成品) を trade2 で取る or 手入力 →
  自作 / 21 を買って賭け / 23% を買って賭け / 完成品を買う の 4 経路を「1 回あたりの期待収支」で比べる (完成品 1 個の実質コストも併記)。
    views/gem-corrupt/model.ts         期待値モデル (純粋関数)
    views/gem-corrupt/useGemCorrupt.ts 状態 / 相場 / trade2
    i18n/gems-client.json              ジェム一覧 (GGG クライアント由来)
-->
<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from "vue";
import { openExternal } from "../services/trade2/open-external";
import { refetchState } from "../services/trade2/auto-price";
import BaseCard from "../components/decor/BaseCard.vue";
import { GEMS, SALE_ROWS, useGemCorrupt } from "./gem-corrupt/useGemCorrupt";
import { pendingGemCorrupt } from "../state/app-nav";
import CurrencyPicker from "../components/vaal-scales/CurrencyPicker.vue";
import MoneyInput from "../components/vaal-scales/MoneyInput.vue";
import { displayCurrency, type DisplayCurrency } from "../state/display-currency";
const money = (n: number | null | undefined, signed = false): string => displayCurrency.money(n, { signed });
const unit = displayCurrency.label;
import { budgetRisk, expectedSales, roi, type RouteId, type RouteResult, type SaleSlot } from "./gem-corrupt/model";
import { fmtAge, fmtPct, loadFlow, loadFlowStatus, summarizeFlow, type FlowStatus, type FlowStore } from "../services/market-flow";
import { SALE_KEYS, SALE_KEY_LABEL, watchKey, type SaleKey } from "./gem-corrupt/row-query";
import SoldListDialog from "../components/SoldListDialog.vue";
import { resumeAtText, waitText } from "../utils/wait-text";
import { tradeErrorJa } from "../utils/trade-error";

const g = useGemCorrupt();
const nowMs = ref(Date.now());
let tickTimer: ReturnType<typeof setInterval> | null = null;

onActivated(() => {
  // <keep-alive> で保持されるので、画面に戻ってきた時に読み直す
  void reloadFlow();
  startStatusPolling();
  if (!tickTimer) tickTimer = setInterval(() => (nowMs.value = Date.now()), 1000);
});
onDeactivated(() => {
  stopStatusPolling();
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
});
onUnmounted(() => {
  stopStatusPolling();
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
});
onMounted(() => {
  void reloadFlow();
  startStatusPolling();
  if (!tickTimer) tickTimer = setInterval(() => (nowMs.value = Date.now()), 1000);
  void g.loadMarket();
});

const showAssumptions = ref(false);
const expanded = ref<Record<string, boolean>>({});
const listOpen = ref(false);
/**
 * 上位プレイヤーMOD一覧のスキル欄の「コラプト計算」から来た時 (2026-09-14、オーナー指示):
 * そのジェムを選ぶ → 選んだ時の自動取得 (trade2 で売値 3 件) が走って計算が始まる。
 */
watch(
  pendingGemCorrupt,
  (nameEn) => {
    if (!nameEn) return;
    pendingGemCorrupt.value = null;
    const gem = GEMS.find((x) => x.en === nameEn);
    if (!gem) return;
    listOpen.value = false;
    if (g.selected.value?.en !== gem.en) g.select(gem);
    void nextTick(() => document.querySelector("main")?.scrollTo({ top: 0 }));
  },
  { immediate: true },
);

function pct(p: number): string {
  return `${(p * 100).toFixed(p * 100 >= 10 ? 0 : 1)}%`;
}
function evClass(v: number | null): string {
  if (v == null) return "text-[var(--exile-color-text-tertiary)]";
  return v > 0 ? "text-emerald-300" : v < 0 ? "text-red-300" : "";
}
/** 再取得ボタン (検索中 / レート制限 / 間隔待ち のカウントダウン) */
const refetch = computed(() => refetchState(g.pricing.value, "再取得", "trade2 で検索中… (3 件、約 30 秒)"));
async function open(url: string | null): Promise<void> {
  await openExternal(url);
}
function isBest(r: RouteResult): boolean {
  return !!g.best.value && g.best.value.id === r.id;
}
function onQueryInput(): void {
  listOpen.value = true;
  hi.value = 0;
  if (g.selected.value && g.query.value !== g.selected.value.ja) g.selected.value = null;
}

/** 候補リストのキーボード操作 (オーナー要望 2026-09-13): ↑↓ で選び、Enter で確定、Esc で閉じる */
const hi = ref(0);
const listEl = ref<HTMLUListElement | null>(null);
function scrollHiIntoView(): void {
  void nextTick(() => {
    const li = listEl.value?.children[hi.value] as HTMLElement | undefined;
    li?.scrollIntoView({ block: "nearest" });
  });
}
function onQueryKeydown(e: KeyboardEvent): void {
  const n = g.matches.value.length;
  const visible = listOpen.value && !g.selected.value && n > 0;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!visible) {
      listOpen.value = true;
      return;
    }
    const d = e.key === "ArrowDown" ? 1 : -1;
    hi.value = (hi.value + d + n) % n;
    scrollHiIntoView();
  } else if (e.key === "Enter") {
    if (!visible) return;
    e.preventDefault();
    const m = g.matches.value[Math.min(hi.value, n - 1)];
    if (m) g.select(m);
  } else if (e.key === "Escape") {
    listOpen.value = false;
  }
}

/** 取引所の支払い通貨の日本語名 */
const CURRENCY_JA: Record<string, string> = { exalted: "高貴", chaos: "カオス", divine: "神" };
const fmtBuy = (n: number): string => (n >= 100 ? n.toFixed(0) : n >= 1 ? n.toFixed(2) : n.toFixed(3));
/** 素材の説明 (GGG クライアント CurrencyItems.Description の日本語、2026-09-12 書き出し) */
const MATERIAL_DESC: Record<string, string> = {
  gcp: "スキルジェムの品質を向上させる。",
  perfectJeweller: "スキルジェムに5個のサポートジェムソケットをセットする。",
  vaal: "アイテムをコラプトし、予測不能な変化を与える。",
  crystal: "コラプト状態のスキルジェムを予測不可能に変化させるか、または破壊する。",
  uncut20: "ジェムを生成するか既存のジェムのレベルをレベル20に上げる",
  baseGem: "そのジェムを作る原石。レベル 15〜20 のうち一番安い物を使う",
};
/**
 * 収支 (実績入力、オーナー指示 2026-09-13)。単価は上の相場、買ったジェムと売れた物は相場か実際の額。ジェムごとに別帳簿 (localStorage、この PC だけ)。
 * 2026-09-14 オーナー指摘: 使うのは基本「最も得」の経路なのに、帳簿が空で「買ったジェム」の行も無かった。
 * → 経路 (既定は最も得) と回数を入れると、その経路で使う物が「1 回の数 × 回数」で埋まる (空欄 = 自動、違う数だけ上書き)。
 * 2026-09-15 オーナー指示: 売れた数も「1 回の期待数 × 回数」で埋める。結果次第の結晶と原石も期待数で埋める。
 * 回数を入れた時点の経路を帳簿に固定する (相場で「最も得」が変わっても、やった分を別の経路で数え直さない)。
 */
const LEDGER_KEY = "exiledesk.gem.ledger";
type BuyKey = "buyLevel21" | "buyQuality23" | "buyFinished";
type RowKey = "baseGem" | "gcp" | "perfectJeweller" | "vaal" | "crystal" | "uncut20" | BuyKey;
type SoldKey = "soldLevel21" | "soldQuality23" | "soldFinished" | "soldOther";
type EachKey = "eachLevel21" | "eachQuality23" | "eachFinished" | "eachOther";
interface GemLedger {
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
const book = ref<LedgerBook>(loadBook());
const ledgerGem = computed(() => g.selected.value?.en ?? "");

// ---- 売れ行き (2026-09-16: gem_flow が 1 時間ごとに記録した物を読むだけ) ----
const flowStore = ref<FlowStore | null>(null);
/** 売れたリスト (オーナー指示 2026-09-17): 判定の根拠になった出品を 1 件ずつ見る */
const soldOpen = ref(false);
const soldKeys = computed(() => SALE_KEYS.map((k) => ({ key: watchKey(g.selected.value?.en ?? "", k), label: SALE_KEY_LABEL[k] })));
/** 自動追跡の進行状況 (2026-09-16: 動いているのが分かるように) */
const flowStatus = ref<FlowStatus | null>(null);
let statusTimer: ReturnType<typeof setInterval> | null = null;

async function reloadFlow(): Promise<void> {
  flowStore.value = await loadFlow();
  flowStatus.value = await loadFlowStatus();
}
function startStatusPolling(): void {
  if (statusTimer) return;
  statusTimer = setInterval(async () => {
    flowStatus.value = await loadFlowStatus();
    // 取得が 1 周終わったら記録も読み直す
    if (flowStatus.value && !flowStatus.value.sampling && flowStatus.value.last_at > (flowStore.value?.sampled_at ?? 0)) {
      flowStore.value = await loadFlow();
    }
  }, 5000);
}
function stopStatusPolling(): void {
  if (statusTimer) clearInterval(statusTimer);
  statusTimer = null;
}

const fmtClock = (t: number | null | undefined): string => {
  if (!t) return "—";
  const d = new Date(t * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};
/** 429 の残り秒 (0 なら制限なし) */
const retryLeft = computed(() => {
  const until = flowStatus.value?.retry_until ?? 0;
  if (!until) return 0;
  return Math.max(0, until - Math.floor(nowMs.value / 1000));
});
/** 使った回数 ("4:10:0,12:60:0" → "10 秒 4 / 60 秒 12") */
const rateText = computed(() => {
  const raw = flowStatus.value?.rate_state;
  if (!raw) return "";
  return raw
    .split(",")
    .map((part) => {
      const [used, window] = part.split(":");
      const w = Number(window);
      const label = w >= 3600 ? `${w / 3600} 時間` : w >= 60 ? `${w / 60} 分` : `${w} 秒`;
      return `${label} ${used}`;
    })
    .join(" · ");
});
// 「再取得」の後に記録を読み直す (巡回が裏で回っているので表示を最新にする)
watch(
  () => g.pricing.value,
  (now, prev) => {
    if (prev && !now) void reloadFlow();
  },
);
/** 行 (条件) ごとの捌き速度 */
function flowOf(key: SaleKey) {
  const en = g.selected.value?.en ?? "";
  return summarizeFlow(flowStore.value?.states?.[watchKey(en, key)]);
}
/** 表の下のまとめに使う代表値 (完成品) */
const flow = computed(() => flowOf("finished"));
/** 追跡対象に入っているか (3 条件のどれかが入っていれば追跡中) */
const flowWatch = computed(() => {
  const en = g.selected.value?.en ?? "";
  return flowStore.value?.watches?.find((x) => SALE_KEYS.some((k) => x.key === watchKey(en, k))) ?? null;
});
const flowTracked = computed(() => !!flowWatch.value);
/** 1 時間ごとの巡回に入っているか。手動で足した物でも自動リストに載れば巡回する */
const flowAuto = computed(() => !!flowWatch.value?.auto);
/** 最安 1 件の内訳 (値段の種類・出品者・出品時刻)。おかしな値段の切り分け用 (2026-09-17) */
function cheapestTitle(key: SaleKey): string {
  const info = g.saleInfo.value[key];
  const l = info?.listings?.[0];
  if (!l) return "";
  const kind = l.priceType ? `種類 ${l.priceType}` : "種類不明";
  const at = l.indexed ? new Date(l.indexed).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "出品時刻不明";
  // 即時購入にオンラインかどうかは関係ない (オーナー指摘 2026-09-17)。
  // 見るのは出品者と値段。同じ出品者が並べているかどうかが捌け方の判断に効く
  const same = (info?.listings ?? []).filter((x) => x.account && x.account === l.account).length;
  const who = l.account ? `${l.account}${same > 1 ? ` (この 10 件中 ${same} 件が同じ出品者)` : ""}` : "出品者不明";
  return `最安 ${l.amount} ${l.currency} · ${kind} · ${at}
${who}`;
}

/** 直近の失敗を短い日本語に (詳細はホバー) */
const flowErrorJa = computed(() => {
  const raw = flowStatus.value?.last_error ?? "";
  if (!raw) return "";
  // "Arc::finished: trade2 search HTTP 400 ..." の形。銘柄名と本文に分ける
  const m = /^(.+?::[a-z0-9]+):\s*([\s\S]*)$/i.exec(raw);
  const key = m?.[1] ?? "";
  const body = m?.[2] ?? raw;
  const watch = flowStore.value?.watches?.find((w) => w.key === key);
  const who = watch?.label || key;
  return who ? `${who}: ${tradeErrorJa(body)}` : tradeErrorJa(body);
});

/** ホバーで出す内訳 */
function flowTitleOf(f: ReturnType<typeof flowOf>): string {
  return [
    `1 日以内に売れた割合: ${f.hit24} / ${f.known24} 件 (${fmtPct(f.soldIn24h)})`,
    `2 日以内: ${f.hit48} / ${f.known48} 件 (${fmtPct(f.soldIn48h)})`,
    `売れた分の寿命の中央値: ${fmtAge(f.medianMin)}`,
    "割合の分母は「その時間の時点で結果が分かっている出品」。まだ齢が足りない物は数えません",
    `追跡: 消えた ${f.gone} 件 / まだ残っている ${f.alive} 件`,
    f.stale > 0
      ? `48 時間以上売れ残り: ${f.stale} 件${f.staleRatio != null ? ` (最安の ${f.staleRatio.toFixed(1)} 倍の値付け)` : ""}`
      : "48 時間以上の売れ残りなし",
    `出品総数: ${f.total ?? "—"} · 最終記録 ${fmtFlowAt(f.lastAt)}`,
    "出品 1 件ずつを ID で追い、出品時刻からの齢で数えています",
  ].join("\n");
}
function badgeClassOf(tone: string): string {
  switch (tone) {
    case "fast":
      return "border-emerald-500/60 bg-emerald-500/15 text-emerald-300";
    case "normal":
      return "border-amber-500/60 bg-amber-500/15 text-amber-300";
    case "slow":
      return "border-red-500/60 bg-red-500/15 text-red-300";
    default:
      return "border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-tertiary)]";
  }
}
const fmtFlowAt = (t: number | null): string => {
  if (!t) return "";
  const d = new Date(t * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
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
/** 数の入力。空欄は null (= 自動) */
function readCount(ev: Event): number | null {
  const raw = (ev.target as HTMLInputElement).value.trim();
  if (raw === "") return null;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : null;
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

/** 固定した単価を今の相場で取り直す */
function refreshLedgerPrices(): void {
  if (!ledgerGem.value) return;
  book.value = {
    ...book.value,
    [ledgerGem.value]: { ...ledger.value, prices: snapshotPrices(ledgerRouteId.value), pricesAt: Date.now() },
  };
}
/** 単価の手入力 (空欄なら固定値 → 相場) */
function setUnit(key: RowKey, v: number | null): void {
  const unit = { ...ledger.value.unit };
  if (v == null) delete unit[key];
  else unit[key] = v;
  setLedger("unit", unit);
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
/** 帳簿の経路 (既定は最も得。相場が揃わず決まらない間は自作) */
const ledgerRouteId = computed<RouteId>(() => ledger.value.route ?? g.best.value?.id ?? "craft");
interface LedgerRowDef {
  key: RowKey;
  label: string;
  market: number | null;
  /** 買った物 (実際の買値を入れられる) */
  buy: BuyKey | null;
  /** 1 回の数。null は結果次第 (自動では埋めない) */
  perAttempt: number | null;
  hint: string;
}
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

/** 「N 回やった場合」の N (5 刻み)。アドニアと同じ (オーナー指示 2026-09-13) */
const ATTEMPT_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
const attempts = ref(10);
const craft = computed(() => g.routes.value.find((r) => r.id === "craft") ?? null);
/**
 * 素材表: 自作 1 回あたりの数と費用、N 回分。
 * 結晶と原石は期待値 (結晶は片方当たった時に賭ける場合だけ、原石は壊れなかった物だけ)。
 */
const materialRows = computed(() => {
  const m = g.materials.value;
  const c = craft.value;
  const n = attempts.value;
  const rows: { key: string; label: string; price: number | null; editable: boolean; perAttempt: number | null; expected: boolean }[] = [
    { key: "baseGem", label: g.baseGemLabel.value, price: m.baseGem, editable: false, perAttempt: 1, expected: false },
    { key: "gcp", label: "宝石細工師のプリズム", price: m.gcp, editable: false, perAttempt: 4, expected: false },
    { key: "perfectJeweller", label: "宝飾職人のオーブ (完全)", price: m.perfectJeweller, editable: false, perAttempt: 1, expected: false },
    { key: "vaal", label: "ヴァールオーブ", price: m.vaal, editable: false, perAttempt: 1, expected: false },
    { key: "crystal", label: "コラプトの結晶", price: m.crystal, editable: false, perAttempt: c?.ok ? (c.expectedCrystals ?? 0) : null, expected: true },
    { key: "uncut20", label: g.uncutLabel.value, price: m.uncut20, editable: false, perAttempt: c?.ok ? (c.expectedUncut ?? 0) : null, expected: true },
  ];
  const apiIdOf = new Map(g.materialApiIds.value.map((m) => [m.key, m.apiId]));
  return rows.map((r) => {
    const qtyN = r.perAttempt == null ? null : r.perAttempt * n;
    const apiId = apiIdOf.get(r.key) ?? null;
    const buy = g.bestBuy(apiId);
    // オーナー指示 (2026-09-16): 行の単価と費用は「買う通貨」の単位で出す。合計だけ表示通貨に換算する
    const unitAmount = buy ? buy.perUnit : null;
    const unitCurrency = buy ? buy.currency : null;
    return {
      ...r,
      apiId,
      // 取引所で一番安く買える通貨 (取っていなければ null)
      buy,
      unitAmount,
      unitCurrency,
      costPerAttempt: r.price == null || r.perAttempt == null ? null : r.price * r.perAttempt,
      qtyN,
      costN: r.price == null || qtyN == null ? null : r.price * qtyN,
      // 買う通貨建ての費用 (取引所を取っていれば)
      buyCostPerAttempt: unitAmount == null || r.perAttempt == null ? null : unitAmount * r.perAttempt,
      buyCostN: unitAmount == null || qtyN == null ? null : unitAmount * qtyN,
    };
  });
});
/** 単価を固定した時刻 (MM/DD HH:mm) */
const fmtStamp = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fmtQty = (q: number | null): string => (q == null ? "—" : Number.isInteger(q) ? String(q) : q.toFixed(2));
/**
 * 経路の比較 (2026-09-16 オーナー指摘「分かりにくい、1 回の収支が小さすぎて何これってなる」で作り直し):
 *   - 結論を 1 行 (最も得な経路と「100 (表示通貨) 入れると平均いくら」)
 *   - 経路は表 1 つ (1 回の費用 / 100 あたりの損益 / 完成品ができる確率)。細かい数字は内訳へ
 *   - 「やった場合」は 1 つの表で 回数で比べる / 予算で比べる を切り替え。下位 5% / 中央 / 上位 5% は撤去
 */
type CompareMode = "attempts" | "budget";
const compareMode = ref<CompareMode>("budget");
/** 表示通貨 100 を高貴建てにした額 */
const hundredEx = computed(() => displayCurrency.fromDisplay(100) ?? 100);
/** 100 (表示通貨) 入れた時の平均損益 (高貴建て) */
function per100(r: RouteResult): number | null {
  const v = roi(r);
  return v == null ? null : v * hundredEx.value;
}
/** 利回りの高い順 (計算できない経路は最後) */
const routesSorted = computed(() =>
  [...g.routes.value].sort((a, b) => (roi(b) ?? Number.NEGATIVE_INFINITY) - (roi(a) ?? Number.NEGATIVE_INFINITY)),
);
/** 予算の選択肢 (表示通貨ごと)。2026-09-16 オーナー指示: 表示通貨 (高貴 / カオス / 神) の単位で選べるように */
const BUDGET_OPTIONS: Record<DisplayCurrency, number[]> = {
  exalted: [1000, 2000, 5000, 10000, 20000, 50000],
  chaos: [50, 100, 200, 500, 1000, 2000],
  divine: [5, 10, 20, 50, 100],
};
const budgetOptions = computed(() => BUDGET_OPTIONS[displayCurrency.cur.value]);
/** 選んだ予算 (高貴建て)。未選択は 20 神相当。通貨を切り替えたら一番近い選択肢に寄せる */
const budgetChosenEx = ref<number | null>(null);
const budgetDisplay = computed<number>({
  get: () => {
    const ex = budgetChosenEx.value ?? 20 * (g.divineRate.value > 0 ? g.divineRate.value : 1);
    const d = displayCurrency.toDisplay(ex) ?? 0;
    return budgetOptions.value.reduce((a, b) => (Math.abs(b - d) < Math.abs(a - d) ? b : a));
  },
  set: (v) => {
    budgetChosenEx.value = displayCurrency.fromDisplay(v);
  },
});
const budgetExalted = computed(() => displayCurrency.fromDisplay(budgetDisplay.value) ?? 0);
/** やった場合 (回数 / 予算)。予算が 1 回分の費用に届かない経路は「予算不足」(以前は 1 回やった扱いで予算を超えていた) */
const atCompare = computed(() =>
  routesSorted.value.flatMap((r) => {
    if (!r.ok) return [];
    const byBudget = compareMode.value === "budget";
    const short = byBudget && r.expectedCost > budgetExalted.value;
    const risk = short ? null : budgetRisk(r, byBudget ? budgetExalted.value : attempts.value * r.expectedCost);
    return [{ id: r.id, label: r.label, cost1: r.expectedCost, short, risk }];
  }),
);
/** 結論の 1 行 */
const summary = computed(() => {
  const b = g.best.value;
  if (!b) return null;
  if (b.id === "buyFinished") return { buyFinished: true as const };
  const risk = budgetRisk(b, attempts.value * b.expectedCost);
  return { buyFinished: false as const, label: b.label, per100: per100(b), attempts: attempts.value, pLoss: risk?.pLoss ?? null };
});
</script>

<template>
  <section class="@container min-h-full block px-6 py-4 bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-primary)]">
    <header class="mb-3">
      <h1 class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">ジェムコラプトの賭け</h1>
      <p class="text-xs text-[var(--exile-color-text-secondary)] mt-1">
        レベル 21 · 品質 23% のジェムを手に入れる 4 つの経路 (自作 / レベル 21 を買って賭ける / 品質 23% を買って賭ける / 完成品を買う)
        を「1 回あたりの期待収支」で比べます。
      </p>
      <div class="mt-1"><CurrencyPicker /></div>
      <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-0.5">
        素材価格: カレンシーランキングの相場{{ g.league.value ? ` (${g.league.value.Value})` : "" }} · {{ g.marketLabel.value }} / 売値: trade2 最安 (取得ボタン) か手入力 / ジェム一覧と素材の説明: ゲームクライアント
        <span v-if="g.marketError.value" class="text-amber-300">— poe2scout 取得失敗: {{ g.marketError.value }}</span>
      </p>
    </header>

    <!-- ジェム選択 (候補リストがカードからはみ出すので overflow を解放し、最前面に出す) -->
    <BaseCard class="mb-4 !overflow-visible relative z-30">
      <div class="p-4 pl-5 flex flex-wrap gap-4 items-start">
        <div class="relative w-80">
          <label class="block text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)] mb-1">ジェム (日本語 / 英語で検索)</label>
          <input
            v-model="g.query.value"
            type="text"
            spellcheck="false"
            placeholder="例: アーク / Cast on Critical"
            class="w-full text-[13px] px-2 py-1.5 rounded bg-[var(--exile-color-bg-surface)] border border-[var(--exile-color-border-subtle)] focus:outline-none focus:border-[var(--exile-color-accent-focus)]"
            @input="onQueryInput"
            @focus="listOpen = true"
            @blur="listOpen = false"
            @keydown="onQueryKeydown"
          />
          <ul
            v-if="listOpen && !g.selected.value && g.matches.value.length > 0"
            ref="listEl"
            class="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-elevated)] shadow-lg"
          >
            <li
              v-for="(m, i) in g.matches.value"
              :key="m.en"
              class="px-2 py-1 text-[13px] cursor-pointer flex items-baseline gap-2"
              :class="i === hi ? 'bg-[var(--exile-color-bg-surface)] text-[var(--exile-color-accent-focus)]' : 'hover:bg-[var(--exile-color-bg-surface)]'"
              @mouseenter="hi = i"
              @mousedown.prevent="g.select(m)"
            >
              <span>{{ m.ja }}</span>
              <span class="text-[11px] text-[var(--exile-color-text-tertiary)] truncate">{{ m.en }}</span>
              <span v-if="m.spirit" class="ml-auto text-[10px] px-1 rounded bg-[#6AA0B8]/25 text-[#9CC9DA]">スピリット</span>
              <span v-else-if="m.kind === 'meta'" class="ml-auto text-[10px] px-1 rounded bg-[#9B7BCC]/25 text-[#C7A7E5]">メタ</span>
            </li>
          </ul>
        </div>
        <div v-if="g.selected.value" class="text-[13px] leading-relaxed">
          <div class="font-display tracking-[0.06em] text-[var(--exile-color-accent-focus)] text-base">{{ g.selected.value.ja }}</div>
          <div class="text-[11px] text-[var(--exile-color-text-secondary)]">
            {{ g.selected.value.en }} · {{ g.selected.value.spirit ? "スピリットジェム (原石はスピリット用)" : "スキルジェム" }}
            <span v-if="g.selected.value.kind === 'meta'"> · メタジェム</span>
            <span v-if="g.selected.value.minLevel > 0"> · 必要レベル {{ g.selected.value.minLevel }}</span>
          </div>
        </div>
        <p v-else class="text-[12px] text-[var(--exile-color-text-tertiary)] self-center">ジェムを選ぶと売値の検索と収支が出ます。</p>
      </div>
    </BaseCard>

    <div class="grid grid-cols-1 @6xl:grid-cols-2 gap-4 mb-4">
      <!-- 売値 -->
      <BaseCard>
        <div class="p-4 pl-5">
          <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
            <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">売値 ({{ unit }})</h2>
            <div class="flex items-center gap-3 text-[11px]">
              <button
                type="button"
                :disabled="!g.selected.value || refetch.disabled"
                class="px-3 py-1 rounded border border-[var(--exile-color-border-brass)] font-display tracking-[0.06em] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                @click="g.fetchSalePrices"
              >
                <span aria-hidden="true">⟳</span>
                {{ refetch.label }}
              </button>
            </div>
          </div>
          <p v-if="g.priceError.value" class="text-[11px] text-amber-300 mb-2">{{ g.priceError.value }}</p>
          <table class="w-full text-[12px]">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1">状態</th>
                <th class="text-right font-normal pb-1 w-28">売値</th>
                <th class="text-right font-normal pb-1 w-20">出品数</th>
                <th class="text-right font-normal pb-1 w-48">売れ行き</th>
                <th class="text-right font-normal pb-1 w-16"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in SALE_ROWS" :key="row.key" class="border-t border-[var(--exile-color-border-subtle)]">
                <td class="py-1.5 pr-2">
                  <div>{{ row.label }}</div>
                  <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ row.condition }}</div>
                </td>
                <td class="py-1.5 text-right">
                  <!-- 2026-09-17: 変な値段の時に中身が分かるように、最安 1 件の内訳をホバーで出す -->
                  <span class="tabular-nums text-[13px]" :title="cheapestTitle(row.key)" :class="g.sale.value[row.key] == null ? 'text-[var(--exile-color-text-tertiary)]' : ''">{{ g.sale.value[row.key] == null ? (g.pricing.value ? "取得中…" : "—") : money(g.sale.value[row.key]) }}</span>
                </td>
                <td class="py-1.5 text-right tabular-nums text-[var(--exile-color-text-secondary)]">
                  {{ g.saleInfo.value[row.key] ? g.saleInfo.value[row.key]!.total : "" }}
                </td>
                <!-- 2026-09-16: 捌き速度 (出品を ID で追って生存分析)。3 条件とも出す -->
                <!-- 2026-09-17 オーナー指示: 押すと売れたリスト (値段つき) を出す -->
                <td class="py-1.5 text-right cursor-pointer hover:bg-[var(--exile-color-bg-elevated)]" @click="soldOpen = true">
                  <template v-for="f in [flowOf(row.key)]" :key="row.key">
                    <div v-if="f.label" class="flex items-center justify-end gap-2" :title="flowTitleOf(f)">
                      <span class="shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded text-[11px] font-display tracking-[0.06em] border leading-none" :class="badgeClassOf(f.tone)">{{ f.label }}</span>
                      <span class="tabular-nums text-[11px] text-[var(--exile-color-text-secondary)] whitespace-nowrap">
                        1 日で {{ fmtPct(f.soldIn24h) }} 売れる
                      </span>
                      <span class="text-[10px] underline text-[var(--exile-color-text-tertiary)] whitespace-nowrap">売れたリスト</span>
                    </div>
                    <span
                      v-else-if="f.gone + f.alive > 0"
                      class="text-[10px] text-[var(--exile-color-text-tertiary)] whitespace-nowrap"
                      :title="`追跡 ${f.alive} 件 (最古 ${fmtAge(f.oldestMin)}) / 消えた ${f.gone} 件。24 時間以内に消えれば速い、48 時間残れば遅いと判定します`"
                    >
                      判定待ち {{ f.gone + f.alive }} 件<template v-if="f.etaMin != null"> · あと {{ fmtAge(f.etaMin) }}</template>
                    </span>
                    <span v-else-if="flowTracked" class="text-[10px] text-[var(--exile-color-text-tertiary)]">記録待ち</span>
                    <span v-else class="text-[10px] text-[var(--exile-color-text-tertiary)]">—</span>
                  </template>
                </td>
                <td class="py-1.5 text-right">
                  <button
                    type="button"
                    :disabled="!g.selected.value"
                    class="text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)] disabled:opacity-40"
                    title="同じ条件でトレードサイト (JP) を開く。API は使わない"
                    @click="open(g.tradeUrl(row.key))"
                  >
                    トレード2へ ↗
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <!-- 2026-09-16: 自動追跡が動いているのが分かるように -->
          <div
            v-if="flowStatus"
            class="mt-3 rounded border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-elevated)]/40 px-3 py-2 text-[11px] flex flex-wrap items-center gap-x-4 gap-y-1"
          >
            <span class="font-display tracking-[0.06em] text-[var(--exile-color-text-secondary)]">自動追跡</span>
            <span v-if="flowStatus.sampling" class="inline-flex items-center gap-1.5 text-emerald-300">
              <span class="inline-block w-2 h-2 rounded-full bg-emerald-300 animate-pulse" aria-hidden="true"></span>
              取得中 {{ flowStatus.done }}/{{ flowStatus.total }}<span v-if="flowStatus.slice_done > 0"> (続きから)</span><span v-if="flowStatus.current"> · {{ flowStatus.current }}</span>
            </span>
            <span v-else-if="flowStatus.auto_watches > 0" class="inline-flex items-center gap-1.5" :class="flowStatus.retry_at > 0 ? 'text-amber-300' : 'text-[var(--exile-color-text-secondary)]'">
              <span class="inline-block w-2 h-2 rounded-full" :class="flowStatus.retry_at > 0 ? 'bg-amber-300 animate-pulse' : 'bg-[var(--exile-color-text-tertiary)]'" aria-hidden="true"></span>
              {{ flowStatus.retry_at > 0 ? "取りこぼし分を再取得予定" : "待機中" }} · 次回 {{ fmtClock(flowStatus.next_at) }}
            </span>
            <span v-else class="text-amber-300">追跡リスト待ち (起動 30 秒後に自動で用意します)</span>

            <span class="tabular-nums text-[var(--exile-color-text-tertiary)]">
              {{ flowStatus.rounds }} 周目 · {{ flowStatus.slices }} 分割の {{ flowStatus.slice + 1 }} 組目 · 最終 {{ fmtClock(flowStatus.last_at) }} ·
              自動 {{ flowStatus.auto_watches }} / 手動 {{ flowStatus.manual_watches }} 銘柄
            </span>
            <span v-if="rateText" class="tabular-nums text-[var(--exile-color-text-tertiary)]">使った回数 {{ rateText }}</span>

            <span v-if="retryLeft > 0" class="inline-flex items-center gap-1 text-amber-300 font-medium">
              <span aria-hidden="true" class="animate-pulse">⏱</span>
              トレードのリミット待機中（あと {{ waitText(retryLeft) }}<template v-if="resumeAtText(retryLeft)"> · {{ resumeAtText(retryLeft) }} 頃に再開</template>）
            </span>
            <span v-else-if="flowStatus.last_error" class="text-amber-300 basis-full" :title="flowStatus.last_error">
              ⚠ {{ flowErrorJa }}
            </span>
          </div>
          <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
            <span v-if="g.selected.value" class="text-[var(--exile-color-text-secondary)]">
              捌き速度の追跡: 残り {{ flow.alive }} 件 / 消えた {{ flow.gone }} 件<span v-if="flow.lastAt"> (最終 {{ fmtFlowAt(flow.lastAt) }})</span> ·
              {{ flowAuto ? "自動 (1 時間ごと)" : flowTracked ? "以前の記録 (今は巡回対象外)" : "まだ記録がありません" }} ·
              追跡 {{ flowStore?.watches.length ?? 0 }} 銘柄 (クラフト選定ジェムのリスト)。
            </span>
            <br v-if="g.selected.value" />
            売値は<span class="text-[var(--exile-color-text-secondary)]">インスタントバイアウト (今すぐ買える出品) だけ</span>の最安です。トレードサイトのドロップダウンで「インスタントバイアウト」を選んだ時と同じ条件なので、「トレード2へ」で開いた一覧と数が合います。
            捌き速度の追跡はこれとは別に、オフラインの出品も含めた全部 (指定なし) で見ています。即時購入だけで追うと、同じ出品が時間帯によって検索から消えたり現れたりして「売れた」と誤判定するためです。そのため記録が増えるのは 1 時間ごとの自動巡回だけで、「再取得」を押した分は記録に混ぜません。
            判定は最安 10 件の出品を 1 件ずつ ID で追い、「1 日以内に売れた割合」で出します (半分以上なら速い / 2 日で半分なら普通 / それ以下は遅い)。売れ残りをまだ 1 件も観測していない間は「(暫定)」が付きます。
            ジェムを選ぶと自動で trade2 から最安 1 件を取ります (3 件、約 30 秒)。値がおかしい時は「トレード2へ」で一覧を確認してください (取得条件の問題なので手入力はしない方針)。コラプト済みの品はプリズムやオーブで直せないので、検索は常に 5 ソケット (品質 20% 前提) で絞っています。
          </p>
        </div>
      </BaseCard>

      <!-- 素材 -->
      <BaseCard>
        <div class="p-4 pl-5">
          <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
            <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">素材 (自作、{{ unit }})</h2>
            <button
              type="button"
              :disabled="g.exchangeLoading.value"
              class="text-[11px] px-2 py-0.5 rounded border border-[var(--exile-color-border-brass)] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-40"
              title="公式の取引所で、素材ごとに カオス / 神 のどちらで買うのが安いかを調べます (6 件、約 20 秒)。高貴は取引所の手数料 (ゴールド) が高いので外しています。収支で固定した単価もこの値に入れ替えます (手入力した単価はそのまま)"
              @click="fetchExchangeAndRepin"
            >
              {{ g.exchangeLoading.value ? `取引所で比較中… (${g.exchangeDone.value}/6)` : "取引所で比べる" }}
            </button>
            <label class="text-[11px] text-[var(--exile-color-text-secondary)] inline-flex items-center gap-2">
              回数
              <select v-model.number="attempts" class="num text-left w-20">
                <option v-for="n in ATTEMPT_OPTIONS" :key="n" :value="n">{{ n }} 回</option>
              </select>
            </label>
          </div>
          <table class="w-full text-[12px]">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1">素材</th>
                <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">単価 (取引所)</th>
                <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">1 回の数</th>
                <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">1 回の費用</th>
                <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">{{ attempts }} 回の数</th>
                <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">{{ attempts }} 回の費用</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in materialRows" :key="m.key" class="border-t border-[var(--exile-color-border-subtle)]">
                <td class="py-1.5 pr-2">
                  <div>{{ m.label }}</div>
                  <div v-if="MATERIAL_DESC[m.key]" class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ MATERIAL_DESC[m.key] }}</div>
                </td>
                <td
                  class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap"
                  :class="m.unitAmount != null ? 'text-emerald-300' : m.price == null ? 'text-amber-300' : ''"
                  :title="
                    m.unitAmount != null
                      ? `取引所の最安 ${m.unitAmount} ${CURRENCY_JA[m.unitCurrency!]} / 個 (${money(m.buy!.exalted)})`
                      : m.price != null
                        ? `カレンシーランキングの相場 (${money(m.price)})。「取引所で比べる」を押すと取引所の通貨建てになります`
                        : '相場なし'
                  "
                >
                  <template v-if="m.unitAmount != null">{{ fmtBuy(m.unitAmount) }} {{ CURRENCY_JA[m.unitCurrency!] }}</template>
                  <template v-else-if="m.price != null">{{ money(m.price) }}</template>
                  <template v-else>相場なし</template>
                </td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">{{ fmtQty(m.perAttempt) }}<span v-if="m.expected && m.perAttempt != null" class="text-[10px] text-[var(--exile-color-text-tertiary)]"> (期待)</span></td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">
                  <template v-if="m.buyCostPerAttempt != null">{{ fmtBuy(m.buyCostPerAttempt) }} {{ CURRENCY_JA[m.unitCurrency!] }}</template>
                  <template v-else>{{ money(m.costPerAttempt) }}</template>
                </td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">{{ fmtQty(m.qtyN) }}</td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">
                  <template v-if="m.buyCostN != null">{{ fmtBuy(m.buyCostN) }} {{ CURRENCY_JA[m.unitCurrency!] }}</template>
                  <template v-else>{{ money(m.costN) }}</template>
                </td>
              </tr>
              <tr class="border-t border-[var(--exile-color-border-brass)] font-display tracking-[0.04em]">
                <td class="py-1.5 pr-2">合計 (期待)</td>
                <td></td>
                <td></td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">{{ craft?.ok ? money(craft.expectedCost) : "—" }}</td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap text-[10px] text-[var(--exile-color-text-tertiary)]">{{ craft?.ok ? `完成 ${(attempts * craft.pFinished).toFixed(2)} 個` : "" }}</td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">{{ craft?.ok ? money(attempts * craft.expectedCost) : "—" }}</td>
              </tr>
            </tbody>
          </table>
          <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
            単価と費用は「取引所で買う時の通貨」の単位です (緑)。公式の取引所で カオス / 神 のうち安く買える方を出します (高貴は手数料が高いので外しています。ボタンで取得、30 分は取り直しません)。取っていない素材はカレンシーランキングの相場 ({{ unit }} 建て) のままです。合計だけ選んだ表示通貨 ({{ unit }}) に換算します。
            原石 (レベル 20) は「売る物」にだけ掛かります。壊れた物や売らない物には掛かりません。低レベルのジェム本体は、原石 (レベル 15〜20) のうち一番安い物の相場です (スピリットジェムはスピリットの原石)。
            結晶は「片方当たった時に賭ける」と決めた場合だけ使うので、1 回の数は期待値 (賭けない判断なら 0)。売値が揃うまでは「—」。
          </p>
        </div>
      </BaseCard>
    </div>

    <!-- 結果: 経路の比較 (2026-09-16 作り直し: 結論 1 行 + 経路の表 + やった場合の表) -->
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base mb-2">経路の比較</h2>
        <p v-if="summary" class="text-[14px] mb-3 leading-relaxed">
          <template v-if="summary.buyFinished">今の相場では、どの経路も<span class="font-display text-[var(--exile-color-accent-focus)]">完成品を買う</span>より損です。</template>
          <template v-else>
            今の相場なら <span class="font-display text-[var(--exile-color-accent-focus)]">{{ summary.label }}</span> が一番得:
            100 {{ unit }} 入れると平均 <span class="font-display tabular-nums text-[16px]" :class="evClass(summary.per100)">{{ money(summary.per100, true) }}</span>
            <span class="text-[12px] text-[var(--exile-color-text-secondary)]">({{ summary.attempts }} 回やって赤字になる確率 {{ summary.pLoss == null ? "—" : pct(summary.pLoss) }})</span>
          </template>
        </p>
        <div class="overflow-x-auto">
          <table class="w-full text-[12px]">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1">経路</th>
                <th class="text-right font-normal pb-1 pl-3 whitespace-nowrap">1 回の費用</th>
                <th class="text-right font-normal pb-1 pl-3 whitespace-nowrap">100 {{ unit }} あたりの損益</th>
                <th class="text-right font-normal pb-1 pl-3 whitespace-nowrap">完成品ができる確率</th>
                <th class="pb-1 pl-3"></th>
              </tr>
            </thead>
            <tbody>
              <template v-for="r in routesSorted" :key="r.id">
                <tr class="border-t border-[var(--exile-color-border-subtle)]" :class="isBest(r) ? 'text-[var(--exile-color-accent-focus)]' : ''">
                  <td class="py-1.5 pr-2">
                    <span>{{ r.label }}</span>
                    <span v-if="isBest(r)" class="ml-2 text-[10px] px-1 rounded bg-[var(--exile-color-accent-focus)]/15 text-[var(--exile-color-accent-focus)]">最も得</span>
                    <div v-if="r.id === 'craft' && r.ok" class="text-[10px] text-[var(--exile-color-text-tertiary)]">
                      レベル +1 のあと: {{ r.gambleAfterLevel ? "結晶で品質を賭ける" : "そのまま売る" }} / 品質 23% のあと: {{ r.gambleAfterQuality ? "結晶でレベルを賭ける" : "そのまま売る" }}
                    </div>
                  </td>
                  <template v-if="r.ok">
                    <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(r.expectedCost) }}</td>
                    <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap text-[14px]" :class="evClass(r.id === 'buyFinished' ? null : per100(r))">{{ r.id === "buyFinished" ? "0 (基準)" : money(per100(r), true) }}</td>
                    <td class="py-1.5 pl-3 text-right tabular-nums">{{ pct(r.pFinished) }}</td>
                    <td class="py-1.5 pl-3 text-right whitespace-nowrap">
                      <button type="button" class="text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]" @click="expanded[r.id] = !expanded[r.id]">{{ expanded[r.id] ? "▲ 内訳" : "▼ 内訳" }}</button>
                    </td>
                  </template>
                  <td v-else colspan="4" class="py-1.5 pl-3 text-[11px] text-[var(--exile-color-text-tertiary)]">不足: {{ r.missing.join("、") }}</td>
                </tr>
                <tr v-if="r.ok && expanded[r.id]">
                  <td colspan="5" class="pb-2 pl-3">
                    <div class="flex flex-wrap gap-x-5 gap-y-0.5 text-[11px] text-[var(--exile-color-text-secondary)] mb-1">
                      <span>1 回の期待収支 <span class="tabular-nums" :class="evClass(r.id === 'buyFinished' ? null : r.ev)">{{ money(r.ev, true) }}</span></span>
                      <span>確定費用 <span class="tabular-nums">{{ money(r.upfront) }}</span> (+ 結晶と原石の期待費用)</span>
                      <span v-if="r.costPerFinished != null && r.costPerFinished > 0">完成品 1 個の実質コスト <span class="tabular-nums">{{ money(r.costPerFinished) }}</span></span>
                    </div>
                    <table class="w-full text-[11px]">
                      <tbody>
                        <tr v-for="(o, i) in r.outcomes" :key="i" class="border-t border-[var(--exile-color-border-subtle)]">
                          <td class="py-0.5 pr-1">{{ o.label }}</td>
                          <td class="py-0.5 text-right tabular-nums w-14">{{ pct(o.p) }}</td>
                          <td class="py-0.5 text-right tabular-nums w-24">{{ money(o.net) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <div v-if="atCompare.length > 0" class="mt-3 rounded border border-[var(--exile-color-border-subtle)] p-3 text-[12px]">
          <div class="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <span class="font-display tracking-[0.04em]">やった場合</span>
            <div class="flex items-center gap-3 flex-wrap text-[11px]">
              <div class="inline-flex rounded border border-[var(--exile-color-border-subtle)] overflow-hidden">
                <button type="button" class="px-2 py-0.5" :class="compareMode === 'attempts' ? 'bg-[var(--exile-color-bg-elevated)] text-[var(--exile-color-accent-focus)]' : 'text-[var(--exile-color-text-secondary)]'" @click="compareMode = 'attempts'">回数で比べる</button>
                <button type="button" class="px-2 py-0.5" :class="compareMode === 'budget' ? 'bg-[var(--exile-color-bg-elevated)] text-[var(--exile-color-accent-focus)]' : 'text-[var(--exile-color-text-secondary)]'" @click="compareMode = 'budget'">予算で比べる</button>
              </div>
              <label v-if="compareMode === 'attempts'" class="inline-flex items-center gap-2 text-[var(--exile-color-text-secondary)]">
                回数
                <select v-model.number="attempts" class="num text-left w-20">
                  <option v-for="n in ATTEMPT_OPTIONS" :key="n" :value="n">{{ n }} 回</option>
                </select>
              </label>
              <label v-else class="inline-flex items-center gap-2 text-[var(--exile-color-text-secondary)]">
                予算
                <select v-model.number="budgetDisplay" class="num text-left w-28">
                  <option v-for="v in budgetOptions" :key="v" :value="v">{{ v }} {{ unit }}</option>
                </select>
              </label>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-[12px]">
              <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
                <tr>
                  <th class="text-left font-normal pb-1">経路</th>
                  <th class="text-right font-normal pb-1 pl-3">回数</th>
                  <th class="text-right font-normal pb-1 pl-3">総費用</th>
                  <th class="text-right font-normal pb-1 pl-3">期待損益</th>
                  <th class="text-right font-normal pb-1 pl-3">赤字の確率</th>
                  <th class="text-right font-normal pb-1 pl-3">完成品 1 個以上</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in atCompare" :key="r.id" class="border-t border-[var(--exile-color-border-subtle)]" :class="g.best.value && g.best.value.id === r.id ? 'text-[var(--exile-color-accent-focus)]' : ''">
                  <td class="py-1 pr-2">{{ r.label }}</td>
                  <td v-if="r.short || !r.risk" colspan="5" class="py-1 pl-3 text-right text-[11px] text-[var(--exile-color-text-tertiary)]">予算不足 (1 回 {{ money(r.cost1) }})</td>
                  <template v-else>
                    <td class="py-1 pl-3 text-right tabular-nums">{{ r.risk.attempts }} 回</td>
                    <td class="py-1 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(r.risk.cost) }}</td>
                    <td class="py-1 pl-3 text-right tabular-nums whitespace-nowrap" :class="evClass(r.id === 'buyFinished' ? null : r.risk.profit)">{{ r.id === "buyFinished" ? "0 (基準)" : money(r.risk.profit, true) }}</td>
                    <td class="py-1 pl-3 text-right tabular-nums">{{ r.id === "buyFinished" ? "—" : pct(r.risk.pLoss) }}</td>
                    <td class="py-1 pl-3 text-right tabular-nums whitespace-nowrap">{{ pct(r.risk.pAnyFinished) }} ({{ r.risk.expectedFinished.toFixed(2) }} 個)</td>
                  </template>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-1">
            回数で比べる: どの経路も同じ回数。予算で比べる: 回数 = 予算 ÷ 1 回の費用 (切り捨て)、1 回分に届かない経路は予算不足。
            期待損益は平均、赤字の確率は結果ごとの損益を回数ぶん引く試行を 1 万回やった中で赤字に終わった割合です (出来た物は全部その相場で売れた前提)。
          </p>
        </div>
        <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-3">
          「100 {{ unit }} あたりの損益」= 1 回の期待収支 ÷ 1 回の費用 × 100 {{ unit }}。1 回の費用が経路ごとに数十倍違うので、金額ではなく投資額あたりで比べ、一番高い経路を「最も得」にしています。
          1 回の費用は確定費用に結晶と原石の期待費用を足した額。完成品を買う経路が 0 の基準です。
        </p>
      </div>
    </BaseCard>

    <!-- 収支 (実績入力) 2026-09-13、経路と回数で埋める 2026-09-14 -->
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
          <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">
            収支<span v-if="g.selected.value" class="text-[12px] text-[var(--exile-color-text-secondary)] tracking-normal"> · {{ g.selected.value.ja }}</span>
          </h2>
          <div class="flex items-center gap-3 flex-wrap text-[11px] text-[var(--exile-color-text-secondary)]">
            <span>経路と回数を入れると使った数と売れた数が期待値で埋まる。実際と違う数だけ上書き</span>
            <button type="button" class="underline hover:text-[var(--exile-color-accent-focus)] disabled:opacity-40" :disabled="!g.selected.value" @click="resetLedger">全部 0 に</button>
          </div>
        </div>
        <p v-if="!g.selected.value" class="text-[12px] text-[var(--exile-color-text-tertiary)]">ジェムを選ぶと、そのジェムの帳簿が出ます。</p>
        <template v-else>
          <div class="mb-2 flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] text-[var(--exile-color-text-secondary)]">
            <label class="inline-flex items-center gap-2 min-w-0 max-w-full">
              経路
              <select :value="ledger.route ?? ''" class="num text-left w-72 max-w-full min-w-0" @change="setRoute">
                <option value="">最も得に合わせる{{ g.best.value ? ` (${g.best.value.label})` : "" }}</option>
                <option v-for="r in g.routes.value" :key="r.id" :value="r.id">{{ r.label }}</option>
              </select>
            </label>
            <label class="inline-flex items-center gap-2">
              回数
              <input :value="ledger.attempts || ''" type="number" min="0" step="1" placeholder="0" class="num w-20" @input="setAttempts" />
            </label>
            <span v-if="ledger.pricesAt">
              単価は {{ fmtStamp(ledger.pricesAt) }} 時点で固定
              <button type="button" class="ml-1 underline hover:text-[var(--exile-color-accent-focus)]" @click="refreshLedgerPrices">今の相場に更新</button>
            </span>
          </div>
          <!--
            オーナー指摘 (2026-09-17): 数字を打つと表の幅が動いて画面全体がズレる。
            自動列幅だと中身の桁数で毎回配分し直されるため、table-fixed + colgroup で固定する。
          -->
          <div class="overflow-x-auto">
          <table class="w-full table-fixed min-w-[36rem] text-[12px] break-words">
            <colgroup>
              <col />
              <col class="w-[13rem]" />
              <col class="w-[11rem]" />
              <col class="w-[8rem]" />
            </colgroup>
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1">素材</th>
                <th class="text-right font-normal pb-1 pl-3">単価 (空欄は固定した値 / 相場)</th>
                <th class="text-right font-normal pb-1 pl-3">使った数 (空欄は 1 回の数 × 回数)</th>
                <th class="text-right font-normal pb-1 pl-3">費用</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in ledgerRows" :key="r.key" class="border-t border-[var(--exile-color-border-subtle)]">
                <td class="py-1.5 pr-2">
                  <div>{{ r.label }}</div>
                  <div v-if="r.hint" class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ r.hint }}</div>
                </td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">
                  <MoneyInput
                    :model-value="r.each"
                    :placeholder-exalted="r.pinned ?? r.market"
                    width="w-24"
                    @update:model-value="setUnit(r.key, $event)"
                  />
                </td>
                <td class="py-1.5 pl-3 text-right">
                  <input :value="r.override ?? ''" type="number" min="0" step="1" :placeholder="fmtQty(r.auto)" class="num w-24" @input="setQty(r.key, $event)" />
                </td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(r.cost) }}</td>
              </tr>
              <tr class="border-t border-[var(--exile-color-border-brass)]">
                <td class="py-1.5 pr-2 font-display tracking-[0.04em]">費用合計</td>
                <td></td>
                <td></td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(ledgerTotals.cost) }}</td>
              </tr>
            </tbody>
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pt-3 pb-1">売れた物</th>
                <th class="text-right font-normal pt-3 pb-1 pl-3">1 個の売値 (空欄なら相場)</th>
                <th class="text-right font-normal pt-3 pb-1 pl-3">売れた数</th>
                <th class="text-right font-normal pt-3 pb-1 pl-3">売上</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in ledgerSales" :key="r.qtyKey" class="border-t border-[var(--exile-color-border-subtle)]">
                <td class="py-1.5 pr-2">{{ r.label }}</td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">
                  <MoneyInput :model-value="r.each" :placeholder-exalted="r.market" width="w-24" @update:model-value="setLedger(r.eachKey, $event)" />
                </td>
                <td class="py-1.5 pl-3 text-right">
                  <input :value="r.override ?? ''" type="number" min="0" step="1" :placeholder="fmtQty(r.auto)" class="num w-24" @input="setSold(r.qtyKey, $event)" />
                </td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(r.revenue) }}</td>
              </tr>
              <tr class="border-t border-[var(--exile-color-border-brass)]">
                <td class="py-1.5 pr-2 font-display tracking-[0.04em]">売上合計</td>
                <td></td>
                <td></td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(ledgerTotals.revenue) }}</td>
              </tr>
              <tr class="border-t border-[var(--exile-color-border-brass)]">
                <td class="py-1.5 pr-2 font-display tracking-[0.04em]">収支</td>
                <td class="py-1.5 pl-3 text-right tabular-nums text-[10px] text-[var(--exile-color-text-tertiary)] whitespace-nowrap">
                  {{ ledgerTotals.perFinished != null ? `完成 1 個あたり ${money(ledgerTotals.perFinished)}` : "" }}
                </td>
                <td class="py-1.5 pl-3 text-right tabular-nums text-[10px] text-[var(--exile-color-text-tertiary)] whitespace-nowrap">
                  {{ ledgerTotals.perAttempt != null ? `1 回あたり ${money(ledgerTotals.perAttempt, true)}` : "" }}
                </td>
                <td class="py-1.5 pl-3 text-right tabular-nums text-[14px] whitespace-nowrap" :class="evClass(ledgerTotals.profit)">{{ money(ledgerTotals.profit, true) }}</td>
              </tr>
            </tbody>
          </table>
          </div>
          <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
            単価は回数を入れた時点の値 (相場と取引所の安い方) で固定します。あとで相場が動いても、やった分の費用は変わりません。実際に払った額が違う時は単価の欄に直接入れてください (空欄に戻すと固定値に戻ります)。素材の「取引所で比べる」を押すと、その結果で固定単価も入れ替えます (手入力した分はそのまま)。「今の相場に更新」でも固定し直せます。
            使った数と売れた数は空欄なら「経路の 1 回の数 × 回数」で、結晶・原石・売れた数のように結果次第の物は期待値です。実際に違った数だけ入れてください。
            回数を入れた時点の「最も得」の経路で帳簿を固定します (相場が変わっても、やった分を別の経路で数え直さない)。
            買ったジェムと売れた物の値段は空欄なら上の売値 (trade2 最安)、実際の額があればそれを入れてください。「その他」は外れの生存品などで、空欄の売値は前提の割合から出した平均です。入力はジェムごとにこの PC に残ります。
            <span v-if="ledgerTotals.missingCost" class="text-amber-300">相場が取れていない素材があるため費用が不完全です。</span>
            <span v-if="ledgerTotals.missingSale" class="text-amber-300">売値が無い行があるため売上が不完全です。</span>
          </p>
        </template>
      </div>
    </BaseCard>

    <!-- 前提 -->
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <button
          type="button"
          class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base flex items-center gap-2"
          @click="showAssumptions = !showAssumptions"
        >
          <span>{{ showAssumptions ? "▲" : "▼" }}</span>
          <span>前提 (確率は非公開のためコミュニティ推定。ここで変えられます)</span>
        </button>
        <div v-if="showAssumptions" class="mt-3 grid grid-cols-1 @4xl:grid-cols-2 gap-4 text-[12px]">
          <div class="space-y-2">
            <div class="text-[11px] text-[var(--exile-color-text-secondary)]">ヴァールオーブ (未コラプトのジェムに 1 回)。4 系統の重み (比率で使う)</div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 items-center">
              <label>変化なし</label><input v-model.number="g.params.value.vaalNone" type="number" min="0" step="0.05" class="num" />
              <label>レベル ±1 (半々)</label><input v-model.number="g.params.value.vaalLevel" type="number" min="0" step="0.05" class="num" />
              <label>品質 −3〜+3 (均等)</label><input v-model.number="g.params.value.vaalQuality" type="number" min="0" step="0.05" class="num" />
              <label>ソケット ±1</label><input v-model.number="g.params.value.vaalSockets" type="number" min="0" step="0.05" class="num" />
              <label>品質の段数 (−3〜+3 なら 7)</label><input v-model.number="g.params.value.qualitySteps" type="number" min="2" step="1" class="num" />
            </div>
            <div class="text-[11px] text-[var(--exile-color-text-tertiary)]">
              → レベル +1: {{ pct(g.vaalP.value.levelUp) }} / 品質 23%: {{ pct(g.vaalP.value.qualityTop) }} / 外れ: {{ pct(g.vaalP.value.junk) }}
            </div>
          </div>
          <div class="space-y-2">
            <div class="text-[11px] text-[var(--exile-color-text-secondary)]">コラプトの結晶 (コラプト済みのジェムに)。生き残れば「まだ振っていない系統」だけを振り直す</div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 items-center">
              <label>破壊される確率</label><input v-model.number="g.params.value.crystalDestroy" type="number" min="0" max="1" step="0.05" class="num" />
              <label>外れた生存品の価値 (元の値段の割合)</label><input v-model.number="g.params.value.leftoverFraction" type="number" min="0" max="1" step="0.05" class="num" />
            </div>
            <div class="text-[11px] text-[var(--exile-color-text-tertiary)]">
              レベル 21 から品質 23% を当てる: 生存 × 1/{{ Math.max(2, Math.round(g.params.value.qualitySteps)) - 1 }} /
              品質 23% からレベル +1 を当てる: 生存 × 1/2
            </div>
            <button type="button" class="text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]" @click="g.resetParams">
              既定値に戻す
            </button>
          </div>
          <div class="@4xl:col-span-2 text-[11px] text-[var(--exile-color-text-tertiary)] leading-relaxed">
            ゲームクライアントにあるのは「コラプトの結晶: コラプト状態のスキルジェムを予測不可能に変化させるか、または破壊する」「穢れにより +1 レベル」
            といった文言と対象アイテム種 (スキル / サポート / メタジェム) までで、確率は入っていません。既定値は 4 系統等確率・品質 7 段階均等・結晶の破壊 50% です。
            レベル上げは「原石」でコラプト後も可能なので、レベルは最後に上げる前提で計算しています (壊れた物にレベル代を払わない)。
          </div>
        </div>
      </div>
    </BaseCard>

    <footer class="text-[11px] text-[var(--exile-color-text-tertiary)] flex items-center gap-4 flex-wrap">
      <span>ジェム一覧 / 素材の名前と説明: ゲームクライアント (SkillGems, BaseItemTypes, GemTags, CurrencyItems)</span>
      <span>素材価格: カレンシーランキングの相場 (poe2scout 由来)</span>
      <span>売値: trade2 (取得ボタンは検索 3 回、鑑定は API 不使用)</span>
    </footer>
    <SoldListDialog
      :open="soldOpen"
      :title="g.selected.value?.ja ?? ''"
      :keys="soldKeys"
      :store="flowStore"
      @close="soldOpen = false"
    />
  </section>
</template>

<style scoped>
.num {
  width: 5.5rem;
  text-align: right;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--exile-color-bg-surface);
  border: 1px solid var(--exile-color-border-subtle);
  font-variant-numeric: tabular-nums;
}
.num:focus {
  outline: none;
  border-color: var(--exile-color-accent-focus);
}
</style>
