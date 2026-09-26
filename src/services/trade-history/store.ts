/**
 * 取引履歴の保存 (localStorage) と、制限の窓から次に取れる時刻を出す
 *
 * trade-history.ts から切り出し (2026-09-26)。
 */

export type Game = "poe2" | "poe1";

/** 履歴 1 件 (表示に要る分だけに絞って保存する) */
export interface TradeEntry {
  key: string;
  /** 売れた時刻 (ms) */
  time: number;
  amount: number | null;
  currency: string | null;
  name: string;
  typeLine: string;
  icon: string | null;
  rarity: string;
  stack: number | null;
  ilvl: number | null;
}

interface Stored {
  entries: TradeEntry[];
  lastFetchAt: number;
  /** サーバー都合で待たされる時刻 (429 / 制限が近い時) */
  nextAllowedAt: number;
  /** 自分が取得した時刻 (窓の計算用、3 時間より古い物は捨てる) */
  hits: number[];
  /** 最後に見たサーバーの制限ルール */
  rules: string;
}

export interface FetchOutcome {
  ok: boolean;
  added: number;
  message: string;
  /** サイトがログインを受け付けなかった (401 / 403)。cookie は残っていても切れている */
  expired?: boolean;
}

/** 連打よけの最小間隔 (制限は下の窓で見る) */
export const MIN_INTERVAL_MS = 10_000;
/** サーバーの制限ルールの既定 (最初の取得前や、ヘッダが無い時に使う) */
const DEFAULT_RULES = "5:60:60,10:600:120,15:10800:3600";
/** 窓ごとに何回残して止めるか (公式サイトや他ツールが使う分の余白) */
export const MARGIN = 1;

const keyOf = (game: Game, league: string): string => `exiledesk.trade-history.${game}.${league}`;

export function loadStored(game: Game, league: string): Stored {
  try {
    const raw = localStorage.getItem(keyOf(game, league));
    if (raw) {
      const s = JSON.parse(raw) as Partial<Stored>;
      return {
        entries: Array.isArray(s.entries) ? s.entries : [],
        lastFetchAt: s.lastFetchAt ?? 0,
        nextAllowedAt: s.nextAllowedAt ?? 0,
        hits: Array.isArray(s.hits) ? s.hits : [],
        rules: typeof s.rules === "string" && s.rules ? s.rules : DEFAULT_RULES,
      };
    }
  } catch {
    /* 読めなくても動く */
  }
  return { entries: [], lastFetchAt: 0, nextAllowedAt: 0, hits: [], rules: DEFAULT_RULES };
}

export function save(game: Game, league: string, s: Stored): void {
  try {
    localStorage.setItem(keyOf(game, league), JSON.stringify(s));
  } catch {
    /* 容量超過などで保存できなくても表示は続ける */
  }
}

const PERIOD_LABEL: Record<number, string> = { 60: "1 分", 600: "10 分", 3600: "1 時間", 10800: "3 時間" };
export const periodLabel = (period: number): string => PERIOD_LABEL[period] ?? `${period} 秒`;

/** "5:60:60,10:600:120" → [[max, period, penalty], ...] */
function parseRules(rules: string): number[][] {
  return rules
    .split(",")
    .map((r) => r.split(":").map(Number))
    .filter((r) => r.length >= 2 && Number.isFinite(r[0]) && Number.isFinite(r[1]));
}

export interface BudgetWindow {
  label: string;
  used: number;
  max: number;
}
export interface HistoryBudget {
  /** 次に取れる時刻 (ms) */
  allowedAt: number;
  /** 窓ごとの使用状況 (画面表示用) */
  usage: BudgetWindow[];
}

/** 自分の取得記録とサーバーの制限から、次に取れる時刻と残り回数を出す */
export function historyBudget(game: Game, league: string): HistoryBudget {
  const s = loadStored(game, league);
  const now = Date.now();
  let allowedAt = Math.max(s.nextAllowedAt, s.lastFetchAt + MIN_INTERVAL_MS);
  const usage: BudgetWindow[] = [];
  for (const [max, period] of parseRules(s.rules)) {
    const windowMs = period * 1000;
    const inWindow = s.hits.filter((t) => t > now - windowMs);
    usage.push({ label: periodLabel(period), used: inWindow.length, max });
    if (inWindow.length >= max - MARGIN) {
      // 一番古い物が窓から出た瞬間に 1 枠空く
      const oldest = inWindow[Math.max(0, inWindow.length - (max - MARGIN))];
      allowedAt = Math.max(allowedAt, oldest + windowMs + 1000);
    }
  }
  return { allowedAt, usage };
}
