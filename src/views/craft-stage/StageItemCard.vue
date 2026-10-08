<!--
  StageItemCard.vue — クラフトステージのアイテム枠 (2026-09-27、ADR-001)

  ゲームのアイテムの見た目 (レアリティの色の見出し → 種類・アイテムレベル → 固有 → プレ / サフィ)。
  カレンシーを持った状態でここを押すと 1 手打つ (Craft of Exile と同じ操作)。直前の手で付いた MOD は光らせ、消えた MOD は
  取り消し線で一瞬残す (変化が動画で見えるように)。
  2026-10-02 (POE2Tube 要望 ㉔): カタリストの品質で伸びた MOD は伸びた後の数値を水色で (素の値は title)、&tags=1 で MOD の横にタグの札。
  2026-09-28 (POE2Tube 要望 ⑧): ベースの数値 (防御力・武器の物理ダメージ・フラスコの回復量) を品質込みで出す (品質 1% ごとに 1% more、
  poe2db の Quality)。ユニーク (名前と色)・未鑑定 (MOD を隠す)・壊れた・ソケットの絵・スキルジェムのサポート枠。
-->
<script setup lang="ts">
import { computed } from "vue";
import { htcBaseInfo } from "../../services/htc/patch";
import { qualityLabelOf } from "../../services/htc/quality";
import type { StageItem, StageMod } from "../../services/craft-stage/types";
import { isFlask, isGem, reqText } from "../../services/craft-stage/stage-bases";
import { propRows } from "../../services/craft-stage/stage-props";
import { runeArt } from "../../services/craft-stage/rune-art";
import { uniqueLines } from "../../services/craft-stage/stage-uniques";
import { rollLines } from "../../services/craft-stage/roll-text";
import { baseArt } from "../../services/craft-stage/base-art";
import { uniqueArt } from "../../services/assets/unique-art";
import { boostedMod } from "../../services/craft-stage/stage-core";
import { shownTags, TAG_STYLE } from "../../services/craft-stage/mod-list";
import { craftStage } from "../../state/craft-stage";

/**
 * minH: 枠の最低の高さ (px)。動画モードの撮影用で、一番長い時の高さを確保して中身は上詰めにする (手ごとに枠が伸び縮みしない)。
 * compact: 撮影用。英語のベース名を出さず、区切りの余白を詰める (詰めた分だけ拡大できる。MOD の文字を 1080p で 32px 以上に)
 */
/** doomed: 今持っている物を打つと消える MOD (削減のお告げ + カオスの時の候補。ゲームと同じく打つ前に色を付ける、オーナー 2026-10-04) */
const props = defineProps<{ item: StageItem; added: readonly StageMod[]; removed: readonly StageMod[]; holding: boolean; flashKey: number; minH?: number; compact?: boolean; focus?: string | null; width?: number; showTags?: boolean; doomed?: readonly string[] }>();
const isDoomed = (m: StageMod): boolean => !!props.doomed?.includes(m.modId);
/**
 * スポットライト (POE2Tube 要望 ⑪-2、URL の focus=<MOD の id か系統>): その MOD の行だけ光らせて少し大きく、他は暗く
 */
const isFocus = (m: StageMod): boolean => !!props.focus && (m.modId === props.focus || m.modId.endsWith(`/${props.focus}`) || m.family === props.focus);
const anyFocus = computed(() => !!props.focus && [...props.item.prefixes, ...props.item.suffixes].some(isFocus));
const emit = defineEmits<{ use: []; socket: [n: number] }>();
/**
 * ルーンの入ったソケットを押した (2026-10-03): そのソケットを指して打つ (置き換え)。親が持っている物を見て決める
 * (ルーン以外を持っている時は、アイテムを押したのと同じ)。空のソケットはアイテムを押したのと同じ
 */
function onSocket(e: MouseEvent, n: number): void {
  if (!props.holding || !props.item.augments?.[n - 1]) return;
  e.stopPropagation();
  emit("socket", n);
}

/** ゲームのレアリティの色 */
const TONE = {
  normal: { name: "text-rarity-normal", frame: "border-[#8a8a8a]/60", head: "from-[#3a3a3a]/60" },
  magic: { name: "text-rarity-magic", frame: "border-rarity-magic/60", head: "from-[#22224a]/70" },
  rare: { name: "text-rarity-rare", frame: "border-rarity-rare/60", head: "from-[#4a4020]/70" },
  unique: { name: "text-rarity-unique", frame: "border-rarity-unique/70", head: "from-[#4a2a10]/70" },
} as const;
const tone = computed(() => TONE[props.item.rarity]);
const RARITY_JA = { normal: "ノーマル", magic: "マジック", rare: "レア", unique: "ユニーク" } as const;
/** 種類の言葉 (フラスコ・ジェムはレアリティの代わりに出す) */
const kindJa = computed(() => (isGem(props.item.cls.category) ? "スキルジェム" : isFlask(props.item.cls.category) ? "フラスコ" : RARITY_JA[props.item.rarity]));
/**
 * ベースの数値 (品質・ローカル MOD・ルーンを反映、stage-props.ts)。変わった値は青 (ゲームと同じく増えた数値は青)
 */
const baseRows = computed(() => propRows(props.item));
/** 未鑑定なら MOD を隠す */
const hidden = computed(() => props.item.identified === false);
// 範囲 (20-30) はゲームのように振った値で (要望 ㉝ の 5)
const implicits = computed(() => rollLines(props.item, (htcBaseInfo()[props.item.base]?.implicits ?? []).map((i) => i.ja), "implicit"));
/** 絵: ユニークになったらユニークの見た目、それ以外はベースの絵 */
const art = computed(() => (props.item.unique ? uniqueArt(props.item.unique.en) : null) ?? baseArt(props.item.base));
const isNew = (m: StageMod): boolean => props.added.some((a) => a.modId === m.modId);
/** 品質の種類 (カタリスト。「品質 (マナモッド)」) */
const qualityLabel = computed(() => qualityLabelOf(props.item.qualityTag));
/** MOD の種類ごとの色と札 (ゲームの色に寄せる: フラクチャー = 金、冒涜 = 赤、エッセンス = 薄い青) */
function look(m: StageMod): { cls: string; tag: string } {
  if (m.unrevealed) return { cls: "text-rose-300 italic", tag: "" };
  if (m.fractured) return { cls: "text-mod-fractured", tag: "フラクチャー" };
  if (m.desecrated) return { cls: "text-mod-desecrated", tag: "冒涜" };
  if (m.crafted) return { cls: "text-mod-crafted", tag: "エッセンス" };
  // 要望 ㉙: 特殊 MOD のルーンの MOD (重みは仮定) / アルダーのルーンで属性を変えた MOD
  // 札は「ルーン」だけ (POE2Tube 要望 ㉚-3: 動画では「データサイトでは特殊 MOD の出やすさは全部同じ = 完全にランダムな抽選」と説明する。
  // 重みが仮定なのは結果 JSON の assumed_weight に残る)
  if (m.rune) return { cls: "text-rarity-magic", tag: "ルーン" };
  if (m.convertedFrom) return { cls: "text-rarity-magic", tag: "アルダー" };
  return { cls: "text-rarity-magic", tag: "" };
}
/** ユニークの効果 (poe2db のページから。値はユニークごとに決まった 1 つ。ページの無いユニークは空) */
const uLines = computed(() => (props.item.rarity === "unique" && props.item.unique ? rollLines(props.item, uniqueLines(props.item.unique.en), props.item.unique.en, props.item.uniqueScale) : []));
const rows = computed(() =>
  [...props.item.prefixes.map((m) => ({ m, side: "プレ" })), ...props.item.suffixes.map((m) => ({ m, side: "サフィ" }))].map((r) => {
    // カタリストの品質で伸びた数値 (伸びない MOD は null)
    const b = boostedMod(props.item, r.m, craftStage.data.value ?? undefined);
    // 画面用のタグ (クライアントの implicit_tags) を先に。r.m.tags は確率用 (カタリスト等) なので中身のタグが無い MOD がある (2026-10-05)
    const em = craftStage.data.value?.mods.get(r.m.modId);
    const tags = props.showTags ? shownTags(em?.displayTags ?? r.m.tags ?? em?.tags ?? []) : [];
    return { ...r, text: b?.textJa ?? r.m.textJa, boosted: !!b, tags };
  }),
);
</script>

<template>
  <div
    class="relative w-[380px] max-md:w-full select-none rounded-lg border-2 bg-black/70 shadow-[0_0_30px_rgba(0,0,0,0.6)] transition"
    :style="{ ...(minH ? { minHeight: `${minH}px` } : {}), ...(width ? { width: `${width}px` } : {}) }"
    :class="[tone.frame, holding ? 'cursor-pointer ring-2 ring-amber-400/70 hover:ring-amber-300' : '', item.destroyed ? 'stage-destroyed' : '']"
    @click="holding && emit('use')"
  >
    <!-- 壊れた (可能性のオーブの外れ) -->
    <div v-if="item.destroyed" class="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-lg bg-black/60">
      <p class="rotate-[-8deg] rounded border-2 border-rose-500/80 px-4 py-1 text-2xl font-bold tracking-[0.2em] text-rose-400">壊れた</p>
    </div>
    <!-- 解呪 / サルベージで無くなった (要望 ⑰-5) -->
    <div v-if="item.disposed" class="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-lg bg-black/65">
      <p class="rotate-[-8deg] rounded border-2 border-amber-300/80 px-4 py-1 text-2xl font-bold tracking-[0.2em] text-amber-200">{{ item.disposed === "disenchant" ? "解呪した" : "サルベージした" }}</p>
    </div>
    <!-- 見出し -->
    <div class="rounded-t-md bg-gradient-to-b to-transparent px-4 text-center" :class="[tone.head, compact ? 'pb-1 pt-2' : 'pb-2 pt-3', item.disposed ? 'stage-crumble' : '']">
      <!-- ゲーム内と同じ絵 (2026-09-29 オーナー「クラフトステージ上とか」) -->
      <img v-if="art" :src="art" alt="" class="mx-auto mb-1 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]" :class="compact ? 'h-14' : 'h-20'" draggable="false" />
      <!-- stage-item-name: 付いた瞬間の大きな文字が出ている間は薄くする (POE2Tube 要望 ㉚-1、style.css の .stage-fx-on) -->
      <p v-if="item.unique" class="stage-item-name text-lg font-bold" :class="tone.name">{{ item.unique.ja }}</p>
      <p class="stage-item-name" :class="item.unique ? ['text-[15px]', tone.name] : ['text-lg font-bold', tone.name]">{{ item.baseJa }}</p>
      <p v-if="!compact" class="stage-item-name text-[11px] opacity-60">{{ item.base }}</p>
    </div>
    <!-- 解呪 / サルベージで崩れる (要望 ⑰-21) -->
    <div class="space-y-1 px-4 text-center text-[13px]" :class="[compact ? 'pb-2' : 'pb-4', item.disposed ? 'stage-crumble' : '']">
      <p class="text-[12px] text-white/50">{{ kindJa }}<template v-if="!isGem(item.cls.category)"> · アイテムレベル <span class="text-white">{{ item.itemLevel }}</span></template></p>
      <!-- 要求 (要望 ⑱-3) -->
      <p v-if="reqText(item)" class="text-[12px] text-white/50">{{ reqText(item) }}</p>
      <p v-if="item.quality > 0" class="text-[12px] text-white/50">{{ qualityLabel }}: <span class="text-rarity-magic">+{{ item.quality }}%</span></p>
      <!-- ベースの数値 (品質で増えた値は青) -->
      <p v-for="r in baseRows" :key="r.label" class="text-[12px] text-white/50">{{ r.label }}: <span :class="r.up ? 'text-rarity-magic' : 'text-white/85'">{{ r.value }}</span></p>
      <!-- ソケット (熟練工のオーブ) の絵 -->
      <div v-if="item.sockets" class="flex justify-center gap-1.5 py-0.5">
        <!-- はめたルーン (要望 ⑰-1) はソケットの中に絵 -->
        <span v-for="i in item.sockets" :key="'s' + i + (item.augments?.[i - 1]?.key ?? '')" :data-stage-socket="i" :title="item.augments?.[i - 1] ? `${i} 番目: ${item.augments[i - 1]!.ja}` : undefined" class="grid place-items-center rounded-full border-2 border-[#9a8a70] bg-[#1c1812] shadow-[inset_0_0_4px_rgba(0,0,0,0.9)]" :class="item.augments?.[i - 1] ? 'stage-socket-glow h-7 w-7' : 'h-4 w-4'" @click="onSocket($event, i)">
          <img v-if="item.augments?.[i - 1] && runeArt(item.augments[i - 1]!.en)" :src="runeArt(item.augments[i - 1]!.en)!" alt="" class="h-6 w-6 object-contain" draggable="false" />
        </span>
      </div>
      <!-- ルーンの効き目 (MOD とは別の行。ゲームと同じくプロパティの下) -->
      <p v-for="(a, i) in item.augments ?? []" :key="'r' + i + a.key" class="stage-row-in text-[#8fa8ff]">{{ a.textJa }}</p>
      <!-- スキルジェムのサポート枠 (宝飾職人のオーブ) -->
      <div v-if="item.gemSockets" class="flex items-center justify-center gap-1.5 py-0.5 text-[12px] text-white/50">
        サポート枠
        <span v-for="i in item.gemSockets" :key="'g' + i" class="h-3.5 w-3.5 rotate-45 border-2 border-[#7fb0e0] bg-[#101820]" />
      </div>
      <!-- ヴァールのエンチャント (ゲームと同じく固有の上) -->
      <template v-if="item.enchant">
        <div class="mx-auto h-px w-4/5 bg-white/15" :class="compact ? 'my-1' : 'my-2'" />
        <p class="text-[#b8daf2]">{{ item.enchant.textJa }}</p>
        <p v-if="item.enchant2" class="text-[#b8daf2]">{{ item.enchant2.textJa }}</p>
      </template>
      <template v-if="implicits.length">
        <div class="mx-auto h-px w-4/5 bg-white/15" :class="compact ? 'my-1' : 'my-2'" />
        <p v-for="(t, i) in implicits" :key="'i' + i" class="text-rarity-magic">{{ t }}</p>
      </template>
      <div v-if="!isFlask(item.cls.category) && !isGem(item.cls.category)" class="mx-auto h-px w-4/5 bg-white/15" :class="compact ? 'my-1' : 'my-2'" />
      <!-- 未鑑定: MOD を隠す (ゲームと同じく赤い「未鑑定」) -->
      <p v-if="hidden" class="py-1 font-bold text-[#d20000]">未鑑定</p>
      <!-- MOD (冒涜の MOD の行はゲームと同じ緑がかった暗い帯と枠。2026-10-07 オーナー「アイテムに出る時ゲーム仕様に、色だけ、冒涜 MOD のみ」。付いた物は光る。キーを手ごとに変えて光らせ直す。TransitionGroup は leave が光の animation 待ちで残るので使わない) -->
      <div v-if="!hidden" class="space-y-1">
        <p
          v-for="r in rows"
          :key="isNew(r.m) ? `${r.m.modId}#${flashKey}` : r.m.modId"
          class="relative rounded px-2 py-0.5"
          :class="[r.m.desecrated && !r.m.unrevealed ? 'border border-[#4a5a2c]/70 bg-gradient-to-r from-[#0b1008]/80 via-[#1a2612]/80 to-[#0b1008]/80' : '', look(r.m).cls, isNew(r.m) && !(anyFocus && !isFocus(r.m)) ? 'stage-mod-new' : '', anyFocus ? (isFocus(r.m) ? 'z-10 scale-[1.08] bg-amber-300/20 font-bold ring-2 ring-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.55)] transition' : 'opacity-35 transition') : '']"
          :title="isDoomed(r.m) ? (doomed!.length > 1 ? `この手で消える候補 (${doomed!.length} つのうち 1 つ)` : 'この手で消える') : undefined"
        >
          <!-- 消える候補は文字をオレンジに (フラクチャーのくすんだ金色と被らない色。2026-10-07 オーナー「光るの文字にしようか、フラクチャーの色被らんようにオレンジで」) -->
          <span :class="isDoomed(r.m) ? 'font-bold text-[#ff8a3d]' : r.boosted ? 'text-[#7ee8ff]' : ''" :title="r.boosted ? `品質で伸びた数値 (素は ${r.m.textJa})` : undefined">{{ r.text }}</span>
          <span v-for="t in r.tags" :key="t" class="ml-1.5 whitespace-nowrap rounded px-1.5 py-px align-middle text-[10px] not-italic" :class="TAG_STYLE[t]!.cls">{{ TAG_STYLE[t]!.ja }}</span>
          <span class="ml-2 whitespace-nowrap align-middle text-[10px]" :class="r.side === 'プレ' ? 'text-sky-300/70' : 'text-violet-300/70'"><span v-if="look(r.m).tag" class="mr-1 opacity-90">{{ look(r.m).tag }}</span>{{ r.side }} {{ r.m.tierName }}</span>
        </p>
      </div>
      <!-- ユニークの効果 (要望 ⑨)。クライアントの表に「どのユニークがどの MOD」が無いので poe2db のページ (保存済み) から -->
      <div v-if="!hidden && uLines.length" class="space-y-1">
        <p v-for="(t, i) in uLines" :key="'u' + i" class="px-2 py-0.5 text-rarity-magic">{{ t }}</p>
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
    <p v-if="holding" class="absolute -bottom-6 left-0 right-0 text-center text-[11px] text-amber-200/90"><span class="max-md:hidden">押すと使う (右クリック / Esc で手放す)</span><span class="md:hidden">押すと使う (下の帯の「使う」でも)</span></p>
  </div>
</template>
