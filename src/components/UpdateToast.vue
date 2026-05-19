<script setup lang="ts">
/**
 * UpdateToast
 *
 * 起動直後にバックグラウンドで GitHub Releases から最新バージョン確認。
 * 新版があればトーストを表示、[今すぐ更新] でダウンロード + 署名検証 +
 * インストール + 再起動。Phase 1 設計 (2026-05-19): app-self-update.md 参照。
 */
import { onMounted, ref } from "vue";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const update = ref<Update | null>(null);
const phase = ref<"idle" | "checking" | "available" | "downloading" | "installing" | "done" | "error">("idle");
const errorMsg = ref<string | null>(null);
const downloadedBytes = ref(0);
const totalBytes = ref<number | null>(null);

async function runCheck() {
  if (phase.value !== "idle") return;
  phase.value = "checking";
  errorMsg.value = null;
  try {
    const u = await check();
    if (u) {
      update.value = u;
      phase.value = "available";
    } else {
      phase.value = "idle";
    }
  } catch (e) {
    errorMsg.value = typeof e === "string" ? e : (e as Error).message;
    phase.value = "error";
  }
}

async function applyUpdate() {
  if (!update.value) return;
  phase.value = "downloading";
  errorMsg.value = null;
  try {
    await update.value.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          totalBytes.value = event.data.contentLength ?? null;
          downloadedBytes.value = 0;
          break;
        case "Progress":
          downloadedBytes.value += event.data.chunkLength;
          break;
        case "Finished":
          phase.value = "installing";
          break;
      }
    });
    phase.value = "done";
    // インストーラ実行後、明示 relaunch で新版を立ち上げる
    await relaunch();
  } catch (e) {
    errorMsg.value = typeof e === "string" ? e : (e as Error).message;
    phase.value = "error";
  }
}

function dismiss() {
  phase.value = "idle";
}

onMounted(() => {
  // 起動直後にチェック（UI 描画と並列で fetch、ユーザーは待たされない）
  runCheck();
});

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}
</script>

<template>
  <div
    v-if="phase === 'available' || phase === 'downloading' || phase === 'installing' || phase === 'done' || phase === 'error'"
    class="fixed bottom-4 right-4 max-w-sm rounded-lg border bg-[var(--color-surface)] border-[var(--color-border)] shadow-lg z-50 p-4"
  >
    <!-- 更新あり -->
    <div v-if="phase === 'available' && update">
      <div class="flex items-baseline justify-between mb-2">
        <h3 class="text-sm font-semibold text-[var(--color-accent)]">
          🆙 新しいバージョンが利用可能
        </h3>
        <button
          @click="dismiss"
          class="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          aria-label="閉じる"
        >
          ×
        </button>
      </div>
      <p class="text-xs text-[var(--color-text-muted)] mb-3">
        v{{ update.currentVersion }} → <span class="text-[var(--color-text)] font-mono">v{{ update.version }}</span>
      </p>
      <p
        v-if="update.body"
        class="text-[10px] text-[var(--color-text-muted)] mb-3 whitespace-pre-wrap max-h-24 overflow-auto"
      >
        {{ update.body }}
      </p>
      <div class="flex gap-2">
        <button
          @click="applyUpdate"
          class="flex-1 px-3 py-1.5 rounded text-xs bg-[var(--color-accent)] text-black hover:bg-[var(--color-accent-hover)] font-semibold transition"
        >
          今すぐ更新
        </button>
        <button
          @click="dismiss"
          class="px-3 py-1.5 rounded text-xs border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] transition"
        >
          後で
        </button>
      </div>
    </div>

    <!-- ダウンロード中 -->
    <div v-else-if="phase === 'downloading'">
      <h3 class="text-sm font-semibold mb-2">📥 ダウンロード中…</h3>
      <p class="text-xs text-[var(--color-text-muted)] font-mono">
        {{ fmtBytes(downloadedBytes) }}<span v-if="totalBytes"> / {{ fmtBytes(totalBytes) }}</span>
      </p>
      <div
        v-if="totalBytes"
        class="mt-2 h-1.5 bg-[var(--color-surface-2)] rounded overflow-hidden"
      >
        <div
          class="h-full bg-[var(--color-accent)] transition-all"
          :style="{ width: `${Math.min(100, (downloadedBytes / totalBytes) * 100)}%` }"
        ></div>
      </div>
    </div>

    <!-- インストール中 -->
    <div v-else-if="phase === 'installing'">
      <h3 class="text-sm font-semibold mb-2">⚙ インストール中…</h3>
      <p class="text-xs text-[var(--color-text-muted)]">
        まもなく再起動します。
      </p>
    </div>

    <!-- 完了 -->
    <div v-else-if="phase === 'done'">
      <h3 class="text-sm font-semibold text-emerald-400 mb-2">✓ 更新完了</h3>
      <p class="text-xs text-[var(--color-text-muted)]">
        再起動して新版に切り替えます…
      </p>
    </div>

    <!-- エラー -->
    <div v-else-if="phase === 'error'">
      <div class="flex items-baseline justify-between mb-2">
        <h3 class="text-sm font-semibold text-red-400">✗ 更新エラー</h3>
        <button
          @click="dismiss"
          class="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          ×
        </button>
      </div>
      <p class="text-xs text-red-300 font-mono whitespace-pre-wrap break-all">
        {{ errorMsg }}
      </p>
      <button
        @click="runCheck"
        class="mt-2 px-3 py-1 rounded text-xs border border-[var(--color-border)] hover:bg-[var(--color-surface-2)]"
      >
        🔄 再試行
      </button>
    </div>
  </div>
</template>
