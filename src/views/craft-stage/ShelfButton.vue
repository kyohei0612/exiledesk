<!--
  ShelfButton.vue — クラフトステージの棚の 1 つ (2026-09-27、ADR-001)

  アイコン・名前・強さの札 (上級 / 完全 / レッサー / グレーター / パーフェクト / 古びた / 変質)・値段。
  カレンシー等は「持つ」(持っている物は金の枠)、お告げは「掛ける」。打てない物は灰色。
  2026-09-28 オーナー:
    「お告げとかオンにした時の挙動とかもゲーム内リスペクトで表示させて」→ 掛けたお告げはゲームの有効化と同じく赤金に脈打って「有効」
    「カレンシー詳細カードは…細かく書いてくれ」→ 0.4 秒乗せると [[StageCurrencyCard.vue]] (公式の説明 + ステージでの動き)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import StageCurrencyCard from "./StageCurrencyCard.vue";
import { craftStage, iconOf, nameOf, priceOf } from "../../state/craft-stage";
import { displayCurrency } from "../../state/display-currency";
import { shelfTag } from "../../state/craft-stage-help";

const props = defineProps<{ k: string; omen?: boolean }>();
const emit = defineEmits<{ pick: [key: string] }>();

const BADGE: Array<[RegExp, string, string]> = [
  [/_greater$/, "上級", "text-sky-300"],
  [/_perfect$/, "完全", "text-amber-300"],
  [/^essence:lesser:/, "レッサー", "text-white/60"],
  [/^essence:greater:/, "グレーター", "text-sky-300"],
  [/^essence:perfect:/, "パーフェクト", "text-amber-300"],
  [/^desecrate_ancient$/, "古びた", "text-sky-300"],
  [/^desecrate_altered$/, "変質", "text-fuchsia-300"],
];
const badge = computed(() => BADGE.find(([re]) => re.test(props.k)) ?? null);
/** 値段の代わりに出す付く MOD の短い名前 (エッセンス・カタリスト、2026-10-05 オーナー「金額の所、エッセンスは代わりに付く MOD を箇条書きで」「カタリストも一緒」) */
const tag = computed(() => (props.omen ? null : shelfTag(props.k, craftStage.data.value, craftStage.item.value)));
const reason = computed(() => (props.omen ? null : craftStage.usable(props.k)));
const on = computed(() => (props.omen ? craftStage.omens.value.includes(props.k) : craftStage.held.value === props.k));

/** 詳細カード: 0.4 秒乗せたら出す (すぐ出すと誤爆するので。オーナー 2026-09-27 のカードの決まりと同じ) */
const card = ref<{ x: number; y: number } | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
function enter(e: MouseEvent): void {
  const el = e.currentTarget as HTMLElement;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const r = el.getBoundingClientRect();
    const right = r.right + 350 < window.innerWidth;
    card.value = { x: right ? r.right + 8 : Math.max(8, r.left - 348), y: Math.max(8, Math.min(r.top, window.innerHeight - 420)) };
  }, 400);
}
function leave(): void {
  clearTimeout(timer);
  card.value = null;
}
onBeforeUnmount(leave);
</script>

<template>
  <button
    type="button"
    class="group relative flex w-[74px] flex-col items-center rounded-lg border px-1 pb-1 pt-1.5 text-[10px] transition"
    :class="[
      on ? (omen ? 'stage-omen-on border-orange-300' : 'border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/60') : 'border-white/10 bg-black/30 hover:border-white/30',
      reason ? 'opacity-35' : '',
    ]"
    :aria-label="`${nameOf(k)}${reason ? ` — ${reason}` : ''}`"
    :data-key="k"
    data-shelf
    @click="emit('pick', k)"
    @mouseenter="enter"
    @mouseleave="leave"
  >
    <img v-if="iconOf(k)" :src="iconOf(k)" alt="" class="h-9 w-9 object-contain" draggable="false" />
    <span v-else class="grid h-9 w-9 place-items-center rounded bg-white/10 text-[16px]">◎</span>
    <span class="mt-0.5 line-clamp-2 text-center leading-tight">{{ nameOf(k) }}</span>
    <span v-if="badge" class="absolute right-0.5 top-0.5 rounded bg-black/60 px-1 text-[9px]" :class="badge[2]">{{ badge[1] }}</span>
    <span v-if="omen && on" class="absolute left-0.5 top-0.5 rounded bg-orange-600/80 px-1 text-[9px] font-bold text-white">有効</span>
    <span v-if="tag" class="mt-px w-full">
      <span v-for="(t, i) in tag" :key="i" class="block truncate text-center text-[9px] font-semibold leading-tight text-emerald-300">・{{ t }}</span>
    </span>
    <span v-else-if="priceOf(k)" class="text-[9px] tabular-nums opacity-60">{{ displayCurrency.money(priceOf(k)) }}</span>
  </button>
  <StageCurrencyCard v-if="card" :k="k" :x="card.x" :y="card.y" :reason="reason" :omen="omen" />
</template>
