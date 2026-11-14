<!--
  TreeAimRows.vue — 手の窓の「狙う MOD」の ☑ の並び (TreeHandShelf の PC・スマホの 2 段目)。
  スイッチ aimGroups (S-22g): 完成形に ✦ がある時、3 段に分けて見出しを付ける = フラクチャーの候補 (完成形で ✦ の付いた MOD) / その他の狙い MOD / 狙い無し (slot の free)。
  各段の中は完成形のカードの順 (✦ が無い時も順はカード)。閉じている間は前のまま (見出し無し・候補の順)。mid の slot = 今は付けられない狙い・骨の置き石 (その他の後、狙い無しの前)
  seconds (S-10h ②、スイッチ eleAny): 2 つ付く手で同じ段の「いずれか」の 2 本目は行にせず、1 本目の下に字下げの「☐ 2 個目の MOD も狙う」(1 本目が ☑ の時だけ押せる)
-->
<script setup lang="ts">
import { computed } from "vue";
import { tr } from "../../../i18n/lang";
import { flag } from "../../../web/release-flags";
import { aimKey, fractureMarks, type Aim } from "../../../services/simulator/tree/tree-model";
import { sameAimMod } from "../../../services/simulator/tree/tree-hand-core";
import { allMods } from "../../../services/craft-stage/engine";
import { craftStage as s } from "../../../state/craft-stage";
import { useTree } from "./use-tree";

const props = defineProps<{ aims: readonly Aim[]; checked: readonly string[]; noMod: boolean; noModTitle: string; big?: boolean; free?: boolean; seconds?: Readonly<Record<string, Aim>> }>();
const emit = defineEmits<{ toggle: [a: Aim] }>();
const t = useTree();
const ON = flag("aimGroups");
/** 同じ MOD か (木の狙いの比べ sameAimMod。段は見ない) */
const same = (x: Aim, a: Aim): boolean => { const d = s.data.value; return !!d && sameAimMod(d, x, a); };
/** 完成形のカードの順 (プレ → サフィ、カードの行の順)。カードに無い狙いは完成形の設定の順で後ろ */
const rank = (a: Aim): number => {
  const it = t.goalItem.value?.item, card = it ? allMods(it).findIndex((m) => same({ modId: m.modId, tier: a.tier }, a)) : -1;
  if (card >= 0) return card;
  const g = t.goals.value.findIndex((x) => same(x, a));
  return g >= 0 ? 100 + g : 999;
};
const marks = computed(() => fractureMarks(t.doc.value));
const isFrac = (a: Aim): boolean => marks.value.some((g) => same(g, a));
const groups = computed((): Array<{ key: string; title: string | null; list: Aim[] }> => {
  if (!ON) return [{ key: "all", title: null, list: [...props.aims] }];
  const sorted = [...props.aims].sort((a, b) => rank(a) - rank(b)), fr = sorted.filter(isFrac), rest = sorted.filter((a) => !isFrac(a));
  if (!marks.value.length) return [{ key: "rest", title: null, list: sorted }];
  return [
    ...(fr.length ? [{ key: "frac", title: tr("フラクチャーの候補 (✦ の段のまま)", "Fracture candidates (✦ tier stays)"), list: fr }] : []),
    ...(rest.length ? [{ key: "rest", title: tr("その他の狙い MOD (段は完成形の設定で変えられる)", "Other target mods (tier set in the final item)"), list: rest }] : []),
  ];
});
const on = (a: Aim): boolean => props.checked.includes(aimKey(a));
const head = "mt-1.5 text-[11px] font-bold text-amber-200/80 first:mt-0";
</script>

<template>
  <template v-for="g in groups" :key="g.key">
    <span v-if="g.title" data-tree-hand-aim-group :data-group="g.key" :class="head">{{ g.title }}</span>
    <template v-for="a in g.list" :key="aimKey(a)">
    <label data-tree-hand-aim :data-aim="aimKey(a)" :data-group="g.key"
      :class="[big ? 'flex min-h-11 min-w-0 items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3' : 'flex min-h-7 min-w-0 items-center gap-2', noMod ? 'cursor-not-allowed opacity-40' : 'cursor-pointer']"
      :title="noMod ? noModTitle : undefined">
      <input type="checkbox" :class="big ? 'size-5 shrink-0' : ''" :disabled="noMod" :checked="on(a)" @change="emit('toggle', a)" />
      <span v-if="big" class="min-w-0 break-words">{{ t.aimLabel(a) }}</span>
      <span v-else class="min-w-0 truncate max-[48rem]:overflow-visible max-[48rem]:whitespace-normal max-[48rem]:break-words" :title="t.aimLabel(a)">{{ t.aimLabel(a) }}</span>
    </label>
    <label v-if="seconds?.[aimKey(a)]" data-tree-hand-aim-second :data-aim="aimKey(seconds[aimKey(a)]!)"
      :class="[big ? 'ml-6 flex min-h-11 min-w-0 items-center gap-3 rounded-lg border-l-2 border-amber-400/60 bg-amber-400/[.08] px-3' : 'ml-[26px] flex min-h-7 min-w-0 items-center gap-2 rounded border-l-2 border-amber-400/60 bg-amber-400/[.08] px-2 py-0.5', noMod || !on(a) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer']">
      <input type="checkbox" :class="big ? 'size-5 shrink-0' : ''" :disabled="noMod || !on(a)" :checked="on(a) && on(seconds[aimKey(a)]!)" @change="emit('toggle', seconds[aimKey(a)]!)" />
      <span class="flex min-w-0 flex-col"><span class="break-words">{{ tr("2 個目の MOD も狙う", "Also aim for a 2nd mod") }}</span><span class="break-words text-[11px] opacity-70">{{ tr("いずれかの元素耐性がもう 1 つ付いたら「2 つとも付いた」の箱", "If one more any Elemental Resistance lands: the \"Both landed\" box") }}</span></span>
    </label>
    </template>
  </template>
  <slot name="mid" />
  <span v-if="ON && free && marks.length" data-tree-hand-aim-group data-group="free" :class="head">{{ tr("狙い無し", "No target") }}</span>
  <slot />
</template>
