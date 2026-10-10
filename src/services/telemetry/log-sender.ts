/**
 * 分析用の記録を送る側 (2026-10-09)。logRecord (utils/log-record.ts) の受け口を登録して、溜めた物を画面を離れる時に 1 回だけ
 * POST /log (server/live、D1 に 1 まとまり 1 行) へまとめて送る。サーバーは中身を解かずに置くだけなので重くならない。
 * 先頭に app と n を置く (サーバーはそこだけ読む)。uid = この端末の乱数 (操作の印と同じ)、名前・IP・ログインの情報は送らない
 */
import pkg from "../../../package.json";
import { WEB_API_BASE } from "../../web/config";
import { noLog } from "../../utils/no-log";

const UID_KEY = "exiledesk.web.uid";
/**
 * 送るのは画面を離れる時 (閉じる・裏に回す) だけ。開いている間は溜めるだけ (溜まりすぎた時だけ途中で送る)。
 * 2026-10-10 オーナー「イン時に計測開始で終わりに送る、要望を送ったらそこまでを報告」。前は 1 分おき + 操作の印が別に 15 秒おき
 */
const MAX_RECS = 200;
const MAX_CHARS = 200_000;

type Rec = { k: string; t: number; d: Record<string, unknown> };
let started = false;

export function startLogSender(app: "web" | "app"): void {
  if (started) return;
  started = true;
  const rand = (): string => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  let uid = "";
  try { uid = localStorage.getItem(UID_KEY) ?? ""; if (!uid) { uid = rand(); localStorage.setItem(UID_KEY, uid); } } catch { uid = rand(); }
  const sid = rand();
  const dev = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "mobile" : "pc";
  let buf: Rec[] = [];
  let chars = 0;

  const flush = (beacon = false): void => {
    // この端末は記録しない (no-log.ts)。溜めた物も捨てる
    if (noLog()) { buf = []; chars = 0; return; }
    // 操作の印 (track.ts) も同じ 1 本に乗せる。最後の "__ev" はサーバーが切り取って Analytics Engine へ (D1 には置かない)
    const ev = (globalThis as { __exiledeskEvPull?: () => string | null }).__exiledeskEvPull?.() ?? null;
    if (!buf.length && !ev) return;
    const recs = buf;
    buf = [];
    chars = 0;
    // app と n を先頭に (サーバーは頭の 200 文字だけ見る)
    const body = `{"app":"${app}","n":${recs.length},"v":"${pkg.version}","uid":"${uid}","sid":"${sid}","dev":"${dev}","recs":${JSON.stringify(recs)}${ev ? `,"__ev":${ev}` : ""}}`;
    const url = `${WEB_API_BASE}/log`;
    try {
      const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
      if (beacon && navigator.sendBeacon?.(url, blob)) return;
      void fetch(url, { method: "POST", body, headers: { "content-type": "text/plain;charset=UTF-8" }, keepalive: body.length < 60_000, credentials: "omit" }).catch(() => undefined);
    } catch { /* 落としてよい */ }
  };
  (globalThis as { __exiledeskLog?: (k: string, d: Record<string, unknown>) => void }).__exiledeskLog = (k, d) => {
    if (noLog()) return;
    const r: Rec = { k, t: Date.now(), d };
    const len = JSON.stringify(r).length;
    if (len > 20_000) return; // 1 件が大きすぎる物は捨てる
    buf.push(r);
    chars += len;
    if (buf.length >= MAX_RECS || chars >= MAX_CHARS) flush();
  };
  (globalThis as { __exiledeskLogFlush?: (beacon?: boolean) => void }).__exiledeskLogFlush = flush;
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(true); });
  addEventListener("pagehide", () => flush(true));
}
