/**
 * PoB 同梱物の別配布 (2026-09-08): Rust `pob_bundle` コマンドの薄いラッパと起動時の自動チェック
 *
 *   - 起動時 (`ensurePobBundleFresh`): インストール済み かつ 前回チェックから 30 日空いていれば manifest を確認し、
 *     変わっていれば自動で入れ替える。未インストールなら何もしない (PoB 画面で案内)
 *   - 手動 (`checkPobBundle` / `installPobBundle`): いつでも可
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { reactive } from "vue";
import { isTauriRuntime } from "../utils/isTauriRuntime";

export interface PobBundleManifest {
  version: string | null;
  tree: string | null;
  jp: string | null;
  contentHash: string;
  zipSha256: string;
  zipSize: number;
  builtAt: string | null;
  url: string;
}

export interface PobBundleStatus {
  installed: boolean;
  dir: string;
  version: string | null;
  jp: string | null;
  content_hash: string | null;
  installed_at: number | null;
  checked_at: number | null;
  next_check_at: number | null;
}

export interface PobBundleCheck {
  manifest: PobBundleManifest;
  update_needed: boolean;
}

export interface PobBundleProgress {
  phase: "download" | "extract" | "done";
  received: number;
  total: number;
}

export const pobBundleState = reactive({
  status: null as PobBundleStatus | null,
  /** 最後の manifest 確認結果 (手動 / 自動) */
  lastCheck: null as PobBundleCheck | null,
  checking: false,
  installing: false,
  progress: null as PobBundleProgress | null,
  error: null as string | null,
  autoCheckedThisSession: false,
});

export async function refreshPobBundleStatus(): Promise<PobBundleStatus | null> {
  if (!isTauriRuntime()) return null;
  try {
    pobBundleState.status = await invoke<PobBundleStatus>("pob_bundle_status");
  } catch (e) {
    pobBundleState.error = e instanceof Error ? e.message : String(e);
  }
  return pobBundleState.status;
}

export async function checkPobBundle(): Promise<PobBundleCheck | null> {
  if (!isTauriRuntime() || pobBundleState.checking) return null;
  pobBundleState.checking = true;
  pobBundleState.error = null;
  try {
    pobBundleState.lastCheck = await invoke<PobBundleCheck>("pob_bundle_check");
    await refreshPobBundleStatus();
    return pobBundleState.lastCheck;
  } catch (e) {
    pobBundleState.error = e instanceof Error ? e.message : String(e);
    return null;
  } finally {
    pobBundleState.checking = false;
  }
}

export async function installPobBundle(): Promise<boolean> {
  if (!isTauriRuntime() || pobBundleState.installing) return false;
  pobBundleState.installing = true;
  pobBundleState.error = null;
  pobBundleState.progress = { phase: "download", received: 0, total: 0 };
  let un: UnlistenFn | null = null;
  try {
    un = await listen<PobBundleProgress>("pob-bundle-progress", (e) => {
      pobBundleState.progress = e.payload;
    });
    pobBundleState.status = await invoke<PobBundleStatus>("pob_bundle_install");
    pobBundleState.lastCheck = null;
    return true;
  } catch (e) {
    pobBundleState.error = e instanceof Error ? e.message : String(e);
    return false;
  } finally {
    if (un) un();
    pobBundleState.installing = false;
    pobBundleState.progress = null;
  }
}

/** 起動時 1 回: 30 日空いていたら確認し、変わっていれば自動更新 */
export async function ensurePobBundleFresh(): Promise<void> {
  if (!isTauriRuntime() || pobBundleState.autoCheckedThisSession) return;
  pobBundleState.autoCheckedThisSession = true;
  const st = await refreshPobBundleStatus();
  if (!st || !st.installed) return;
  const due = (st.next_check_at ?? 0) * 1000 <= Date.now();
  if (!due) return;
  const check = await checkPobBundle();
  if (check?.update_needed) {
    console.log("[pob-bundle] 30 日経過 + 内容変更 → 自動更新");
    await installPobBundle();
  }
}
