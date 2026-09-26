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
 *
 * 分割 (2026-09-26): 設定の読み書きは useAppSettings.ts、
 * 「配布データ」欄は SettingsSeedSection.vue、「更新」欄は SettingsUpdateSection.vue。
 */
import { ref, onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { setTrade2Site, trade2Site, type Trade2Site } from "../services/trade2/league";
import { getVersion } from "@tauri-apps/api/app";
import { isTauriRuntime } from "../utils/isTauriRuntime";
import { useAppSettings } from "./useAppSettings";
import SettingsSeedSection from "./SettingsSeedSection.vue";
import SettingsUpdateSection from "./SettingsUpdateSection.vue";

// トレードサイトの言語 (ブラウザで開く先)。localStorage のみ (2026-09-12)
const tradeSite = ref<Trade2Site>(trade2Site());
function onTradeSiteChange(v: Trade2Site): void {
  tradeSite.value = v;
  setTrade2Site(v);
}

const { settings, loading, saving, errorMessage, savedAt, isDebugBuild, autoRefetchDays, loadSettings, saveSettings, formatHms } =
  useAppSettings();

/** 更新確認 (2026-09-16): 実際のチェックとトーストは UpdateToast.vue が持つ */
const appVersion = ref("");

onMounted(async () => {
  try {
    isDebugBuild.value = await invoke<boolean>("is_debug_build");
  } catch {
    // 取得失敗時は release 扱い (= toggle 有効) にフォールバック
  }
  if (isTauriRuntime()) {
    try {
      appVersion.value = await getVersion();
    } catch {
      /* 取れなくても設定画面は動く */
    }
  }
  void loadSettings();
});
</script>

<template>
  <div
    class="min-h-full px-8 py-8 text-[var(--exile-color-text-primary)]"
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
          <h2 class="text-sm font-bold text-amber-100 mb-2">
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
                ⚠ 開発ビルド (target フォルダの exe) では設定できません。インストール版で設定してください。
              </span>
            </span>
          </label>
        </section>

        <!-- × ボタン挙動 -->
        <section>
          <h2 class="text-sm font-bold text-amber-100 mb-2">
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
          <h2 class="text-sm font-bold text-amber-100 mb-2">
            自動再取得
          </h2>
          <label class="flex items-center gap-3">
            <span class="text-sm whitespace-nowrap">取得間隔:</span>
            <input
              type="number"
              v-model.number="autoRefetchDays"
              @change="saveSettings"
              min="0"
              max="7"
              step="1"
              class="w-20 px-2 py-1 bg-[var(--exile-color-bg-elevated)] border border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-primary)] rounded-sm"
            />
            <span class="text-sm text-[var(--exile-color-text-secondary)]">
              日 (0 = 無効)
            </span>
          </label>
          <p class="mt-2 text-xs text-[var(--exile-color-text-secondary)]">
            背景で MOD 一覧を再取得します。自動ジェム監視の「使用率ランキング」も、この取得が
            終わった直後に相乗りして取り直します (同じ poe.ninja を叩くため)。<br />
            既定は 3 日。全体の顔ぶれは日単位ではほとんど変わらないので、これで十分です。
          </p>
        </section>

        <!-- トレードサイト (2026-09-12) -->
        <section>
          <h2 class="text-sm font-bold text-amber-100 mb-2">
            トレードサイト
          </h2>
          <label class="flex items-center gap-3">
            <span class="text-sm whitespace-nowrap">ブラウザで開く先:</span>
            <select
              :value="tradeSite"
              @change="onTradeSiteChange(($event.target as HTMLSelectElement).value as Trade2Site)"
              class="px-2 py-1 bg-[var(--exile-color-bg-elevated)] border border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-primary)] rounded-sm"
            >
              <option value="jp">日本語 (jp.pathofexile.com)</option>
              <option value="www">英語 (www.pathofexile.com)</option>
            </select>
          </label>
          <p class="mt-2 text-xs text-[var(--exile-color-text-secondary)]">
            「トレード2へ」「鑑定」で開くサイト。日本語サイトはボット確認 (Cloudflare) を挟むことがあり、
            その後に検索条件が消えて開けない場合は英語に切り替えてください。相場の取得 (API) はこの設定に関係なく動きます。
          </p>
        </section>

        <SettingsSeedSection />

        <SettingsUpdateSection :app-version="appVersion" />

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
