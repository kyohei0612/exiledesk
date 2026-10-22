<!--
  RevealPanel.vue — クラフトステージの冒涜の発現 (2026-09-27、ADR-001)

  骨で付いた未発現の冒涜 MOD を、候補 3 つから選んで発現する (ゲームの「魂の井戸」と同じ)。選ぶと reveal:N の手になる。
  アビスの反響のお告げを掛けてあれば 1 回だけ引き直せる (引き直した方から選ぶと reveal:N:reroll)。
  候補は次の手の seed で引いてあるので、見せた候補と選んだ手の結果は一致する ([[craft-stage.ts]] の offers)。
  見た目はゲームの魂の井戸に合わせる (2026-10-17 オーナー「発現の UI 全部ゲーム仕様に、リロールもこの感じで、色味は冒涜の緑」):
  候補は縦に 3 つ・文は真ん中、押すと金の枠で選んだ状態、下の「発現」で発現、引き直しは右下の回る矢印。プレ / サフィ・ティアはホバーで
-->
<script setup lang="ts">
import { type StageMod, jaOfOmen, reqOfItem, planSpec } from "../../services/craft-stage/engine";
import { modText, tr } from "../../i18n/lang";
import { ref, watch } from "vue";
import { useDismiss } from "../../utils/use-dismiss";
import { craftStage } from "../../state/craft-stage";
import Icon from "../../components/ui/Icon.vue";
import { topicCur, topicStep } from "../../state/tutorial/craft-topic";

const rerolled = ref(false);
/**
 * 候補の出し直しの番号 (候補が変わった時・引き直した時に 1 つ進めて、出方のアニメーションを最初からにする)。
 * ゲームの魂の井戸と同じく、欄が一度暗くなってから候補が上から順に明るい黄緑で出て、普通の色に落ち着く。ゲームより速く (2026-10-18 オーナー「こんな遅くなくていい、もう少し早く順に」)
 */
const wave = ref(0);
watch(() => craftStage.offers.value, () => { wave.value++; });
/** 選んだ候補 (確認で発現する) */
const chosen = ref<number | null>(null);
const panel = ref<HTMLElement | null>(null);
// 選びかけは枠の外を押す・Esc で選ぶ前に戻す (確定は「発現」のボタンだけ。2026-10-22 オーナー、全部の画面の決まり)
useDismiss(() => chosen.value != null, [panel], () => { chosen.value = null; });
// 打つたびに戻す。log の長さでは見ない (Web は 50 手で古い手を消すので長さが変わらず、一度引き直すと以後ずっと「引き直した候補」のまま
// ボタンが出なかった。2026-10-16 要望 eb671189「反響を掛けていても引き直しができない時がある」)
watch(() => craftStage.log.value[craftStage.log.value.length - 1]?.out.index ?? 0, () => { rerolled.value = false; chosen.value = null; });
watch(() => craftStage.offers.value, () => { chosen.value = null; });
const left = () => { const it = craftStage.item.value; return it ? [...it.prefixes, ...it.suffixes].filter((m) => m.unrevealed).length : 0; };
/** 引き直せるか: エンジンの発現の手に掛かっているお告げの効き目 (rerolls) で決める (spec/run-spec.ts の planSpec) */
const canReroll = (): boolean => {
  const d = craftStage.data.value, it = craftStage.item.value;
  return !!d && !!it && (planSpec(d, it, "reveal:1", craftStage.omens.value)?.mods.rerolls ?? 0) > 0;
};
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
/**
 * チュートリアルの反響の手: 引き直さずに発現したらエラーで止める (2026-10-17 オーナー「リロールしなかったらお告げを使用するでエラー吐かせておk、そこだけチュートリアルっぽく」)
 */
const lessonErr = ref("");
watch(() => craftStage.offers.value, () => { lessonErr.value = ""; });
const mustReroll = (): boolean => !!topicCur.value?.step.omens?.includes("OmenofAbyssalEchoes") && topicCur.value.step.use === "reveal";
function confirm(): void {
  if (chosen.value == null) return;
  if (mustReroll() && !rerolled.value) {
    lessonErr.value = canReroll()
      ? tr("お告げを使用する: 右下の回る矢印で候補を引き直してから発現", "Use the omen: reroll the options with the arrow at the bottom right, then Reveal")
      : tr("お告げを使用する: 先に反響のお告げのボタンを押して掛ける", "Use the omen: press the Omen of Abyssal Echoes button first");
    return;
  }
  // ループの手で狙いの MOD (スピリット +50) が候補に出ている時は、それを選ばせる (2026-10-18 オーナー「それ以外の選択肢クリックはスピリット 50 を選択としてエラー」)
  const want = topicStep.value?.step.wantReveal;
  const list = rerolled.value ? craftStage.offers.value?.reroll : craftStage.offers.value?.first;
  const isWant = (m: StageMod | undefined): boolean => !!m && !!want && m.modId === want.mod && (want.value == null || m.values[0] === want.value);
  const wanted = list?.find(isWant);
  if (wanted && !isWant(list?.[chosen.value])) {
    lessonErr.value = tr(`${modText(wanted)} を選んで発現`, `Pick ${modText(wanted)} and Reveal`);
    return;
  }
  lessonErr.value = "";
  const i = chosen.value;
  chosen.value = null;
  craftStage.use(`reveal:${i + 1}${rerolled.value ? ":reroll" : ""}`);
}
function reroll(): void { rerolled.value = true; chosen.value = null; lessonErr.value = ""; wave.value++; }
</script>

<template>
  <section v-if="craftStage.offers.value && !craftStage.replay.value" ref="panel" data-reveal-panel class="g-abyss mt-5 w-[380px] max-md:w-full px-2 pb-2 pt-4">
    <!-- 題の上の緑の紋章 (アビスのお知らせの絵) -->
    <img src="/ui-art/abyss-emblem.webp" alt="" aria-hidden="true" class="pointer-events-none absolute -top-[38px] left-1/2 size-11 -translate-x-1/2 drop-shadow-[0_0_8px_rgba(120,190,60,0.5)]" />
    <!-- 出すたびに下から上へ黄緑の光が走る (ゲームはアイテムの枠が光る。ここには枠が無いので窓ごと) -->
    <span :key="`sweep-${wave}`" class="rv-sweep pointer-events-none absolute inset-0" aria-hidden="true" />
    <p class="mb-1.5 text-center font-display text-[12px] tracking-wider text-[#a9c97a] [text-shadow:0_0_6px_rgba(110,170,50,0.6)]">{{ tr("魂の井戸 — 発現する MOD を選ぶ", "Well of Souls — choose a mod to reveal") }}<span v-if="left() > 1" class="ml-1 opacity-70">{{ tr(`(未発現 残り ${left()})`, `(${left()} unrevealed left)`) }}</span></p>
    <!-- 候補は濃い黒の箱、地は少し明るく、間を空けて境目をはっきり (ゲームと同じ。2026-10-17 オーナー「境界線が分かりづらい」) -->
    <div :key="`wave-${wave}`" class="space-y-1">
      <button
        v-for="(m, i) in rerolled ? craftStage.offers.value.reroll : craftStage.offers.value.first"
        :key="`${rerolled}-${m.modId}`"
        :style="{ '--i': i }"
        type="button"
        :data-rec="`reveal:${i + 1}`"
        data-reveal-option
        class="g-plain flex w-full items-center gap-2 whitespace-normal rounded border px-2 py-1.5 text-center text-[13px] leading-snug text-[#d6dcb8] transition max-md:min-h-10"
        :class="chosen === i ? 'border-[#c9a96a] bg-black/85 shadow-[0_0_10px_rgba(201,169,106,0.35)]' : 'border-[#2e3a1e] bg-black/75 hover:border-[#6a8a3a]'"
        :title="hoverOf(m)"
        @click="chosen = i"
      >
        <!-- 左に P / S とティア (カードの行と同じ札。2026-10-17 オーナー「ティアはいる」)。右も同じ幅を空けて文を真ん中に -->
        <span class="w-8 shrink-0 text-left text-[12px] font-bold tabular-nums" :class="m.side === 'prefix' ? 'text-[#e0846a]' : 'text-[#6aa8e8]'">{{ m.side === "prefix" ? "P" : "S" }}{{ (m.tierName ?? "").replace(/^T/, "") }}</span>
        <span class="rv-text min-w-0 flex-1">{{ modText(m) }}</span>
        <span class="w-8 shrink-0" aria-hidden="true" />
      </button>
    </div>
    <p v-if="lessonErr" data-reveal-error class="mt-1.5 rounded border border-rose-400/50 bg-rose-500/15 px-2 py-1 text-center text-[12px] font-bold text-rose-200">{{ lessonErr }}</p>
    <div class="relative mt-1.5 flex items-center justify-center">
      <button type="button" data-reveal-confirm class="g-btn sm min-w-[120px] justify-center" :disabled="chosen == null" @click="confirm">{{ tr("発現", "Reveal") }}</button>
      <!-- 引き直し (アビスの反響のお告げ)。ゲームと同じく右下の回る矢印 -->
      <button
        v-if="canReroll() && !rerolled"
        type="button"
        data-rec="reveal-reroll"
        class="g-btn sm absolute right-0 !px-1.5 disabled:opacity-40"
        :title="rerolled ? tr('引き直した候補', 'Rerolled options') : tr(`${jaOfOmen('OmenofAbyssalEchoes') ?? 'アビスの反響のお告げ'}: 候補を 1 回だけ引き直す`, 'Omen of Abyssal Echoes: reroll the options once')"
        @click="reroll"
      ><Icon name="rotate" class="size-4" /></button>
    </div>
  </section>
</template>

<style scoped>
/* 候補の出方 (ゲームの魂の井戸に寄せて速く): 0.1 秒暗いまま → 上から 0.08 秒おきに明るい黄緑で出て、0.35 秒で普通の色に */
.rv-text { animation: rv-in 0.45s ease-out both; animation-delay: calc(0.1s + var(--i, 0) * 0.08s); }
@keyframes rv-in {
  0% { opacity: 0; color: #e4ff8a; text-shadow: 0 0 10px rgba(190, 255, 90, 0.9); }
  20% { opacity: 1; color: #e4ff8a; text-shadow: 0 0 10px rgba(190, 255, 90, 0.9); }
  100% { opacity: 1; color: inherit; text-shadow: none; }
}
/* 下から上へ走る黄緑の光 */
.rv-sweep { overflow: hidden; border-radius: inherit; }
.rv-sweep::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(0deg, rgba(160, 230, 70, 0) 0%, rgba(160, 230, 70, 0.28) 50%, rgba(160, 230, 70, 0) 100%);
  transform: translateY(100%); animation: rv-sweep 0.4s ease-out both;
}
@keyframes rv-sweep { from { transform: translateY(100%); } to { transform: translateY(-100%); } }
@media (prefers-reduced-motion: reduce) { .rv-text, .rv-sweep::after { animation: none; } }
</style>
