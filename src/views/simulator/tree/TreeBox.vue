<!--
  TreeBox.vue — ツリーの箱 1 つ (2026-10-22 表面だけ)。始まり (フラクチャー) / 当たり / 外れ / 外れが消えた / 狙いが消えた。
  当たりは押すと MOD を選ぶ、横の＋で当たりを足す、下の＋で次の手。外れ・消えたの箱は消せない。見出しの鉛筆でメモ (10-22 試し打ちの欄を消したのでここから)。数字 (通った人数・ここまでの費用) は計算を繋ぐまで出さない
-->
<script setup lang="ts">
import { computed } from "vue";
import Icon from "../../../components/ui/Icon.vue";
import { BOX_H, BOX_W, startOf, type TreeBox } from "../../../services/simulator/tree/tree-model";
import { tr } from "../../../i18n/lang";
import { jaTypeName } from "../../../i18n/item-names-ja";
import { useTree } from "./use-tree";
import { OUT_LOOK, splitWhenText } from "./tree-names";

const props = defineProps<{ box: TreeBox; /** 自分で置く時の位置 (Vue Flow の箱の中では無し = Vue Flow が置く) */ x?: number; y?: number; removable: boolean; picking: boolean; selected: boolean; backLabel: string; /** 縮めて見ている時: 押せる物を出さず、押すとそこへ寄る */ viewOnly?: boolean; /** 上の札の一覧で選んだ札を使っている */ glow?: boolean; /** ルート精査で見つかった穴 (文) */ issue?: string | null;
  /** 縮めた時の倍率の逆数 (押せる物だけこれで大きさを戻し、画面の上で 24px 以上を保つ。オーナー 10-22「縮めても押せる物は小さくならない」) */ inv?: number;
  /** 戻り先を選んでいる間のつなげない理由 (灰色にする。use-tree-link.ts) */ linkNo?: string | null }>();
const emit = defineEmits<{
  /** 箱を引っ張り始めた (押した所から。判定はページの use-gesture.ts) */
  drag: [e: PointerEvent]; aim: []; remove: []; back: []; clearBack: []; done: []; note: []; spam: [];
  /** 始まりの箱のベースを押した (ベースとアイテムレベルを選ぶ欄) */
  base: [];
  /** マウスを乗せた / 外した (その箱の線を濃く・乗せた時のカード) */
  hover: [on: boolean];
  /** 戻り先の札に乗せた / 外した・押した */
  backHover: [on: boolean]; backGo: [];
  /** ＋を押した (押すだけ = 足す、長押しで引っ張る = 箱の上で離すとつなぐ。決めるのはページ) */
  plus: [kind: "side" | "next", e: PointerEvent];
}>();
const t = useTree();

/** 結果ごとの名前・色・印 (tree-names.ts の OUT_LOOK、まとめた札と同じ) */
const kind = computed(() => OUT_LOOK[props.box.out]);
/** 縁の色 (完成は明るい金) と光り方。選んだ・光らせた時は強く */
const rgb = computed(() => (props.box.done ? "242,210,122" : kind.value.c));
const neon = computed(() => {
  const strong = props.glow || props.selected || !!props.box.done;
  return { borderColor: `rgba(${rgb.value},${strong ? 0.95 : 0.55})`, boxShadow: `0 0 0 1px rgba(${rgb.value},${strong ? 0.5 : 0.18}), 0 0 ${strong ? 22 : 12}px rgba(${rgb.value},${strong ? 0.45 : 0.16})` };
});
const doneText = computed(() => (props.box.done ? tr("完成", "Done") : tr("完成にする", "Mark done")));
/** 下の＋を出す (完成の箱からも伸ばせる。手を付けると完成の印は外れ、同じ形の完成の箱もそこへ戻る、tree-merge の joinSameShape) */
const free = computed(() => !props.box.hand && !props.box.back && !props.box.split);
/** 分かれ目の先の箱の文 = 親の分かれ目の行の条件 */
const branchText = computed(() => { const r = props.box.parent ? t.doc.value.boxes[props.box.parent]?.split?.find((x) => x.to === props.box.id) : null; return r ? splitWhenText(r.when) : ""; });
/** 押せる物を隠す時 (戻り先を選んでいる・一望) */
const quiet = computed(() => props.picking || !!props.viewOnly);
/** 箱の地を押した (ボタン以外) = 引っ張る用。押せない時 (戻り先を選ぶ・一望・手) は Vue Flow に任せる (画面が動く / 押した判定) */
function down(e: PointerEvent): void {
  if (quiet.value || (e.target as HTMLElement).closest("button")) return;
  emit("drag", e);
}
const k = computed(() => Math.max(1, props.inv ?? 1));
/** 始まりの MOD (フラクチャーを先に)・残りの文・全部の文 (乗せた時) */
const startMods = computed(() => [...startOf(t.doc.value).mods].sort((a, b) => Number(!!b.fractured) - Number(!!a.fractured)));
const first = computed(() => startMods.value[0] ?? null);
const startRest = computed(() => {
  const st = startOf(t.doc.value), n = startMods.value.length - 1, r = t.doc.value.startRandom ?? 0;
  const parts = [n > 0 ? tr(`ほか ${n} つ`, `+${n} more`) : "", r ? tr(`乱数 ${r} つ`, `${r} random`) : "", st.runes?.length ? tr(`ルーン ${st.runes.length}`, `${st.runes.length} rune(s)`) : "", st.rarity === "magic" && !first.value?.fractured ? tr("マジック", "Magic") : ""].filter(Boolean);
  return [costLine.value, ...parts].filter(Boolean).join(" · ");
});
/** ベースの値段の 1 行 (始め方を比べた一番安い物、use-tree の baseCost。値段を入れていなければ出さない) */
const costLine = computed(() => {
  const b = t.baseCost.value?.best;
  if (!b) return "";
  const n = b.cost >= 100 ? b.cost.toFixed(0) : b.cost >= 10 ? b.cost.toFixed(1) : b.cost.toFixed(2);
  return tr(`ベース ${n} 神 · ${b.short}`, `Base ${n} div · ${b.short}`);
});
const startTitle = computed(() => startMods.value.map((m) => `${m.fractured ? `✦ ${tr("フラクチャー", "Fractured")} ` : ""}${t.startModLabel(m)}`).join("\n"));
/** 押せる物を倍率の逆数で戻す (origin = 大きくする軸。まとまりごとに端を軸にして、隣と重ならないように) */
const keep = (origin: string): Record<string, string> => (k.value > 1 ? { scale: String(k.value), transformOrigin: origin } : {});

</script>


<template>
  <!-- 押せる物は全部 24px 以上 (2026-10-22 押しにくい所の洗い出し、notes/2026-10-22-tree-ui-click-audit.md) -->
  <!-- 押すは Vue Flow の箱の node-click、引っ張るは use-gesture.ts (Vue Flow の引っ張りは遊びの 5px 分が動きから抜けた)。
       引っ張りは pointerdown の既定の動きを止めるので Vue Flow の画面の送りは始まらない。nopan は付けない (付けると箱の上のホイールで拡大縮小されなかった)、中のボタンは nodrag -->
  <div data-tree-box :data-box-id="box.id" class="select-none rounded-xl border-[1.5px] bg-gradient-to-b from-[#1d1812] to-[#110e0a] px-2 py-1 text-[12px] transition-shadow"
    :class="[x === undefined ? 'relative' : 'absolute', picking || viewOnly ? 'cursor-pointer' : 'cursor-grab', picking ? (linkNo ? 'cursor-not-allowed opacity-35 grayscale' : 'ring-2 ring-cyan-400/70 hover:ring-cyan-300') : '', glow ? 'ring-2 ring-amber-200/70' : '', issue ? '!border-rose-500 !shadow-[0_0_16px_rgba(244,63,94,0.55)]' : '']"
    :style="{ ...(x === undefined ? {} : { left: `${x}px`, top: `${y}px` }), width: `${BOX_W}px`, height: `${BOX_H}px`, ...neon }" :title="picking && linkNo ? linkNo : undefined" @pointerdown="down" @pointerenter="emit('hover', true)" @pointerleave="emit('hover', false)">
    <!-- 縮めている時 (k > 1) は押せる物の行を倍率分高くし、まだ「—」だけの数字の行は隠す (箱が小さくても押せる物どうしが重ならない) -->
    <div class="flex items-center gap-1.5" :style="{ height: `${24 * k}px` }">
      <span class="flex size-5 shrink-0 items-center justify-center rounded-md" :style="{ background: `rgba(${rgb},0.18)`, color: `rgb(${rgb})` }"><Icon :name="kind.icon" class="size-3.5" /></span>
      <span class="truncate text-[11px] font-bold tracking-wide" :style="{ color: `rgb(${rgb})` }">{{ tr(kind.ja, kind.en) }}</span>
      <!-- 始まりのアイテムレベルは見出しに (ベースの名前が長いと下の行で切れて見えない、10-22 靴) -->
      <span v-if="box.out === 'start'" class="shrink-0 text-[11px] opacity-70">{{ tr(`レベル ${t.doc.value.itemLevel}`, `ilvl ${t.doc.value.itemLevel}`) }}</span>
      <span v-if="box.done" class="shrink-0 rounded-full bg-amber-300/25 px-1.5 text-[10px] font-bold text-amber-100">{{ doneText }}</span>
      <span v-if="box.unwanted?.length" data-tree-unwanted class="shrink-0 rounded-sm bg-rose-400/20 px-1.5 text-[11px] font-bold text-rose-200" :title="tr(`× (要らない) の印 ${box.unwanted.length} 個 (前の試し打ちで付けた物)`, `${box.unwanted.length} mod(s) marked × (unwanted, set in the old try-out)`)">× {{ box.unwanted.length }}</span>
      <span v-if="issue" data-tree-issue class="rounded-sm bg-rose-600 px-1.5 text-[11px] font-bold text-white" :title="issue">!</span>
      <span class="flex-1" />
      <span class="flex items-center" :style="keep('right center')">
      <button v-if="!quiet" type="button" data-tree-note-mark class="nodrag flex size-6 items-center justify-center rounded hover:bg-white/10" :class="box.note ? 'text-amber-300' : 'text-white/30 hover:text-white/70'" :title="box.note || tr('メモを書く', 'Write a note')" @click.stop="emit('note')"><Icon name="pencil" class="size-3.5" /></button>
      <button v-if="removable && !quiet" type="button" class="nodrag -mr-1 flex size-6 items-center justify-center rounded opacity-60 hover:bg-white/10 hover:opacity-100" :title="tr('この当たりを消す', 'Remove this hit')" @click.stop="emit('remove')"><Icon name="x" class="size-3.5" /></button>
      </span>
    </div>

    <!-- 中身: 始まり = ベースとフラクチャー / 当たり = 付く MOD (右の＋に掛からない幅) -->
    <div class="min-w-0">
      <template v-if="box.out === 'start'">
        <!-- ベースとアイテムレベル: 押すと右の欄で選ぶ (10-22、前は金の指輪 ilvl 82 に固定) -->
        <button type="button" data-tree-base class="nodrag block w-full truncate text-left text-[13px] font-bold hover:underline" :class="quiet ? 'pointer-events-none' : ''" :style="{ height: `${24 * k}px`, lineHeight: `${24 * k}px` }" :title="tr('ベースとアイテムレベルを選ぶ', 'Choose the base and item level')" @click.stop="!quiet && emit('base')">
          {{ tr(jaTypeName(t.doc.value.base), t.doc.value.base) }}
        </button>
        <!-- 始まりの MOD (押すと右の欄で選ぶ、10-22 オーナー「始まりの MOD を決めさせる」): 1 行目はフラクチャー (無ければ最初の MOD)、2 行目は残りの数・乱数・マジック -->
        <button type="button" data-tree-start-mods class="nodrag block w-full truncate text-left text-[#c8c8ff] hover:underline" :class="quiet ? 'pointer-events-none' : ''" :style="{ height: `${24 * k}px`, lineHeight: `${24 * k}px` }" :title="startTitle" @click.stop="!quiet && emit('aim')">
          {{ first ? `${first.fractured ? "✦ " : ""}${t.startModLabel(first)}` : tr("＋ 始まりの MOD を選ぶ", "+ Pick the starting mods") }}
        </button>
        <p v-if="startRest" data-tree-start-rest class="truncate text-[12px] opacity-70" :title="t.baseCost.value?.best ? `${tr('一番安い始め方', 'Cheapest start')}: ${t.baseCost.value.best.label} · ${startRest}` : startRest" :style="{ height: `${24 * k}px`, lineHeight: `${24 * k}px` }">{{ startRest }}</p>
      </template>
      <button v-else-if="box.out === 'hit'" type="button" class="nodrag block w-[calc(100%-14px)] truncate text-left text-[13px] hover:underline" :style="{ height: `${24 * k}px`, lineHeight: `${24 * k}px` }" :class="[box.aim ? 'text-[#c8c8ff]' : 'text-amber-300', quiet ? 'pointer-events-none' : '']" :title="t.aimLabel(box.aim)" @click.stop="!quiet && emit('aim')">
        {{ box.aim ? t.aimLabel(box.aim) : tr("＋ 付く MOD を選ぶ", "+ Pick the mod") }}
      </button>
      <p v-else-if="box.out === 'branch'" data-tree-branch-text class="truncate leading-6 text-teal-100" :title="branchText">{{ branchText }}</p>
      <p v-else class="truncate leading-6 opacity-60">{{ box.out === "junk" ? tr("当たり以外が付いた", "Anything but a hit") : box.out === "junkGone" ? tr("外れの MOD が消えた", "A miss mod was removed") : box.out === "any" ? tr("何かが 1 つ付いた (狙い無し)", "Something was added (no target)") : tr("狙いの MOD が消えた", "A target mod was removed") }}</p>
    </div>


    <!-- 下の行: 戻りの矢印・完成 (下の＋は箱の外なので重ならない) -->
    <div class="pointer-events-none absolute inset-x-2 bottom-1 flex h-6 items-center gap-1 text-[11px] *:pointer-events-auto" :style="k > 1 ? { right: 'auto', width: `${(BOX_W - 16 - (box.out === 'hit' ? 22 : 0)) / k}px`, ...keep('left bottom') } : {}">
      <template v-if="box.back">
        <!-- 戻り先の札: 乗せると戻りの線が出て戻り先が光る、押すとそこへ寄る (線は既定で引かない、10-22) -->
        <button type="button" data-tree-back-tag class="nodrag flex h-6 min-w-0 flex-1 items-center truncate rounded px-1 text-left text-cyan-200 hover:bg-cyan-400/15" :class="quiet ? '!pointer-events-none' : ''" :title="tr(`戻り先: ${backLabel} (押すとそこへ寄る)`, `Returns to: ${backLabel} (click to go there)`)"
          @pointerenter="emit('backHover', true)" @pointerleave="emit('backHover', false)" @focus="emit('backHover', true)" @blur="emit('backHover', false)" @click.stop="!quiet && emit('backGo')"><span class="min-w-0 truncate">↩ {{ backLabel }}</span></button>
        <button v-if="!quiet" type="button" class="nodrag -mr-1 flex size-6 items-center justify-center rounded opacity-60 hover:bg-white/10 hover:opacity-100" :title="tr('戻りの矢印を外す', 'Remove the return arrow')" @click.stop="emit('clearBack')"><Icon name="x" class="size-3" /></button>
      </template>
      <template v-else-if="!box.hand && !box.split && box.out !== 'start' && !quiet">
        <button v-if="!box.done" type="button" class="nodrag h-6 shrink-0 whitespace-nowrap rounded border border-cyan-400/40 px-1.5 text-cyan-200 hover:border-cyan-300" :class="k > 1 ? 'min-w-6' : ''" :title="tr('↩ 戻る (既にある箱を指す)', '↩ Return (point to an existing box)')" @click.stop="emit('back')">{{ k > 1 ? "↩" : tr("↩ 戻る", "↩ Return") }}</button>
        <button v-if="box.out === 'hit' || box.out === 'branch'" type="button" class="nodrag h-6 shrink-0 whitespace-nowrap rounded border border-amber-400/40 px-1.5 text-amber-200 hover:border-amber-300" @click.stop="emit('done')" :title="doneText">{{ k > 1 && !box.done ? tr("完成", "Done") : doneText }}</button>
        <!-- 外れ・狙いが消えたの行き先に一番使う手 (オーナー 10-22): 当たりのどれかが付くまでカオス -->
        <button v-if="box.out === 'junk' || box.out === 'lost'" type="button" data-tree-spam class="nodrag h-6 shrink-0 whitespace-nowrap rounded border border-amber-400/40 px-1.5 text-amber-200 hover:border-amber-300" :title="tr('狙いのどれかが付くまでカオスを打ち続ける。付いたらその当たりの枝へ', 'Keep using Chaos Orbs until any target hits, then follow that hit')" @click.stop="emit('spam')">{{ tr("カオススパム", "Chaos spam") }}</button>
      </template>
    </div>

    <!-- 横の＋ = 当たりを足す (どれか 1 つが叶う) -->
    <button v-if="box.out === 'hit' && !quiet" type="button" data-tree-add-hit :style="k > 1 ? { ...keep('center'), top: 'calc(50% + 4px)' } : {}" class="nodrag absolute -right-4 top-1/2 flex size-7 -translate-y-1/2 touch-none items-center justify-center rounded-full border-2 border-amber-400/70 bg-[#1d1812] text-amber-200 hover:bg-amber-500/30"
      :title="tr('当たりを横に足す (どれか 1 つが叶えば当たり)。長押しで引っ張り箱の上で離すとその箱へつなぐ', 'Add another hit beside (any one counts). Hold and drag onto a box to link')" @pointerdown.stop="emit('plus', 'side', $event)" @click.stop><Icon name="plus" class="size-4" /></button>
    <!-- 下の＋ = 次に打つ手 (箱の下の外。完成・戻るのボタンと重ならない) -->
    <button v-if="free && !quiet" type="button" data-tree-next :style="keep('center')" class="nodrag absolute -bottom-[34px] left-1/2 flex size-7 -translate-x-1/2 touch-none items-center justify-center rounded-full border-2 border-amber-400/70 bg-[#1d1812] text-amber-200 hover:bg-amber-500/30"
      :title="tr('次に打つ手を足す。長押しで引っ張り箱の上で離すとその箱へ戻る', 'Add the next craft. Hold and drag onto a box to return there')" @pointerdown.stop="emit('plus', 'next', $event)" @click.stop><Icon name="plus" class="size-4" /></button>
  </div>
</template>
