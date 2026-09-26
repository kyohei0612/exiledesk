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
 *
 * 2026-09-26: 型と保存は ledger-book.ts、行と合計の組み立ては ledger-rows.ts へ分けた。
 * ここには帳簿の状態と書き込みだけが残る。呼ぶ側は今まで通り ledger から取れる。
 */
import { computed, ref, watch, type Ref } from "vue";
import { askConfirm } from "../../state/confirm-dialog";
import type { RouteId } from "./model";
import type { useGemCorrupt } from "./useGemCorrupt";
import { EMPTY_LEDGER, LEDGER_KEY, loadBook, type EachKey, type GemLedger, type GemLedgerApi, type LedgerBook, type RowKey, type SoldKey } from "./ledger-book";
import { routeRows, useLedgerTotals } from "./ledger-rows";

export { fmtQty, type EachKey, type GemLedger, type GemLedgerApi, type LedgerRowDef, type RowKey, type SoldKey } from "./ledger-book";

/**
 * @param attempts 「N 回やった場合」の N。**素材・経路の札と同じ物**を受け取る
 *   (オーナー指示 2026-09-20:「回数はどこ動かしてもどれも一緒に変化させて欲しい、収支も含めて」)。
 *   ジェムごとに保存もするので、開き直すとそのジェムで入れた回数に戻る。
 */
export function useGemLedger(g: ReturnType<typeof useGemCorrupt>, attempts: Ref<number>): GemLedgerApi {
  const book: Ref<LedgerBook> = ref(loadBook());
  const ledgerGem = computed(() => g.selected.value?.en ?? "");

  // ジェムを選び直したら、そのジェムで入れた回数を共有の回数に戻す (入れていなければ今の値のまま)
  watch(ledgerGem, (en) => {
    const saved = en ? (book.value[en]?.attempts ?? 0) : 0;
    if (saved > 0) attempts.value = saved;
  });

  const ledger = computed<GemLedger>(() => {
    const raw = book.value[ledgerGem.value] ?? {};
    return {
      ...EMPTY_LEDGER,
      route: raw.route ?? null,
      // 回数は素材・経路と共通の値を使う (保存は下の setAttempts でジェムごとに残す)
      attempts: attempts.value,
      qty: { ...(raw.qty ?? {}) },
      unit: { ...((raw as { buyEach?: Partial<Record<RowKey, number>> }).buyEach ?? {}), ...(raw.unit ?? {}) },
      prices: { ...(raw.prices ?? {}) },
      pricesAt: raw.pricesAt ?? 0,
      sold: { ...(raw.sold ?? {}) },
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

  /** 今の単価を写し取る (行ごと、相場 or 取引所の安い方) */
  function snapshotPrices(routeId: RouteId): Partial<Record<RowKey, number>> {
    const out: Partial<Record<RowKey, number>> = {};
    for (const r of routeRows(g, routeId)) if (r.market != null) out[r.key] = r.market;
    return out;
  }

  /**
   * 回数が変わった時にジェムごとの帳簿へ書く。
   * 回数を入れた時点の「最も得」で経路を固定し (2026-09-15)、単価もその時点で固定する (2026-09-16 オーナー指示)。
   * あとで相場が動いても、やった分の費用を数え直さない。
   */
  function applyAttempts(n: number): void {
    if (!ledgerGem.value) return;
    // 回数が変わったら、結晶・原石・売れた数の手入力は捨てて期待値の既定に戻す
    // (オーナー指摘 2026-09-20:「今、前の入力が残ってしまってる」)。素材の確定分 (1 回 × N) はそのまま。
    // 下の 2 つの書き込みはどちらもこの l を元にするので、ここで消してから渡す
    const prev = ledger.value;
    const l: GemLedger = n !== prev.attempts ? { ...prev, qty: dropChained(prev.qty), sold: {} } : prev;
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
  // 素材・経路の札で回数を変えた時も、収支の記録と固定を同じように動かす (2026-09-20)
  watch(attempts, (n) => applyAttempts(n));

  /** 収支の「回数」欄。共有の値を動かすので、素材・経路の表も一緒に変わる */
  function setAttemptsValue(n: number | null): void {
    attempts.value = Math.max(0, Math.floor(n ?? 0));
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
   *
   * 2026-09-20: 取引所の比較は「取引所で比べる」ボタンではなくジェムを選んだ時に自動で走るので
   * (オーナー「取引所価格がデフォだから、別にもうボタンいらんくね」)、取得が終わったのを見て
   * ここを呼ぶ。ボタンがやっていた入れ替えが自動で続く。
   */
  async function fetchExchangeAndRepin(): Promise<void> {
    await g.fetchExchange();
    repinFromExchange();
  }
  function repinFromExchange(): void {
    if (!ledgerGem.value) return;
    if (Object.keys(ledger.value.prices).length === 0) return; // まだ回数を入れていない = 固定前
    refreshLedgerPrices();
  }
  // 自動で走った分も拾う (取得中 → 終わった の変わり目)
  watch(
    () => g.exchangeLoading.value,
    (now, prev) => {
      if (prev && !now) repinFromExchange();
    },
  );

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
    // 経路を変えたら、結晶・原石・売れた数の手入力は捨てて、新しい経路の期待値に戻す (オーナー 2026-09-26:「プルダウンで
    // 項目を変えた時、そこだけなぜか固定」。前の経路の数が上書きとして残っていた)
    if (!ledgerGem.value) return;
    book.value = { ...book.value, [ledgerGem.value]: { ...ledger.value, route: v === "" ? null : (v as RouteId), qty: dropChained(ledger.value.qty), sold: {} } };
  }
  /** 結晶と原石の上書きを外す (連鎖で数える既定に戻す) */
  function dropChained(qty: GemLedger["qty"]): GemLedger["qty"] {
    const out = { ...qty };
    delete out.crystal;
    delete out.uncut20;
    return out;
  }
  /** 使った数。null = 空欄 = 灰色の既定値 (1 回の数 × 回数) を使う */
  function setQtyValue(key: RowKey, v: number | null): void {
    const qty = { ...ledger.value.qty };
    if (v == null) delete qty[key];
    else qty[key] = v;
    setLedger("qty", qty);
  }
  /** 売れた数。null = 空欄 = 期待値を使う */
  function setSoldValue(key: SoldKey, v: number | null): void {
    const sold = { ...ledger.value.sold };
    if (v == null) delete sold[key];
    else sold[key] = v;
    setLedger("sold", sold);
  }
  function clearCounts(): void {
    if (!ledgerGem.value) return;
    book.value = { ...book.value, [ledgerGem.value]: { ...ledger.value, qty: {}, sold: {} } };
  }
  function clearEach(): void {
    if (!ledgerGem.value) return;
    book.value = { ...book.value, [ledgerGem.value]: { ...ledger.value, eachLevel21: null, eachQuality23: null, eachFinished: null, eachOther: null } };
  }
  /**
   * そのジェムの帳簿を丸ごと消す (回数・経路・固定した単価・使った数・売れた数・売値)。
   * 取り消せないので必ず聞く (オーナー指摘 2026-09-21:「3 も確認したほうがいいね」)。
   */
  async function resetLedger(): Promise<void> {
    const en = ledgerGem.value;
    if (!en) return;
    const ok = await askConfirm(
      `${g.selected.value?.ja ?? en} の帳簿を全部消します。\n回数・経路・固定した単価・使った数・売れた数が消えて、元に戻せません。`,
      { title: "帳簿を全部 0 に", okLabel: "全部消す", danger: true },
    );
    if (!ok) return;
    const next = { ...book.value };
    delete next[en];
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

  // 使った物 / 売れた物 / 合計の行は ledger-rows.ts (2026-09-26 の分割)
  const { ledgerRows, ledgerSales, ledgerTotals } = useLedgerTotals(g, ledger, ledgerRouteId);

  return {
    ledger,
    ledgerRouteId,
    ledgerRows,
    ledgerSales,
    ledgerTotals,
    setAttemptsValue,
    setRoute,
    setQtyValue,
    setSoldValue,
    setUnit,
    setEach,
    resetLedger,
    clearCounts,
    clearEach,
    refreshLedgerPrices,
    fetchExchangeAndRepin,
  };
}
