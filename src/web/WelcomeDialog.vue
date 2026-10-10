<script setup lang="ts">
/**
 * 初めて来た人の窓 (Web 版、2026-10-07)。何ができるかを 2 枚の札で選ばせ、1 行だけ補足。文字は最低限 (オーナー「活字疲れる」)。
 * 1 回閉じたら出さない (localStorage)。上の「はじめに」で開き直せる
 */
import { craftStage, SIM_LOCKED } from "../state/craft-stage";
import { tr } from "../i18n/lang";
import ModalShell from "../components/ui/ModalShell.vue";

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
  <!-- 窓の動き・枠は ModalShell (2026-10-10 オーナー「動きが統一されてない所」: 自前の地 → .g-panel) -->
  <ModalShell :open="open" title="ExileDesk Web" width="w-[40rem] max-w-full" body-class="px-4 py-3" @close="emit('close')">
    <template #header>
      <span class="text-[12px] opacity-60">{{ tr("PoE2 のクラフトを、日本語のまま試す道具", "Try out PoE2 crafting in your browser") }}</span>
    </template>
    <p class="mb-4 text-[12px] opacity-60">{{ tr("相場は自動で入ります。取引所の検索は新しいタブで開きます。入れた物はこのブラウザに残ります。", "Market prices load automatically. Trade site searches open in a new tab. What you enter is saved in this browser.") }}</p>
    <div class="grid grid-cols-2 gap-3 max-md:grid-cols-1">
      <button type="button" class="group rounded-xl border border-white/15 bg-black/30 p-4 text-left hover:border-amber-400/60 hover:bg-amber-500/10" @click="pick('hand')">
        <b class="block text-[15px] text-amber-100">{{ tr("エミュレーター", "Emulator") }}</b>
        <span class="mt-1 block text-[12px] opacity-70">{{ tr("カレンシーやお告げを押して、1 回ずつ付く MOD を見る。動画・配信の実演にも", "Click currency and omens to see which mods roll, one step at a time. Great for videos and streams too") }}</span>
      </button>
      <!-- Web 版のシミュレーションは調整中 (2026-10-10 オーナー) -->
      <button type="button" class="group rounded-xl border border-white/15 bg-black/30 p-4 text-left hover:border-amber-400/60 hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-white/15 disabled:hover:bg-black/30" :disabled="SIM_LOCKED" @click="pick('sim')">
        <b class="block text-[15px] text-amber-100">{{ tr("シミュレーター", "Simulator") }}<span v-if="SIM_LOCKED" class="ml-1.5 text-[12px] font-normal">{{ tr("(調整中)", "(WIP)") }}</span></b>
        <span class="mt-1 block text-[12px] opacity-70">{{ tr("狙う MOD と手順を決めて 1,500 人分回し、1 個あたりの費用と運の幅を出す。手順はレシピで保存", "Pick target mods and steps, run 1,500 attempts, and get the cost per item and the luck range. Save steps as recipes") }}</span>
      </button>
    </div>
    <template #footer>
      <span class="text-[11px] opacity-60">{{ tr("取引履歴・火力チェック・取引所の自動取得は アプリ版 (近日公開) で", "Trade history, DPS check and automatic trade site lookups are coming in the desktop app") }}</span>
      <button type="button" class="g-btn sm ml-auto" @click="emit('close')">{{ tr("閉じる", "Close") }}</button>
    </template>
  </ModalShell>
</template>
