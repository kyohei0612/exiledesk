/**
 * unique-watch.ts — ユニークのお気に入りの最安値を取引所で取って記録する (2026-09-27)
 *
 * オーナー:「ユニークのお気に入りは自動監視と同じようにその商品の最安値を記録しよう。ユニークのグラフみたいな感じで、取得するたびに
 * 記載する感じでグラフ。取得間隔は一応決めれるけどマックス 24 時間」「お気に入りは最大 5 個まで」「お気に入りだけ、そのユニークの名前で
 * 他は指定なしの最安値を取れるってだけ」「自動取得なしってプルダウンも。ユニークに関しては自動取得ありかなしの 2 択」。
 *   - 間隔: 自動取得なし / 1・3・6・12・24 時間ごと (localStorage)
 *   - 取るのは名前 (+ ベース) だけの最安値 (即時購入。コラプト等の指定なし)
 *   - 記録: お気に入りのキー (英名|ベース) → [{ t, ex, total }] (localStorage、1 件 500 点まで)
 *   - 取引所を使えるのは 1 つだけ ([[trade-lock.ts]])。お気に入りの数だけ信号を予約してから取る。他が使っている間は次の見回りまで待つ
 * 見回りはアプリを開いている間 1 分おき (画面を閉じてトレイにいる間も動く)。
 */
import { computed, ref } from "vue";
import { autoPrice } from "../services/trade2/auto-price";
import { buildUniqueNameQuery } from "../services/trade2/query";
import { marketStore } from "./market-store";
import { uniqueFavorites } from "./unique-favorites";
import { tradeLock } from "./trade-lock";
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../utils/isTauriRuntime";

/** exiledesk.log に 1 行 (取った最安値の中身を後から確かめるため) */
function appLog(msg: string): void {
  if (isTauriRuntime()) void invoke("app_log_write", { msg }).catch(() => undefined);
}

/** 選べる間隔 (時間)。0 = 自動取得なし */
export const UNIQUE_WATCH_HOURS = [0, 1, 3, 6, 12, 24] as const;
export interface UniquePoint {
  /** 取った時刻 (ms) */
  t: number;
  /** 最安値 (高貴建て)。出品が無ければ null */
  ex: number | null;
  /** 出品数 */
  total: number;
  /** 最安値にした出品の元の値段 (後から「どの出品だったか」を辿れるように。2026-09-28 ルーンシーカーの 272 神の件) */
  src?: { amount: number; currency: string; account: string; type: string | null };
}

/** 1 回の取得で見る件数。取得 1 回で 10 件まで取れる (信号の数は 1 件と同じ) */
const WATCH_TOP_N = 10;

const KEY_HOURS = "exiledesk.uniqueWatch.hours";
const KEY_HIST = "exiledesk.uniqueWatch.history.v1";
const KEY_LAST = "exiledesk.uniqueWatch.lastRun";
const MAX_POINTS = 500;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* 保存できない環境は今回だけ */
  }
}

const hours = ref<number>(read(KEY_HOURS, 0));
const history = ref<Record<string, UniquePoint[]>>(read(KEY_HIST, {}));
const lastRun = ref<number>(read(KEY_LAST, 0));
const busy = ref(false);
/** 今取っているお気に入り (画面に出す) */
const current = ref("");
let gen = 0;

/** お気に入りのキー (英名|ベース) → 名前とベース */
function split(key: string): { name: string; base: string } {
  const i = key.indexOf("|");
  return i < 0 ? { name: key, base: "" } : { name: key.slice(0, i), base: key.slice(i + 1) };
}

/** 全部のお気に入りを 1 回取る。手で押した時も見回りからも */
async function runOnce(): Promise<void> {
  const favs = [...uniqueFavorites.set.value];
  if (busy.value || !favs.length) return;
  if (!tradeLock.begin("unique-fav", () => stop())) return;
  const ticket = tradeLock.ticket();
  const g = ++gen;
  busy.value = true;
  try {
    // お気に入りの数だけ信号を使う (検索 + 取得)。途中で制限にかからず回り切れるまで待つ
    if (!(await tradeLock.reserve("unique-fav", favs.length))) return;
    const league = marketStore.tradeLeague.value;
    for (const key of favs) {
      if (g !== gen) return;
      const { name, base } = split(key);
      current.value = name;
      // 10 件取って、うちのレートで換算した一番安い物を採る。取引所の「安い順」は取引所自身の通貨の値付けで並ぶので、
      // 先頭 1 件だけだと変わった通貨の出品を高く (安く) 見誤ることがある (2026-09-28 ルーンシーカーの呼び声が 272 神と記録された)
      const r = await autoPrice(league, buildUniqueNameQuery(name, base ? { baseType: base } : {}), marketStore.rates.value, WATCH_TOP_N);
      if (g !== gen) return;
      if (!r) continue;
      const top = r.listings.find((l) => Number.isFinite(l.amountExalted));
      const src = top ? { amount: top.amount, currency: top.currency, account: top.account, type: top.priceType ?? null } : undefined;
      appLog(
        `[お気に入り] ${name} (${base || "ベース指定なし"}): 出品 ${r.total} 件、最安 ${top ? `${top.amount} ${top.currency} (${top.account || "?"}、${top.priceType ?? "?"}) = ${Math.round(top.amountExalted)} 高貴` : "なし"}` +
          ` / 取った 10 件: ${r.listings.slice(0, 10).map((l) => `${l.amount}${l.currency}`).join(", ")}`,
      );
      const list = [...(history.value[key] ?? []), { t: Date.now(), ex: r.minExalted ?? null, total: r.total, ...(src ? { src } : {}) }].slice(-MAX_POINTS);
      history.value = { ...history.value, [key]: list };
      write(KEY_HIST, history.value);
    }
    lastRun.value = Date.now();
    write(KEY_LAST, lastRun.value);
  } finally {
    if (g === gen) {
      busy.value = false;
      current.value = "";
    }
    tradeLock.end("unique-fav", ticket);
  }
}
function stop(): void {
  gen++;
  busy.value = false;
  current.value = "";
}

let started = false;
export const uniqueWatch = {
  hours: computed(() => hours.value),
  history: computed(() => history.value),
  lastRun: computed(() => lastRun.value),
  busy: computed(() => busy.value),
  current: computed(() => current.value),
  /** 次に自動で取る時刻 (ms)。自動取得なしなら null */
  nextAt: computed(() => (hours.value > 0 ? lastRun.value + hours.value * 3_600_000 : null)),
  setHours(h: number): void {
    hours.value = Math.min(24, Math.max(0, h));
    write(KEY_HOURS, hours.value);
  },
  runNow: runOnce,
  stop: () => tradeLock.stop("unique-fav"),
  /** 起動時に 1 回。1 分おきに見回り、間隔が来ていて取引所が空いていれば取る */
  start(): void {
    if (started) return;
    started = true;
    setInterval(() => {
      const h = hours.value;
      if (h <= 0 || busy.value || tradeLock.busyOther("unique-fav")) return;
      if (Date.now() < lastRun.value + h * 3_600_000) return;
      void runOnce();
    }, 60_000);
  },
};
