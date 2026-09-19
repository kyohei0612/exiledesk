<script setup lang="ts">
/**
 * UpdateToast
 *
 * 起動直後にバックグラウンドで GitHub Releases から最新バージョン確認。
 * 新版があればトーストを表示、[今すぐ更新] でダウンロード + 署名検証 +
 * インストール + 再起動。Phase 1 設計 (2026-05-19): app-self-update.md 参照。
 */
import { onMounted, ref, shallowRef, markRaw, watch } from "vue";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../utils/isTauriRuntime";
import { updateCheckError, updateCheckRequest, updateCheckState } from "../state/update-check";
import { updateErrorJa } from "../utils/trade-error";

// Update は class インスタンス（#privateField 持ち）。Vue の reactive proxy で
// 私有フィールドアクセスが壊れるため shallowRef + markRaw を併用する。
const update = shallowRef<Update | null>(null);
const phase = ref<"idle" | "checking" | "available" | "downloading" | "installing" | "done" | "error" | "safe-mode" | "up-to-date">("idle");
const errorMsg = ref<string | null>(null);
const downloadedBytes = ref(0);
const totalBytes = ref<number | null>(null);
/**
 * 起動時のチェックで見つかった更新は**そのまま入れて再起動する** (オーナー指示 2026-09-20:
 * 「起動時にアプデチェックして更新データあるなら、そこでアップデート中 → 強制再起動 → 表示」)。
 * その間は全面に「アップデート中です」を出して操作させない。
 * 設定画面の「更新を確認」から押した時は今まで通り、隅のトーストで本人に選ばせる。
 * 連続クラッシュ (セーフモード) の時は自動チェックごと飛ばすので、ここにも来ない。
 */
const forced = ref(false);

// セーフモード: 連続クラッシュ検出。LocalStorage `exiledesk:launchSeq` を
// 起動時に +1、5 秒生存で 0 に戻す。3 回連続でクリアできなければ自動 check skip。
const LAUNCH_SEQ_KEY = "exiledesk:launchSeq";
const SAFE_MODE_THRESHOLD = 3;
const HEALTHY_BOOT_MS = 5000;

function getLaunchSeq(): number {
  try {
    return parseInt(localStorage.getItem(LAUNCH_SEQ_KEY) ?? "0", 10) || 0;
  } catch {
    return 0;
  }
}

function bumpLaunchSeq(): number {
  const n = getLaunchSeq() + 1;
  try {
    localStorage.setItem(LAUNCH_SEQ_KEY, String(n));
  } catch {
    /* localStorage 不可は無視 */
  }
  return n;
}

function clearLaunchSeq() {
  try {
    localStorage.setItem(LAUNCH_SEQ_KEY, "0");
  } catch {
    /* noop */
  }
}

/**
 * 更新チェック。`manual` は設定画面のボタン経由 (2026-09-16)。
 * 自動 (起動時) は「最新でした」を出さないが、手動は結果が分からないと困るので出す。
 */
async function runCheck(manual = false) {
  if (phase.value !== "idle" && phase.value !== "safe-mode" && phase.value !== "up-to-date") return;
  // dev-server (browser) では Tauri 環境ではないため updater トースト自体出さない
  if (!isTauriRuntime()) {
    if (manual) {
      updateCheckState.value = "error";
      updateCheckError.value = "アプリ (ExileDesk) の中でだけ確認できます";
    }
    return;
  }
  phase.value = "checking";
  errorMsg.value = null;
  updateCheckState.value = "checking";
  updateCheckError.value = null;
  try {
    const u = await check();
    if (u) {
      update.value = markRaw(u);
      phase.value = "available";
      updateCheckState.value = "available";
      // 起動時に見つけた分は聞かずに入れる
      if (!manual) {
        forced.value = true;
        void applyUpdate();
      }
    } else {
      phase.value = manual ? "up-to-date" : "idle";
      updateCheckState.value = "none";
      // 手動の「最新です」は放っておくと邪魔なので数秒で消す
      if (manual) {
        setTimeout(() => {
          if (phase.value === "up-to-date") phase.value = "idle";
        }, 6000);
      }
    }
  } catch (e) {
    errorMsg.value = typeof e === "string" ? e : (e as Error).message;
    phase.value = "error";
    updateCheckState.value = "error";
    updateCheckError.value = errorMsg.value;
  }
}

// 設定画面の「更新を確認」ボタン
watch(updateCheckRequest, () => {
  // 進行中 (ダウンロード等) は無視、既に出ているトーストはそのまま
  if (phase.value === "downloading" || phase.value === "installing" || phase.value === "done") return;
  if (phase.value === "available") {
    updateCheckState.value = "available";
    return;
  }
  if (phase.value === "error") phase.value = "idle";
  void runCheck(true);
});

async function applyUpdate() {
  if (!update.value) return;
  phase.value = "downloading";
  errorMsg.value = null;
  try {
    // 再起動は今の引数 (ログイン時の --tray-only など) を引き継ぐので、次の起動ではウィンドウを出す印を
    // **インストールの前に**置く。Windows ではインストーラがこのプロセスを終了させて自分で新版を起動するため、
    // downloadAndInstall の後の行は実行されない (2026-09-18 実測: 印が無いまま --tray-only で隠れて立ち上がった)
    try {
      await invoke("mark_show_on_restart");
    } catch {
      /* 印が置けなくても更新自体は続ける (トレイから出せる) */
    }
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
    // インストーラ実行後、明示 relaunch で新版を立ち上げる (Windows ではここまで来ないことが多い)
    await relaunch();
  } catch (e) {
    errorMsg.value = typeof e === "string" ? e : (e as Error).message;
    phase.value = "error";
    // 失敗した時は閉じ込めない (このまま今の版で使える)
    forced.value = false;
  }
}

function dismiss() {
  phase.value = "idle";
  forced.value = false;
}

onMounted(() => {
  // dev-server (browser) では Tauri 環境ではないため updater 自体走らせない
  //   （phase は "idle" のままなのでトーストもセーフモードも出ない）
  if (!isTauriRuntime()) return;

  // 連続クラッシュ検出: launchSeq を +1、5 秒生存で 0 にリセット
  const seq = bumpLaunchSeq();
  setTimeout(clearLaunchSeq, HEALTHY_BOOT_MS);

  if (seq >= SAFE_MODE_THRESHOLD) {
    // セーフモード: 自動 check skip、トーストで明示
    phase.value = "safe-mode";
    return;
  }
  // 開発時に ?update=1 を付けた時だけ、全面のアップデート画面の見え方を確かめる (実際には入れない)
  if (import.meta.env.DEV && (window as unknown as { __TAURI_UPDATER_STUB__?: boolean }).__TAURI_UPDATER_STUB__) {
    forced.value = true;
    phase.value = "downloading";
    totalBytes.value = 12_000_000;
    const t = setInterval(() => {
      downloadedBytes.value = Math.min(totalBytes.value ?? 0, downloadedBytes.value + 900_000);
      if (downloadedBytes.value >= (totalBytes.value ?? 0)) {
        clearInterval(t);
        phase.value = "installing";
      }
    }, 300);
    return;
  }
  // 通常起動: バックグラウンドで check（UI ブロックなし）
  runCheck();
});

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}
</script>

<template>
  <!-- 起動時に見つけた更新: 全面に出して、入れ終わったら再起動する (2026-09-20) -->
  <div v-if="forced" class="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-[1px]">
    <div class="max-w-md mx-6 rounded-lg border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-surface)] p-6 shadow-lg text-center">
      <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base mb-2">アップデート中です</h2>
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
