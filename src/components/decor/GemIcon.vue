<!--
  GemIcon.vue — スキル / ジェムの小さな絵 (2026-10-03、火力チェック)

  オーナー「アイテムやジェム・スキルの画像というかアイコンで比較できるような UI がいいね」。
  絵は skill-art (クライアントから書き出した物、画像パック): アクティブはスキルのアイコン (四角)、サポートはアイコンが無い物が多いので
  ジェムの絵 (宝石) に落ちる = 見た目でアクティブ / サポートが分かる。絵が無い (一覧に無い・画像パックがまだ無い・読めなかった) 時は
  何も出さない (枠だけ残さない)。hover を付けると、名前と同じくジェムのカードを開く (アイコンしか並べない所用)
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { gemArt, skillIcon } from "../../services/craft-stage/skill-art";
import { hoverStack } from "../../state/hover-stack";
import { toCss } from "../../utils/zoom";

const props = withDefaults(defineProps<{ en: string; size?: number; /** gem = 宝石の絵を先に (カードの頭など) */ kind?: "icon" | "gem"; hover?: boolean }>(), {
  size: 20,
  kind: "icon",
  hover: false,
});
const src = computed(() => (props.kind === "gem" ? (gemArt(props.en) ?? skillIcon(props.en)) : skillIcon(props.en)));
// 読めなかった絵 (画像パックに無い等) は出さない。別のジェムになったら試し直す
const broken = ref(false);
watch(src, () => (broken.value = false));
function open(ev: MouseEvent): void {
  if (props.hover) hoverStack.openRoot({ kind: "gem", en: props.en }, toCss(ev.clientX), toCss(ev.clientY));
}
</script>

<template>
  <img
    v-if="src && !broken"
    :src="src"
    alt=""
    loading="lazy"
    draggable="false"
    class="shrink-0 rounded-sm object-contain"
    :class="hover ? 'cursor-help' : ''"
    :style="{ width: size + 'px', height: size + 'px' }"
    @error="broken = true"
    @mouseenter="open"
    @mouseleave="hover && hoverStack.leave()"
  />
</template>
