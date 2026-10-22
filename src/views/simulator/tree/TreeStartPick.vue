<!--
  TreeStartPick.vue — スタートの箱の重ね窓 (TreeStartPage.vue) の中身: 始まりの形 (2026-10-22 オーナー「始まりの MOD を決めさせる、ほかは自由」。前はフラクチャー 1 つだけ)。
  10-22 ツリー特化: 始まりに付いている MOD は 0 完成形の設定の狙いから選ぶ (全部の MOD の一覧は出さない)。ベースの値段は回し終わった後の結果のまとめへ移す (ここからは外した)。
  ツリーはフラクチャーの後だけを扱う (オーナー 10-22) ので、始まりはレア + 始まりに付いている MOD (段は指名、✦ = フラクチャー、1 つまで) + 差したルーン + 乱数の MOD の数。
  始め方は ノーマルから / マジックから / レアから / フラクチャー済みから (10-22 オーナー。ノーマルは MOD と乱数を外す、フラクチャー済みは ✦ にする MOD を狙いから 1 つ選び、ほかに付いている MOD も狙いから)。付けるのはエンジンの force (ルーンの MOD はそのルーンを差して付く)。作れない時は見本の理由を出す
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import NumStep from "../../../components/NumStep.vue";
import { freshItem, limitOf, mulberry32, runesFor, socketCapOf } from "../../../services/craft-stage/engine";
import { migrateStart, startOf, type Aim, type TreeRarity, type TreeStart } from "../../../services/simulator/tree/tree-model";
import { startItemOf } from "../../../services/simulator/tree/tree-sample";
import { craftStage as s } from "../../../state/craft-stage";
import { nameOf, tr } from "../../../i18n/lang";
import { useTree } from "./use-tree";
import { rarityName } from "./tree-names";

const t = useTree();
const st = computed(() => startOf(t.doc.value));

/** 始まりの形を書き換える (前の版の fracture は先に start へ移す。レアリティは 0 の箱で決める。1 つ戻すで戻せる) */
function change(fn: (x: TreeStart) => void): void { t.edit((d) => { migrateStart(d); fn(d.start!); }); }
/** 同じ MOD は段だけ替える */
function add(a: Aim): void {
  change((x) => { const m = x.mods.find((y) => y.modId === a.modId); if (m) m.tier = a.tier; else x.mods.push({ modId: a.modId, tier: a.tier }); });
}
const remove = (i: number): void => change((x) => { x.mods.splice(i, 1); });
/** 完成の狙いのうち始まりに付いている物 (段は狙いの段で付ける)。押すと付ける / 外す */
const startIdx = (a: Aim): number => st.value.mods.findIndex((m) => m.modId === a.modId);
const toggleGoal = (a: Aim): void => { const i = startIdx(a); if (i >= 0) remove(i); else add(a); };
/** 狙いに無い始まりの MOD (前の版で足した物・創生の樹など) */
const others = computed(() => st.value.mods.map((m, i) => ({ m, i })).filter(({ m }) => !t.goals.value.some((a) => a.modId === m.modId)));
/** フラクチャーは 1 つまで (ゲームと同じ)。押した行に印を移す / もう一度で外す */
const toggleFracture = (i: number): void => change((x) => { const on = !x.mods[i]!.fractured; for (const m of x.mods) delete m.fractured; if (on) x.mods[i]!.fractured = true; });

/** 始め方 (フラクチャー済み = レア + ✦ の MOD 1 つ)。✦ をまだ選んでいない間もフラクチャー済みの形で出す */
type Kind = TreeRarity | "fractured";
const KINDS: readonly Kind[] = ["normal", "magic", "rare", "fractured"];
const kindOf = (): Kind => (st.value.mods.some((m) => m.fractured) ? "fractured" : st.value.rarity);
const kind = ref<Kind>(kindOf());
watch(st, () => { const k = kindOf(); if (!(kind.value === "fractured" && k === "rare")) kind.value = k; });
const kindName = (k: Kind): string => (k === "fractured" ? tr("フラクチャー済みから", "From fractured") : tr(`${rarityName(k)}から`, `From ${rarityName(k).toLowerCase()}`));
function setKind(k: Kind): void {
  kind.value = k;
  if (k === "normal") { t.setStartRarity("normal"); return; }
  change((x) => { x.rarity = k === "fractured" ? "rare" : k; if (k !== "fractured") for (const m of x.mods) delete m.fractured; });
}
/** フラクチャー済み: この狙いを ✦ にする (付いていなければ付けて、印は 1 つだけ) */
const pickFracture = (a: Aim): void => change((x) => { for (const m of x.mods) delete m.fractured; const m = x.mods.find((y) => y.modId === a.modId); if (m) m.fractured = true; else x.mods.push({ modId: a.modId, tier: a.tier, fractured: true }); });
const isFrac = (a: Aim): boolean => !!st.value.mods.find((m) => m.modId === a.modId)?.fractured;

/** 差せるルーン (今のゲームに有るルーンのうち、このベースのレアに差せる物。ソウルコアなどは出さない) とソケットの上限 */
const fresh = computed(() => (s.data.value ? freshItem(s.data.value, t.doc.value.base, t.doc.value.itemLevel, "rare") : null));
const cap = computed(() => (fresh.value ? socketCapOf(fresh.value.base, fresh.value.cls.category) : 0));
const runeChoices = computed(() => {
  const d = s.data.value, it = fresh.value;
  if (!d || !it || !cap.value) return [];
  // 差せるか・効果はエンジンの入口の runesFor (B14 10-22)
  return runesFor(d, it).map(({ en, rune, effect }) => ({ en, name: nameOf({ en, ja: rune.ja }), effect: effect ? tr(effect.ja, effect.en) : "" }));
});
const runeName = (en: string): string => runeChoices.value.find((r) => r.en === en)?.name ?? en;
const runes = computed(() => st.value.runes ?? []);
const addRune = (en: string): void => { if (en) change((x) => { x.runes = [...(x.runes ?? []), en]; }); };
const removeRune = (i: number): void => change((x) => { x.runes = (x.runes ?? []).filter((_, j) => j !== i); if (!x.runes.length) delete x.runes; });

/** 乱数の MOD の数 (素の高貴を n 回)。上限 = このベースのレアの枠 (エンジンの limitOf) − 始まりの MOD */
const randomMax = computed(() => { const d = s.data.value; if (!d) return 5; const it = freshItem(d, t.doc.value.base, t.doc.value.itemLevel, "rare"); return Math.max(0, limitOf(it, "prefix") + limitOf(it, "suffix") - st.value.mods.length); });
const rand = ref<number | null>(t.doc.value.startRandom ?? 0);
function setRand(v: number | null): void {
  rand.value = v === null ? null : Math.max(0, Math.min(randomMax.value, Math.round(v)));
  if (rand.value !== null) t.setStartRandom(rand.value);
}
/** 作れない時の理由 (エンジンの force・ルーンの理由。枠が足りない・同じ系統・ソケットが足りないなど) */
const problem = computed(() => (s.data.value ? startItemOf(s.data.value, t.doc.value, mulberry32(1)).note : null));
</script>

<template>
  <div data-tree-start-pick class="flex min-h-0 flex-1 flex-col gap-3">
    <!-- 始め方 (10-22 オーナー)。ノーマルの間は始まりの MOD と乱数の数を出さない -->
    <span data-tree-start-kinds class="flex flex-wrap items-center gap-1">
      <button v-for="k in KINDS" :key="k" type="button" :data-tree-start-kind="k" class="g-tab !min-h-[30px] !px-3 !text-[12px]" :class="kind === k ? 'on' : ''" @click="setKind(k)">{{ kindName(k) }}</button>
    </span>
    <p v-if="kind === 'normal'" data-tree-start-normal class="text-[12px] opacity-70">{{ tr("ノーマル = MOD の付いていない白いベースから始める", "Normal = start from a white base with no mods") }}</p>
    <template v-else>
    <!-- 始まりに付いている MOD = 0 で決めた完成の狙いから (押すと付ける / 外す、✦ = フラクチャー 1 つまで) -->
    <p class="text-[13px]">{{ kind === "fractured" ? tr("✦ にする MOD を 1 つと、ほかに付いている MOD (完成の狙いから)", "Pick the ✦ fractured mod and any other mods on the item (from the final targets)") : tr("始まりに付いている MOD (完成の狙いから)", "Mods already on the starting item (from the final targets)") }}</p>
    <ul class="flex flex-col gap-1">
      <li v-for="a in t.goals.value" :key="a.modId" data-tree-start-row class="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-[13px]" :class="startIdx(a) >= 0 ? 'bg-sky-500/15' : 'bg-white/[0.04]'">
        <button type="button" data-tree-start-on class="g-tab !min-h-[26px] shrink-0 !px-2 !text-[12px]" :class="startIdx(a) >= 0 ? 'on' : ''" @click="toggleGoal(a)">{{ startIdx(a) >= 0 ? tr("✓ 付いている", "✓ On item") : tr("付いていない", "Not on item") }}</button>
        <button v-if="kind === 'fractured'" type="button" data-tree-start-fracture class="shrink-0 rounded-sm border px-1.5 text-[12px]" :class="isFrac(a) ? 'border-amber-400/80 bg-amber-500/25 text-amber-100' : 'border-white/15 opacity-60 hover:opacity-100'"
          :title="isFrac(a) ? tr('✦ にしている (別の MOD を押すと移る)', 'This is the ✦ mod (click another to move it)') : tr('この MOD を ✦ (フラクチャー) にする', 'Make this the ✦ fractured mod')" @click="pickFracture(a)">✦</button>
        <span class="min-w-0 flex-1 truncate text-[#c8c8ff]" :title="t.startModLabel(a)">{{ t.startModLabel(a) }}</span>
      </li>
      <li v-for="o in others" :key="o.m.modId" data-tree-start-row class="flex min-w-0 items-center gap-1.5 rounded-md bg-sky-500/15 px-2 py-1 text-[13px]">
        <button v-if="kind === 'fractured'" type="button" data-tree-start-fracture class="shrink-0 rounded-sm border px-1 text-[11px]" :class="o.m.fractured ? 'border-amber-400/80 bg-amber-500/25 text-amber-100' : 'border-white/15 opacity-60 hover:opacity-100'" @click="toggleFracture(o.i)">✦</button>
        <span class="min-w-0 flex-1 truncate text-[#c8c8ff]" :title="t.startModLabel(o.m)">{{ t.startModLabel(o.m) }} <span class="text-[11px] opacity-60">{{ tr("(狙いに無い)", "(not a target)") }}</span></span>
        <button type="button" class="shrink-0 px-1 opacity-60 hover:opacity-100" :title="tr('外す', 'Remove')" @click="remove(o.i)">×</button>
      </li>
      <li v-if="!t.goals.value.length" class="flex flex-wrap items-center gap-2 text-[12px] opacity-80">{{ tr("完成の狙いがまだ無い", "No final targets yet") }}<button type="button" class="g-btn sm" @click="t.startPage.value = false; t.goalPage.value = 2">{{ tr("0 完成形の設定で決める →", "Set them in 0 Final item →") }}</button></li>
    </ul>
    </template>
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
    <p v-if="kind === 'fractured' && !st.mods.some((m) => m.fractured) && t.goals.value.length" data-tree-start-need-frac class="text-[12px] text-amber-200">{{ tr("✦ を押して、フラクチャー済みの MOD を 1 つ選ぶ", "Press ✦ to pick the fractured mod") }}</p>
    <label v-if="kind !== 'normal'" class="flex items-center gap-2 text-[13px]" :title="tr('始まりの MOD のほかに乱数で付いている MOD の数 (素の高貴を n 回打った形)', 'Random mods besides the ones above (as if exalts were used n times)')">
      <span class="flex-1">{{ tr("ほかに乱数の MOD", "Other random mods") }}</span>
      <NumStep data-tree-start-random :model-value="rand" integer width="w-20" :placeholder-value="0" @update:model-value="setRand" />
    </label>
    <p v-if="problem" data-tree-start-problem class="rounded-md border border-rose-400/50 bg-[#2a1416] px-2 py-1 text-[12px] text-rose-100">{{ tr(`この形は作れない: ${problem}`, `Can't make this: ${problem}`) }}</p>
  </div>
</template>
