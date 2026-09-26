/**
 * watch-settings.ts — 捌き速度の「何を監視するか」の設定 (オーナー指示 2026-09-17)
 *
 * これまでは「全アセンダンシーの上位 100 人で完成品 5 人以上、上位 10 ジェム」固定だった。
 * 取得先 (アセンダンシー)・並べる基準・人数の下限・監視するジェム数を選べるようにし、
 * 手で足したジェムも同じ一覧で扱う。
 *
 * 保存先はこの PC の localStorage。実際の追跡登録は state/gem-watch-auto.ts が行う。
 */
import { computed, ref } from "vue";
import {
  loadWatchSettings,
  MANUAL_ONLY,
  WATCH_SETTINGS_KEY,
  type WatchMetric,
  type WatchSettings,
} from "./watch-settings-defaults";

// 型・既定値・読み込みは watch-settings-defaults.ts へ (2026-09-26 の分割)。今まで通りここから取れる
export {
  DEFAULT_WATCH_SETTINGS,
  MANUAL_ONLY,
  MAX_WATCH_GEMS,
  WATCH_METRIC_LABEL,
  type WatchMetric,
  type WatchSettings,
} from "./watch-settings-defaults";

const state = ref<WatchSettings>(loadWatchSettings());

export const watchSettings = computed(() => state.value);

export function updateWatchSettings(patch: Partial<WatchSettings>): WatchSettings {
  state.value = { ...state.value, ...patch };
  try {
    localStorage.setItem(WATCH_SETTINGS_KEY, JSON.stringify(state.value));
  } catch {
    /* 保存できなくてもその場では効く */
  }
  return state.value;
}

/** 手動で監視するジェムを足す (上限まで)。既に入っていれば何もしない */
export function addManualGem(en: string): boolean {
  const s = state.value;
  if (!en || s.manual.includes(en)) return false;
  if (s.manual.length >= s.maxGems) return false;
  // 一度外した物を手で足し直したら、除外も解く (外したままだと後で自動の上位に戻れない)
  updateWatchSettings({ manual: [...s.manual, en], excluded: s.excluded.filter((x) => x !== en) });
  return true;
}

export function removeManualGem(en: string): void {
  updateWatchSettings({ manual: state.value.manual.filter((x) => x !== en) });
}

/**
 * 監視リストから 1 件外す。手で足した物は消し、使用率ランキングから入った物は除外に入れる。
 * どちらも記録は消えない (7 日以内に戻せば続きから追える)。
 */
export function dropWatchGem(en: string): void {
  const s = state.value;
  const droppedAt = { ...s.droppedAt, [en]: Date.now() };
  if (s.manual.includes(en)) {
    updateWatchSettings({ manual: s.manual.filter((x) => x !== en), droppedAt });
    return;
  }
  updateWatchSettings({ excluded: s.excluded.includes(en) ? s.excluded : [...s.excluded, en], droppedAt });
}

/** 外したジェムを画面に置いておく時間 (自動巡回の 1 巡と同じ 8 時間) */
export const DROPPED_KEEP_MS = 8 * 3600 * 1000;

/**
 * 最近外したジェム (新しい順)。8 時間を過ぎた分は落とす。
 * 「戻す」で監視に入れ直せるようにするための一時置き場 (オーナー指示 2026-09-20)。
 */
export function recentlyDropped(now = Date.now()): { name: string; at: number }[] {
  return Object.entries(state.value.droppedAt)
    .filter(([, at]) => now - at < DROPPED_KEEP_MS)
    .map(([name, at]) => ({ name, at }))
    .sort((a, b) => b.at - a.at);
}

/** 外したジェムを監視に戻す (除外も解いて、一時置き場からも消す) */
export function restoreWatchGem(en: string): boolean {
  const s = state.value;
  const droppedAt = { ...s.droppedAt };
  delete droppedAt[en];
  if (s.manual.includes(en) || s.manual.length >= s.maxGems) {
    updateWatchSettings({ excluded: s.excluded.filter((x) => x !== en), droppedAt });
    return s.manual.includes(en);
  }
  updateWatchSettings({ manual: [...s.manual, en], excluded: s.excluded.filter((x) => x !== en), droppedAt });
  return true;
}

/** 一時置き場から消す (戻さずに忘れる) */
export function forgetDropped(en: string): void {
  const droppedAt = { ...state.value.droppedAt };
  delete droppedAt[en];
  updateWatchSettings({ droppedAt });
}

export function isManualGem(en: string): boolean {
  return state.value.manual.includes(en);
}

/** クラフト選定ジェムの 1 行 (必要な列だけ) */
export interface GemUsageRow {
  name: string;
  users: number;
  lvl21: number;
  q23: number;
  both: number;
}

/** 基準の人数を取り出す */
export function metricCount(row: GemUsageRow, metric: WatchMetric): number {
  switch (metric) {
    case "finished":
      return row.both;
    case "quality23":
      return row.q23;
    case "level21":
      return row.lvl21;
    case "users":
      return row.users;
  }
}

export interface WatchGem {
  name: string;
  /** 手動で足したか (自動の上位より優先して残す) */
  manual: boolean;
  /** 画面に出すメモ ("品質 23% を 12 / 47 人") */
  note: string;
}

/**
 * 設定と取得結果から「監視するジェム」を決める。
 * 手動のジェムを先に入れ、残りを基準の上位で埋める (合計 maxGems まで)。
 */
export function watchGems(rows: GemUsageRow[], s: WatchSettings = state.value): WatchGem[] {
  const byName = new Map(rows.map((r) => [r.name, r]));
  const excluded = new Set(s.excluded);
  const out: WatchGem[] = [];
  for (const name of s.manual) {
    if (out.length >= s.maxGems) break;
    const r = byName.get(name);
    out.push({ name, manual: true, note: r ? noteOf(r, s.metric) : "手動で追加" });
  }
  // カスタム監視スキル: 手で足した分だけ。上位は入れない
  if (s.klass === MANUAL_ONLY) return out;
  if (s.autoTop) {
    const top = rows
      .filter((r) => metricCount(r, s.metric) >= s.minUsers)
      .slice()
      // 同じ人数で並んだ時は「そのジェム自体の使用者が多い方」を上に
      // (2026-09-18: 5 人で並んだ時に、使用者 8 人の元素系状態異常時キャストが
      //  使用者 16 人のフリッカーストライクに負けて 19 位で切られていた)
      .sort(
        (a, b) =>
          metricCount(b, s.metric) - metricCount(a, s.metric) ||
          b.users - a.users ||
          a.name.localeCompare(b.name),
      )
      // 「上位いくつ」は廃止 (2026-09-19 オーナー「上位いくつ要らない、監視ジェムと役割被る」)。
      // 何ジェム見るかは「監視の上限」だけで決まる (下の out.length >= s.maxGems で止まる)
      ;
    for (const r of top) {
      if (out.length >= s.maxGems) break;
      if (excluded.has(r.name)) continue; // 手で外した分は飛ばして、次の順位を繰り上げる
      if (out.some((x) => x.name === r.name)) continue;
      out.push({ name: r.name, manual: false, note: noteOf(r, s.metric) });
    }
  }
  return out;
}

function noteOf(r: GemUsageRow, metric: WatchMetric): string {
  const label = { finished: "完成品", quality23: "品質 23%", level21: "レベル 21", users: "使用" }[metric];
  return `${label} ${metricCount(r, metric)} / ${r.users} 人`;
}
