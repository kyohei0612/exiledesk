/**
 * gem-watch-auto.ts — 捌き速度の追跡リストを自動で用意する (2026-09-16)
 *
 * オーナー要望: 「アプリ起動からそれスタートできる?」。
 * 出品の追跡そのものは Rust 側 (market_flow.rs) が周期 (既定 8 時間、設定で変更可) ごとに回すが、
 * 「何を追うか」はクラフト選定ジェムの取得結果 (完成品 5 人以上) で決まる。
 * それを手で押さなくても済むように、起動時に 1 日 1 回だけ取り直す。
 *
 * poe.ninja 側は 1 アセンダンシー分 (100 人 + 2 リクエスト) で数分かかるので、
 * 1 日 1 回より短い間隔では回さない (レート制限を焼かないため)。
 */
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isTauriRuntime } from "../utils/isTauriRuntime";
import { loadFlow, setWatches } from "../services/market-flow";
import { rowQuery, SALE_KEYS, SALE_KEY_LABEL, watchKey } from "../views/gem-corrupt/row-query";
import { watchGems, type GemUsageRow } from "./watch-settings";
import { jaSkill } from "../i18n/skills-ja";
import { GEMS } from "../views/gem-corrupt/useGemCorrupt";
import { marketStore } from "./market-store";
import { trade2Site } from "../services/trade2/league";

/** リストを取り直す間隔 */
/**
 * 使用率ランキングを取り直す間隔 (2026-09-18 オーナー指示:
 * 「この使用リストって、忍者の上位 MOD を取る時に一緒に取得ってイメージ」)。
 *
 * 上位プレイヤーMOD一覧と同じ poe.ninja を叩くので、別々の時計で走らせると枠を取り合う。
 * MOD 一覧の取得が終わった直後に相乗りする (下の listen) ので、実際の間隔は設定の
 * 「自動再取得」(既定 3 日) に従う。ここはその保険で、3 日より前には取り直さない。
 * オーナー指示:「全体がごろっと変わるのはそんなに無いから、どっちも 3 日に 1 回のペースに」。
 */
const REFRESH_SECS = 3 * 24 * 3600;
/** 起動直後は他の取得とぶつかるので少し待つ */
const START_DELAY_MS = 30_000;
/** クラフト選定ジェムの画面と共有する保存先 */
const RESULT_KEY = "exiledesk.gem-break.result";

type Row = GemUsageRow;
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
 *
 * どのジェムを監視するかは設定 (state/watch-settings.ts) で決まる。
 * 既定は「全アセンダンシー・品質 23% の使用者数 上位 5・5 人以上・上限 10 ジェム」。
 */
export function watchesFromRows(rows: Row[]): { key: string; label: string; note: string; query: unknown }[] {
  const out: { key: string; label: string; note: string; query: unknown }[] = [];
  for (const gem of watchGems(rows)) {
    for (const key of SALE_KEYS) {
      out.push({
        key: watchKey(gem.name, key),
        label: `${jaSkill(gem.name)} (${SALE_KEY_LABEL[key]})`,
        note: gem.note,
        // メタジェムは検索のカテゴリが違う。画面側と同じ判定にする (2026-09-17 全点検で発覚)
        query: rowQuery(gem.name, key, GEMS.find((g) => g.en === gem.name)?.kind === "meta"),
      });
    }
  }
  return out;
}

/**
 * 今表示している使用率ランキングがどのアセンダンシーの物か ("" = 全アセ、null = 不明 / 複数)。
 * 使用率ランキング (GemBreak) が入れて、監視の「取得先」の脇に「未取得」と出すために読む
 * (2026-09-19 オーナー指示:「個別選んだ時、取得されてなかったら取得を促して」)。
 */
export const rankingClass = ref<string | null>(null);

/** 保存済みの取得結果 (クラフト選定ジェム) */
export function cachedRows(): Row[] | null {
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
 * 設定を変えた時に呼ぶ。保存済みの取得結果から監視リストを作り直す (poe.ninja は叩かない)。
 * 取得結果が無ければ false (その時は取得してもらう)。
 */
export async function rebuildWatches(): Promise<boolean> {
  const rows = cachedRows();
  if (!rows) return false;
  await setWatches(watchesFromRows(rows), marketStore.league.value?.Value ?? "", trade2Site());
  return true;
}

/**
 * 起動時に 1 回だけ呼ぶ。リストが空、または 24 時間以上前の物なら取り直す。
 * 失敗しても何も言わない (次の起動でまた試す)。
 */
export function startWatchAutoRefresh(): void {
  if (started || !isTauriRuntime()) return;
  started = true;
  // 上位プレイヤーMOD一覧の取得が終わったら相乗りする (poe.ninja を 1 回のまとまりで叩くため)。
  // 取得中はこちらが断られるので、終わってから声がかかるこの形が一番ぶつからない
  void listen("craft-v2-done", () => {
    void refreshIfStale();
  });
  // MOD 一覧が走らない時のための保険 (キャッシュが新しければ何もしない)
  setTimeout(() => void refreshIfStale(), START_DELAY_MS);
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

    // 相乗りで取るのは **全アセンダンシーだけ** (オーナー指示 2026-09-19:
    // 「上位 MOD の時に一緒にって言うけど時間かかっちゃうから、一緒に取るのは
    //   デフォの全アセ使用率だけでいいや。1 個ずつやってたら長くなるでしょ」)。
    // 個別アセは画面の「取得」で明示的に取る。
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
