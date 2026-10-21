<!--
  TreeTrial.vue — ツリーの右の欄: 試し打ち (2026-10-22 オーナー「エンジンでカレンシーを使えるように。外れのやり方を決める時にカレンシーを打たせて決める」)。
  箱を押すと、その箱に着いた時のアイテムの見本 (tree-sample.ts、エンジンで打って引いた 1 個) が出て、カレンシー・お告げ・カタリスト・エッセンス・骨を
  1 回ずつ打てる。打つのはエンジンの入口 (applyCurrency) だけ。ツリーには何も書かない (見て決める用)
-->
<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue";
import { craftStage as s } from "../../../state/craft-stage";
import { applyCurrency, ESSENCE_KEYS, kindOf, mulberry32, OMEN_FOR, revealOffers, unrevealedOf, type StageApply, type StageItem, type StageMod } from "../../../services/craft-stage/engine";
import { aimHeld, aimsOf, playHand, sampleOf } from "../../../services/simulator/tree/tree-sample";
import { handLabel, nameOfKey } from "../../../services/simulator/tree/tree-hands";
import { useTree } from "./use-tree";
import { modText, tr } from "../../../i18n/lang";

const props = defineProps<{ boxId: string }>();
const emit = defineEmits<{ close: []; next: [] }>();
const t = useTree();

const seed = ref(1);
const sample = computed(() => (s.data.value ? sampleOf(s.data.value, t.doc.value, props.boxId, seed.value) : null));
/** 試し打ちのアイテムの並び (先頭 = 見本、1 つ戻すで前へ) */
const trail = shallowRef<StageItem[]>([]);
const log = ref<Array<{ text: string; ok: boolean }>>([]);
let rolls = 0;
watch(sample, (v) => { trail.value = v ? [v.item] : []; log.value = []; }, { immediate: true });
const item = computed(() => trail.value[trail.value.length - 1] ?? null);
const box = computed(() => t.doc.value.boxes[props.boxId] ?? null);

// 打てる物 (金の指輪に関係の無い物も、エンジンが断れば理由が出る)
const BASIC = ["transmute", "transmute_greater", "transmute_perfect", "augment", "augment_greater", "augment_perfect", "regal", "regal_greater", "regal_perfect", "alchemy",
  "chaos", "chaos_greater", "chaos_perfect", "exalt", "exalt_greater", "exalt_perfect", "annul", "divine", "fracture", "vaal"];
const CATS = ["catalyst_speed", "catalyst_cold", "catalyst_fire", "catalyst_lightning", "catalyst_chaos", "catalyst_caster", "catalyst_attack", "catalyst_life", "catalyst_mana", "catalyst_defences", "catalyst_physical", "catalyst_attribute", "catalyst_minion"];
const BONES = ["desecrate", "desecrate_ancient", "desecrate_gnawed", "desecrate_altered"];
const BONE_NAME: Record<string, string> = { desecrate: "collarbone", desecrate_ancient: "collarbone_ancient", desecrate_gnawed: "collarbone_gnawed", desecrate_altered: "collarbone_altered" };
const essences = computed(() => Object.entries(ESSENCE_KEYS).map(([k, n]) => ({ k, name: tr(n.ja, n.en) })));
const labelOf = (k: string): string => (BONE_NAME[k] ? nameOfKey(BONE_NAME[k]!) : nameOfKey(k));

const cur = ref("chaos");
const omens = ref<string[]>([]);
const omenChoices = computed(() => OMEN_FOR[kindOf(cur.value)] ?? []);
watch(cur, () => { omens.value = omens.value.filter((o) => omenChoices.value.includes(o)); });

function push(r: StageApply, label: string): void {
  if (!r.applied) { log.value.unshift({ text: `${label}: ${r.reason ?? tr("打てない", "Can't use")}`, ok: false }); return; }
  trail.value = [...trail.value, r.item];
  const add = r.added.map((m) => `+ ${modText(m)} ${m.tierName}`);
  const rem = r.removed.map((m) => `− ${modText(m)} ${m.tierName}`);
  log.value.unshift({ text: `${label}${add.length || rem.length ? ` → ${[...rem, ...add].join(" / ")}` : ""}`, ok: true });
}
const rng = (): (() => number) => mulberry32(seed.value * 100003 + ++rolls);
function use(times = 1): void {
  const d = s.data.value;
  if (!d || !item.value) return;
  for (let i = 0; i < times; i++) {
    const r = applyCurrency(d, item.value!, cur.value, rng(), omens.value, kindOf(cur.value) === "catalyst" ? { oneCatalyst: true } : {});
    push(r, [labelOf(cur.value), ...omens.value.map(nameOfKey)].join(" + "));
    if (!r.applied) break;
  }
}
/** この箱の次の手をそのまま 1 回 */
function useHand(): void {
  const d = s.data.value, h = box.value?.hand;
  if (d && h && item.value) push(playHand(d, item.value, h, rng()), handLabel(h));
}
// 冒涜の発現 (候補は同じ乱数で見せて、選んだ番号を打つ)
const revealSeed = ref(0);
const offers = computed(() => (s.data.value && item.value && unrevealedOf(item.value) ? revealOffers(s.data.value, item.value, mulberry32(revealSeed.value)).first : []));
function reveal(n: number): void {
  const d = s.data.value;
  if (d && item.value) { push(applyCurrency(d, item.value, `reveal:${n}`, mulberry32(revealSeed.value)), tr(`発現 (${n} 番目)`, `Reveal (#${n})`)); revealSeed.value++; }
}
function back(): void { if (trail.value.length > 1) { trail.value = trail.value.slice(0, -1); log.value.unshift({ text: tr("1 つ戻した", "Undid one"), ok: true }); } }

const aims = computed(() => aimsOf(t.doc.value));
const isAim = (m: StageMod): boolean => !!s.data.value && aims.value.some((a) => aimHeld(s.data.value!, { ...item.value!, prefixes: [m], suffixes: [] }, a));
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
  <div data-tree-trial class="flex min-h-0 flex-col gap-2 text-[13px]">
    <div class="flex items-center gap-2">
      <b class="flex-1 text-[14px]">{{ tr("試し打ち", "Try it") }}</b>
      <button type="button" class="g-btn sm" @click="emit('close')">{{ tr("閉じる", "Close") }}</button>
    </div>
    <p class="text-[11px] opacity-65">{{ tr("この箱に着いた時のアイテムの見本 (エンジンで打って引いた 1 個)。ここで打ってもツリーは変わらない", "A sample item at this box (rolled with the engine). Trying crafts here doesn't change the tree") }}</p>
    <p v-if="noteText" class="rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">{{ noteText }}</p>

    <!-- アイテム -->
    <div v-if="item" data-tree-trial-item class="rounded-md bg-black/40 px-2 py-1.5">
      <p class="mb-1 text-[11px] opacity-70">{{ tr("品質", "Quality") }} {{ item.quality }}%<template v-if="item.qualityTag && item.quality > 0"> ({{ nameOfKey(`catalyst_${item.qualityTag}`) }})</template> · {{ item.rarity }}</p>
      <template v-for="side in (['prefixes', 'suffixes'] as const)" :key="side">
        <p class="text-[10px] font-bold opacity-60">{{ side === "prefixes" ? tr("プレフィックス", "Prefixes") : tr("サフィックス", "Suffixes") }}</p>
        <p v-for="(m, i) in item[side]" :key="`${side}-${i}`" class="flex min-w-0 items-center gap-1 text-[12px]" :class="isAim(m) ? 'text-amber-200' : 'text-[#c8c8ff]'">
          <span class="shrink-0 rounded-sm bg-white/10 px-1 text-[10px]">{{ m.tierName }}</span>
          <span class="min-w-0 truncate" :title="modText(m)">{{ m.unrevealed ? tr("(未発現)", "(Unrevealed)") : modText(m) }}</span>
          <span v-if="m.fractured" class="shrink-0 text-[10px] text-teal-300">{{ tr("固定", "Fractured") }}</span>
          <span v-if="m.desecrated" class="shrink-0 text-[10px] text-rose-300">{{ tr("冒涜", "Desecrated") }}</span>
        </p>
        <p v-if="!item[side].length" class="text-[11px] opacity-40">—</p>
      </template>
    </div>

    <!-- 打つ -->
    <div class="flex flex-col gap-1.5 rounded-md bg-white/[0.04] p-2">
      <button v-if="box?.hand" type="button" data-tree-trial-hand class="g-btn sm truncate" :title="handLabel(box.hand)" @click="useHand">{{ tr("この箱の手を打つ", "Use this box's craft") }}: {{ handLabel(box.hand) }}</button>
      <select v-model="cur" data-tree-trial-cur class="h-8 w-full rounded-md border border-white/15 bg-black/40 px-1">
        <optgroup :label="tr('カレンシー', 'Currency')"><option v-for="k in BASIC" :key="k" :value="k">{{ labelOf(k) }}</option></optgroup>
        <optgroup :label="tr('カタリスト (1 個ずつ)', 'Catalysts (one at a time)')"><option v-for="k in CATS" :key="k" :value="k">{{ labelOf(k) }}</option></optgroup>
        <optgroup :label="tr('骨 (冒涜)', 'Bones (Desecration)')"><option v-for="k in BONES" :key="k" :value="k">{{ labelOf(k) }}</option></optgroup>
        <optgroup :label="tr('エッセンス', 'Essences')"><option v-for="e in essences" :key="e.k" :value="e.k">{{ e.name }}</option></optgroup>
      </select>
      <div v-if="omenChoices.length" class="flex flex-col gap-0.5">
        <label v-for="o in omenChoices" :key="o" class="flex items-center gap-1.5 text-[12px]"><input v-model="omens" type="checkbox" :value="o" />{{ nameOfKey(o) }}</label>
      </div>
      <div class="flex gap-1">
        <button type="button" data-tree-trial-use class="g-btn sm flex-1" @click="use(1)">{{ tr("打つ", "Use") }}</button>
        <button type="button" class="g-btn sm" @click="use(10)">×10</button>
        <button type="button" class="g-btn sm" :disabled="trail.length < 2" @click="back">{{ tr("1 つ戻す", "Undo") }}</button>
      </div>
      <div v-if="offers.length" class="flex flex-col gap-1 rounded bg-rose-500/10 p-1.5">
        <p class="text-[11px] font-bold">{{ tr("発現: 候補から選ぶ", "Reveal: pick one") }}</p>
        <button v-for="(m, i) in offers" :key="i" type="button" class="truncate rounded border border-white/15 px-1.5 py-0.5 text-left text-[12px] hover:border-rose-300" :title="modText(m)" @click="reveal(i + 1)">{{ m.tierName }} {{ modText(m) }}</button>
      </div>
      <div class="flex gap-1">
        <button type="button" class="g-btn sm flex-1" @click="seed++">{{ tr("別の見本", "Another sample") }}</button>
        <button type="button" class="g-btn sm flex-1" :disabled="trail.length < 2" @click="trail = trail.slice(0, 1); log = []">{{ tr("見本に戻す", "Reset") }}</button>
      </div>
      <button v-if="box && !box.hand && !box.back && !box.done" type="button" class="g-btn sm" @click="emit('next')">{{ tr("この箱の次の手を決める", "Set this box's next craft") }}</button>
    </div>

    <!-- 打った結果 -->
    <div class="min-h-0 flex-1 overflow-y-auto">
      <p v-for="(l, i) in log" :key="log.length - i" class="py-0.5 text-[11px]" :class="l.ok ? 'opacity-85' : 'text-rose-300'">{{ l.text }}</p>
    </div>
  </div>
</template>
