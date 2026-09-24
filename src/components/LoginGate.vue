<!--
  LoginGate.vue — 未ログインの時に出すポップアップ

  ログインすると trade2 の枠が倍になる (実測: 未ログインは 15 分 31 本で 429、ログイン後は
  15 分 60 本でも踏まない)。アプリの巡回はログイン前提の速さで流すので、未ログインのままだと
  すぐレート制限に当たる。そのため起動時に 1 回、前に出して促す。

  オーナー指示 2026-09-20:「未ログイン状態の場合、強制的にログインさせるようにポップアップしたら OK」。
  2026-09-24 からログイン必須 (オーナー:「基本このアプリは認証ありきで仕様にしよう、どの機能も」)。
  「後で」は無し。ログインするまで閉じない。ログイン窓を閉じると状態を取り直す (「状態を確認」でも取り直せる)。
-->
<script setup lang="ts">
import { ref } from "vue";
import BaseCard from "./decor/BaseCard.vue";
import { openLogin, poeSession, refreshSession } from "../state/poe-session";

const busy = ref(false);
async function login(): Promise<void> {
  busy.value = true;
  try {
    await openLogin();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div
    v-if="poeSession.needLogin.value"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-[1px]"
  >
    <BaseCard class="max-w-lg mx-6">
      <div class="p-5 pl-6">
        <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base mb-2">
          pathofexile.com にログインしてください
        </h2>
        <p class="text-[13px] leading-relaxed text-[var(--exile-color-text-secondary)]">
          ログインすると公式が許す取得の枠が<span class="text-[var(--exile-color-text-primary)]">およそ倍</span>になります。
          未ログインのままだと相場の取得がすぐレート制限に当たり、売値も捌き速度も取れなくなります。
          ExileDesk はログインしてから使う作りです (ログインするまでこの画面は閉じません)。
        </p>
        <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-2 leading-relaxed">
          実測 (2026-09-19): 未ログインは 15 分あたり 31 回で制限、ログイン後は 60 回投げても制限なし。
          ログインは ExileDesk が開く pathofexile.com の画面で本人が行います。ログイン状態はアプリ内のブラウザにだけ残り、
          ExileDesk はファイルに保存しません。
        </p>
        <div class="flex items-center gap-3 mt-4">
          <button
            type="button"
            :disabled="busy"
            class="px-4 py-1.5 rounded border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-elevated)] font-display tracking-[0.06em] text-[var(--exile-color-accent-focus)] hover:brightness-110 disabled:opacity-40"
            @click="login"
          >
            {{ busy ? "ログイン画面を開いています…" : "ログインする" }}
          </button>
          <button
            type="button"
            class="text-[11px] underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-text-secondary)]"
            title="ログインしたのに閉じない時に、状態を読み直します"
            @click="refreshSession()"
          >
            ログインした (状態を確認)
          </button>
        </div>
      </div>
    </BaseCard>
  </div>
</template>
