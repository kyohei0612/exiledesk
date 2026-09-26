/**
 * use-gem-sale.ts — ジェムコラプト収支の売値 (手入力 or trade2) と、現物の値段の取得
 *
 * useGemCorrupt.ts から切り出し (2026-09-26)。
 *   売値: 手入力、または trade2 で最安を 3 回検索 (レベル 21 / 品質 23% / 完成品)。
 *         「鑑定 ↗」は API を叩かず ?q= でトレードサイトを開く (レート制限に当たらない)。
 */
import { ref, watch, type ComputedRef, type Ref } from "vue";
import { marketStore } from "../../state/market-store";
import { buildGemQuery, type GemQueryOptions } from "../../services/trade2/query";
import { trade2QueryUrl } from "../../services/trade2/league";
import { type PriceResult } from "../../services/trade2/pricing";
import { noteSpiritGem, spiritGemMeasured } from "../../state/gem-spirit";
import { baseSourceOf, cachedBaseBuy, noteBaseBuy } from "../../state/gem-base-source";
import { loadFlow, type FlowStore } from "../../services/market-flow";
import { autoPrice, isRateLimited, tradeAuto } from "../../services/trade2/auto-price";
import { originalGemQuery, rowQueryOptions, watchKey } from "./row-query";
import { recordGemSample } from "./sample-now";
import { tradeErrorJa } from "../../utils/trade-error";
import type { SalePrices } from "./model";
import { SALE_ROWS, type GemInfo, type SaleKey } from "./gem-list";

export interface GemSaleDeps {
  selected: Ref<GemInfo | null>;
  tradeLeague: ComputedRef<string>;
  /** スピリット判定の作り直しの目印 (use-gem-materials.ts) */
  spiritBump: Ref<number>;
  /** 調達先・現物の値段の作り直しの目印 (use-gem-materials.ts) */
  baseBump: Ref<number>;
  fetchExchange: () => Promise<void>;
}

export function useGemSale({ selected, tradeLeague, spiritBump, baseBump, fetchExchange }: GemSaleDeps) {
  const rates = marketStore.rates;

  // ---- 売値 (手入力 or trade2) ----
  const sale = ref<SalePrices>({ level21: null, quality23: null, finished: null });
  const saleInfo = ref<Record<SaleKey, PriceResult | null>>({ level21: null, quality23: null, finished: null });
  const pricing = ref(false);
  const priceError = ref<string | null>(null);

  /**
   * 一括取得 (自動巡回) が最後に見た最安値を売値の初期値にする
   * (オーナー指示 2026-09-17:「レート制限中でも一括で取った最終の値で計算してくれ。
   * ジェムコラの検索・計算はどのページから遷移しても」)。
   *
   * レート制限中は trade2 を叩けないので、以前は売値が空のまま何も計算できなかった。
   * 記録はこの PC のファイルなので読むのに通信は要らない。取得が通れば上書きされる。
   */
  const flow = ref<FlowStore | null>(null);
  /** その売値が記録由来の時、その記録を取った時刻 (unix 秒)。取得し直すと null に戻る */
  const saleRecordedAt = ref<Record<SaleKey, number | null>>({ level21: null, quality23: null, finished: null });
  function refreshFlow(): void {
    void loadFlow().then((f) => {
      flow.value = f;
      // 読み込みが間に合わずに空だった分をここで埋める
      if (selected.value) applyRecordedSale(selected.value.en, false);
    });
  }
  /** 記録の最安値を高貴建てに直す */
  function recordedExalted(key: SaleKey, en: string): { exalted: number; at: number } | null {
    const st = flow.value?.states?.[watchKey(en, key)];
    const amount = st?.cheapest_amount;
    if (st == null || amount == null || !(amount > 0)) return null;
    const r = rates.value;
    const cur = st.cheapest_currency ?? "exalted";
    const exalted =
      cur === "exalted" ? amount : cur === "divine" ? (r.divine > 0 ? amount * r.divine : null) : cur === "chaos" ? (r.chaos > 0 ? amount * r.chaos : null) : null;
    return exalted == null ? null : { exalted: Math.round(exalted * 100) / 100, at: st.sampled_at };
  }
  /** 記録の値を売値に入れる (overwrite = false なら空いている欄だけ) */
  function applyRecordedSale(en: string, overwrite: boolean): void {
    const next = { ...sale.value };
    const at = { ...saleRecordedAt.value };
    for (const row of SALE_ROWS) {
      if (!overwrite && next[row.key] != null) continue;
      const rec = recordedExalted(row.key, en);
      if (!rec) continue;
      next[row.key] = rec.exalted;
      at[row.key] = rec.at;
    }
    sale.value = next;
    saleRecordedAt.value = at;
  }

  function queryOptions(key: SaleKey): GemQueryOptions {
    // 5 ソケットは常に必須 (コラプト済みはソケットを足せないため)
    return rowQueryOptions(key, selected.value?.kind === "meta");
  }
  /** 現物を買う時に見る出品数 (オーナー指示 2026-09-19:「50 個、最安値から取得して」) */
  const BASE_BUY_DEPTH = 50;
  /**
   * 現物 50 件の取り直しを我慢する時間。
   * 1 回で search 1 + fetch 5 = **6 リクエスト** 使う (売値の 3 条件で別に 6 使うので、
   * ジェムを選ぶたびに 12)。5 分 28 回の枠にすぐ届くので、自動で取る時はこの時間内なら使い回す。
   * 「再取得」を押した時は必ず取り直す。
   */
  const BASE_BUY_FRESH_MS = 30 * 60 * 1000;
  /**
   * 現物を買うジェムの「低レベルのジェム本体」をトレードサイトで開く URL
   * (素のジェム: コラプト無し・二重コラプト無し・即時購入。売値の行の「トレード2へ」と同じ ?q= 方式、API は使わない)。
   * オーナー 2026-09-19「素材も現物ならトレードサイトへ同じように素材からでも遷移できるように」
   */
  function baseTradeUrl(): string | null {
    const gem = selected.value;
    if (!gem) return null;
    return trade2QueryUrl(tradeLeague.value, originalGemQuery(gem.en, gem.kind === "meta"));
  }
  function tradeUrl(key: SaleKey): string | null {
    if (!selected.value) return null;
    // 自動取得済みなら検索 ID 付き URL (サイト側で ?q= を解釈させなくて済む)
    const done = saleInfo.value[key]?.searchUrl;
    if (done) return done;
    return trade2QueryUrl(tradeLeague.value, buildGemQuery(selected.value.en, queryOptions(key)));
  }

  /** 選んだジェムの 3 状態を trade2 で取る (自動 / 再取得)。制限中は何もしない */
  let fetchSeq = 0;
  /**
   * 2026-09-14: 別のジェムの取得中に選び直したら、その取得は捨てて新しいジェムで取り直す
   * (以前は取得中フラグで新しい取得が始まらず、前のジェムの売値が新しいジェムに書き込まれていた)
   */
  function abandonFetch(): void {
    fetchSeq++;
    pricing.value = false;
  }
  /**
   * 手動の「再取得」を捌き速度の記録に回す。
   *
   * 2026-09-17 以降は売値も巡回も同じ条件 (securable = 即時購入のみ) なので、
   * 手動で取った結果も自動巡回とまったく同じルールで判定できる
   * (消えた判定まで含む。オーナー指示「同じルールで手動でもやればいい」)。
   */
  async function recordRowSample(gemEn: string, key: SaleKey, r: PriceResult): Promise<void> {
    // 記録の中身は「監視に足した時の 1 回取り」と共通 (sample-now.ts)。スピリット判定もそこで覚える
    await recordGemSample(gemEn, key, r);
    spiritBump.value++;
  }

  /**
   * 素のスキル (コラプト無し・二重コラプト無し) を見る。2 つの用途:
   *   - スピリットをリザーブするか (= どちらの原石か)。ジェムごとに一度きり
   *   - 原石から作れないジェム (カルグール系) は、この最安がそのまま「低レベルのジェム本体」の値段
   *     (オーナー指摘 2026-09-19:「元のスキルはトレードから現物買うしかないよね」)。こちらは毎回取り直す
   */
  async function measureOriginal(gem: GemInfo, force = false): Promise<void> {
    if (isRateLimited()) return;
    const buying = baseSourceOf(gem.en) === "buy";
    const cached = cachedBaseBuy(gem.en);
    if (buying && !force) {
      // 自動で開いた時は、覚えている 50 件が新しければ投げ直さない (6 リクエスト節約)
      if (cached?.prices?.length && Date.now() - cached.at < BASE_BUY_FRESH_MS) return;
    }
    // 何も覚えていない初回は 10 件 (search 1 + fetch 1) で軽く取って、まず値段を出す。
    // 50 件 (fetch 5 回) は「再取得」を押した時と、30 分経って取り直す時だけ
    // (2026-09-19 オーナー「現物あるのに費用が出ない」: 6 リクエスト要る取得が 4 本目に回されて
    //  枠待ちで落ち、現物の値段が永久に「相場なし」のままだった)
    const depth = buying ? (force || cached?.prices?.length ? BASE_BUY_DEPTH : undefined) : undefined;
    // 現物を買うジェムは最安 50 件まで見る (N 個買う時の合計を積むため。fetch は 10 件ずつ = 5 回)。
    // 種類の判定 (スピリットか) だけなら 10 件で足りる
    const r = await autoPrice(tradeLeague.value, originalGemQuery(gem.en, gem.kind === "meta"), rates.value, depth);
    if (!r) return;
    if (r.reservesSpirit != null) {
      noteSpiritGem(gem.en, r.reservesSpirit);
      spiritBump.value++;
    }
    if (buying) {
      const prices = r.listings.map((l) => l.amountExalted).filter((v) => Number.isFinite(v));
      noteBaseBuy(gem.en, r.minExalted, r.total, prices);
      baseBump.value++;
    }
  }

  /**
   * 待ち (罰則 / 枠待ち) で取得を見送った = 明けたら自動で取り直す。
   *
   * 2026-09-19 オーナー「次とってくれない、カルグール」: 開いた時に枠待ちで見送ると、
   * 明けても誰も取りに行かず「未取得 (再取得で取ります)」のまま。人が押さなくても取るようにする
   */
  const retryWhenFree = ref(false);
  async function fetchSalePrices(force = false): Promise<void> {
    if (!selected.value || pricing.value) return;
    if (isRateLimited()) {
      retryWhenFree.value = true;
      return;
    }
    retryWhenFree.value = false;
    const gem = selected.value;
    const seq = ++fetchSeq;
    pricing.value = true;
    priceError.value = null;
    try {
      // 現物を買うジェムは、売値より先に現物の値段を取る。素材費が無いと 4 経路すべて計算できないので
      // 後回しにすると枠待ちで落ちた時に画面が「相場なし」のまま止まる (2026-09-19)
      if (baseSourceOf(gem.en) === "buy") await measureOriginal(gem, force);
      for (const row of SALE_ROWS) {
        const body = buildGemQuery(gem.en, queryOptions(row.key));
        const r = await autoPrice(tradeLeague.value, body, rates.value);
        if (seq !== fetchSeq) return; // 別のジェムに切り替わった
        if (!r) continue;
        saleInfo.value = { ...saleInfo.value, [row.key]: r };
        if (r.minExalted != null) {
          sale.value = { ...sale.value, [row.key]: Math.round(r.minExalted * 100) / 100 };
          saleRecordedAt.value = { ...saleRecordedAt.value, [row.key]: null };
        }
        // 3 条件 (レベル 21 / 品質 23% / 完成品) とも記録する。自動巡回と同じルール
        void recordRowSample(gem.en, row.key, r);
      }
      // 原石の種類がまだ実測できていなければ、素のスキルを 1 回だけ見る (現物を買うジェムは上で取り済み)
      if (!spiritGemMeasured(gem.en) && baseSourceOf(gem.en) !== "buy") await measureOriginal(gem, force);
      // 画面に出すのは日本語にしてから (2026-09-21 に戻した)
      priceError.value = tradeErrorJa(tradeAuto.lastError.value);
      // 途中で待ちに入った (どれかが null で返った) なら、明けたら続きを取る
      if (seq === fetchSeq && isRateLimited()) retryWhenFree.value = true;
    } finally {
      if (seq === fetchSeq) pricing.value = false;
    }
  }
  // 待ちが明けた瞬間に取り直す (1 秒ごとに数え直している残り秒を見る)
  watch(
    () => tradeAuto.rateLimitSecs.value,
    (secs) => {
      if (secs === 0 && retryWhenFree.value && selected.value && !pricing.value) void fetchSalePrices();
    },
  );
  // オーナー指示 (2026-09-12): ジェムを選んだら自動で取る。ソケット条件を変えた時も取り直す。
  // 2026-09-19:「素材 (元の加工されていないジェムやカレンシー) は取引所検索して最安値で表示」を
  // 既定にする。取引所の比較は poe2scout のペア相場なので trade2 の枠は使わない (30 分キャッシュ)
  watch(selected, () => {
    if (!selected.value) return;
    void fetchSalePrices();
    void fetchExchange();
  });

  return {
    sale,
    saleInfo,
    saleRecordedAt,
    pricing,
    priceError,
    retryWhenFree,
    refreshFlow,
    applyRecordedSale,
    baseTradeUrl,
    tradeUrl,
    abandonFetch,
    measureOriginal,
    fetchSalePrices,
  };
}
