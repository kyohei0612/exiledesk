/**
 * poe.ninja を 1 本取る。口・間隔・エラーの時の待ち方と取り直しはアプリのまま (設計図 D-80b・Y-53):
 *   `config.rs` 間隔 2.5 秒から、429 で倍 (上限 10 秒) / 429 の待ちは Retry-After (無ければ 3 秒から倍、最大 120 秒) で 8 回まで /
 *   `http.rs` 5xx は 3 回まで (間隔は伸ばさない) / ほかの 4xx・つながらない・形が違うは即その 1 本を失敗に。
 * アプリと違うのは待ち方だけ: アプリは同じ起動の中で sleep していたが、Worker は起動の間 (D1 の not_before) で待つ。
 */
import type { Ref } from "./protobuf";

export const NINJA_BASE = "https://poe.ninja";
/** アプリと同じ連絡先入りの名乗り (版だけ Web の物に)。Workers の通信には CF-Worker も付くので身元は隠さない */
export const USER_AGENT = "ExileDesk/web-daily (POE2 craft discovery; contact: nekodori0612@gmail.com)";
export const MIN_REQUEST_INTERVAL_MS = 2500;
export const MAX_SLOWDOWN_MS = 10_000;
export const BACKOFF_INITIAL_MS = 3000;
export const BACKOFF_MAX_MS = 120_000;
export const MAX_RETRIES = 8;
export const SERVER_ERROR_MAX_RETRIES = 3;

/** 取り直し中の 1 本 (D1 の ninja_job.pending) */
export interface Pending {
  url: string;
  attempt: number;
  backoff: number;
}

/** 間隔と待ちの状態 (D1 の ninja_job に置く) */
export interface Gate {
  intervalMs: number;
  notBefore: number;
  pending: Pending | null;
}

export type Got = { ok: Response } | { retry: true } | { fail: string };

const enc = encodeURIComponent;
export const urls = {
  indexState: (): string => `${NINJA_BASE}/poe2/api/data/index-state`,
  buildIndexState: (): string => `${NINJA_BASE}/poe2/api/data/build-index-state`,
  /** DPS 順。skills の条件ごとに `&skills=` を並べる (画面の URL の `,` 区切りを口に渡すと別の結果、builds.rs) */
  search: (version: string, snapshot: string, asc: string, skills: string[]): string =>
    `${NINJA_BASE}/poe2/api/builds/${enc(version)}/search?overview=${enc(snapshot)}&class=${enc(asc)}&sort=dps${skills.map((s) => `&skills=${enc(s)}`).join("")}`,
  character: (version: string, snapshot: string, r: Ref): string =>
    `${NINJA_BASE}/poe2/api/builds/${enc(version)}/character?account=${enc(r.account)}&name=${enc(r.name)}&overview=${enc(snapshot)}&timeMachine=`,
};

/**
 * 1 本取る。429・5xx は gate を書き換えて { retry } を返す (呼び側はその起動を終え、not_before の後の起動で同じ URL をもう一度)。
 * 上限を超えた・ほかの失敗は { fail }。
 */
export async function getOnce(url: string, gate: Gate, now: number, fetchFn: typeof fetch = fetch): Promise<Got> {
  const p = gate.pending?.url === url ? gate.pending : { url, attempt: 0, backoff: BACKOFF_INITIAL_MS };
  let res: Response;
  try {
    res = await fetchFn(url, { headers: { "user-agent": USER_AGENT } });
  } catch (e) {
    gate.pending = null;
    return { fail: `network error on ${url}: ${String(e).slice(0, 120)}` };
  }
  const limited = res.status === 429, server = res.status >= 500;
  if (limited || server) {
    const exceeded = server ? p.attempt >= SERVER_ERROR_MAX_RETRIES : p.attempt >= MAX_RETRIES;
    const ra = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : p.backoff;
    if (exceeded) {
      gate.pending = null;
      return { fail: `HTTP ${res.status} after ${server ? SERVER_ERROR_MAX_RETRIES : MAX_RETRIES} retries for ${url}` };
    }
    // 429 は同じ間隔だとまた同じ所で当たるので間隔ごと伸ばし、全部を止める (rate_gate.rs の slow_down・set_penalty)。5xx は待つだけ
    if (limited) gate.intervalMs = Math.min(gate.intervalMs * 2, MAX_SLOWDOWN_MS);
    gate.notBefore = Math.max(gate.notBefore, now + waitMs);
    gate.pending = { url, attempt: p.attempt + 1, backoff: Math.min(p.backoff * 2, BACKOFF_MAX_MS) };
    return { retry: true };
  }
  gate.pending = null;
  if (!res.ok) return { fail: `HTTP ${res.status} for ${url}: ${(await res.text().catch(() => "")).slice(0, 120)}` };
  return { ok: res };
}

/** index-state から リーグ → version・snapshotName。`url` で 2 つを突き合わせる (leagues.rs、09-07 の economyLeagues[0] 落ちの直し) */
export function readIndexState(body: unknown, league: string | null): { league: string; version: string; snapshot: string } {
  const b = body as { economyLeagues?: Array<{ url?: string }>; snapshotVersions?: Array<{ url?: string; version?: string; snapshotName?: string }> };
  if (!Array.isArray(b?.economyLeagues)) throw new Error("index-state: economyLeagues (array) が無い、形が変わった可能性");
  const chosen = league ? b.economyLeagues.find((l) => l.url === league) : b.economyLeagues[0];
  if (!chosen?.url) throw new Error(league ? `index-state: リーグ '${league}' が無い` : "index-state: economyLeagues[0] が無い");
  if (!Array.isArray(b.snapshotVersions)) throw new Error("index-state: snapshotVersions が無い、形が変わった可能性");
  const snap = b.snapshotVersions.find((s) => s.url === chosen.url);
  if (!snap?.version || !snap.snapshotName) throw new Error(`index-state: snapshotVersions にリーグ '${chosen.url}' が無い`);
  return { league: chosen.url, version: snap.version, snapshot: snap.snapshotName };
}

/** build-index-state から そのリーグのアセを使用率の高い順に (search.rs fetch_build_index_state。リーグが無ければ先頭) */
export function readBuildIndexState(body: unknown, league: string): string[] {
  const lb = (body as { leagueBuilds?: Array<{ leagueUrl?: string; statistics?: Array<{ class?: string; percentage?: number }> }> })?.leagueBuilds;
  if (!Array.isArray(lb)) throw new Error("build-index-state: leagueBuilds (array) が無い");
  const node = lb.find((e) => e.leagueUrl === league) ?? lb[0];
  if (!node || !Array.isArray(node.statistics)) throw new Error(`build-index-state: statistics が無い (${league})`);
  return node.statistics
    .filter((s): s is { class: string; percentage: number } => typeof s.class === "string" && typeof s.percentage === "number")
    .sort((a, b) => b.percentage - a.percentage)
    .map((s) => s.class);
}
