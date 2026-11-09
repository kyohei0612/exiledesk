<!--
  TreeGoalRunes.vue — 完成形の使用ルーン (S-31g。11-05 オーナー「ルーンは使用ルーンとして最大６つまで選べるように」)。
  使う順に最大 6 つ。ソケットより多ければ前から置き換えた形がカードに出る (嵌め方はエンジンの入口 socketGoalRunes)。
  効くのはカードの見た目と枠 (セールの凱旋のサフィ +1 など) だけで、完成の判定には入れない (オーナー 11-05「おｋ」)。
  完成の狙いに要るルーン (requiredRunes = ルーンの MOD・アストリッドの創造性) は「自動」で並べ、外せない。並べ替え・外すはこの欄の中だけ (木の手ではない)
-->
<script setup lang="ts">
import { computed } from "vue";
import { applyCurrency, freshItem, mulberry32, RUNES, runeEffectFor, socketCapOf } from "../../../services/craft-stage/engine";
import { GOAL_RUNE_MAX, requiredRunes } from "../../../services/simulator/sim-engine";
import { CRAFT_RUNE_KEYS } from "../../../state/for-share/craft-stage-shelf";
import { craftStage as s } from "../../../state/craft-stage";
import { nameOf, tr } from "../../../i18n/lang";
import { useTree } from "./use-tree";

const t = useTree();
const fresh = computed(() => (s.data.value ? freshItem(s.data.value, t.doc.value.base, t.doc.value.itemLevel, "rare") : null));
/** ソケットの付く部位か (付かない部位では欄を出さない) */
const cap = computed(() => (fresh.value ? socketCapOf(fresh.value.base, fresh.value.cls.category) : 0));
/**
 * 差せるルーン・ソウルコア・アイドル (今のゲームに有る物のうち、このベースのレアに差せる物。差せるかはエンジンの applyCurrency)。クラフトのルーンを先に、ソウルコア・アイドルは後ろの節。
 * 11-05 動画 G3pdLFAZxN0 の手袋の #17: 前はルーンだけで、シリウスのアイドルを入れられなかった (棚の手では差せる、S-31g)
 */
const choices = computed(() => {
  const d = s.data.value, it = fresh.value;
  if (!d || !it || !cap.value) return [];
  return Object.entries(RUNES).filter(([en, r]) => r.available !== false && applyCurrency(d, { ...it, sockets: 1 }, `rune:${en}`, mulberry32(1)).applied)
    .map(([en, rune]) => { const e = runeEffectFor(rune, it.cls.category); return { en, kind: rune.kind, craft: CRAFT_RUNE_KEYS.includes(`rune:${en}`), name: nameOf({ en, ja: rune.ja }), effect: e ? tr(e.ja, e.en) : "" }; });
});
const craftChoices = computed(() => choices.value.filter((c) => c.craft));
const otherChoices = computed(() => choices.value.filter((c) => !c.craft && c.kind === "rune"));
const coreChoices = computed(() => choices.value.filter((c) => !c.craft && c.kind === "soulcore"));
const idolChoices = computed(() => choices.value.filter((c) => !c.craft && c.kind === "talisman"));
const nameFor = (en: string): string => choices.value.find((c) => c.en === en)?.name ?? (RUNES[en] ? nameOf({ en, ja: RUNES[en]!.ja }) : en);
const effectFor = (en: string): string => choices.value.find((c) => c.en === en)?.effect ?? "";
const list = computed(() => t.doc.value.goalRunes ?? []);
const required = computed(() => (s.data.value ? requiredRunes(s.data.value, t.doc.value.base, t.doc.value.itemLevel, t.goals.value.map((a) => ({ modId: a.modId, tier: a.tier }))) : []));
const set = (next: string[]): void => t.edit((d) => { if (next.length) d.goalRunes = next.slice(0, GOAL_RUNE_MAX); else delete d.goalRunes; });
const add = (en: string): void => { if (en && list.value.length < GOAL_RUNE_MAX) set([...list.value, en]); };
const remove = (i: number): void => set(list.value.filter((_, j) => j !== i));
const move = (i: number, by: -1 | 1): void => { const n = [...list.value], j = i + by; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j]!, n[i]!]; set(n); };
</script>

<template>
  <div v-if="cap" data-tree-goal-use-runes class="flex flex-col gap-1 px-1 text-[12px]">
    <div class="flex items-center gap-2">
      <span class="flex-1 opacity-80">{{ tr(`使用ルーン (${list.length} / ${GOAL_RUNE_MAX})`, `Runes used (${list.length} / ${GOAL_RUNE_MAX})`) }}</span>
      <select v-if="list.length < GOAL_RUNE_MAX" data-tree-goal-rune-add :aria-label="tr('使用ルーンを足す', 'Add a rune')" class="h-7 max-w-[60%] rounded-md border border-white/15 bg-black/40 px-1 text-[12px]" :value="''" @change="add(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
        <option value="">{{ tr("＋ ルーンを足す", "+ Add a rune") }}</option>
        <optgroup :label="tr('クラフトのルーン', 'Crafting runes')"><option v-for="r in craftChoices" :key="r.en" :value="r.en">{{ r.name }}{{ r.effect ? ` — ${r.effect}` : "" }}</option></optgroup>
        <optgroup :label="tr('その他のルーン', 'Other runes')"><option v-for="r in otherChoices" :key="r.en" :value="r.en">{{ r.name }}{{ r.effect ? ` — ${r.effect}` : "" }}</option></optgroup>
        <optgroup v-if="coreChoices.length" :label="tr('ソウルコア', 'Soul Cores')"><option v-for="r in coreChoices" :key="r.en" :value="r.en">{{ r.name }}{{ r.effect ? ` — ${r.effect}` : "" }}</option></optgroup>
        <optgroup v-if="idolChoices.length" :label="tr('アイドル', 'Idols')"><option v-for="r in idolChoices" :key="r.en" :value="r.en">{{ r.name }}{{ r.effect ? ` — ${r.effect}` : "" }}</option></optgroup>
      </select>
    </div>
    <!-- 完成の狙いに要るルーン (自動、外せない) -->
    <p v-for="r in required" :key="`auto-${r.en}`" data-tree-goal-rune-auto class="flex min-w-0 items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1 text-[#9fd3ff]/80" :title="tr('完成の狙いに要るので自動で嵌めた扱い (外せない)', 'Socketed automatically because a target needs it (cannot be removed)')">
      <span class="min-w-0 flex-1 truncate max-[48rem]:overflow-visible max-[48rem]:whitespace-normal max-[48rem]:break-words">{{ nameFor(r.en) }}</span><span class="shrink-0 opacity-70">{{ tr("自動", "Auto") }}</span>
    </p>
    <ol v-if="list.length" class="flex flex-col gap-1">
      <li v-for="(en, i) in list" :key="`${en}-${i}`" data-tree-goal-rune class="flex min-w-0 items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1">
        <span class="shrink-0 opacity-60">{{ i + 1 }}.</span>
        <span class="min-w-0 flex-1 truncate max-[48rem]:overflow-visible max-[48rem]:whitespace-normal max-[48rem]:break-words text-violet-200" :title="effectFor(en) || en">{{ nameFor(en) }}</span>
        <button type="button" data-tree-goal-rune-up class="shrink-0 px-1 opacity-60 hover:opacity-100 disabled:opacity-20" :disabled="i === 0" :aria-label="tr(`${nameFor(en)} を前へ`, `Move ${nameFor(en)} up`)" :title="tr('前へ', 'Move up')" @click="move(i, -1)">↑</button>
        <button type="button" data-tree-goal-rune-down class="shrink-0 px-1 opacity-60 hover:opacity-100 disabled:opacity-20" :disabled="i === list.length - 1" :aria-label="tr(`${nameFor(en)} を後へ`, `Move ${nameFor(en)} down`)" :title="tr('後へ', 'Move down')" @click="move(i, 1)">↓</button>
        <button type="button" data-tree-goal-rune-remove class="shrink-0 px-1 opacity-60 hover:opacity-100" :aria-label="tr(`${nameFor(en)} を外す`, `Remove ${nameFor(en)}`)" :title="tr('外す', 'Remove')" @click="remove(i)">×</button>
      </li>
    </ol>
    <p v-else class="opacity-60">{{ tr("クラフトで使うルーンを使う順に選ぶ。ソケットより多ければ前から置き換えた形がカードに出る (完成の判定には入れない)", "Pick the runes your craft uses, in order. If there are more than sockets, the card shows them replacing from the first (not part of the finish check)") }}</p>
  </div>
</template>
