<!--
  SettingsUpdateSection.vue — 設定画面の「更新」欄 (現在のバージョンと、今すぐ更新を確認するボタン)
  Settings.vue から切り出し (2026-09-26)。バージョンの取得は親 (Settings.vue) の onMounted のまま。
-->
<script setup lang="ts">
import { computed } from "vue";
import { requestUpdateCheck, updateCheckError, updateCheckState } from "../state/update-check";
import { updateErrorJa } from "../utils/trade-error";

/** 更新確認 (2026-09-16): 実際のチェックとトーストは UpdateToast.vue が持つ */
defineProps<{ appVersion: string }>();

const updateStatusText = computed(() => {
  switch (updateCheckState.value) {
    case "checking":
      return "確認中…";
    case "none":
      return "最新版です";
    case "available":
      return "新しいバージョンがあります (右下のお知らせから更新)";
    case "error":
      return `確認できませんでした: ${updateErrorJa(updateCheckError.value)}`;
    default:
      return "";
  }
});
</script>

<template>
  <!-- 更新 (2026-09-16 オーナー要望: アプリを開いたまま確認したい) -->
  <section>
    <h2 class="text-sm font-bold text-amber-100 mb-2">
      更新
    </h2>
    <div class="flex flex-wrap items-center gap-3">
      <span class="text-sm">
        現在のバージョン
        <span class="font-mono text-[var(--exile-color-accent-focus)]">{{ appVersion ? `v${appVersion}` : "—" }}</span>
      </span>
      <button
        type="button"
        :disabled="updateCheckState === 'checking'"
        class="px-3 py-1 rounded border border-[var(--exile-color-border-brass)] text-sm text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed"
        @click="requestUpdateCheck"
      >
        {{ updateCheckState === "checking" ? "確認中…" : "更新を確認" }}
      </button>
      <span
        v-if="updateStatusText"
        class="text-xs"
        :class="
          updateCheckState === 'available'
            ? 'text-[var(--exile-color-accent-focus)]'
            : updateCheckState === 'error'
              ? 'text-[var(--exile-color-signal-error)]'
              : 'text-[var(--exile-color-text-secondary)]'
        "
      >
        {{ updateStatusText }}
      </span>
    </div>
    <p class="mt-2 text-xs text-[var(--exile-color-text-secondary)]">
      起動時と同じ確認を今すぐ実行します。新しいバージョンがあれば、起動時と同じように画面右下にお知らせが出ます
      (そこから「今すぐ更新」でダウンロード → 再起動)。
    </p>
  </section>
</template>
