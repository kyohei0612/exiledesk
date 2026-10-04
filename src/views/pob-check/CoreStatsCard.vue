<!--
  CoreStatsCard.vue — 火力の中身 (2026-10-04)

  オーナー「DPS はその火力の計算に関わってる奴全て表示して、自分と相手で分かりやすく。ノードとかじゃなくて基本火力ね、クリ率やらダメージやらクリダメやら。
  そこらへんってノード取ってたら上がるじゃん。基礎 DPS に関わってる主なステータスを UI でどっかに」。
  上のバーのスキルについて、1 発・回数・クリティカル・ダメージの増加 / 増し・速度の増加を 自分 | 相手 で並べる (相手は比較の時だけ)
-->
<script setup lang="ts">
import { computed } from "vue";
import type { CoreStats } from "../../services/pob-check/api";
import { fmtNum } from "./fmt";
import DiffBadge from "./DiffBadge.vue";

const props = defineProps<{ mine: CoreStats | null | undefined; target?: CoreStats | null; skillJa: string }>();

const TYPE_JA: Record<string, string> = { Physical: "物理", Fire: "火", Cold: "冷気", Lightning: "雷", Chaos: "混沌" };
const pct = (v: number) => `${Math.round(v)}%`;
const x = (v: number) => `×${v.toFixed(2)}`;
const rows = computed(() => {
  const a = props.mine, b = props.target ?? null;
  if (!a) return [];
  // 主なダメージの種類は 1 番大きい物 (自分と相手で違えば両方書く)
  const ta = TYPE_JA[a.type] ?? a.type, tb = b ? TYPE_JA[b.type] ?? b.type : ta;
  const t = ta === tb ? ta : `${ta} / 相手は${tb}`;
  const r = (label: string, get: (c: CoreStats) => number, show: (v: number) => string, hint = "") => ({ label, hint, a: get(a), b: b ? get(b) : null, show });
  return [
    r("1 発の平均", (c) => c.avg, fmtNum, "クリティカル込み、敵の軽減なし"),
    r("1 秒の回数", (c) => c.speed, (v) => v.toFixed(2)),
    r("クリティカル率", (c) => c.critChance, (v) => `${v.toFixed(1)}%`),
    r("クリティカル時の倍率", (c) => c.critMulti, x),
    r(`ダメージの増加 (${t})`, (c) => c.incDamage, pct, "このスキルに効く「増加」の合計 (ダメージ・元素・その種類)"),
    r(`ダメージの増し (${t})`, (c) => c.moreDamage, x, "このスキルに効く「増し」を掛けた物 (サポートジェム・ノードなど)"),
    r("クリティカル率の増加", (c) => c.incCrit, pct),
    r("クリティカル倍率の増加", (c) => c.incCritMulti, pct),
    r("速度の増加", (c) => c.incSpeed, pct),
    r("命中率", (c) => c.hitChance, pct),
  ];
});
</script>

<template>
  <section v-if="rows.length" class="card px-4 py-3">
    <p class="mb-2 text-[13px] font-bold">
      火力の中身 <span class="note font-normal">— {{ skillJa }}{{ target ? " (自分 → 相手)" : "" }}</span>
    </p>
    <div class="grid gap-x-6 gap-y-1.5 @3xl:grid-cols-2 @6xl:grid-cols-3">
      <div v-for="r in rows" :key="r.label" class="flex items-baseline gap-2 text-[13px]" :title="r.hint">
        <span class="w-44 shrink-0 text-[var(--exile-color-text-secondary)]">{{ r.label }}</span>
        <span class="font-bold tabular-nums text-amber-200">{{ r.show(r.a) }}</span>
        <template v-if="r.b != null">
          <span class="text-[var(--exile-color-text-tertiary)]">→</span>
          <span class="font-bold tabular-nums text-sky-200">{{ r.show(r.b) }}</span>
          <DiffBadge v-if="r.a > 0" :now="r.b" :before="r.a" />
        </template>
      </div>
    </div>
  </section>
</template>
