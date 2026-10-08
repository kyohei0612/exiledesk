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
import { bonesFor, CATALYSTS, CRAFT_RUNE_KEYS, essenceShelf, OMEN_GROUPS, ORBS, runesFor } from "../../state/craft-stage-shelf";
import { runeEffectFor, runeOf, socketCapOf } from "../../services/craft-stage/stage-runes";

const emit = defineEmits<{ hold: [key: string] }>();
/**
 * 持っているカレンシーに掛けられるお告げの並び (呼ぶ側の slot "held")。オーブのタブでは使える物の並びの直後 (2026-10-05 から。前は「その他」の段の直後)、
 * 他のタブは一番下
 */
const tab = ref<"usable" | "orb" | "essence" | "catalyst" | "rune" | "omen">("orb");
/**
 * オーブ・骨のタブ: 今のアイテムに使える (光っている) 物を前に、使えない物を後ろに (2026-10-05 オーナー「使える光ってるオーブを丸ごと前に
 * 持ってきちゃおうか。1 段目に入らなければ折り返して 2 段目に。その方がこれ使えるんだなってなる」)。まとまり (変成・増強…) の並びは保つ
 */
const orbSplit = computed(() => {
  const it = craftStage.item.value;
  void craftStage.omens.value;
  const groups = [...ORBS, { kind: "bones", label: "骨", keys: bonesFor(it) }];
  const ok = (k: string): boolean => !craftStage.usable(k);
  return {
    usable: groups.map((g) => ({ kind: g.kind, keys: g.keys.filter(ok) })).filter((g) => g.keys.length),
    unusable: groups.map((g) => ({ kind: g.kind, keys: g.keys.filter((k) => !ok(k)) })).filter((g) => g.keys.length),
  };
});
const runes = computed(() => runesFor(craftStage.item.value));
/** 開いたルーンのまとまり (初めは全部閉じて、クラフトに関わる物だけ出す) */
const openRunes = ref(new Set<string>());
function toggleRunes(kind: string): void {
  const s = new Set(openRunes.value);
  if (s.has(kind)) s.delete(kind); else s.add(kind);
  openRunes.value = s;
}
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
/**
 * 使用可能のタブ (実験、2026-10-05 オーナー「他のエッセンスとかも。使用可能ってタブを足して、そこに使える物だけ全部」)。
 * オーブ・骨 / エッセンス / カタリスト / ルーン (ソウルコア・アイドルも) のうち、今のアイテムに打てる物だけを種類ごとに。お告げは掛けておく物なので入れない
 */
const usableAll = computed(() => {
  const it = craftStage.item.value;
  void craftStage.omens.value;
  const ok = (k: string): boolean => !craftStage.usable(k);
  const sec = (label: string, keys: string[], kind?: string) => ({ label, keys: keys.filter(ok), kind });
  return [
    sec("オーブ・骨", [...ORBS.flatMap((g) => g.keys), ...bonesFor(it)]),
    sec("エッセンス", essences.value.flatMap((g) => g.keys)),
    ...(hasCatalyst.value ? [sec("カタリスト", [...CATALYSTS])] : []),
    // ルーンはルーンのタブと同じ段ごとのまとまりで、クラフトに関わる物以外は畳む (2026-10-05 オーナー「そこでもルーンはルーンページみたく閉じる奴は閉じちゃっておk」)
    ...(sockets.value?.cap ? runes.value.map((g) => sec(g.label, g.keys, g.kind)) : []),
  ].filter((x) => x.keys.length);
});
const usableCount = computed(() => usableAll.value.reduce((a, x) => a + x.keys.length, 0));
const TABS = computed(() => [
  { id: "usable" as const, label: `使用可能 (${usableCount.value})` },
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

    <!-- 使用可能 (実験): 今のアイテムに打てる物だけを種類ごとに -->
    <div v-if="tab === 'usable'" class="space-y-2">
      <div v-for="sec in usableAll" :key="sec.kind ?? sec.label">
        <p class="mb-0.5 flex items-center gap-2 text-[10px]">
          <span class="opacity-60">{{ sec.label }} ({{ sec.keys.length }})</span>
          <button v-if="sec.kind && sec.keys.some((k) => !CRAFT_RUNE_KEYS.includes(k))" type="button" class="rounded px-1 text-[10px] text-sky-300/80 hover:bg-white/10" @click="toggleRunes(sec.kind)">
            {{ openRunes.has(sec.kind) ? "たたむ ▴" : `他 ${sec.keys.filter((k) => !CRAFT_RUNE_KEYS.includes(k)).length} 個 ▸` }}
          </button>
        </p>
        <div v-if="!sec.kind || openRunes.has(sec.kind) || sec.keys.some((k) => CRAFT_RUNE_KEYS.includes(k))" class="flex flex-wrap gap-1.5">
          <ShelfButton v-for="k in !sec.kind || openRunes.has(sec.kind) ? sec.keys : sec.keys.filter((k) => CRAFT_RUNE_KEYS.includes(k))" :key="k" :k="k" :title="effectOf(k)" @pick="emit('hold', $event)" />
        </div>
      </div>
      <p v-if="!usableAll.length" class="text-[12px] opacity-50">今のアイテムに使える物はありません</p>
      <div v-if="$slots.held" class="mt-2"><slot name="held" /></div>
    </div>

    <!-- 使える物を前に、使えない物は線の下に (2026-10-05)。持っているカレンシーのお告げは使える物の直後 -->
    <div v-else-if="tab === 'orb'">
      <div class="flex flex-wrap gap-x-4 gap-y-2 max-md:gap-x-1.5">
        <div v-for="g in orbSplit.usable" :key="'u' + g.kind" class="flex flex-wrap gap-1.5">
          <ShelfButton v-for="k in g.keys" :key="k" :k="k" @pick="emit('hold', $event)" />
        </div>
        <p v-if="!orbSplit.usable.length" class="text-[12px] opacity-50">今のアイテムに使える物はありません</p>
      </div>
      <div v-if="$slots.held" class="mt-2"><slot name="held" /></div>
      <template v-if="orbSplit.unusable.length">
        <p class="mb-1 mt-3 border-t border-white/10 pt-2 text-[10px] opacity-50">今のアイテムには使えない物</p>
        <div class="flex flex-wrap gap-x-4 gap-y-2 max-md:gap-x-1.5">
          <div v-for="g in orbSplit.unusable" :key="'x' + g.kind" class="flex flex-wrap gap-1.5">
            <ShelfButton v-for="k in g.keys" :key="k" :k="k" @pick="emit('hold', $event)" />
          </div>
        </div>
      </template>
    </div>

    <div v-else-if="tab === 'essence'" class="flex flex-wrap gap-x-4 gap-y-2 max-md:gap-x-1.5">
      <div v-for="g in essences" :key="g.kind" class="flex flex-wrap gap-1.5">
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
      <!-- 段ごとのまとまり。初めはクラフトに関わるルーンだけ出して、他は「他 ○ 個」で畳む (2026-10-04 オーナー) -->
      <div class="space-y-2">
        <div v-for="g in runes" :key="g.kind">
          <p class="mb-0.5 flex items-center gap-2 text-[10px]">
            <span class="opacity-60">{{ g.label }}</span>
            <button v-if="g.keys.some((k) => !CRAFT_RUNE_KEYS.includes(k))" type="button" class="rounded px-1 text-[10px] text-sky-300/80 hover:bg-white/10" @click="toggleRunes(g.kind)">
              {{ openRunes.has(g.kind) ? "たたむ ▴" : `他 ${g.keys.filter((k) => !CRAFT_RUNE_KEYS.includes(k)).length} 個 ▸` }}
            </button>
          </p>
          <div v-if="openRunes.has(g.kind) || g.keys.some((k) => CRAFT_RUNE_KEYS.includes(k))" class="flex flex-wrap gap-1.5">
            <ShelfButton v-for="k in openRunes.has(g.kind) ? g.keys : g.keys.filter((k) => CRAFT_RUNE_KEYS.includes(k))" :key="k" :k="k" :title="effectOf(k)" @pick="emit('hold', $event)" />
          </div>
        </div>
      </div>
      <p v-if="!runes.length" class="text-[12px] opacity-50">このベースに効くルーンはありません</p>
    </div>

    <div v-else>
      <p class="mb-2 text-[11px] opacity-60">押すと掛けておきます (何枚でも)。次に打つ手に関係する物だけ使われます。</p>
      <div class="flex flex-wrap gap-x-4 gap-y-2 max-md:gap-x-1.5">
      <div v-for="g in OMEN_GROUPS" :key="g.kind">
        <p class="mb-0.5 text-[10px] opacity-60">{{ g.label }}</p>
        <div class="flex flex-wrap gap-1.5">
          <ShelfButton v-for="k in g.keys" :key="k" :k="k" omen @pick="craftStage.toggleOmen($event)" />
        </div>
      </div>
      </div>
    </div>
    <!-- オーブ以外のタブ (エッセンス等) で持った時は一番下 (お告げのタブは棚そのものがお告げなので出さない) -->
    <div v-if="tab !== 'orb' && tab !== 'usable' && tab !== 'omen' && $slots.held" class="mt-3"><slot name="held" /></div>
  </div>
</template>
