/**
 * sold-list-rows.ts — 売れたリストの行の組み立て (条件ごとのまとめ / 売れた出品 / 確認ごとのまとめ / まだ並んでいる出品)
 *
 * SoldListDialog.vue から切り出し (2026-09-26)。記録を読んで行にするだけの純粋関数。
 */
import { fateOf, flowSentence, summarizeFlow, type FlowStore, type Tracked } from "../services/market-flow";
import { averageExalted } from "../state/display-currency";

export type SoldKeyDef = { key: string; label: string };

export function fmtAmount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n >= 100 ? String(Math.round(n)) : n.toFixed(n < 10 ? 1 : 0).replace(/\.0$/, "");
}
const startOf = (t: Tracked): number => t.listed_at ?? t.first_seen;

export interface Row {
  id: string;
  cond: string;
  account: string;
  amount: number | null | undefined;
  currency: string | null | undefined;
  listedAt: number | null;
  firstSeen: number;
  goneAt: number;
  /** 出品されてから消えるまで (並んでいた時間) */
  life: number;
  /** 出品時刻が取れていない (並んでいた時間は「初めて見てから」で数えた) */
  estimated: boolean;
  /** 値段の付け替え (消えた直後に同じ出品者が並べ直した) */
  relisted: boolean;
  /** 出品時刻か出品者が分からず、売れたと言えない (2026-09-26 監査。売れた件数に入れない) */
  unknown: boolean;
}

/** 条件ごとのまとめ */
export function buildSummaries(keys: SoldKeyDef[], store: FlowStore | null) {
  return keys.map((k) => {
    const st = store?.states?.[k.key];
    const f = summarizeFlow(st);
    const watched = store?.watches?.some((w) => w.key === k.key);
    return {
      key: k.key,
      label: k.label,
      // 根拠が 3 件未満の判定には「?」を付ける (2026-09-20)
      verdict: (f.thin ? `${f.label}?` : f.label) || (f.gone + f.alive > 0 ? "判定待ち" : watched ? "巡回待ち" : "記録なし"),
      sentence: flowSentence(f),
      tone: f.tone,
      gone: f.gone,
      alive: f.alive,
      medianMin: f.medianMin,
      olderThanMedian: f.olderThanMedian,
      avgSold: averageExalted(f.soldPrices),
      droppedUnsold: f.droppedUnsold,
      truncated: f.truncated,
      total: st?.total ?? null,
      cheapest: st?.cheapest_amount ?? null,
      cheapestCur: st?.cheapest_currency ?? null,
      sampledAt: st?.sampled_at ?? 0,
      stale: f.stale,
    };
  });
}

/** 消えた出品 (新しい順) */
export function buildSoldRows(keys: SoldKeyDef[], store: FlowStore | null): Row[] {
  const rows: Row[] = [];
  for (const k of keys) {
    const st = store?.states?.[k.key];
    if (!st?.tracked) continue;
    for (const t of st.tracked) {
      if (!t.gone_at) continue;
      rows.push({
        id: t.id,
        cond: k.label,
        account: t.account ?? "",
        amount: t.amount,
        currency: t.currency,
        listedAt: t.listed_at ?? null,
        firstSeen: t.first_seen,
        goneAt: t.gone_at,
        life: t.gone_at - startOf(t),
        estimated: t.listed_at == null,
        relisted: fateOf(t) === "relisted",
        unknown: fateOf(t) === "unknown",
      });
    }
  }
  return rows.sort((a, b) => b.goneAt - a.goneAt);
}

/** 通貨ごとに足す (神とカオスが混ざるので合算しない) */
export function sumBy(list: { amount?: number | null; currency?: string | null }[]): [string, number][] {
  const m = new Map<string, number>();
  for (const r of list) {
    if (r.amount == null || !r.currency) continue;
    m.set(r.currency, (m.get(r.currency) ?? 0) + r.amount);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * 「確認した時刻」でまとめる。
 *
 * 周期ごとに確認しているので、その間に売れた分は同じ時刻でまとめて出てくる。
 * 「同時に 14 件消えた」ように見えるのはそのため、というのが分かる形にする。
 * 1 巡の中で 3 条件は数秒〜数十秒ずれて取られるので、秒ではなく分でまとめる
 * (秒で分けていた頃は同じ確認が 2〜3 つの見出しに割れていた。2026-09-18 レビュー指摘)
 */
export function groupByCheck(soldRows: Row[]) {
  const map = new Map<number, Row[]>();
  for (const r of soldRows) {
    const at = Math.floor(r.goneAt / 60) * 60;
    const list = map.get(at);
    if (list) list.push(r);
    else map.set(at, [r]);
  }
  const times = [...map.keys()].sort((a, b) => b - a);
  return times.map((at, i) => {
    const list = map.get(at)!;
    const sellers = new Map<string, number>();
    for (const r of list) sellers.set(r.account || "不明", (sellers.get(r.account || "不明") ?? 0) + 1);
    const top = [...sellers.entries()].sort((a, b) => b[1] - a[1])[0];
    void i;
    return {
      at,
      list,
      totals: sumBy(list.filter((r) => !r.relisted && !r.unknown)),
      sold: list.filter((r) => !r.relisted && !r.unknown).length,
      relisted: list.filter((r) => r.relisted).length,
      unknown: list.filter((r) => r.unknown).length,
      topSeller: top && top[1] > 1 ? { name: top[0], n: top[1] } : null,
    };
  });
}

/** まだ出品されている分 (並んでいる時間が長い順) */
export function buildAliveRows(keys: SoldKeyDef[], store: FlowStore | null, now: number) {
  const rows: { id: string; cond: string; account: string; amount: number | null | undefined; currency: string | null | undefined; listedAt: number | null; age: number; estimated: boolean }[] = [];
  for (const k of keys) {
    const st = store?.states?.[k.key];
    if (!st?.tracked) continue;
    for (const t of st.tracked) {
      if (t.gone_at) continue;
      rows.push({ id: t.id, cond: k.label, account: t.account ?? "", amount: t.amount, currency: t.currency, listedAt: t.listed_at ?? null, age: now - startOf(t), estimated: t.listed_at == null });
    }
  }
  return rows.sort((a, b) => b.age - a.age);
}

export function toneClass(tone: string): string {
  switch (tone) {
    case "fast":
      return "text-emerald-300 border-emerald-400/50";
    case "normal":
      return "text-amber-200 border-amber-300/40";
    case "slow":
      return "text-rose-300 border-rose-400/40";
    default:
      return "text-[var(--exile-color-text-tertiary)] border-[var(--exile-color-border-subtle)]";
  }
}
