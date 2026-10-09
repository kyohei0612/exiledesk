/** channels.json の 1 行 */
export interface ChannelDef {
  /** 画面で使う短い id (英数字) */
  id: string;
  name: string;
  platform: "youtube" | "twitch";
  /** UC で始まる 24 文字 */
  youtubeChannelId?: string;
  /** twitch.tv/<これ> */
  twitchLogin?: string;
  /** チャンネルページ (配信していない時のリンク先) */
  url: string;
  /** 協賛 (画面に PR と出す) */
  pr?: boolean;
  note?: string;
}

export type LiveStatus = "live" | "upcoming" | "off";

/** 配信 1 本 (ライブ中か予定) */
export interface LiveEntry {
  id: string;
  name: string;
  platform: "youtube" | "twitch";
  url: string;
  pr: boolean;
  status: "live" | "upcoming";
  title: string;
  /** サムネ (320×180 くらい)。無ければ null */
  thumb: string | null;
  /** 配信ページ */
  watchUrl: string;
  /** ISO 8601 */
  startedAt: string | null;
  scheduledAt: string | null;
  viewers: number | null;
}

/** 配っている JSON (GET /live.json) */
export interface LiveState {
  updatedAt: string;
  live: LiveEntry[];
  upcoming: LiveEntry[];
  /** 全チャンネル (配信していなくても出す。並びは channels.json のまま) */
  channels: Array<{ id: string; name: string; platform: "youtube" | "twitch"; url: string; pr: boolean; status: LiveStatus; avatar: string | null; latest?: { title: string; thumb: string; watchUrl: string; publishedAt: string | null } | null }>;
  /** 調べられなかった時の理由 (画面には出さない。wrangler tail で見る) */
  errors: string[];
}

export interface Env {
  LIVE: KVNamespace;
  /** 操作の印の置き場 (Workers Analytics Engine。無ければ印は捨てる) */
  EVENTS?: AnalyticsEngineDataset;
  /** 分析用の記録の置き場 (D1。POST /log のまとまりを 1 行ずつ。logs.ts) */
  LOGS?: D1Database;
  YOUTUBE_API_KEY?: string;
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
  REFRESH_KEY?: string;
  /** 要望・バグ・異常・日報を流す Discord のウェブフック URL (無ければ保存だけ) */
  DISCORD_WEBHOOK?: string;
  /** 分析用の記録 (JSONL) を毎朝ファイルで送る Discord のウェブフック URL (secret。無ければ送らない) */
  LOGS_WEBHOOK?: string;
  /** 日報の集計に使う Cloudflare の API トークン (Account Analytics: Read)。無ければ訪問数などは出ない */
  CF_ANALYTICS_TOKEN?: string;
  /** wrangler.jsonc の vars */
  CF_ACCOUNT_ID?: string;
  WEB_ANALYTICS_SITE?: string;
  /**
   * 数え始め (UTC ISO)。これより前の訪問・操作の印・分析用の記録は日報と取り出しで数えない (消さない)。
   * 2026-10-09 オーナー「俺の PC からの訪問もおかしいことになる、一旦リセットでいいからサーバーの」: Analytics Engine と Web Analytics は消せないので線を引く
   */
  STATS_SINCE?: string;
}

export type Fetch = typeof fetch;
