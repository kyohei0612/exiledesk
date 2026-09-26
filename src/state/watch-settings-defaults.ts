/**
 * watch-settings-defaults.ts — 監視設定の型・既定値と、localStorage からの読み込み (版の移行を含む)
 *
 * watch-settings.ts から切り出し (2026-09-26)。状態 (ref) は持たない (watch-settings.ts に 1 つだけ)。
 * 呼ぶ側は今まで通り watch-settings から取れる。
 */

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
  /**
   * 手で外したジェム (英語名)。使用率ランキングの上位に入っていても監視しない。
   * オーナー指示 2026-09-20:「アセンダンシー選んでてもジェムのリスト変更できるようにして」。
   * 上位から自動で入る分も 1 件ずつ外せるようにするための除外リスト。
   */
  excluded: string[];
  /**
   * 外した時刻 (英語名 → ミリ秒)。外したジェムを少しの間だけ画面に置いて、戻せるようにする。
   * オーナー指示 2026-09-20:「監視中ジェムの下に除外したジェムたちを置いておこう。
   * 8 時間でキャッシュクリアでそこ表示しなくて OK になるように。メモリ機能的な」。
   */
  droppedAt: Record<string, number>;
  /** 自動で上位を入れるか (false なら手動のジェムだけ監視する) */
  autoTop: boolean;
}

/** 監視できるジェムの上限 (オーナー指示 2026-09-20「監視ジェム最大 7 にしよう」)。
 *
 * 7 ジェム = 21 銘柄 × 2 = **42 リクエスト**で 1 巡。ログイン中に通っている線が
 * 15 分 60 本 (2026-09-19 の実測) なので、1 巡が 15 分の枠に収まる。
 * 以前の 18 ジェムは 108 リクエストで、どう間隔を空けても 15 分の枠を 2 周ぶん食べていた。
 */
export const MAX_WATCH_GEMS = 7;

/**
 * 既定値 (オーナー指示 2026-09-17、上限は 2026-09-20 に 18 → 7)。
 *
 * 取得先は全アセンダンシー・完成品 5 人以上。そこから上位 7 ジェムを監視する。
 */
export const DEFAULT_WATCH_SETTINGS: WatchSettings = {
  /**
   * v3 (2026-09-18 オーナー指摘「完成品を 5 人以上使ってる人を監視するはずなのにリストがおかしい。
   * 状態時キャストが入ってないし、逆に少ないやつが入ってる」): 既定の基準が
   * 品質 23% の使用者数だった (画面の説明文だけ「完成品」と書いてあった)。
   * 完成品 (レベル 21 · 品質 23% の両方) の使用者数に直す。
   */
  /**
   * v4 (2026-09-20 オーナー指示:「自動で入らないようにしようか。そしたら気になるやつ 7 個まで
   * 選んで一括取得できるよね」): 使用率ランキングの上位を自動で入れるのをやめ、**手で選んだ分だけ**
   * 監視する。上位を自動で入れたい人はチェックを戻せる (autoTop)。
   */
  v: 4,
  klass: "",
  metric: "finished",
  minUsers: 5,
  maxGems: MAX_WATCH_GEMS,
  manual: [],
  excluded: [],
  droppedAt: {},
  autoTop: false,
};

export const WATCH_SETTINGS_KEY = "exiledesk.watch-settings";

export function loadWatchSettings(): WatchSettings {
  try {
    const raw = localStorage.getItem(WATCH_SETTINGS_KEY);
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
        maxGems: clamp(s.maxGems, 1, MAX_WATCH_GEMS, DEFAULT_WATCH_SETTINGS.maxGems),
        manual: capManual(s.manual, clamp(s.maxGems, 1, MAX_WATCH_GEMS, DEFAULT_WATCH_SETTINGS.maxGems)),
        excluded: strings(s.excluded),
        droppedAt: stamps(s.droppedAt),
        // v4 で「自動で上位を入れない」を既定にしたので、古い設定の値は引き継がない
        autoTop: DEFAULT_WATCH_SETTINGS.autoTop,
      };
    }
    return {
      v: DEFAULT_WATCH_SETTINGS.v,
      klass: typeof s.klass === "string" ? s.klass : DEFAULT_WATCH_SETTINGS.klass,
      metric: s.metric && s.metric in WATCH_METRIC_LABEL ? s.metric : DEFAULT_WATCH_SETTINGS.metric,
      minUsers: clamp(s.minUsers, 1, 100, DEFAULT_WATCH_SETTINGS.minUsers),
      maxGems: clamp(s.maxGems, 1, MAX_WATCH_GEMS, DEFAULT_WATCH_SETTINGS.maxGems),
      manual: capManual(s.manual, clamp(s.maxGems, 1, MAX_WATCH_GEMS, DEFAULT_WATCH_SETTINGS.maxGems)),
      excluded: strings(s.excluded),
      droppedAt: stamps(s.droppedAt),
      autoTop: s.autoTop !== false,
    };
  } catch {
    return { ...DEFAULT_WATCH_SETTINGS };
  }
}

/** 外した時刻の表 (壊れた値は捨てる) */
const stamps = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (v && typeof v === "object") {
    for (const [k, t] of Object.entries(v as Record<string, unknown>)) if (typeof t === "number" && Number.isFinite(t)) out[k] = t;
  }
  return out;
};

/**
 * 手で足したジェムを上限まで切り詰める。
 *
 * オーナー報告 2026-09-20「監視リストへ追加がなぜかできない、反応しない」:
 * 上限を 7 に下げる前の設定には 7 個より多く入っていることがあり、画面は 7 個しか出さないのに
 * 枠は埋まっているので「監視へ +」がずっと押せない (しかも見た目が変わらないので無反応に見える)
 * 状態になっていた。読み込み時に見えている分だけに揃える。
 */
const capManual = (v: unknown, max: number): string[] => strings(v).slice(0, max);

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(max, Math.max(min, n));
}
