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
  id: "fractured" | "strict" | "loose";
  label: string;
  /** 初動 (高貴換算)。選べない時は null */
  cost: number | null;
  note: string;
  link: { text: string; url: string } | null;
  /** 取れて固定済みが無かった時だけ手で入れる欄を出す */
  manual: boolean;
  /** 値段が無い時に出す言葉 */
  status: string;
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
  for (const [key, label] of [["strict", "固定無し・厳しいを買って固定"], ["loose", "固定無し・ゆるいを買って固定"]] as const) {
    if (!r) { rows.push({ id: key, label, cost: null, note: "", link: null, manual: false, status: waiting }); continue; }
    const err = errOf(key);
    if (err) { rows.push({ id: key, label, cost: null, note: `取れず: ${err}`, link: null, manual: false, status: "取れず" }); continue; }
    const b = r[key];
    const total = r.found.find((x) => x.key === key)?.total ?? 0;
    // 85% に届く個数をまとめて買う合計。出品が足りない (足りない分を仮に足した) なら挑戦できない
    const ok = b != null && b.assumed === 0;
    rows.push({
      id: key, label, cost: ok ? b.total * div : null, link: linkOf(key), manual: false, status: "-",
      note: ok ? `${b.count} 個まとめて買う (85%)`
        : b ? `出品が足りない (${total} 件、85% に ${b.count} 個要る)` : `出品が足りない (${total} 件)`,
    });
  }
  return rows.sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity));
}
