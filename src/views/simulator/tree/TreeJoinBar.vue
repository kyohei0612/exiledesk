<!--
  TreeJoinBar.vue — 上の帯の「まとめる」と、選んでいる間の説明の帯 (画面の上の真ん中に浮かぶ。下に置くと下の段の箱にかぶった)。動きは use-tree-join.ts。
  10-26 オーナー「まとめるボタンで枠選ぶ形が良いなんで、その時に説明でればいいからどういう事って感じで」
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import { tr } from "../../../i18n/lang";
import { useTree } from "./use-tree";
import { joinCandidates, joinMode, useTreeJoin } from "./use-tree-join";
import { outsName } from "./tree-names";

const t = useTree();
const j = useTreeJoin();
/** まとめられる箱が 1 つも無ければ押せない */
const any = computed(() => Object.keys(t.doc.value.boxes).some((id) => joinCandidates(t.doc.value, id).length > 0));
const name = (id: string): string => { const b = t.doc.value.boxes[id]; return !b ? "" : b.out === "hit" ? t.boxAimLabel(b) : outsName(b); };
const step = computed(() => {
  const m = joinMode.value;
  if (!m) return "";
  if (!m.anchor) return tr("まとめ先の箱を押す (押せる箱だけ明るい)", "Click the box to merge into (only boxes that can merge are lit)");
  return m.pick.length ? tr(`「${name(m.anchor)}」に ${m.pick.length} 箱をまとめる`, `Merge ${m.pick.length} box(es) into "${name(m.anchor)}"`) : tr(`「${name(m.anchor)}」と一緒にする箱を押す`, `Click the boxes to merge into "${name(m.anchor)}"`);
});
function onKey(e: KeyboardEvent): void { if (e.key === "Escape" && joinMode.value) j.cancel(); }
/** 枠の外 (箱・この帯以外) を押したら取り消す (メモ feedback-click-outside-cancel) */
function onDown(e: PointerEvent): void {
  if (joinMode.value && !(e.target as HTMLElement).closest("[data-tree-join-hit],[data-tree-join-bar],[data-tree-join-btn]")) j.cancel();
}
onMounted(() => { window.addEventListener("keydown", onKey); window.addEventListener("pointerdown", onDown, true); });
onBeforeUnmount(() => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onDown, true); j.cancel(); });
</script>

<template>
  <button type="button" data-tree-join-btn class="g-btn sm" :aria-pressed="!!joinMode" :disabled="!any && !joinMode" :title="any ? tr('どれが付いても後の作り方が同じ箱を選んで 1 つにまとめる (押してから箱を選ぶ)', 'Merge boxes that need the same next steps into one (click, then pick boxes)') : tr('まとめられる箱が無い (同じ側の当たり・同じ形の外れなどが横に並んだ時)', 'Nothing to merge (needs same-side hits or same-shape results side by side)')" @click="joinMode ? j.cancel() : j.start()">{{ tr("まとめる", "Merge") }}</button>
  <div v-if="joinMode" data-tree-join-bar class="fixed left-1/2 top-3 z-[70] flex w-[min(640px,calc(100vw-32px))] -translate-x-1/2 flex-col gap-1.5 rounded-xl border-2 border-amber-300/70 bg-[#17120b]/95 px-4 py-3 text-[13px] shadow-[0_8px_30px_rgba(0,0,0,0.8)]">
    <p class="font-bold text-amber-100">{{ step }}</p>
    <p class="break-words text-[12px] text-[#d8ccb4]">{{ tr("まとめると: 選んだ箱が 1 つの箱になり、以後の手・戻り・完成は 1 本 (どれで着いても同じ作り方)。選べるのは同じ手の結果で、同じ側の当たりか、着いた形が同じ箱だけ。「分ける」で戻せる", "Merging: the picked boxes become one box with a single path (same next steps, return and done whichever you land in). Only results of the same craft can be picked: same-side hits, or boxes that land in the same shape. Split undoes it") }}</p>
    <div class="flex gap-2">
      <button type="button" data-tree-join-go class="g-btn-red min-h-9 flex-1" :disabled="!joinMode.anchor || !joinMode.pick.length" @click="j.apply()">{{ tr("まとめる", "Merge") }}</button>
      <button type="button" class="g-btn min-h-9 flex-1" @click="j.cancel()">{{ tr("やめる (Esc)", "Cancel (Esc)") }}</button>
    </div>
  </div>
</template>
