/**
 * daily-dev-states.ts — 開発版だけ (import.meta.env.DEV)、挑戦のページを状態ごとに 1 回で開く口 (D-37h の隣、11-09 オーナー「開発で自由に確認したいからページごとに表示してくれ」)。
 * `?page=daily-start&q=<お題の id>&dev=<状態>`。サーバーに聞かず (POST /daily/start を呼ばない)、端末の控えにも書かない見本の挑戦を作るので、本物の 1 日 1 回・時間・記録は減らない。
 * 狙いはお題の物 (締めた日 = 昨日のお題なら見える) か、この端末の同じお題の控え。本番では devState は常に null
 */
import { TIME_LIMIT_MS, getTry, type DailyTopic, type DailyTry } from "./daily-api";

/** submit0 / done0 = 完成 0% の提出の確かめ・結果の窓 (D-35d、11-10) */
export const DEV_STATES = ["from", "frac", "tree", "submit", "done", "submit0", "done0", "giveup", "timeout", "leave"] as const;
export type DevState = (typeof DEV_STATES)[number];

/** 今の URL の状態 (開発版だけ。無い・知らない名前は null) */
export function devState(): DevState | null {
  if (!import.meta.env.DEV) return null;
  try {
    const v = new URLSearchParams(location.search).get("dev");
    return (DEV_STATES as readonly string[]).includes(v ?? "") ? (v as DevState) : null;
  } catch { return null; }
}

/** 見本の提出の数 (提出の確かめ・結果の窓) */
export const DEV_RUN: { cost: number | null; rate: number } = { cost: 12.4, rate: 93 };
/** 見本の完成 0% の数 (費用は無い = —、D-35d) */
export const DEV_RUN0: { cost: number | null; rate: number } = { cost: null, rate: 0 };

/** 見本の挑戦。狙いが引けなければ null (画面が一言出す) */
export function devTry(topic: DailyTopic, st: DevState, now = Date.now()): DailyTry | null {
  const aims = topic.aims?.length ? topic.aims : getTry(topic.id)?.aims;
  if (!aims?.length) return null;
  const frac = st === "from" || st === "frac" ? undefined : aims[aims.length - 1]!.modId;
  return {
    topicId: topic.id,
    startedAt: st === "timeout" ? now - TIME_LIMIT_MS - 60_000 : now - 5 * 60_000,
    aims: aims.map((a) => ({ ...a })),
    ...(frac ? { fractured: frac, from: "fractured" as const } : {}),
    ...(st === "done" ? { ended: true, submitted: true, last: { cost: DEV_RUN.cost ?? 0, rate: DEV_RUN.rate, ms: 5 * 60_000, at: now } } : {}),
    ...(st === "done0" ? { ended: true, submitted: true, last: { cost: 0, rate: 0, ms: 5 * 60_000, at: now } } : {}),
  };
}

/**
 * 一覧・お題のページの見本 (D-37h2、11-09 オーナー「保存後もっかいデイリーに戻ってきた設定でURLみせてくれよ」)。`?page=daily(&q=<お題の id>)&dev=<状態>`:
 * back = 挑戦の途中で離れて戻ってきた (「続きから始める」と「諦める」) / backdone = 提出して戻ってきた (「挑戦済み」の灰色と提出の記録) /
 * backgiveup = 諦めて戻ってきた (「挑戦済み」の灰色と「今日の挑戦は諦めた」)。
 * 見本の挑戦は端末の控えにもサーバーにも書かない (諦める・続きからを押しても本物は動かない)
 */
export const DEV_BACK_STATES = ["back", "backdone", "backgiveup"] as const;
export type DevBackState = (typeof DEV_BACK_STATES)[number];
export function devBackState(): DevBackState | null {
  if (!import.meta.env.DEV) return null;
  try {
    const v = new URLSearchParams(location.search).get("dev");
    return (DEV_BACK_STATES as readonly string[]).includes(v ?? "") ? (v as DevBackState) : null;
  } catch { return null; }
}
/** 戻ってきた時の見本の挑戦 (始めて 20 分。今日のお題は狙いが伏せてあるので、狙いが無くても作る) */
export function devBackTry(topic: DailyTopic, st: DevBackState, now = Date.now()): DailyTry {
  const aims = topic.aims?.length ? topic.aims : getTry(topic.id)?.aims ?? [];
  const rec = { cost: DEV_RUN.cost ?? 0, rate: DEV_RUN.rate, ms: 20 * 60_000, at: now };
  return {
    topicId: topic.id,
    startedAt: now - 20 * 60_000,
    aims: aims.map((a) => ({ ...a })),
    fractured: aims[aims.length - 1]?.modId ?? "dev",
    from: "fractured",
    ...(st === "backdone" ? { ended: true, submitted: true, best: rec, last: rec } : {}),
    ...(st === "backgiveup" ? { ended: true } : {}),
  };
}
/** 見本の「続きから始める」の行き先 = 挑戦の画面の見本の木 (dev=tree) */
export const devTreeUrl = (id: string): string => `${location.pathname}?page=daily-start&q=${encodeURIComponent(id)}&dev=tree`;
