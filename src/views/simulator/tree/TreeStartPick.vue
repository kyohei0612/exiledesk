<!--
  TreeStartPick.vue — スタートの箱の重ね窓 (TreeStartPage.vue) の中身: 始まりの形。
  10-23 オーナー「スタートは切り替えのボタンを置かず印で決まる」: 0 完成形の設定でフラクチャーの印がある = 印のどれか 1 つが ✦ のレア + 外れ (✦ 1 + 外れ 3、店売り・フラクチャー直後の再現)、
  印が無い = 白 (ノーマル) から。どちらも「＋」で狙いの MOD を足す (印ありは外れを差し替える = 外れが 1 つ減る)。ルーンは先に差す。
  作るのはエンジンの入口 (tree-sample の startItemOf → fractureStart / startWith)。作れない時は見本の理由を出す。前の始め方 4 つ・乱数の MOD の数はやめた
-->
<script setup lang="ts">
import { computed } from "vue";
import { applyCurrency, freshItem, limitOf, mulberry32, RUNES, runeEffectFor, socketCapOf } from "../../../services/craft-stage/engine";
import { fractureMarks, migrateStart, START_JUNK, startOf, startRarity, type Aim, type TreeStart } from "../../../services/simulator/tree/tree-model";
import { startItemOf } from "../../../services/simulator/tree/tree-sample";
import { craftStage as s } from "../../../state/craft-stage";
import { nameOf, tr } from "../../../i18n/lang";
import { useTree } from "./use-tree";

const t = useTree();
const st = computed(() => startOf(t.doc.value));
const marks = computed(() => fractureMarks(t.doc.value));

/** 始まりの形を書き換える (前の版の形は先に今の形へ。レアリティは印と＋から決まる。1 つ戻すで戻せる) */
function change(fn: (x: TreeStart) => void): void { t.edit((d) => { migrateStart(d); fn(d.start!); d.start!.rarity = startRarity(d); }); }
/** ＋で足せる数: 印あり = 外れの数まで (外れを差し替える)、印なし = このベースのレアの枠 (エンジンの limitOf) */
const plusMax = computed(() => {
  if (marks.value.length) return START_JUNK;
  const d = s.data.value;
  if (!d) return 0;
  const it = freshItem(d, t.doc.value.base, t.doc.value.itemLevel, "rare");
  return limitOf(it, "prefix") + limitOf(it, "suffix");
});
/** ＋で足せる狙い (完成の狙いのうち、印でも＋済みでもない物) */
const addable = computed(() => t.goals.value.filter((a) => !a.fractured && !st.value.mods.some((m) => m.modId === a.modId)));
const add = (a: Aim): void => change((x) => { x.mods.push({ modId: a.modId, tier: a.tier }); });
const remove = (i: number): void => change((x) => { x.mods.splice(i, 1); });
const junkLeft = computed(() => Math.max(0, START_JUNK - st.value.mods.length));

/** 差せるルーン (今のゲームに有るルーンのうち、このベースのレアに差せる物。ソウルコアなどは出さない) とソケットの上限 */
const fresh = computed(() => (s.data.value ? freshItem(s.data.value, t.doc.value.base, t.doc.value.itemLevel, "rare") : null));
const cap = computed(() => (fresh.value ? socketCapOf(fresh.value.base, fresh.value.cls.category) : 0));
const runeChoices = computed(() => {
  const d = s.data.value, it = fresh.value;
  if (!d || !it || !cap.value) return [];
  // 差せるかはエンジンの applyCurrency (ソケット 1 つの形で聞く)、効果は runeEffectFor
  return Object.entries(RUNES).filter(([en, r]) => r.kind === "rune" && r.available !== false && applyCurrency(d, { ...it, sockets: 1 }, `rune:${en}`, mulberry32(1)).applied)
    .map(([en, rune]) => { const e = runeEffectFor(rune, it.cls.category); return { en, name: nameOf({ en, ja: rune.ja }), effect: e ? tr(e.ja, e.en) : "" }; });
});
const runeName = (en: string): string => runeChoices.value.find((r) => r.en === en)?.name ?? en;
const runes = computed(() => st.value.runes ?? []);
const addRune = (en: string): void => { if (en) change((x) => { x.runes = [...(x.runes ?? []), en]; }); };
const removeRune = (i: number): void => change((x) => { x.runes = (x.runes ?? []).filter((_, j) => j !== i); if (!x.runes.length) delete x.runes; });

/** 作れない時の理由 (エンジンの force・ルーンの理由。枠が足りない・同じ系統・ソケットが足りないなど) */
const problem = computed(() => (s.data.value ? startItemOf(s.data.value, t.doc.value, mulberry32(1)).note : null));
</script>

<template>
  <div data-tree-start-pick class="flex min-h-0 flex-1 flex-col gap-3">
    <!-- 形は印で決まる (10-23 オーナー)。印を変えるのは 0 完成形の設定 -->
    <div v-if="marks.length" data-tree-start-shape="fractured" class="flex flex-col gap-1 rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-1.5 text-[13px]">
      <p>{{ tr(`✦ フラクチャーの候補 ${marks.length} つのどれか 1 つが固定されたレア + 外れ ${junkLeft}`, `A rare with one of ${marks.length} ✦ candidates fractured + ${junkLeft} miss mod(s)`) }}</p>
      <ul class="flex flex-col gap-0.5">
        <li v-for="a in marks" :key="a.modId" data-tree-start-mark class="min-w-0 truncate text-mod-fractured" :title="t.startModLabel(a, true)">✦ {{ t.startModLabel(a, true) }} <span v-if="marks.length > 1" class="text-[11px] opacity-60">{{ tr(`(1/${marks.length})`, `(1/${marks.length})`) }}</span></li>
      </ul>
      <!-- フラクチャーの始め方 (印を付けた時の 2 択と同じ、TreeFractureAsk。10-24 夜オーナー) -->
      <div data-tree-start-from class="flex flex-wrap items-center gap-1">
        <button type="button" data-tree-start-from-k="fractured" class="g-tab !min-h-[26px] !px-2 !text-[12px]" :class="st.from === 'fractured' ? 'on' : ''" :title="tr('✦ が付いたレアを買って始める', 'Buy a rare that already has the ✦ mod')" @click="t.setStartFrom('fractured')">{{ tr("フラクチャー済みから", "From fractured") }}</button>
        <button type="button" data-tree-start-from-k="four" class="g-tab !min-h-[26px] !px-2 !text-[12px]" :class="st.from === 'four' ? 'on' : ''" :title="tr('4 MOD のレアにフラクチャー。必ず成功として、素材とオーブは 3 個分 (33%)', 'Fracture a 4-mod rare. Counted as a sure success, with materials and orbs ×3 (33%)')" @click="t.setStartFrom('four')">{{ tr("フラクチャー前から ×3", "Pre-fracture ×3") }}</button>
      </div>
    </div>
    <p v-else data-tree-start-shape="white" class="rounded-md bg-white/[0.04] px-2 py-1.5 text-[13px]">{{ tr("白 (ノーマル) から始める。✦ から始めるなら 0 完成形の設定で MOD にフラクチャーの印を付ける", "Start from a white (normal) base. To start from ✦, mark mods as fractured in 0 Final item") }}</p>
    <button type="button" data-tree-start-to-goal class="g-btn sm self-start" @click="t.startPage.value = false; t.goalPage.value = 2">{{ tr("0 完成形の設定で印を変える →", "Change the marks in 0 Final item →") }}</button>

    <!-- ＋ = 狙いの MOD を付けて始める (印ありは外れを差し替える) -->
    <div data-tree-start-plus class="flex flex-col gap-1 text-[13px]">
      <p>{{ marks.length ? tr(`＋ 外れを狙いの MOD に差し替える (${st.mods.length} / ${plusMax})`, `+ Replace miss mods with targets (${st.mods.length} / ${plusMax})`) : tr(`＋ 始まりに付いている MOD (${st.mods.length} / ${plusMax})`, `+ Mods already on the start (${st.mods.length} / ${plusMax})`) }}</p>
      <div v-for="(m, i) in st.mods" :key="m.modId" data-tree-start-row class="flex min-w-0 items-center gap-1.5 rounded-md bg-sky-500/15 px-2 py-1">
        <span class="min-w-0 flex-1 truncate text-[#c8c8ff]" :title="t.startModLabel(m)">{{ t.startModLabel(m) }}</span>
        <button type="button" data-tree-start-remove class="shrink-0 px-1 opacity-60 hover:opacity-100" :title="tr('外す', 'Remove')" @click="remove(i)">×</button>
      </div>
      <div v-if="st.mods.length < plusMax" class="flex flex-wrap gap-1">
        <button v-for="a in addable" :key="a.modId" type="button" data-tree-start-add class="g-tab !min-h-[26px] max-w-full !px-2 !text-[12px]" :title="t.startModLabel(a)" @click="add(a)"><span class="truncate">＋ {{ t.startModLabel(a) }}</span></button>
        <span v-if="!addable.length" class="text-[12px] opacity-60">{{ t.goals.value.length ? tr("足せる狙いが無い (印・＋済み)", "No more targets to add") : tr("完成の狙いがまだ無い (0 完成形の設定で決める)", "No final targets yet (set them in 0 Final item)") }}</span>
      </div>
    </div>
    <!-- ルーン (ソケットの上限まで。セールの凱旋のサフィックス +1・コルの狩りのマークスマン MOD など) -->
    <div v-if="cap" data-tree-start-runes class="flex flex-col gap-1 text-[13px]">
      <div class="flex items-center gap-2">
        <span class="flex-1">{{ tr(`ルーン (${runes.length} / ${cap})`, `Runes (${runes.length} / ${cap})`) }}</span>
        <select v-if="runes.length < cap" data-tree-start-rune-add class="h-7 max-w-[60%] rounded-md border border-white/15 bg-black/40 px-1 text-[12px]" :value="''" @change="addRune(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
          <option value="">{{ tr("＋ ルーンを差す", "+ Socket a rune") }}</option>
          <option v-for="r in runeChoices" :key="r.en" :value="r.en">{{ r.name }}{{ r.effect ? ` — ${r.effect}` : "" }}</option>
        </select>
      </div>
      <div v-for="(en, i) in runes" :key="`${en}-${i}`" data-tree-start-rune class="flex min-w-0 items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1">
        <span class="min-w-0 flex-1 truncate text-violet-200" :title="en">{{ runeName(en) }}</span>
        <button type="button" class="shrink-0 px-1 opacity-60 hover:opacity-100" :title="tr('外す', 'Remove')" @click="removeRune(i)">×</button>
      </div>
    </div>
    <p v-if="problem" data-tree-start-problem class="rounded-md border border-rose-400/50 bg-[#2a1416] px-2 py-1 text-[12px] text-rose-100">{{ tr(`この形は作れない: ${problem}`, `Can't make this: ${problem}`) }}</p>
  </div>
</template>
