<!--
  LoginGate.vue — 未ログインの時に出すポップアップ

  ログインすると trade2 の枠が倍になる (実測: 未ログインは 15 分 31 本で 429、ログイン後は
  15 分 60 本でも踏まない)。アプリの巡回はログイン前提の速さで流すので、未ログインのままだと
  すぐレート制限に当たる。そのため起動時に 1 回、前に出して促す。

  オーナー指示 2026-09-20:「未ログイン状態の場合、強制的にログインさせるようにポップアップしたら OK」。
  使えなくはしない (「後で」でこの起動の間は閉じられる)。
-->
<script setup lang="ts">
import { ref } from "vue";
import BaseCard from "./decor/BaseCard.vue";
import { dismissLoginPrompt, openLogin, poeSession } from "../state/poe-session";

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
            title="このまま使えますが、取得はすぐレート制限に当たります (次の起動でまた出ます)"
            @click="dismissLoginPrompt"
          >
            後で (枠が半分のまま使う)
          </button>
        </div>
      </div>
    </BaseCard>
  </div>
</template>
