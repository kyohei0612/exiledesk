/**
 * use-watch-actions.ts — 自動ジェム監視の監視リストの操作 (反映 / 足す / 外す / 戻す / ランキングの取り直し)
 *
 * GemWatch.vue から切り出し (2026-09-26)。状態は画面 (GemWatch.vue) が持ち、ここは受け取って操作するだけ。
 */
import { computed, type ComputedRef, type Ref } from "vue";
import { queueSample } from "../gem-corrupt/sample-now";
import { loadFlow, type FlowStore } from "../../services/market-flow";
import {
  addManualGem,
  dropWatchGem,
  recentlyDropped,
  restoreWatchGem,
  updateWatchSettings,
  watchSettings,
  type WatchGem,
} from "../../state/watch-settings";
import { rebuildWatches } from "../../state/gem-watch-auto";
import { askConfirm } from "../../state/confirm-dialog";
import { jaGemName } from "./ja-gem-name";

export interface WatchActionDeps {
  gems: ComputedRef<WatchGem[]>;
  flowStore: Ref<FlowStore | null>;
  busy: Ref<boolean>;
  message: Ref<{ ok: boolean; text: string } | null>;
  /** 検索欄の文字 (足した後に空にする) */
  query: Ref<string>;
  /** 1 秒ごとの時計 (ミリ秒) */
  nowMs: Ref<number>;
  /** 使用率ランキングを取り直す (埋め込んだ GemBreak.vue の fetchNow) */
  fetchNow: () => Promise<void> | undefined;
}

export function useWatchActions({ gems, flowStore, busy, message, query, nowMs, fetchNow }: WatchActionDeps) {
  const s = watchSettings;

  /**
   * 設定を書き換えるだけ。監視の切り替えは「監視を開始」ボタンで明示的に行う
   * (オーナー指示 2026-09-17:「アセンダンシー変えるとすぐ自動取得が止まって新しいのが始まる。
   * 一覧を取得して表示してから、開始ボタンで始めたい」)。
   */
  function apply(patch: Parameters<typeof updateWatchSettings>[0]): void {
    updateWatchSettings(patch);
  }

  /** 設定から決まる監視リストと、今まさに巡回している銘柄の差 */
  const diff = computed(() => {
    const want = new Set(gems.value.map((g) => g.name));
    const now = new Set((flowStore.value?.watches ?? []).filter((w) => w.auto).map((w) => w.key.split("::")[0]));
    const add = [...want].filter((n) => !now.has(n));
    const drop = [...now].filter((n) => !want.has(n));
    return { add, drop, changed: add.length > 0 || drop.length > 0 };
  });

  /** 設定を追跡に反映する (poe.ninja は叩かず、保存済みの取得結果から作り直す) */
  async function sync(confirmDrop = false): Promise<void> {
    if (busy.value) return;
    // 今測っているジェムが外れる時は先に確認 (間違えて押した時の保険。2026-09-20)
    if (confirmDrop && diff.value.drop.length > 0) {
      const names = diff.value.drop.map((n) => jaGemName(n)).join(" / ");
      const ok = await askConfirm(`今の監視から ${diff.value.drop.length} ジェムが外れます。\n${names}`, {
        title: "監視リストを入れ替える",
        okLabel: "入れ替える",
      });
      if (!ok) return;
    }
    busy.value = true;
    try {
      const ok = await rebuildWatches();
      flowStore.value = await loadFlow();
      message.value = ok
        ? { ok: true, text: `監視リストを更新しました (${gems.value.length} ジェム / ${gems.value.length * 3} 銘柄)` }
        : { ok: false, text: "使用率ランキングをまだ取得していません。下の「取得」を押してください (手動で足したジェムは反映済み)" };
    } finally {
      busy.value = false;
    }
  }

  async function add(en: string): Promise<void> {
    if (!addManualGem(en)) {
      message.value = { ok: false, text: `追加できません (既に入っているか、上限 ${s.value.maxGems} ジェムに達しています)` };
      return;
    }
    query.value = "";
    await sync();
    // 足したその場で 3 条件の最安を 1 回ずつ取る (6 リクエスト)。オーナー 2026-09-19
    // 「監視ボタン押したら各項目の最安値だけ 1 件取れるみたいなのでいい、それでクラフトするか決める」
    // 取得は待ち行列に回す (走っていても続けて足せる。2026-09-20)
    queueSample(en);
    message.value = { ok: true, text: `監視に入れました。${jaGemName(en)} の 3 条件を順番に取ります (10 秒後に開始)` };
  }
  /**
   * 監視リストから 1 件外す。手で足した物は消し、使用率ランキングから入った物は除外に入れる
   * (オーナー指示 2026-09-20:「アセンダンシー選んでてもジェムのリスト変更できるように」)。
   */
  async function remove(en: string): Promise<void> {
    dropWatchGem(en);
    await sync();
  }
  /** 監視の枠が埋まっているか (「監視へ +」が押せない理由を画面に出す) */
  const watchFull = computed(() => s.value.manual.length >= s.value.maxGems);

  /**
   * 最近外したジェム (8 時間だけ置いておく)。オーナー指示 2026-09-20:
   * 「監視中ジェムの下に除外したジェムたちを 1 日だけ置いておこう。8 時間でキャッシュクリアで
   *   そこ表示しなくて OK になるように。メモリ機能的な」。
   * 1 秒ごとの時計 (nowMs) を見ているので、8 時間を過ぎた分は自然に消える。
   */
  const dropped = computed(() => recentlyDropped(nowMs.value));
  function restore(en: string): void {
    if (!restoreWatchGem(en)) {
      message.value = { ok: false, text: `戻せません (監視の上限 ${s.value.maxGems} ジェムに達しています)` };
      return;
    }
    void sync();
  }

  /**
   * 使用率ランキングを取り直す。
   * オーナー指示 2026-09-20:「もしジェムが入ってて間違えて取得ボタン押しちゃったら
   * 『上書きしますか』ポップアップを出そう」。上位を自動で入れる設定の時だけ、取り直すと
   * 監視リストが新しい上位で置き換わるので、その時は先に確認する
   * (手で選んでいる時は取り直しても監視リストは変わらないので、黙って取る)。
   */
  async function fetchRanking(): Promise<void> {
    if (s.value.autoTop && gems.value.length > 0) {
      const ok = await askConfirm(`「上位を自動で入れる」が有効です。取り直すと、今の ${gems.value.length} ジェムが新しい上位で置き換わります。`, {
        title: "使用率ランキングを取り直す",
        okLabel: "取得する",
      });
      if (!ok) return;
    }
    await fetchNow();
  }

  return { apply, diff, sync, add, remove, watchFull, dropped, restore, fetchRanking };
}
