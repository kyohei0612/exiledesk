<!--
  StageSettings.vue — クラフトステージの設定と操作の欄 (ベース・アイテムレベル・シミュレーターの始め方・白に戻す・1 手戻す・手順の書き出し・取引所)。
  CraftStage.vue から分けた (2026-10-16、500 行の決まり)
-->
<script setup lang="ts">
import { inGroup } from "../../services/mods/item-classes";
import { useFlash } from "../../utils/use-flash";
import { ARMED_CLASS, useArmed } from "../../utils/use-armed";
import { tr } from "../../i18n/lang";
import { SIM_LOCKED } from "../../state/craft-stage";
import { inLesson } from "../../state/craft-lesson";
import StageRecipeStart from "./StageRecipeStart.vue";
import { isTauriRuntime } from "../../utils/isTauriRuntime";
import { computed, ref, watch } from "vue";
import { useStageBase } from "./use-stage-base";
import StageBasePicker from "./StageBasePicker.vue";
import { PAGES_ON, basePage } from "../../state/web-page";
import { craftStage } from "../../state/craft-stage";
import pkg from "../../../package.json";
import { socketCapOf } from "../../services/craft-stage/stage-runes";
import { ITEM_LEVEL_SET, itemLevelKey } from "../../services/craft-stage/apply-currency";
import HelpTip from "../../components/ui/HelpTip.vue";
import { searchModGroups, type ModGroup } from "../../services/craft-stage/trade-search";

defineProps<{ phone: boolean }>();
const s = craftStage;
const inApp = isTauriRuntime();
const { handNoBase, simNoBase, pickSimBase, startFromRecipe } = useStageBase();
/** 道具の帯のボタン (ゲームの 3 枚ボタン、src/styles/game-ui.css) */
const btn = "g-btn sm";
/**
 * アイテムレベル: よく使う 3 つはボタン、70〜86 は 1 ずつプルダウン (2026-10-18 オーナー「トレードで 78 やら 76 やら 79 やらいろいろある」「45・75・82 だけ出して、70 から 86 は 1 ずつ」)
 */
const ILVLS = [45, 75, 82];
const ILVL_LIST = Array.from({ length: 17 }, (_, i) => 70 + i);
/** 今のアイテムレベル (エミュレーターは打った手で変わるのでアイテムの値) */
const curIlvl = computed(() => (s.mode.value === "hand" ? s.item.value?.itemLevel : null) ?? s.itemLevel.value);
/**
 * 変えた時: 打つ前 (手も始めの MOD も無い) とシミュレーターは今まで通り白から。エミュレーターで打ち始めた後は 1 手にして、
 * そのレベルで付かない段の MOD だけ消す (2026-10-18 オーナー「全部やり直しになるのもおかしい」。apply-currency の ilvl:)。続けて変えた分は 1 手にまとめる
 */
function setIlvl(lv: number): void {
  if (s.mode.value === "sim") s.simIlvlOk.value = true;
  if (lv === curIlvl.value) return;
  if (s.mode.value !== "hand" || (!s.log.value.length && !s.startMods.value.length)) { s.itemLevel.value = lv; s.reset(); return; }
  const last = s.log.value[s.log.value.length - 1];
  if (last && last.out.currency.startsWith(ITEM_LEVEL_SET)) s.undo();
  if (lv !== curIlvl.value) s.use(itemLevelKey(lv));
}
const jewelBase = computed(() => !!s.item.value && inGroup(s.item.value.cls.category, "jewel"));
/** JSON をコピー (POE2Tube に渡す / CLI の --prices に使う) */
const copyNote = useFlash();
const copied = copyNote.msg;
async function copy(label: string, v: unknown): Promise<void> {
  try {
    await navigator.clipboard.writeText(JSON.stringify(v, null, 2));
    copyNote.flash(tr(`${label}をコピーしました`, `Copied ${label}`));
  } catch {
    copyNote.flash(tr("コピーできませんでした", "Copy failed"));
  }
}
/** 手で打つ画面の今のアイテムの MOD 群 (未発現は除く。固定・冒涜も同じ条件で、種類は問わない) */
const stageModGroups = computed<ModGroup[]>(() => {
  const it = s.item.value;
  if (!it) return [];
  return [...it.prefixes, ...it.suffixes].filter((m) => !m.unrevealed).map((m) => ({ picks: [{ modId: m.modId, minTierIndex: m.tierIndex }] }));
});
/**
 * ベース・アイテムレベル・ソケットも合わせるか (取引所の左の欄。既定はオフ、前の選択を覚える)。
 * 2026-10-14 要望 0ce15a82「条件指定がうまくいっていない、価格を調べるのが難しい」→ オーナー「取引所の横にチェックボックス付けとくか」
 */
const TRADE_BASE_KEY = "exiledesk.stage.tradeWithBase";
const tradeWithBase = ref((() => { try { return localStorage.getItem(TRADE_BASE_KEY) === "1"; } catch { return false; } })());
watch(tradeWithBase, (v) => { try { localStorage.setItem(TRADE_BASE_KEY, v ? "1" : "0"); } catch { /* 覚えられなくても動く */ } });
async function searchStageMods(): Promise<void> {
  const d = s.data.value, it = s.item.value;
  // MOD は各 MOD の段の下限まで、普通 / フラクチャー / 冒涜のどれでも (2026-10-08 オーナー「ティアだけは下限でおｋ」)。
  // ベース・アイテムレベル・ソケットはチェックを入れた時だけ (2026-10-08「ベースからベースレベルからなにから」→ 10-14 選べるように)
  if (!d || !it || !stageModGroups.value.length) return;
  await searchModGroups(d, { groups: stageModGroups.value, minValues: true, ...(tradeWithBase.value ? { exact: { baseType: it.base, ...(jewelBase.value ? {} : { ilvlMin: it.itemLevel }), socketsMin: it.sockets ?? 0 } } : {}) });
}
/** シミュレーションのソケットの上限 (熟練工の上限と、その + 1 = 規格外) */
const simCraftCap = computed(() => (s.item.value ? socketCapOf(s.base.value, s.item.value.cls.category) : 0));
const simSocketCap = computed(() => (simCraftCap.value > 0 ? simCraftCap.value + 1 : 0));
/** 白に戻す (2 回押し。2026-10-10 動きの揃え 7: utils/use-armed.ts) */
const resetArm = useArmed();
function armReset(): void {
  if (resetArm.arm()) s.reset();
}
/** クイズのレシピの再生 (n 手まで。完成・答え無し・打てない手で止まる) */
const quizNote = ref("");
function quizStep(n: number): void {
  s.hold(null);
  let r = { done: false, stop: false, text: "" }, k = 0;
  for (; k < n && !r.stop; k++) r = s.recipeStep();
  quizNote.value = n > 1 && !r.done ? `${r.text} (${tr(`${k} 手`, `${k} steps`)})` : r.text;
}
function simFromHand(): void {
  const it = s.item.value;
  if (!it) return;
  s.simStartItem.value = { ...it, prefixes: it.prefixes.map((m) => ({ ...m })), suffixes: it.suffixes.map((m) => ({ ...m })) };
  s.simStartCost.value = s.total.value;
  // 付いている MOD は狙いに入れておく (その段以上。消えたら取り直す)。足したい MOD を 2 で足して決めたら、そのままツリー (3〜5 は飛ばす)
  s.simTargets.value = [...it.prefixes, ...it.suffixes].filter((m) => !m.unrevealed).map((m) => ({ modId: m.modId, minTierIndex: m.tierIndex, ...(m.fractured ? { method: "fracture" as const } : m.desecrated ? { method: "desecrate" as const } : {}) }));
  s.simOrder.value = [];
  s.simPatterns.value = [{ name: "パターン 1", steps: [], quiz: { v: 3, rules: {} } }];
  s.simSockets.value = it.sockets ?? 0;
  s.simStart.value = "item";
  s.simPicked.value = true;
  s.simIlvlOk.value = true; // エミュレーターのアイテムレベルのまま
  s.mode.value = "sim";
}
</script>

<template>
  <!-- 設定と操作 -->
  <!-- data-craft-top: クラフトの位置 (「クラフトへ」とベースを選んだ後はここの外枠の少し上。2026-10-10 オーナー「ベースの上枠の外枠から少し上空けた位置が心地いい」) -->
  <section v-if="!s.replay.value && s.mode.value !== 'tutorial' && !inLesson" data-stage-settings data-craft-top data-rec-part="settings" class="g-panel mb-4 scroll-mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-2 py-1 text-[12px]">
    <!-- ベース (押すと種類 → ベースのカードが開く。StageBasePicker.vue) -->
    <span v-if="s.mode.value === 'sim'" class="flex items-center gap-2.5">
      <span class="grid size-6 place-items-center rounded-full text-[12px] font-bold" :class="simNoBase ? 'bg-[var(--exile-color-accent-focus)] text-black' : 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40'">{{ simNoBase ? 1 : "✓" }}</span>
      <h3 class="text-[15px] font-bold text-[var(--exile-color-text-primary)]">{{ tr("ベース", "Base") }}</h3>
      <HelpTip :text="tr('作るアイテムの種類 (ベース) とアイテムレベル (とソケット)。アイテムレベルを選ぶと 2 狙う MOD へ進む。始め方は狙う MOD を決めた後', 'The item type (base) and item level (and sockets). Choosing an item level moves on to step 2 (Target mods). How to start is chosen after the target mods')" />
    </span>
    <!-- ベースを選ぶ前は、保存したレシピから始めるのを先に (2026-10-09 オーナー「ここの時点でレシピとかの選択させるような UI じゃないと」) -->
    <StageRecipeStart v-if="s.mode.value === 'sim' && simNoBase" class="mb-1 border-b border-white/10 pb-3" @start="startFromRecipe" />
    <StageBasePicker :base="s.base.value" :data="s.data.value" :unpicked="simNoBase || (s.mode.value === 'hand' && handNoBase)" :page="PAGES_ON" @pick="pickSimBase" @open-page="s.hold(null); basePage = true" />
    <span v-if="!simNoBase && !(s.mode.value === 'hand' && handNoBase) && !jewelBase" class="flex items-center gap-1">
      <span class="mr-1 whitespace-nowrap text-[12px] text-[var(--exile-color-text-secondary)]">{{ phone ? "iLv" : tr("アイテムレベル", "Item Level") }}</span>
      <button v-for="lv in ILVLS" :key="lv" type="button" class="g-tab !min-h-[30px] !px-3 tabular-nums max-md:!min-h-10" :class="curIlvl === lv && (s.mode.value !== 'sim' || s.simIlvlOk.value) ? 'on' : ''" @click="setIlvl(lv)">{{ lv }}</button>
      <select data-ilvl-select class="h-[30px] cursor-pointer rounded border bg-black/60 px-1.5 tabular-nums max-md:h-10" :class="ILVLS.includes(curIlvl) ? 'border-white/15 text-white/60' : 'border-amber-300/70 text-amber-100'" :value="ILVLS.includes(curIlvl) ? '' : curIlvl" :aria-label="tr('アイテムレベル (70〜86)', 'Item level (70–86)')" @change="setIlvl(Number(($event.target as HTMLSelectElement).value))">
        <option value="" disabled>{{ tr("70〜86", "70–86") }}</option>
        <option v-if="!ILVLS.includes(curIlvl) && !ILVL_LIST.includes(curIlvl)" :value="curIlvl">{{ curIlvl }}</option>
        <option v-for="lv in ILVL_LIST" :key="lv" :value="lv">{{ lv }}</option>
      </select>
      <span v-if="s.mode.value === 'sim' && !s.simIlvlOk.value" class="ml-1 font-semibold text-amber-200">{{ tr("← アイテムレベルを選ぶ", "← Choose an item level") }}</span>
    </span>
    <!-- シミュレーション: 白のベースのソケットの数 (規格外 = 熟練工の上限 + 1 まで) -->
    <span v-if="s.mode.value === 'sim' && !simNoBase && s.simIlvlOk.value && simSocketCap > 0" class="flex items-center gap-1">
      <span class="mr-1 text-[12px] text-[var(--exile-color-text-secondary)]">{{ tr("ソケット", "Sockets") }}</span>
      <button v-for="n in simSocketCap + 1" :key="n" type="button" class="g-tab !min-h-[30px] !px-3 tabular-nums max-md:!min-h-10" :class="s.simSockets.value === n - 1 ? 'on' : ''" @click="s.simSockets.value = n - 1">{{ n - 1 }}<span v-if="n - 1 > simCraftCap" class="ml-1 text-[11px] text-[var(--exile-color-text-tertiary)]" :title="tr('熟練工のオーブの上限より多い (規格外の品だけ)', 'Above the Artificer’s Orb limit (Exceptional items only)')">{{ tr("規格外", "Exceptional") }}</span></button>
      <span v-if="s.simSockets.value == null" class="text-amber-200/80">{{ tr("ソケットの数を選ぶ", "Choose socket count") }}</span>
    </span>
    <!-- 始め方は狙う MOD を決めた後の段へ (SimStartPick.vue、2026-10-18) -->
    <template v-if="s.mode.value === 'hand' && !handNoBase">
    <!-- 白に戻すは 1 手戻すでは戻せないので 2 回押し (2026-10-08 完成判定: 9 手分が確認無しで消えた) -->
    <button type="button" data-rec="reset" :class="resetArm.is() ? ARMED_CLASS : btn" :disabled="!s.log.value.length && !s.startMods.value.length" @click="armReset">{{ resetArm.is() ? tr("もう一度押すと白に戻す", "Click again to reset") : tr("白に戻す", "Reset") }}</button>
    <button type="button" data-rec="undo" :class="btn" :disabled="!s.log.value.length && !s.startMods.value.length" :title="tr('R / Ctrl+Z (まだ打っていない時は始めの MOD を 1 つ外す)', 'R / Ctrl+Z (before any use, removes one starting mod)')" @click="s.undo()">{{ tr("1 手戻す", "Undo") }}</button>
    <!-- クイズのレシピを 1 手ずつ / 最後まで再生 (ADR-003)。打ち方はシミュレーターと同じ答え -->
    <template v-if="s.handQuiz.value && !SIM_LOCKED">
      <button type="button" :class="btn" :title="tr('シミュレーターのクイズの答えで、今のアイテムに 1 手打つ', 'Use one step from the Simulator quiz answers on the current item')" @click="quizStep(1)">{{ tr("レシピで 1 手", "Recipe: 1 step") }}</button>
      <button type="button" :class="btn" :title="tr('完成か、答えの無い状態まで打つ (500 手まで)', 'Use steps until done or no answer (up to 500)')" @click="quizStep(500)">{{ tr("最後まで", "To the end") }}</button>
      <span v-if="quizNote" class="text-[12px] text-[var(--exile-color-text-secondary)]">{{ quizNote }}</span>
    </template>
    <!-- 今のアイテムをそのままシミュレーションの始めの状態に (2026-10-08) -->
    <button v-if="!SIM_LOCKED" type="button" :class="btn" :title="tr('今のアイテム (付いている MOD・固定・ソケット) を始めの状態にしてシミュレーターへ。ベース代は エミュレーターの累計 + 白ベース代', 'Send the current item (mods, fractured, sockets) to the Simulator as the start. Base cost = Emulator total + white base cost')" @click="simFromHand">{{ tr("この状態からシミュレーター →", "Simulate from here →") }}</button>
    <button v-if="inApp" type="button" :class="btn" class="max-md:hidden" :disabled="!s.log.value.length" :title="tr('打った手を 16:9 の撮影用画面で 1 手ずつ再生 (Space 再生 / ← → 1 手 / Esc 閉じる)', 'Replay each step on a 16:9 recording screen (Space play / ← → step / Esc close)')" @click="s.hold(null); s.video.value = { from: 0, autoplay: false, controls: true }">{{ tr("動画モード", "Video mode") }}</button>
    <span class="ml-auto flex flex-wrap items-center gap-1.5">
      <span v-if="copied" class="text-emerald-300">{{ copied }}</span>
      <button v-if="inApp" type="button" :class="btn" class="max-md:hidden" :disabled="!s.log.value.length" :title="tr('今までの手を手順 JSON に (同じ seed なので craft-stage-run.mjs に流すと同じ結果)', 'Steps so far as plan JSON (same seed, so craft-stage-run.mjs gives the same result)')" @click="copy(tr('手順 JSON', 'plan JSON'), s.plan())">{{ tr("手順 JSON", "Plan JSON") }}</button>
      <button v-if="inApp" type="button" :class="btn" class="max-md:hidden" :disabled="!s.log.value.length" :title="tr('POE2Tube に渡す結果 JSON (今の相場の値段で)', 'Result JSON for POE2Tube (at current market prices)')" @click="copy(tr('結果 JSON', 'result JSON'), s.result(pkg.version))">{{ tr("結果 JSON", "Result JSON") }}</button>
      <button v-if="inApp" type="button" :class="btn" class="max-md:hidden" :title="tr('craft-stage-run.mjs の --prices に渡す相場 (高貴建て)', 'Market prices for craft-stage-run.mjs --prices (in Exalted)')" @click="copy(tr('相場 JSON', 'price JSON'), s.prices())">{{ tr("相場 JSON", "Price JSON") }}</button>
      <!-- 今のアイテムの MOD 群を取引所 (JP) で (シミュレーションと同じ trade-search.ts。2026-10-07 オーナー「ステージでも同じエンジンで実装しておｋ」) -->
      <label class="flex cursor-pointer items-center gap-1 text-[12px] text-[var(--exile-color-text-secondary)]" :title="tr('取引所の検索にベース・アイテムレベル・ソケットも入れる (外すと MOD だけで探す)', 'Also match base, item level and sockets on trade (off = mods only)')"><input v-model="tradeWithBase" type="checkbox" />{{ tr("ベース検索含め", "Include base") }}</label>
      <button type="button" data-rec-part="trade-search" :class="btn" :disabled="!stageModGroups.length" :title="tradeWithBase ? tr('今のアイテムに付いている MOD の組み合わせで取引所 (JP) を開く (ベース・アイテムレベル・ソケット・段の下限まで)', 'Open the trade site with this item’s mods (base, item level, sockets and minimum tiers included)') : tr('今のアイテムに付いている MOD の組み合わせで取引所 (JP) を開く (段の下限まで、ベースは問わない)', 'Open the trade site with this item’s mods (minimum tiers, any base)')" @click="searchStageMods">{{ tr("今の MOD を取引所で検索 ↗", "Search these mods on trade ↗") }}</button>
      <!-- 検索の仕組みのヒント (2026-10-14 要望 0ce15a82 の返事と同じ中身。オーナー「? でヒント出しておくか取引所の横とかに」) -->
      <HelpTip :text="tr('同じ MOD なら普通・冒涜・フラクチャーどの付き方でも引っかかります。全部の MOD が揃った物はほぼ無いので、取引所で MOD の行のチェックを外して似た物を探すと相場が見やすいです', 'Each mod matches whether it is normal, desecrated or fractured. Items with every mod rarely exist, so untick some mod lines on the trade site to find similar items and see prices')" />
    </span>
    </template>
  </section>
</template>
