<!--
  RareMods.vue — 忍者ビルドコピーのレアの MOD と段 (2026-09-27、BuildItemRow から分けた)

  オーナー 2026-09-26「各 MOD とティア出して、ティアはいじれる様に」「サフィとプレフィックス簡単に分けて表示」
  「段を 1 つ下げる・上げる・リセット」、2026-09-27「クラフト計算機にならって色々色付けてわかりやすくかつシンプルに」。
  プレフィックス (水色) とサフィックス (紫) を横に並べ、段の無い行 (ジュエル・特殊な MOD) は数値の割合で。
-->
<script setup lang="ts">
import RichText from "../decor/RichText.vue";
import { jaUniqueText } from "../../services/mods/unique-mod-ja";
import { lineMin, type RareLine, type RareMod } from "../../services/build-copy/rare-query";
import type { ItemRow } from "../../views/build-copy/useBuildCopy";
import type { BuildItem } from "../../services/build-copy/pob";

const props = defineProps<{ rare: NonNullable<ItemRow["rare"]>; item: BuildItem }>();
const emit = defineEmits<{ tier: [mod: number, tier: number]; lower: []; raise: []; reset: [] }>();

type Group = { side: string; label: string; tone: string; mods: Array<{ m: RareMod; k: number }> };
function groups(): Group[] {
  const all = props.rare.analysis.mods.map((m, k) => ({ m, k }));
  return [
    { side: "prefix", label: "プレフィックス", tone: "text-sky-300", mods: all.filter((x) => x.m.side === "prefix") },
    { side: "suffix", label: "サフィックス", tone: "text-violet-300", mods: all.filter((x) => x.m.side === "suffix") },
    { side: "other", label: "その他", tone: "text-white/60", mods: all.filter((x) => !x.m.side) },
  ].filter((g) => g.mods.length);
}
/** 数値の行の条件 (「28 以上」「固定 1」「数値なし」) */
function lineLabel(l: RareLine): string {
  const min = lineMin(l, props.rare.ratio);
  if (min == null) return "付いていれば可";
  const s = l.negative ? `${min} 以上減る` : `${min} 以上`;
  return l.fixed ? `${s} (固定)` : s;
}
const changed = () => Object.keys(props.rare.picked).length > 0 || props.rare.ratio !== 100;
const btn = "rounded-md border border-white/15 px-2 py-0.5 hover:bg-white/5";
</script>

<template>
  <div class="mt-2 rounded-lg border border-white/10 bg-black/20 p-2">
    <div class="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
      <span class="opacity-60">検索の条件</span>
      <button type="button" :class="btn" @click="emit('raise')">{{ rare.analysis.mods.length ? "段を上げる" : "数値 +10%" }}</button>
      <button type="button" :class="btn" @click="emit('lower')">{{ rare.analysis.mods.length ? "段を下げる" : "数値 −10%" }}</button>
      <button type="button" :disabled="!changed()" :class="btn" class="disabled:opacity-30" title="付いている段・数値に戻す" @click="emit('reset')">リセット</button>
      <span v-if="rare.analysis.lines.length" class="rounded-full px-2" :class="rare.ratio !== 100 ? 'bg-amber-500/20 text-amber-200' : 'bg-white/5 opacity-70'">数値の {{ rare.ratio }}% 以上</span>
      <span v-if="item.quality" class="rounded-full bg-white/5 px-2 opacity-70" title="完成品の検索だけ品質も同じ以上で探します">品質 {{ item.quality }}%</span>
      <span v-if="item.sockets" class="rounded-full bg-white/5 px-2 opacity-70">ソケット {{ item.sockets }}</span>
      <span v-if="item.energyShield" class="rounded-full bg-white/5 px-2 opacity-70">ES {{ item.energyShield }}</span>
      <span v-if="item.armour" class="rounded-full bg-white/5 px-2 opacity-70">アーマー {{ item.armour }}</span>
      <span v-if="item.evasion" class="rounded-full bg-white/5 px-2 opacity-70">回避 {{ item.evasion }}</span>
    </div>
    <div class="grid gap-x-4 gap-y-1 md:grid-cols-2">
      <div v-for="g in groups()" :key="g.side">
        <p class="text-[10px] tracking-wider" :class="g.tone">{{ g.label }}</p>
        <div v-for="{ m, k } in g.mods" :key="k" class="flex items-center gap-2 py-0.5 text-[12px]">
          <select
            :value="rare.picked[k] ?? m.tier"
            class="num w-40 shrink-0 py-0 text-[11px]"
            :class="rare.picked[k] != null && rare.picked[k] !== m.tier ? 'ring-1 ring-amber-400/70' : ''"
            @change="emit('tier', k, Number(($event.target as HTMLSelectElement).value))"
          >
            <option v-for="o in m.options" :key="o.i" :value="o.i">{{ o.label }}{{ o.i === m.tier ? " (今)" : "" }}</option>
          </select>
          <span class="min-w-0 text-[#8888ff]"><RichText :text="m.text" /></span>
        </div>
      </div>
      <!-- 段の無い行 (ジュエル・計算機で作れない特殊な MOD) は数値の割合で -->
      <div v-if="rare.analysis.lines.length" :class="rare.analysis.mods.length ? 'md:col-span-2' : ''">
        <p v-if="rare.analysis.mods.length" class="text-[10px] tracking-wider text-amber-200/80">特殊な MOD (数値で)</p>
        <div v-for="(l, k) in rare.analysis.lines" :key="'l' + k" class="flex items-center gap-2 py-0.5 text-[12px]">
          <span class="num w-40 shrink-0 text-[11px] opacity-70">{{ lineLabel(l) }}</span>
          <span class="min-w-0 text-[#8888ff]"><RichText :text="l.text" /></span>
        </div>
      </div>
    </div>
    <p v-if="rare.analysis.missing.length" class="mt-1 text-[10px] opacity-50">
      取引所の条件に無い行: <RichText :text="rare.analysis.missing.map((x) => jaUniqueText(x)).join(' / ')" />
    </p>
  </div>
</template>
