<!--
  TreeTrial.vue — ツリーの右の欄: 試し打ち (2026-10-22 オーナー「エンジンでカレンシーを使えるように。外れのやり方を決める時にカレンシーを打たせて決める」
  →「名前だけの表示はもったいない。使えるカレンシーはクラフト台と同じで、アイコンも挙動もそのまま移植」)。
  箱を押すと、その箱に着いた時のアイテムの見本 (tree-sample.ts、エンジンで打って引いた 1 個) が出る。棚はクラフト台の CurrencyShelf をそのまま
  (provideShelf で見本を渡す。シミュのクイズ StageQuizEditor と同じ形)、棚で持ってアイテムを押すと打つ。打つのはエンジンの入口 (applyCurrency) だけ。
  ツリーには何も書かない (見て決める用)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { craftStage as s, iconOf, nameOf } from "../../../state/craft-stage";
import { provideShelf, simHidden } from "../../../state/emulator/shelf-context";
import CurrencyShelf from "../../craft-stage/CurrencyShelf.vue";
import ShelfButton from "../../craft-stage/ShelfButton.vue";
import HeldOmens from "../../craft-stage/HeldOmens.vue";
import { heldOmensOf } from "../../craft-stage/held-omens";
import StageItemCard from "../../craft-stage/StageItemCard.vue";
import { allMods, applyCurrency, kindOf, mulberry32, omensFor, previewUse, revealOffers, unrevealedOf, type StageApply, type StageItem, type StageMod } from "../../../services/craft-stage/engine";
import { aimsOf, fillCatalyst, playHand, sampleOf } from "../../../services/simulator/tree/tree-sample";
import { TREE_CATALYSTS } from "../../../services/simulator/tree/tree-hands";
import { handLabel } from "./tree-names";
import { useTree } from "./use-tree";
import { sampleKeyOf, toggleUnwanted, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { modText, tr } from "../../../i18n/lang";
import { useDismiss } from "../../../utils/use-dismiss";

const props = defineProps<{ boxId: string }>();
const emit = defineEmits<{ close: []; next: []; note: [] }>();
const t = useTree();

const seed = ref(1);
/** 見本は道の形が変わった時だけ作り直す (× の印・メモ・箱の位置では作り直さない。sampleKeyOf) */
const sampleDoc = computed(() => sampleKeyOf(t.doc.value));
const sample = computed(() => (s.data.value ? sampleOf(s.data.value, JSON.parse(sampleDoc.value) as TreeDoc, props.boxId, seed.value) : null));
/** 試し打ちのアイテムの並び (先頭 = 見本、1 つ戻すで前へ) */
const trail = shallowRef<StageItem[]>([]);
const log = ref<Array<{ text: string; ok: boolean }>>([]);
const last = shallowRef<{ added: StageMod[]; removed: StageMod[] }>({ added: [], removed: [] });
const flash = ref(0);
let rolls = 0;
watch(sample, (v) => { trail.value = v ? [v.item] : []; log.value = []; last.value = { added: [], removed: [] }; }, { immediate: true });
const item = computed(() => trail.value[trail.value.length - 1] ?? null);
const box = computed(() => t.doc.value.boxes[props.boxId] ?? null);

// 棚 (クラフト台と同じ部品)。持つ → アイテムを押すと打つ。お告げは持った物に掛けられる物だけ使い、使った分は外す (クラフト台と同じ)
const held = ref<string | null>(null);
const omens = ref<string[]>([]);
/** 同じ物をもう一度押す = 離す (クラフト台と同じ、オーナー 10-22) */
function onHold(k: string): void { if (held.value === k) release(); else held.value = k; }
/** 棚の空いている所を押す = 離す (ボタン・入力・お告げの欄の中は除く) */
function onShelfDown(e: PointerEvent): void { if (held.value && !(e.target as HTMLElement).closest("button,input,select,label,[data-held-box]")) release(); }
function toggleOmen(id: string): void { omens.value = omens.value.includes(id) ? omens.value.filter((o) => o !== id) : [...omens.value, id]; }
provideShelf({
  data: s.data, item, omens, held,
  usable: (k) => {
    const d = s.data.value, it = item.value;
    if (!d || !it) return tr("準備中", "Loading");
    const r = applyCurrency(d, it, k, mulberry32(0), omens.value);
    return r.applied || r.random ? null : (r.reason ?? tr("打てない", "Can't use"));
  },
  toggleOmen,
  hidden: simHidden,
});
/** 手放す (カードの札どおり 右クリック / Esc。Esc は欄を閉じるより先) */
function release(): void { held.value = null; omens.value = []; }
/** 持っている物を打つ前に光らせる (クラフト台と同じ previewUse: 変わる候補の MOD はオレンジの文字、付く空きは緑の枠) */
const preview = computed(() => (held.value && item.value && s.data.value ? previewUse(s.data.value, item.value, held.value, omens.value) : null));
function onKey(e: KeyboardEvent): void { if (e.key === "Escape" && held.value) { release(); e.stopImmediatePropagation(); } }
onMounted(() => window.addEventListener("keydown", onKey, true));
/** 持った物は、棚・カード・持っている物の行・カタリストの外を押すと離す (クラフト台と同じ、共通の useDismiss。押した物には届ける) */
const shelfEl = ref<HTMLElement | null>(null), cardEl = ref<HTMLElement | null>(null), heldEl = ref<HTMLElement | null>(null), catEl = ref<HTMLElement | null>(null);
useDismiss(() => !!held.value, [shelfEl, cardEl, heldEl, catEl], release, { swallow: false, keep: "[role=dialog], [data-helptip-pop], [data-mod-list]" });
onBeforeUnmount(() => window.removeEventListener("keydown", onKey, true));

function push(r: StageApply, label: string): void {
  if (!r.applied) { log.value.unshift({ text: `${label}: ${r.reason ?? tr("打てない", "Can't use")}`, ok: false }); return; }
  trail.value = [...trail.value, r.item];
  last.value = { added: r.added, removed: r.removed };
  flash.value++;
  const add = r.added.map((m) => `+ ${modText(m)} ${m.tierName}`);
  const rem = r.removed.map((m) => `− ${modText(m)} ${m.tierName}`);
  log.value.unshift({ text: `${label}${add.length || rem.length ? ` → ${[...rem, ...add].join(" / ")}` : ""}`, ok: true });
}
const rng = (): (() => number) => mulberry32(seed.value * 100003 + ++rolls);
/** 持っている物を打つ (アイテムを押した時・×10)。カタリストは 1 個ずつ */
function use(times = 1): void {
  const d = s.data.value, k = held.value;
  if (!d || !k || !item.value) return;
  for (let i = 0; i < times; i++) {
    const om = omensFor(k, omens.value);
    // カタリストは 1 押しで今の品質の最大まで (個数を数えて入れない、オーナー 10-22)
    if (kindOf(k) === "catalyst") { const c = fillCatalyst(d, item.value!, k, rng()); push(c, tr(`${nameOf(k)} × ${c.count} (品質 ${c.item.quality}%)`, `${nameOf(k)} ×${c.count} (quality ${c.item.quality}%)`)); break; }
    const r = applyCurrency(d, item.value!, k, rng(), om);
    push(r, [nameOf(k), ...om.map(nameOf)].join(" + "));
    if (!r.applied) break;
    const used = r.omensUsed ?? [];
    if (used.length) omens.value = omens.value.filter((o) => !used.includes(o));
  }
}
/** カタリスト: 1 押しで今の品質の最大まで (クラフト台の棚にはカタリストが無いので、同じボタンで段を 1 つ足す。オーナー 10-22「個数を数えて入れない」) */
function fill(k: string): void {
  const d = s.data.value;
  if (!d || !item.value) return;
  const c = fillCatalyst(d, item.value, k, rng());
  push(c, tr(`${nameOf(k)} × ${c.count} (品質 ${c.item.quality}%)`, `${nameOf(k)} ×${c.count} (quality ${c.item.quality}%)`));
}
/** この箱の次の手をそのまま 1 回 */
function useHand(): void {
  const d = s.data.value, h = box.value?.hand;
  if (d && h && item.value) push(playHand(d, item.value, h, rng(), aimsOf(t.doc.value)), handLabel(h));
}
// 冒涜の発現 (候補は同じ乱数で見せて、選んだ番号を打つ)
const revealSeed = ref(0);
const offers = computed(() => (s.data.value && item.value && unrevealedOf(item.value) ? revealOffers(s.data.value, item.value, mulberry32(revealSeed.value)).first : []));
function reveal(n: number): void {
  const d = s.data.value;
  if (d && item.value) { push(applyCurrency(d, item.value, `reveal:${n}`, mulberry32(revealSeed.value)), tr(`発現 (${n} 番目)`, `Reveal (#${n})`)); revealSeed.value++; }
}
function back(): void {
  if (trail.value.length < 2) return;
  trail.value = trail.value.slice(0, -1);
  last.value = { added: [], removed: [] };
  log.value.unshift({ text: tr("1 つ戻した", "Undid one"), ok: true });
}
/** × (要らない) の印: 持っていない時に MOD の行を押すと付ける / 外す (この箱の印。フラクチャーは消せないので付けない、オーナー 10-22) */
function onMark(modId: string): void {
  const m = item.value ? allMods(item.value).find((x) => x.modId === modId) : null;
  if (!m || m.fractured) return;
  t.edit((d) => toggleUnwanted(d, props.boxId, modId));
}
const marks = computed(() => (box.value?.unwanted ?? []).map((id) => {
  const m = item.value ? allMods(item.value).find((x) => x.modId === id) : null;
  return { id, text: m ? `${m.tierName} ${modText(m)}` : tr("(この見本には無い MOD)", "(not on this sample)") };
}));
function resetSample(): void { trail.value = trail.value.slice(0, 1); log.value = []; last.value = { added: [], removed: [] }; }

const NOTE: Record<string, [string, string]> = {
  forced: ["上の手を 3000 回打っても出なかったので、親の見本に MOD を付けて作った見本 (この手では付かないかもしれない。側・段を確かめる)", "Not rolled in 3000 tries of the craft above, so the mod was added to the parent's sample (this craft may not be able to roll it; check the side and tier)"],
  none: ["上の手を 3000 回打ってもこの結果が出なかったので、親の見本のまま", "This result didn't come up in 3000 tries; showing the parent's sample"],
};
const noteText = computed(() => {
  const n = sample.value?.note;
  if (!n) return "";
  if (n.startsWith("cant:")) return tr(`この箱へ来る手が打てない (${n.slice(5)})。親の見本のまま`, `The craft leading here can't be used (${n.slice(5)}). Showing the parent's sample`);
  return NOTE[n] ? tr(NOTE[n]![0], NOTE[n]![1]) : n;
});
</script>

<template>
  <div data-tree-trial class="flex h-full min-h-0 flex-col gap-2 text-[13px]">
    <div class="flex items-center gap-2">
      <b class="flex-1 text-[14px]">{{ tr("試し打ち", "Try it") }}</b>
      <button type="button" class="g-btn sm" @click="emit('close')">{{ tr("閉じる", "Close") }}</button>
    </div>
    <p class="text-[11px] opacity-65">{{ tr("この箱に着いた時のアイテムの見本 (エンジンで打って引いた 1 個)。棚で持ってアイテムを押すと打つ。ツリーは変わらない", "A sample item at this box (rolled with the engine). Pick from the shelf, then click the item. The tree doesn't change") }}</p>
    <p v-if="noteText" class="rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">{{ noteText }}</p>

    <!-- 広い時はカード (左) と棚 (右) を横に並べ、列ごとに送る (クラフト台と同じ。1920×911 で 持つ → お告げ → カードを押す の間に上下へ送っていた、10-21)。
         狭い時は縦に 1 列。ページは zoom で大きくなるので 2 列の境は CSS の幅で 620px -->
    <div class="@container min-h-0 flex-1">
      <div class="grid gap-3 @min-[620px]:h-full @min-[620px]:grid-cols-[350px_minmax(0,1fr)]">
        <div data-tree-trial-left class="flex min-w-0 flex-col gap-2 @min-[620px]:min-h-0 @min-[620px]:overflow-y-auto">
          <!-- アイテム (クラフト台のカード。持っている時に押すと打つ) -->
          <div v-if="item" ref="cardEl" data-tree-trial-item class="flex justify-center pb-7" @contextmenu.prevent="release">
            <StageItemCard :item="item" :doomed="preview?.change ?? []" :open="preview?.open" :added="last.added" :removed="last.removed" :holding="!!held" :flash-key="flash" :width="340" compact @use="use(1)" @jump="onMark" />
          </div>
          <!-- × (要らない) の印 -->
          <div data-tree-unwanted-list class="flex flex-col gap-1">
            <p class="text-[11px] opacity-60">{{ tr("MOD の行を押すと × (要らない) の印。完成まで残るとルート精査で !", "Click a mod row to mark it × (unwanted). Route check flags it if it's still there when done") }}</p>
            <div v-for="mk in marks" :key="mk.id" class="flex min-w-0 items-center gap-1.5 rounded bg-rose-500/10 px-1.5 text-[12px]">
              <span class="shrink-0 font-bold text-rose-300">×</span><span class="min-w-0 flex-1 truncate" :title="mk.text">{{ mk.text }}</span>
              <button type="button" class="g-btn sm" @click="t.edit((d) => toggleUnwanted(d, boxId, mk.id))">{{ tr("外す", "Unmark") }}</button>
            </div>
          </div>

          <!-- 持っている物 (カードの下の「押すと使う」の札はカードの枠の pb-7 の中) -->
          <div ref="heldEl" class="flex flex-wrap items-center gap-1.5">
            <template v-if="held">
              <span class="flex items-center -space-x-1"><img v-for="ic in [held, ...omensFor(held, omens)].filter((x) => !!iconOf(x))" :key="ic" :src="iconOf(ic)" alt="" class="size-6 object-contain" /></span>
              <b class="min-w-0 flex-1 basis-56 truncate" :title="[nameOf(held), ...omensFor(held, omens).map(nameOf)].join(' + ')">{{ [nameOf(held), ...omensFor(held, omens).map(nameOf)].join(" + ") }}</b>
              <button type="button" data-tree-trial-use class="g-btn-red sm" @click="use(1)">{{ tr("打つ", "Use") }}</button>
              <button type="button" class="g-btn sm" @click="use(10)">×10</button>
              <button type="button" class="g-btn sm" @click="release">{{ tr("やめる", "Cancel") }}</button>
            </template>
            <template v-else>
              <button v-if="box?.hand" type="button" data-tree-trial-hand class="g-btn sm min-w-0 max-w-full truncate" :title="handLabel(box.hand)" @click="useHand">{{ tr("この箱の手を打つ", "Use this box's craft") }}: {{ handLabel(box.hand) }}</button>
              <span class="text-[12px] text-[var(--exile-color-text-tertiary)]">{{ tr("棚から打つ物を持つ", "Pick a currency below") }}</span>
            </template>
          </div>
          <div class="flex flex-wrap gap-1">
            <button type="button" class="g-btn sm" :disabled="trail.length < 2" @click="back">{{ tr("1 つ戻す", "Undo") }}</button>
            <button type="button" class="g-btn sm" @click="seed++">{{ tr("別の見本", "Another sample") }}</button>
            <button type="button" class="g-btn sm" :disabled="trail.length < 2" @click="resetSample">{{ tr("見本に戻す", "Reset") }}</button>
            <button type="button" data-tree-trial-note class="g-btn sm" @click="emit('note')">{{ box?.note ? tr("メモを見る", "View note") : tr("メモ", "Note") }}</button>
            <button v-if="box && !box.hand && !box.back && !box.done" type="button" class="g-btn sm" @click="emit('next')">{{ tr("この箱の次の手を決める", "Set this box's next craft") }}</button>
          </div>
          <div v-if="offers.length" class="flex flex-col gap-1 rounded bg-rose-500/10 p-1.5">
            <p class="text-[11px] font-bold">{{ tr("発現: 候補から選ぶ", "Reveal: pick one") }}</p>
            <button v-for="(m, i) in offers" :key="i" type="button" class="truncate rounded border border-white/15 px-1.5 py-0.5 text-left text-[12px] hover:border-rose-300" :title="modText(m)" @click="reveal(i + 1)">{{ m.tierName }} {{ modText(m) }}</button>
          </div>
          <!-- 打った結果 -->
          <div v-if="log.length" class="max-h-40 overflow-y-auto">
            <p v-for="(l, i) in log" :key="log.length - i" class="py-0.5 text-[11px]" :class="l.ok ? 'opacity-85' : 'text-rose-300'">{{ l.text }}</p>
          </div>
        </div>
        <div data-tree-trial-right class="flex min-w-0 flex-col gap-2 @min-[620px]:min-h-0 @min-[620px]:overflow-y-auto @min-[620px]:pr-1">
          <!-- 棚 (クラフト台と同じ。お告げは持った物の下に) -->
          <div ref="shelfEl" data-tree-shelf @pointerdown="onShelfDown">
            <CurrencyShelf @hold="onHold">
              <!-- 持った物に掛けられるお告げ = クラフト台と同じ部品と置き場 (HeldOmens.vue を持ったアイコンのすぐ下に重ねる。inline-held だと棚の一番下で見切れた、10-21 本物のマウス) -->
              <template v-if="heldOmensOf(held).length" #held><HeldOmens /></template>
            </CurrencyShelf>
          </div>
          <!-- カタリスト (1 押しで品質の最大まで。最大はエンジンの maxQualityOf)。棚の下 = オーブの行が列の上に来て、お告げの欄が下に開ける -->
          <div ref="catEl" data-tree-trial-catalysts>
            <p class="mb-0.5 text-[10px] opacity-60">{{ tr("カタリスト (押すと品質の最大まで入れる)", "Catalysts (click to fill to max quality)") }}</p>
            <div class="flex flex-wrap gap-1.5"><ShelfButton v-for="k in TREE_CATALYSTS" :key="k" :k="k" @pick="fill" /></div>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>
