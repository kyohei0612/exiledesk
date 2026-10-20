<!--
  StageHistory.vue — クラフトステージの工程履歴 (2026-09-27、ADR-001)

  1 手ずつ下に積み上がる (POE2Tube の「積み上げ図解」と同じ見え方)。手の番号・カレンシー・付いた / 消えた MOD・レアリティの変化・累計の費用。
  打てなかった手は理由を薄く出す。手を押すとその手を打った直後に戻る (craftStage.goTo、この後に打てば先の手は捨てる)。先頭の「始め」は 1 手も打っていない状態へ (goToStart)。
-->
<script setup lang="ts">
import { fmtChance, isRareChance } from "../../utils/format-pct";
import { computed } from "vue";
import { modText, tr } from "../../i18n/lang";
import { stageModText } from "./base-values";
import { craftStage, iconOf, stepNameOf, stepOmenOf } from "../../state/craft-stage";
import { displayCurrency } from "../../state/display-currency";

const RARITY_JA = { normal: "ノーマル", magic: "マジック", rare: "レア", unique: "ユニーク" } as const;
const RARITY_EN = { normal: "Normal", magic: "Magic", rare: "Rare", unique: "Unique" } as const;
const rarityName = (r: keyof typeof RARITY_JA): string => tr(RARITY_JA[r], RARITY_EN[r]);
const RARITY_CLS = { normal: "text-rarity-normal", magic: "text-rarity-magic", rare: "text-rarity-rare", unique: "text-rarity-unique" } as const;
const money = (ex: number) => displayCurrency.money(ex);
/** ルーンをはめた手の中身 (結果 JSON の augment_change、run-plan.ts)。置き換えた物は壊れて戻らない (augment-rules.ts) */
type AugChange = { socket: number; put: { ja: string; en?: string }; replaced: { ja: string; en?: string } | null; replaced_goes: string | null };
const augOf = (out: object): AugChange | null => (out as { augment_change?: AugChange }).augment_change ?? null;
/** 押すとその手の直後に戻れるか (最後の手と再生中は戻らない) */
const newestFirst = computed(() => [...craftStage.log.value].reverse());
/** 共有の手順の再生 (2026-10-12) は押すとその手まで送る (先の手は上の ▶ で戻せる) */
const sharedReplay = computed(() => !!craftStage.replay.value?.shared);
const canGo = (index: number): boolean => (!craftStage.replay.value || sharedReplay.value) && craftStage.log.value[craftStage.log.value.length - 1]?.out.index !== index;
const go = (index: number): void => { if (!canGo(index)) return; if (sharedReplay.value) craftStage.replayTo(index); else craftStage.goTo(index); };
const goStart = (): void => { if (sharedReplay.value) craftStage.replayTo(0); else craftStage.goToStart(); };
const goTitle = computed(() => (sharedReplay.value ? tr("この手まで送る (▶ で先へ)", "Jump to this step (▶ to go forward)") : tr("この手を打った直後に戻す (この後に打つと先の手は消える)", "Go back to right after this step (later steps are dropped if you craft from here)")));
</script>

<template>
  <ol class="space-y-1">
    <li
      v-for="s in newestFirst"
      :key="s.out.index"
      :data-rec="`step:${s.out.index}`"
      class="flex items-start gap-2 rounded-lg border px-2 py-1.5 text-[12px]"
      :class="[s.out.applied ? 'border-white/10 bg-black/20' : 'border-white/5 bg-black/10 opacity-50', canGo(s.out.index) ? 'cursor-pointer hover:border-white/30 hover:bg-white/5' : '']"
      :title="canGo(s.out.index) ? goTitle : undefined"
      :tabindex="canGo(s.out.index) ? 0 : undefined"
      @click="go(s.out.index)"
      @keydown.enter="go(s.out.index)"
    >
      <span class="w-6 shrink-0 text-right tabular-nums opacity-50">{{ s.out.index }}</span>
      <img v-if="iconOf(s.out.currency)" :src="iconOf(s.out.currency)" alt="" class="h-5 w-5 shrink-0 object-contain" />
      <div class="min-w-0 flex-1">
        <p>
          <b>{{ stepNameOf(s.out) }}</b>
          <span v-if="s.out.omen" class="ml-1 text-violet-300">+ {{ stepOmenOf(s.out) }}</span>
          <span v-if="s.out.changed.rarity_from !== s.out.changed.rarity_to" class="ml-1.5">
            <span :class="RARITY_CLS[s.out.changed.rarity_from]">{{ rarityName(s.out.changed.rarity_from) }}</span> →
            <span :class="RARITY_CLS[s.out.changed.rarity_to]">{{ rarityName(s.out.changed.rarity_to) }}</span>
          </span>
          <span v-if="!s.out.applied" class="ml-1.5 text-rose-300/80">{{ s.out.reason }}</span>
        </p>
        <!-- 付いた瞬間のその段の確率 (2026-10-09 オーナー「このMODは今付けた瞬間に何％の確率で付いたのかが分かるとへーってなる」)。低い物 (0.2% 以下、format-pct.ts の RARE_CHANCE) は金色 -->
        <p v-for="(m, i) in s.added" :key="'a' + i + m.modId" class="text-emerald-300">{{ tr('＋', '+') }} {{ stageModText(m) }} <span class="text-[10px] opacity-60">{{ m.side === "prefix" ? tr("プレフィックス", "Pre") : tr("サフィックス", "Suf") }} {{ m.tierName }}</span><span v-if="s.chances?.[m.modId] != null" data-rec-part="odds" class="ml-1.5 text-[10px] tabular-nums" :class="isRareChance(s.chances[m.modId]!) ? 'font-bold text-amber-300' : 'text-[var(--exile-color-text-tertiary)]'" :title="tr('付いた瞬間に、この段が付く確率 (その段の重み ÷ この手で付きうる全部の重み)', 'Chance this tier rolled at that moment (tier weight ÷ total weight of everything this step could add)')">{{ fmtChance(s.chances[m.modId]!) }}</span></p>
        <p v-for="(m, i) in s.removed" :key="'r' + i + m.modId" class="text-rose-300 line-through">{{ tr('－', '-') }} {{ stageModText(m) }}</p>
        <p v-if="s.after.enchant && s.after.enchant !== s.before.enchant" class="text-sky-200">{{ tr('＋', '+') }} {{ modText(s.after.enchant) }} <span class="text-[10px] opacity-60">{{ tr("エンチャント", "Enchantment") }}</span></p>
        <template v-if="augOf(s.out)">
          <p class="text-[#8fa8ff]">{{ tr('＋', '+') }} {{ tr(augOf(s.out)!.put.ja, augOf(s.out)!.put.en ?? augOf(s.out)!.put.ja) }} <span class="text-[10px] opacity-60">{{ tr(`${augOf(s.out)!.socket} 番目のソケット`, `socket ${augOf(s.out)!.socket}`) }}</span></p>
          <p v-if="augOf(s.out)!.replaced" class="text-rose-300"><span class="line-through">{{ tr('－', '-') }} {{ tr(augOf(s.out)!.replaced!.ja, augOf(s.out)!.replaced!.en ?? augOf(s.out)!.replaced!.ja) }}</span> <span class="text-[10px] opacity-70">{{ augOf(s.out)!.replaced_goes === "destroyed" ? tr("置き換えで壊れた", "destroyed by replacing") : tr("置き換えた", "replaced") }}</span></p>
        </template>
        <p v-if="(s.after.sockets ?? 0) > (s.before.sockets ?? 0)" class="text-sky-200">{{ tr(`＋ ソケット (${s.after.sockets})`, `+ Socket (${s.after.sockets})`) }}</p>
        <p v-if="s.after.corrupted && !s.before.corrupted" class="text-[#ff5050]">{{ tr("コラプト", "Corrupted") }}<span v-if="!s.added.length && !s.removed.length && s.after.enchant === s.before.enchant && s.after.sockets === s.before.sockets">{{ tr(" (変化なし)", " (no change)") }}</span></p>
        <p v-if="s.after.sanctified && !s.before.sanctified" class="text-amber-200">{{ tr("聖別", "Sanctified") }}</p>
      </div>
      <span data-rec-part="history-cost" class="shrink-0 text-right tabular-nums text-[11px] opacity-70">{{ s.out.cost.cumulative ? money(s.out.cost.cumulative) : "" }}</span>
    </li>
    <!-- 新しい手が上、始めは一番下 (2026-10-10 オーナー「上が最新、古いのは勝手に下に行く」) -->
    <!-- 始めの行 (押すと 1 手も打っていない状態に戻る。2026-10-09 オーナー「始めの行も足して」) -->
    <li
      v-if="craftStage.log.value.length"
      data-rec="step:start"
      class="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-[12px]"
      :class="craftStage.replay.value && !sharedReplay ? '' : 'cursor-pointer hover:border-white/30 hover:bg-white/5'"
      :title="craftStage.replay.value && !sharedReplay ? undefined : sharedReplay ? tr('始めへ送る', 'Jump to the start') : tr('1 手も打っていない状態に戻す (この後に打つと先の手は消える)', 'Go back to the start (later steps are dropped if you craft from here)')"
      :tabindex="craftStage.replay.value && !sharedReplay ? undefined : 0"
      @click="goStart()"
      @keydown.enter="goStart()"
    >
      <span class="w-6 shrink-0 text-right tabular-nums opacity-50">0</span>
      <b>{{ tr("始め", "Start") }}</b>
      <span :class="RARITY_CLS[craftStage.log.value[0]!.before.rarity]">{{ rarityName(craftStage.log.value[0]!.before.rarity) }}</span>
      <span v-if="craftStage.startMods.value.length" class="text-[11px] opacity-60">{{ tr(`始めの MOD ${craftStage.startMods.value.length} つ`, `${craftStage.startMods.value.length} starting mods`) }}</span>
    </li>
    <li v-if="!craftStage.log.value.length" class="rounded-lg bg-black/20 px-3 py-2 text-[12px] opacity-50">{{ tr("まだ何も使っていません。", "Nothing used yet. ") }}<span class="max-md:hidden">{{ tr("右の棚からカレンシーを選んでアイテムを押してください", "Pick a currency from the shelf on the right, then click the item") }}</span><span class="md:hidden">{{ tr("上の棚でカレンシーを押して持ち、下の帯の「使う」を押してください", "Tap a currency on the shelf above, then tap “Use” in the bar below") }}</span></li>
  </ol>
</template>
