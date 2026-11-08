<!--
  TreeBugReport.vue — 木の途中に出た不具合 (要確認、kind orphan) を送る要望の窓。押した時に今の木の URL をクリップボードへ写してから開く
  (11-08 オーナー「ツリー途中に未設定が出るのは本体バグとして要望へって促してくれ」→ 案「押すと要望の窓が開き、木の URL が入った形」に「それでおｋ」。
  欄へ最初から入れるのは要望の窓 (デザイン部の持ち物) の直しが要るので、今は写して貼ってもらう)。
  ページを離れないよう重ねる窓で出す (要望のページへ移ると作業中の木は持ち越さない)。写すのは押した瞬間 (Safari は後から写すのを断る、copyRecipeUrl)
-->
<script lang="ts">
import { ref } from "vue";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { copyRecipeUrl } from "../recipe-share";
import { currentTreeRecipe } from "../../../state/simulator/tree-recipes";

/** 開いている間の状態 (copied: 写せた / 写せなかった / まだ) */
const bug = ref<{ copied: boolean | null } | null>(null);
/** 一覧の「要望・バグを送る」から (押した瞬間に呼ぶ) */
export function reportTreeBug(doc: TreeDoc): void {
  const now = { copied: null as boolean | null };
  bug.value = now;
  void copyRecipeUrl({ name: currentTreeRecipe.value?.name ?? "tree", tree: doc }).then((r) => { if (bug.value === now) bug.value = { copied: r.ok }; });
}
</script>

<script setup lang="ts">
import FeedbackDialog from "../../../web/FeedbackDialog.vue";
import { tr } from "../../../i18n/lang";
</script>

<template>
  <template v-if="bug">
    <FeedbackDialog open @close="bug = null" />
    <!-- 窓の上の 1 行 (要望の窓より上の段) -->
    <p v-if="bug.copied !== null" data-tree-bug-note role="status" class="fixed inset-x-0 top-3 z-[400] mx-auto w-fit max-w-[calc(100vw-2rem)] rounded-md border border-amber-300/50 bg-[#1c1610] px-3 py-1.5 text-center text-[13px] text-amber-100 shadow-[0_6px_20px_rgba(0,0,0,0.6)]">{{ bug.copied ? tr("木の URL をコピーしました。欄に貼り付けて送ってください", "The tree URL is copied. Paste it into the box and send") : tr("木の URL をコピーできませんでした。今の画面の状態は一緒に届きます", "Couldn't copy the tree URL. The current screen state is sent along") }}</p>
  </template>
</template>
