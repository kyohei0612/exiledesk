<!--
  RichText.vue — ゲームの文面の [Tag|表示] を下線付きで出し、カーソルでキーワードの説明を開く (2026-09-26)

  オーナー:「詳細にさらに下線の所の詳細みれるじゃん？ あんな感じで詳細の詳細みれるようにして」。
  説明のある Tag だけ下線にする ([[keywords.ts]])。開くのはこの文が載っているカードの 1 つ上の段 ([[hover-stack.ts]])。
  カードの段は親の [[GameItemCard.vue]] が provide する。段の外 (表など) で使った時は段 0 で開く。
-->
<script setup lang="ts">
import { computed, inject, onMounted } from "vue";
import { hoverStack } from "../../state/hover-stack";
import { keywordOf, loadKeywords } from "../../services/keywords";
import { toCss } from "../../utils/zoom";

const props = defineProps<{ text: string }>();
const layerKey = inject<number | null>("hoverLayerKey", null);

onMounted(() => void loadKeywords());

type Seg = { s: string; tag?: string };
const segs = computed<Seg[]>(() => {
  const out: Seg[] = [];
  const re = /\[([^\]|]+)(?:\|([^\]]+))?\]/g;
  let last = 0;
  for (const m of props.text.matchAll(re)) {
    if (m.index! > last) out.push({ s: props.text.slice(last, m.index) });
    out.push({ s: m[2] ?? m[1]!, tag: m[1] });
    last = m.index! + m[0].length;
  }
  if (last < props.text.length) out.push({ s: props.text.slice(last) });
  return out;
});

function open(seg: Seg, ev: MouseEvent): void {
  if (!seg.tag || !keywordOf(seg.tag)) return;
  const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
  // カードは「x + 10」の所に出るので、下線の右端のすぐ横になるように引いておく
  const x = toCss(r.right) - 8;
  const y = toCss(r.top + r.height / 2);
  const payload = { kind: "keyword" as const, id: seg.tag, label: seg.s };
  if (layerKey == null) hoverStack.openRoot(payload, x, y);
  else hoverStack.openChild(layerKey, payload, x, y);
}
</script>

<template>
  <span class="whitespace-pre-line"
    ><template v-for="(g, i) in segs" :key="i"
      ><span
        v-if="g.tag && keywordOf(g.tag)"
        class="underline decoration-dotted underline-offset-[3px] cursor-help"
        @mouseenter="(ev) => open(g, ev)"
        @mouseleave="hoverStack.leave()"
        >{{ g.s }}</span
      ><template v-else>{{ g.s }}</template></template
    ></span
  >
</template>
