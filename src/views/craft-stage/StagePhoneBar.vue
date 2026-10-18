<!--
  StagePhoneBar.vue — スマホの下の帯 (持っている物を使う・離す・戻す・持っている物の説明・打った結果)。CraftStage.vue から分けた (2026-10-16、500 行の決まり)。
  出すかどうか (スマホ・手で打つ時・持っている / 発現の候補がある) は親が決める
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { craftStage as s, iconOf, nameOf } from "../../state/craft-stage";
import { stageAdds, stageHelp } from "../../state/craft-stage-help";
import { modText, tr } from "../../i18n/lang";
import Disclosure from "../../components/ui/Disclosure.vue";

const emit = defineEmits<{ scrollToReveal: [] }>();

/** 帯から打った直後の結果 (次の操作か 5 秒まで帯に出す。カードと直前の変化は画面の上で見えないため。2026-10-08 レビュー A1) */
const barMsg = ref<{ text: string; tone: string } | null>(null);
let barTimer: ReturnType<typeof setTimeout> | undefined;
/**
 * 持っている物の短い説明 (帯に箇条書き。PC の説明カードと同じ元 = craft-stage-help の stageHelp / stageAdds)。
 * 2026-10-08 オーナー「説明文は小さくてもいいからタップした際付けた方がいい、箇条書きでいい。増強とかアイテムレベルの加減あるでしょ」
 */
const helpOpen = ref(false);
const heldHelp = computed((): string[] => {
  const k = s.held.value;
  if (!k) return [];
  const strip = (t: string): string => t.replace(/\*\*/g, "");
  const lines = stageHelp(k, s.data.value, s.item.value).map(strip);
  const adds = stageAdds(k, s.data.value, s.item.value);
  return [...lines, ...(adds ? [`${adds.head}: ${adds.lines.slice(0, 3).join(" / ")}${adds.lines.length > 3 ? " …" : ""}`] : [])];
});
watch(() => s.held.value, () => { helpOpen.value = false; });
/** 持っている物が今打てない理由 (帯のボタンを灰色に。2026-10-08 レビュー A2) */
const heldWhy = computed(() => (s.held.value ? s.usable(s.held.value) : null));
function useFromBar(): void {
  if (heldWhy.value) return;
  s.use();
  const last = s.last.value;
  const parts: string[] = [];
  if (last) {
    if (!last.out.applied) parts.push(tr(`打てない: ${last.out.reason ?? ""}`, `Can't use: ${last.out.reason ?? ""}`));
    for (const m of last.added) parts.push(`${tr("＋", "+")} ${modText(m)}`);
    for (const m of last.removed) parts.push(`${tr("－", "-")} ${modText(m)}`);
    if (last.out.note) parts.push(String(last.out.note));
    if (!parts.length) parts.push(tr("MOD は変わらない", "No mod change"));
  }
  barMsg.value = { text: parts.join("  "), tone: last && !last.out.applied ? "text-rose-300" : last?.removed.length && !last.added.length ? "text-rose-300" : "text-emerald-300" };
  clearTimeout(barTimer);
  // 2 行まで出して、次の操作 (持つ / 離す) か 5 秒で消す (1 行 1.8 秒だとカオスの ＋/－ が読めなかった。2026-10-08 レビュー)
  barTimer = setTimeout(() => { barMsg.value = null; }, 5000);
}
watch(() => s.held.value, () => { barMsg.value = null; });
// 発現 (3 つから選ぶ) で付いた物も帯に出す (帯から打った時しか出ていなかった)
watch(() => s.log.value[s.log.value.length - 1]?.out.index ?? 0, (n, o) => {
  const last = s.last.value;
  if (n <= (o ?? 0) || !last || !String(last.out.currency).startsWith("reveal")) return;
  barMsg.value = { text: last.added.map((m) => `${tr("＋", "+")} ${modText(m)}`).join("  ") || tr("発現した", "Revealed"), tone: "text-emerald-300" };
  clearTimeout(barTimer);
  barTimer = setTimeout(() => { barMsg.value = null; }, 5000);
});
</script>

<template>
  <div data-bottom-bar class="fixed inset-x-0 bottom-0 z-[150] border-t border-amber-400/40 bg-[#14110d]/95 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[13px] shadow-[0_-6px_20px_rgba(0,0,0,0.6)]">
    <!-- 発現の候補が出ている間は、選ぶ所へ送る案内だけ -->
    <div v-if="s.offers.value" class="flex items-center gap-2">
      <span class="min-w-0 flex-1 truncate text-rose-200">{{ tr("発現する MOD を 3 つから選ぶ", "Choose 1 of 3 mods to reveal") }}</span>
      <button type="button" class="min-h-11 rounded-lg bg-rose-500/30 px-3 py-2 font-bold text-rose-50 ring-1 ring-rose-400/70" @click="emit('scrollToReveal')">{{ tr("選ぶ ↑", "Choose ↑") }}</button>
    </div>
    <template v-else>
      <!-- 打った直後は結果 (次の操作か 5 秒まで)。その後は持っている物と掛けたお告げ -->
      <p v-if="barMsg" class="mb-1 line-clamp-2 text-[12px] font-bold leading-snug" :class="barMsg.tone">{{ barMsg.text }}</p>
      <!-- 結果を出している間も、次が打てない理由は出す (「使う」が灰色の訳が見えなかった。2026-10-08 使い倒しテスト) -->
      <p v-if="heldWhy" class="mb-1 truncate text-[12px] text-rose-300">{{ heldWhy }}</p>
      <!-- 持っている物の説明 (箇条書き、既定は 2 行まで。押すと全部) -->
      <div v-else-if="heldHelp.length && !barMsg" class="mb-1 flex items-start gap-2">
        <ul class="min-w-0 flex-1 list-disc pl-4 text-[11px] leading-snug text-white/70" :class="helpOpen ? '' : 'max-h-[2.6em] overflow-hidden'" @click="helpOpen = !helpOpen">
          <li v-for="(l, i) in (helpOpen ? heldHelp : heldHelp.slice(0, 2))" :key="i" class="pr-1" :class="helpOpen ? '' : 'truncate'">{{ l }}</li>
        </ul>
        <Disclosure v-model:open="helpOpen" kind="detail" class="shrink-0 py-1" />
      </div>
      <div class="flex items-center gap-2">
        <img v-if="iconOf(s.held.value!)" :src="iconOf(s.held.value!)" alt="" class="h-9 w-9 object-contain" />
        <span class="min-w-0 flex-1 line-clamp-2 text-[12px] leading-tight"><b class="text-amber-100">{{ nameOf(s.held.value!) }}</b><span v-if="s.omens.value.length" class="ml-1 text-orange-200">+ {{ s.omens.value.map((o) => nameOf(o)).join(tr("・", ", ")) }}</span></span>
        <button v-if="s.log.value.length" type="button" class="g-btn sm min-h-11 shrink-0 whitespace-nowrap" :title="tr('直前の 1 手を取り消す', 'Undo the last step')" @click="s.undo()">{{ tr("戻す", "Undo") }}</button>
        <button type="button" class="g-btn-red min-h-11 shrink-0 whitespace-nowrap px-2 text-[14px]" :disabled="!!heldWhy" @click="useFromBar">{{ tr("使う", "Use") }}</button>
        <!-- 離す = 大きめの × (2026-10-08 オーナー「バツボタン割とデカく」) -->
        <button type="button" class="grid min-h-11 min-w-11 place-items-center rounded-lg border border-white/25 text-[22px] leading-none opacity-80" :title="tr('離す', 'Drop')" @click="s.hold(null)">×</button>
      </div>
    </template>
  </div>
</template>
