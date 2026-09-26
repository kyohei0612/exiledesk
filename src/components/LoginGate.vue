<!--
  LoginGate.vue — 未ログインの時に出すポップアップ

  ログインすると trade2 の枠が倍になる (実測: 未ログインは 15 分 31 本で 429、ログイン後は
  15 分 60 本でも踏まない)。アプリの巡回はログイン前提の速さで流すので、未ログインのままだと
  すぐレート制限に当たる。

  オーナー指示 2026-09-20:「未ログイン状態の場合、強制的にログインさせるようにポップアップしたら OK」。
  2026-09-24 からログイン必須。「後で」は無し。ログインするまで閉じない。
  2026-09-26: 「ログインしてないのか済みなのかわからん」→ 手順を 3 行に、窓を開いている間は「待っています」を出す。
  ログインの窓はログインが済むと自分で閉じる (trade_history.rs)。ログインは普段のブラウザではなくアプリ内の窓
  (普段のブラウザのログイン状態はアプリから読めないため。オーナーと相談して窓のまま)。
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
    <BaseCard class="max-w-md mx-6">
      <div class="p-5 pl-6">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-[11px] px-2 py-0.5 rounded border border-amber-300/60 text-amber-300">● 未ログイン</span>
          <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">pathofexile.com にログイン</h2>
        </div>

        <ol class="text-[13px] leading-relaxed text-[var(--exile-color-text-primary)] space-y-1 list-decimal pl-5">
          <li>下の「ログインする」を押す</li>
          <li>開いた窓でいつも通りログイン</li>
          <li>終わると窓は自動で閉じ、この画面も消えます</li>
        </ol>

        <div class="flex items-center gap-3 mt-4">
          <button
            type="button"
            :disabled="busy"
            class="px-4 py-1.5 rounded border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-elevated)] font-display tracking-[0.06em] text-[var(--exile-color-accent-focus)] hover:brightness-110 disabled:opacity-40"
            @click="login"
          >
            {{ poeSession.loginOpen.value ? "ログインの窓を前に出す" : "ログインする" }}
          </button>
          <span v-if="poeSession.loginOpen.value" class="text-[12px] text-[var(--exile-color-text-secondary)]">ログインを待っています…</span>
        </div>

        <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-4 leading-relaxed">
          ログインすると取引所の取得枠がおよそ倍になります。ログイン状態はアプリ内にだけ残り、ファイルには保存しません。
          閉じない時は
          <button type="button" class="underline hover:text-[var(--exile-color-text-secondary)]" @click="refreshSession()">状態を確認</button>
        </p>
      </div>
    </BaseCard>
  </div>
</template>
