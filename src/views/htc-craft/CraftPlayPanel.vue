<script setup lang="ts">
/**
 * CraftPlayPanel.vue — 1 手ずつ進める画面 (2026-09-23)
 *
 * オーナー:「自動でやるのはベース決めまで。そっからは 1 手 1 手考えながら。情報量は最低限。
 * 1 手進むごとに画面切り替わる感じ」。中身は [[usePlay.ts]]。
 * 出すのは: 今の状態 / 次に打つ物 / 当たる確率と 1 回の値段 / 使った合計と残りの見込み / 結果のボタン。
 */
import { computed } from "vue";
import { usePlay } from "./usePlay";
import type { useHtcCraft } from "./useHtcCraft";

const props = defineProps<{ c: ReturnType<typeof useHtcCraft> }>();
const c = props.c;
const play = usePlay(c.spam, c.stepTarget);
const s = computed(() => play.state.value);
const pct = (p: number): string => (p >= 0.995 ? "確定" : `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`);
</script>

<template>
  <div v-if="c.spam.value?.total" class="text-sm">
    <p class="mb-2 text-xs opacity-60">
      {{ s.moves }} 手目 / 使った {{ c.money(s.spent) }} / 残りの見込み {{ c.money(play.remaining.value) }}
    </p>

    <!-- 今の状態 -->
    <p class="mb-3 text-xs">
      付いている: {{ [...s.done, ...s.held].length ? c.stepTarget([...s.done, ...s.held]) : "まだ無し" }}
      <span v-if="s.junk" class="text-rose-300"> / 外れ {{ s.junk }}</span>
      <span v-if="s.breach" class="opacity-60"> / ブリーチの MOD あり</span>
    </p>

    <!-- 次の 1 手 -->
    <div v-if="play.screen.value" class="rounded border border-amber-500/50 bg-white/5 p-4">
      <p class="mb-1 text-xs opacity-60">次に打つ</p>
      <p class="mb-3 text-base font-bold">{{ play.screen.value.label }}</p>
      <p class="mb-4 text-xs">
        {{ play.screen.value.oddsLabel ?? "当たる" }} <b class="text-amber-300">{{ pct(play.screen.value.odds) }}</b> / 1 回 {{ c.money(play.screen.value.perTry) }}
      </p>
      <p class="mb-1 text-xs opacity-60">結果は？</p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="r in play.screen.value.results" :key="r.text" type="button"
          class="rounded border border-white/20 px-3 py-1.5 text-xs hover:border-amber-400"
          @click="r.apply()"
        >{{ r.text }}</button>
      </div>
    </div>
    <div v-else class="rounded border border-emerald-500/50 bg-white/5 p-4">
      <p class="text-base font-bold text-emerald-300">完成</p>
      <p class="text-xs">{{ s.moves }} 手 / 使った {{ c.money(s.spent) }} (平均の見込みは {{ c.money(c.spam.value.total.expected) }})</p>
    </div>

    <div class="mt-3 flex gap-3 text-xs">
      <button type="button" class="opacity-60 hover:opacity-100 disabled:opacity-20" :disabled="!play.canBack.value" @click="play.back()">← 1 手戻る</button>
      <button type="button" class="opacity-60 hover:opacity-100" @click="play.restartAll()">最初から</button>
    </div>
  </div>
  <p v-else class="text-xs opacity-60">
    作り方がまだ組めていません{{ c.spam.value?.finish?.reason ? ` (${c.spam.value.finish.reason})` : c.spam.value?.reason ? ` (${c.spam.value.reason})` : "" }}
  </p>
</template>
