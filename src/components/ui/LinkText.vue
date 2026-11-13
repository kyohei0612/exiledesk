<!--
  LinkText.vue — 文の中の http(s):// の URL を押せるリンクにして出す (U-36、スイッチ replyLink)。
  v-html は使わず、文を切って a を挟む。新しいタブ・rel="noopener noreferrer"。長い URL は折り返す。
  スイッチが閉じている間は文をそのまま出す。
-->
<script setup lang="ts">
import { computed } from "vue";
import { flag } from "../../web/release-flags";

const props = defineProps<{ text: string }>();

type Part = { t: string; href?: string };
// 空白・かぎかっこ・全角の句読点で切る。終わりの半角の句読点は URL に含めない
const URL_RE = /https?:\/\/[^\s<>"'「」『』（）、。，．]+/g;
const TRAIL_RE = /[.,!?;:)]+$/;

const parts = computed<Part[]>(() => {
  const s = props.text ?? "";
  if (!flag("replyLink")) return [{ t: s }];
  const out: Part[] = [];
  let last = 0;
  for (const m of s.matchAll(URL_RE)) {
    const at = m.index ?? 0;
    const u = m[0].replace(TRAIL_RE, "");
    if (u.length <= "https://".length) continue;
    if (at > last) out.push({ t: s.slice(last, at) });
    out.push({ t: u, href: u });
    last = at + u.length;
  }
  if (last < s.length) out.push({ t: s.slice(last) });
  return out;
});
</script>

<template>
  <template v-for="(p, i) in parts" :key="i"><a v-if="p.href" :href="p.href" target="_blank" rel="noopener noreferrer" data-link-text class="break-all text-sky-300 underline underline-offset-2 hover:text-sky-200" @click.stop>{{ p.t }}</a><template v-else>{{ p.t }}</template></template>
</template>
