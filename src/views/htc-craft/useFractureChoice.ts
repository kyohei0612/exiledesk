/**
 * useFractureChoice.ts — ベースの始め方を、初動の安い順に (2026-09-24)
 *
 * オーナー:「フラクチャー品かフラクチャー無し品かみたいなところは？」「だったら選ばせたら。初動安い順で表示して」
 * 「フラクチャー無し品とかも選択肢じゃなかったっけ」「両方混ぜたやつもいらない」
 * 「無し (0) から作るは消す。ゆるいみたいな検索の方を残す」。**ベースは買う物**。
 * 選択肢 (初動 = 固定済みの MOD が付いたベースになるまでの額):
 *   - 固定済みを買う        … 最安 1 件。見つからなければ手で値段を入れる
 *   - 固定無し・厳しい / ゆるい … 固定無しを買って固定する。**85% に届く個数をまとめて買う合計**で比べる
 *     (オーナー:「確率的に 11 個必要ならその 11 個分の値段の合計で出して固定品と比較」)。
 *     出品がその個数に足りなければ**挑戦できない**ので選べない (「4 件しか無かったらそもそもチャレンジできない」)
 * 判定は 09-23 の樹 MOD の物 ([[tree-decide.ts]] の batchFor、useHtcCraft の `searchTree`)。貼り付けで
 * 固定済みだった普通の MOD もそこに乗せた ([[tree-buy.ts]] の `fracturedBuys`)。取引所は押した時だけ 3 本。
 *
 * **ベース選びまでは自動、足りない情報は手で埋める**: 値段の分かっている一番安い物を自動で選び、人が選び直したらそちら。
 */
import { computed, ref, watch } from "vue";
import { startOption } from "./craft-settings";
import { startRows, type StartRow } from "./start-rows";
import type { useHtcCraft } from "./useHtcCraft";

export function useFractureChoice(c: ReturnType<typeof useHtcCraft>) {
  /** 手で入れた固定済みの値段 (神)。取引所で見つからない時に埋める */
  const manual = ref<number | null>(null);
  /** 人が選び直したか (選び直すまでは一番安い物を自動で選ぶ) */
  const picked = ref<string | null>(null);
  watch(() => c.treePlan.value, () => { manual.value = null; picked.value = null; });

  /** 選択肢を初動の安い順に ([[start-rows.ts]]。候補の MOD の各行と同じ作り) */
  const options = computed<StartRow[]>(() => {
    if (!c.treePlan.value) return [];
    return startRows(c.treeResult.value, c.prices.value?.currency.divine ?? 1, { busy: c.treeBusy.value, manualDivine: manual.value });
  });
  const chosen = computed(() => {
    const rows = options.value;
    return rows.find((x) => x.id === picked.value && x.cost != null) ?? rows.find((x) => x.cost != null) ?? null;
  });
  // ベースは買う物なので、1 手ずつは固定済みの MOD が付いた状態から
  watch(chosen, () => { startOption.value = "frac"; }, { immediate: true });
  const choose = (id: string): void => { picked.value = id; };

  return { options, chosen, choose, manual, search: c.searchTree, busy: c.treeBusy, error: c.treeError, searched: computed(() => !!c.treeResult.value) };
}
