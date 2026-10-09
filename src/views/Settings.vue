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
import { noLogOn, setNoLog } from "../utils/no-log";
import SettingsUpdateSection from "./SettingsUpdateSection.vue";
import TabBar from "../components/ui/TabBar.vue";

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
  <div class="min-h-full flex flex-col text-[var(--exile-color-text-primary)]">
    <!-- 画面名は上の帯に 1 回だけ (他の画面と同じ TabBar。2026-10-03。余白も他の画面と同じ px-6 py-4 に) -->
    <TabBar icon="⚙" title="設定" />
    <div class="max-w-2xl px-6 py-4">
      <p class="mb-5 text-[12px] text-[var(--exile-color-text-secondary)]">
        バックグラウンド常駐 (Discord 風) と自動再取得、トレードサイト、配布データ、更新。変えると自動で保存します。
      </p>

      <div v-if="loading" class="text-sm text-[var(--exile-color-text-secondary)]">
        読み込み中…
      </div>

      <div v-else class="space-y-6">
        <!-- スタートアップ -->
        <section class="g-panel px-2 py-1">
          <h2 class="g-brush mb-2 text-[18px] tracking-[0.12em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_0_#000]">
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
        <section class="g-panel px-2 py-1">
          <h2 class="g-brush mb-2 text-[18px] tracking-[0.12em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_0_#000]">
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
        <section class="g-panel px-2 py-1">
          <h2 class="g-brush mb-2 text-[18px] tracking-[0.12em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_0_#000]">
            自動再取得
          </h2>
          <label class="flex items-center gap-3">
            <span class="text-sm whitespace-nowrap">取得間隔:</span>
            <input type="number" v-model.number="autoRefetchDays" @change="saveSettings" min="0" max="7" step="1" class="num w-20" />
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
        <section class="g-panel px-2 py-1">
          <h2 class="g-brush mb-2 text-[18px] tracking-[0.12em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_0_#000]">
            トレードサイト
          </h2>
          <label class="flex items-center gap-3">
            <span class="text-sm whitespace-nowrap">ブラウザで開く先:</span>
            <select :value="tradeSite" @change="onTradeSiteChange(($event.target as HTMLSelectElement).value as Trade2Site)" class="sel">
              <option value="jp">日本語 (jp.pathofexile.com)</option>
              <option value="www">英語 (www.pathofexile.com)</option>
            </select>
          </label>
          <p class="mt-2 text-xs text-[var(--exile-color-text-secondary)]">
            「トレード2へ」「鑑定」で開くサイト。日本語サイトはボット確認 (Cloudflare) を挟むことがあり、
            その後に検索条件が消えて開けない場合は英語に切り替えてください。相場の取得 (API) はこの設定に関係なく動きます。
          </p>
        </section>

        <!-- 使い方の記録 (2026-10-09): この PC からは送らない (no-log.ts。オーナーの PC の分を数えないため) -->
        <section class="g-panel px-2 py-1">
          <h2 class="g-brush mb-2 text-[18px] tracking-[0.12em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_0_#000]">
            使い方の記録
          </h2>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" :checked="noLogOn" @change="setNoLog(($event.target as HTMLInputElement).checked)" />
            この PC からは使い方の記録を送らない
          </label>
          <p class="mt-2 text-xs text-[var(--exile-color-text-secondary)]">
            打った手・回した結果などを改善のために集めています (名前・IP・ログインの情報は含みません)。チェックを入れると、この PC からは何も送りません。
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
