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
 * 2026-09-24 からは**ログイン必須** (オーナー:「基本このアプリは認証ありきで仕様にしよう、どの機能も」)。
 * 「後で」は無くし、ログインするまで画面を閉じない。
 *
 * 取引履歴の画面が持っていたログイン処理を、ここに出して共有する。
 */
import { computed, ref } from "vue";
import { onLoginClosed, openLogin as openLoginWindow, sessionLoggedIn } from "../services/trade-history";
import { isTauriRuntime } from "../utils/isTauriRuntime";

/** null = まだ確かめていない */
const loggedIn = ref<boolean | null>(null);
let watching = false;
/**
 * サイトに断られた (401 / 403)。cookie は残るので「ある / 無い」だけ見ると ログイン済み のままになる
 * (オーナー 2026-09-26:「ログインしてないのか済みなのかわからん」。ログイン済みと ログインが切れています が同時に出ていた)。
 * ログインの窓を閉じるまでは未ログイン扱い
 */
let expired = false;

export const poeSession = {
  loggedIn: computed(() => loggedIn.value),
  /** ログインの画面を出すか (未ログインが確定している間ずっと。閉じる手段は無い) */
  needLogin: computed(() => loggedIn.value === false),
};

/** 今のログイン状態を確かめ直す */
export async function refreshSession(): Promise<boolean> {
  if (!isTauriRuntime()) {
    loggedIn.value = null;
    return false;
  }
  try {
    loggedIn.value = expired ? false : await sessionLoggedIn();
  } catch {
    loggedIn.value = false;
  }
  return loggedIn.value === true;
}

/** サイトがログインを受け付けなかった時に呼ぶ (ログインの画面が出る) */
export function markSessionExpired(): void {
  expired = true;
  loggedIn.value = false;
}

function afterLoginClosed(): void {
  expired = false;
  void refreshSession();
}

/** アプリ内のウィンドウで pathofexile.com を開く。閉じたら状態を取り直す */
export async function openLogin(): Promise<void> {
  if (!isTauriRuntime()) return;
  if (!watching) {
    watching = true;
    void onLoginClosed(afterLoginClosed);
  }
  await openLoginWindow();
}


/** 起動時に 1 回。ログイン状態を読んでおく (未ログインならポップアップが出る) */
export function startSessionWatch(): void {
  if (!isTauriRuntime() || watching) return;
  watching = true;
  void onLoginClosed(afterLoginClosed);
  void refreshSession();
}
