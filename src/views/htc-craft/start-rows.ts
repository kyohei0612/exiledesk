/**
 * start-rows.ts — 始め方の行 (固定済みを買う / 固定無し・厳しい / ゆるい) を 3 本の結果から作る (2026-09-24)
 *
 * 固定済みにする MOD の候補の各行 ([[useStartSearch.ts]]) で同じ物を出す。
 *   - 固定済みを買う        … 最安 1 件。取れて見つからなければ手で値段を入れる
 *   - 固定無し・厳しい / ゆるい … **85% に届く個数をまとめて買う合計**。出品がその個数に足りなければ挑戦できない (選べない)
 *   - 取れなかった検索 (上限など) は「取れず」と理由を出し、0 件と区別する
 *   - 取れるまでは「取得中…」(busy) / 「まだ」
 */
import type { TreeResult } from "./useTreeSearch";
import { FRACTURE_BATCH } from "./white-prep";

export interface StartRow {
  id: string;
  label: string;
  /** 初動 (高貴換算)。選べない時は null */
  cost: number | null;
  note: string;
  link: { text: string; url: string } | null;
  /** 取れて固定済みが無かった時だけ手で入れる欄を出す */
  manual: boolean;
  /** 値段が無い時に出す言葉 */
  status: string;
  /** 初動 + 作る見込み (useStartSearch で足す。見込みが出るまでは null) */
  total?: number | null;
  /**
   * 画面の「ベース」に出す額 (素材 1 個分)。cost との差はクラフト費用に入れて見せる (2026-10-04 オーナー「ベースは 24 神でしょ」
   * 「複数買って作るならそれはクラフト費用として乗せるべき」)。無ければ cost をそのままベースに
   */
  basePrice?: number | null;
  /** ベースを何個買うか (5 個で 1 個固定する道は 5) と 1 個の値段 (一番安い物)。画面は「ベース 1 個 × 5 = ベース代」(2026-10-04 オーナー「ベース買うなら *5 とかで表示」) */
  baseCount?: number;
  baseUnit?: number | null;
  /**
   * 作り方のツリーに入れる初動 (無ければ cost)。白のベースから は 1 個分のベース + 外れ 4 個分 (ベース + 固定までの平均)。
   * 当たりの 1 個のマジックの段とフラクチャーはツリーの中で回す (2026-10-04)
   */
  treeStart?: number | null;
}

/** r = 3 本の結果 (まだなら null)。div = 神の値段 (高貴)。manualDivine = 手で入れた固定済みの値段 (神) */
export function startRows(r: TreeResult | null, div: number, opts: { busy: boolean; manualDivine: number | null }): StartRow[] {
  const linkOf = (key: string): StartRow["link"] => {
    const f = r?.found.find((x) => x.key === key);
    return f?.url ? { text: `${f.total} 件`, url: f.url } : null;
  };
  const errOf = (key: string): string | null => r?.found.find((x) => x.key === key)?.error ?? null;
  const waiting = opts.busy ? "取得中…" : "まだ";
  const m = opts.manualDivine != null && opts.manualDivine > 0 ? opts.manualDivine * div : null;
  const frErr = errOf("fractured");
  const rows: StartRow[] = [{
    id: "fractured", label: "固定済みを買う", cost: r?.fracturedPrice != null ? r.fracturedPrice * div : m, note: frErr ? `取れず: ${frErr}` : "",
    link: linkOf("fractured"), manual: !!r && r.fracturedPrice == null, status: r ? (frErr ? "取れず" : "出品なし") : waiting,
  }];
  // 固定無しの最安 1 件を、固定せずにそのまま作る (その MOD は触らない: 消去は使わず冒涜 + 光で作る側になる)
  if (r && r.loosePrice != null) {
    rows.push({ id: "keep", label: "固定無しを買ってそのまま作る (固定しない)", cost: r.loosePrice * div, note: "その MOD は触らない (消去を使わない側)", link: linkOf("loose"), manual: false, status: "-" });
  }
  for (const [key, label] of [["loose", "固定無しを買って固定"]] as const) {
    if (!r) { rows.push({ id: key, label, cost: null, note: "", link: null, manual: false, status: waiting }); continue; }
    const err = errOf(key);
    if (err) { rows.push({ id: key, label, cost: null, note: `取れず: ${err}`, link: null, manual: false, status: "取れず" }); continue; }
    const b = r[key];
    const total = r.found.find((x) => x.key === key)?.total ?? 0;
    // 5 個買って 5 個ともフラクチャーまで進め、1 個だけ成功する前提 (2026-10-04 オーナー「5 個を基本としよう。必ず 5 でスタートして 1 個作れると仮定」
    // 「MOD 付きの奴を買うのも同じで、4 つは失敗する費用 (ベースとフラクチャー代) をクラフト費用に入れて、1 つはフラクチャー成功した時のそれ以降を
    // 自動クラフトで回そう」「ベース買うなら *5 とかで表示」)。安い順に 5 件の「1 回分」(値段 + 固定までの代) の合計。ベース代は 5 個分、固定の代はクラフト費用に見せる
    const route = r.routes.find((x) => x.key === key);
    const tries = route ? [...route.decision.order, ...route.decision.skipped].filter((x) => x.how !== "buy").sort((a, z) => a.perTry - z.perTry).slice(0, FRACTURE_BATCH) : [];
    if (tries.length < FRACTURE_BATCH) {
      rows.push({ id: key, label, cost: null, link: linkOf(key), manual: false, status: "-", note: `出品が足りない (${total} 件、${FRACTURE_BATCH} 個要る)` });
      continue;
    }
    void b;
    rows.push({
      id: key, label, cost: tries.reduce((a, x) => a + x.perTry, 0) * div, basePrice: tries.reduce((a, x) => a + x.listing.price, 0) * div,
      baseCount: FRACTURE_BATCH, baseUnit: tries[0]!.listing.price * div, link: linkOf(key), manual: false, status: "-",
      note: `${FRACTURE_BATCH} 個買って 5 個ともフラクチャーまで進め、1 個固定できる前提 (1 個 ${tries[0]!.listing.price.toFixed(1)} 神〜。ベース代は 5 個分、固定の代 (5 個分) はクラフト費用に)`,
    });
  }
  return rows.sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity));
}
