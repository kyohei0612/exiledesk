<script setup lang="ts">
/**
 * TreeDivinePick.vue — 神のオーブを持った時の手の窓の欄 (S-202、11-06 オーナー「神を持ったら狙いMODのとこハイライトさせて他グレーアウトしようか…
 * 必ず決定を押させる形にするか」「狙いＭＯＤのみ」「ハイライトはまじの全部ね…その画面全部グレーアウトって話」「完了　の方がわかりやすいかもな」
 * 「完了押したら再設定ってボタンに代わるように」「完了時はＭＯＤはグレーアウトでおｋ　押せるのは再設定だけ」「これを１ＭＯＤずつ行う」)。
 * ☑ の狙いの MOD (神で数値が振り直される物) を上から 1 つずつ光らせ、ほかは画面全部を暗くする (スポットライト)。
 * 光った MOD の値ごとに ↑↓ で目標 (段の最小〜最大、始まりは道の手前の神の目標か下限 = tree-divine の divineStart)、「完了」で決めて次の MOD へ。
 * 完了した MOD はグレーで、押せるのは「再設定」だけ。全部完了したら「決定」が光る。
 * ヒネコラで予見したアイテムの神だけ、一番上に「予見リセット」の ☑ (S-202 ⑤、☑ で全部の MOD を手前の神の目標で完了にする)
 */
import { computed, nextTick, ref, watch } from "vue";
import { allMods, type StageItem, type StageMod } from "../../../services/craft-stage/engine";
import { retext } from "../../../services/simulator/sim-engine";
import { divineRange } from "../../../services/simulator/tree/tree-divine";
import type { Aim, DivineTarget } from "../../../services/simulator/tree/tree-model";
import { tr } from "../../../i18n/lang";

/** targets = 完了した目標 (完了していない MOD の値は入れない)。aims = 木の完成の狙い (☑)。start = 値の始まり (divineStart) */
/** problem = 置けない訳 (完了していない MOD がある・打てない)。あれば「決定」は押せない */
const props = defineProps<{ item: StageItem; aims: readonly Aim[]; targets: readonly DivineTarget[]; foreReset: boolean; problem: string | null; start: (modId: string, vi: number) => number | null }>();
const emit = defineEmits<{ targets: [DivineTarget[]]; foreReset: [boolean]; decide: [] }>();

/** 神で数値が振り直される MOD (✦・未発現・数値の無い物は振り直されない = エンジンの reroll と同じ) */
const rolled = computed((): StageMod[] => allMods(props.item).filter((m) => !m.fractured && !m.unrevealed && m.ranges.length));
const isAim = (m: StageMod): boolean => props.aims.some((a) => a.modId === m.modId);
const lit = computed(() => rolled.value.filter(isAim));
const gray = computed(() => rolled.value.filter((m) => !isAim(m)));
const isDone = (m: StageMod): boolean => m.values.every((_, vi) => props.targets.some((t) => t.modId === m.modId && t.vi === vi));
/** 今決める MOD = 再設定で選んだ物、無ければ上から最初の完了していない物。全部完了なら null (「決定」が光る) */
const editing = ref<string | null>(null);
const current = computed((): StageMod | null => lit.value.find((m) => m.modId === editing.value && !isDone(m)) ?? lit.value.find((m) => !isDone(m)) ?? null);
const isNow = (m: StageMod): boolean => current.value?.modId === m.modId;
/** 今決める MOD の値 (完了までの下書き)。始まりは前に完了した値 (再設定) か divineStart */
const draft = ref<number[]>([]);
/** 前に完了した値 (再設定で外しても覚えておく) */
const last: Record<string, number> = {};
const firstOf = (m: StageMod, vi: number): number => props.targets.find((t) => t.modId === m.modId && t.vi === vi)?.value ?? last[`${m.modId}|${vi}`] ?? props.start(m.modId, vi) ?? m.values[vi]!;
watch(() => current.value?.modId, () => { const m = current.value; draft.value = m ? m.values.map((_, vi) => firstOf(m, vi)) : []; }, { immediate: true });
/** ↑↓ の刻み = 段の数値の小数の桁 (整数なら 1) */
const stepOf = (m: StageMod, vi: number): number => { const r = m.ranges[vi] ?? []; const d = Math.max(0, ...r.map((x) => (String(x).split(".")[1] ?? "").length)); return 10 ** -d; };
function bump(m: StageMod, vi: number, dir: 1 | -1): void {
  const r = divineRange(props.item, { modId: m.modId, vi }), st = stepOf(m, vi), v = (draft.value[vi] ?? 0) + dir * st;
  const next = [...draft.value];
  next[vi] = Number((Math.round((r ? Math.min(r[1], Math.max(r[0], v)) : v) / st) * st).toFixed(6));
  draft.value = next;
}
const atEnd = (m: StageMod, vi: number, dir: 1 | -1): boolean => { const r = divineRange(props.item, { modId: m.modId, vi }); return !!r && (dir > 0 ? (draft.value[vi] ?? 0) >= r[1] : (draft.value[vi] ?? 0) <= r[0]); };
function done(m: StageMod): void {
  editing.value = null;
  m.values.forEach((_, vi) => { last[`${m.modId}|${vi}`] = draft.value[vi] ?? firstOf(m, vi); });
  emit("targets", [...props.targets.filter((t) => t.modId !== m.modId), ...m.values.map((_, vi) => ({ modId: m.modId, vi, value: draft.value[vi] ?? firstOf(m, vi) }))]);
}
function redo(m: StageMod): void {
  editing.value = m.modId;
  emit("targets", props.targets.filter((t) => t.modId !== m.modId));
}
/** 予見リセット ☑: 目標は道の手前の神で決めた値 (今出ている数値ではない) なので、☑ で全部の MOD をその値で完了にする */
function setReset(v: boolean): void {
  emit("foreReset", v);
  if (v) { editing.value = null; emit("targets", lit.value.flatMap((m) => m.values.map((_, vi) => ({ modId: m.modId, vi, value: props.start(m.modId, vi) ?? m.values[vi]! })))); }
}
/** 行の文は今の値 (下書き・完了した目標) で作り直す (見本の乱数の値だと ↑↓ の値と食い違う)。狙いでない MOD は見本のまま */
const textOf = (m: StageMod): string => { if (!isAim(m)) return tr(m.textJa, m.textEn); const t = retext(m, m.values.map((_, vi) => valueText(m, vi))); return tr(t.textJa, t.textEn); };
const valueText = (m: StageMod, vi: number): number => (isNow(m) ? draft.value[vi] : props.targets.find((t) => t.modId === m.modId && t.vi === vi)?.value) ?? firstOf(m, vi);
const rangeText = (m: StageMod, vi: number): string => { const r = divineRange(props.item, { modId: m.modId, vi }); return r ? `${r[0]}〜${r[1]}` : ""; };
/** スポットライト: 光らせる所 (今の MOD の行・完了した行の「再設定」・全部完了なら「決定」) だけ暗幕の上に出す */
const spot = computed(() => lit.value.length > 0);
const UP = "relative z-[2]";
const rowEls: Record<string, HTMLElement | null> = {};
const decideEl = ref<HTMLElement | null>(null);
watch(() => current.value?.modId ?? null, async (id) => { await nextTick(); (id ? rowEls[id] : decideEl.value)?.scrollIntoView({ block: "nearest" }); });
</script>

<template>
  <div data-tree-divine class="flex flex-col gap-2 text-[12px]">
    <!-- 暗幕: 画面全部 (木・ほかの箱・窓のほかの所) を暗くする。押すのは通す (Esc・枠の外で閉じるのはそのまま) -->
    <div v-if="spot" data-tree-divine-spot aria-hidden="true" class="pointer-events-none fixed inset-0 z-[1] bg-black/75" />
    <label v-if="item.foreseen" data-tree-divine-reset class="flex min-h-7 items-center gap-2">
      <input type="checkbox" :checked="foreReset" @change="setReset(($event.target as HTMLInputElement).checked)" />
      <span>{{ tr("予見リセット (神 1 回で予見を消す。目標は手前の神で決めた値)", "Reset foresight (1 Divine clears it; targets are the values set by the earlier Divine)") }}</span>
    </label>
    <p class="opacity-80">{{ tr("狙いの MOD の目標の数値を上から 1 つずつ決める。↑↓ で目標、「完了」で次へ。全部終わったら「決定」", "Set each target mod's value from the top: ↑↓ for the target, Done for the next. Then press Decide") }}</p>
    <p v-if="!lit.length" data-tree-divine-none class="text-rose-200/90">{{ tr("神で数値が変わる狙いの MOD が無い", "No target mod whose values Divine rerolls") }}</p>
    <div v-for="m in lit" :key="m.modId" :ref="(el) => { rowEls[m.modId] = el as HTMLElement | null; }" data-tree-divine-mod :data-mod="m.modId" :data-state="isNow(m) ? 'now' : isDone(m) ? 'done' : 'wait'"
      class="flex flex-col gap-1 rounded-md border px-2 py-1.5"
      :class="isNow(m) ? [UP, 'border-amber-300 bg-[#2a2010] shadow-[0_0_0_2px_rgba(252,211,77,0.35)]'] : 'border-white/10'">
      <span class="min-w-0 break-words" :class="isNow(m) ? 'text-amber-100' : 'opacity-40'">{{ textOf(m) }}</span>
      <div v-for="(_, vi) in m.values" :key="vi" class="flex flex-wrap items-center gap-1.5">
        <template v-if="isNow(m)">
          <button type="button" data-tree-divine-down class="g-btn sm !min-h-7 !px-2" :disabled="atEnd(m, vi, -1)" :aria-label="tr('下げる', 'Lower')" @click="bump(m, vi, -1)">↓</button>
          <span data-tree-divine-value class="min-w-[3.5em] text-center font-bold tabular-nums text-amber-100">{{ valueText(m, vi) }}</span>
          <button type="button" data-tree-divine-up class="g-btn sm !min-h-7 !px-2" :disabled="atEnd(m, vi, 1)" :aria-label="tr('上げる', 'Raise')" @click="bump(m, vi, 1)">↑</button>
        </template>
        <template v-else>
          <button type="button" class="g-btn sm !min-h-7 !px-2 opacity-40" disabled :aria-label="tr('下げる', 'Lower')">↓</button>
          <span data-tree-divine-value class="min-w-[3.5em] text-center tabular-nums opacity-40">{{ valueText(m, vi) }}</span>
          <button type="button" class="g-btn sm !min-h-7 !px-2 opacity-40" disabled :aria-label="tr('上げる', 'Raise')">↑</button>
        </template>
        <span class="text-[11px]" :class="isNow(m) ? 'opacity-70' : 'opacity-30'">{{ rangeText(m, vi) }}</span>
        <!-- 値が 2 つの MOD もボタンは 1 つ (最後の値の行) -->
        <template v-if="vi === m.values.length - 1">
          <button v-if="isNow(m)" type="button" data-tree-divine-done class="g-btn-red sm !min-h-7 !px-3" @click="done(m)">{{ tr("完了", "Done") }}</button>
          <button v-else-if="isDone(m)" type="button" data-tree-divine-redo class="g-btn sm !min-h-7 !px-3" :class="UP" @click="redo(m)">{{ tr("再設定", "Edit") }}</button>
          <button v-else type="button" class="g-btn sm !min-h-7 !px-3 opacity-40" disabled>{{ tr("完了", "Done") }}</button>
        </template>
      </div>
    </div>
    <div v-for="m in gray" :key="m.modId" data-tree-divine-gray class="min-w-0 break-words px-2 opacity-40">{{ textOf(m) }}</div>
    <p v-if="problem" data-tree-divine-problem class="text-[11px] text-rose-200/90">{{ problem }}</p>
    <div ref="decideEl" class="self-start rounded-md" :class="spot && !current ? [UP, 'shadow-[0_0_0_3px_rgba(252,211,77,0.45)]'] : ''">
      <button type="button" data-tree-divine-decide class="g-btn-red min-h-10 px-5" :disabled="!!problem" @click="emit('decide')">{{ tr("決定", "Decide") }}</button>
    </div>
  </div>
</template>
