<!--
  StageCurrencyCard.vue — クラフトステージの棚の詳細カード (2026-09-28、ADR-001)

  オーナー:「ステージでのカレンシー詳細カードは文字だけでいいから、どんな挙動するオーブやお告げなのか細かく書いてくれ」。
  上: ゲームの公式の説明 (currency-hover-ja.json、クライアント原本)。下: このステージでの動き ([[craft-stage-help.ts]])。
  打てない時は理由、相場があれば値段。棚のボタン ([[ShelfButton.vue]]) に乗せると出る。
  2026-10-10 ジェム・ベースと同じカード (GameItemCard + hover-stack) に載せ替え: 枠・位置・ピン留め・カードに入る・中の言葉 (RichText) から次のカード
-->
<script setup lang="ts">
import { computed } from "vue";
import GameItemCard from "../../components/decor/GameItemCard.vue";
import RichText from "../../components/decor/RichText.vue";
import { craftStage, iconOf, nameOf, priceOf } from "../../state/craft-stage";
import { enOf } from "../../state/craft-stage-shelf";
import { specialEssence, stageAdds, stageHelp } from "../../state/craft-stage-help";
import { currencyHoverOf } from "../../services/currency/currency-hover";
import { displayCurrency } from "../../state/display-currency";
import { tr } from "../../i18n/lang";

const props = defineProps<{ k: string; reason: string | null; omen?: boolean; x: number; y: number; layerKey: number; pinned: boolean; z: number }>();
/** ゲームの書式記号 ([Corrupted|コラプト] → コラプト、[Hit] → Hit) を外す */
const plain = (s: string): string => s.replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]]+)\]/g, "$1");
const hover = computed(() => currencyHoverOf(enOf(props.k, craftStage.item.value)));
/** 公式の説明は印を残して RichText で (中の言葉に乗せると説明のカード) */
const official = computed(() => hover.value?.e ?? []);
/**
 * 他の装備に使った時に付く物 (エッセンス・合金: クライアントの説明の部位ごとの一覧)。
 * 2026-10-05 オーナー「違う武器とかでも付けれたり他のでも付けれるから、その説明は欲しい。分かりやすく教えて欲しいカード」
 */
const others = computed(() => specialEssence(props.k, craftStage.item.value)?.groups ?? (hover.value?.g ?? []).map((g) => ({ h: plain(g.h).replace(/に付く$/, ""), l: g.l.map(plain) })));
const help = computed(() => stageHelp(props.k, craftStage.data.value, craftStage.item.value));
/** 付く MOD (エッセンス・ルーン等)。アイコンの下に色を変えて箇条書き (2026-10-05 オーナー「説明欄が見づらいから、特定の MOD が付く奴はそこだけ分かりやすい色に」) */
const adds = computed(() => (props.omen ? null : stageAdds(props.k, craftStage.data.value, craftStage.item.value)));
/** 「**強調**」を太字の区切りにする */
const parts = (line: string): Array<{ t: string; b: boolean }> => line.split("**").map((t, i) => ({ t, b: i % 2 === 1 }));
</script>

<template>
  <GameItemCard :show="true" :x="x" :y="y" :name="nameOf(k)" tone="currency" :width="380" :layer-key="layerKey" :pinned="pinned" :z="z">
    <div class="text-left text-[12.5px]">
      <div class="flex items-center justify-center gap-2">
        <img v-if="iconOf(k)" :src="iconOf(k)" alt="" class="h-12 w-12 shrink-0 object-contain" />
        <p v-if="priceOf(k)" class="g-dim text-[12px]">{{ tr("相場", "Market price") }} <span class="g-white">{{ displayCurrency.money(priceOf(k)) }}</span></p>
      </div>
      <div v-if="adds" class="mt-2 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1.5">
        <p class="text-[10px] text-emerald-200/70">{{ adds.head }}</p>
        <p v-for="(l, i) in adds.lines" :key="'a' + i" class="flex gap-1.5 text-[13px] font-semibold text-emerald-200">
          <span class="text-emerald-400">・</span><span>{{ l }}</span>
        </p>
        <p v-if="adds.tier" class="mt-0.5 text-[11px] text-emerald-100/80">{{ tr("ティア", "Tier") }}: {{ adds.tier }}</p>
      </div>
      <template v-if="official.length">
        <div class="g-sep" />
        <p v-for="(l, i) in official" :key="'o' + i" class="g-desc text-center"><RichText :text="l" /></p>
      </template>
      <template v-if="others.length">
        <div class="g-sep" />
        <p class="g-head2 mb-1">{{ tr("使える装備と付く MOD", "Usable on / mods added") }}</p>
        <div v-for="(g, i) in others" :key="'g' + i" class="mb-1 grid grid-cols-[96px_1fr] gap-2">
          <span class="g-dim text-[11px]">{{ g.h }}</span>
          <span><span v-for="(l, j) in g.l" :key="j" class="g-mod block">{{ l }}</span></span>
        </div>
      </template>
      <template v-if="help.length">
        <div class="g-sep" />
        <p class="g-head2 mb-1">{{ tr("このステージでの動き", "Behavior in this emulator") }}</p>
        <p v-for="(l, i) in help" :key="'h' + i" class="flex gap-1.5 text-[#cfc6ae]">
          <span class="text-amber-300/60">・</span>
          <span><template v-for="(p, j) in parts(l)" :key="j"><b v-if="p.b" class="text-white">{{ p.t }}</b><template v-else>{{ p.t }}</template></template></span>
        </p>
      </template>
      <p v-if="reason" class="mt-2 rounded-lg bg-rose-500/15 px-2 py-1 text-rose-300">{{ tr("今は打てない", "Can't use now") }}: {{ reason }}</p>
    </div>
  </GameItemCard>
</template>
