/**
 * flow-seed.ts — 捌き速度の記録をビルドに同梱して、サブ機に配る (2026-09-20)
 *
 * オーナー指示:「俺が取得した生の監視データを基本的にビルドに組み込んでくれ」
 * 「これ別に人に配るわけじゃないから俺のデータそのまま使って OK。出品者情報とかフルで
 *   渡してあげて、要約せずに」。
 *
 * 流れ:
 *   1. 測った機体で「配布データを書き出す」を押す → src/data/flow-seed.json が更新される
 *   2. そのまま release.bat (コミット → タグ → CI がビルド)
 *   3. サブ機は起動時に更新を見つけて自動で入れ、この同梱データを取り込む
 *
 * 取り込みは**こちらに無い銘柄と、こちらより新しい銘柄だけ**。サブ機で自分が測った分は消さない。
 * 監視リスト (どのジェムを追うか) は機体ごとの設定なので同梱していない。
 */
import { invoke } from "@tauri-apps/api/core";
import seed from "../data/flow-seed.json";
import { isTauriRuntime } from "../utils/isTauriRuntime";

/** 最後に取り込んだ同梱データの時刻 (同じ物を毎回入れ直さない) */
const KEY = "exiledesk.flow-seed.importedAt";

/** 同梱データが測られた時刻 (unix 秒)。0 なら同梱なし */
export function seedStamp(): number {
  const n = (seed as { sampled_at?: number })?.sampled_at;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/** 同梱データに入っている銘柄数 */
export function seedCount(): number {
  return Object.keys((seed as { states?: Record<string, unknown> })?.states ?? {}).length;
}

/**
 * 起動時に 1 回。まだ取り込んでいない同梱データがあれば取り込む。
 * 失敗しても何も言わない (次の起動でまた試す)。
 * @returns 入れた銘柄数 (取り込まなかった時は 0)
 */
export async function importFlowSeed(): Promise<number> {
  if (!isTauriRuntime() || seedCount() === 0) return 0;
  const stamp = seedStamp();
  try {
    if (Number(localStorage.getItem(KEY) ?? "0") >= stamp) return 0;
  } catch {
    /* 読めなくても取り込みは試す */
  }
  try {
    const n = await invoke<number>("market_flow_import_seed", { json: JSON.stringify(seed) });
    try {
      localStorage.setItem(KEY, String(stamp));
    } catch {
      /* 印が残せなくても取り込み自体は済んでいる */
    }
    return n;
  } catch {
    return 0;
  }
}

/** 測った記録をリポジトリに書き出す (配る側の操作) */
export async function exportFlowSeed(path: string): Promise<{ path: string; bytes: number }> {
  const [p, bytes] = await invoke<[string, number]>("market_flow_export_seed", { path });
  return { path: p, bytes };
}
