<!--
  StageItemCard.vue — クラフトステージのアイテム枠 (2026-09-27、ADR-001)

  ゲームのアイテムの見た目 (レアリティの色の見出し → 種類・アイテムレベル → 固有 → プレ / サフィ)。
  カレンシーを持った状態でここを押すと 1 手打つ (Craft of Exile と同じ操作)。直前の手で付いた MOD は光らせ、消えた MOD は
  取り消し線で一瞬残す (変化が動画で見えるように)。
-->
<script setup lang="ts">
import { computed } from "vue";
import { htcBaseInfo } from "../../services/htc/patch";
import { CATALYSTS } from "../../services/htc/quality";
import type { StageItem, StageMod } from "../../services/craft-stage/types";

const props = defineProps<{ item: StageItem; added: readonly StageMod[]; removed: readonly StageMod[]; holding: boolean; flashKey: number }>();
const emit = defineEmits<{ use: [] }>();

/** ゲームのレアリティの色 */
const TONE = {
  normal: { name: "text-[#c8c8c8]", frame: "border-[#8a8a8a]/60", head: "from-[#3a3a3a]/60" },
  magic: { name: "text-[#8888ff]", frame: "border-[#8888ff]/60", head: "from-[#22224a]/70" },
  rare: { name: "text-[#e8d77a]", frame: "border-[#e8d77a]/60", head: "from-[#4a4020]/70" },
} as const;
const tone = computed(() => TONE[props.item.rarity]);
const RARITY_JA = { normal: "ノーマル", magic: "マジック", rare: "レア" } as const;
const implicits = computed(() => (htcBaseInfo()[props.item.base]?.implicits ?? []).map((i) => i.ja));
const isNew = (m: StageMod): boolean => props.added.some((a) => a.modId === m.modId);
/** 品質の種類 (カタリスト。「品質 (マナモッド)」) */
const qualityLabel = computed(() => CATALYSTS.find((c) => c.tag === props.item.qualityTag)?.label.ja ?? "品質");
/** MOD の種類ごとの色と札 (ゲームの色に寄せる: 破砕 = 金、冒涜 = 赤、エッセンス = 薄い青) */
function look(m: StageMod): { cls: string; tag: string } {
  if (m.unrevealed) return { cls: "text-rose-300 italic", tag: "" };
  if (m.fractured) return { cls: "text-[#c8a86a]", tag: "破砕" };
  if (m.desecrated) return { cls: "text-[#e0a0a0]", tag: "冒涜" };
  if (m.crafted) return { cls: "text-[#b8c8ff]", tag: "エッセンス" };
  return { cls: "text-[#8888ff]", tag: "" };
}
const rows = computed(() => [
  ...props.item.prefixes.map((m) => ({ m, side: "プレ" })),
  ...props.item.suffixes.map((m) => ({ m, side: "サフィ" })),
]);
</script>

<template>
  <div
    class="relative w-[380px] select-none rounded-lg border-2 bg-black/70 shadow-[0_0_30px_rgba(0,0,0,0.6)] transition"
    :class="[tone.frame, holding ? 'cursor-pointer ring-2 ring-amber-400/70 hover:ring-amber-300' : '']"
    @click="holding && emit('use')"
  >
    <!-- 見出し -->
    <div class="rounded-t-md bg-gradient-to-b to-transparent px-4 pb-2 pt-3 text-center" :class="tone.head">
      <p class="text-lg font-bold" :class="tone.name">{{ item.baseJa }}</p>
      <p class="text-[11px] opacity-60">{{ item.base }}</p>
    </div>
    <div class="space-y-1 px-4 pb-4 text-center text-[13px]">
      <p class="text-[12px] text-white/50">{{ RARITY_JA[item.rarity] }} · アイテムレベル <span class="text-white">{{ item.itemLevel }}</span></p>
      <p v-if="item.quality > 0" class="text-[12px] text-white/50">{{ qualityLabel }}: <span class="text-[#8888ff]">+{{ item.quality }}%</span></p>
      <p v-if="item.sockets" class="text-[12px] text-white/50">ソケット: <span class="tracking-[0.2em] text-white/80">{{ "●".repeat(item.sockets) }}</span></p>
      <template v-if="implicits.length">
        <div class="mx-auto my-2 h-px w-4/5 bg-white/15" />
        <p v-for="(t, i) in implicits" :key="'i' + i" class="text-[#8888ff]">{{ t }}</p>
      </template>
      <div class="mx-auto my-2 h-px w-4/5 bg-white/15" />
      <!-- MOD (付いた物は光る。キーを手ごとに変えて光らせ直す。TransitionGroup は leave が光の animation 待ちで残るので使わない) -->
      <div class="space-y-1">
        <p
          v-for="r in rows"
          :key="isNew(r.m) ? `${r.m.modId}#${flashKey}` : r.m.modId"
          class="relative rounded px-2 py-0.5"
          :class="[look(r.m).cls, isNew(r.m) ? 'stage-mod-new' : '']"
        >
          {{ r.m.textJa }}
          <span class="absolute right-1 top-1/2 -translate-y-1/2 text-[10px]" :class="r.side === 'プレ' ? 'text-sky-300/70' : 'text-violet-300/70'"><span v-if="look(r.m).tag" class="mr-1 opacity-90">{{ look(r.m).tag }}</span>{{ r.side }} {{ r.m.tierName }}</span>
        </p>
      </div>
      <p v-if="!rows.length" class="py-1 text-white/30">MOD なし</p>
      <!-- 消えた MOD (直前の手) -->
      <p v-for="m in removed" :key="'x' + m.modId + flashKey" class="stage-mod-gone text-rose-300/80 line-through">{{ m.textJa }}</p>
    </div>
    <p v-if="holding" class="absolute -bottom-6 left-0 right-0 text-center text-[11px] text-amber-200/90">押すと使う (右クリック / Esc で手放す)</p>
  </div>
</template>
