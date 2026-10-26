<!--
  TreeIssues.vue — ルート精査の結果の一覧 (SimTreePage から分けた、2026-10-22)。上の帯の「足りない所 n ▾」を押した時だけ帯の下に落ちる窓
  (10-26 夜オーナー「ツリーで使える所がめちゃくちゃ狭い」: 右の列に開きっぱなしにしない)。枠の外を押す・Esc・行を押す (その箱へ寄る) で閉じる
-->
<script setup lang="ts">
import type { CheckIssue } from "../../../services/simulator/tree/tree-check";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { tr } from "../../../i18n/lang";
import BusyTag from "../../../components/ui/BusyTag.vue";

/** busy = 精査の途中 (見出しに進みの札。穴は辿った人から順に足される) */
defineProps<{ issues: CheckIssue[]; lower: boolean; boxName: (id: string) => string; busy?: { text: string; n?: number; of?: number } | null }>();
const emit = defineEmits<{ go: [id: string]; close: [] }>();
const root = ref<HTMLElement | null>(null);
// Esc・枠の外で閉じる (10-26 モンキー 7 の 19、メモ feedback-click-outside-cancel)。開く札 (足りない所 n・▾) は札の側で開け閉めする
const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") emit("close"); };
const onDown = (e: PointerEvent): void => {
  const el = e.target as Element | null;
  if (!el || root.value?.contains(el) || el.closest("[data-tree-test-holes], [data-tree-test-list]")) return;
  emit("close");
};
onMounted(() => { window.addEventListener("keydown", onKey); document.addEventListener("pointerdown", onDown, true); });
onBeforeUnmount(() => { window.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown, true); });
</script>

<template>
  <div ref="root" data-tree-issues role="dialog" :aria-label="tr('足りない所', 'Missing')" class="flex max-h-[min(60vh,520px)] w-[440px] max-w-[calc(100vw-2rem)] flex-col gap-1 overflow-y-auto rounded-lg border px-2 py-1.5 text-[12px] shadow-[0_10px_30px_rgba(0,0,0,0.7)]"
    :class="[issues.length ? 'border-rose-500/40 bg-[#1c0f10]' : busy ? 'border-white/10 bg-[#15110c]' : 'border-emerald-500/40 bg-[#0d1a12]']">
    <div class="flex items-center gap-2">
      <b :class="issues.length ? 'text-rose-200' : busy ? 'text-[#d8ccb4]' : 'text-emerald-200'">{{ issues.length ? tr(`足りない所 ${issues.length} 件`, `${issues.length} missing`) : busy ? tr("精査中", "Checking") : tr("足りない所は無かった (5 人で全部の枝を通した)", "Nothing missing (all branches walked by 5 runs)") }}</b>
      <!-- 穴と箱の赤い「!」の意味 (10-24 モンキー初めての人の回 5: 書いていなかった) -->
      <BusyTag v-if="busy" :text="busy.text" :n="busy.n" :of="busy.of" />
      <button type="button" class="g-btn sm ml-auto" @click="emit('close')">{{ tr("閉じる", "Close") }}</button>
    </div>
    <p v-if="issues.length" data-tree-issues-what class="opacity-70">{{ tr("= 回すと止まる・打てない所 (! の箱)。直すと 100 人回せます。行を押すとその箱へ", "= where runs stop or a craft can't be used (boxes with !). Fix them to run 100. Click a row to go there") }}</p>
    <button v-for="(x, i) in issues" :key="i" type="button" data-tree-issue-row class="flex min-h-7 shrink-0 items-start gap-2 rounded px-1 py-0.5 text-left hover:bg-white/5" @click="emit('go', x.boxId); emit('close')">
      <span class="mt-0.5 shrink-0 rounded-sm bg-rose-600 px-1.5 text-[11px] font-bold text-white">!</span>
      <!-- 箱の名前と文は縦に積んで折り返し、全文 (… で切らない、10-26 ブラック 13) -->
      <span class="flex min-w-0 flex-col">
        <span class="break-words opacity-70">{{ boxName(x.boxId) }}</span>
        <span class="break-words">{{ x.text }}</span>
      </span>
    </button>
  </div>
</template>
