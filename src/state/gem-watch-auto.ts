/**
 * gem-watch-auto.ts — 捌き速度の追跡リストを自動で用意する (2026-09-16)
 *
 * オーナー要望: 「アプリ起動からそれスタートできる?」。
 * 出品の追跡そのものは Rust 側 (market_flow.rs) が起動 15 秒後から 2 時間ごとに回すが、
 * 「何を追うか」はクラフト選定ジェムの取得結果 (完成品 5 人以上) で決まる。
 * それを手で押さなくても済むように、起動時に 1 日 1 回だけ取り直す。
 *
 * poe.ninja 側は 1 アセンダンシー分 (100 人 + 2 リクエスト) で数分かかるので、
 * 1 日 1 回より短い間隔では回さない (レート制限を焼かないため)。
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../utils/isTauriRuntime";
import { loadFlow, setWatches } from "../services/market-flow";
import { rowQuery, SALE_KEYS, SALE_KEY_LABEL, watchKey } from "../views/gem-corrupt/row-query";
import { jaSkill } from "../i18n/skills-ja";
import { GEMS } from "../views/gem-corrupt/useGemCorrupt";
import { marketStore } from "./market-store";
import { trade2Site } from "../services/trade2/league";

/** 追跡対象にする下限 (完成品を使っている人数)。GemBreak.vue と同じ値 */
const TRACK_MIN_FINISHED = 5;
/**
 * 自動で追うジェムの数の上限。
 *
 * 1 ジェムにつき 3 条件 (レベル 21 / 品質 23% / 完成品) を追う。
 * 2026-09-17: 巡回を 2 時間 1 巡にして値段の取得を 2 巡に 1 回へ間引いたので、
 * 同じ枠で 10 → 25 ジェム (75 銘柄) まで増やせる。
 * 消費は毎時およそ 69 回で、trade2 の 600 回 / 6 時間 (毎時 100 回) に収まる。
 */
const TRACK_MAX_GEMS = 25;
/** リストを取り直す間隔 */
const REFRESH_SECS = 24 * 3600;
/** 起動直後は他の取得とぶつかるので少し待つ */
const START_DELAY_MS = 30_000;
/** クラフト選定ジェムの画面と共有する保存先 */
const RESULT_KEY = "exiledesk.gem-break.result";

interface Row {
  name: string;
  users: number;
  both: number;
}
interface Result {
  class: string;
  classes?: string[];
  percentage: number;
  characters: number;
  requested?: number;
  cancelled?: boolean;
  league: string;
  snapshot: string;
  fetched_at: number;
  rows: Row[];
}

let started = false;

/** 並び順に左右されない形にして比べる (Rust 側は key を並べ替えて保存するため) */
function canon(v: unknown): string {
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      return Object.keys(o)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = walk(o[k]);
          return acc;
        }, {});
    }
    return x;
  };
  return JSON.stringify(walk(v));
}

/**
 * 取得結果から追跡リストを作る。1 ジェムにつき 3 条件
 * (レベル 21 / 品質 23% / 完成品) を別々に追う (オーナー指示 2026-09-16:
 * 「品質 23% とかでも売れてるか分からんし」)。
 */
export function watchesFromRows(rows: Row[]): { key: string; label: string; note: string; query: unknown }[] {
  const gems = rows
    .filter((r) => r.both >= TRACK_MIN_FINISHED)
    .slice()
    .sort((a, b) => b.both - a.both)
    .slice(0, TRACK_MAX_GEMS);
  const out: { key: string; label: string; note: string; query: unknown }[] = [];
  for (const r of gems) {
    for (const key of SALE_KEYS) {
      out.push({
        key: watchKey(r.name, key),
        label: `${jaSkill(r.name)} (${SALE_KEY_LABEL[key]})`,
        note: `完成品 ${r.both} / ${r.users} 人`,
        // メタジェムは検索のカテゴリが違う。画面側と同じ判定にする (2026-09-17 全点検で発覚)
        query: rowQuery(r.name, key, GEMS.find((g) => g.en === r.name)?.kind === "meta"),
      });
    }
  }
  return out;
}

/**
 * 起動時に 1 回だけ呼ぶ。リストが空、または 24 時間以上前の物なら取り直す。
 * 失敗しても何も言わない (次の起動でまた試す)。
 */
export function startWatchAutoRefresh(): void {
  if (started || !isTauriRuntime()) return;
  started = true;
  setTimeout(() => void refreshIfStale(), START_DELAY_MS);
}

/** 保存済みの取得結果 (クラフト選定ジェム) */
function cachedRows(): Row[] | null {
  try {
    const raw = localStorage.getItem(RESULT_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Result;
    return Array.isArray(r?.rows) && r.rows.length > 0 ? r.rows : null;
  } catch {
    return null;
  }
}

/**
 * 保存済みのクエリが今のコードと違っていたら登録し直す (2026-09-17 全点検)。
 *
 * 追跡の検索は登録時のクエリを Rust 側がそのまま使い回すので、検索条件を直しても
 * 保存済みの銘柄は古い条件のまま回り続けていた
 * (status が securable のまま / 5 ソケット条件が入っていない、を実際に踏んだ)。
 * 条件が違えば別の市場を見ているのと同じなので、登録し直して記録も作り直す。
 *
 * @returns 作り直したら true
 */
async function rebuildIfQueryChanged(flow: Awaited<ReturnType<typeof loadFlow>>, league: string): Promise<boolean> {
  const rows = cachedRows();
  if (!rows) return false;
  const want = watchesFromRows(rows);
  if (want.length === 0) return false;
  const stale = want.some((w) => {
    const cur = flow.watches.find((x) => x.key === w.key);
    return !cur || canon(cur.query) !== canon(w.query);
  });
  if (!stale) return false;
  await setWatches(want, league, trade2Site());
  return true;
}

async function refreshIfStale(): Promise<void> {
  try {
    const flow = await loadFlow();
    const nowSec = Math.floor(Date.now() / 1000);
    const league = marketStore.league.value?.Value ?? "";
    // 保存済みのクエリが古い形なら、24 時間経っていなくても登録し直す
    if (flow.watches.length > 0 && (await rebuildIfQueryChanged(flow, league))) return;
    const fresh = flow.watches.length > 0 && nowSec - flow.list_refreshed_at < REFRESH_SECS;
    if (fresh) return;

    // 全アセンダンシー (リーグ全体の上位 100 人) で取り直す
    const r = await invoke<Result>("gem_break_fetch", { req: { class: "", topN: 100, spread: 1 } });
    if (!r?.rows?.length) return;
    try {
      localStorage.setItem(RESULT_KEY, JSON.stringify(r));
    } catch {
      /* 保存できなくても追跡は動く */
    }
    await setWatches(watchesFromRows(r.rows), league, trade2Site());
  } catch {
    /* poe.ninja が 429 等で取れない日もある。次の起動で再挑戦 */
  }
}
