/**
 * 設定 (AppSettings) の読み書きと OS 側 autostart の同期
 *
 * Settings.vue から切り出し (2026-09-26)。画面を開くたびに新しい状態を作る (モジュール共有はしない)。
 */
import { ref, computed } from "vue";
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

export function useAppSettings() {
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

  // 自動再取得間隔は UI 側で「日」単位、永続化は秒単位
  // (オーナー指示 2026-09-18: MOD 一覧も使用率ランキングも 3 日に 1 回のペース)
  const autoRefetchDays = computed<number>({
    get: () => Math.round(settings.value.auto_refetch_interval_secs / 86_400),
    set: (v) => {
      const clamped = Math.max(0, Math.min(7, Math.round(v)));
      settings.value.auto_refetch_interval_secs = clamped * 86_400;
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

  return { settings, loading, saving, errorMessage, savedAt, isDebugBuild, autoRefetchDays, loadSettings, saveSettings, formatHms };
}
