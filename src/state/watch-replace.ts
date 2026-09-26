/**
 * watch-replace.ts — 監視の枠が埋まっている時に「どれと入れ替えるか」を聞く (2026-09-20)
 *
 * オーナー指示:「上限設定したら監視押せないけど押せるようにして、んで入れ替える先を選択できるように。
 * ポップアップで表示させようか、キャンセルもできるように」。
 *
 * 入れたいジェムを askReplace() に渡すと、枠が空いていればそのまま入れる。
 * 埋まっていれば `pending` が立って、画面 (WatchReplaceDialog) が今の監視ジェムを並べる。
 * 選ばれたら外して入れ替え、キャンセルなら何もしない。
 */
import { computed, ref } from "vue";
import { addManualGem, dropWatchGem, isManualGem, removeManualGem, watchSettings } from "./watch-settings";
import { rebuildWatches } from "./gem-watch-auto";
import { queueSample } from "../views/gem-corrupt/sample-now";

/** 入れ替え待ちのジェム (英語名)。null = 聞いていない */
const pending = ref<string | null>(null);

export const watchReplace = {
  pending: computed(() => pending.value),
  /** 今監視しているジェム (入れ替え候補) */
  choices: computed(() => watchSettings.value.manual),
};

/**
 * 監視に入れる。枠が空いていればそのまま、埋まっていれば入れ替え先を聞く。
 * @returns すぐ入れられたか (false = ポップアップで聞いている / 既に入っている)
 */
export async function askReplace(gemEn: string): Promise<boolean> {
  const s = watchSettings.value;
  if (s.manual.includes(gemEn)) return false;
  if (s.manual.length < s.maxGems) {
    addManualGem(gemEn);
    await rebuildWatches();
    queueSample(gemEn);
    return true;
  }
  pending.value = gemEn;
  return false;
}

/** 選んだジェムを外して、待っているジェムを入れる */
export async function replaceWith(dropEn: string): Promise<void> {
  const add = pending.value;
  pending.value = null;
  if (!add) return;
  dropWatchGem(dropEn);
  addManualGem(add);
  await rebuildWatches();
  queueSample(add);
}

/** 聞くのをやめる (何も変えない) */
export function cancelReplace(): void {
  pending.value = null;
}

/**
 * 自動ジェム監視に入れる / 外す (2026-09-26、スキル使用率の画面から共通化)。
 * 入っていれば外す。入っていなければ入れる (枠が埋まっていれば入れ替え先を聞く = askReplace)。
 * オーナー:「ジェムコラの名前の横に監視リストへ追加ボタン、監視済みなら外せる、上書きするかの挙動までみんなと同じで」
 */
export function toggleWatchGem(gemEn: string): void {
  if (isManualGem(gemEn)) {
    removeManualGem(gemEn);
    void rebuildWatches();
    return;
  }
  void askReplace(gemEn);
}
