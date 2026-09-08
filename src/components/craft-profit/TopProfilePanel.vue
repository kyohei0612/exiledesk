<!--
  TopProfilePanel.vue — 上位プレイヤー基準 (発見 V2 キャッシュ由来)
    - 貼り付け装備の各 mod: 上位採用率 / 上位の最頻ティア / 自分のティア
    - 上位の主流 mod のうち付いていないもの
    - 典型構成 (主流 prefix 3 + suffix 3) の trade2 最安
-->
<script setup lang="ts">
import type { ItemDiagnosis, TopProfile, TargetMods } from "../../views/craft-profit/top-profile";
import type { AscendancyOption } from "../../views/craft-profit/useTopProfile";
import type { PriceResult } from "../../services/trade2/pricing";

defineProps<{
  options: AscendancyOption[];
  selectedClass: string | null;
  profile: TopProfile | null;
  diagnosis: ItemDiagnosis | null;
  target: TargetMods | null;
  targetPrice: PriceResult | null;
  targetStatus: "idle" | "loading" | "done" | "error";
  targetError: string | null;
  targetMissing: string[];
  targetUrl: string | null;
  cacheError: string | null;
}>();
const emit = defineEmits<{ select: [classEn: string | null]; priceTarget: []; open: [url: string] }>();

const pct = (p: number) => `${Math.round(p * 100)}%`;
const tier = (t: number | undefined) => (t ? `T${t}` : "—");
function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  return abs >= 100 ? n.toFixed(0) : abs >= 10 ? n.toFixed(1) : n.toFixed(2);
}
function onSelect(e: Event) {
  const v = (e.target as HTMLSelectElement).value;
  emit("select", v === "" ? null : v);
}
</script>

<template>
  <div class="rounded-lg border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)] p-3 text-[12px]">
    <div class="flex items-center gap-3 flex-wrap">
      <span class="font-display text-[13px] text-[var(--exile-color-accent-focus)]">上位プレイヤー基準</span>
      <template v-if="options.length">
        <select
          :value="selectedClass ?? ''"
          @change="onSelect"
          class="px-2 py-1 rounded bg-[var(--exile-color-bg-canvas)] border border-[var(--exile-color-border-subtle)] text-[12px]"
        >
          <option v-for="o in options" :key="o.classEn ?? '*'" :value="o.classEn ?? ''">{{ o.label }}</option>
        </select>
        <span v-if="profile" class="text-[11px] text-[var(--exile-color-text-tertiary)]">同種別のレア {{ profile.sampleItems }} 本を集計</span>
      </template>
      <span v-else class="text-[11px] text-amber-300">{{ cacheError ?? "この装備種別を使っている上位プレイヤーがキャッシュにいません" }}</span>
    </div>

    <template v-if="profile && diagnosis">
      <div class="mt-2 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div>
          <div class="text-[10px] uppercase tracking-wider text-[var(--exile-color-text-secondary)] mb-1">貼り付け装備の mod</div>
          <table class="w-full">
            <thead class="text-[10px] text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal">mod</th>
                <th class="text-right font-normal whitespace-nowrap">上位採用率</th>
                <th class="text-right font-normal whitespace-nowrap">上位の最頻</th>
                <th class="text-right font-normal whitespace-nowrap">自分</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(d, i) in diagnosis.present" :key="i" class="border-t border-[var(--exile-color-border-subtle)]">
                <td class="py-1" :class="d.affix === 'prefix' ? 'text-[#C7A7E5]' : d.affix === 'suffix' ? 'text-[#D6B98A]' : ''">{{ d.textJa }}</td>
                <td class="py-1 text-right tabular-nums" :class="d.pct >= 0.2 ? 'text-emerald-300' : d.pct > 0 ? '' : 'text-red-300'">{{ pct(d.pct) }}</td>
                <td class="py-1 text-right tabular-nums">{{ tier(d.usageTier) }}</td>
                <td class="py-1 text-right tabular-nums" :class="d.myTier && d.usageTier && d.myTier > d.usageTier ? 'text-amber-300' : ''">{{ tier(d.myTier) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div>
          <div class="text-[10px] uppercase tracking-wider text-[var(--exile-color-text-secondary)] mb-1">上位の主流 mod で付いていないもの (採用率 20% 以上)</div>
          <ul v-if="diagnosis.missing.length" class="space-y-0.5">
            <li v-for="m in diagnosis.missing.slice(0, 10)" :key="m.key" class="flex items-center gap-2">
              <span class="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold" :class="m.affix === 'P' ? 'bg-[#9B7BCC]/25 text-[#C7A7E5]' : 'bg-[#B8956A]/25 text-[#D6B98A]'">{{ m.affix }}</span>
              <span>{{ m.textJa }}</span>
              <span class="tabular-nums text-[11px] text-[var(--exile-color-text-secondary)]">{{ pct(m.pct) }}</span>
              <span class="text-[10px] text-[var(--exile-color-text-tertiary)]">最頻 {{ tier(m.usageTier) }}</span>
            </li>
          </ul>
          <p v-else class="text-[var(--exile-color-text-tertiary)] italic">主流 mod は全部付いています</p>
        </div>
      </div>

      <div v-if="target && target.mods.length" class="mt-3 flex items-center gap-3 flex-wrap border-t border-[var(--exile-color-border-subtle)] pt-2">
        <span class="text-[11px] text-[var(--exile-color-text-secondary)]">典型構成 (主流 prefix 3 + suffix 3、最頻ティア下限):</span>
        <span class="text-[11px]">{{ target.mods.map((m) => m.text).join(" / ") }}</span>
        <button
          v-if="targetUrl"
          type="button"
          @click="emit('open', targetUrl)"
          class="px-2 py-0.5 rounded border border-[var(--exile-color-border-brass)] text-[11px] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)]"
          title="この条件でトレードサイトを開く (API を使わないのでレート制限なし)"
        >
          鑑定 ↗
        </button>
        <button
          type="button"
          :disabled="targetStatus === 'loading'"
          @click="emit('priceTarget')"
          class="px-2 py-0.5 rounded border border-[var(--exile-color-border-subtle)] text-[11px] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-50"
        >
          {{ targetStatus === "loading" ? "検索中…" : "典型構成の相場" }}
        </button>
        <template v-if="targetStatus === 'done' && targetPrice">
          <span class="tabular-nums font-semibold">{{ fmt(targetPrice.minExalted) }} 高貴</span>
          <span class="text-[10px] text-[var(--exile-color-text-tertiary)]">({{ targetPrice.total }} 件)</span>
          <button v-if="targetPrice.searchUrl" type="button" @click="emit('open', targetPrice.searchUrl)" class="px-2 py-0.5 rounded border border-[var(--exile-color-border-subtle)] text-[11px]" title="trade2 で開く">↗</button>
          <span v-if="targetMissing.length" class="text-[10px] text-amber-300" :title="targetMissing.join(' / ')">(trade2 未対応 mod {{ targetMissing.length }})</span>
        </template>
        <span v-else-if="targetStatus === 'error'" class="text-red-300">{{ targetError }}</span>
      </div>
    </template>
  </div>
</template>
