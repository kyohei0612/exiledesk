<script setup lang="ts">
/**
 * 初めて来た人の窓 (Web 版、2026-10-07)。何ができるかを 2 枚の札で選ばせ、1 行だけ補足。文字は最低限 (オーナー「活字疲れる」)。
 * 1 回閉じたら出さない (localStorage)。上の「はじめに」で開き直せる
 */
import { craftStage, SIM_LOCKED } from "../state/craft-stage";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const s = craftStage;
function pick(mode: "hand" | "sim"): void {
  s.hold(null);
  s.mode.value = mode;
  emit("close");
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 grid place-items-center bg-black/65" @click.self="emit('close')">
      <div class="w-[40rem] max-w-[calc(100vw-2rem)] rounded-xl border border-white/15 bg-[#14110d] p-5 shadow-2xl">
        <div class="mb-1 flex items-baseline gap-2">
          <b class="text-[18px] text-amber-200">ExileDesk Web</b>
          <span class="text-[12px] opacity-60">PoE2 のクラフトを、日本語のまま試す道具</span>
        </div>
        <p class="mb-4 text-[12px] opacity-60">相場は自動で入ります。取引所の検索は新しいタブで開きます。入れた物はこのブラウザに残ります。</p>
        <div class="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <button type="button" class="group rounded-xl border border-white/15 bg-black/30 p-4 text-left hover:border-amber-400/60 hover:bg-amber-500/10" @click="pick('hand')">
            <b class="block text-[15px] text-amber-100">エミュレーター</b>
            <span class="mt-1 block text-[12px] opacity-70">カレンシーやお告げを押して、1 回ずつ付く MOD を見る。動画・配信の実演にも</span>
          </button>
          <!-- Web 版のシミュレーションは調整中 (2026-10-10 オーナー) -->
          <button type="button" class="group rounded-xl border border-white/15 bg-black/30 p-4 text-left hover:border-amber-400/60 hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-white/15 disabled:hover:bg-black/30" :disabled="SIM_LOCKED" @click="pick('sim')">
            <b class="block text-[15px] text-amber-100">シミュレーター<span v-if="SIM_LOCKED" class="ml-1.5 text-[12px] font-normal">(調整中)</span></b>
            <span class="mt-1 block text-[12px] opacity-70">狙う MOD と手順を決めて 1,500 人分回し、1 個あたりの費用と運の幅を出す。手順はレシピで保存</span>
          </button>
        </div>
        <div class="mt-4 flex items-center gap-3 text-[11px] opacity-60">
          <span>取引履歴・火力チェック・取引所の自動取得は アプリ版 (近日公開) で</span>
          <button type="button" class="ml-auto rounded-lg border border-white/20 px-3 py-1 opacity-100 hover:bg-white/10" @click="emit('close')">閉じる</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
