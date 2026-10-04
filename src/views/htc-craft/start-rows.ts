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
    // 初動は平均 (安い物から 1 個ずつ試して、当たったら止める。外れ続けたら固定済みを買う)。2026-10-04 まで 85% に届く個数をまとめて買う額で、
    // オーナー「ベースに 161 神もかかんのか、24 神でしょ」。ベースは 1 個分、2 個目以降と固定の代 (オーブ・深淵のエッセンス・冒涜) はクラフト費用に
    const route = r.routes.find((x) => x.key === key);
    if (!route || r.loosePrice == null) {
      rows.push({ id: key, label, cost: null, link: linkOf(key), manual: false, status: "-", note: `出品が足りない (${total} 件)` });
      continue;
    }
    const s = route.summary;
    rows.push({
      id: key, label, cost: s.expected * div, basePrice: r.loosePrice * div, link: linkOf(key), manual: false, status: "-",
      note: `1 個 ${r.loosePrice.toFixed(1)} 神〜 × 平均 ${s.avgItems.toFixed(1)} 個で 1 個固定 (外れると別の MOD が固定されて使えない)${b ? `。85% なら ${b.count} 個` : ""}`,
    });
  }
  return rows.sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity));
}
