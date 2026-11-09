/**
 * daily-dev-states.ts — 開発版だけ (import.meta.env.DEV)、挑戦のページを状態ごとに 1 回で開く口 (D-37h の隣、11-09 オーナー「開発で自由に確認したいからページごとに表示してくれ」)。
 * `?page=daily-start&q=<お題の id>&dev=<状態>`。サーバーに聞かず (POST /daily/start を呼ばない)、端末の控えにも書かない見本の挑戦を作るので、本物の 1 日 1 回・時間・記録は減らない。
 * 狙いはお題の物 (締めた日 = 昨日のお題なら見える) か、この端末の同じお題の控え。本番では devState は常に null
 */
import { TIME_LIMIT_MS, getTry, type DailyTopic, type DailyTry } from "./daily-api";

export const DEV_STATES = ["from", "frac", "tree", "submit", "done", "giveup", "timeout", "leave"] as const;
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
export const DEV_RUN = { cost: 12.4, rate: 93 };

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
    ...(st === "done" ? { ended: true, submitted: true, last: { cost: DEV_RUN.cost, rate: DEV_RUN.rate, ms: 5 * 60_000, at: now } } : {}),
  };
}
