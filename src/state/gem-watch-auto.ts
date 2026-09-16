/**
 * gem-watch-auto.ts — 捌き速度の追跡リストを自動で用意する (2026-09-16)
 *
 * オーナー要望: 「アプリ起動からそれスタートできる?」。
 * 出品の追跡そのものは Rust 側 (market_flow.rs) が起動 15 秒後から 1 時間ごとに回すが、
 * 「何を追うか」はクラフト選定ジェムの取得結果 (完成品 5 人以上) で決まる。
 * それを手で押さなくても済むように、起動時に 1 日 1 回だけ取り直す。
 *
 * poe.ninja 側は 1 アセンダンシー分 (100 人 + 2 リクエスト) で数分かかるので、
 * 1 日 1 回より短い間隔では回さない (レート制限を焼かないため)。
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../utils/isTauriRuntime";
import { loadFlow, setWatches } from "../services/market-flow";
import { buildGemQuery } from "../services/trade2/query";
import { jaSkill } from "../i18n/skills-ja";
import { marketStore } from "./market-store";
import { trade2Site } from "../services/trade2/league";

/** 追跡対象にする下限 (完成品を使っている人数)。GemBreak.vue と同じ値 */
const TRACK_MIN_FINISHED = 5;
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

/** 取得結果から追跡リストを作って登録する (画面からも使う形と同じ) */
export function watchesFromRows(rows: Row[]): { key: string; label: string; note: string; query: unknown }[] {
  return rows
    .filter((r) => r.both >= TRACK_MIN_FINISHED)
    .map((r) => ({
      key: r.name,
      label: jaSkill(r.name),
      note: `完成品 ${r.both} / ${r.users} 人`,
      query: buildGemQuery(r.name, { category: "gem.activegem", levelMin: 21, qualityMin: 23, corrupted: true }),
    }));
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

async function refreshIfStale(): Promise<void> {
  try {
    const flow = await loadFlow();
    const nowSec = Math.floor(Date.now() / 1000);
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
    await setWatches(watchesFromRows(r.rows), marketStore.league.value?.Value ?? "", trade2Site());
  } catch {
    /* poe.ninja が 429 等で取れない日もある。次の起動で再挑戦 */
  }
}
