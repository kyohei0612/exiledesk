<script setup lang="ts">
/**
 * TreeDivinePick.vue — 神のオーブを持った時の手の窓の欄 (S-202、11-06 オーナー「神を持ったら狙いMODのとこハイライトさせて他グレーアウトしようか…
 * MODの横にこの値にするボタンを追加して必ず決定を押させる形にするか　ボタンは短い文章でかつ分かりやすくさせたいな」「狙いＭＯＤのみ」)。
 * ☑ の狙いの MOD (神で数値が振り直される物) だけを光らせ、ほかの MOD はグレー。光った MOD の値ごとに ↑↓ で目標 (段の最小〜最大)、変えないなら「この値」。
 * 全部決めるまで手は置けない (TreeHandShelf の problem)。ヒネコラで予見したアイテムの神だけ、一番上に「予見リセット」の ☑ (S-202 ⑤)
 */
import { computed } from "vue";
import { allMods, type StageItem, type StageMod } from "../../../services/craft-stage/engine";
import { divineRange } from "../../../services/simulator/tree/tree-divine";
import type { Aim, DivineTarget } from "../../../services/simulator/tree/tree-model";
import { tr } from "../../../i18n/lang";

/** targets = 決めた目標 (決めていない値は入れない)。aims = 木の完成の狙い (☑) */
/** problem = 置けない訳 (決めていない値がある・打てない)。あれば「決定」は押せない */
const props = defineProps<{ item: StageItem; aims: readonly Aim[]; targets: readonly DivineTarget[]; foreReset: boolean; problem: string | null }>();
const emit = defineEmits<{ targets: [DivineTarget[]]; foreReset: [boolean]; decide: [] }>();

/** 神で数値が振り直される MOD (✦・未発現・数値の無い物は振り直されない = エンジンの reroll と同じ) */
const rolled = computed((): StageMod[] => allMods(props.item).filter((m) => !m.fractured && !m.unrevealed && m.ranges.length));
const isAim = (m: StageMod): boolean => props.aims.some((a) => a.modId === m.modId);
const lit = computed(() => rolled.value.filter(isAim));
const gray = computed(() => rolled.value.filter((m) => !isAim(m)));
const textOf = (m: StageMod): string => tr(m.textJa, m.textEn);
const decided = (m: StageMod, vi: number): DivineTarget | undefined => props.targets.find((t) => t.modId === m.modId && t.vi === vi);
const valueOf = (m: StageMod, vi: number): number => decided(m, vi)?.value ?? m.values[vi]!;
/** ↑↓ の刻み = 段の数値の小数の桁 (整数なら 1) */
const stepOf = (m: StageMod, vi: number): number => { const r = m.ranges[vi] ?? []; const d = Math.max(0, ...r.map((x) => (String(x).split(".")[1] ?? "").length)); return 10 ** -d; };
function put(m: StageMod, vi: number, v: number): void {
  const r = divineRange(props.item, { modId: m.modId, vi }), st = stepOf(m, vi);
  const clamp = r ? Math.min(r[1], Math.max(r[0], v)) : v;
  emit("targets", [...props.targets.filter((t) => !(t.modId === m.modId && t.vi === vi)), { modId: m.modId, vi, value: Number((Math.round(clamp / st) * st).toFixed(6)) }]);
}
const bump = (m: StageMod, vi: number, dir: 1 | -1): void => put(m, vi, valueOf(m, vi) + dir * stepOf(m, vi));
const rangeText = (m: StageMod, vi: number): string => { const r = divineRange(props.item, { modId: m.modId, vi }); return r ? `${r[0]}〜${r[1]}` : ""; };
</script>

<template>
  <div data-tree-divine class="flex flex-col gap-2 text-[12px]">
    <label v-if="item.foreseen" data-tree-divine-reset class="flex min-h-7 items-center gap-2">
      <input type="checkbox" :checked="foreReset" @change="emit('foreReset', ($event.target as HTMLInputElement).checked)" />
      <span>{{ tr("予見リセット (神 1 回で予見を消し、狙いの MOD がこの値以上に戻るまで神を打つ)", "Reset foresight (1 Divine clears it, then Divine until the target mods are back to these values)") }}</span>
    </label>
    <p class="opacity-80">{{ tr("狙いの MOD の数値を決める。↑↓ で目標、変えないなら「この値」。全部決めたら「決定」", "Set the target mods' values: ↑↓ for a target, or \"Keep\". Then press Decide") }}</p>
    <p v-if="!lit.length" data-tree-divine-none class="text-rose-200/90">{{ tr("神で数値が変わる狙いの MOD が無い", "No target mod whose values Divine rerolls") }}</p>
    <div v-for="m in lit" :key="m.modId" data-tree-divine-mod :data-mod="m.modId" class="flex flex-col gap-1 rounded-md border border-amber-300/50 bg-amber-300/10 px-2 py-1.5">
      <span class="min-w-0 break-words text-amber-100">{{ textOf(m) }}</span>
      <div v-for="(_, vi) in m.values" :key="vi" class="flex flex-wrap items-center gap-1.5">
        <button type="button" class="g-btn sm !min-h-7 !px-2" :aria-label="tr('下げる', 'Lower')" @click="bump(m, vi, -1)">↓</button>
        <span data-tree-divine-value class="min-w-[3.5em] text-center tabular-nums" :class="decided(m, vi) ? 'font-bold text-amber-100' : 'opacity-70'">{{ valueOf(m, vi) }}</span>
        <button type="button" class="g-btn sm !min-h-7 !px-2" :aria-label="tr('上げる', 'Raise')" @click="bump(m, vi, 1)">↑</button>
        <button type="button" data-tree-divine-keep class="g-btn sm !min-h-7 !px-2" :class="decided(m, vi) ? 'opacity-60' : ''" @click="put(m, vi, valueOf(m, vi))">{{ decided(m, vi) ? tr("決めた ✓", "Set ✓") : tr("この値", "Keep") }}</button>
        <span class="text-[11px] opacity-60">{{ rangeText(m, vi) }}</span>
      </div>
    </div>
    <div v-for="m in gray" :key="m.modId" data-tree-divine-gray class="min-w-0 break-words px-2 opacity-40">{{ textOf(m) }}</div>
    <p v-if="problem" data-tree-divine-problem class="text-[11px] text-rose-200/90">{{ problem }}</p>
    <button type="button" data-tree-divine-decide class="g-btn-red min-h-10 self-start px-5" :disabled="!!problem" @click="emit('decide')">{{ tr("決定", "Decide") }}</button>
  </div>
</template>
