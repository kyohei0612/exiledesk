<script setup lang="ts">
/**
 * CraftSandboxPanel.vue — 1 手ずつ、次に作る MOD を選んで進める画面 (2026-09-24)
 *
 * オーナー:「1 手進むごとに作る MOD を選択したらいいんじゃね」「情報量は最低限。1 手進むごとに画面切り替わる」。
 * 中身は [[useSandbox.ts]]。画面は 1 つずつ: 選ぶ → 打ち方 → 結果。
 */
import { computed, ref } from "vue";
import { useSandbox } from "./useSandbox";
import type { StepMethod } from "../../services/htc/step-odds";
import type { useHtcCraft } from "./useHtcCraft";

const props = defineProps<{ c: ReturnType<typeof useHtcCraft> }>();
const c = props.c;
const sb = useSandbox(c);
const q = ref("");
const pct = (p: number): string => (p >= 0.995 ? "確定" : `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`);
const sideJa = (s: string): string => (s === "prefix" ? "P" : "S");
const shown = computed(() => {
  const k = q.value.trim();
  // 絞っていない時は ★ (狙い) だけ。無ければ平均の安い順に 8 つ (情報は最低限。オーナー 2026-09-24)
  if (k) return sb.rows.value.filter((r) => r.name.includes(k)).slice(0, 30);
  const star = sb.rows.value.filter((r) => r.star);
  return star.length ? star : sb.rows.value.slice(0, 8);
});
const item = computed(() => sb.snap.value.item);
const target = computed(() => ("modId" in sb.screen.value ? sb.screen.value.modId : null));
/** 打ち方の画面で狙っている段 */
const methodTier = computed(() => (sb.screen.value.kind === "method" ? sb.screen.value.minTier : 0));
/** 打ち方を選んだ → 結果の画面へ */
function chooseMethod(m: StepMethod): void {
  const sc = sb.screen.value;
  if (sc.kind === "method") sb.screen.value = { kind: "result", modId: sc.modId, minTier: sc.minTier, m };
}
</script>

<template>
  <div class="text-sm">
    <!-- 今の指輪 (どの画面でも上に出す) -->
    <div class="mb-3 rounded bg-white/5 p-2 text-xs">
      <div class="mb-1 opacity-60">{{ sb.snap.value.moves }} 手 / 使った {{ c.money(sb.snap.value.spent) }}</div>
      <div v-for="(x, i) in item.slots" :key="i">
        <span class="opacity-50">{{ sideJa(x.side) }}</span>
        <span :class="x.modId ? '' : x.fixed ? 'opacity-60' : 'text-rose-300'"> {{ sb.name(x.modId, x.label) }}</span>
        <span v-if="x.fixed && x.modId" class="opacity-50"> (固定済み)</span>
      </div>
      <div v-if="item.breach"><span class="opacity-50">P</span> ブリーチの MOD (品質の上限 40%)</div>
      <div v-if="!item.slots.length && !item.breach" class="opacity-50">まだ何も付いていない</div>
    </div>

    <!-- 1. 次に作る MOD を選ぶ -->
    <div v-if="sb.screen.value.kind === 'pick'">
      <button
        v-if="sb.junk.value" type="button" class="mb-2 w-full rounded border border-rose-400/60 p-2 text-left text-xs"
        @click="sb.screen.value = { kind: 'cleanup' }"
      >外れ {{ sb.junk.value }} つを消す →</button>
      <p class="mb-1 text-xs opacity-60">次に作る MOD は？ (★ = 狙い。他の MOD は絞り込みで出る)</p>
      <input v-model="q" placeholder="絞る (マナ / 耐性 …)" class="mb-2 w-56 rounded border border-white/20 bg-black/20 px-2 py-1 text-xs" />
      <div class="space-y-1">
        <button
          v-for="r in shown" :key="r.modId" type="button"
          class="flex w-full items-center gap-2 rounded border border-white/10 px-2 py-1 text-left text-xs hover:border-amber-400"
          @click="sb.screen.value = { kind: 'method', modId: r.modId, minTier: r.minTier }"
        >
          <span class="w-3 text-amber-300">{{ r.star ? "★" : "" }}</span>
          <span class="w-3 opacity-50">{{ sideJa(r.side) }}</span>
          <span class="flex-1">{{ r.name }}</span>
          <span class="opacity-70">1 回 {{ pct(r.best!.p) }} / 平均 {{ c.money(r.best!.avg) }}</span>
        </button>
      </div>
    </div>

    <!-- 2. 打ち方 (上位 3 つ) -->
    <div v-else-if="sb.screen.value.kind === 'method'">
      <p class="mb-2 text-base font-bold">{{ sb.name(target) }}</p>
      <!-- 段はいつでも選び直せる (オーナー 2026-09-24:「途中で変更して確率見たりできる」) -->
      <label v-if="sb.tierOptions.value.length" class="mb-2 block text-xs">
        狙う段
        <select class="rounded border border-white/20 bg-black/30 px-1" :value="methodTier"
          @change="sb.setMethodTier(Number(($event.target as HTMLSelectElement).value))">
          <option v-for="t in sb.tierOptions.value" :key="t.i" :value="t.i">{{ t.label }}</option>
        </select>
      </label>
      <p v-if="!sb.methods.value.length" class="text-xs opacity-60">打てる手がありません (枠が無い / 相場に無い)</p>
      <div class="space-y-2">
        <button
          v-for="m in sb.methods.value" :key="m.label" type="button"
          class="w-full rounded border border-white/15 p-2 text-left text-xs hover:border-amber-400"
          @click="chooseMethod(m)"
        >
          <div class="font-bold">{{ m.label }}</div>
          <div>1 回で付く <b class="text-amber-300">{{ pct(m.p) }}</b> / 1 回 {{ c.money(m.perTry) }} / 付くまで平均 {{ c.money(m.avg) }}</div>
          <div v-if="m.loseRisk" class="opacity-70">外れたら消去 1 回で、付けた MOD が消える {{ pct(m.loseRisk) }}</div>
          <div v-if="m.note" class="text-rose-300">{{ m.note }}</div>
        </button>
      </div>
    </div>

    <!-- 3. 結果 -->
    <div v-else-if="sb.screen.value.kind === 'result' || sb.screen.value.kind === 'chaosAdd' || sb.screen.value.kind === 'cleanupResult'">
      <p class="mb-1 text-xs opacity-60">打った</p>
      <p class="mb-3 text-base font-bold">{{ sb.screen.value.kind === 'cleanupResult' ? sb.screen.value.cl.label : sb.screen.value.m.label }}</p>
      <p class="mb-1 text-xs opacity-60">{{ sb.screen.value.kind === 'chaosAdd' ? "何が付いた？" : "結果は？" }}</p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="r in sb.results.value" :key="r.text" type="button"
          class="rounded border border-white/20 px-3 py-1.5 text-xs hover:border-amber-400" @click="r.apply()"
        >{{ r.text }}</button>
      </div>
    </div>

    <!-- 外れを消す (上位 3 つ) -->
    <div v-else-if="sb.screen.value.kind === 'cleanup'">
      <p class="mb-2 text-base font-bold">外れを消す</p>
      <div class="space-y-2">
        <button
          v-for="cl in sb.cleanups.value" :key="cl.label" type="button"
          class="w-full rounded border border-white/15 p-2 text-left text-xs hover:border-amber-400"
          @click="sb.screen.value = { kind: 'cleanupResult', cl }"
        >
          <div class="font-bold">{{ cl.label }}</div>
          <div>外れが消える <b class="text-amber-300">{{ pct(cl.pJunk) }}</b> / 1 回 {{ c.money(cl.perTry) }}</div>
        </button>
      </div>
    </div>

    <div class="mt-3 flex gap-3 text-xs">
      <button type="button" class="opacity-60 hover:opacity-100 disabled:opacity-20" :disabled="!sb.canBack.value" @click="sb.back()">← 戻る</button>
      <button type="button" class="opacity-60 hover:opacity-100" @click="sb.restartAll()">最初から</button>
    </div>
  </div>
</template>
