<!--
  StagePatternStepPicker.vue — 6 パターンの 1 手の「打つ物 + お告げ」を、クラフトステージの棚と同じ見た目で選ぶ (2026-10-06 オーナー
  「UI めっちゃいい、クラフトステージそのまま使っていいんじゃないその場所」)。
  上の段で打つ物 (アイコン・強さの札・値段) を選び、下の段でそれに掛けるお告げを入れ切りする (有効は棚と同じ赤金)。
  それまでの手で打てない物・一緒に使えないお告げは灰色で、理由はホバー。選べる組み合わせは pattern.ts の patternSets と同じ
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { craftStage, iconOf, nameOf, priceOf } from "../../state/craft-stage";
import { displayCurrency } from "../../state/display-currency";
import { jaOfOmen } from "../../services/htc/labels";
import type { PatternSet } from "../../services/craft-stage/pattern";

const props = defineProps<{
  sets: readonly PatternSet[];
  /** セットごとの打てない理由 (打てれば null) */
  why: (x: PatternSet) => string | null;
  /** 今のセット */
  current: string;
  /** 灰色 (今は打てない) の物も押せる (2026-10-07 オーナー「グレーアウトはオフではなく別に選択できはする」) */
  soft?: boolean;
  /** 押したらすぐ決まる (下の「これにする」を出さない) */
  inline?: boolean;
}>();
const emit = defineEmits<{ pick: [key: string]; close: [] }>();

/** 打つ物 (エッセンス・ルーンは付ける物で決まるので 1 つの札) */
interface Tile { id: string; kind: PatternSet["kind"]; currency: string; label: string; icon: string; badge: string | null; price: number; side: string | null }
const BADGE: Array<[RegExp, string]> = [[/_greater$/, "上級"], [/_perfect$/, "完全"], [/^desecrate_ancient$/, "古びた"], [/^desecrate_altered$/, "変質"]];
const tiles = computed<Tile[]>(() => {
  const seen = new Map<string, Tile>();
  for (const x of props.sets) {
    const id = `${x.kind}|${x.currency}`;
    if (seen.has(id)) continue;
    const label = !x.currency ? (x.kind === "essence" ? "エッセンス (マジックに)" : x.kind === "essence_perfect" ? "パーフェクトエッセンス" : "ルーンを差す") : nameOf(x.currency);
    // エッセンスは付く側 (プレ / サフィ) を札に出す
    const em = x.currency.startsWith("essence:") ? craftStage.data.value?.mods.get(x.currency.replace(/^essence:[a-z]+:/, "")) : undefined;
    const side = em ? (em.type === "suffix" ? "サフィ" : "プレ") : null;
    seen.set(id, { id, kind: x.kind, currency: x.currency, label, icon: x.currency ? iconOf(x.currency) : "", badge: BADGE.find(([re]) => re.test(x.currency))?.[1] ?? null, price: x.currency ? priceOf(x.currency) : 0, side });
  }
  return [...seen.values()];
});
/** 札の段 (棚のタブの代わりに、種類ごとに並べる) */
const ROWS: Array<{ name: string; kinds: PatternSet["kind"][] }> = [
  { name: "マジックまで", kinds: ["transmute", "augment", "regal", "alchemy"] },
  { name: "エッセンス (マジック → レア)", kinds: ["essence"] },
  { name: "レア", kinds: ["exalt", "chaos", "annul"] },
  { name: "パーフェクトエッセンス (レア)", kinds: ["essence_perfect"] },
  { name: "骨", kinds: ["desecrate"] },
  // 自前のフラクチャー (2026-10-07)
  { name: "フラクチャー", kinds: ["fracture"] },
  { name: "ルーン", kinds: ["rune"] },
];
/**
 * 打てない札 (灰色) は畳む。スマホは畳んだ状態が既定 (2026-10-08 札 50 枚のうち 30 枚が「この MOD は付かない」で壁になっていた。
 * オーナー「必要なところ以外は畳んだりとかで」)。PC は今まで通り全部出す。選んでいる札は灰色でも出す
 */
const dimOpen = ref(!(typeof window !== "undefined" && window.innerWidth < 768));
const rows = computed(() => ROWS.map((r) => {
  const all = tiles.value.filter((t) => r.kinds.includes(t.kind));
  const shown = dimOpen.value ? all : all.filter((t) => !tileWhy(t) || chosen.value === t.id);
  return { name: r.name, tiles: shown, hidden: all.length - shown.length };
}).filter((r) => r.tiles.length || r.hidden));
const dimCount = computed(() => rows.value.reduce((a, r) => a + r.hidden, 0));

const cur = computed(() => props.sets.find((x) => x.key === props.current));
const chosen = ref<string>(cur.value ? `${cur.value.kind}|${cur.value.currency}` : "");
const omens = ref<string[]>(cur.value?.omens ? [...cur.value.omens] : []);
watch(() => props.current, () => { chosen.value = cur.value ? `${cur.value.kind}|${cur.value.currency}` : ""; omens.value = cur.value ? [...cur.value.omens] : []; });

const setsOf = (id: string): PatternSet[] => props.sets.filter((x) => `${x.kind}|${x.currency}` === id);
const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((o) => b.includes(o));
/** 札の打てない理由 (お告げ無しで見る。お告げ無しのセットが無い物は、どれか 1 つでも打てれば打てる) */
function tileWhy(t: Tile): string | null {
  const list = setsOf(t.id);
  const bare = list.find((x) => !x.omens.length);
  if (bare) return props.why(bare);
  return list.some((x) => !props.why(x)) ? null : props.why(list[0]!);
}
/** 選んだ打つ物に掛けられるお告げ */
const omenChoices = computed(() => [...new Set(setsOf(chosen.value).flatMap((x) => x.omens))]);
const match = computed(() => setsOf(chosen.value).find((x) => same(x.omens, omens.value)) ?? null);
/** お告げを入れ切りした時に、その組み合わせが無い / 打てない理由 */
function omenWhy(o: string): string | null {
  const next = omens.value.includes(o) ? omens.value.filter((x) => x !== o) : [...omens.value, o];
  const x = setsOf(chosen.value).find((y) => same(y.omens, next));
  if (!x) {
    // その組み合わせが無い時も、そのお告げ単体で使えない理由があればそちらを出す (外れが消えない など)
    const alone = setsOf(chosen.value).find((y) => same(y.omens, [o]));
    return (alone && props.why(alone)) || "今のお告げと一緒に使えない";
  }
  return omens.value.includes(o) || props.soft ? null : props.why(x);
}
/** 灰色にする理由 (soft の時も見た目は灰色、押せる) */
function omenDim(o: string): string | null {
  const next = omens.value.includes(o) ? omens.value.filter((x) => x !== o) : [...omens.value, o];
  const x = setsOf(chosen.value).find((y) => same(y.omens, next));
  return x && !omens.value.includes(o) ? props.why(x) : null;
}
/**
 * 灰色の札に出す短い理由 (全文はホバー)。2026-10-07 オーナー「グレーアウトしてる所に打てる MOD が無いみたいな表記がいいのかな」
 */
const SHORT: Array<[RegExp, string]> = [
  [/消せる MOD が無い/, "消せる物なし"], [/外れた MOD を消せない|消えない/, "外れを消せない"],
  [/ノーマルにだけ/, "ノーマルだけ"], [/マジックにだけ|マジックかレア/, "マジックだけ"], [/レアにだけ|レアだけ/, "レアだけ"], [/ノーマルかマジック/, "レア不可"],
  [/枠が全部|枠が埋ま/, "枠なし"], [/プレフィックスだけ/, "プレだけ"], [/サフィックスだけ/, "サフィだけ"],
  [/冒涜の MOD は.*1 つまで/, "冒涜は 1 つまで"], [/エッセンスの MOD は 1 つまで/, "エッセンス 1 つまで"], [/ソケット/, "ソケットなし"],
  [/打つだけには使えない/, "打つだけ不可"], [/付ける物がルーン/, "ルーンの時だけ"], [/このエッセンスで付く MOD ではない|付く MOD ではない|で出ない MOD/, "この MOD は付かない"],
  [/勢力/, "勢力が違う"], [/カタリスト|品質/, "品質が要る"], [/一緒に使えない/, "併用不可"], [/レアリティが変わる/, "やり直せない"],
];
const shortWhy = (w: string): string => SHORT.find(([re]) => re.test(w))?.[1] ?? "使えない";
/** inline の時は選んだ組み合わせをすぐ渡す */
function emitInline(): void {
  if (props.inline && match.value && (props.soft || !props.why(match.value))) emit("pick", match.value.key);
}
function pickTile(t: Tile): void {
  if (tileWhy(t) && !props.soft) return;
  chosen.value = t.id;
  // お告げは今の物のうち、その打つ物でも使える物だけ残す (組み合わせが無ければ外す)
  const keep = omens.value.filter((o) => setsOf(t.id).some((x) => x.omens.includes(o)));
  omens.value = setsOf(t.id).some((x) => same(x.omens, keep)) ? keep : [];
  emitInline();
}
function toggleOmen(o: string): void {
  if (omenWhy(o)) return;
  omens.value = omens.value.includes(o) ? omens.value.filter((x) => x !== o) : [...omens.value, o];
  emitInline();
}
function decide(): void {
  if (match.value && !props.why(match.value)) emit("pick", match.value.key);
}
</script>

<template>
  <div class="text-[11px]">
    <div v-for="r in rows.filter((x) => x.tiles.length)" :key="r.name" class="mb-1 flex gap-2 max-md:flex-col max-md:gap-0.5">
      <p class="w-24 shrink-0 pt-1 leading-tight opacity-60 max-md:w-full max-md:pt-0">{{ r.name }}<span v-if="r.hidden" class="ml-1 opacity-60">(他 {{ r.hidden }})</span></p>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="t in r.tiles" :key="t.id" type="button"
          class="relative flex w-[66px] flex-col items-center rounded-lg border px-0.5 pb-0.5 pt-1 text-[10px] transition"
          :class="[chosen === t.id ? 'border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/60' : 'border-white/10 bg-black/30 hover:border-white/30', tileWhy(t) ? (soft ? '[&>*:not(.why)]:opacity-45' : 'cursor-not-allowed [&>*:not(.why)]:opacity-30') : (soft ? 'shadow-[0_0_10px_rgba(251,191,36,0.35)]' : '')]"
          :title="tileWhy(t) ?? t.label" @click="pickTile(t)"
        >
          <img v-if="t.icon" :src="t.icon" alt="" class="h-7 w-7 object-contain" draggable="false" />
          <span v-else class="grid h-7 w-7 place-items-center rounded bg-white/10 text-[14px]">◎</span>
          <span class="w-full truncate text-center leading-tight">{{ t.label }}</span>
          <span v-if="t.badge" class="absolute right-0.5 top-0.5 rounded bg-black/60 px-1 text-[9px] text-sky-300">{{ t.badge }}</span>
          <span v-if="t.side" class="absolute left-0.5 top-0.5 rounded bg-black/60 px-1 text-[9px] text-amber-200">{{ t.side }}</span>
          <span v-if="tileWhy(t)" class="why w-full truncate text-center text-[9px] font-bold text-rose-300">{{ shortWhy(tileWhy(t)!) }}</span>
          <span v-else-if="t.price" class="text-[9px] tabular-nums opacity-60">{{ displayCurrency.money(t.price) }}</span>
        </button>
      </div>
    </div>
    <button v-if="dimCount || !dimOpen" type="button" class="mb-1 rounded border border-white/15 px-2 py-0.5 text-[10px] opacity-60 hover:opacity-100 max-md:min-h-9" @click="dimOpen = !dimOpen">
      {{ dimOpen ? "今は打てない物をたたむ ▴" : `今は打てない物 ${dimCount} 枚 ▾` }}
    </button>
    <div v-if="omenChoices.length" class="mb-1 flex gap-2 max-md:flex-col max-md:gap-0.5">
      <p class="w-24 shrink-0 pt-1 leading-tight opacity-60 max-md:w-full max-md:pt-0">お告げ<br class="max-md:hidden" /><span class="md:hidden"> </span>(押して入れ切り)</p>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="o in omenChoices" :key="o" type="button"
          class="relative flex w-[66px] flex-col items-center rounded-lg border px-0.5 pb-0.5 pt-1 text-[10px] transition"
          :class="[omens.includes(o) ? 'stage-omen-on border-orange-300' : 'border-white/10 bg-black/30 hover:border-white/30', omenWhy(o) ? 'cursor-not-allowed [&>*:not(.why)]:opacity-30' : omenDim(o) ? 'opacity-45' : '']"
          :title="omenWhy(o) ?? omenDim(o) ?? jaOfOmen(o) ?? o" @click="toggleOmen(o)"
        >
          <img v-if="iconOf(o)" :src="iconOf(o)" alt="" class="h-7 w-7 object-contain" draggable="false" />
          <span v-else class="grid h-7 w-7 place-items-center rounded bg-white/10 text-[14px]">◎</span>
          <span class="w-full truncate text-center leading-tight">{{ jaOfOmen(o) ?? o }}</span>
          <span v-if="omens.includes(o)" class="absolute left-0.5 top-0.5 rounded bg-orange-600/80 px-1 text-[9px] font-bold text-white">有効</span>
          <span v-if="omenWhy(o)" class="why w-full truncate text-center text-[9px] font-bold text-rose-300">{{ shortWhy(omenWhy(o)!) }}</span>
          <span v-else-if="priceOf(o)" class="text-[9px] tabular-nums opacity-60">{{ displayCurrency.money(priceOf(o)) }}</span>
        </button>
      </div>
    </div>
    <div v-if="!inline" class="flex items-center gap-2">
      <span v-if="match && why(match)" class="text-rose-300">{{ why(match) }}</span>
      <button type="button" class="ml-auto rounded-lg border border-amber-400/60 bg-amber-500/20 px-3 py-0.5 font-bold text-amber-100 disabled:opacity-40" :disabled="!match || !!why(match)" @click="decide">これにする</button>
    </div>
  </div>
</template>
