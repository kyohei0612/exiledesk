<!--
  BuildTabs.vue — DPS 順のビルド 3 つ (同じメインスキルの上位 10 人) を大きなカードで選ぶ (2026-09-29)
  オーナー「DPS が高い●スキルビルド上位 MOD、みたいに並べて。画像をふんだんに、UI はシンプルに」。
  カード = スキル名・一番上の DPS・人数・よく使われているユニークの絵。「全体」(3 つの合計) は 2026-09-29 に外した。
  選んだビルドの人の名前は下に並べ、クリックで poe.ninja のキャラのページを開く。
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import type { AggregatedAscendancy, BuildView, UniqueUsage } from "../../services/craft-v2/types";
import { uniqueArt } from "../../services/assets/unique-art";
import { openExternal } from "../../services/trade2/open-external";

const props = defineProps<{ asc: AggregatedAscendancy; leagueUrl: string | null }>();
/** 0〜 = ビルド */
const active = defineModel<number>({ required: true });

/** 2026-09-29 UI 見直し: ビルドごとの色 (金・青・紫) はスキルの種類の色 (BuildLoadout) とかぶるのでやめ、順位の数字で見分ける */
const showMembers = ref(false);

/** DPS の短い書き方 (21,100,016 → 21.1M) */
function dpsText(v: number | null): string {
  if (v == null) return "";
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(Math.round(v));
}
/** よく使われているユニーク (絵のある物を上から 4 つ) */
function topUniques(a: AggregatedAscendancy): Array<UniqueUsage & { art: string }> {
  return a.uniques.flatMap((u) => {
    const art = uniqueArt(u.nameEn) ?? u.icon ?? null;
    return art ? [{ ...u, art }] : [];
  }).slice(0, 4);
}
const builds = computed<BuildView[]>(() => props.asc.builds ?? []);
const selected = computed<BuildView | null>(() => builds.value[active.value] ?? null);
const ninjaCharUrl = (m: { account: string; name: string }): string | null =>
  props.leagueUrl ? `https://poe.ninja/poe2/builds/${props.leagueUrl}/character/${encodeURIComponent(m.account)}/${encodeURIComponent(m.name)}` : null;
</script>

<template>
  <div v-if="builds.length" class="mb-4">
    <div class="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))]">
      <!-- ビルド -->
      <button
        v-for="(b, i) in builds"
        :key="b.skillEn"
        type="button"
        class="g-plain group relative overflow-hidden rounded-lg border bg-[var(--exile-color-bg-surface)] p-3 text-left transition-colors"
        :class="active === i ? 'border-[var(--exile-color-accent-focus)]' : 'border-[var(--exile-color-border-subtle)] hover:border-[var(--exile-color-border-brass)]'"
        @click="active = i"
      >
        <p class="flex items-center gap-1.5 text-[11px] tracking-wider text-white/55">
          <span class="grid h-5 w-5 place-items-center rounded-full bg-white/15 text-[11px] font-bold text-white">{{ i + 1 }}</span>DPS {{ i + 1 }} 位のスキル
        </p>
        <p class="mt-0.5 truncate text-[17px] font-bold text-white" :title="b.skillEn">{{ b.skillJa }}</p>
        <p class="mt-1 text-[12px] text-white/60">
          上位 {{ b.members.length }} 人<template v-if="b.topDps != null"> · 最高 DPS <span class="tabular-nums text-white/85">{{ dpsText(b.topDps) }}</span></template
          ><template v-else> · トリガー (DPS なし)</template>
        </p>
        <!-- メインスキルの内訳 (ビルド 2・3 は前のスキルを外した DPS 順なので、別のスキルの人も混ざる) -->
        <p v-if="b.skillMix.length > 1" class="mt-0.5 truncate text-[11px] text-white/45" :title="b.skillMix.map((x) => `${x.skillJa} ${x.count}`).join(' / ')">
          {{ b.skillMix.map((x) => `${x.skillJa} ${x.count}`).join(" · ") }}
        </p>
        <div class="mt-2 flex gap-1.5">
          <img v-for="u in topUniques(b.agg)" :key="u.nameEn" :src="u.art" :alt="u.name" :title="`${u.name} (${u.count} 人)`" class="h-10 w-10 rounded bg-black/40 object-contain p-0.5" loading="lazy" referrerpolicy="no-referrer" />
        </div>
      </button>
    </div>
    <!-- 選んだビルドの人 (DPS 順) -->
    <div v-if="selected" class="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
      <button type="button" class="text-white/45 underline hover:text-white/80" @click="showMembers = !showMembers">
        {{ showMembers ? "10 人を隠す ▲" : `このビルドの ${selected.members.length} 人を見る (poe.ninja) ▼` }}
      </button>
      <button
        v-show="showMembers"
        v-for="(m, j) in selected.members"
        :key="m.account + m.name"
        type="button"
        class="rounded-full bg-white/5 px-2 py-0.5 text-white/70 ring-1 ring-white/10 hover:bg-white/10 hover:text-white"
        :title="`${m.account} — poe.ninja で開く`"
        @click="openExternal(ninjaCharUrl(m))"
      >
        <span class="tabular-nums text-white/40">{{ j + 1 }}.</span> {{ m.name }}<span v-if="m.skillJa && m.skillJa !== selected.skillJa" class="text-white/40"> ({{ m.skillJa }})</span>
      </button>
    </div>
  </div>
</template>
