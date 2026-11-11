<!--
  ShelfButton.vue — クラフトステージの棚の 1 つ (2026-09-27、ADR-001)

  アイコン・名前・強さの札 (上級 / 完全 / レッサー / グレーター / パーフェクト / 古びた / 変質)・値段。
  カレンシー等は「持つ」(持っている物は金の枠)、お告げは「掛ける」。打てない物は灰色。
  2026-09-28 オーナー:
    「お告げとかオンにした時の挙動とかもゲーム内リスペクトで表示させて」→ 掛けたお告げはゲームの有効化と同じく赤金に脈打って「有効」
    「カレンシー詳細カードは…細かく書いてくれ」→ 0.7 秒乗せると [[StageCurrencyCard.vue]] (公式の説明 + ステージでの動き)
  2026-11-07 オーナー「スマホってホバーないからさ」「やっぱ長押しがイイかもね！はいらんな」: 指の端末は札の長押しで同じカードを下の窓で (U-13a)。
  2026-11-07 オーナー「上級完全とかのカレンシーの名前いらんね　カレンシーの上に完全とか上級とか書いてあるしな」: 札の印と同じ言葉は名前から外す
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { isTouchOnly } from "../../../utils/use-phone";
import { hoverStack } from "../../../state/hover-stack";
import { afterPointerMoves } from "../../../utils/pointer-moved";
import { iconOfKey, nameOfKey, priceOfKey } from "../../../state/for-share/craft-stage-shelf";
import { displayCurrency } from "../../../state/display-currency";
import { toCss } from "../../../utils/zoom";
import { shelfTag } from "../../../state/for-share/craft-stage-help";
import { useShelf } from "../../../state/for-share/shelf-context";
import { omenNote } from "../../../services/craft-stage/omens";
import { omenBlock, omenTag as omenTagOf, parseKey } from "../../../services/craft-stage/engine";
import { flag } from "../../../web/release-flags";
import { tr } from "../../../i18n/lang";
import ModalShell from "../../ui/ModalShell.vue";
import StageCurrencyCard from "../../../views/craft-stage/StageCurrencyCard.vue";

defineOptions({ inheritAttrs: false });

/** label: 名前の上書き (エッセンスを種類でまとめたアイコン)。nobadge: 段の札を出さない。bare: 絵と段の印だけの小さい形 (名前・値段・一言は出さず、乗せた時の説明のカードで。MOD 一覧の窓の帯、U-12e) */
const props = defineProps<{ k: string; omen?: boolean; label?: string; nobadge?: boolean; corner?: string; bare?: boolean }>();
const emit = defineEmits<{ pick: [key: string] }>();
/**
 * 名前を折る所: 「の」の後ろと「(」の前だけ (日本語はどこでも折れて「ヒネコラの髪 / 束」になっていた。2026-10-18 オーナーの UI 点検)。
 * 折れる所が無くて入らない時は、どこでも折る (overflow-wrap: anywhere)
 */
const nameParts = (s: string): string[] => s.split(/(?<=の)|(?= \()/);

/** 段の札。強さ・エッセンスの段はエンジンの parseKey で読む (骨の種類は鍵そのもの) */
const BADGE: Record<string, [[string, string], string]> = {
  greater: [["上級", "Greater"], "text-sky-300"],
  perfect: [["完全", "Perfect"], "text-amber-300"],
  "essence:lesser": [["レッサー", "Lesser"], "text-white/60"],
  "essence:greater": [["グレーター", "Greater"], "text-sky-300"],
  "essence:perfect": [["パーフェクト", "Perfect"], "text-amber-300"],
  desecrate_ancient: [["古びた", "Ancient"], "text-sky-300"],
  desecrate_altered: [["変質", "Altered"], "text-fuchsia-300"],
};
const badge = computed(() => {
  const p = parseKey(props.k);
  const id = p.type === "currency" ? p.strength : p.type === "essence" ? (p.breach ? "" : `essence:${p.tier}`) : props.k;
  const b = BADGE[id];
  return b ? ([id, ...b] as const) : null;
});
/**
 * 小さい形 (bare) のカレンシーの格の印 = マスの右下の縦の棒: 上級は 2 本、完全は 3 本、ふつうは無し (ゲームの持ち物でなじみのある形。
 * 11-12 オーナー「上級は2縦完全は3縦」)。骨・エッセンスの格には棒の形が無いので字の札のまま
 */
const bars = computed((): number => { if (!props.bare || props.nobadge) return 0; const p = parseKey(props.k); return p.type !== "currency" ? 0 : p.strength === "greater" ? 2 : p.strength === "perfect" ? 3 : 0; });
/** 札の印 (上級・完全など) を出しているか */
const badgeShown = computed(() => !!badge.value && !props.nobadge && !props.corner && !bars.value);
/** 札に出す名前。印があっても「(上級)」「(完全)」は外さない (U-13b の撤回、2026-11-08 オーナー「アイコンに完全上級ついててもやっぱりカレンシー名に上級完全ほしいみたい」) */
const shownName = computed(() => props.label ?? nameOf(props.k));
/** 値段の代わりに出す付く MOD の短い名前 (エッセンス・カタリスト、2026-10-05 オーナー「金額の所、エッセンスは代わりに付く MOD を箇条書きで」「カタリストも一緒」) */
const shelf = useShelf();
// 名前・絵・値段は棚のアイテムで引く (シミュの棚は箱の見本を渡す。今のエミュのアイテムで引くと骨の名前と値段がずれた。2026-10-24 シミュ部長)
const nameOf = (k: string): string => nameOfKey(k, shelf.item.value);
const iconOf = (k: string): string => iconOfKey(k, shelf.item.value);
const priceOf = (k: string): number => priceOfKey(k, shelf.item.value);
const tag = computed(() => (props.omen ? null : shelfTag(props.k, shelf.data.value, shelf.item.value)));
const reason = computed(() => (props.omen ? null : shelf.usable(props.k)));
/** 掛けているお告げのせいで打てない (お告げを抜けば打てる)。灰色にせず、値段の代わりに理由を出す */
const omenBlocked = computed(() => !!reason.value && !!shelf.usableBare && !shelf.usableBare(props.k));
/**
 * お告げの効き方の一言 (アイコンの下。2026-10-10 オーナー「サフィにつくのかプレにつくのかぱっと見わからない、カタリストみたいにアイコンの下に」)。
 * 文はエンジンの omenTag (側のお告げは効き目から、2026-11-07)
 */
const omenTag = computed(() => {
  const t = props.omen ? omenTagOf(props.k) : null;
  return t ? tr(t.ja, t.en) : null;
});
/** 今のアイテムでは意味が無い / 掛けると打てない (2026-10-10 オーナー「空きに勝手に入るから意味ないこと教えてあげた方がいい」) */
/** 掛けると持った物が打てなくなる・掛けても意味が無い (エンジンの omenBlock)。灰色で押せない、理由は omenWarn の所に (2026-10-22 オーナー「進行不能」) */
const omenNo = computed(() => {
  if (!props.omen || !flag("omenRow")) return null;
  return shelf.omenBlock ? shelf.omenBlock(shelf.held.value, shelf.omens.value, props.k) : omenBlock(shelf.data.value, shelf.item.value, shelf.held.value, shelf.omens.value, props.k);
});
const omenWarn = computed(() => (props.omen ? omenNo.value ?? (shelf.omenBlock ? null : omenNote(props.k, shelf.item.value, shelf.data.value)) : null));
const on = computed(() => (props.omen ? shelf.omens.value.includes(props.k) : shelf.held.value === props.k));

/**
 * 詳細カード: ジェム・ベースと同じ仕組み (hover-stack + GameItemCard)。少し乗せたら出す (待ちは hover-stack の決まり)、
 * カードに入れる・ピン留めできる・中の言葉から次のカード (2026-10-10 動きの揃え 1 番: 前は自前の 0.4 秒のカードでカードに入れなかった)
 * 指の端末 (hover の無い画面 = スマホ) では出さない。タップで mouseenter も飛んで来て、説明が被って押せなかった
 * (2026-10-08 オーナー iPhone「付けたいカレンシーをタップしたら説明が出て、付けたい時に押せなかったり説明が邪魔」)
 */
const touchOnly = isTouchOnly();
/** マウスが動くのを待っている時の取り消し (画面が動いて下に来ただけでは開かない、utils/pointer-moved) */
let stopWait = (): void => undefined;
function enter(e: MouseEvent): void {
  if (touchOnly) return;
  const el = e.currentTarget as HTMLElement;
  stopWait();
  stopWait = afterPointerMoves(e, () => openCard(el));
}
function openCard(el: HTMLElement): void {
  let r: { left: number; right: number; top: number; bottom: number } = el.getBoundingClientRect();
  // 持っている物はお告げの欄も合わせた範囲の横に出す (欄に重ならないように。2026-10-10 オーナー「被らないようにお告げと表示したらいいだけ」)
  // 重ねて出している欄 (お告げ・段) に重ならないよう、欄も合わせた範囲の横に出す: 欄の中のボタン、持っている物、段の欄を開いているまとめたアイコン
  // (2026-10-10 オーナー「カードにカードが重なる、その際はスクロールと同じ扱いで」)
  const rootEl = el.closest("[data-shelf-root]");
  // 開いた選択肢 (段の欄) に自分自身が入っている時は、元のアイコンにはカードを出さない (選択肢の中の物にだけ出す)。
  // お告げの欄のように自分が入っていない選択肢なら、元のアイコンにも出す (2026-10-10 オーナー)
  const famWrap = el.closest<HTMLElement>("[data-ess-keys]");
  if (famWrap && rootEl?.querySelector<HTMLElement>(".ess-anchor")?.dataset.essFor === famWrap.dataset.essKeys) return;
  const inPop = el.closest<HTMLElement>(".held-pop-in");
  const famOpen = el.closest("[data-ess-keys]") ? rootEl?.querySelector<HTMLElement>(".ess-anchor .held-pop-in") : null;
  const heldPop = !props.omen && shelf.held.value === props.k ? rootEl?.querySelector<HTMLElement>(".held-anchor:not(.ess-anchor) .held-pop-in") : null;
  const pop = (inPop ?? famOpen ?? heldPop)?.getBoundingClientRect() ?? null;
  if (pop) r = { left: Math.min(r.left, pop.left), right: Math.max(r.right, pop.right), top: Math.min(r.top, pop.top), bottom: Math.max(r.bottom, pop.bottom) };
  // 説明のカードは棚の文脈のアイテムで引く (シミュの棚でエミュの今のアイテムを見て「このベースには使えない」が出ていた、10-24 シミュ部長)
  hoverStack.openRootDelayed({ kind: "shelf", k: props.k, reason: reason.value, omen: !!props.omen, item: shelf.item.value }, toCss(r.right), toCss(r.top), { left: toCss(r.left), right: toCss(r.right), top: toCss(r.top), bottom: toCss(r.bottom) });
}
function leave(): void { stopWait(); hoverStack.leave(); }
onBeforeUnmount(leave);
/** 指の端末の説明 (U-13a)。まとめたアイコン (corner) は押すと段の欄が開くので、欄の中の 1 つずつで出す */
const infoOn = computed(() => touchOnly && flag("shelfInfo") && !props.corner);
const infoOpen = ref(false);
/**
 * 札の長押しで説明の窓 (2026-11-07 オーナー「長押しでも説明いいね」、後で「やっぱ長押しがイイかもね！はいらんな」で長押しだけに)。
 * 0.5 秒動かさずに押したら開く。指が 10px 動いた (送り)・ブラウザが送りに取った (pointercancel) なら取り消す。
 * 開いた後に指を離した時の押し (mousedown・click) は捨てる = 持たない・掛けない、窓の後ろを押した扱いにもならない
 */
const HOLD_MS = 500;
const HOLD_MOVE = 10;
let holdTimer: ReturnType<typeof setTimeout> | null = null;
let holdAt = { x: 0, y: 0 };
function holdCancel(): void { if (holdTimer) clearTimeout(holdTimer); holdTimer = null; }
function holdDown(e: PointerEvent): void {
  if (!infoOn.value || e.pointerType === "mouse") return;
  holdAt = { x: e.clientX, y: e.clientY };
  holdCancel();
  holdTimer = setTimeout(() => { holdTimer = null; swallowRelease(); infoOpen.value = true; }, HOLD_MS);
}
function holdMove(e: PointerEvent): void { if (holdTimer && Math.hypot(e.clientX - holdAt.x, e.clientY - holdAt.y) > HOLD_MOVE) holdCancel(); }
/** 指を離した後の押しを 1 回分捨てる (離してから 0.4 秒、離さないままでも 3 秒で外す) */
function swallowRelease(): void {
  const stop = (ev: Event): void => { ev.stopPropagation(); ev.preventDefault(); };
  const types = ["mousedown", "mouseup", "click"] as const;
  for (const t of types) document.addEventListener(t, stop, true);
  let done = false;
  const off = (): void => { if (done) return; done = true; for (const t of types) document.removeEventListener(t, stop, true); };
  const up = (): void => { window.removeEventListener("pointerup", up, true); window.removeEventListener("pointercancel", up, true); setTimeout(off, 400); };
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", up, true);
  setTimeout(off, 3000);
}
onBeforeUnmount(holdCancel);
</script>

<template>
  <button
    v-bind="$attrs"
    type="button"
    class="group relative flex flex-col items-center text-[10px] md:text-[11px] transition max-md:text-[11px]"
    :class="[bare ? 'w-[58px] shrink-0' : 'w-[74px] md:w-[80px] px-0.5 pb-1 max-md:w-[calc(25vw-1.6rem)] max-md:min-w-[60px]', on && !omen ? 'text-[var(--exile-color-text-title)]' : '', (reason && !omenBlocked) || (omenNo && !on) ? 'opacity-35' : '', omenNo && !on ? 'cursor-not-allowed' : '', infoOn ? 'select-none [-webkit-touch-callout:none]' : '']"
    :aria-disabled="omenNo && !on ? 'true' : undefined"
    :aria-label="`${nameOf(k)}${reason ? ` — ${reason}` : ''}`"
    :data-key="k"
    :data-rec="`shelf:${k}`"
    data-shelf
    @click="leave(); if (!(omenNo && !on)) emit('pick', k)"
    @mouseenter="enter"
    @mouseleave="leave"
    @pointerdown="holdDown"
    @pointermove="holdMove"
    @pointerup="holdCancel"
    @pointercancel="holdCancel"
    @contextmenu="infoOn && $event.preventDefault()"
  >
    <!-- 枠はゲームの両替所の枠 (持っている時は光る枠、src/styles/game-ui.css) -->
    <!-- 2026-10-10 オーナー「サイズも小さくしておｋ、ちょっと大きい」: PC は枠 68 → 56px、絵 52 → 42px -->
    <span class="g-slot relative grid place-items-center" :class="[bare ? 'size-11' : 'size-[52px] md:size-[56px]', on ? 'on' : '', on && omen ? 'stage-omen-on' : '']">
      <span v-if="bars" data-tier-bars :data-bars="bars" aria-hidden="true" class="pointer-events-none absolute bottom-[3px] right-[3px] z-[1] flex gap-[2px]"><i v-for="n in bars" :key="n" class="block h-[10px] w-[2.5px] rounded-[1px] bg-[#f1e3b4] shadow-[0_0_0_1px_rgba(0,0,0,0.75)]" /></span>
      <img v-if="iconOf(k)" :src="iconOf(k)" alt="" class="object-contain" :class="bare ? 'h-[34px] w-[34px]' : 'h-9 w-9 md:h-[42px] md:w-[42px]'" draggable="false" />
      <span v-else class="grid h-9 w-9 place-items-center rounded bg-white/10 text-[16px]">◎</span>
    </span>
    <span v-if="!bare" class="mt-0.5 flex min-h-[2.5em] items-start justify-center leading-tight"><span class="line-clamp-2 max-md:line-clamp-none text-center [overflow-wrap:anywhere] [word-break:keep-all]"><template v-for="(p, i) in nameParts(shownName)" :key="i"><wbr v-if="i" />{{ p }}</template></span></span>
    <span v-if="corner" class="absolute right-0.5 top-0.5 rounded bg-black/60 px-1 text-[9px] text-amber-200 max-md:text-[10px]">{{ corner }}</span>
    <span v-if="badge && badgeShown" class="absolute rounded bg-black/60 px-1" :class="[badge[2], bare ? 'right-0 top-0 whitespace-nowrap text-[8px] leading-[1.3]' : 'right-0.5 top-0.5 text-[9px] max-md:text-[10px]']">{{ tr(badge[1][0], badge[1][1]) }}</span>
    <span v-if="omen && on" class="absolute left-0.5 top-0.5 rounded bg-orange-600/80 px-1 text-[9px] max-md:text-[10px] font-bold text-white">{{ tr("有効", "Active") }}</span>
    <template v-if="!bare">
    <span v-if="omenTag" class="mt-px block w-full line-clamp-2 max-md:line-clamp-none text-center text-[9px] max-md:text-[10px] font-semibold leading-tight text-emerald-300">{{ tr("・", "· ") }}{{ omenTag }}</span>
    <span v-if="omenWarn" class="block w-full line-clamp-2 max-md:line-clamp-none text-center text-[9px] max-md:text-[10px] font-semibold leading-tight text-amber-300">{{ omenWarn }}</span>
    <span v-else-if="omenBlocked" class="mt-px block w-full text-center text-[9px] max-md:text-[10px] font-semibold leading-tight text-rose-300">{{ tr("お告げで打てない", "Blocked by omen") }}</span>
    <span v-else-if="tag" class="mt-px w-full">
      <span v-for="(t, i) in tag" :key="i" class="block line-clamp-2 max-md:line-clamp-none text-center text-[9px] max-md:text-[10px] font-semibold leading-tight text-emerald-300" :title="t"><!-- PC は 2 行まで (1 行で「・クリティカ…」と切れていた。2026-10-19 テスト走行)、スマホは切らずに全文 (2026-10-26 オーナー「基本スマホは省略したらダメ」) -->{{ tr("・", "· ") }}{{ t }}</span>
    </span>
    <span v-else-if="priceOf(k)" data-rec-part="shelf-price" class="text-[9px] max-md:text-[10px] tabular-nums opacity-60">{{ displayCurrency.money(priceOf(k)) }}</span>
    </template>
  </button>
  <!-- still は StageCurrencyCard の外の枠 (GameItemCard) へそのまま届く (Vue の attrs の受け渡し) -->
  <ModalShell v-if="infoOn" :open="infoOpen" sheet :label="nameOf(k)" panel-class="border-t border-white/15 bg-[var(--exile-color-card-bg)]" body-class="px-3 pt-2 pb-3" @close="infoOpen = false">
    <StageCurrencyCard v-if="infoOpen" :k="k" :reason="reason" :omen="!!omen" :item="shelf.item.value" :x="0" :y="0" :layer-key="-1" :pinned="false" :z="0" still />
    <template #footer><button type="button" class="g-btn !min-h-11 w-full" @click="infoOpen = false">{{ tr("閉じる", "Close") }}</button></template>
  </ModalShell>
</template>
