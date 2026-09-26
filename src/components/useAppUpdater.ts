/**
 * アプリの自己更新の状態と処理 (更新確認 / ダウンロード + インストール + 再起動 / セーフモード)
 *
 * UpdateToast.vue から切り出し (2026-09-26)。表示は UpdateToast.vue、ここは状態と処理だけ。
 */
import { onMounted, ref, shallowRef, markRaw, watch } from "vue";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../utils/isTauriRuntime";
import { updateCheckError, updateCheckRequest, updateCheckState } from "../state/update-check";

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

export function clearLaunchSeq() {
  try {
    localStorage.setItem(LAUNCH_SEQ_KEY, "0");
  } catch {
    /* noop */
  }
}

export function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

export function useAppUpdater() {
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

  return { update, phase, errorMsg, downloadedBytes, totalBytes, forced, runCheck, applyUpdate, dismiss };
}
