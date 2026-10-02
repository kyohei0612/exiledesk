<!--
  SkillTable.vue — スキルの火力を 1 行ずつ (2026-10-02 カードから詰めた表に。変える所までスクロールせずに済むように)
  左に DPS の割合の帯、名前と印、DPS と比べる元との差、1 発 / クリティカル / クリ率 / 1 秒の回数、ダメージの種類の色
-->
<script setup lang="ts">
import { computed } from "vue";
import DiffBadge from "./DiffBadge.vue";
import { fmtNum, TYPE_STYLE } from "./fmt";
import { gemJa, type GroupView, type SkillView } from "../../services/pob-check/api";

const props = defineProps<{
  rows: Array<{ g: GroupView; s: SkillView; key: string; count: number }>;
  before: Map<string, SkillView>;
  /** 上のバーに出しているスキル */
  focusKey: string | null;
}>();
const emit = defineEmits<{ (e: "focus", key: string): void }>();
/** 帯の長さは一番高いスキルに対して (合計は出さない、2026-10-02) */
const maxDps = computed(() => Math.max(1, ...props.rows.map((x) => x.s.game.dps)));

function parts(s: SkillView): Array<{ type: string; pct: number; color: string; ja: string }> {
  const sum = s.game.parts.reduce((a, p) => a + p.hit, 0) || 1;
  return s.game.parts.map((p) => ({ type: p.type, pct: (p.hit / sum) * 100, ...(TYPE_STYLE[p.type] ?? { ja: p.type, color: "#999" }) }));
}
</script>

<template>
  <div class="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
    <div class="grid grid-cols-[minmax(0,1fr)_7.5rem_5.5rem_5.5rem_4.5rem_4.5rem] items-center gap-x-3 border-b border-white/10 px-4 py-1.5 text-[10px] text-[var(--exile-color-text-tertiary)]">
      <span>スキル</span>
      <span class="text-right">DPS</span>
      <span class="text-right">1 発</span>
      <span class="text-right">クリティカル</span>
      <span class="text-right">クリ率</span>
      <span class="text-right">1 秒の回数</span>
    </div>
    <div
      v-for="x in rows"
      :key="x.key"
      class="relative grid cursor-pointer grid-cols-[minmax(0,1fr)_7.5rem_5.5rem_5.5rem_4.5rem_4.5rem] items-center gap-x-3 border-b border-white/5 px-4 py-2 last:border-b-0 hover:bg-white/[0.03]"
      :class="x.key === focusKey ? 'bg-amber-400/[0.06]' : ''"
      title="押すと上のバーにこのスキルを出す"
      @click="emit('focus', x.key)"
    >
      <!-- 全体に占める割合の帯 (後ろ) -->
      <div class="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-amber-400/[0.10] to-transparent" :style="{ width: `${(x.s.game.dps / maxDps) * 100}%` }" />
      <div class="relative min-w-0">
        <p class="flex items-center gap-1.5 truncate text-[13px] font-bold">
          {{ gemJa(x.s.name) }}
          <span v-if="x.s.game.minionName" class="truncate text-[11px] font-semibold text-emerald-200/90">→ {{ x.s.game.minionName }}</span>
          <span class="rounded bg-white/10 px-1 text-[10px] font-semibold text-[var(--exile-color-text-secondary)]">Lv{{ x.s.level }}</span>
          <span v-if="x.count > 1" class="rounded bg-white/10 px-1 text-[10px] font-semibold text-[var(--exile-color-text-secondary)]" title="同じスキルが同じ数字で複数あるので 1 行にまとめました (合計には 1 つ分だけ)">×{{ x.count }}</span>
          <span
            v-if="x.s.triggered"
            class="rounded bg-violet-500/20 px-1 text-[10px] font-semibold text-violet-200"
            title="メタジェム (状態異常時キャストなど) から出るスキル。PoB は発動の頻度を計算しないので、自分で撃った扱いの数字"
          >自動</span>
        </p>
        <div class="mt-1 flex items-center gap-2">
          <div class="flex h-1 w-24 overflow-hidden rounded-full bg-white/5">
            <div v-for="p in parts(x.s)" :key="p.type" :style="{ width: `${p.pct}%`, background: p.color }" :title="`${p.ja} ${p.pct.toFixed(0)}%`" />
          </div>
        </div>
      </div>
      <div class="relative text-right">
        <p class="text-[17px] font-black leading-tight tabular-nums text-amber-200">{{ fmtNum(x.s.game.dps) }}</p>
        <DiffBadge :now="x.s.game.dps" :before="before.get(x.key)?.game.dps" />
        <!-- ヒット以外が入っている時の内訳 (決まりは pck.lua の頭) -->
        <p v-if="(x.s.game.dot ?? 0) > 0 && x.s.game.hitDps > 0" class="text-[10px] tabular-nums text-orange-300/80" title="発火・出血・毒・継続ダメージのスキル (敵側の倍率を割り戻したゲーム内の表記)">うち継続 {{ fmtNum(x.s.game.dot) }}</p>
        <p v-else-if="(x.s.game.dot ?? 0) > 0" class="text-[10px] text-orange-300/80">継続ダメージ</p>
        <p v-if="(x.s.game.other ?? 0) > 0" class="text-[10px] tabular-nums text-sky-300/80" title="インペイル・ミラージュの分 (PoB の数字のまま)">うちインペイル等 {{ fmtNum(x.s.game.other) }}</p>
        <p v-if="(x.s.game.minion ?? 0) > 0" class="text-[10px] text-emerald-300/80" title="ミニオン・コンパニオンの DPS (PoB の数字のまま)">ミニオン</p>
        <p v-if="x.s.game.dualWield" class="text-[10px] text-[var(--exile-color-text-secondary)]" title="二刀流で両手で殴るスキル。1 発は両手の平均 (PoB と同じ)">二刀流</p>
        <p v-if="x.s.game.dps <= 0" class="text-[10px] text-rose-300/80" title="比べる元では DPS があったスキル。外した・オフにしたなどで 0 になった">0 になった</p>
      </div>
      <div class="relative text-right">
        <p class="text-[13px] tabular-nums">{{ x.s.game.hit > 0 ? fmtNum(x.s.game.hit) : "—" }}</p>
        <DiffBadge :now="x.s.game.hit" :before="before.get(x.key)?.game.hit" />
      </div>
      <div class="relative text-right">
        <p class="text-[13px] tabular-nums">{{ x.s.game.hit > 0 ? fmtNum(x.s.game.crit) : "—" }}</p>
        <DiffBadge :now="x.s.game.crit" :before="before.get(x.key)?.game.crit" />
      </div>
      <div class="relative text-right">
        <p class="text-[13px] tabular-nums">{{ x.s.game.hit > 0 ? `${x.s.game.critChance.toFixed(1)}%` : "—" }}</p>
        <DiffBadge :now="x.s.game.critChance" :before="before.get(x.key)?.game.critChance" />
      </div>
      <div class="relative text-right">
        <p class="text-[13px] tabular-nums">{{ x.s.game.speed.toFixed(2) }}</p>
        <DiffBadge :now="x.s.game.speed" :before="before.get(x.key)?.game.speed" />
      </div>
    </div>
  </div>
</template>
