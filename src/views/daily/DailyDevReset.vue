<!--
  DailyDevReset.vue — 開発版だけのリセット (D-37h)。DailyPage が import.meta.env.DEV の時だけ読むので本番の塊に入らない。
  確かめの窓 → 端末の控えを消して新しい名前 (dev + 数字) で入り直す。サーバーの前の挑戦は残る (全部消すのは --fresh)
-->
<script setup lang="ts">
import { ref } from "vue";
import ModalShell from "../../components/ui/ModalShell.vue";
import { devResetLocal } from "./daily-api";

const open = ref(false);
const busy = ref(false);
const fail = ref("");
function ask(): void { fail.value = ""; open.value = true; }
async function reset(): Promise<void> {
  busy.value = true;
  fail.value = "";
  const r = await devResetLocal();
  busy.value = false;
  if (typeof r !== "string") { open.value = false; return; }
  fail.value = r === "busy" ? "名前を作れるのは 1 時間 5 つまで。pnpm dev:daily-api -- --fresh で立て直してから押す" : r === "net" ? "手元のデイリーのサーバー (8797) につながらない。pnpm dev:daily-api を立てる" : `名前を作れなかった (${r})。もう一度押す`;
}
</script>

<template>
  <div data-daily-dev-reset class="daily-clock">
    <p><button type="button" class="g-btn sm" data-daily-dev-reset-open @click="ask">開発: リセット</button><span>開発版だけ。控えを消して新しい名前で入り直し、今日の挑戦を始め直す</span></p>
    <ModalShell :open="open" title="開発: デイリーをリセット" width="w-[420px] max-w-[94vw]" @close="open = false">
      <div class="flex flex-col gap-3 p-4 text-[14px]">
        <p>この端末の控え (名前・挑戦・木・投稿) を消し、新しい名前 (dev + 数字) で入り直す。今日の挑戦を「1 時間の挑戦を始める」から始め直せる。前の名前の挑戦は手元のサーバーに残る。</p>
        <p v-if="fail" data-daily-dev-reset-fail class="text-[var(--exile-color-signal-down)]">{{ fail }}</p>
        <div class="flex justify-end gap-2">
          <button type="button" class="g-btn" @click="open = false">やめる</button>
          <button type="button" class="g-btn-red" data-daily-dev-reset-ok :disabled="busy" @click="reset">{{ busy ? "消している" : "リセット" }}</button>
        </div>
      </div>
    </ModalShell>
  </div>
</template>
