<!--
  PobLauncher.vue — PoB (Path of Building PoE2 日本語版) の起動画面 (2026-09-07)
  左ナビ「PoB」を押すとこの画面に切り替わり、インストール済みなら同時に PoB を別ウィンドウで起動する。
  2026-09-08: PoB はインストーラ同梱をやめ、GitHub Release (pob-bundle) から別途ダウンロードする方式に。
    未インストール → この画面で「PoB をダウンロード」。インストール済み → 30 日ごとに自動確認、手動確認も可。
-->
<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { computed, onActivated, onMounted, ref } from "vue";
import { checkPobBundle, installPobBundle, pobBundleState, refreshPobBundleStatus } from "../services/pob-bundle";

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
const b = pobBundleState;

async function refreshStatus(): Promise<void> {
  try {
    status.value = await invoke<PobLauncherStatus>("pob_launcher_status");
    await refreshPobBundleStatus();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

async function launch(force = false): Promise<void> {
  if (launching.value || b.installing) return;
  if (!force && lastLaunchedAt.value && Date.now() - lastLaunchedAt.value < RELAUNCH_GUARD_MS) return;
  if (!force && !status.value?.available) return;
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

async function install(): Promise<void> {
  const ok = await installPobBundle();
  await refreshStatus();
  if (ok) void launch(true);
}

const progressText = computed(() => {
  const p = b.progress;
  if (!p) return "";
  if (p.phase === "extract") return "展開中…";
  if (p.phase === "done") return "完了";
  const mb = (n: number) => (n / 1048576).toFixed(0);
  return p.total > 0 ? `ダウンロード中 ${mb(p.received)} / ${mb(p.total)} MB` : `ダウンロード中 ${mb(p.received)} MB`;
});
const fmtDate = (sec: number | null | undefined) => (sec ? new Date(sec * 1000).toLocaleDateString("ja-JP") : "—");

// keep-alive 配下: 初回は onMounted + onActivated の両方が走るので、起動は onActivated 側に寄せる
onMounted(() => {
  void refreshStatus();
});
onActivated(() => {
  void refreshStatus().then(() => launch(false));
});
</script>

<template>
  <section class="min-h-full block px-6 py-4 bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-primary)]">
    <header class="mb-4">
      <h1 class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">Path of Building (PoE2) 日本語版</h1>
      <p class="text-xs text-[var(--exile-color-text-secondary)] mt-1">
        公式 PoB + PoB2-JP 日本語化パッチを ExileDesk が管理します。初回だけダウンロード (約 100 MB)、以降は 30 日ごとに更新を確認します。
      </p>
    </header>

    <!-- 未インストール -->
    <div v-if="b.status && !b.status.installed" class="rounded-lg border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-surface)] p-4 max-w-[720px]">
      <p class="text-[13px]">PoB はまだこの PC にありません。</p>
      <div class="mt-3 flex items-center gap-3">
        <button
          type="button"
          @click="install"
          :disabled="b.installing"
          class="px-4 py-1.5 rounded font-medium text-[13px] bg-[var(--exile-color-accent-focus)] text-black hover:bg-[var(--exile-color-accent-focus-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {{ b.installing ? progressText : "⬇ PoB をダウンロード (約 100 MB)" }}
        </button>
        <span class="text-[11px] text-[var(--exile-color-text-tertiary)]">保存先: {{ b.status.dir }}</span>
      </div>
      <p v-if="b.error" class="mt-3 text-[12px] text-red-200">失敗: {{ b.error }}</p>
    </div>

    <!-- インストール済み -->
    <div v-else class="rounded-lg border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-surface)] p-4 max-w-[720px]">
      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        <dt class="text-[var(--exile-color-text-secondary)]">状態</dt>
        <dd>
          <span v-if="b.installing" class="text-sky-300">{{ progressText }}</span>
          <span v-else-if="status?.available" class="text-emerald-300">起動可能</span>
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
        <dt class="text-[var(--exile-color-text-secondary)]">更新確認</dt>
        <dd class="text-[var(--exile-color-text-secondary)]">
          前回 {{ fmtDate(b.status?.checked_at) }} / 次回自動 {{ fmtDate(b.status?.next_check_at) }}
          <span v-if="b.lastCheck && !b.lastCheck.update_needed" class="ml-2 text-emerald-300">最新です</span>
          <span v-else-if="b.lastCheck?.update_needed" class="ml-2 text-amber-300">新しい版があります (PoB {{ b.lastCheck.manifest.version }} / JP {{ b.lastCheck.manifest.jp ?? "-" }})</span>
        </dd>
        <dt class="text-[var(--exile-color-text-secondary)]">保存先</dt>
        <dd class="font-mono text-[11px] break-all text-[var(--exile-color-text-secondary)]">{{ status?.dir ?? b.status?.dir ?? "—" }}</dd>
        <dt class="text-[var(--exile-color-text-secondary)]">ビルド保存先</dt>
        <dd class="text-[var(--exile-color-text-secondary)]">ドキュメント\Path of Building (PoE2)\Builds (公式 PoB と共通)</dd>
      </dl>

      <div class="mt-4 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          @click="launch(true)"
          :disabled="launching || b.installing || !status?.available"
          class="px-4 py-1.5 rounded font-medium text-[13px] bg-[var(--exile-color-accent-focus)] text-black hover:bg-[var(--exile-color-accent-focus-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {{ launching ? "起動中…" : "▶ PoB を起動" }}
        </button>
        <button
          v-if="b.lastCheck?.update_needed"
          type="button"
          @click="install"
          :disabled="b.installing"
          class="px-3 py-1.5 rounded border border-[var(--exile-color-border-brass)] text-[12px] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-50 transition"
        >
          {{ b.installing ? progressText : "⬇ 更新する" }}
        </button>
        <button
          type="button"
          @click="checkPobBundle"
          :disabled="b.checking || b.installing"
          class="px-3 py-1.5 rounded border border-[var(--exile-color-border-subtle)] text-[12px] text-[var(--exile-color-text-secondary)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-50 transition"
        >
          {{ b.checking ? "確認中…" : "更新を確認" }}
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
      <p v-if="b.error" class="mt-3 text-[12px] text-red-200">{{ b.error }}</p>
    </div>

    <p class="mt-4 text-[11px] text-[var(--exile-color-text-tertiary)] max-w-[720px]">
      PoB 自身の自動更新は止めてあり、更新は ExileDesk が 30 日ごとに確認して入れ替えます (PoB を閉じた状態で行ってください)。
      ビルドデータは公式 PoB と同じ場所に保存されるため、更新・削除しても消えません。
    </p>
  </section>
</template>
