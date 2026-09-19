/**
 * use-history-view.ts — 取引履歴の「絞り込みと集計」(期間 / 検索 / 日別の棒)
 *
 * 期間は時間の引き算ではなく**日付で仕分ける** (2026-09-16)。当日は 7 日間の日付チップで
 * 選べるので期間の選択肢には入れていない。
 *
 * 2026-09-19 に TradeHistory.vue (689 行) から切り出した。中身は変えていない。
 */
import { computed, ref, type Ref } from "vue";
import { toExalted } from "../../services/trade2/pricing";
import { jaTypeName, jaUniqueName } from "../../services/trade2/localize";
import { marketStore } from "../../state/market-store";
import { DAY_MS, dayKey, dayLabel, startOfDay } from "./format";
import type { TradeEntry } from "../../services/trade-history";

export function useHistoryView(o: {
  /** 保存してある全履歴 */
  entries: Ref<TradeEntry[]>;
  /** "poe2" か "poe1" (高貴に換算できるのは PoE2 だけ) */
  game: Ref<string>;
  /** 1 秒ごとに進む時計 (日付が変わったら当日が切り替わる) */
  now: Ref<number>;
  /** リーグ開始 (poe2scout 由来、分からなければ null) */
  leagueStartMs: Ref<number | null>;
}) {
  const { entries, game, now, leagueStartMs } = o;
  const jaName = (e: TradeEntry): string => (e.name ? jaUniqueName(e.name) : "");
  const jaType = (e: TradeEntry): string => (e.typeLine ? jaTypeName(e.typeLine) : "");

  // ---- 絞り込みと集計 (2026-09-16: 時間の引き算ではなく日付で仕分ける) ----
  // オーナー指示 (2026-09-16): 当日は 7 日間の日付チップで選べるので不要
  const PERIODS = [
    { id: "7d", label: "7 日間", days: 7 },
    { id: "all", label: "全部", days: 0 },
  ] as const;
  type PeriodId = (typeof PERIODS)[number]["id"];
  const period = ref<PeriodId>("7d");
  const search = ref("");

  /** その日の 0:00 (ローカル) */
  /** 今日の 0:00 (now を見て日付が変わったら自動で切り替わる) */
  const todayStart = computed(() => startOfDay(now.value));
  /** 選択中の期間の開始時刻 (全部は 0) */
  const since = computed(() => {
    const p = PERIODS.find((x) => x.id === period.value);
    if (!p || p.days <= 0) return 0;
    return todayStart.value - (p.days - 1) * DAY_MS;
  });
  /** 7 日間モードで見ている日 (0 = 今日)。オーナー指示 2026-09-16: 7 日間は日付を選んで時間帯で見る */
  const selectedDay = ref<number>(0);
  const activeDay = computed(() => (selectedDay.value ? startOfDay(selectedDay.value) : todayStart.value));

  /** 検索だけ掛けた分 (期間の集計に使う) */
  const searched = computed(() => {
    const q = search.value.trim().toLowerCase();
    if (!q) return entries.value;
    // 検索は日本語名と英語名のどちらでも引っかかるように
    return entries.value.filter((e) => `${e.name} ${e.typeLine} ${jaName(e)} ${jaType(e)}`.toLowerCase().includes(q));
  });
  const visible = computed(() => {
    // 7 日間は「選んだ 1 日」だけを出す (日付ごとに見たい、というオーナー指示)
    if (period.value === "7d") {
      const from = activeDay.value;
      const to = from + DAY_MS;
      return searched.value.filter((e) => e.time >= from && e.time < to);
    }
    return searched.value.filter((e) => e.time >= since.value);
  });

  /** 7 日間の日付チップ (古い → 新しい)。その日の合計と件数つき */
  const days7 = computed(() => {
    const out: { start: number; label: string; total: number; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const start = todayStart.value - i * DAY_MS;
      const to = start + DAY_MS;
      let total = 0;
      let count = 0;
      for (const e of searched.value) {
        if (e.time < start || e.time >= to) continue;
        total += valueOf(e);
        count++;
      }
      out.push({ start, label: dayLabel(start), total, count });
    }
    return out;
  });
  /** PoE2 の通貨だけ高貴に換算できる (換算レートは PoE2 の相場) */
  function exaltedOf(e: TradeEntry): number | null {
    if (game.value !== "poe2" || e.amount == null || !e.currency) return null;
    return toExalted(e.amount, e.currency, marketStore.rates.value);
  }
  const totals = computed(() => {
    const byCurrency = new Map<string, number>();
    let exalted = 0;
    let unconverted = 0;
    for (const e of visible.value) {
      if (e.amount == null || !e.currency) continue;
      byCurrency.set(e.currency, (byCurrency.get(e.currency) ?? 0) + e.amount);
      const ex = exaltedOf(e);
      if (ex == null) unconverted++;
      else exalted += ex;
    }
    return { byCurrency: [...byCurrency.entries()].sort((a, b) => b[1] - a[1]), exalted, unconverted };
  });

  /** 1 件の売上 (グラフと日別合計に使う値)。PoE2 は高貴換算、PoE1 は換算できないので 0 */
  const valueOf = (e: TradeEntry): number => exaltedOf(e) ?? 0;

  /** 期間の見出しに出すまとめ (当日 / 7 日間 / 全部 は常に出す) */
  const summary = computed(() => {
    const sum = (from: number): { total: number; count: number } => {
      let total = 0;
      let count = 0;
      for (const e of searched.value) {
        if (e.time < from) continue;
        total += valueOf(e);
        count++;
      }
      return { total, count };
    };
    return {
      week: sum(todayStart.value - 6 * DAY_MS),
      all: sum(0),
    };
  });

  /** 「全部」の左端。リーグ開始が取れればそれ、駄目なら一番古い記録 (どちらも無ければ今日) */
  const allStartMs = computed<number>(() => {
    if (leagueStartMs.value) return leagueStartMs.value;
    let oldest = Number.POSITIVE_INFINITY;
    for (const e of entries.value) oldest = Math.min(oldest, e.time);
    return Number.isFinite(oldest) ? oldest : todayStart.value;
  });

  /** グラフの棒。当日は時間別 (0-23 時)、それ以外は日別 */
  interface Bar {
    key: string;
    label: string;
    sub: string;
    value: number;
    count: number;
    today: boolean;
  }
  const bars = computed<Bar[]>(() => {
    const out: Bar[] = [];
    // 当日 / 7 日間 (選んだ日) は時間別、全部だけ日別
    if (period.value === "7d") {
      const base = activeDay.value;
      const byHour = new Array(24).fill(0).map(() => ({ v: 0, c: 0 }));
      for (const e of searched.value) {
        if (e.time < base || e.time >= base + DAY_MS) continue;
        const h = new Date(e.time).getHours();
        byHour[h].v += valueOf(e);
        byHour[h].c++;
      }
      // 今日は「今の時間」まで、過去の日は 24 時間ぶん
      const isToday = base === todayStart.value;
      const lastHour = isToday ? new Date(now.value).getHours() : 23;
      for (let h = 0; h <= lastHour; h++) {
        out.push({ key: `h${h}`, label: `${h}`, sub: `${h}:00`, value: byHour[h].v, count: byHour[h].c, today: isToday && h === lastHour });
      }
      return out;
    }
    // 日別: 売れた日を拾い、7 日間は売れていない日も 0 で並べる
    const byDay = new Map<string, { v: number; c: number; start: number }>();
    for (const e of searched.value) {
      if (e.time < since.value) continue;
      const k = dayKey(e.time);
      const b = byDay.get(k) ?? { v: 0, c: 0, start: startOfDay(e.time) };
      b.v += valueOf(e);
      b.c++;
      byDay.set(k, b);
    }
    // 「全部」= リーグ開始から今日まで 1 日ずつ (売れていない日も 0 で並べる)
    let first = startOfDay(allStartMs.value);
    const days = Math.floor((todayStart.value - first) / DAY_MS);
    if (days > 400) first = todayStart.value - 400 * DAY_MS; // 保険 (リーグ開始が取れないほど古い時)
    for (let t = first; t <= todayStart.value; t += DAY_MS) {
      const start = startOfDay(t); // 夏時間などでずれても日付境界に戻す
      const b = byDay.get(dayKey(start));
      out.push({
        key: dayKey(start),
        label: `${new Date(start).getMonth() + 1}/${new Date(start).getDate()}`,
        sub: dayLabel(start),
        value: b?.v ?? 0,
        count: b?.c ?? 0,
        today: start === todayStart.value,
      });
    }
    return out;
  });
  const barMax = computed(() => Math.max(1, ...bars.value.map((b) => b.value)));
  /** 棒が多い時はラベルを間引く (全部で 30 日を超えるとき) */
  const labelEvery = computed(() => (bars.value.length > 24 ? Math.ceil(bars.value.length / 12) : 1));

  return {
    searched,
    allStartMs,
    PERIODS,
    period,
    search,
    selectedDay,
    todayStart,
    since,
    activeDay,
    days7,
    visible,
    exaltedOf,
    valueOf,
    totals,
    summary,
    bars,
    barMax,
    labelEvery,
  };
}
