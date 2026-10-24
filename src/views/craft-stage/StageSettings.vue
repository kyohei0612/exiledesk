<!--
  StageSettings.vue — クラフトステージの設定と操作の欄 (ベース・アイテムレベル・シミュレーターの始め方・白に戻す・1 手戻す・手順の書き出し・取引所)。
  CraftStage.vue から分けた (2026-10-16、500 行の決まり)
-->
<script setup lang="ts">
import { itemLevelKey } from "../../services/craft-stage/engine-emu";
import { inGroup, ITEM_LEVEL_SET, SANCTIFIED_REASON } from "../../services/craft-stage/engine";
import { useFlash } from "../../utils/use-flash";
import { ARMED_CLASS, useArmed } from "../../utils/use-armed";
import { tr } from "../../i18n/lang";
import { inLesson } from "../tutorial/course-entry";
import { isTauriRuntime } from "../../utils/isTauriRuntime";
import { computed, ref, watch } from "vue";
import { useStageBase } from "./use-stage-base";
import StageBasePicker from "./StageBasePicker.vue";
import { PAGES_ON, TREE_ON, basePage } from "../../state/web-page";
import { openTreeWith } from "../../state/for-share/sim-links";
import { craftStage } from "../../state/craft-stage";
import pkg from "../../../package.json";
import HelpTip from "../../components/ui/HelpTip.vue";
import type { ModGroup } from "../../services/craft-stage/trade-search";

defineProps<{ phone: boolean }>();
const s = craftStage;
const inApp = isTauriRuntime();
const { handNoBase, pickSimBase } = useStageBase();
/** 道具の帯のボタン (ゲームの 3 枚ボタン、src/styles/game-ui.css) */
const btn = "g-btn sm";
/**
 * アイテムレベル: よく使う 3 つはボタン、70〜86 は 1 ずつプルダウン (2026-10-18 オーナー「トレードで 78 やら 76 やら 79 やらいろいろある」「45・75・82 だけ出して、70 から 86 は 1 ずつ」)
 */
const ILVLS = [45, 75, 82];
const ILVL_LIST = Array.from({ length: 17 }, (_, i) => 70 + i);
/** 手で打つ画面の聖別済みは、アイテムレベルを灰色で変えられない (2026-10-22 オーナー。エンジンも止める) */
const ilvlLocked = computed(() => s.mode.value === "hand" && !!s.item.value?.sanctified);
/** 今のアイテムレベル (エミュレーターは打った手で変わるのでアイテムの値) */
const curIlvl = computed(() => (s.mode.value === "hand" ? s.item.value?.itemLevel : null) ?? s.itemLevel.value);
/**
 * 変えた時: 打つ前 (手も始めの MOD も無い) とシミュレーターは今まで通り白から。エミュレーターで打ち始めた後は 1 手にして、
 * そのレベルで付かない段の MOD だけ消す (2026-10-18 オーナー「全部やり直しになるのもおかしい」。apply-currency の ilvl:)。続けて変えた分は 1 手にまとめる
 */
function setIlvl(lv: number): void {
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
  // 後から読む (2026-10-19 スマホ強化: 最初に読む JS を縮める。その画面・カードを出す時に初めて読む)
  const { searchModGroups } = await import("../../services/craft-stage/trade-search");
  await searchModGroups(d, { groups: stageModGroups.value, minValues: true, ...(tradeWithBase.value ? { exact: { baseType: it.base, ...(jewelBase.value ? {} : { ilvlMin: it.itemLevel }), socketsMin: it.sockets ?? 0 } } : {}) });
}
/** 白に戻す (2 回押し。2026-10-10 動きの揃え 7: utils/use-armed.ts) */
const resetArm = useArmed();
function armReset(): void {
  if (resetArm.arm()) s.reset();
}
</script>

<template>
  <!-- 設定と操作 -->
  <!-- data-craft-top: クラフトの位置 (「クラフトへ」とベースを選んだ後はここの外枠の少し上。2026-10-10 オーナー「ベースの上枠の外枠から少し上空けた位置が心地いい」) -->
  <section v-if="!s.replay.value && s.mode.value !== 'tutorial' && !inLesson" data-stage-settings data-craft-top data-rec-part="settings" class="g-panel mb-4 scroll-mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-2 py-1 text-[12px]">
    <!-- ベース (押すと種類 → ベースのカードが開く。StageBasePicker.vue) -->
    <StageBasePicker :base="s.base.value" :data="s.data.value" :unpicked="s.mode.value === 'hand' && handNoBase" :page="PAGES_ON" @pick="pickSimBase" @open-page="s.hold(null); basePage = true" />
    <span v-if="!(s.mode.value === 'hand' && handNoBase) && !jewelBase" class="flex items-center gap-1" :class="ilvlLocked && 'cursor-not-allowed opacity-50 [&_*]:pointer-events-none'" :title="ilvlLocked ? SANCTIFIED_REASON() : undefined">
      <span class="mr-1 whitespace-nowrap text-[12px] text-[var(--exile-color-text-secondary)]">{{ phone ? "iLv" : tr("アイテムレベル", "Item Level") }}</span>
      <button v-for="lv in ILVLS" :key="lv" type="button" class="g-tab !min-h-[30px] !px-3 tabular-nums max-md:!min-h-10" :class="curIlvl === lv ? 'on' : ''" :disabled="ilvlLocked" @click="setIlvl(lv)">{{ lv }}</button>
      <select data-ilvl-select :disabled="ilvlLocked" class="h-[30px] cursor-pointer rounded border bg-black/60 px-1.5 tabular-nums max-md:h-10" :class="ILVLS.includes(curIlvl) ? 'border-white/15 text-white/60' : 'border-amber-300/70 text-amber-100'" :value="ILVLS.includes(curIlvl) ? '' : curIlvl" :aria-label="tr('アイテムレベル (70〜86)', 'Item level (70–86)')" @change="setIlvl(Number(($event.target as HTMLSelectElement).value))">
        <option value="" disabled>{{ tr("70〜86", "70–86") }}</option>
        <option v-if="!ILVLS.includes(curIlvl) && !ILVL_LIST.includes(curIlvl)" :value="curIlvl">{{ curIlvl }}</option>
        <option v-for="lv in ILVL_LIST" :key="lv" :value="lv">{{ lv }}</option>
      </select>
    </span>
    <template v-if="s.mode.value === 'hand' && !handNoBase">
    <!-- 白に戻すは 1 手戻すでは戻せないので 2 回押し (2026-10-08 完成判定: 9 手分が確認無しで消えた) -->
    <button type="button" data-rec="reset" :class="resetArm.is() ? ARMED_CLASS : btn" :disabled="!s.log.value.length && !s.startMods.value.length" @click="armReset">{{ resetArm.is() ? tr("もう一度押すと白に戻す", "Click again to reset") : tr("白に戻す", "Reset") }}</button>
    <button type="button" data-rec="undo" :class="btn" :disabled="!s.log.value.length && !s.startMods.value.length" :title="tr('R / Ctrl+Z (まだ打っていない時は始めの MOD を 1 つ外す)', 'R / Ctrl+Z (before any use, removes one starting mod)')" @click="s.undo()">{{ tr("1 手戻す", "Undo") }}</button>
    <!-- 今のベースとアイテムレベルで白紙のクラフトの道 (ツリー) へ (開発版だけ、10-22 オーナー「全部のベースで使える」案 1) -->
    <button v-if="TREE_ON && s.mode.value === 'hand' && s.item.value" type="button" data-tree-from-stage :class="btn" :title="tr('このベースとアイテムレベルで白紙のクラフトの道 (ツリー) を開く (前の木は 1 つ戻すで戻せる)', 'Open a blank craft route tree with this base and item level (undo restores the previous tree)')" @click="void openTreeWith(s.item.value.base, curIlvl ?? 82)">{{ tr("このベースでクラフトの道へ →", "Craft route tree with this base →") }}</button>
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
