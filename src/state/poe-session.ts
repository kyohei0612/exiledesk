/**
 * poe-session.ts — pathofexile.com のログイン状態 (アプリ全体で 1 つ)
 *
 * ログインすると trade2 の枠が **倍** になる (2026-09-19 の実測: ヘッダの規則が Ip → Account,Ip に
 * 変わり、IP の 5 分枠が search 30 → 60 / fetch 50 → 100)。実際、未ログインでは 15 分 31 本で
 * 429 を踏んでいたのが、ログイン後は 15 分 60 本を投げても踏んでいない。
 * アプリの自主上限は 15 分 66 本相当なので、**未ログインだと構造的に踏む**。
 *
 * そのため、未ログインのまま使わせない (オーナー指示 2026-09-20:
 * 「未ログイン状態の場合、強制的にログインさせるようにポップアップしたら OK」)。
 *
 * 取引履歴の画面が持っていたログイン処理を、ここに出して共有する。
 */
import { computed, ref } from "vue";
import { onLoginClosed, openLogin as openLoginWindow, sessionLoggedIn } from "../services/trade-history";
import { isTauriRuntime } from "../utils/isTauriRuntime";

/** null = まだ確かめていない */
const loggedIn = ref<boolean | null>(null);
/** 「後で」を押した = このまま起動中は催促しない */
const dismissed = ref(false);
let watching = false;

export const poeSession = {
  loggedIn: computed(() => loggedIn.value),
  /** ログインを促す画面を出すか (未ログインが確定していて、まだ「後で」を押していない) */
  needLogin: computed(() => loggedIn.value === false && !dismissed.value),
};

/** 今のログイン状態を確かめ直す */
export async function refreshSession(): Promise<boolean> {
  if (!isTauriRuntime()) {
    loggedIn.value = null;
    return false;
  }
  try {
    loggedIn.value = await sessionLoggedIn();
  } catch {
    loggedIn.value = false;
  }
  return loggedIn.value === true;
}

/** アプリ内のウィンドウで pathofexile.com を開く。閉じたら状態を取り直す */
export async function openLogin(): Promise<void> {
  if (!isTauriRuntime()) return;
  if (!watching) {
    watching = true;
    void onLoginClosed(() => void refreshSession());
  }
  await openLoginWindow();
}

/** 「後で」= この起動の間は催促しない */
export function dismissLoginPrompt(): void {
  dismissed.value = true;
}

/** 起動時に 1 回。ログイン状態を読んでおく (未ログインならポップアップが出る) */
export function startSessionWatch(): void {
  if (!isTauriRuntime() || watching) return;
  watching = true;
  void onLoginClosed(() => void refreshSession());
  void refreshSession();
}
