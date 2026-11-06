<!--
  StagePhoneBar.vue — スマホの下の帯 (持っている物を使う・離す・戻す・持っている物の説明)。CraftStage.vue から分けた (2026-10-16、500 行の決まり)。
  出すかどうか (スマホ・手で打つ時・持っている / 発現の候補がある) は親が決める。
  打った後に「＋ MOD / － MOD」を 5 秒出す知らせは 11-07 に消した (オーナー「こういうのいらん」。打った結果は MOD 一覧の光と取り消し線 = M-42)
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { craftStage as s, iconOf, nameOf } from "../../state/craft-stage";
import { stageAdds, stageHelp } from "../../state/for-share/craft-stage-help";
import { tr } from "../../i18n/lang";
import { flag } from "../../web/release-flags";

const emit = defineEmits<{ scrollToReveal: [] }>();

/**
 * 持っている物の短い説明 (帯に箇条書き。PC の説明カードと同じ元 = craft-stage-help の stageHelp / stageAdds)。
 * 2026-10-08 オーナー「説明文は小さくてもいいからタップした際付けた方がいい、箇条書きでいい。増強とかアイテムレベルの加減あるでしょ」
 * 2026-10-26 オーナー「基本スマホは省略したらダメ」→ 畳まずに全部の行を折り返して出す (前は 2 行まで + 「詳しく」、足される MOD も 3 つまで)
 */
const heldHelp = computed((): string[] => {
  const k = s.held.value;
  if (!k) return [];
  const strip = (t: string): string => t.replace(/\*\*/g, "");
  const lines = stageHelp(k, s.data.value, s.item.value).map(strip);
  const adds = stageAdds(k, s.data.value, s.item.value);
  return [...lines, ...(adds ? [`${adds.head}: ${adds.lines.join(" / ")}`] : [])];
});
/** 持っている物が今打てない理由 (帯のボタンを灰色に。2026-10-08 レビュー A2) */
const heldWhy = computed(() => (s.held.value ? s.usable(s.held.value) : null));
function useFromBar(): void {
  if (heldWhy.value) return;
  s.use();
}
/** 説明は既定で閉じて「説明 ▾」で開く (スイッチ phoneHelp、U-29・U-51、オーナー 10-28「スマホはすべて任意のが情報量少なくていい」「aで合ってる」。シミュの TreeHandShelf と同じ形)。開いたら全文 */
const HELP_FOLD = flag("phoneHelp");
const helpOpen = ref(false);
watch(() => s.held.value, () => { helpOpen.value = false; });
</script>

<template>
  <div data-bottom-bar class="fixed inset-x-0 bottom-0 z-[150] border-t border-amber-400/40 bg-[#14110d]/95 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[13px] shadow-[0_-6px_20px_rgba(0,0,0,0.6)]">
    <!-- 発現の候補が出ている間は、選ぶ所へ送る案内だけ -->
    <div v-if="s.offers.value" class="flex items-center gap-2">
      <span class="min-w-0 flex-1 text-rose-200">{{ tr("発現する MOD を 3 つから選ぶ", "Choose 1 of 3 mods to reveal") }}</span>
      <button type="button" class="min-h-11 rounded-lg bg-rose-500/30 px-3 py-2 font-bold text-rose-50 ring-1 ring-rose-400/70" @click="emit('scrollToReveal')">{{ tr("選ぶ ↑", "Choose ↑") }}</button>
    </div>
    <template v-else>
      <!-- 次が打てない理由は出す (「使う」が灰色の訳が見えなかった。2026-10-08 使い倒しテスト) -->
      <p v-if="heldWhy" class="mb-1 text-[12px] text-rose-300">{{ heldWhy }}</p>
      <!-- 持っている物の説明 (箇条書き、全部の行を折り返して出す。画面の 4 割を超える時だけ中で送る) -->
      <button v-else-if="heldHelp.length && HELP_FOLD && !helpOpen" type="button" data-held-help-toggle class="mb-1 min-h-9 text-[12px] text-[#c9b48a] underline decoration-white/20" :aria-expanded="false" @click="helpOpen = true">{{ tr("説明 ▾", "Details ▾") }}</button>
      <div v-else-if="heldHelp.length" data-held-help class="mb-1 max-h-[40vh] overflow-y-auto">
        <button v-if="HELP_FOLD" type="button" data-held-help-toggle class="mb-1 min-h-9 text-[12px] text-[#c9b48a] underline decoration-white/20" :aria-expanded="true" @click="helpOpen = false">{{ tr("説明を閉じる ▴", "Hide details ▴") }}</button>
        <ul class="list-disc pl-4 text-[11px] leading-snug text-white/70">
          <li v-for="(l, i) in heldHelp" :key="i" class="pr-1">{{ l }}</li>
        </ul>
      </div>
      <div class="flex items-center gap-2">
        <img v-if="iconOf(s.held.value!)" :src="iconOf(s.held.value!)" alt="" class="h-9 w-9 object-contain" />
        <span class="min-w-0 flex-1 text-[12px] leading-tight"><b class="text-amber-100">{{ nameOf(s.held.value!) }}</b><span v-if="s.omens.value.length" class="ml-1 text-orange-200">+ {{ s.omens.value.map((o) => nameOf(o)).join(tr("・", ", ")) }}</span></span>
        <button v-if="s.log.value.length" type="button" class="g-btn sm min-h-11 shrink-0 whitespace-nowrap" :title="tr('直前の 1 手を取り消す', 'Undo the last step')" @click="s.undo()">{{ tr("戻す", "Undo") }}</button>
        <button type="button" class="g-btn-red min-h-11 shrink-0 whitespace-nowrap px-2 text-[14px]" :disabled="!!heldWhy" @click="useFromBar">{{ tr("使う", "Use") }}</button>
        <!-- 離す = 大きめの × (2026-10-08 オーナー「バツボタン割とデカく」) -->
        <button type="button" class="grid min-h-11 min-w-11 place-items-center rounded-lg border border-white/25 text-[22px] leading-none opacity-80" :title="tr('離す', 'Drop')" @click="s.hold(null)">×</button>
      </div>
    </template>
  </div>
</template>
