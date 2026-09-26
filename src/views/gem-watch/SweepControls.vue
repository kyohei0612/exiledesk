<!--
  SweepControls.vue — 自動ジェム監視の操作 (自動取得の間隔 / 監視の上限 / 期待値の回数 / 一括取得 / 中止 / 監視を開始)
  GemWatch.vue から切り出し (2026-09-26)。見た目・文言・動きは変えていない。状態は親が持つ。
-->
<script setup lang="ts">
import AttemptsSelect from "../../components/AttemptsSelect.vue";
import { sampleBusy, sampleQueued, sampleTarget } from "../gem-corrupt/sample-now";
import { jaSkill } from "../../i18n/skills-ja";
import { MAX_WATCH_GEMS, type updateWatchSettings } from "../../state/watch-settings";
import type { FlowStatus } from "../../services/market-flow";
import { resumeAtText, waitText } from "../../utils/wait-text";
import { jaGemName } from "./ja-gem-name";

defineProps<{
  cycleHours: number;
  cycleOptions: readonly number[];
  maxGems: number;
  sweeping: boolean;
  status: FlowStatus | null;
  busy: boolean;
  diff: { add: string[]; drop: string[]; changed: boolean };
  retryLeft: number;
  paceLeft: number;
  sweepClock: string;
  sweepText: string;
  message: { ok: boolean; text: string } | null;
}>();
/** 一覧の期待値を出す回数 */
const evAttempts = defineModel<number>("evAttempts", { required: true });
const emit = defineEmits<{
  (e: "applyCycle", hours: number): void;
  (e: "apply", patch: Parameters<typeof updateWatchSettings>[0]): void;
  (e: "sweep"): void;
  (e: "stopSweep"): void;
  (e: "sync", confirmDrop: boolean): void;
}>();
</script>

<template>
  <div class="flex items-end gap-x-4 gap-y-2 flex-wrap text-[11px] text-[var(--exile-color-text-secondary)]">
    <label class="inline-flex flex-col gap-1">
      自動取得の間隔
      <select
        class="num w-44"
        :value="cycleHours"
        title="前回の一括取得 (手動でも自動でも) から何時間後に、自動でもう 1 巡するか。既定は「しない」で、押した時だけ回ります"
        @change="emit('applyCycle', Number(($event.target as HTMLSelectElement).value))"
      >
        <option :value="0">自動取得しない (一括だけ)</option>
        <option v-for="h in cycleOptions" :key="h" :value="h">{{ h }} 時間ごとに 1 巡</option>
      </select>
    </label>
    <label class="inline-flex flex-col gap-1">
      監視の上限
      <input type="number" min="1" :max="MAX_WATCH_GEMS" class="num w-20" :value="maxGems" @change="emit('apply', { maxGems: Number(($event.target as HTMLInputElement).value) })" />
    </label>
    <!-- 期待値を出す回数 (オーナー指示 2026-09-20:「上限の横にプルダウンで回数。5 ずつ 100 まで回数した時の期待値収益」) -->
    <label class="inline-flex flex-col gap-1" title="一覧の「期待値」をこの回数ぶんで出します (1 回あたり × 回数)">
      期待値の回数
      <AttemptsSelect v-model="evAttempts" />
    </label>
    <!--
      自動巡回と同じ処理を手で 1 巡させる。
      オーナー指示 2026-09-20:「巡回中は他の取得は触れないようにしよう」。
      自動巡回が走っている間も押せない (以前は押せたので、押しても順番待ちに並ぶだけで
      何も起きず「止まって見える」状態だった)。中止すればすぐ押せる。
    -->
    <button
      type="button"
      :disabled="sweeping || !!status?.sampling || sampleBusy"
      class="px-3 py-1 rounded border border-[var(--exile-color-border-brass)] font-display tracking-[0.06em] text-[11px] tabular-nums text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      :title="
        sampleBusy
          ? `${jaGemName(sampleTarget)} の取得中です。終わってから押せます (通信が重ならないように 1 本ずつ流します)`
          : status?.auto_sampling && !status?.manual_sampling
            ? '自動巡回が走っています。止めたい時は右の「中止」を押してください'
            : '監視している全銘柄を今すぐ 1 巡します (自動巡回と同じ処理)。銘柄数 × 2 回ほど検索します'
      "
      @click="emit('sweep')"
    >
      {{ sampleBusy ? `${jaGemName(sampleTarget)} を取得中…${sampleQueued > 0 ? ` (あと ${sampleQueued} 件)` : ""}` : sweeping || status?.sampling ? sweepText || "取得中…" : "⟳ 一括取得 (今すぐ 1 巡)" }}
    </button>
    <button
      v-if="sweeping || !!status?.sampling"
      type="button"
      class="px-3 py-1 rounded border border-amber-500/70 bg-amber-500/10 font-display tracking-[0.06em] text-[11px] text-amber-200 hover:bg-amber-500/20 transition-colors"
      title="取得をやめます。今取っている銘柄を取り終えたら止まります (取れた分の記録は残ります)。自動巡回も止められます"
      @click="emit('stopSweep')"
    >
      ■ 中止
    </button>
    <button
      type="button"
      :disabled="busy || !diff.changed"
      class="px-3 py-1 rounded border font-display tracking-[0.06em] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed"
      :class="diff.changed ? 'border-[var(--exile-color-accent-focus)] text-[var(--exile-color-accent-focus)]' : 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-tertiary)]'"
      :title="diff.changed ? `入れる ${diff.add.map(jaSkill).join(', ') || 'なし'} / 外す ${diff.drop.map(jaSkill).join(', ') || 'なし'}` : '設定と監視中の銘柄は一致しています'"
      @click="emit('sync', true)"
    >
      {{ busy ? "反映中…" : diff.changed ? `監視を開始 (+${diff.add.length} / -${diff.drop.length})` : "監視リストは最新です" }}
    </button>
  </div>
  <p v-if="retryLeft > 0" class="text-[11px] text-amber-300 mt-1">
    トレードのレート制限中（あと {{ waitText(retryLeft) }}<template v-if="resumeAtText(retryLeft)"> · {{ resumeAtText(retryLeft) }} 頃に再開</template>）。解除まで取得は止まります
  </p>
  <p v-else-if="paceLeft > 0" class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-1">
    次の 1 本まで {{ waitText(paceLeft) }}（止まってはいません。一定の間隔で流しています）
  </p>
  <p v-if="sweepClock" class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-1">{{ sweepClock }}</p>
  <p v-if="message" class="text-[12px] mt-1" :class="message.ok ? 'text-emerald-300' : 'text-amber-300'">{{ message.text }}</p>
</template>
