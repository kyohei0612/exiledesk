// useKeyboardShortcuts
// ----------------------------------------------------------------------------
// visual-concept §6.1 / design-token-implementation Phase A.8 のキーボード
// ショートカット仕様を集約する composable。
//
// 責務分割:
//   - グローバル系 (Ctrl+1/2, Ctrl+,, Ctrl+Q):
//       この composable が直接処理する。activeNav の切替および Tauri 終了。
//   - 画面固有系 (/, ↑↓, s, r, f, Esc 等):
//       各画面側から `registerHandler` でコールバックを登録する。複数画面が
//       同じキーを使うため、最後に登録したハンドラが有効になる (画面切替時
//       にマウントされた画面のものが優先される、という設計)。
//
// 入力中ガード:
//   input / textarea / contenteditable にフォーカスがある状態では、修飾なし
//   の文字キー (/, s, r, f, Esc 等) は誤発火させない。修飾キーつき
//   (Ctrl+1 等) はガードを通過する。
//
// SSR/テスト互換:
//   document が無い環境では何もしない。
// ----------------------------------------------------------------------------

import { onBeforeUnmount, onMounted, type Ref } from "vue";
import { isTauriRuntime } from "../utils/isTauriRuntime";

/** 画面固有ハンドラに渡される識別子 (visual-concept §6.1) */
export type ShortcutKey =
  | "search-focus" // `/` or Ctrl+F
  | "row-up" // ArrowUp
  | "row-down" // ArrowDown
  | "sort" // s
  | "refresh" // r
  | "filter-toggle" // f (EconDashboard のホット度フィルタ等)
  | "escape"; // Esc

export type ShortcutHandler = (e: KeyboardEvent) => void;

/** 設計書 Phase A.8: ナビ ID は LeftSidebar.vue と一致させる */
// 2026-05-22: econ-trending (旧クラフト発見) は LeftSidebar から削除済。
// Ctrl+2 は現行の「上位プレイヤーMOD一覧」(craft-v2) に割り当て直す。
const NAV_BY_DIGIT: Record<string, string> = {
  "1": "econ-currency",
  "2": "craft-v2",
};

export interface UseKeyboardShortcutsOptions {
  /** 現在の activeNav。Ctrl+1/2/3 で書き換える */
  activeNav: Ref<string>;
  /** Ctrl+, (設定) が押されたとき。未実装画面なら no-op or トースト */
  onOpenSettings?: () => void;
  /** Ctrl+Q (アプリ終了)。省略時は Tauri process plugin を try で呼ぶ */
  onQuit?: () => void;
}

export interface UseKeyboardShortcutsReturn {
  /** 画面固有ハンドラを差し込む。返り値は登録解除関数 */
  registerHandler: (key: ShortcutKey, fn: ShortcutHandler) => () => void;
}

/**
 * テキスト入力フォーカス中かどうか。修飾なしの文字キーをガードする用途。
 * - input (type=button/checkbox/radio/submit/reset 以外)
 * - textarea
 * - contenteditable
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type.toLowerCase();
    const nonText = new Set([
      "button",
      "checkbox",
      "color",
      "file",
      "hidden",
      "image",
      "radio",
      "range",
      "reset",
      "submit",
    ]);
    return !nonText.has(type);
  }
  return false;
}

/** Tauri 環境で安全にアプリ終了。失敗してもユーザー体験に影響しない */
async function quitTauri(): Promise<void> {
  // dev-server (browser) では Tauri 環境ではないためスキップ（動的 import 自体を省く）
  if (!isTauriRuntime()) {
    console.info("[useKeyboardShortcuts] Ctrl+Q: Tauri 環境外のため終了を skip");
    return;
  }
  try {
    // 動的 import: ブラウザ単体実行時 (vite dev でブラウザを開いた場合) でも
    // モジュールロード失敗で composable 全体が落ちないようにする。
    const mod = await import("@tauri-apps/plugin-process");
    await mod.exit(0);
  } catch (err) {
    // Tauri 外実行 or プラグイン未許可。コンソールに案内ログのみ。
    console.info("[useKeyboardShortcuts] Ctrl+Q: Tauri 環境外のため終了を skip", err);
  }
}

/**
 * グローバルショートカットを window に bind し、画面固有ハンドラ登録 API を返す。
 */
export function useKeyboardShortcuts(
  options: UseKeyboardShortcutsOptions,
): UseKeyboardShortcutsReturn {
  const { activeNav, onOpenSettings, onQuit } = options;

  // key 1 つにつき複数登録された場合は「最後に登録されたもの」を優先する。
  // 画面コンポーネントは onMounted で register, onBeforeUnmount で unregister
  // する想定なので、表示中の画面が必ず最新になる。
  const handlerStack: Map<ShortcutKey, ShortcutHandler[]> = new Map();

  function registerHandler(key: ShortcutKey, fn: ShortcutHandler): () => void {
    const stack = handlerStack.get(key) ?? [];
    stack.push(fn);
    handlerStack.set(key, stack);
    return () => {
      const cur = handlerStack.get(key);
      if (!cur) return;
      const idx = cur.lastIndexOf(fn);
      if (idx >= 0) cur.splice(idx, 1);
      if (cur.length === 0) handlerStack.delete(key);
    };
  }

  function dispatch(key: ShortcutKey, e: KeyboardEvent): boolean {
    const stack = handlerStack.get(key);
    if (!stack || stack.length === 0) return false;
    const fn = stack[stack.length - 1];
    fn(e);
    return true;
  }

  function onKeydown(e: KeyboardEvent): void {
    // IME 変換中は一切受け付けない (Enter で確定したのを誤って submit しない)
    if (e.isComposing) return;

    const ctrlOrMeta = e.ctrlKey || e.metaKey;
    const editable = isEditableTarget(e.target);

    // ---- グローバル系 (修飾キーあり: 入力フォーカス中も発火する) ----

    if (ctrlOrMeta && !e.altKey && !e.shiftKey) {
      // Ctrl+1 / Ctrl+2 / Ctrl+3 → activeNav
      const navId = NAV_BY_DIGIT[e.key];
      if (navId) {
        e.preventDefault();
        activeNav.value = navId;
        return;
      }

      // Ctrl+, → 設定 (未実装ならコールバック省略可)
      if (e.key === ",") {
        e.preventDefault();
        if (onOpenSettings) {
          onOpenSettings();
        } else {
          console.info("[useKeyboardShortcuts] Ctrl+, 設定画面は未実装");
        }
        return;
      }

      // Ctrl+Q → アプリ終了 (Tauri のみ)
      // 注: ブラウザは Ctrl+Q をタブ閉じに割り当てるが、preventDefault しても
      //     ブラウザ側ショートカットはキャンセルできないことが多い。Tauri では
      //     カスタム可能なので問題なし。
      if (e.key === "q" || e.key === "Q") {
        e.preventDefault();
        if (onQuit) {
          onQuit();
        } else {
          void quitTauri();
        }
        return;
      }

      // Ctrl 系はここまで。他は素通り (Ctrl+F 等はブラウザに任せる選択肢)
      return;
    }

    // ---- 画面固有系 (修飾なし) ----

    // Esc は入力中でも有効 (検索解除・モーダル閉じる)
    if (e.key === "Escape") {
      dispatch("escape", e);
      return;
    }

    // 矢印キーは入力中はガード (テキストカーソル移動を優先)
    if (!editable) {
      if (e.key === "ArrowUp") {
        if (dispatch("row-up", e)) e.preventDefault();
        return;
      }
      if (e.key === "ArrowDown") {
        if (dispatch("row-down", e)) e.preventDefault();
        return;
      }
    }

    // 修飾なし文字キーは「入力中ガード」を必ず通す
    if (editable) return;
    if (e.altKey || e.shiftKey) return;

    switch (e.key) {
      case "/":
        if (dispatch("search-focus", e)) e.preventDefault();
        return;
      case "s":
      case "S":
        if (dispatch("sort", e)) e.preventDefault();
        return;
      case "r":
      case "R":
        if (dispatch("refresh", e)) e.preventDefault();
        return;
      case "f":
      case "F":
        if (dispatch("filter-toggle", e)) e.preventDefault();
        return;
      default:
        return;
    }
  }

  onMounted(() => {
    if (typeof document === "undefined") return;
    window.addEventListener("keydown", onKeydown);
  });

  onBeforeUnmount(() => {
    if (typeof document === "undefined") return;
    window.removeEventListener("keydown", onKeydown);
  });

  return { registerHandler };
}
