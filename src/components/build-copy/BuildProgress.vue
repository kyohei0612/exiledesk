<!--
  BuildProgress.vue — 忍者ビルドコピーの読み込みの進み具合 (2026-09-27)

  オーナー:「今何の動きをしてるかわかりやすいように表示させてね」「レート制限中の状態も分かりづらい」
  「読み込み後の完了まで色々いまなにしてますよーってわかりやすく UI であればおｋ」。
    ① ビルドと相場 (poe.ninja / poe2scout) → ② 取引所の相場 (1 点ずつ。今の品物と段階、取引所の間隔待ち・制限中の残り秒)
  クラフト計算機と同じ番号の丸と色 (進行中 = 黄、済み = 緑)。
-->
<script setup lang="ts">
import { computed } from "vue";
import { tradeAuto } from "../../services/trade2/auto-price";

const props = defineProps<{
  loading: boolean;
  progress: string;
  autoAll: boolean;
  done: number;
  total: number;
  /** 今取っている品物の名前と段階 */
  currentName: string | null;
  currentStep: string | null;
}>();
const emit = defineEmits<{ stop: [] }>();
const limited = computed(() => tradeAuto.rateLimitSecs.value);
const budget = computed(() => tradeAuto.budget.value);
const pct = computed(() => (props.total ? Math.round((props.done / props.total) * 100) : 0));
</script>

<template>
  <section class="mb-4 rounded-xl border border-amber-400/40 bg-amber-500/[0.05] p-3 text-[13px]">
    <!-- ① ビルドと相場 -->
    <p class="flex items-center gap-2">
      <span class="rounded-full px-2 py-0.5 text-[11px] font-bold text-black" :class="loading ? 'bg-amber-400' : 'bg-emerald-400'">1</span>
      <b>ビルドと相場を読む</b>
      <span v-if="loading" class="animate-pulse text-amber-200">{{ progress }}…</span>
      <span v-else class="text-emerald-300">済み</span>
    </p>
    <!-- ② 取引所の相場 -->
    <p class="mt-2 flex items-center gap-2" :class="loading ? 'opacity-40' : ''">
      <span class="rounded-full px-2 py-0.5 text-[11px] font-bold text-black" :class="autoAll ? 'bg-amber-400' : loading ? 'bg-white/30' : 'bg-emerald-400'">2</span>
      <b>取引所で相場を取る</b>
      <span v-if="autoAll" class="tabular-nums text-amber-200">{{ done }} / {{ total }}</span>
      <span class="text-[11px] opacity-60">レア (ジュエル以外) と、種類違い・ソケットのあるユニーク</span>
      <button v-if="autoAll" type="button" class="ml-auto rounded-lg border border-white/20 px-2 py-0.5 text-[11px] hover:bg-white/5" @click="emit('stop')">止める</button>
    </p>
    <template v-if="autoAll">
      <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-black/40">
        <div class="h-full rounded-full bg-amber-400 transition-all" :style="{ width: `${pct}%` }" />
      </div>
      <p v-if="currentName" class="mt-1.5">
        今: <b class="text-amber-100">{{ currentName }}</b> <span class="text-amber-200/90">{{ currentStep ?? "準備中" }}</span>
      </p>
      <p class="mt-1 flex flex-wrap gap-x-3 text-[11px] opacity-70">
        <span v-if="limited > 0" class="text-rose-300 opacity-100">取引所の制限で止められています (あと {{ limited }} 秒。解けたら自動で続きます)</span>
        <span>取引所の制限を守るので 1 回の検索に 10 秒ほど (1 点 1〜5 回)</span>
        <span v-if="budget.max">直近 5 分の検索 {{ budget.used }} / {{ budget.max }}</span>
      </p>
    </template>
  </section>
</template>
