<!--
  TreeStartAsk.vue — ② 完成の MOD から ③ ツリーへ行く時の始め方 (10-26 夜オーナー「ツリーへ行くボタンを押した時に…ポップアップを出して、そこで決める形に統一」、最終形「OK それで作って」)。
  パターン 1 (✦ の印が無い): 「フラクチャーから」= 完成の狙いから MOD を 1 つ選ぶ → (a) フラクチャー済みから / (b) 白から確定フラクチャーのコース + 費用、と「白ベースから (フラクチャー無し)」。
  パターン 2 (② で ✦ を付けてある)・3 (貼り付け / エミュから ✦ 付きで来た): MOD 選びは飛ばし (a) / (b) だけ。白ベースは出さない。
  決める中身は tree-start-choice.ts (スマホと共用)。やめる・Esc・枠の外 = 何も変えず ② に残る
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import ModalShell from "../../../components/ui/ModalShell.vue";
import { tr } from "../../../i18n/lang";
import { aimKey, type StartFrom } from "../../../services/simulator/tree/tree-model";
import { applyStartChoice, markedGoal } from "./tree-start-choice";
import { useTree } from "./use-tree";
import { sureFracText } from "./tree-names";
import { flag } from "../../../web/release-flags";
import { craftStage as s } from "../../../state/craft-stage";

const emit = defineEmits<{ done: []; close: [] }>();
const t = useTree();
const goals = computed(() => t.goals.value);
/** パターン 2・3: 印のある狙い (MOD 選びを飛ばす) */
const marked = markedGoal(t.goals.value);
/** 選んだ狙い (aimKey、null = 白ベースから) と始め方 (a) / (b) */
/**
 * フラクチャーから始められるのは ✦ が 1 つの時だけ (S-13・S-14、10-28 オーナー「単発のみフラクチャースタートできるようにさせるか」、スイッチ fracOne):
 * ✦ が 2 つ以上 = 白ベースからだけ (印は残して木の中でフラクチャー)。1 つ以下 = ✦ を 1 つ選ぶ。既定は印、無ければ完成の狙いの先頭のフラクチャーできる MOD (冒涜は飛ばす)
 */
const ONE = flag("fracOne");
const multiWhite = ONE && goals.value.filter((a) => a.fractured).length > 1;
const firstFrac = (): string | null => { const g = goals.value.find((a) => s.data.value?.mods.get(a.modId)?.source !== "desecrated"); return g ? aimKey(g) : null; };
const pick = ref<string | null>(marked ? aimKey(marked) : ONE ? firstFrac() : null);
const from = ref<StartFrom>(t.doc.value.start?.from ?? "fractured");
type Pair = [string, string];
const FROMS = computed((): Array<{ k: StartFrom; title: Pair; sub: Pair }> => { const x = sureFracText(MULTI ? picks.value.length : 1); return [ // 素材の倍は ✦ の数で (S-43)
  { k: "fractured", title: ["(a) フラクチャー済みから", "(a) From fractured"], sub: ["その MOD が ✦ で付いたレアから始める (フラクチャーの費用は無し)", "Start from a rare with that mod fractured (no fracture cost)"] },
  { k: "four", title: ["(b) 白から確定フラクチャーのコース", "(b) From white, sure fracture"], sub: [`白 (ノーマル) のベースから始め、木の中でフラクチャー (必ず成功、素材 ${x} の費用込み)`, `Start from a white (normal) base and fracture in the tree (sure success, materials ${x} cost included)`] },
]; });
/**
 * ✦ を複数 (スイッチ fracMulti、10-28 オーナー「✦ を複数設定してよい」「フラクチャーせずに開始にするなよとは思う」): MOD は ☑ で選び、既定は印のある MOD
 * (無ければ完成の MOD 全部 = ✦ 付きで始めるのを勧める)。☑ を全部外すと白ベースから (フラクチャー無し、一番下)
 */
const MULTI = flag("fracMulti") && !ONE;
const picks = ref<string[]>(goals.value.some((a) => a.fractured) ? goals.value.filter((a) => a.fractured).map(aimKey) : goals.value.map(aimKey));
const pickedGoal = computed(() => (MULTI ? (picks.value.length ? goals.value[0] ?? null : null) : goals.value.find((a) => aimKey(a) === pick.value) ?? null));
function decide(): void {
  const k = multiWhite ? goals.value.filter((a) => a.fractured).map(aimKey) : MULTI ? picks.value : pick.value, f = multiWhite ? "four" : from.value;
  t.edit((d) => { applyStartChoice(d, k, f); d.fracAsked = true; });
  emit("done");
}
</script>

<template>
  <ModalShell :open="true" layer="confirm" rec="tree-start-ask" :title="tr('どこから始める?', 'Where to start?')" width="w-full max-w-xl" full-on-phone body-class="px-4 py-3" @close="emit('close')">
    <div data-tree-start-ask :data-pattern="multiWhite ? 'multi-white' : marked && !ONE ? 2 : 1" class="flex flex-col gap-3 text-[13px]">
      <!-- ✦ が 2 つ以上: 白ベースからだけ (スイッチ fracOne) -->
      <section v-if="multiWhite" data-tree-start-ask-multi-white class="g-item flex flex-col gap-2 bg-black/50 px-3 py-2.5">
        <b class="text-[15px] text-[var(--exile-color-text-title)]">{{ tr("白ベースから", "From a white base") }}</b>
        <p v-for="a in goals.filter((x) => x.fractured)" :key="aimKey(a)" class="break-words text-mod-fractured">✦ {{ t.aimLabel(a) }}</p>
        <p class="text-[12px] opacity-75">{{ tr("✦ が 2 つ以上なので、白 (ノーマル) のベースから始め、フラクチャーは木の中で打つ (どの ✦ が固定されても当たり)。フラクチャー済みから始めるなら、完成形の設定で ✦ を 1 つにする", "With 2 or more ✦ marks you start from a white (normal) base and fracture in the tree (a hit if any ✦ is fixed). To start from a fractured item, keep just one ✦ in the final item settings") }}</p>
      </section>
      <!-- ✦ を複数 (スイッチ fracMulti): ☑ で選ぶ。既定は ✦ 付き、おすすめの一言 -->
      <section v-else-if="MULTI" data-tree-start-ask-multi class="g-item flex flex-col gap-2 bg-black/50 px-3 py-2.5">
        <b class="text-[15px] text-[var(--exile-color-text-title)]">{{ tr("フラクチャーから (おすすめ)", "From a fractured mod (recommended)") }}</b>
        <p class="text-[12px] opacity-70">{{ tr("✦ にする MOD を選ぶ (いくつでも。フラクチャーでどれか 1 つが固定されれば当たり、✦ が多いほど当たりやすい)", "Pick the mods to mark ✦ (any number; a fracture is a hit if any one of them is fixed, more ✦ = more likely)") }}</p>
        <label v-for="a in goals" :key="aimKey(a)" data-tree-start-ask-mod class="flex min-w-0 cursor-pointer items-start gap-2 rounded px-1.5 py-1 hover:bg-white/[0.06]" :class="picks.includes(aimKey(a)) ? 'bg-[rgba(163,52,42,0.35)]' : ''">
          <input v-model="picks" type="checkbox" :value="aimKey(a)" class="mt-1 shrink-0" />
          <span class="min-w-0 break-words" :class="picks.includes(aimKey(a)) ? 'text-mod-fractured' : 'text-[#c8c8ff]'">{{ picks.includes(aimKey(a)) ? "✦ " : "" }}{{ t.aimLabel(a) }}</span>
        </label>
      </section>
      <!-- パターン 1: フラクチャーから (MOD を 1 つ選ぶ) -->
      <section v-else-if="!marked || ONE" class="g-item flex flex-col gap-2 bg-black/50 px-3 py-2.5">
        <b class="text-[15px] text-[var(--exile-color-text-title)]">{{ ONE ? tr("フラクチャーから (おすすめ)", "From a fractured mod (recommended)") : tr("フラクチャーから", "From a fractured mod") }}</b>
        <p class="text-[12px] opacity-70">{{ tr("フラクチャー (✦) にする MOD を 1 つ選ぶ", "Pick the one mod to fracture (✦)") }}</p>
        <label v-for="a in goals" :key="aimKey(a)" data-tree-start-ask-mod class="flex min-w-0 cursor-pointer items-start gap-2 rounded px-1.5 py-1 hover:bg-white/[0.06]" :class="pick === aimKey(a) ? 'bg-[rgba(163,52,42,0.35)]' : ''">
          <input v-model="pick" type="radio" name="tree-start-ask" :value="aimKey(a)" class="mt-1 shrink-0" />
          <span class="min-w-0 break-words" :class="pick === aimKey(a) ? 'text-mod-fractured' : 'text-[#c8c8ff]'">{{ pick === aimKey(a) ? "✦ " : "" }}{{ t.aimLabel(a) }}</span>
        </label>
      </section>
      <!-- パターン 2・3: ✦ の付いた MOD (選び直しは ② で) -->
      <p v-else-if="marked" data-tree-start-ask-marked class="g-item break-words bg-black/50 px-3 py-2.5 text-mod-fractured">✦ {{ t.aimLabel(marked) }}</p>
      <!-- (a) / (b): MOD が決まっている時だけ -->
      <div v-if="pickedGoal && !multiWhite" data-tree-start-ask-from class="flex flex-col gap-1.5" :class="marked && !ONE ? '' : 'pl-4'">
        <label v-for="o in FROMS" :key="o.k" :data-tree-start-ask-from-k="o.k" class="g-item flex cursor-pointer items-start gap-2 bg-black/50 px-3 py-2 hover:bg-white/[0.06]" :class="from === o.k ? 'bg-[rgba(163,52,42,0.35)]' : ''">
          <input v-model="from" type="radio" name="tree-start-ask-from" :value="o.k" class="mt-1 shrink-0" />
          <span class="flex min-w-0 flex-col gap-0.5"><b class="text-[var(--exile-color-text-title)]">{{ tr(...o.title) }}</b><span class="break-words text-[12px] opacity-75">{{ tr(...o.sub) }}</span></span>
        </label>
      </div>
      <!-- パターン 1: 白ベースから (フラクチャー無し、オーナー「普通にフラクチャー無しで行く人もいる」) -->
      <label v-if="MULTI && !multiWhite" data-tree-start-ask-white class="g-item flex cursor-pointer items-start gap-2 bg-black/30 px-3 py-2 opacity-80 hover:bg-white/[0.06]" :class="!picks.length ? 'bg-[rgba(163,52,42,0.35)]' : ''">
        <input type="radio" :checked="!picks.length" class="mt-1 shrink-0" @change="picks = []" />
        <span class="flex min-w-0 flex-col gap-0.5">
          <b class="text-[var(--exile-color-text-title)]">{{ tr("白ベースから (フラクチャー無し)", "From a white base (no fracture)") }}</b>
          <span class="text-[12px] opacity-70">{{ tr("✦ を付けない。狙いが全部ランダムで付くまで回すので、ふつうは高くつく", "No ✦. Every target has to roll at random, so it usually costs more") }}</span>
        </span>
      </label>
      <label v-else-if="(!marked || ONE) && !multiWhite" data-tree-start-ask-white class="g-item flex cursor-pointer items-start gap-2 bg-black/50 px-3 py-2.5 hover:bg-white/[0.06]" :class="pick === null ? 'bg-[rgba(163,52,42,0.35)]' : ''">
        <input v-model="pick" type="radio" name="tree-start-ask" :value="null" class="mt-1.5 shrink-0" />
        <span class="flex min-w-0 flex-col gap-1">
          <b class="text-[15px] text-[var(--exile-color-text-title)]">{{ tr("白ベースから (フラクチャー無し)", "From a white base (no fracture)") }}</b>
          <span class="text-[12px] opacity-70">{{ ONE ? tr("✦ を付けない。狙いが全部ランダムで付くまで回すので、ふつうは高くつく", "No ✦. Every target has to roll at random, so it usually costs more") : tr("フラクチャー無しの白 (ノーマル) のベースから始める", "Start from a white (normal) base without a fracture") }}</span>
        </span>
      </label>
      <div class="flex justify-end gap-2">
        <button type="button" class="g-btn sm" @click="emit('close')">{{ tr("やめる", "Cancel") }}</button>
        <button type="button" data-tree-start-ask-go class="g-btn-red min-h-10 px-4" @click="decide">{{ tr("これで始める (ツリーへ)", "Start (to the tree)") }}</button>
      </div>
    </div>
  </ModalShell>
</template>
