<!--
  StageHistory.vue — クラフトステージの工程履歴 (2026-09-27、ADR-001)

  1 手ずつ下に積み上がる (POE2Tube の「積み上げ図解」と同じ見え方)。手の番号・カレンシー・付いた / 消えた MOD・レアリティの変化・累計の費用。
  打てなかった手は理由を薄く出す。
-->
<script setup lang="ts">
import { craftStage, iconOf } from "../../state/craft-stage";
import { displayCurrency } from "../../state/display-currency";

const RARITY_JA = { normal: "ノーマル", magic: "マジック", rare: "レア", unique: "ユニーク" } as const;
const RARITY_CLS = { normal: "text-rarity-normal", magic: "text-rarity-magic", rare: "text-rarity-rare", unique: "text-rarity-unique" } as const;
const money = (ex: number) => displayCurrency.money(ex);
/** ルーンをはめた手の中身 (結果 JSON の augment_change、run-plan.ts)。置き換えた物は壊れて戻らない (augment-rules.ts) */
type AugChange = { socket: number; put: { ja: string }; replaced: { ja: string } | null; replaced_goes: string | null };
const augOf = (out: object): AugChange | null => (out as { augment_change?: AugChange }).augment_change ?? null;
</script>

<template>
  <ol class="space-y-1">
    <li
      v-for="s in craftStage.log.value"
      :key="s.out.index"
      class="flex items-start gap-2 rounded-lg border px-2 py-1.5 text-[12px]"
      :class="s.out.applied ? 'border-white/10 bg-black/20' : 'border-white/5 bg-black/10 opacity-50'"
    >
      <span class="w-6 shrink-0 text-right tabular-nums opacity-50">{{ s.out.index }}</span>
      <img v-if="iconOf(s.out.currency)" :src="iconOf(s.out.currency)" alt="" class="h-5 w-5 shrink-0 object-contain" />
      <div class="min-w-0 flex-1">
        <p>
          <b>{{ s.out.currency_ja }}</b>
          <span v-if="s.out.omen_ja" class="ml-1 text-violet-300">+ {{ s.out.omen_ja }}</span>
          <span v-if="s.out.changed.rarity_from !== s.out.changed.rarity_to" class="ml-1.5">
            <span :class="RARITY_CLS[s.out.changed.rarity_from]">{{ RARITY_JA[s.out.changed.rarity_from] }}</span> →
            <span :class="RARITY_CLS[s.out.changed.rarity_to]">{{ RARITY_JA[s.out.changed.rarity_to] }}</span>
          </span>
          <span v-if="!s.out.applied" class="ml-1.5 text-rose-300/80">{{ s.out.reason }}</span>
        </p>
        <p v-for="m in s.added" :key="'a' + m.modId" class="text-emerald-300">＋ {{ m.textJa }} <span class="text-[10px] opacity-60">{{ m.side === "prefix" ? "プレ" : "サフィ" }} {{ m.tierName }}</span></p>
        <p v-for="m in s.removed" :key="'r' + m.modId" class="text-rose-300 line-through">－ {{ m.textJa }}</p>
        <p v-if="s.after.enchant && s.after.enchant !== s.before.enchant" class="text-sky-200">＋ {{ s.after.enchant.textJa }} <span class="text-[10px] opacity-60">エンチャント</span></p>
        <template v-if="augOf(s.out)">
          <p class="text-[#8fa8ff]">＋ {{ augOf(s.out)!.put.ja }} <span class="text-[10px] opacity-60">{{ augOf(s.out)!.socket }} 番目のソケット</span></p>
          <p v-if="augOf(s.out)!.replaced" class="text-rose-300"><span class="line-through">－ {{ augOf(s.out)!.replaced!.ja }}</span> <span class="text-[10px] opacity-70">{{ augOf(s.out)!.replaced_goes === "destroyed" ? "置き換えで壊れた" : "置き換えた" }}</span></p>
        </template>
        <p v-if="(s.after.sockets ?? 0) > (s.before.sockets ?? 0)" class="text-sky-200">＋ ソケット ({{ s.after.sockets }})</p>
        <p v-if="s.after.corrupted && !s.before.corrupted" class="text-[#ff5050]">コラプト<span v-if="!s.added.length && !s.removed.length && s.after.enchant === s.before.enchant && s.after.sockets === s.before.sockets"> (変化なし)</span></p>
        <p v-if="s.after.sanctified && !s.before.sanctified" class="text-amber-200">聖別</p>
      </div>
      <span class="shrink-0 text-right tabular-nums text-[11px] opacity-70">{{ s.out.cost.cumulative ? money(s.out.cost.cumulative) : "" }}</span>
    </li>
    <li v-if="!craftStage.log.value.length" class="rounded-lg bg-black/20 px-3 py-2 text-[12px] opacity-50">まだ何も使っていません。右の棚からカレンシーを選んでアイテムを押してください</li>
  </ol>
</template>
