<!--
  ShelfButton.vue — クラフトステージの棚の 1 つ (2026-09-27、ADR-001)

  アイコン・名前・強さの札 (上級 / 完全 / レッサー / グレーター / パーフェクト / 古びた / 変質)・値段。
  カレンシー等は「持つ」(持っている物は金の枠)、お告げは「掛ける」。打てない物は灰色。
  2026-09-28 オーナー:
    「お告げとかオンにした時の挙動とかもゲーム内リスペクトで表示させて」→ 掛けたお告げはゲームの有効化と同じく赤金に脈打って「有効」
    「カレンシー詳細カードは…細かく書いてくれ」→ 0.7 秒乗せると [[StageCurrencyCard.vue]] (公式の説明 + ステージでの動き)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount } from "vue";
import { hoverStack } from "../../state/hover-stack";
import { iconOf, nameOf, priceOf } from "../../state/craft-stage";
import { displayCurrency } from "../../state/display-currency";
import { toCss } from "../../utils/zoom";
import { shelfTag } from "../../state/craft-stage-help";
import { useShelf } from "../../state/shelf-context";
import { omenNote } from "../../services/craft-stage/omens";
import { tr } from "../../i18n/lang";

const props = defineProps<{ k: string; omen?: boolean }>();
const emit = defineEmits<{ pick: [key: string] }>();

const BADGE: Array<[RegExp, [string, string], string]> = [
  [/_greater$/, ["上級", "Greater"], "text-sky-300"],
  [/_perfect$/, ["完全", "Perfect"], "text-amber-300"],
  [/^essence:lesser:/, ["レッサー", "Lesser"], "text-white/60"],
  [/^essence:greater:/, ["グレーター", "Greater"], "text-sky-300"],
  [/^essence:perfect:/, ["パーフェクト", "Perfect"], "text-amber-300"],
  [/^desecrate_ancient$/, ["古びた", "Ancient"], "text-sky-300"],
  [/^desecrate_altered$/, ["変質", "Altered"], "text-fuchsia-300"],
];
const badge = computed(() => BADGE.find(([re]) => re.test(props.k)) ?? null);
/** 値段の代わりに出す付く MOD の短い名前 (エッセンス・カタリスト、2026-10-05 オーナー「金額の所、エッセンスは代わりに付く MOD を箇条書きで」「カタリストも一緒」) */
const shelf = useShelf();
const tag = computed(() => (props.omen ? null : shelfTag(props.k, shelf.data.value, shelf.item.value)));
const reason = computed(() => (props.omen ? null : shelf.usable(props.k)));
/** 掛けているお告げのせいで打てない (お告げを抜けば打てる)。灰色にせず、値段の代わりに理由を出す */
const omenBlocked = computed(() => !!reason.value && !!shelf.usableBare && !shelf.usableBare(props.k));
/**
 * お告げの効き方の一言 (アイコンの下。2026-10-10 オーナー「サフィにつくのかプレにつくのかぱっと見わからない、カタリストみたいにアイコンの下に」)
 */
const OMEN_TAG: Record<string, [string, string]> = {
  OmenofSinistralExaltation: ["プレに付く", "Adds prefix"], OmenofDextralExaltation: ["サフィに付く", "Adds suffix"],
  OmenofGreaterExaltation: ["2 つ付く", "Adds 2"], OmenofCatalysingExaltation: ["品質で重く", "Quality-weighted"],
  OmenofSinistralAnnulment: ["プレを消す", "Removes prefix"], OmenofDextralAnnulment: ["サフィを消す", "Removes suffix"], OmenofLight: ["冒涜を消す", "Removes desecrated"],
  OmenofWhittling: ["最低を消す", "Removes lowest"], OmenofSinistralErasure: ["プレを消す", "Removes prefix"], OmenofDextralErasure: ["サフィを消す", "Removes suffix"],
  OmenofSinistralCrystallisation: ["プレを消す", "Removes prefix"], OmenofDextralCrystallisation: ["サフィを消す", "Removes suffix"],
  OmenofSinistralNecromancy: ["プレに付く", "Adds prefix"], OmenofDextralNecromancy: ["サフィに付く", "Adds suffix"],
  OmenoftheSovereign: ["ウラマン", "Ulaman"], OmenoftheLiege: ["アマナム", "Amanamu"], OmenoftheBlackblooded: ["クルガル", "Kurgal"],
  OmenofPutrefaction: ["全部冒涜", "All desecrated"], OmenofAbyssalEchoes: ["引き直し", "Reroll"],
};
const omenTag = computed(() => {
  const t = props.omen ? OMEN_TAG[props.k] : undefined;
  return t ? tr(t[0], t[1]) : null;
});
/** 今のアイテムでは意味が無い / 掛けると打てない (2026-10-10 オーナー「空きに勝手に入るから意味ないこと教えてあげた方がいい」) */
const omenWarn = computed(() => (props.omen ? omenNote(props.k, shelf.item.value) : null));
const on = computed(() => (props.omen ? shelf.omens.value.includes(props.k) : shelf.held.value === props.k));

/**
 * 詳細カード: ジェム・ベースと同じ仕組み (hover-stack + GameItemCard)。少し乗せたら出す (待ちは hover-stack の決まり)、
 * カードに入れる・ピン留めできる・中の言葉から次のカード (2026-10-10 動きの揃え 1 番: 前は自前の 0.4 秒のカードでカードに入れなかった)
 * 指の端末 (hover の無い画面 = スマホ) では出さない。タップで mouseenter も飛んで来て、説明が被って押せなかった
 * (2026-10-08 オーナー iPhone「付けたいカレンシーをタップしたら説明が出て、付けたい時に押せなかったり説明が邪魔」)
 */
const touchOnly = typeof matchMedia === "function" && matchMedia("(hover: none)").matches;
function enter(e: MouseEvent): void {
  if (touchOnly) return;
  let r: { left: number; right: number; top: number; bottom: number } = (e.currentTarget as HTMLElement).getBoundingClientRect();
  // 持っている物はお告げの欄も合わせた範囲の横に出す (欄に重ならないように。2026-10-10 オーナー「被らないようにお告げと表示したらいいだけ」)
  const el = e.currentTarget as HTMLElement;
  const pop = !props.omen && shelf.held.value === props.k ? el.closest("[data-shelf-root]")?.querySelector<HTMLElement>(".held-anchor .held-pop-in")?.getBoundingClientRect() : null;
  if (pop) r = { left: Math.min(r.left, pop.left), right: Math.max(r.right, pop.right), top: Math.min(r.top, pop.top), bottom: Math.max(r.bottom, pop.bottom) };
  hoverStack.openRootDelayed({ kind: "shelf", k: props.k, reason: reason.value, omen: !!props.omen }, toCss(r.right), toCss(r.top), { left: toCss(r.left), right: toCss(r.right), top: toCss(r.top), bottom: toCss(r.bottom) });
}
function leave(): void { hoverStack.leave(); }
onBeforeUnmount(leave);
</script>

<template>
  <button
    type="button"
    class="group relative flex w-[74px] md:w-[96px] flex-col items-center px-0.5 pb-1 text-[10px] md:text-[11.5px] transition max-md:w-[calc(25vw-1.6rem)] max-md:min-w-[60px] max-md:text-[11px]"
    :class="[on && !omen ? 'text-[var(--exile-color-text-title)]' : '', reason && !omenBlocked ? 'opacity-35' : '']"
    :aria-label="`${nameOf(k)}${reason ? ` — ${reason}` : ''}`"
    :data-key="k"
    data-shelf
    @click="leave(); emit('pick', k)"
    @mouseenter="enter"
    @mouseleave="leave"
  >
    <!-- 枠はゲームの両替所の枠 (持っている時は光る枠、src/styles/game-ui.css) -->
    <span class="g-slot grid size-[52px] place-items-center md:size-[68px]" :class="[on ? 'on' : '', on && omen ? 'stage-omen-on' : '']">
      <img v-if="iconOf(k)" :src="iconOf(k)" alt="" class="h-9 w-9 object-contain md:h-[52px] md:w-[52px]" draggable="false" />
      <span v-else class="grid h-9 w-9 place-items-center rounded bg-white/10 text-[16px]">◎</span>
    </span>
    <span class="mt-0.5 flex min-h-[2.5em] items-start justify-center leading-tight"><span class="line-clamp-2 text-center">{{ nameOf(k) }}</span></span>
    <span v-if="badge" class="absolute right-0.5 top-0.5 rounded bg-black/60 px-1 text-[9px] max-md:text-[10px]" :class="badge[2]">{{ tr(badge[1][0], badge[1][1]) }}</span>
    <span v-if="omen && on" class="absolute left-0.5 top-0.5 rounded bg-orange-600/80 px-1 text-[9px] max-md:text-[10px] font-bold text-white">{{ tr("有効", "Active") }}</span>
    <span v-if="omenTag" class="mt-px block w-full line-clamp-2 text-center text-[9px] max-md:text-[10px] font-semibold leading-tight text-emerald-300">{{ tr("・", "· ") }}{{ omenTag }}</span>
    <span v-if="omenWarn" class="block w-full line-clamp-2 text-center text-[9px] max-md:text-[10px] font-semibold leading-tight text-amber-300">{{ omenWarn }}</span>
    <span v-else-if="omenBlocked" class="mt-px block w-full text-center text-[9px] max-md:text-[10px] font-semibold leading-tight text-rose-300">{{ tr("お告げで打てない", "Blocked by omen") }}</span>
    <span v-else-if="tag" class="mt-px w-full">
      <span v-for="(t, i) in tag" :key="i" class="block truncate text-center text-[9px] max-md:text-[10px] font-semibold leading-tight text-emerald-300">{{ tr("・", "· ") }}{{ t }}</span>
    </span>
    <span v-else-if="priceOf(k)" class="text-[9px] max-md:text-[10px] tabular-nums opacity-60">{{ displayCurrency.money(priceOf(k)) }}</span>
  </button>
</template>
