<!--
  ClientLogHistory.vue — ゲームログ診断の消し込み履歴 (開閉できる表)
  ClientLog.vue から切り出し (2026-09-26)。
-->
<script setup lang="ts">
import { ref } from "vue";
import type { HistoryEntry } from "../services/client-log";
import { dateOf, mb, num, shortTs } from "./client-log-format";

defineProps<{ history: HistoryEntry[] }>();

const showHistory = ref(false);
</script>

<template>
  <!-- 消し込み履歴 -->
  <div v-if="history.length" class="mt-3 rounded-lg border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)] p-3">
    <button type="button" @click="showHistory = !showHistory" class="w-full flex items-center gap-2 text-left">
      <span class="text-[13px] font-medium">消し込み履歴</span>
      <span class="text-[12px] text-[var(--exile-color-text-secondary)]">{{ history.length }} 回</span>
      <span class="ml-auto text-[11px] text-[var(--exile-color-text-tertiary)]">{{ showHistory ? "閉じる" : "開く" }}</span>
    </button>
    <p class="mt-1 text-[11px] text-[var(--exile-color-text-tertiary)]">ログを消しても、件数の推移はここに残ります。</p>
    <table v-if="showHistory" class="mt-2 w-full text-[11px]">
      <thead class="text-[10px] uppercase tracking-wider text-[var(--exile-color-text-tertiary)]">
        <tr>
          <th class="text-left font-normal py-1">消し込み日</th>
          <th class="text-left font-normal">対象期間</th>
          <th class="text-right font-normal">行数</th>
          <th class="text-right font-normal">サイズ</th>
          <th class="text-left font-normal pl-3">実害あり</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="h in [...history].reverse()" :key="h.cleared_at" class="border-t border-[var(--exile-color-border-subtle)]">
          <td class="py-1 whitespace-nowrap">{{ dateOf(h.cleared_at) }}</td>
          <td class="text-[var(--exile-color-text-secondary)] whitespace-nowrap">{{ shortTs(h.first_ts) }} 〜 {{ shortTs(h.last_ts) }}</td>
          <td class="text-right tabular-nums">{{ num(h.lines) }}</td>
          <td class="text-right tabular-nums">{{ mb(h.size_bytes) }} MB</td>
          <td class="pl-3 text-[var(--exile-color-text-secondary)]">
            {{ h.findings.filter((f) => f.severity === "warn").map((f) => `${f.title} ${num(f.count)}`).join(" / ") || "—" }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
