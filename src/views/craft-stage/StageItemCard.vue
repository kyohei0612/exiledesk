<!--
  StageItemCard.vue — クラフトステージのアイテム枠 (2026-09-27、ADR-001)

  ゲームのアイテムの見た目 (レアリティの色の見出し → 種類・アイテムレベル → 固有 → プレ / サフィ)。
  カレンシーを持った状態でここを押すと 1 手打つ (Craft of Exile と同じ操作)。直前の手で付いた MOD は光らせ、消えた MOD は
  取り消し線で一瞬残す (変化が動画で見えるように)。
  2026-09-28 (POE2Tube 要望 ⑧): ベースの数値 (防御力・武器の物理ダメージ・フラスコの回復量) を品質込みで出す (品質 1% ごとに 1% more、
  poe2db の Quality)。ユニーク (名前と色)・未鑑定 (MOD を隠す)・壊れた・ソケットの絵・スキルジェムのサポート枠。
-->
<script setup lang="ts">
import { computed } from "vue";
import { htcBaseInfo } from "../../services/htc/patch";
import { CATALYSTS } from "../../services/htc/quality";
import type { StageItem, StageMod } from "../../services/craft-stage/types";
import { baseStatsOf, isFlask, isGem } from "../../services/craft-stage/stage-bases";
import { uniqueLines } from "../../services/craft-stage/stage-uniques";
import { baseArt } from "../../services/craft-stage/base-art";

/**
 * minH: 枠の最低の高さ (px)。動画モードの撮影用で、一番長い時の高さを確保して中身は上詰めにする (手ごとに枠が伸び縮みしない)。
 * compact: 撮影用。英語のベース名を出さず、区切りの余白を詰める (詰めた分だけ拡大できる。MOD の文字を 1080p で 32px 以上に)
 */
const props = defineProps<{ item: StageItem; added: readonly StageMod[]; removed: readonly StageMod[]; holding: boolean; flashKey: number; minH?: number; compact?: boolean; focus?: string | null }>();
/**
 * スポットライト (POE2Tube 要望 ⑪-2、URL の focus=<MOD の id か系統>): その MOD の行だけ光らせて少し大きく、他は暗く
 */
const isFocus = (m: StageMod): boolean => !!props.focus && (m.modId === props.focus || m.modId.endsWith(`/${props.focus}`) || m.family === props.focus);
const anyFocus = computed(() => !!props.focus && [...props.item.prefixes, ...props.item.suffixes].some(isFocus));
const emit = defineEmits<{ use: [] }>();

/** ゲームのレアリティの色 */
const TONE = {
  normal: { name: "text-[#c8c8c8]", frame: "border-[#8a8a8a]/60", head: "from-[#3a3a3a]/60" },
  magic: { name: "text-[#8888ff]", frame: "border-[#8888ff]/60", head: "from-[#22224a]/70" },
  rare: { name: "text-[#e8d77a]", frame: "border-[#e8d77a]/60", head: "from-[#4a4020]/70" },
  unique: { name: "text-[#af6025]", frame: "border-[#af6025]/70", head: "from-[#4a2a10]/70" },
} as const;
const tone = computed(() => TONE[props.item.rarity]);
const RARITY_JA = { normal: "ノーマル", magic: "マジック", rare: "レア", unique: "ユニーク" } as const;
/** 種類の言葉 (フラスコ・ジェムはレアリティの代わりに出す) */
const kindJa = computed(() => (isGem(props.item.cls.category) ? "スキルジェム" : isFlask(props.item.cls.category) ? "フラスコ" : RARITY_JA[props.item.rarity]));
/**
 * ベースの数値を品質込みで (品質 1% ごとに 1% more。poe2db の Quality)。変わった値は青 (ゲームと同じく増えた数値は青)
 */
const baseRows = computed(() => {
  const b = baseStatsOf(props.item.base);
  if (!b) return [];
  const q = 1 + props.item.quality / 100;
  const mul = (v: number | [number, number]): string => (Array.isArray(v) ? `${Math.round(v[0] * q)}〜${Math.round(v[1] * q)}` : String(Math.round(v * q)));
  const rows: Array<{ label: string; value: string; up: boolean }> = [];
  const up = props.item.quality > 0;
  if (b.phys) rows.push({ label: "物理ダメージ", value: mul(b.phys), up });
  if (b.crit) rows.push({ label: "クリティカルヒット率", value: `${b.crit.toFixed(2)}%`, up: false });
  if (b.aps) rows.push({ label: "アタック/秒", value: b.aps.toFixed(2), up: false });
  if (b.armour) rows.push({ label: "アーマー", value: mul(b.armour), up });
  if (b.evasion) rows.push({ label: "回避力", value: mul(b.evasion), up });
  if (b.es) rows.push({ label: "エナジーシールド", value: mul(b.es), up });
  if (b.block) rows.push({ label: "ブロック率", value: `${b.block}%`, up: false });
  if (b.life) rows.push({ label: "ライフ回復", value: mul(b.life), up });
  if (b.mana) rows.push({ label: "マナ回復", value: mul(b.mana), up });
  if (b.duration && (b.life || b.mana)) rows.push({ label: "回復時間", value: `${(b.duration / 10).toFixed(1)} 秒`, up: false });
  return rows;
});
/** 未鑑定なら MOD を隠す */
const hidden = computed(() => props.item.identified === false);
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
/** ユニークの効果 (poe2db のページから。値はユニークごとに決まった 1 つ。ページの無いユニークは空) */
const uLines = computed(() => (props.item.rarity === "unique" && props.item.unique ? uniqueLines(props.item.unique.en) : []));
const rows = computed(() => [
  ...props.item.prefixes.map((m) => ({ m, side: "プレ" })),
  ...props.item.suffixes.map((m) => ({ m, side: "サフィ" })),
]);
</script>

<template>
  <div
    class="relative w-[380px] select-none rounded-lg border-2 bg-black/70 shadow-[0_0_30px_rgba(0,0,0,0.6)] transition"
    :style="minH ? { minHeight: `${minH}px` } : undefined"
    :class="[tone.frame, holding ? 'cursor-pointer ring-2 ring-amber-400/70 hover:ring-amber-300' : '', item.destroyed ? 'stage-destroyed' : '']"
    @click="holding && emit('use')"
  >
    <!-- 壊れた (可能性のオーブの外れ) -->
    <div v-if="item.destroyed" class="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-lg bg-black/60">
      <p class="rotate-[-8deg] rounded border-2 border-rose-500/80 px-4 py-1 text-2xl font-bold tracking-[0.2em] text-rose-400">壊れた</p>
    </div>
    <!-- 見出し -->
    <div class="rounded-t-md bg-gradient-to-b to-transparent px-4 text-center" :class="[tone.head, compact ? 'pb-1 pt-2' : 'pb-2 pt-3']">
      <!-- ゲーム内と同じ絵 (2026-09-29 オーナー「クラフトステージ上とか」) -->
      <img v-if="baseArt(item.base)" :src="baseArt(item.base)!" alt="" class="mx-auto mb-1 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]" :class="compact ? 'h-14' : 'h-20'" draggable="false" />
      <p v-if="item.unique" class="text-lg font-bold" :class="tone.name">{{ item.unique.ja }}</p>
      <p :class="item.unique ? ['text-[15px]', tone.name] : ['text-lg font-bold', tone.name]">{{ item.baseJa }}</p>
      <p v-if="!compact" class="text-[11px] opacity-60">{{ item.base }}</p>
    </div>
    <div class="space-y-1 px-4 text-center text-[13px]" :class="compact ? 'pb-2' : 'pb-4'">
      <p class="text-[12px] text-white/50">{{ kindJa }}<template v-if="!isGem(item.cls.category)"> · アイテムレベル <span class="text-white">{{ item.itemLevel }}</span></template></p>
      <p v-if="item.quality > 0" class="text-[12px] text-white/50">{{ qualityLabel }}: <span class="text-[#8888ff]">+{{ item.quality }}%</span></p>
      <!-- ベースの数値 (品質で増えた値は青) -->
      <p v-for="r in baseRows" :key="r.label" class="text-[12px] text-white/50">{{ r.label }}: <span :class="r.up ? 'text-[#8888ff]' : 'text-white/85'">{{ r.value }}</span></p>
      <!-- ソケット (熟練工のオーブ) の絵 -->
      <div v-if="item.sockets" class="flex justify-center gap-1.5 py-0.5">
        <span v-for="i in item.sockets" :key="'s' + i" class="h-4 w-4 rounded-full border-2 border-[#9a8a70] bg-[#1c1812] shadow-[inset_0_0_4px_rgba(0,0,0,0.9)]" />
      </div>
      <!-- スキルジェムのサポート枠 (宝飾職人のオーブ) -->
      <div v-if="item.gemSockets" class="flex items-center justify-center gap-1.5 py-0.5 text-[12px] text-white/50">
        サポート枠
        <span v-for="i in item.gemSockets" :key="'g' + i" class="h-3.5 w-3.5 rotate-45 border-2 border-[#7fb0e0] bg-[#101820]" />
      </div>
      <!-- ヴァールのエンチャント (ゲームと同じく固有の上) -->
      <template v-if="item.enchant">
        <div class="mx-auto h-px w-4/5 bg-white/15" :class="compact ? 'my-1' : 'my-2'" />
        <p class="text-[#b8daf2]">{{ item.enchant.textJa }}</p>
      </template>
      <template v-if="implicits.length">
        <div class="mx-auto h-px w-4/5 bg-white/15" :class="compact ? 'my-1' : 'my-2'" />
        <p v-for="(t, i) in implicits" :key="'i' + i" class="text-[#8888ff]">{{ t }}</p>
      </template>
      <div v-if="!isFlask(item.cls.category) && !isGem(item.cls.category)" class="mx-auto h-px w-4/5 bg-white/15" :class="compact ? 'my-1' : 'my-2'" />
      <!-- 未鑑定: MOD を隠す (ゲームと同じく赤い「未鑑定」) -->
      <p v-if="hidden" class="py-1 font-bold text-[#d20000]">未鑑定</p>
      <!-- MOD (付いた物は光る。キーを手ごとに変えて光らせ直す。TransitionGroup は leave が光の animation 待ちで残るので使わない) -->
      <div v-if="!hidden" class="space-y-1">
        <p
          v-for="r in rows"
          :key="isNew(r.m) ? `${r.m.modId}#${flashKey}` : r.m.modId"
          class="relative rounded px-2 py-0.5"
          :class="[look(r.m).cls, isNew(r.m) && !(anyFocus && !isFocus(r.m)) ? 'stage-mod-new' : '', anyFocus ? (isFocus(r.m) ? 'z-10 scale-[1.08] bg-amber-300/20 font-bold ring-2 ring-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.55)] transition' : 'opacity-35 transition') : '']"
        >
          {{ r.m.textJa }}
          <span class="ml-2 whitespace-nowrap align-middle text-[10px]" :class="r.side === 'プレ' ? 'text-sky-300/70' : 'text-violet-300/70'"><span v-if="look(r.m).tag" class="mr-1 opacity-90">{{ look(r.m).tag }}</span>{{ r.side }} {{ r.m.tierName }}</span>
        </p>
      </div>
      <!-- ユニークの効果 (要望 ⑨)。クライアントの表に「どのユニークがどの MOD」が無いので poe2db のページ (保存済み) から -->
      <div v-if="!hidden && uLines.length" class="space-y-1">
        <p v-for="(t, i) in uLines" :key="'u' + i" class="px-2 py-0.5 text-[#8888ff]">{{ t }}</p>
      </div>
      <!-- ページの無いユニークは名前だけ (撮影用は注記も出さない) -->
      <p v-if="!rows.length && !uLines.length && !hidden && !isFlask(item.cls.category) && !isGem(item.cls.category) && !(compact && item.rarity === 'unique')" class="py-1 text-white/30">{{ item.rarity === "unique" ? (compact ? "" : "(このユニークの効果はデータに無い)") : "MOD なし" }}</p>
      <!-- 消えた MOD (直前の手) -->
      <p v-for="m in removed" :key="'x' + m.modId + flashKey" class="stage-mod-gone text-rose-300/80 line-through">{{ m.textJa }}</p>
      <p v-if="item.corrupted" class="pt-1 font-bold text-[#d20000]">コラプト</p>
      <p v-if="item.sanctified" class="pt-1 font-bold text-amber-200">聖別</p>
      <!-- 2026-09-29 に足したカレンシーの印 (apply-extra.ts) -->
      <p v-if="item.siphoner" class="text-[#d20000]">キル閾値 (ヴァールサイフォナー)</p>
      <p v-if="item.mirrored" class="pt-1 font-bold text-sky-200">ミラー</p>
      <p v-if="item.foreseen" class="pt-1 text-violet-200">予見 (次の手の結果が見える)</p>
    </div>
    <p v-if="holding" class="absolute -bottom-6 left-0 right-0 text-center text-[11px] text-amber-200/90">押すと使う (右クリック / Esc で手放す)</p>
  </div>
</template>
