<script setup lang="ts">
/**
 * UpdateToast
 *
 * 起動直後にバックグラウンドで GitHub Releases から最新バージョン確認。
 * 新版があればトーストを表示、[今すぐ更新] でダウンロード + 署名検証 +
 * インストール + 再起動。Phase 1 設計 (2026-05-19): app-self-update.md 参照。
 *
 * 状態と処理は useAppUpdater.ts (2026-09-26 の分割)、ここは表示だけ。
 */
import { updateErrorJa } from "../utils/trade-error";
import { clearLaunchSeq, fmtBytes, useAppUpdater } from "./useAppUpdater";

const { update, phase, errorMsg, downloadedBytes, totalBytes, forced, runCheck, applyUpdate, dismiss } = useAppUpdater();
</script>

<template>
  <!-- 起動時に見つけた更新: 全面に出して、入れ終わったら再起動する (2026-09-20) -->
  <div v-if="forced" class="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-[1px]">
    <div class="max-w-md mx-6 rounded-xl border border-amber-400/40 bg-[var(--exile-color-bg-surface)] p-6 shadow-lg text-center">
      <h2 class="text-sm font-bold text-amber-100 mb-2">アップデート中です</h2>
      <p class="text-[13px] text-[var(--exile-color-text-secondary)] leading-relaxed">
        新しい版<template v-if="update?.version"> ({{ update.version }})</template>を入れています。終わると自動で再起動します。
      </p>
      <div class="mt-4 h-1.5 w-full rounded bg-[var(--exile-color-bg-elevated)] overflow-hidden">
        <div
          class="h-full bg-[var(--exile-color-accent-focus)] transition-[width] duration-200"
          :style="{ width: totalBytes ? `${Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))}%` : '35%' }"
        ></div>
      </div>
      <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-2 tabular-nums">
        <template v-if="phase === 'downloading'">
          ダウンロード中 {{ fmtBytes(downloadedBytes) }}<template v-if="totalBytes"> / {{ fmtBytes(totalBytes) }}</template>
        </template>
        <template v-else-if="phase === 'installing'">インストール中…</template>
        <template v-else-if="phase === 'done'">再起動しています…</template>
        <template v-else>準備中…</template>
      </p>
    </div>
  </div>

  <div
    v-if="
      !forced && (
      phase === 'available' ||
      phase === 'downloading' ||
      phase === 'installing' ||
      phase === 'done' ||
      phase === 'error' ||
      phase === 'safe-mode' ||
      phase === 'up-to-date')
    "
    class="fixed bottom-4 right-4 max-w-sm rounded-lg border bg-[var(--exile-color-bg-surface)] border-[var(--exile-color-border-subtle)] shadow-lg z-50 p-4"
  >
    <!-- 更新あり -->
    <div v-if="phase === 'available' && update">
      <div class="flex items-baseline justify-between mb-2">
        <h3 class="text-sm font-semibold text-[var(--exile-color-accent-focus)]">
          🆙 新しいバージョンが利用可能
        </h3>
        <button
          @click="dismiss"
          class="text-xs text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-text-primary)]"
          aria-label="閉じる"
        >
          ×
        </button>
      </div>
      <p class="text-xs text-[var(--exile-color-text-secondary)] mb-3">
        v{{ update.currentVersion }} → <span class="text-[var(--exile-color-text-primary)] font-mono">v{{ update.version }}</span>
      </p>
      <p
        v-if="update.body"
        class="text-[10px] text-[var(--exile-color-text-secondary)] mb-3 whitespace-pre-wrap max-h-24 overflow-auto"
      >
        {{ update.body }}
      </p>
      <div class="flex gap-2">
        <button
          @click="applyUpdate"
          class="flex-1 px-3 py-1.5 rounded text-xs bg-[var(--exile-color-accent-focus)] text-black hover:bg-[var(--exile-color-accent-focus-hover)] font-semibold transition"
        >
          今すぐ更新
        </button>
        <button
          @click="dismiss"
          class="px-3 py-1.5 rounded text-xs border border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-secondary)] hover:bg-[var(--exile-color-bg-elevated)] transition"
        >
          後で
        </button>
      </div>
    </div>

    <!-- ダウンロード中 -->
    <div v-else-if="phase === 'downloading'">
      <h3 class="text-sm font-semibold mb-2">📥 ダウンロード中…</h3>
      <p class="text-xs text-[var(--exile-color-text-secondary)] font-mono">
        {{ fmtBytes(downloadedBytes) }}<span v-if="totalBytes"> / {{ fmtBytes(totalBytes) }}</span>
      </p>
      <div
        v-if="totalBytes"
        class="mt-2 h-1.5 bg-[var(--exile-color-bg-elevated)] rounded overflow-hidden"
      >
        <div
          class="h-full bg-[var(--exile-color-accent-focus)] transition-all"
          :style="{ width: `${Math.min(100, (downloadedBytes / totalBytes) * 100)}%` }"
        ></div>
      </div>
    </div>

    <!-- インストール中 -->
    <div v-else-if="phase === 'installing'">
      <h3 class="text-sm font-semibold mb-2">⚙ インストール中…</h3>
      <p class="text-xs text-[var(--exile-color-text-secondary)]">
        まもなく再起動します。
      </p>
    </div>

    <!-- 完了 -->
    <div v-else-if="phase === 'done'">
      <h3 class="text-sm font-semibold text-[var(--exile-color-signal-success)] mb-2">✓ 更新完了</h3>
      <p class="text-xs text-[var(--exile-color-text-secondary)]">
        再起動して新版に切り替えます…
      </p>
    </div>

    <!-- 手動チェックで最新だった時 (2026-09-16、起動時は出さない) -->
    <div v-else-if="phase === 'up-to-date'">
      <div class="flex items-baseline justify-between mb-1">
        <h3 class="text-sm font-semibold text-[var(--exile-color-signal-success)]">✓ 最新版です</h3>
        <button
          @click="dismiss"
          class="text-xs text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-text-primary)]"
          aria-label="閉じる"
        >
          ×
        </button>
      </div>
      <p class="text-xs text-[var(--exile-color-text-secondary)]">更新はありません。</p>
    </div>

    <!-- セーフモード: 連続クラッシュ検出で自動 check skip -->
    <div v-else-if="phase === 'safe-mode'">
      <div class="flex items-baseline justify-between mb-2">
        <h3 class="text-sm font-semibold text-[var(--exile-color-signal-warn)]">⚠ セーフモード</h3>
        <button
          @click="(clearLaunchSeq(), (phase = 'idle'))"
          class="text-xs text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-text-primary)]"
          aria-label="閉じる"
        >
          ×
        </button>
      </div>
      <p class="text-xs text-[var(--exile-color-text-secondary)] mb-2">
        連続起動失敗を検知したため、自動更新チェックをスキップしています。
        前回の更新が原因の可能性がある場合は、GitHub Releases から前バージョンを手動 DL してください。
      </p>
      <div class="flex gap-2">
        <button
          @click="(clearLaunchSeq(), runCheck(true))"
          class="flex-1 px-3 py-1.5 rounded text-xs bg-[var(--exile-color-accent-focus)] text-black hover:bg-[var(--exile-color-accent-focus-hover)] font-semibold transition"
        >
          手動チェック
        </button>
      </div>
    </div>

    <!-- エラー -->
    <div v-else-if="phase === 'error'">
      <div class="flex items-baseline justify-between mb-2">
        <h3 class="text-sm font-semibold text-[var(--exile-color-signal-error)]">✗ 更新エラー</h3>
        <button
          @click="dismiss"
          class="text-xs text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-text-primary)]"
        >
          ×
        </button>
      </div>
      <p class="text-xs text-[var(--exile-color-signal-error)] whitespace-pre-wrap break-words" :title="errorMsg ?? ''">
        {{ updateErrorJa(errorMsg) }}
      </p>
      <button
        @click="(phase = 'idle'), runCheck(true)"
        class="mt-2 px-3 py-1 rounded text-xs border border-[var(--exile-color-border-subtle)] hover:bg-[var(--exile-color-bg-elevated)]"
      >
        🔄 再試行
      </button>
    </div>
  </div>
</template>
