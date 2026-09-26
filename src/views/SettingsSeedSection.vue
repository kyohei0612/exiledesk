<!--
  SettingsSeedSection.vue — 設定画面の「配布データ (捌き速度)」欄 (書き出し先の保存と書き出し)
  Settings.vue から切り出し (2026-09-26)。
-->
<script setup lang="ts">
import { ref, watch } from "vue";
import { exportFlowSeed, seedCount } from "../services/flow-seed";

// ---- 配布データ (捌き速度の記録をリポジトリに書き出す) ----
const SEED_PATH_KEY = "exiledesk.flow-seed.path";
const seedPath = ref(localStorage.getItem(SEED_PATH_KEY) ?? "");
const seedBusy = ref(false);
const seedMsg = ref("");
const seedOk = ref(true);
watch(seedPath, (v) => {
  try {
    localStorage.setItem(SEED_PATH_KEY, v);
  } catch {
    /* 保存できなくてもその場では使える */
  }
});
async function doExportSeed(): Promise<void> {
  seedBusy.value = true;
  seedMsg.value = "";
  try {
    const r = await exportFlowSeed(seedPath.value.trim());
    seedOk.value = true;
    seedMsg.value = `書き出しました (${Math.round(r.bytes / 1024)} KB) → ${r.path}`;
  } catch (e) {
    seedOk.value = false;
    seedMsg.value = e instanceof Error ? e.message : String(e);
  } finally {
    seedBusy.value = false;
  }
}
</script>

<template>
  <!-- 配布データ (2026-09-20 オーナー指示: 測った記録をビルドに同梱してサブ機に配る) -->
  <section>
    <h2 class="text-sm font-bold text-amber-100 mb-2">配布データ (捌き速度)</h2>
    <p class="text-xs text-[var(--exile-color-text-secondary)] mb-2 leading-relaxed">
      この PC で測った売れ行きの記録を、リポジトリの <span class="font-mono">src/data/flow-seed.json</span> に書き出します。
      そのまま release.bat を回すと、次の版に同梱されてサブ機に配られます (サブ機は起動時に取り込み、
      自分で測った分は消しません)。今の同梱データは {{ seedCount() }} 銘柄です。
    </p>
    <div class="flex flex-wrap items-center gap-3">
      <input
        v-model="seedPath"
        type="text"
        spellcheck="false"
        placeholder="C:\Users\kyohei\ExileDesk\src\data\flow-seed.json"
        class="text-xs px-2 py-1 rounded bg-[var(--exile-color-bg-surface)] border border-[var(--exile-color-border-subtle)] focus:outline-none focus:border-[var(--exile-color-accent-focus)] w-[28rem] max-w-full font-mono"
      />
      <button
        type="button"
        :disabled="!seedPath || seedBusy"
        class="px-3 py-1 rounded border border-[var(--exile-color-border-brass)] text-sm text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed"
        @click="doExportSeed"
      >
        {{ seedBusy ? "書き出し中…" : "配布データを書き出す" }}
      </button>
      <span v-if="seedMsg" class="text-xs" :class="seedOk ? 'text-emerald-300' : 'text-amber-300'">{{ seedMsg }}</span>
    </div>
  </section>
</template>
