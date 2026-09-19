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

/** 上位に入れる基準 (クラフト選定ジェムの列と同じ) */
export type WatchMetric = "finished" | "quality23" | "level21" | "users";

export const WATCH_METRIC_LABEL: Record<WatchMetric, string> = {
  finished: "完成品 (21 · 23%) の使用者数",
  quality23: "品質 23% の使用者数",
  level21: "レベル 21 の使用者数",
  users: "そのジェムの使用者数",
};

/**
 * 取得先の特別な値: 使用率ランキングを使わず、**手で足したジェムだけ**を監視する。
 * オーナー指示 2026-09-19:「取得先にカスタム監視スキルって名前の奴を追加して、
 * そこには手動で入れた監視ジェムだけ表示されるように」。
 */
export const MANUAL_ONLY = "__manual__";

export interface WatchSettings {
  /** 設定の版。既定値を変えた時に上げて、古い既定のまま使っている人に反映する */
  v: number;
  /** 取得先のアセンダンシー (空文字 = 全アセンダンシー = リーグ全体の上位) */
  klass: string;
  /** 上位を決める基準 */
  metric: WatchMetric;
  /** 基準の人数の下限 (これ未満は入れない) */
  minUsers: number;
  /** 監視できるジェムの上限 (手動を含む)。増やすほど trade2 のリクエストが増える */
  maxGems: number;
  /** 手で足したジェム (英語名)。自動の上位より優先して監視する */
  manual: string[];
  /** 自動で上位を入れるか (false なら手動のジェムだけ監視する) */
  autoTop: boolean;
}

/**
 * 既定値 (オーナー指示 2026-09-17)。
 *
 * 「全アセンダンシー・使用率 5 人以上」で今まで通り 18 ジェム前後が監視に入る形にする。
 * 18 ジェム = 54 銘柄 × 2 リクエストを周期 (既定 8 時間) ごとに 1 巡 (trade2 の上限は毎時 100 回)。
 */
export const DEFAULT_WATCH_SETTINGS: WatchSettings = {
  /**
   * v3 (2026-09-18 オーナー指摘「完成品を 5 人以上使ってる人を監視するはずなのにリストがおかしい。
   * 状態時キャストが入ってないし、逆に少ないやつが入ってる」): 既定の基準が
   * 品質 23% の使用者数だった (画面の説明文だけ「完成品」と書いてあった)。
   * 完成品 (レベル 21 · 品質 23% の両方) の使用者数に直す。
   */
  v: 3,
  klass: "",
  metric: "finished",
  minUsers: 5,
  maxGems: 18,
  manual: [],
  autoTop: true,
};

const KEY = "exiledesk.watch-settings";

function load(): WatchSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_WATCH_SETTINGS };
    const s = JSON.parse(raw) as Partial<WatchSettings>;
    // 古い版のまま保存されていたら、新しい既定に合わせる。
    // 手で変えた設定は尊重したいが、旧版は初期値のまま使っていた人なので上書きしてよい。
    // v2 → v3 は「基準」そのものを直す修正なので、metric も既定 (完成品) に戻す
    if (s.v !== DEFAULT_WATCH_SETTINGS.v) {
      return {
        ...DEFAULT_WATCH_SETTINGS,
        klass: typeof s.klass === "string" ? s.klass : DEFAULT_WATCH_SETTINGS.klass,
        // 基準 (metric) だけ既定に戻す。人数の下限 / 上限は手で決めた値なので引き継ぐ
        minUsers: clamp(s.minUsers, 1, 100, DEFAULT_WATCH_SETTINGS.minUsers),
        maxGems: clamp(s.maxGems, 1, 25, DEFAULT_WATCH_SETTINGS.maxGems),
        manual: Array.isArray(s.manual) ? s.manual.filter((x) => typeof x === "string") : [],
        autoTop: s.autoTop !== false,
      };
    }
    return {
      v: DEFAULT_WATCH_SETTINGS.v,
      klass: typeof s.klass === "string" ? s.klass : DEFAULT_WATCH_SETTINGS.klass,
      metric: s.metric && s.metric in WATCH_METRIC_LABEL ? s.metric : DEFAULT_WATCH_SETTINGS.metric,
      minUsers: clamp(s.minUsers, 1, 100, DEFAULT_WATCH_SETTINGS.minUsers),
      maxGems: clamp(s.maxGems, 1, 25, DEFAULT_WATCH_SETTINGS.maxGems),
      manual: Array.isArray(s.manual) ? s.manual.filter((x) => typeof x === "string") : [],
      autoTop: s.autoTop !== false,
    };
  } catch {
    return { ...DEFAULT_WATCH_SETTINGS };
  }
}

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(max, Math.max(min, n));
}

const state = ref<WatchSettings>(load());

export const watchSettings = computed(() => state.value);

export function updateWatchSettings(patch: Partial<WatchSettings>): WatchSettings {
  state.value = { ...state.value, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state.value));
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
  updateWatchSettings({ manual: [...s.manual, en] });
  return true;
}

export function removeManualGem(en: string): void {
  updateWatchSettings({ manual: state.value.manual.filter((x) => x !== en) });
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
