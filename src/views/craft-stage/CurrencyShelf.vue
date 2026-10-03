<!--
  CurrencyShelf.vue — クラフトステージの棚 (2026-09-27、ADR-001)

  オーナー:「操作は Craft of Exile 仕様 — カレンシーアイコンをクリックしてカーソルに持ち、アイテムをクリックで適用」
  「カレンシーっていうかクラフトに使える奴全部だねこのステージは」。
  タブ: オーブ・骨 / エッセンス (そのベースで使える物) / カタリスト (指輪・アミュレット) / ルーン (ソケットの付く部位、効き目のある物だけ) /
  お告げ (掛けておくと次の関係する手で食う)。ルーンのタブは 2026-09-29 オーナー「ルーン関係タブでまとめてもいいかも」。
  並べる物・名前・値段は [[craft-stage-shelf.ts]]、1 つの見た目は [[ShelfButton.vue]]。
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import ShelfButton from "./ShelfButton.vue";
import { craftStage } from "../../state/craft-stage";
import { bonesFor, CATALYSTS, essenceShelf, OMEN_GROUPS, ORBS, runesFor } from "../../state/craft-stage-shelf";
import { runeEffectFor, runeOf, socketCapOf } from "../../services/craft-stage/stage-runes";

const emit = defineEmits<{ hold: [key: string] }>();
const tab = ref<"orb" | "essence" | "catalyst" | "rune" | "omen">("orb");
const runes = computed(() => runesFor(craftStage.item.value));
/** ソケット: 今の数 / 熟練工の上限、はめたルーンの数 */
const sockets = computed(() => {
  const it = craftStage.item.value;
  return it ? { cap: socketCapOf(it.base, it.cls.category), now: it.sockets ?? 0, used: it.augments?.length ?? 0 } : null;
});
/** ボタンの下に出すその部位での効き目 (短く) */
const effectOf = (k: string): string => {
  const it = craftStage.item.value;
  const r = runeOf(k);
  return it && r ? (runeEffectFor(r, it.cls.category)?.ja ?? "") : "";
};
const essences = computed(() => essenceShelf(craftStage.data.value, craftStage.item.value));
const hasCatalyst = computed(() => ["Rings", "Amulets"].includes(craftStage.item.value?.cls.category ?? ""));
const TABS = computed(() => [
  { id: "orb" as const, label: "オーブ・骨" },
  { id: "essence" as const, label: `エッセンス (${essences.value.length})` },
  ...(hasCatalyst.value ? [{ id: "catalyst" as const, label: "カタリスト" }] : []),
  ...(sockets.value?.cap ? [{ id: "rune" as const, label: "ルーン" }] : []),
  { id: "omen" as const, label: craftStage.omens.value.length ? `お告げ (${craftStage.omens.value.length} 枚掛け)` : "お告げ" },
]);
</script>

<template>
  <div>
    <div class="mb-2 flex flex-wrap gap-1 text-[12px]">
      <button
        v-for="t in TABS"
        :key="t.id"
        type="button"
        class="rounded-lg px-2.5 py-1"
        :class="tab === t.id ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60' : 'border border-white/15 hover:bg-white/5'"
        @click="tab = t.id"
      >{{ t.label }}</button>
    </div>

    <div v-if="tab === 'orb'" class="flex flex-wrap gap-x-4 gap-y-2">
      <div v-for="g in ORBS" :key="g.kind" class="flex gap-1.5">
        <ShelfButton v-for="k in g.keys" :key="k" :k="k" @pick="emit('hold', $event)" />
      </div>
      <div v-if="bonesFor(craftStage.item.value).length" class="flex gap-1.5">
        <ShelfButton v-for="k in bonesFor(craftStage.item.value)" :key="k" :k="k" @pick="emit('hold', $event)" />
      </div>
    </div>

    <div v-else-if="tab === 'essence'" class="flex flex-wrap gap-x-4 gap-y-2">
      <div v-for="g in essences" :key="g.kind" class="flex gap-1.5">
        <ShelfButton v-for="k in g.keys" :key="k" :k="k" @pick="emit('hold', $event)" />
      </div>
      <p v-if="!essences.length" class="text-[12px] opacity-50">このベースに使えるエッセンスはありません</p>
    </div>

    <div v-else-if="tab === 'catalyst'" class="flex flex-wrap gap-1.5">
      <ShelfButton v-for="k in CATALYSTS" :key="k" :k="k" @pick="emit('hold', $event)" />
    </div>

    <div v-else-if="tab === 'rune'">
      <p v-if="sockets" class="mb-2 text-[11px] opacity-70">
        ソケット {{ sockets.now }} / {{ sockets.cap }} (熟練工のオーブで足す、コラプトで +1)・はめたルーン {{ sockets.used }}。はめたら外せないが、他のルーンで置き換えられる (置き換えた方は壊れる。ソケットバウンドの物は置き換えも不可)。ルーンを持ってソケットの絵を押すとそのソケットを置き換える
        <ShelfButton k="artificer" class="ml-2 inline-block align-middle" @pick="emit('hold', $event)" />
      </p>
      <div class="space-y-2">
        <div v-for="g in runes" :key="g.kind">
          <p class="mb-0.5 text-[10px] opacity-60">{{ g.label }}</p>
          <div class="flex flex-wrap gap-1.5">
            <ShelfButton v-for="k in g.keys" :key="k" :k="k" :title="effectOf(k)" @pick="emit('hold', $event)" />
          </div>
        </div>
      </div>
      <p v-if="!runes.length" class="text-[12px] opacity-50">このベースに効くルーンはありません</p>
    </div>

    <div v-else>
      <p class="mb-2 text-[11px] opacity-60">押すと掛けておきます (何枚でも)。次に打つ手に関係する物だけ使われます。</p>
      <div class="flex flex-wrap gap-x-4 gap-y-2">
      <div v-for="g in OMEN_GROUPS" :key="g.kind">
        <p class="mb-0.5 text-[10px] opacity-60">{{ g.label }}</p>
        <div class="flex gap-1.5">
          <ShelfButton v-for="k in g.keys" :key="k" :k="k" omen @pick="craftStage.toggleOmen($event)" />
        </div>
      </div>
      </div>
    </div>
  </div>
</template>
