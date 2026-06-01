<script setup lang="ts">
/**
 * Settings.vue — 設定画面 (2026-05-23)
 * ============================================================================
 *
 * オーナー要望:
 *   - Discord 風スタートアップ (バックグラウンド起動)
 *   - × ボタンで最小化 (タスクトレイ常駐)
 *   - 1 日数回 (6 時間ごと等) 自動再取得
 *
 * 責務:
 *   - Rust `settings_load` / `settings_save` 経由で `AppSettings` を読み書き
 *   - `autostart_enabled` 変更時は `@tauri-apps/plugin-autostart` の
 *     `enable()` / `disable()` を呼んで OS 側に登録/解除
 *   - 各設定変更は即時保存 (Discord 風 "save なしに即反映")
 *
 * スタイル方針 (visual-concept §5 / §8 暖色トーン):
 *   - 見出し: Cinzel (`font-display`)
 *   - 区切り: brass 系の薄罫 (`--exile-color-border-subtle`)
 *   - 補助テキスト: `--exile-color-text-secondary`
 */
import { ref, computed, onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import {
  enable as autostartEnable,
  disable as autostartDisable,
  isEnabled as autostartIsEnabled,
} from "@tauri-apps/plugin-autostart";

interface AppSettings {
  autostart_enabled: boolean;
  close_to_tray: boolean;
  auto_refetch_interval_secs: number;
}

const settings = ref<AppSettings>({
  autostart_enabled: false,
  close_to_tray: true,
  auto_refetch_interval_secs: 6 * 3600,
});

const loading = ref(true);
const saving = ref(false);
const errorMessage = ref<string | null>(null);
const savedAt = ref<Date | null>(null);

// dev (cargo tauri dev) で動かしている時に autostart を ON にすると、
// `std::env::current_exe()` の debug exe 絶対パスが HKCU\Run に焼き付き、
// PC 起動時に黒コンソール窓が出てしまう (CUI subsystem)。
// debug ビルドでは toggle を構造的に押せないようにして再発防止する (2026-05-25)。
const isDebugBuild = ref<boolean>(false);

// 自動再取得間隔は UI 側で「時間」単位、永続化は秒単位
const autoRefetchHours = computed<number>({
  get: () => Math.round(settings.value.auto_refetch_interval_secs / 3600),
  set: (v) => {
    const clamped = Math.max(0, Math.min(24, Math.round(v)));
    settings.value.auto_refetch_interval_secs = clamped * 3600;
  },
});

async function loadSettings(): Promise<void> {
  loading.value = true;
  errorMessage.value = null;
  try {
    const loaded = await invoke<AppSettings>("settings_load");
    settings.value = loaded;
    // OS 側 autostart の実状態と settings.json を念のため照合
    //
    // debug ビルドではこのブロックを必ずスキップする:
    //   `autostartEnable()` は `std::env::current_exe()` (= debug exe 絶対パス) を
    //   HKCU\Run に書き込むため、debug 起動 1 回で release exe パスが debug パスに
    //   差し戻されてしまう (2026-05-25 統合判断ドキュメント参照)。
    //   debug 中は OS 同期そのものを行わず、registry を温存する。
    if (!isDebugBuild.value) {
      try {
        const osEnabled = await autostartIsEnabled();
        if (osEnabled !== settings.value.autostart_enabled) {
          // settings.json を真値として扱い、OS 側を寄せる
          if (settings.value.autostart_enabled) {
            await autostartEnable();
          } else {
            await autostartDisable();
          }
        }
      } catch {
        // autostart plugin の問い合わせ失敗は致命ではないので握りつぶし
      }
    }
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

async function saveSettings(): Promise<void> {
  saving.value = true;
  errorMessage.value = null;
  try {
    await invoke("settings_save", { settings: settings.value });
    // OS 側 autostart 登録/解除
    //
    // debug ビルドではこのブロックを必ずスキップ。
    // close_to_tray や auto_refetch_interval_secs だけを変更した場合でも
    // saveSettings は呼ばれるため、isDebugBuild ガード無しだと
    // 「他設定変更 → autostart_enabled=true なら autostartEnable() 呼出 →
    //  current_exe (= debug exe) が HKCU\Run に焼き付く」経路が生きる。
    // toggle の disabled 表示だけでは構造的修正にならない (2026-05-25 cross-review)。
    if (!isDebugBuild.value) {
      try {
        if (settings.value.autostart_enabled) {
          await autostartEnable();
        } else {
          await autostartDisable();
        }
      } catch (e) {
        // OS 側登録失敗時は警告のみ (設定 JSON は保存済)
        console.warn("[Settings] autostart toggle failed:", e);
      }
    }
    savedAt.value = new Date();
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}

function formatHms(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

onMounted(async () => {
  try {
    isDebugBuild.value = await invoke<boolean>("is_debug_build");
  } catch {
    // 取得失敗時は release 扱い (= toggle 有効) にフォールバック
  }
  void loadSettings();
});
</script>

<template>
  <div
    class="h-full overflow-y-auto px-8 py-8 text-[var(--exile-color-text-primary)]"
  >
    <div class="max-w-2xl">
      <header class="mb-6 pb-3 border-b border-[var(--exile-color-border-subtle)]">
        <h1 class="font-display tracking-[0.12em] text-2xl text-[var(--exile-color-accent-focus)]">
          設定
        </h1>
        <p class="mt-1 text-xs text-[var(--exile-color-text-secondary)]">
          Discord 風のバックグラウンド常駐と、自動再取得の設定。
        </p>
      </header>

      <div v-if="loading" class="text-sm text-[var(--exile-color-text-secondary)]">
        読み込み中…
      </div>

      <div v-else class="space-y-6">
        <!-- スタートアップ -->
        <section>
          <h2 class="font-display tracking-[0.08em] text-[15px] mb-2 text-[var(--exile-color-text-primary)]">
            起動
          </h2>
          <label
            class="flex items-start gap-3 select-none"
            :class="isDebugBuild ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'"
          >
            <input
              type="checkbox"
              v-model="settings.autostart_enabled"
              @change="saveSettings"
              :disabled="isDebugBuild"
              class="mt-1 accent-[var(--exile-color-accent-focus)] disabled:cursor-not-allowed"
            />
            <span class="flex-1">
              <span class="block text-sm">
                Windows 起動時に自動起動 (Discord 風: バックグラウンド)
              </span>
              <span class="block mt-1 text-xs text-[var(--exile-color-text-secondary)]">
                ログイン時にタスクトレイのみ常駐して背景でデータ取得を開始します。
              </span>
              <span
                v-if="isDebugBuild"
                class="block mt-1 text-xs text-[var(--exile-color-signal-warning,#d4a247)]"
              >
                ⚠ dev ビルドでは設定できません。release exe (`target\release\exiledesk.exe` または installer) で起動した時のみ有効化できます。
              </span>
            </span>
          </label>
        </section>

        <!-- × ボタン挙動 -->
        <section>
          <h2 class="font-display tracking-[0.08em] text-[15px] mb-2 text-[var(--exile-color-text-primary)]">
            ウィンドウ
          </h2>
          <label class="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              v-model="settings.close_to_tray"
              @change="saveSettings"
              class="mt-1 accent-[var(--exile-color-accent-focus)]"
            />
            <span class="flex-1">
              <span class="block text-sm">
                × ボタンで最小化 (タスクトレイ常駐)
              </span>
              <span class="block mt-1 text-xs text-[var(--exile-color-text-secondary)]">
                オフにすると × ボタンでアプリを完全終了します。
                オン時はタスクトレイ右クリック →「終了」で完全終了できます。
              </span>
            </span>
          </label>
        </section>

        <!-- 自動再取得 -->
        <section>
          <h2 class="font-display tracking-[0.08em] text-[15px] mb-2 text-[var(--exile-color-text-primary)]">
            自動再取得
          </h2>
          <label class="flex items-center gap-3">
            <span class="text-sm whitespace-nowrap">取得間隔:</span>
            <input
              type="number"
              v-model.number="autoRefetchHours"
              @change="saveSettings"
              min="0"
              max="24"
              step="1"
              class="w-20 px-2 py-1 bg-[var(--exile-color-bg-elevated)] border border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-primary)] rounded-sm"
            />
            <span class="text-sm text-[var(--exile-color-text-secondary)]">
              時間 (0 = 無効)
            </span>
          </label>
          <p class="mt-2 text-xs text-[var(--exile-color-text-secondary)]">
            背景で MOD 一覧を再取得します。<br />
            例: 6 時間 = 1 日 4 回、8 時間 = 1 日 3 回。
          </p>
        </section>

        <!-- 保存状態 -->
        <footer class="pt-4 border-t border-[var(--exile-color-border-subtle)] text-xs">
          <div v-if="saving" class="text-[var(--exile-color-text-secondary)]">
            保存中…
          </div>
          <div
            v-else-if="errorMessage"
            class="text-[var(--exile-color-signal-error)]"
          >
            保存失敗: {{ errorMessage }}
          </div>
          <div
            v-else-if="savedAt"
            class="text-[var(--exile-color-signal-success)]"
          >
            {{ formatHms(savedAt) }} に保存しました
          </div>
          <div v-else class="text-[var(--exile-color-text-tertiary)]">
            変更すると自動的に保存されます。
          </div>
        </footer>
      </div>
    </div>
  </div>
</template>
