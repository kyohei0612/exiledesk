<!--
  BuildItemRow.vue — 忍者ビルドコピーの装備 1 つ (2026-09-27、BuildItemTable から分けた)

  オーナー 2026-09-27「全体的に UI が不細工。クラフト計算機にならって色々色付けてわかりやすくかつシンプルに」
  「読み込み後の完了まで、いまなにしてますよーってわかりやすく」。
    左: 部位 / 名前 (カーソルでゲームと同じカード) / 印 (コラプト・聖別・取引所で探すユニーク)
    右: 値段 (大きく) と、どこで取れたか (色付きの札)、取っている途中は今の段階。「トレード2へ」は最後に止まった検索へ
    下: レアの MOD と段 ([[RareMods.vue]])
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { displayCurrency, type DisplayCurrency } from "../../state/display-currency";
import { hoverStack } from "../../state/hover-stack";
import { toCss } from "../../utils/zoom";
import { jaCurrency } from "../../i18n/currencies-ja";
import RichText from "../decor/RichText.vue";
import RareMods from "./RareMods.vue";
import type { ItemRow } from "../../views/build-copy/useBuildCopy";
import type { AutoStage } from "../../services/build-copy/rare-auto";

const props = defineProps<{ r: ItemRow; autoBusy: boolean }>();
const emit = defineEmits<{
  trade: [];
  link: [query: unknown];
  tier: [mod: number, tier: number];
  lower: [];
  raise: [];
  reset: [];
  manual: [amount: number | null, currency: DisplayCurrency];
  auto: [];
}>();
const money = (ex: number) => displayCurrency.money(ex);
/** ゲームのレアリティの色 */
const COLOR: Record<string, string> = { UNIQUE: "text-[#af6025]", RELIC: "text-[#82ad6a]", RARE: "text-[#e8d77a]", MAGIC: "text-[#8888ff]", NORMAL: "text-[#c8c8c8]" };
/** どこで取れたかの札 (クラフト計算機と同じ色の決まり: 緑 = そのまま / 水色 = 近い / 黄 = ゆるめた / 赤 = 無い) */
const STAGE: Record<AutoStage, { label: string; cls: string }> = {
  exact: { label: "完成品", cls: "bg-emerald-500/20 text-emerald-300" },
  lowered: { label: "段を下げて", cls: "bg-sky-500/20 text-sky-300" },
  dropped: { label: "MOD を外して", cls: "bg-amber-500/20 text-amber-200" },
  bare: { label: "数値なし (平均)", cls: "bg-amber-500/20 text-amber-200" },
  unique: { label: "取引所の最安値", cls: "bg-violet-500/20 text-violet-200" },
  none: { label: "出品なし", cls: "bg-rose-500/20 text-rose-300" },
  skip: { label: "poe.ninja", cls: "bg-white/10 text-white/70" },
  error: { label: "取れず", cls: "bg-rose-500/20 text-rose-300" },
};
const stage = computed(() => (props.r.auto ? STAGE[props.r.auto.stage] : null));
/** レアの値段を手で直す欄 (値段が無い時は最初から開く) */
const editing = ref(false);
const showEdit = computed(() => props.r.src === "rare" && (editing.value || props.r.price == null) && !props.r.autoStep && !props.r.queued);
const num = (v: string): number | null => (v.trim() === "" ? null : Number(v));
/** 「トレード2へ」の説明 */
const tradeTitle = computed(() => (props.r.auto?.query ? `取れた所の検索で開く (${props.r.auto.note})` : "取引所 (即時購入) をこの条件で開く"));
const extraLinks = computed(() => (props.r.src === "rare" && props.r.rare ? props.r.rare.links : []));
</script>

<template>
  <div class="rounded-xl border p-3 transition-colors" :class="r.autoStep ? 'border-amber-400/50 bg-amber-500/[0.06]' : 'border-white/10 bg-white/[0.03]'">
    <div class="flex items-start gap-3">
      <!-- 部位 -->
      <span class="mt-0.5 w-24 shrink-0 text-[11px] opacity-60">{{ r.item.slot }}</span>
      <!-- 名前と印 -->
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span
            :class="COLOR[r.item.rarity]"
            class="cursor-help font-bold underline decoration-white/30 decoration-dotted underline-offset-4"
            @mouseenter="(ev) => hoverStack.openRoot({ kind: 'build', item: r.item }, toCss(ev.clientX), toCss(ev.clientY))"
            @mouseleave="hoverStack.leave()"
            >{{ r.nameJa }}</span
          >
          <span class="text-[11px] opacity-50">{{ r.item.rarity === "RARE" ? r.item.name : r.baseJa !== r.nameJa ? r.baseJa : "" }}</span>
          <span v-if="r.item.corrupted" class="rounded-full bg-rose-500/20 px-1.5 text-[10px] text-rose-300">コラプト</span>
          <span v-if="r.item.sanctified" class="rounded-full bg-amber-500/20 px-1.5 text-[10px] text-amber-200" title="聖別で MOD の数値が 78%〜122% に振り直されています。段は戻した値で決めています">聖別</span>
          <span v-if="r.tradeUnique" class="rounded-full bg-violet-500/20 px-1.5 text-[10px] text-violet-200" title="種類違い・ソケットのあるユニークは poe.ninja の相場では区別されないので、取引所で同じ物を探します">取引所で探す</span>
          <span v-if="r.item.kind === 'jewel' && r.item.rarity === 'RARE'" class="rounded-full bg-white/10 px-1.5 text-[10px] opacity-70" title="レアのジュエルは自動では取りません。見た値段を打つと合計に入ります">手入れ</span>
        </div>
        <p v-if="r.item.runes.length" class="mt-0.5 text-[11px] opacity-60">ルーン: {{ r.item.runes.map((x) => jaCurrency(x)).join(" · ") }}</p>
      </div>
      <!-- 値段 -->
      <div class="w-56 shrink-0 text-right">
        <p v-if="r.queued" class="text-[12px] opacity-50">順番待ち</p>
        <p v-else-if="r.autoStep" class="animate-pulse text-[12px] text-amber-300">{{ r.autoStep }}…</p>
        <template v-else>
          <p v-if="r.price != null && !showEdit" class="text-lg font-bold leading-tight tabular-nums" :class="r.auto?.exalted != null ? 'text-emerald-300' : 'text-[var(--exile-color-accent-focus)]'">
            {{ money(r.price) }}
            <button v-if="r.src === 'rare'" type="button" class="ml-1 align-middle text-[10px] font-normal text-sky-300 underline" @click="editing = true">直す</button>
          </p>
          <p v-else-if="r.src === 'unique'" class="text-[12px] opacity-50">相場なし</p>
          <p v-else-if="r.src === 'none'" class="text-[12px] opacity-40" title="マジック・ノーマルは安いので数えません">—</p>
          <!-- レアの値段の欄 (自動で取れなかった・ジュエル・直す時) -->
          <div v-if="showEdit" class="flex items-center justify-end gap-1">
            <input
              type="number"
              min="0"
              step="any"
              placeholder="値段"
              :value="r.manual?.amount || ''"
              class="num w-16 py-0 text-right text-[12px]"
              title="取引所で見た値段を打つと合計に入ります"
              @change="emit('manual', num(($event.target as HTMLInputElement).value), r.manual?.currency ?? 'divine')"
            />
            <select :value="r.manual?.currency ?? 'divine'" class="num py-0 text-[11px]" @change="emit('manual', r.manual?.amount ?? null, ($event.target as HTMLSelectElement).value as DisplayCurrency)">
              <option value="divine">神</option>
              <option value="chaos">カオス</option>
              <option value="exalted">高貴</option>
            </select>
            <button v-if="editing" type="button" class="text-[10px] underline opacity-60" @click="editing = false">閉じる</button>
          </div>
          <p v-if="r.auto" class="mt-0.5 flex flex-wrap items-center justify-end gap-1 text-[10px]">
            <span v-if="stage" class="rounded-full px-1.5" :class="stage.cls">{{ stage.label }}</span>
            <span class="opacity-60"><RichText :text="r.auto.note" /></span>
          </p>
        </template>
      </div>
      <!-- 取引所へ -->
      <div class="flex w-24 shrink-0 flex-col items-end gap-1">
        <button
          v-if="r.src !== 'none' || r.baseJa"
          type="button"
          class="rounded-md border border-sky-400/40 px-2 py-0.5 text-[11px] text-sky-200 hover:bg-sky-500/10"
          :title="tradeTitle"
          @click="emit('trade')"
        >
          トレード2へ
        </button>
        <button v-for="l in extraLinks" :key="l.label" type="button" class="text-[10px] text-sky-300/70 underline hover:text-sky-200" :title="`取引所をこの条件 (${l.label}) で開く`" @click="emit('link', l.query)">
          {{ l.label }}
        </button>
        <button v-if="r.autoTarget && !r.autoStep && !r.queued" type="button" :disabled="autoBusy" class="text-[10px] underline opacity-50 hover:opacity-100 disabled:opacity-20" title="今の段・割合で取引所の相場を取り直す" @click="emit('auto')">
          取り直す
        </button>
      </div>
    </div>
    <RareMods v-if="r.rare" :rare="r.rare" :item="r.item" @tier="(k, t) => emit('tier', k, t)" @lower="emit('lower')" @raise="emit('raise')" @reset="emit('reset')" />
  </div>
</template>
