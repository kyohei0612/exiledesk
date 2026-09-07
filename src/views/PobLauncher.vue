<!--
  PobLauncher.vue — 同梱 PoB (Path of Building PoE2) の起動画面 (2026-09-07)
  左ナビ「PoB」を押すとこの画面に切り替わり、同時に PoB を別ウィンドウで起動する。
  画面には同梱バージョン / 保存先 / 再起動ボタン / エラーを出す。
-->
<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { onActivated, onMounted, ref } from "vue";

interface PobLauncherStatus {
  available: boolean;
  dir: string | null;
  exe: string | null;
  version: string | null;
  tree: string | null;
  /** PoB2-JP (日本語化パッチ) のバージョン。null = 英語版 */
  jp_version: string | null;
  message: string | null;
}

const status = ref<PobLauncherStatus | null>(null);
const error = ref<string | null>(null);
const launching = ref(false);
const lastLaunchedAt = ref<number | null>(null);
/** ナビ連打で多重起動しないためのガード (ms) */
const RELAUNCH_GUARD_MS = 3000;

async function refreshStatus(): Promise<void> {
  try {
    status.value = await invoke<PobLauncherStatus>("pob_launcher_status");
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

async function launch(force = false): Promise<void> {
  if (launching.value) return;
  if (!force && lastLaunchedAt.value && Date.now() - lastLaunchedAt.value < RELAUNCH_GUARD_MS) return;
  launching.value = true;
  error.value = null;
  try {
    status.value = await invoke<PobLauncherStatus>("pob_launcher_open");
    lastLaunchedAt.value = Date.now();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    await refreshStatus();
  } finally {
    launching.value = false;
  }
}

// keep-alive 配下: 初回は onMounted + onActivated の両方が走るので、起動は onActivated 側に寄せる
onMounted(() => {
  void refreshStatus();
});
onActivated(() => {
  void launch(false);
});
</script>

<template>
  <section class="h-full flex flex-col px-6 py-4 bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-primary)]">
    <header class="mb-4">
      <h1 class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">Path of Building (PoE2) 日本語版</h1>
      <p class="text-xs text-[var(--exile-color-text-secondary)] mt-1">
        ExileDesk 同梱版 (公式 PoB + PoB2-JP 日本語化パッチ)。このアプリに入っている PoB を別ウィンドウで開きます (別途インストール不要)。
      </p>
    </header>

    <div class="rounded-lg border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-surface)] p-4 max-w-[720px]">
      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        <dt class="text-[var(--exile-color-text-secondary)]">状態</dt>
        <dd>
          <span v-if="status?.available" class="text-emerald-300">起動可能</span>
          <span v-else-if="status" class="text-amber-300">起動不可</span>
          <span v-else class="text-[var(--exile-color-text-tertiary)]">確認中…</span>
        </dd>
        <dt class="text-[var(--exile-color-text-secondary)]">PoB バージョン</dt>
        <dd class="tabular-nums">{{ status?.version ?? "—" }} <span v-if="status?.tree" class="text-[var(--exile-color-text-tertiary)]">(ツリー {{ status.tree }})</span></dd>
        <dt class="text-[var(--exile-color-text-secondary)]">日本語化</dt>
        <dd class="tabular-nums">
          <span v-if="status?.jp_version">PoB2-JP {{ status.jp_version }}</span>
          <span v-else-if="status" class="text-amber-300">なし (英語版)</span>
          <span v-else>—</span>
        </dd>
        <dt class="text-[var(--exile-color-text-secondary)]">同梱先</dt>
        <dd class="font-mono text-[11px] break-all text-[var(--exile-color-text-secondary)]">{{ status?.dir ?? "—" }}</dd>
        <dt class="text-[var(--exile-color-text-secondary)]">ビルド保存先</dt>
        <dd class="text-[var(--exile-color-text-secondary)]">ドキュメント\Path of Building (PoE2)\Builds (公式 PoB と共通)</dd>
      </dl>

      <div class="mt-4 flex items-center gap-2">
        <button
          type="button"
          @click="launch(true)"
          :disabled="launching || !status?.available"
          class="px-4 py-1.5 rounded font-medium text-[13px] bg-[var(--exile-color-accent-focus)] text-black hover:bg-[var(--exile-color-accent-focus-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {{ launching ? "起動中…" : "▶ PoB を起動" }}
        </button>
        <button
          type="button"
          @click="refreshStatus"
          class="px-3 py-1.5 rounded border border-[var(--exile-color-border-subtle)] text-[12px] text-[var(--exile-color-text-secondary)] hover:bg-[var(--exile-color-bg-elevated)] transition"
        >
          状態を再確認
        </button>
        <span v-if="lastLaunchedAt" class="text-[11px] text-[var(--exile-color-text-tertiary)]">起動しました (別ウィンドウ)</span>
      </div>

      <p v-if="status && !status.available && status.message" class="mt-3 text-[12px] text-amber-200">⚠️ {{ status.message }}</p>
      <p v-if="error" class="mt-3 text-[12px] text-red-200">起動失敗: {{ error }}</p>
    </div>

    <p class="mt-4 text-[11px] text-[var(--exile-color-text-tertiary)] max-w-[720px]">
      同梱版は PoB 自身の自動更新を止めています (ExileDesk の更新で丸ごと入れ替わります)。
      ビルドデータは公式 PoB と同じ場所に保存されるため、アプリを更新・削除しても消えません。
    </p>
  </section>
</template>
