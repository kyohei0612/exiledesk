<!--
  StageRouteRunes.vue — スパムシミュレーターで嵌めて打つルーンのチェック (2026-10-19 オーナー「ルーン嵌めた状態でスパムシミュレーターやらないと、
  確率違うぞ。2 種類あるならチェックその分増やして、手袋が良い例」)。部位で確率が変わるルーン (セールの凱旋・特殊 MOD のルーン) を 1 つずつチェック。
  既定はエミュレーターのアイテムに嵌めている物。嵌められる数はソケットの数まで。狙いが特殊 MOD ならそのルーンは外せない。中身は services/craft-stage/route-runes.ts
-->
<script setup lang="ts">
import { routeRunesFor, routeSocketsOf } from "../../services/craft-stage/engine-emu";
import { RUNE_BY_ID } from "../../services/craft-stage/engine";
import { computed } from "vue";
import { craftStage as s, iconOf } from "../../state/craft-stage";
import { tr } from "../../i18n/lang";

const props = defineProps<{ picked: readonly string[]; required: readonly string[]; disabled?: boolean }>();
const emit = defineEmits<{ change: [ids: string[]] }>();
const runes = computed(() => routeRunesFor(s.item.value));
const max = computed(() => routeSocketsOf(s.item.value));
const iconOfRune = (id: string): string => { const n = RUNE_BY_ID.get(id)?.name ?? ""; return iconOf(`rune:${n}`) || iconOf(`rune:${n.replace(/’/g, "'")}`); };
function toggle(id: string): void {
  if (props.disabled || props.required.includes(id)) return;
  const on = props.picked.includes(id);
  if (!on && props.picked.length >= max.value) return;
  emit("change", on ? props.picked.filter((x) => x !== id) : [...props.picked, id]);
}
</script>

<template>
  <!-- 棚と同じ枠 (.g-slot)。嵌める物は光る枠 + 選択の角 (.g-sel) -->
  <div v-if="runes.length" data-route-runes class="flex flex-col items-center gap-2 text-center">
    <p class="g-antique text-[13px] text-[var(--exile-color-text-secondary)]">{{ tr("ルーンを嵌めて打つ", "Socketed runes") }} <span class="tabular-nums text-[var(--exile-color-text-tertiary)]">{{ picked.length }} / {{ max }}</span></p>
    <div class="flex flex-wrap justify-center gap-3">
      <button v-for="r in runes" :key="r.id" type="button" :data-route-rune="r.id" class="g-plain flex w-20 flex-col items-center gap-1"
        :class="required.includes(r.id) || disabled || (!picked.includes(r.id) && picked.length >= max) ? 'cursor-not-allowed opacity-50' : ''"
        :aria-pressed="picked.includes(r.id)"
        :title="required.includes(r.id) ? tr('狙いの MOD はこのルーンを嵌めている時だけ付く', 'The target mod only rolls with this rune socketed') : r.pool ? tr('嵌めている間だけ、このルーンの特殊 MOD が普通の抽選に混ざる (確率が変わる)', 'While socketed, this rune’s special mods join the normal rolls (changes the odds)') : tr('サフィックスの枠が 1 つ増える', '+1 suffix slot')"
        @click="toggle(r.id)">
        <span class="g-slot grid size-14 place-items-center" :class="picked.includes(r.id) ? 'on g-sel' : ''"><img v-if="iconOfRune(r.id)" :src="iconOfRune(r.id)" alt="" class="size-10 object-contain" /></span>
        <span class="text-[11px] leading-tight" :class="picked.includes(r.id) ? 'text-amber-100' : 'text-[var(--exile-color-text-tertiary)]'">{{ r.ja }}</span>
      </button>
    </div>
  </div>
</template>
