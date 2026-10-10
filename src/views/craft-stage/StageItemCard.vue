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
import STAT_ORDER from "../../data/stat-order.json";
import { fmtChance, RARE_CHANCE } from "../../utils/format-pct";
import { modText, nameOf, baseNameOf, tr } from "../../i18n/lang";
import { computed } from "vue";
import { htcBaseInfo } from "../../services/htc/patch";
import { qualityLabelOf } from "../../services/htc/quality";
import type { StageItem, StageMod } from "../../services/craft-stage/types";
import { isFlask, isGem, reqText } from "../../services/craft-stage/stage-bases";
import { propRows } from "../../services/craft-stage/stage-props";
import { runeArt } from "../../services/craft-stage/rune-art";
import { uniqueLines } from "../../services/craft-stage/stage-uniques";
import { rollLines } from "../../services/craft-stage/roll-text";
import { boostedMod, scaledAugment, unfracturable } from "../../services/craft-stage/stage-core";
import { shownTags, TAG_STYLE } from "../../services/craft-stage/mod-list";
import { classLabel } from "../../services/items/base-catalog";
import { tagLabel } from "../../services/mods/tag-ja";
import { craftStage } from "../../state/craft-stage";

/**
 * minH: 枠の最低の高さ (px)。動画モードの撮影用で、一番長い時の高さを確保して中身は上詰めにする (手ごとに枠が伸び縮みしない)。
 * compact: 撮影用。英語のベース名を出さず、区切りの余白を詰める (詰めた分だけ拡大できる。MOD の文字を 1080p で 32px 以上に)
 */
/** doomed: 今持っている物を打つと消える MOD (削減のお告げ + カオスの時の候補。ゲームと同じく打つ前に色を付ける、オーナー 2026-10-04) */
const props = defineProps<{ item: StageItem; added: readonly StageMod[]; removed: readonly StageMod[]; holding: boolean; flashKey: number; minH?: number; compact?: boolean; focus?: string | null; width?: number; showTags?: boolean; doomed?: readonly string[] ; /** MOD の行に × を出して外せる (手で打つ画面) */ removable?: boolean}>();
const isDoomed = (m: StageMod): boolean => !!props.doomed?.includes(m.modId);
/**
 * スポットライト (POE2Tube 要望 ⑪-2、URL の focus=<MOD の id か系統>): その MOD の行だけ光らせて少し大きく、他は暗く
 */
const isFocus = (m: StageMod): boolean => !!props.focus && (m.modId === props.focus || m.modId.endsWith(`/${props.focus}`) || m.family === props.focus);
const anyFocus = computed(() => !!props.focus && [...props.item.prefixes, ...props.item.suffixes].some(isFocus));
const emit = defineEmits<{ use: []; socket: [n: number]; unsocket: [n: number]; remove: [modId: string]; fracture: [m: StageMod] }>();
/** ルーンを外す (2026-10-09): ソケットの右クリック、またはルーンの効き目の行のクリック。手で組んでいる時だけ (removable) */
function onUnsocket(e: MouseEvent, n: number): void {
  if (!props.removable || !props.item.augments?.[n - 1]) return;
  e.preventDefault();
  e.stopPropagation();
  emit("unsocket", n);
}
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
// 本文のまわりはゲームと同じくレアリティの色の細い線 (外の太い飾り枠は無し。名前の枠がそのまま窓の一番上。2026-10-10 オーナー「上いらん」)
const TONE = {
  normal: { name: "text-rarity-normal", frame: "border-[#6a6a6a]" },
  magic: { name: "text-rarity-magic", frame: "border-[#3d3d8a]" },
  rare: { name: "text-rarity-rare", frame: "border-[#7a6a35]" },
  unique: { name: "text-rarity-unique", frame: "border-[#8a5a30]" },
} as const;
const tone = computed(() => TONE[props.item.rarity]);
/** 名前の枠は 1 行 (ベース名) にそろえる。ユニークだけ 2 行 (名前 + ベース)。2026-10-10 オーナー「1 行でいい、ちゃんとしたベース名で統一」 */
const twoLine = computed(() => !!props.item.unique);
/** 種類の言葉 (フラスコ・ジェムはレアリティの代わりに出す) */
// ゲームと同じく装備の種類 (アミュレット・鎧 …)。レアリティは名前の枠の色で分かる (2026-10-10)
const kindJa = computed(() => (isGem(props.item.cls.category) ? tr("スキルジェム", "Skill Gem") : isFlask(props.item.cls.category) ? tr("フラスコ", "Flask") : classLabel(props.item.cls.category, false)));
/**
 * ベースの数値 (品質・ローカル MOD・ルーンを反映、stage-props.ts)。変わった値は青 (ゲームと同じく増えた数値は青)
 */
const baseRows = computed(() => propRows(props.item));
/** 未鑑定なら MOD を隠す */
const hidden = computed(() => props.item.identified === false);
// 範囲 (20-30) はゲームのように振った値で (要望 ㉝ の 5)
/** 付いた瞬間の確率 (工程の記録から。後から付き直した物は新しい方)。右端に出す */
const chances = computed(() => {
  const m = new Map<string, number>();
  for (const e of craftStage.log.value) for (const [id, c] of Object.entries(e.chances ?? {})) m.set(id, c as number);
  return m;
});
const chanceOf = (m: { modId: string }): number | null => chances.value.get(m.modId) ?? null;
const implicits = computed(() => rollLines(props.item, (htcBaseInfo()[props.item.base]?.implicits ?? []).map(nameOf), "implicit"));
const isNew = (m: StageMod): boolean => props.added.some((a) => a.modId === m.modId);
/** 品質の種類 (カタリスト。「品質 (マナモッド)」) */
const qualityLabel = computed(() => qualityLabelOf(props.item.qualityTag));
/** MOD の種類ごとの色と札 (ゲームの色に寄せる: フラクチャー = 金、冒涜 = 赤、エッセンス = 薄い青) */
function look(m: StageMod): { cls: string; tag: string } {
  if (m.unrevealed) return { cls: "text-rose-300 italic", tag: "" };
  if (m.fractured) return { cls: "text-mod-fractured", tag: tr("フラクチャー", "Fractured") };
  if (m.desecrated) return { cls: "text-mod-desecrated", tag: tr("冒涜", "Desecrated") };
  if (m.crafted) return { cls: "text-mod-crafted", tag: tr("エッセンス", "Essence") };
  // 要望 ㉙: 特殊 MOD のルーンの MOD (重みは仮定) / アルダーのルーンで属性を変えた MOD
  // 札は「ルーン」だけ (POE2Tube 要望 ㉚-3: 動画では「データサイトでは特殊 MOD の出やすさは全部同じ = 完全にランダムな抽選」と説明する。
  // 重みが仮定なのは結果 JSON の assumed_weight に残る)
  if (m.rune) return { cls: "text-rarity-magic", tag: tr("ルーン", "Rune") };
  if (m.convertedFrom) return { cls: "text-rarity-magic", tag: tr("アルダー", "Aldur") };
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
    // ゲームと同じ並び: プレ / サフィで分けず、説明文の表の順 (stat-order.json)。分からない物は後ろ (プレ → サフィのまま)
    const st = (r.m as { stats?: string[] }).stats?.[0] ?? (em?.tiers?.[0] as { stats?: string[] } | undefined)?.stats?.[0];
    const ord = st != null ? (STAT_ORDER as Record<string, number>)[st] ?? 1e9 : 1e9;
    return { ...r, text: b ? modText(b) : modText(r.m), boosted: !!b, tags, ord };
  }).sort((x, y) => x.ord - y.ord),
);
</script>

<template>
  <div
    data-stage-card class="st-card relative w-[480px] max-md:w-full select-none border bg-[#050506] shadow-[0_0_30px_rgba(0,0,0,0.6)] transition"
    :style="{ ...(minH ? { minHeight: `${minH}px` } : {}), ...(width ? { width: `${width}px` } : {}) }"
    :class="[tone.frame, holding ? 'cursor-pointer ring-2 ring-amber-400/70 hover:ring-amber-300' : '', item.destroyed ? 'stage-destroyed' : '']"
    @click="holding && emit('use')"
  >
    <!-- 壊れた (可能性のオーブの外れ) -->
    <div v-if="item.destroyed" class="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-lg bg-black/60">
      <p class="rotate-[-8deg] rounded border-2 border-rose-500/80 px-4 py-1 text-2xl font-bold tracking-[0.2em] text-rose-400">{{ tr("壊れた", "Destroyed") }}</p>
    </div>
    <!-- 解呪 / サルベージで無くなった (要望 ⑰-5) -->
    <div v-if="item.disposed" class="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-lg bg-black/65">
      <p class="rotate-[-8deg] rounded border-2 border-amber-300/80 px-4 py-1 text-2xl font-bold tracking-[0.2em] text-amber-200">{{ item.disposed === "disenchant" ? tr("解呪した", "Disenchanted") : tr("サルベージした", "Salvaged") }}</p>
    </div>
    <!-- 見出し: ゲームのアイテムの説明と同じ名前の枠 (クライアントの ItemsHeader の絵、ベースのカードと同じ ihead-*)。窓の中に絵は出さない
         (2026-10-10 オーナー「アイテムのぞいた時は上、ここにアイコンとか出てたらダメじゃね」。ユニークは 2 行 = 名前 + ベース) -->
    <div class="st-head" :class="[`st-${item.rarity}`, twoLine ? 'two' : 'one', item.disposed ? 'stage-crumble' : '']">
      <p v-if="item.unique" class="st-name" :class="tone.name">{{ nameOf(item.unique) }}</p>
      <p class="st-name" :class="tone.name">{{ baseNameOf(item) }}</p>
    </div>
    <!-- 解呪 / サルベージで崩れる (要望 ⑰-21) -->
    <div class="space-y-1 px-4 text-center text-[13px]" :class="[compact ? 'pb-2' : 'pb-4', item.disposed ? 'stage-crumble' : '']">
      <!-- ゲームと同じ並び: 種類 → アイテムレベル → 必要 (英語のベース名はここに小さく) -->
      <p class="pt-1 text-[12px] text-white/50">{{ kindJa }}<span v-if="!compact" class="ml-1.5 text-[11px] opacity-60">{{ item.base }}</span></p>
      <p v-if="!isGem(item.cls.category)" class="text-[12px] text-white/50">{{ tr("アイテムレベル", "Item Level") }}: <span class="text-white">{{ item.itemLevel }}</span></p>
      <!-- 要求 (要望 ⑱-3) -->
      <p v-if="reqText(item)" class="text-[12px] text-white/50">{{ reqText(item) }}</p>
      <p v-if="item.quality > 0" class="text-[12px] text-white/50">{{ qualityLabel }}: <span class="text-rarity-magic">+{{ item.quality }}%</span></p>
      <!-- ベースの数値 (品質で増えた値は青) -->
      <p v-for="r in baseRows" :key="r.key" class="text-[12px] text-white/50">{{ r.label ? `${r.label}: ` : "" }}<span :class="r.up ? 'text-rarity-magic' : 'text-white/85'">{{ r.value }}</span></p>
      <!-- ソケット (熟練工のオーブ) の絵 -->
      <div v-if="item.sockets" class="flex justify-center gap-1.5 py-0.5">
        <!-- はめたルーン (要望 ⑰-1) はソケットの中に絵 -->
        <span v-for="i in item.sockets" :key="'s' + i + (item.augments?.[i - 1]?.key ?? '')" :data-stage-socket="i" :title="item.augments?.[i - 1] ? tr(`${i} 番目: ${nameOf(item.augments[i - 1]!)}${removable ? ' (右クリックで外す)' : ''}`, `Socket ${i}: ${nameOf(item.augments[i - 1]!)}${removable ? ' (right-click to remove)' : ''}`) : undefined" class="grid place-items-center rounded-full border-2 border-[#9a8a70] bg-[#1c1812] shadow-[inset_0_0_4px_rgba(0,0,0,0.9)]" :class="item.augments?.[i - 1] ? 'stage-socket-glow h-7 w-7' : 'h-4 w-4'" @click="onSocket($event, i)" @contextmenu="onUnsocket($event, i)">
          <img v-if="item.augments?.[i - 1] && runeArt(item.augments[i - 1]!.en)" :src="runeArt(item.augments[i - 1]!.en)!" alt="" class="h-6 w-6 object-contain" draggable="false" />
        </span>
      </div>
      <!-- ルーンの効き目 (MOD とは別の行。ゲームと同じくプロパティの下) -->
      <p v-for="(a, i) in item.augments ?? []" :key="'r' + i + a.key" class="stage-row-in text-[#8fa8ff]" :class="removable && !holding ? 'cursor-pointer hover:line-through' : ''" :title="removable && !holding ? tr(`${nameOf(a)} を外す`, `Remove ${nameOf(a)}`) : undefined" @click="!holding && onUnsocket($event, i + 1)" @contextmenu="onUnsocket($event, i + 1)">{{ modText(scaledAugment(item, a)) }}</p>
      <!-- スキルジェムのサポート枠 (宝飾職人のオーブ) -->
      <div v-if="item.gemSockets" class="flex items-center justify-center gap-1.5 py-0.5 text-[12px] text-white/50">
        {{ tr("サポート枠", "Support Gem Sockets") }}
        <span v-for="i in item.gemSockets" :key="'g' + i" class="h-3.5 w-3.5 rotate-45 border-2 border-[#7fb0e0] bg-[#101820]" />
      </div>
      <!-- ヴァールのエンチャント (ゲームと同じく固有の上) -->
      <template v-if="item.enchant">
        <div class="mx-auto h-px w-4/5 bg-white/15" :class="compact ? 'my-1' : 'my-2'" />
        <p class="text-[#b8daf2]">{{ modText(item.enchant) }}</p>
        <p v-if="item.enchant2" class="text-[#b8daf2]">{{ modText(item.enchant2) }}</p>
      </template>
      <template v-if="implicits.length">
        <div class="mx-auto h-px w-4/5 bg-white/15" :class="compact ? 'my-1' : 'my-2'" />
        <p v-for="(t, i) in implicits" :key="'i' + i" class="text-rarity-magic">{{ t }}</p>
      </template>
      <div v-if="!isFlask(item.cls.category) && !isGem(item.cls.category)" class="mx-auto h-px w-4/5 bg-white/15" :class="compact ? 'my-1' : 'my-2'" />
      <!-- 未鑑定: MOD を隠す (ゲームと同じく赤い「未鑑定」) -->
      <p v-if="hidden" class="py-1 font-bold text-[#d20000]">{{ tr("未鑑定", "Unidentified") }}</p>
      <!-- MOD (冒涜の MOD の行はゲームと同じ緑がかった暗い帯と枠。2026-10-07 オーナー「アイテムに出る時ゲーム仕様に、色だけ、冒涜 MOD のみ」。付いた物は光る。キーを手ごとに変えて光らせ直す。TransitionGroup は leave が光の animation 待ちで残るので使わない) -->
      <div v-if="!hidden" class="space-y-1">
        <p
          v-for="r in rows"
          :key="isNew(r.m) ? `${r.m.modId}#${flashKey}` : r.m.modId"
          class="relative flex items-center gap-2 rounded px-2 py-0.5"
          :class="[r.m.desecrated && !r.m.unrevealed ? 'border border-[#4a5a2c]/70 bg-gradient-to-r from-[#0b1008]/80 via-[#1a2612]/80 to-[#0b1008]/80' : '', look(r.m).cls, isNew(r.m) && !(anyFocus && !isFocus(r.m)) ? (r.m.tierName === 'T1' ? 'stage-mod-new-top' : 'stage-mod-new') : '', anyFocus ? (isFocus(r.m) ? 'z-10 scale-[1.08] bg-amber-300/20 font-bold ring-2 ring-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.55)] transition' : 'opacity-35 transition') : '']"
          :title="isDoomed(r.m) ? (doomed!.length > 1 ? tr(`この手で消える候補 (${doomed!.length} つのうち 1 つ)`, `May be removed by this use (1 of ${doomed!.length})`) : tr('この手で消える', 'Removed by this use')) : removable && !unfracturable(craftStage.data.value, item, r.m) && !r.m.fractured ? tr('右クリックでフラクチャー (この MOD を固定)', 'Right-click to fracture this mod') : undefined"
          @contextmenu="removable && !unfracturable(craftStage.data.value, item, r.m) && !r.m.fractured ? ($event.preventDefault(), $event.stopPropagation(), emit('fracture', r.m)) : undefined"
        >
          <!-- トレードサイトと同じ: 左端に P1 / S5 (プレ / サフィと段)、真ん中に MOD の文 (長い物は折り返す)、右端に付いた瞬間の確率と × (2026-10-10 オーナーの見本) -->
          <span class="w-7 shrink-0 text-left text-[12px] font-bold tabular-nums" :class="r.side === 'プレ' ? 'text-[#e0846a]' : 'text-[#6aa8e8]'">{{ r.side === "プレ" ? "P" : "S" }}{{ (r.m.tierName ?? "").replace(/^T/, "") }}</span>
          <span class="min-w-0 flex-1 text-center">
            <!-- 消える候補は文字をオレンジに (フラクチャーのくすんだ金色と被らない色。2026-10-07 オーナー「光るの文字にしようか、フラクチャーの色被らんようにオレンジで」) -->
            <span :class="isDoomed(r.m) ? 'font-bold text-[#ff8a3d]' : r.boosted ? 'text-[#7ee8ff]' : ''" :title="r.boosted ? tr(`品質で伸びた数値 (素は ${modText(r.m)})`, `Boosted by quality (base: ${modText(r.m)})`) : undefined">{{ r.text }}</span>
            <span v-if="look(r.m).tag" class="ml-1.5 whitespace-nowrap align-middle text-[10px] opacity-80">{{ look(r.m).tag }}</span>
            <span v-for="t in r.tags" :key="t" class="ml-1.5 whitespace-nowrap rounded px-1.5 py-px align-middle text-[10px] not-italic" :class="TAG_STYLE[t]!.cls">{{ tagLabel(t) }}</span>
          </span>
          <span class="flex shrink-0 items-center justify-end gap-1">
            <span v-if="chanceOf(r.m) != null" class="text-[11px] tabular-nums" :class="chanceOf(r.m)! < RARE_CHANCE ? 'font-bold text-amber-300' : 'text-[var(--exile-color-text-tertiary)]'" :title="tr('付いた瞬間に、この段が付く確率 (その段の重み ÷ この手で付きうる全部の重み)', 'Chance this tier rolled when it was added (tier weight ÷ total weight of everything that step could add)')">{{ fmtChance(chanceOf(r.m)!) }}</span>
            <button v-if="removable && !r.m.unrevealed" type="button" class="rounded px-1 text-[12px] leading-none text-rose-300/70 hover:bg-rose-500/20 hover:text-rose-200 max-md:px-2 max-md:py-1 max-md:text-[16px]" :title="tr('この MOD を外す (費用 0、1 手戻すで戻る)', 'Remove this mod (free, Undo brings it back)')" @click.stop="emit('remove', r.m.modId)">×</button>
          </span>
        </p>
      </div>
      <!-- ユニークの効果 (要望 ⑨)。クライアントの表に「どのユニークがどの MOD」が無いので poe2db のページ (保存済み) から -->
      <div v-if="!hidden && uLines.length" class="space-y-1">
        <p v-for="(t, i) in uLines" :key="'u' + i" class="px-2 py-0.5 text-rarity-magic">{{ t }}</p>
      </div>
      <!-- ページの無いユニークは名前だけ (撮影用は注記も出さない) -->
      <p v-if="!rows.length && !uLines.length && !hidden && !isFlask(item.cls.category) && !isGem(item.cls.category) && !(compact && item.rarity === 'unique')" class="py-1 text-white/30">{{ item.rarity === "unique" ? (compact ? "" : tr("(このユニークの効果はデータに無い)", "(no data for this unique's effects)")) : tr("MOD なし", "No mods") }}</p>
      <!-- 消えた MOD (直前の手) -->
      <p v-for="m in removed" :key="'x' + m.modId + flashKey" class="stage-mod-gone text-rose-300/80 line-through">{{ modText(m) }}</p>
      <p v-if="item.corrupted" class="pt-1 font-bold text-[#d20000]">{{ tr("コラプト", "Corrupted") }}</p>
      <p v-if="item.sanctified" class="pt-1 font-bold text-amber-200">{{ tr("聖別", "Sanctified") }}</p>
      <!-- 2026-09-29 に足したカレンシーの印 (apply-extra.ts) -->
      <p v-if="item.siphoner" class="text-[#d20000]">{{ tr("キル閾値 (ヴァールサイフォナー)", "Kill threshold (Vaal Siphoner)") }}</p>
      <p v-if="item.mirrored" class="pt-1 font-bold text-sky-200">{{ tr("ミラー", "Mirrored") }}</p>
      <p v-if="item.foreseen" class="pt-1 text-violet-200">{{ tr("予見 (次の手の結果が見える)", "Foreseen (next result is shown)") }}</p>
    </div>
    <p v-if="holding" class="absolute -bottom-6 left-0 right-0 text-center text-[11px] text-amber-200/90"><span class="max-md:hidden">{{ tr("押すと使う (右クリック / Esc で手放す)", "Click to use (right-click / Esc to drop)") }}</span><span class="md:hidden">{{ tr("押すと使う (下の帯の「使う」でも)", "Tap to use (or “Use” in the bar below)") }}</span></p>
  </div>
</template>

<style scoped>
/* 名前の枠: ゲームの絵 (GameItemCard と同じ ihead-*、scripts/build-ui-art-from-client.mjs)。1 行は高さ 56 の絵、2 行は 88 の絵 */
.st-head {
  /* 絵はベース・ジェムのカード (GameItemCard) と同じ縮め方 (左右 36px)。元の大きさ (56px) だと画面の拡大で絵がぼやけて「貼った画像」に見えた
     (2026-10-10 オーナー「この部分画像はってあるみたいでブス」) */
  border-style: solid; border-image-slice: 0 56 fill; border-image-width: 0 36px; border-image-repeat: stretch;
  min-height: 40px; display: flex; flex-direction: column; justify-content: center; padding: 5px 44px; text-align: center;
}
.st-head.two { border-image-slice: 0 80 fill; border-image-width: 0 49px; min-height: 56px; padding: 6px 56px; }
/* 字はゲームのアイテムの説明と同じく明朝 (ベース・ジェムのカード GameItemCard と同じ) */
.st-card { font-family: "Noto Serif JP", "Yu Mincho", "YuMincho", "Hiragino Mincho ProN", Georgia, serif; }
.st-name { font-weight: 700; font-size: 18px; letter-spacing: 0.04em; line-height: 1.3; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9); }
.st-normal { border-image-source: url("/ui-art/ihead-normal.webp"); }
.st-magic { border-image-source: url("/ui-art/ihead-magic.webp"); }
.st-rare.one { border-image-source: url("/ui-art/ihead-rare-1.webp"); }
.st-rare.two { border-image-source: url("/ui-art/ihead-rare.webp"); }
.st-unique.one { border-image-source: url("/ui-art/ihead-unique-1.webp"); }
.st-unique.two { border-image-source: url("/ui-art/ihead-unique.webp"); }
</style>
