<!--
  TreeBugReport.vue — 木の途中に出た不具合 (要確認、kind orphan) を送る要望の窓。押した時の木を要望の窓へ渡して開く
  (11-08 オーナー「ツリー途中に未設定が出るのは本体バグとして要望へって促してくれ」→ 案「押すと要望の窓が開き、木の URL が入った形」に「それでおｋ」。
  11-08 オーナー「1おけ」で、木は欄の URL でなく要望の画面の状態 (context) に必ず付けて送る形に替えた (付けるのは要望の窓 = デザイン部)。
  前は欄へ木の URL を入れ、その前はクリップボードへ写して貼ってもらっていた)。
  ページを離れないよう重ねる窓で出す (要望のページへ移ると作業中の木は持ち越さない。作業中の木は localStorage に無く画面の中だけ)
-->
<script lang="ts">
import { ref } from "vue";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";

/** 開いている間の状態 (doc: 押した時の木) */
const bug = ref<{ doc: TreeDoc; mid: boolean } | null>(null);
/** 一覧の「要望・バグを送る」から (押した瞬間に呼ぶ)。mid = 木の途中の未設定の「このまま送る」(窓の上の 1 行を替える、U-05f) */
export function reportTreeBug(doc: TreeDoc, mid = false): void {
  bug.value = { doc, mid };
}
</script>

<script setup lang="ts">
import FeedbackDialog from "../../../web/FeedbackDialog.vue";
import { tr } from "../../../i18n/lang";
import { midBugNote } from "./tree-mid-unset";
</script>

<template>
  <template v-if="bug">
    <FeedbackDialog open @close="bug = null" />
    <!-- 窓の上の 1 行 (要望の窓より上の段) -->
    <p data-tree-bug-note role="status" class="fixed inset-x-0 top-3 z-[400] mx-auto w-fit max-w-[calc(100vw-2rem)] rounded-md border border-amber-300/50 bg-[#1c1610] px-3 py-1.5 text-center text-[13px] text-amber-100 shadow-[0_6px_20px_rgba(0,0,0,0.6)]">{{ bug.mid ? midBugNote() : tr("木は要望と一緒に届きます。何が起きたかを書いて送ってください", "The tree is sent with your feedback. Write what happened and send") }}</p>
  </template>
</template>
