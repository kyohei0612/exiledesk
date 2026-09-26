/**
 * trade2 のレート制限: 門番 (Rust) の状態の写し、直列化と開発時の間隔、開発時の直接取得
 *
 * pricing.ts から切り出し (2026-09-26)。
 */
import { isTauriRuntime } from "../../../utils/isTauriRuntime";

/**
 * ブラウザ (vite dev) で開いた時だけ vite のプロキシで直接叩く (Rust の門番を通らないので、ここで待つ)。
 * **アプリの中 (開発ビルドの Tauri) では門番を通す。**前は開発ビルドなら常にプロキシで、ログイン (POESESSID) が乗らず
 * 匿名の上限で「検索条件が複雑過ぎます」になっていた (2026-09-24。本番ビルドは最初から門番経由)
 */
export const DEV_TRADE = import.meta.env.DEV && !isTauriRuntime();

/**
 * 連続リクエストの最小間隔 (ms)。search と fetch は別ポリシーなので別々に数える。
 * 2026-09-08 実測 (X-Rate-Limit-Ip, policy trade-search-request-limit):
 *   search = 5:10:60, 15:60:300, 30:300:1800, 600:21600:3600
 *   → 5 分で 30 回を超えると 30 分ペナルティ。2.5 秒間隔だと 75 秒で 429 (Retry-After 600) を食らった。
 * 今は検索 + 取得の合計を 5 分 22 回 (≈ 13.6 秒に 1 回、バースト 6) で流し、5 分の合計も見張る (本番は Rust の門番、
 * 開発ブラウザは下の DEV_COMBINED_INTERVAL_MS)。窓口ごとの間隔 (下の 2 つ) はその中の並び間隔。
 */
const SEARCH_INTERVAL_MS = 2600;
const FETCH_INTERVAL_MS = 2500;
/** 開発ブラウザの合計の間隔 (本番の門番の 300 秒 ÷ 22) */
const DEV_COMBINED_INTERVAL_MS = 13600;

/**
 * エラー文字列から「あと何秒待てば投げられるか」を取り出す。該当しなければ null。
 *   - 429: "... HTTP 429 retry-after=600: ..."
 *   - 門番の待ち切れ: "trade2 レート制限中 (あと 217 秒)。..." (2026-09-19: これを読まずに
 *     「trade2 エラー: …」と長文で出していた。秒数が読めれば普通の制限として数えられる)
 */
export function retryAfterSeconds(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m =
    msg.match(/HTTP 429 retry-after=(\d+)/) ??
    msg.match(/レート制限中 \(あと (\d+) 秒\)/) ??
    msg.match(/枠待ち \(あと (\d+) 秒\)/);
  return m ? Number(m[1]) : null;
}

/** 門番の「枠待ち」(自分の上限、罰則ではない) か。表示を「レート制限中」と分けるため (2026-09-19) */
export function isBudgetWait(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /枠待ち \(あと \d+ 秒\)/.test(msg);
}

const lastRequestAt = { search: 0, fetch: 0 };
let chain: Promise<unknown> = Promise.resolve();

/**
 * 門番 (Rust の trade2.rs `gate_status`) の状態の写し。**画面の数字はこれだけを見る**。
 *
 * 2026-09-19 のリファクタ以前は、ここに「画面から出した search だけを数える別の帳簿」
 * (窓ごとの予算 + 応答ヘッダの同期 + localStorage) があり、裏の巡回がどれだけ枠を使っても
 * 動かない数字をボタンに出していた。実際に投げる間隔を決めているのは門番 1 つなので、
 * 表示もそこから貰う。開発モード (vite プロキシ = 門番を通らない) だけ下の一定間隔で守る。
 */
export interface GateState {
  /** 罰則 (429) の解除予定 (ms)。0 = 止まっていない。**これだけが「止まっている」** */
  penaltyUntilMs: number;
  /** 次の 1 本を投げられる時刻 (ms)。順番待ちであって止まりではない */
  nextAtMs: number;
  /** 直近 5 分に全窓口あわせて送った数 / 今の上限 */
  used: number;
  max: number;
}

let gateSnapshot: (GateState & { at: number }) | null = null;

export function noteGateState(s: GateState): void {
  gateSnapshot = { ...s, at: Date.now() };
}

/** 古い値で表示し続けないよう、30 秒で捨てる */
function gateNow(): GateState | null {
  const g = gateSnapshot;
  return g && Date.now() - g.at < 30_000 ? g : null;
}

/** 罰則で止まっている解除予定 (ms)。止まっていなければ 0 */
export function gatePenaltyUntilMs(): number {
  return gateNow()?.penaltyUntilMs ?? 0;
}

/** 次に投げられる時刻 (ms)。画面の「再取得まで N 秒」用 */
export function nextSearchAllowedAt(): number {
  if (!DEV_TRADE) {
    // 本番: 門番の予定だけ。まだ読めていない起動直後は「待ち無し」(押せば門番が待つ)
    return gateNow()?.nextAtMs ?? 0;
  }
  return lastRequestAt.search + SEARCH_INTERVAL_MS;
}

/** 直近 5 分の送信回数と上限 (画面表示用) */
export function searchBudgetUsage(): { used: number; max: number } {
  const g = gateNow();
  return g ? { used: g.used, max: g.max } : { used: 0, max: 0 };
}

/**
 * 直列化 + (開発時だけ) エンドポイント別の最小間隔。
 * 本番は Rust の門番が間隔もバーストも決めるので、ここで待つと二重になる
 */
export function throttled<T>(kind: "search" | "fetch", fn: () => Promise<T>, opts: { patient?: boolean } = {}): Promise<T> {
  // 長く待つ取得 (patient) は列に並べない。門番 (trade2.rs) の中で最大 20 分待つので、列に入ると
  // その間は画面の取得まで後ろで待たされる (2026-09-26)。間隔と合計の上限は門番が全部の送信で守る
  if (opts.patient && !DEV_TRADE) {
    lastRequestAt[kind] = Date.now();
    return fn();
  }
  const run = async () => {
    if (DEV_TRADE) {
      // 開発ブラウザ (門番を通らない) は検索と取得を合わせて 13.6 秒に 1 本 (本番の門番の合計の間隔と同じ。2026-09-26 レビュー:
      // 窓口ごとに 2.6 秒空けるだけで、クラフト計算機の全検索で隠れた合計の上限を超えて IP ごと罰則を受け得た)
      void kind; void SEARCH_INTERVAL_MS; void FETCH_INTERVAL_MS;
      const wait = Math.max(lastRequestAt.search, lastRequestAt.fetch) + DEV_COMBINED_INTERVAL_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    lastRequestAt[kind] = Date.now();
    return fn();
  };
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p;
}

/**
 * dev (vite) では Tauri が無いので、vite のプロキシ (/api/trade2-www, /api/trade2-jp) 経由で直接叩く。
 * 本番は Rust の trade2_search / trade2_fetch。429 は Rust 側と同じ "HTTP 429 retry-after=N" 形式で投げる。
 */
export async function devJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const rl: Record<string, string> = {};
  r.headers.forEach((v, k) => {
    if (k.toLowerCase().startsWith("x-rate-limit-")) rl[k.toLowerCase()] = v;
  });
  if (r.status === 429) throw new Error(`HTTP 429 retry-after=${r.headers.get("retry-after") ?? "60"} ratelimit=${JSON.stringify(rl)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const body = (await r.json()) as T;
  if (body && typeof body === "object") (body as unknown as { _ratelimit?: Record<string, string> })._ratelimit = rl;
  return body;
}
