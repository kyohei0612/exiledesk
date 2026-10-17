<!--
  RevealPanel.vue — クラフトステージの冒涜の発現 (2026-09-27、ADR-001)

  骨で付いた未発現の冒涜 MOD を、候補 3 つから選んで発現する (ゲームの「魂の井戸」と同じ)。選ぶと reveal:N の手になる。
  アビスの反響のお告げを掛けてあれば 1 回だけ引き直せる (引き直した方から選ぶと reveal:N:reroll)。
  候補は次の手の seed で引いてあるので、見せた候補と選んだ手の結果は一致する ([[craft-stage.ts]] の offers)。
  見た目はゲームの魂の井戸に合わせる (2026-10-17 オーナー「発現の UI 全部ゲーム仕様に、リロールもこの感じで、色味は冒涜の緑」):
  候補は縦に 3 つ・文は真ん中、押すと金の枠で選んだ状態、下の「発現」で発現、引き直しは右下の回る矢印。プレ / サフィ・ティアはホバーで
-->
<script setup lang="ts">
import { modText, tr } from "../../i18n/lang";
import { ref, watch } from "vue";
import { craftStage } from "../../state/craft-stage";
import { jaOfOmen } from "../../services/htc/labels";
import { reqOfItem } from "../../services/craft-stage/stage-bases";
import type { StageMod } from "../../services/craft-stage/types";
import Icon from "../../components/ui/Icon.vue";

const rerolled = ref(false);
/** 選んだ候補 (確認で発現する) */
const chosen = ref<number | null>(null);
// 打つたびに戻す。log の長さでは見ない (Web は 50 手で古い手を消すので長さが変わらず、一度引き直すと以後ずっと「引き直した候補」のまま
// ボタンが出なかった。2026-10-16 要望 eb671189「反響を掛けていても引き直しができない時がある」)
watch(() => craftStage.log.value[craftStage.log.value.length - 1]?.out.index ?? 0, () => { rerolled.value = false; chosen.value = null; });
watch(() => craftStage.offers.value, () => { chosen.value = null; });
const left = () => { const it = craftStage.item.value; return it ? [...it.prefixes, ...it.suffixes].filter((m) => m.unrevealed).length : 0; };
const canReroll = () => craftStage.omens.value.includes("OmenofAbyssalEchoes");
/**
 * 選ぶと要求レベルが上がる候補は、乗せた時にその数字を出す (2026-10-10 オーナー「要求レベル出すのやっとこか」→「候補に出すのは邪魔、ホバーで」: 冒涜専用の MOD はアイテムレベルに関わらず T1 まで出て、
 * レベル上げ中の装備が着けられなくなる。reddit「Preserved rib can roll T1 mod on lower ilvl」)。決まりはアイテムのカードと同じ reqOfItem (MOD レベル × 0.8)
 */
function raisesTo(m: StageMod): number | null {
  const it = craftStage.item.value;
  if (!it) return null;
  const now = reqOfItem(it)?.level ?? 0;
  const need = Math.floor(m.modLevel * 0.8);
  return need > now ? need : null;
}
const nowReq = (): number => { const it = craftStage.item.value; return it ? reqOfItem(it)?.level ?? 0 : 0; };
/** ホバーの札: プレ / サフィ・ティア (・要求レベルが上がる時はその数字) */
function hoverOf(m: StageMod): string {
  const side = m.side === "prefix" ? tr("プレフィックス", "Prefix") : tr("サフィックス", "Suffix");
  const up = raisesTo(m);
  return [`${side} ${m.tierName}`, up ? tr(`選ぶと要求 Lv ${up} に上がる (今 Lv ${nowReq()})`, `Raises requirement to Level ${up} (now ${nowReq()})`) : ""].filter(Boolean).join(" · ");
}
function confirm(): void {
  if (chosen.value == null) return;
  const i = chosen.value;
  chosen.value = null;
  craftStage.use(`reveal:${i + 1}${rerolled.value ? ":reroll" : ""}`);
}
function reroll(): void { rerolled.value = true; chosen.value = null; }
</script>

<template>
  <section v-if="craftStage.offers.value && !craftStage.replay.value" data-reveal-panel class="w-[380px] max-md:w-full rounded-md border border-[#3d4a2a] bg-[#1a1913] px-3 py-2 shadow-[0_0_24px_rgba(0,0,0,0.7),inset_0_0_30px_rgba(60,90,30,0.12)]">
    <p class="mb-1.5 text-center text-[11px] text-[#9fb57a]">{{ tr("魂の井戸 — 発現する MOD を選ぶ", "Well of Souls — choose a mod to reveal") }}<span v-if="left() > 1" class="ml-1 opacity-70">{{ tr(`(未発現 残り ${left()})`, `(${left()} unrevealed left)`) }}</span></p>
    <!-- 候補は濃い黒の箱、地は少し明るく、間を空けて境目をはっきり (ゲームと同じ。2026-10-17 オーナー「境界線が分かりづらい」) -->
    <div class="space-y-1">
      <button
        v-for="(m, i) in rerolled ? craftStage.offers.value.reroll : craftStage.offers.value.first"
        :key="`${rerolled}-${m.modId}`"
        type="button"
        :data-rec="`reveal:${i + 1}`"
        data-reveal-option
        class="g-plain flex w-full items-center gap-2 whitespace-normal rounded border px-2 py-1.5 text-center text-[13px] leading-snug text-[#d6dcb8] transition max-md:min-h-10"
        :class="chosen === i ? 'border-[#c9a96a] bg-[#050504] shadow-[0_0_10px_rgba(201,169,106,0.35)]' : 'border-[#2c2b22] bg-[#050504] hover:border-[#5a6a3a]'"
        :title="hoverOf(m)"
        @click="chosen = i"
      >
        <!-- 左に P / S とティア (カードの行と同じ札。2026-10-17 オーナー「ティアはいる」)。右も同じ幅を空けて文を真ん中に -->
        <span class="w-8 shrink-0 text-left text-[12px] font-bold tabular-nums" :class="m.side === 'prefix' ? 'text-[#e0846a]' : 'text-[#6aa8e8]'">{{ m.side === "prefix" ? "P" : "S" }}{{ (m.tierName ?? "").replace(/^T/, "") }}</span>
        <span class="min-w-0 flex-1">{{ modText(m) }}</span>
        <span class="w-8 shrink-0" aria-hidden="true" />
      </button>
    </div>
    <div class="relative mt-1.5 flex items-center justify-center">
      <button type="button" data-reveal-confirm class="g-btn sm min-w-[120px] justify-center" :disabled="chosen == null" @click="confirm">{{ tr("発現", "Reveal") }}</button>
      <!-- 引き直し (アビスの反響のお告げ)。ゲームと同じく右下の回る矢印 -->
      <button
        v-if="canReroll()"
        type="button"
        data-rec="reveal-reroll"
        class="g-btn sm absolute right-0 !px-1.5 disabled:opacity-40"
        :disabled="rerolled"
        :title="rerolled ? tr('引き直した候補', 'Rerolled options') : tr(`${jaOfOmen('OmenofAbyssalEchoes') ?? 'アビスの反響のお告げ'}: 候補を 1 回だけ引き直す`, 'Omen of Abyssal Echoes: reroll the options once')"
        @click="reroll"
      ><Icon name="rotate" class="size-4" /></button>
    </div>
  </section>
</template>
