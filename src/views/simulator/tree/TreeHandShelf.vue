<!--
  TreeHandShelf.vue — ツリーの右の欄: 箱の次に打つ手を、クラフト台のカレンシーの棚から選ぶ (2026-10-22 オーナー「下の＋も同じ感じにしてええよ」、TreeHandPick の置き換え)。
  その箱の見本 (tree-sample.ts) を provideShelf で棚に渡すので、打てない手は灰色。持った物 + お告げを「この手にする」で箱の手に。
  結果の箱は手の種類で決める (カオス = 入れ替え、消去 = 消す、カタリスト = 品質だけ、それ以外 = 足す、カオススパム = 当たりだけ)。入力はカオススパムだけ。
  触媒のお告げの手は、前に「品質だけ上げる手」(カタリストの札) を自動で足す (10-22 オーナーの案 A。前の「先に打つカタリスト」の選びと 1 枚札は消した)。
  10-22 オーナー「今の箱の時点のアイテムに付けるイメージ」: 上にその箱の時点のアイテムのカード、棚から持ってカードを押すとその手になる (エミュと同じ、文字のボタンは無し)。
  骨のアビスの反響はお告げの枠の中 (HeldOmens の slot、お告げと同じ並び)。足す手の「狙い無し」は左の「当たりの箱にする MOD」のチェックの一番下 (10-25)。重ね窓の枠は TreeHandPage
-->
<script setup lang="ts">
import { computed, nextTick, ref, toRaw, watch } from "vue";
import { craftStage as s, iconOf, nameOf } from "../../../state/craft-stage";
import StageItemCard from "../../../components/for-share/item/StageItemCard.vue";
import CurrencyShelf from "../../../components/for-share/shelf/CurrencyShelf.vue";
import HeldOmens from "../../../components/for-share/shelf/HeldOmens.vue";
import HeldCursor from "../../../components/for-share/shelf/HeldCursor.vue";
import { ESSENCE_KEYS, omensAllowedFor, useReason, type StageItem, type StageMod } from "../../../services/craft-stage/engine";
import { omensFor } from "../../../services/craft-stage/engine";
import { effectOf } from "../../../services/simulator/tree/tree-hands";
import { sampleOf } from "../../../services/simulator/tree/tree-sample";
import { CATALYSING, canSpam, ECHO, isBone, isCatalyst, TREE_CATALYSTS } from "../../../services/simulator/tree/tree-hands";
import { handLabel, handName, outName } from "./tree-names";
import { treeRowTags } from "./tree-row-tags";
import type { RowTag } from "../../../components/for-share/item/stage-item-row-tag";
import { aimKey, fractureMarks, setHand, type Aim, type Hand, type HandKind } from "../../../services/simulator/tree/tree-model";
import { useTree } from "./use-tree";
import { TREE_SPAM_ORB, useSimShelf } from "../use-sim-shelf";
import { infiniteAim } from "../../../services/simulator/tree/tree-outcome";
import { afterQualityOf, autoCatOf, FREE_EFFECTS, handOf, hitAimsOf, hitChoicesOf, keepChoicesOf, kindOf, needAimOf, onlyOf, preFillOf, problemOf, type OnlyOut } from "./tree-hand-plan";
import { modText, tr } from "../../../i18n/lang";
import { stageHelp } from "../../../state/for-share/craft-stage-help";
import { usePhone } from "../../../utils/use-phone";
import { simOp } from "../../../web/track";
import { fixedValues } from "./tree-fixed-values";
import { previewUse } from "../../../services/emulator/emu-engine";
import { useDismiss } from "../../../utils/use-dismiss";
import { flag } from "../../../web/release-flags";

const props = defineProps<{ boxId: string; current: Hand | null }>();
/** pick の preCatalyst = 前に足す品質だけ上げる手のカタリスト (触媒のお告げで、まだ品質を上げる手の後でない時) */
/** only = 結果が 1 通りの手の結果 (tree-sample の singleOutOf、光のお告げ + 消去など) */
/** back = 打たずに既にある箱へ戻す (重ね窓を閉じて箱を押して選ぶ) */
const emit = defineEmits<{ pick: [hand: Hand, kind: HandKind, aims: Aim[], preCatalyst: string | null, only: OnlyOut]; clear: []; close: []; back: []; aim: [] }>();
const t = useTree();

const sample = computed(() => (s.data.value ? sampleOf(s.data.value, t.doc.value, props.boxId, 1) : null));
const item = computed(() => sample.value?.item ?? null);
/** 出すカードの MOD の値は木の中で揃える (箱・完成形のカードと同じ、tree-fixed-values。10-26 夜 カードが +49・手の窓が +48 で食い違った)。打つ・判定は見本の値のまま */
/**
 * 持った物を打つ前に光らせる: 消える・入れ替わる候補の MOD (オレンジの文字) と付く空き (緑の枠)。エミュの CraftStage と同じエンジンの previewUse
 * (10-27 オーナー「削減やらエッセンスやら、エミュだと消す候補の MOD の色を変えるよね。それをシミュにも同じのを導入しよう」)。打てない時は出さない。
 * 木の箱のカードには出さない (10-27 に箱へも出す書き換えをオーナーが止めた)
 */
const preview = computed(() => { const d = s.data.value, it = preCat.value ? shelfItem.value : item.value ?? shelfItem.value, h = held.value; return d && it && h && !problem.value ? previewUse(d, it, h, omens.value) : null; });
const cardOf = (it: StageItem): StageItem => (s.data.value ? fixedValues(s.data.value, t.doc.value, it) : it);
/** 狙いに当たらない MOD の行は「外れ MOD」(乗せた時のカードと同じ、10-25 オーナー「プラスで MOD 選んだ時ハズレ MOD の表示が溶けてる」) */
const rowTags = (it: StageItem | null) => (s.data.value && it ? removeTags(it, treeRowTags(s.data.value, t.doc.value, t.doc.value.boxes[props.boxId]?.unwanted ?? [], it, t.doc.value.boxes[props.boxId])) : null);
/**
 * 消去を持った時は、フラクチャー以外で ☑ の無い MOD を全部「外れ MOD」と出し、☑ の MOD はふだんの表示 (狙い) に戻す。☑ を変えるとすぐ変わる
 * (10-27 夜オーナー「全部消えてよいなら持った瞬間に外れ MOD 表示、残したい MOD に ☑ で狙い表示」。スイッチ goalShape)
 */
function removeTags(it: StageItem, tags: Map<string, RowTag>): Map<string, RowTag> {
  if (!flag("goalShape") || !isRemove.value) return tags;
  const keep = new Set(keepAims.value.map((a) => a.modId)), out = new Map(tags);
  for (const m of [...it.prefixes, ...it.suffixes]) {
    if (m.fractured) continue;
    if (keep.has(m.modId)) out.delete(m.modId);
    else out.set(m.modId, { text: tr("外れ MOD", "Miss"), tone: "bad", replace: true, title: tr(`消えてよい MOD (☑ で残したい MOD にできる): ${modText(m)}`, `May be removed (☑ to keep it): ${modText(m)}`) });
  }
  return out;
}
/** 当たりの MOD が決まっていない当たりの箱 (棚は出さずに先に MOD を選ばせる、tree-hand-plan の needAimOf) */
const needAim = computed(() => needAimOf(t.doc.value, props.boxId, sample.value?.note));
const held = ref<string | null>(props.current?.currency ?? null);
const omens = ref<string[]>(props.current ? [...props.current.omens] : []);
const spam = ref(!!props.current?.repeat);
const spamMax = ref<number | null>(props.current?.repeat?.max ?? null);
/**
 * 足す手で当たりの箱にする狙い (aimKey)。チェックした MOD ごとに当たりの箱、どれも付かなければ外れの箱。1 つも無い = 狙い無し (何も無い状態は作らない)。
 * 既定は狙い無し (10-26 夜オーナー「デフォルトは狙い無しでチェック付けといてくれ」。その前の 10-26 昼は候補に全部チェックだった)。
 * 当たるまで繰り返す手だけは候補に全部チェック (狙い無しが無い)。MOD を押すと狙い無しが外れ、全部外すと狙い無しに戻る、
 * 狙い無しを押すと MOD が全部外れる。自分で触ったら、その持った物の間はそのまま (持ち替えると既定に戻る)。前に開いた手はその当たりの箱の MOD
 */
const checked = ref<string[]>((() => {
  const c = props.current, d = t.doc.value;
  if (!c || c.free) return [];
  return (d.boxes[props.boxId]?.outs ?? []).flatMap((o) => { const x = d.boxes[o]; return x?.out === "hit" && x.aim ? [aimKey(x.aim)] : []; });
})());
const isFracture = computed(() => !!held.value && effectOf(held.value) === "fracture");
/**
 * 骨の手のアビスの反響のお告げ (発現の候補を 1 回引き直す) = お告げの並びの「アビスの反響のお告げ」そのもの (omens に ECHO)。骨を持ったら既定で掛ける
 * (10-22 オーナー「お告げは必ず反響を使わんとやばいよ」、10-26 夜「オンは嘘だし、でかいアイコンもある」: 前は並びとは別の印と大きな札で、並びの方は掛かっていなかった)。
 * 前の手を開いた時はその手のまま
 */
const echo = computed(() => omens.value.includes(ECHO));
watch(held, (k, old) => { if (k && k !== old && isBone(k) && !omens.value.includes(ECHO)) omens.value = [...omens.value, ECHO]; }); // 開いた時は動かない = 前の手のまま
/** 付く MOD を選べない手 (足す・カオス。当たりの箱にする MOD のチェックと狙い無しを出す) */
const canFree = computed(() => !!held.value && FREE_EFFECTS.includes(effectOf(held.value)));
/**
 * Esc: 新しい手で持っている時は持った物を離すだけ (窓は閉じない)。2 回目の Esc・今の手を替えている時は窓 (ModalShell) が閉じる = 何も替えない
 * (オーナー 10-22「枠の外・Esc で取り消し」)。前は window の捕まえる段で聞いていたが、窓の Esc が先に受けて持ったまま窓ごと閉じていた (10-27 モンキー 7 の残り)。
 * 共通の useDismiss に載せると、窓は中で開いている物を先に閉じる (cancelTopIn)。窓の中を押しても離さない (離すのは同じ札・右クリック・Esc)
 */
useDismiss(() => !props.current && !!held.value, [() => document.querySelector<HTMLElement>("[data-tree-shelf]")], () => release(), { swallow: false, keep: '[aria-modal="true"]' });
/** 持つ / 離す (クラフト台と同じ: 同じ物をもう一度押す・右クリック・Esc = 離す。お告げの欄も閉じる、オーナー 10-22) 棚・打てるかは use-sim-shelf */
/** この箱が品質だけ上げる手の後 (通り抜け) か */
const afterQuality = computed(() => afterQualityOf(t.doc.value, props.boxId));
/** 持った物に触媒のお告げが掛けられるか */
const canCatalyse = computed(() => !!held.value && omensAllowedFor(held.value).includes(CATALYSING));
/** 前に足すカタリストの既定 (tree-hand-plan の autoCatOf) */
const autoCat = computed((): string | null => { const d = s.data.value, it = item.value; return d && it ? autoCatOf(d, t.doc.value, it) : null; });
/**
 * 棚に渡すアイテム = 前にカタリストの手を足す時はそれで品質を最大まで入れた後 (品質 0 では触媒のお告げが「品質が要る」で掛けられない。
 * 前は品質 0 の見本を渡していて、触媒の手を開き直すとお告げが外れていた、10-22)
 */
const needPre = computed(() => canCatalyse.value && !afterQuality.value);
const preFill = computed(() => { const d = s.data.value, it = item.value; return d && it ? preFillOf(d, it, needPre.value, autoCat.value) : null; });
const shelfItem = computed(() => preFill.value?.item ?? item.value);
/** スマホの下の帯に出す持った札の説明 (PC は札に乗せると出るカードと同じ文、** の太字の印は外す。省略しない。10-26 夜オーナー「スマホも PC と同じ動きに」) */
const heldHelp = computed(() => (held.value ? stageHelp(held.value, s.data.value, shelfItem.value).map((l) => l.replace(/\*\*/g, "")) : []));
// フラクチャーのオーブは完成の MOD でフラクチャーの印を決めた木でだけ打てる (10-25 オーナー「最初にフラクチャーを決めないとフラクチャーオーブを打てないように」)
const fractureBlock = (k: string): string | null => (effectOf(k) === "fracture" && !fractureMarks(t.doc.value).length ? tr("先に完成の MOD でフラクチャーを決めて", "Set a fracture on the final mods first") : null);
/**
 * 錯乱のエッセンス (付くノータブルがランダム) はシミュでは選べない (10-27 昼オーナー。エミュには残す)。灰色で理由を短く、スイッチ noSpam と同じ扱い。
 * 前の木に入っている錯乱の手は開けば今まで通り (持ち直さなければ替わらない)
 */
const deliriumBlock = (k: string): string | null => (flag("noSpam") && ESSENCE_KEYS[k]?.en === "Essence of Delirium" ? tr("シミュでは使えない", "Not usable in the simulator") : null);
const { release, onHold, onShelfDown } = useSimShelf(shelfItem, held, omens, (k) => fractureBlock(k) ?? deliriumBlock(k));
/**
 * カオススパムオーブ (10-25 オーナー「レア状態のアイテムになら特別にカオススパムオーブを実装しよう」): 棚の上のシミュだけの札。レアの時だけ出す。
 * 持つ = カオス (段は持った物の欄で普通・上級・完全) を当たるまで (spam)。狙う MOD は必ず選ぶ、お告げはカオスと同じ。前は普通のカオスの窓の「当たるまで繰り返す」のチェックだった (消した)
 */
const SPAM_TIERS = ["chaos", "chaos_greater", "chaos_perfect"] as const;
const isRare = computed(() => item.value?.rarity === "rare");
const spamOn = computed(() => spam.value && !!held.value && canSpam(held.value));
/** 打てない理由 (カオスと同じ。外せる MOD が無い等、エンジンの useReason) */
const spamWhy = computed((): string | null => { const d = s.data.value, it = item.value; return d && it ? useReason(d, it, "chaos") : null; });
function holdSpam(): void {
  if (spamOn.value) { release(); spam.value = false; return; }
  omens.value = [];
  held.value = "chaos";
  spam.value = true;
}
/** 棚の札を持つ = 普通の手 (スパムを持っていたら外して持ち替える。同じカオスを押した時も普通のカオスへ) */
function onShelfHold(k: string): void {
  simOp("hold", k);
  if (spam.value) { spam.value = false; held.value = k; return; }
  // 同じ札をもう一度押すと離す = PC と同じ (10-26 夜オーナー「スマホも PC と同じ動きに、もう一度押すと閉じる」。前はスマホだけ離さずお告げの欄へ送っていた、モンキー 7 の 25)。
  // お告げの欄へ送るのは持った時だけ (下の watch)
  onHold(k);
}
/** ツリーの棚は打てる札だけを出すので、印が無いせいで出ないフラクチャーは窓に理由を 1 行 (アイテムには打てる時だけ) */
const fracHidden = computed(() => { const d = s.data.value, it = item.value; return !!d && !!it && !!fractureBlock("fracture") && !useReason(d, it, "fracture"); });
/** 錯乱のエッセンスがこのアイテムに打てるのに棚から外している時は、窓に理由を 1 行 (シミュの棚は打てる札だけを出すので灰色の札は出ない) */
const delirHidden = computed(() => { const d = s.data.value, it = item.value; return !!d && !!it && flag("noSpam") && Object.keys(ESSENCE_KEYS).some((k) => ESSENCE_KEYS[k]?.en === "Essence of Delirium" && !useReason(d, it, k)); });
const used = computed(() => (held.value ? omensFor(held.value, omens.value) : []));
const catalysing = computed(() => used.value.includes(CATALYSING));

/**
 * 当たりの箱にできる狙い = この手で付きうる完成の狙い (tree-hand-plan の hitAimsOf、狙い無しでも繰り返しでもない形で聞く)。
 * 付く MOD を選べない手だけ (足す・カオス。10-25 オーナー「全カレンシーで上記の表示して、カオスとか対応してない」、エッセンス・合金は出さない)
 */
/**
 * 無限のエッセンス (筋力・器用さ・知性のどれかがランダム) = 付きうる能力値のうち完成の狙いにある物を ☑ で当たりにする (10-27 オーナー、スイッチ goalShape。
 * ☑ の無い能力値は外れ MOD)。完成の狙いに 1 つも無ければ欄を出さず、結果は外れだけ (オーナー「狙い MOD に無いなら全部等しく外れ。ここは外れ MOD をただ付ける作業」)
 */
const isInfinite = computed(() => !!held.value && infiniteAim(held.value));
const aimChoices = computed((): Aim[] => {
  const d = s.data.value, it = item.value;
  if (d && it && held.value && isInfinite.value) return hitAimsOf(d, t.doc.value, props.boxId, it, handOf({ held: held.value, omens: omens.value, spam: false, spamMax: null, free: false, echo: echo.value }), t.goals.value);
  return d && it && held.value ? hitChoicesOf(d, t.doc.value, props.boxId, it, { held: held.value, omens: omens.value, echo: echo.value }, t.goals.value) : [];
});
/** チェックした狙い (候補にある物だけ) */
const checkedAims = computed((): Aim[] => aimChoices.value.filter((a) => checked.value.includes(aimKey(a))));
/** チェックを自分で触ったか (新しい手の既定 = 狙い無し、を上書きしない)。持ち替えると既定に戻る */
let touched = false;
watch(held, () => { touched = false; });
/**
 * スマホ: 持ったら、お告げの欄 (無ければ持った札) の下の端が下の帯の上の端より 12px 上に来る所まで送る
 * (10-26 オーナー「右側のお告げが出たのに画面外のまま」。10-27 オーナー「めっちゃ下までスクロールされてる、下の枠は下のバーの上の枠を下限として少し px を空けて」)。
 * 持った札が窓の上へ隠れるほどは送らない (札とお告げの欄が両方見える位置)
 */
async function showOmens(): Promise<void> {
  await nextTick();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); // 下の帯 (持った物の説明つき) の高さが決まってから
  const root = document.querySelector<HTMLElement>("[data-tree-hand-pick]");
  const card = held.value ? root?.querySelector<HTMLElement>(`[data-shelf][data-key="${held.value}"]`) : null;
  const el = root?.querySelector<HTMLElement>("[data-held-omens]") ?? card;
  const bar = root?.querySelector<HTMLElement>("[data-tree-hand-use-bar]");
  if (!root || !el || !bar) return;
  let sc: HTMLElement | null = root.parentElement;
  while (sc && !(/(auto|scroll)/.test(getComputedStyle(sc).overflowY) && sc.scrollHeight > sc.clientHeight)) sc = sc.parentElement;
  if (!sc) return;
  const down = el.getBoundingClientRect().bottom - (bar.getBoundingClientRect().top - 12);
  const room = card ? card.getBoundingClientRect().top - (sc.getBoundingClientRect().top + 8) : Infinity;
  const dy = Math.min(Math.max(down, 0), room);
  if (Math.abs(dy) > 1) sc.scrollBy({ top: dy, behavior: "smooth" });
}
watch(held, (k) => { if (k && window.innerWidth < 768) void showOmens(); });
// 新しい手の既定 = 狙い無し (10-26 夜オーナー「デフォルトは狙い無しでチェック付けといてくれ」)。当たるまで繰り返す手は狙い無しが無いので候補に全部チェック
watch([aimChoices, spam], ([l, sp]) => { if (!props.current && !touched) checked.value = sp ? l.map(aimKey) : []; }, { immediate: true });
/** チェックの一覧を出す (MOD が付く・入れ替わる手) */
const showAims = computed(() => canFree.value || (isInfinite.value && aimChoices.value.length > 0));
/** 狙い無し = MOD を 1 つもチェックしていない。当たるまで繰り返す時は狙い無しも「どれでも」も無い (MOD を 1 つ以上チェックするまで確定しない、10-25 オーナー) */
const freeOn = computed(() => showAims.value && !spam.value && !checkedAims.value.length);
/** 狙い無しを押す = MOD を全部外す (もう狙い無しの時に押しても外れない。値が同じだと Vue が描き直さず、チェックだけ外れて見えた) */
function toggleFree(e: Event): void { const was = [...checked.value]; touched = true; checked.value = []; (e.target as HTMLInputElement).checked = true; warnIfBelow(() => { checked.value = was; }); }
function toggleAim(a: Aim): void {
  const k = aimKey(a), cur = checkedAims.value.map(aimKey), was = [...checked.value];
  touched = true;
  checked.value = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
  warnIfBelow(() => { checked.value = was; });
}
/** この箱から下の箱の数 (今の手の結果から先。手を替える・狙いを変えると消える) */
const below = computed((): number => {
  const d = t.doc.value, seen = new Set<string>(), q = [...(d.boxes[props.boxId]?.outs ?? [])];
  while (q.length) { const id = q.shift()!; if (seen.has(id) || !d.boxes[id]) continue; seen.add(id); q.push(...d.boxes[id]!.outs); }
  return seen.size;
});
/**
 * スマホと PC: 今の手の下に箱がある時、別の札を持った瞬間・狙いを変えた瞬間に「この手以降は削除されます」の警告 (10-27 オーナー)。
 * 「やめる」で元の札・狙いに戻す、「続ける」でこの窓の間は聞かない。PC も同じ (10-27 シミュ 32 本目)
 */
const warnOpen = ref(false);
let warnAck = false;
let warnBack: (() => void) | null = null;
function warnIfBelow(back: () => void): void {
  // PC も同じ (10-27 ブラック経由のオーナーの頼み「スマホに揃える」。前はスマホだけで、PC は「替えると下の n 箱が消える」の小さな文だけ)
  if (!props.current || warnAck || !below.value) return;
  warnBack = back; warnOpen.value = true;
}
function warnStop(): void { warnOpen.value = false; const b = warnBack; warnBack = null; reverting = true; b?.(); void nextTick(() => { reverting = false; }); }
function warnGo(): void { warnOpen.value = false; warnAck = true; warnBack = null; }
let reverting = false;
watch(held, (k, old) => {
  if (reverting || !k || !props.current || k === props.current.currency) return;
  const was = old ?? props.current.currency, wasOmens = old ? [...omens.value] : [...props.current.omens];
  warnIfBelow(() => { held.value = was; omens.value = wasOmens; });
});
/**
 * 消去の「残したい MOD」(10-27 オーナー): 今付いている MOD を並べて ☑ で残したい物を選ぶ。既定 = 全部消えてよい (どれも残さない) =
 * ✦ 以外は「n MOD 外れ MOD」、消去 1 回ごとの箱を同じ形の箱になるまで直線に並べる (tree-hand-plan の stripChain)。☑ があればその MOD が消えた / 残ったで箱を分ける (☑ の無い MOD は外れ MOD)
 */
const isRemove = computed(() => !!held.value && effectOf(held.value) === "remove");
const keepChoices = computed(() => { const d = s.data.value, it = item.value; return d && it ? keepChoicesOf(d, it) : []; });
const keepChecked = ref<string[]>((props.current?.keep ?? []).map(aimKey));
const keepAims = computed((): Aim[] => keepChoices.value.filter((c) => keepChecked.value.includes(aimKey(c.aim))).map((c) => c.aim));
function toggleKeep(a: Aim): void {
  const k = aimKey(a), was = [...keepChecked.value];
  keepChecked.value = was.includes(k) ? was.filter((x) => x !== k) : [...was, k];
  warnIfBelow(() => { keepChecked.value = was; });
}
/**
 * 行の名前は完成形でない MOD を「外れ MOD (名前)」と頭に付けてカードと揃える (10-27 夕モンキー 9、スイッチ goalShape)。
 * 既定は「全部消えてよい」オンのまま (10-27 昼オーナー「全部消えるは一番下でデフォでオン、その上に残す MOD のチェック」= 決め済み)
 */
const isGoalMod = (a: Aim): boolean => (t.doc.value.memoAims ?? []).some((g) => g.modId === a.modId);
const keepLabel = (c: { aim: Aim; mod: StageMod }): string => (flag("goalShape") && !isGoalMod(c.aim) ? tr(`外れ MOD (${modText(c.mod)})`, `Miss mod (${modText(c.mod)})`) : modText(c.mod));
function keepNone(e: Event): void { const was = [...keepChecked.value]; keepChecked.value = []; (e.target as HTMLInputElement).checked = true; warnIfBelow(() => { keepChecked.value = was; }); }
const hand = computed((): Hand | null => (held.value ? handOf({ held: held.value, omens: omens.value, spam: spam.value, spamMax: spamMax.value, free: freeOn.value && !spam.value, echo: echo.value, ...(isRemove.value ? { keep: keepAims.value } : {}) }) : null));
/** 前に足すカタリスト (触媒のお告げを使い、まだ品質を上げる手の後でない時) */
const preCat = computed((): string | null => (catalysing.value && !afterQuality.value ? autoCat.value : null));
const RESULT: Record<HandKind, [string, string]> = {
  add: ["当たり + 外れ", "Hit + Miss"], remove: ["外れが消えた + 狙いが消えた", "Miss removed + Target lost"], swap: ["当たり + 狙いが消えた + 外れ", "Hit + Target lost + Miss"], spam: ["当たりだけ (狙いの側に空きがあれば先に高貴を 1 回、その後は当たるまでカオス)", "Hits only (an Exalted Orb first if the target's side has room, then Chaos until a hit)"], free: ["打った後 (何が付いても次へ。当たり / 外れに分けない)", "After (anything counts, no hit / miss split)"],
  quality: ["無し (品質を最大まで上げて、下の＋で次の手)", "None (raise quality to max, then add the next craft with + below)"],
  essence: ["付いた + 狙いが消えた (付く MOD は必ず付く)", "Added + Target lost (the essence mod always lands)"],
  fracture: ["印の狙いが ✦ になった (必ず印の狙いを固定)", "The marked target fractured (always fixes it)"],
  strip: ["外れが消えた (消去 1 回ごとに箱を並べ、木の箱と同じ形になった所でその段へ戻る)", "Miss removed (one box per annul, back to the step whose box has the same shape)"],
};
/** 狙いを持って着く人がいない箱では「狙いが消えた」を作らない時の文 (tree-model の setHand、tree-lost.ts) */
const RESULT_NO_LOST: Partial<Record<HandKind, [string, string]>> = { remove: ["外れが消えた", "Miss removed"], swap: ["当たり + 外れ", "Hit + Miss"], essence: ["付いた (付く MOD は必ず付く)", "Added (the essence mod always lands)"] };
const kind = computed((): HandKind | null => (hand.value ? kindOf(hand.value) : null));
/** 結果の箱の文 (写しに手を付けて「狙いが消えた」が出来るかを見る) */
const resultText = computed((): [string, string] | null => {
  const h = hand.value, k = kind.value;
  if (!h || !k) return null;
  const alt = RESULT_NO_LOST[k];
  if (!alt) return RESULT[k];
  const d = structuredClone(toRaw(t.doc.value));
  setHand(d, props.boxId, h, k, hitAims.value, null);
  return d.boxes[props.boxId]?.outs.some((o) => d.boxes[o]?.out === "lost") ? RESULT[k] : alt;
});
/** 当たりの箱の既定 (tree-hand-plan の hitAimsOf) */
const hitAims = computed((): Aim[] => {
  // チェックした MOD が当たりの箱 (当たるまで繰り返す時は、どれかが付くまで = tree-sample の handAims)。何も無ければ 0 (繰り返しなら problemOf が止める)
  // チェックの無い狙いは当たりの箱にしない (10-27 朝オーナー「チェックしてないものまで勝手につく」= バグ。f468861b の (a) を戻した)
  if (showAims.value) return checkedAims.value;
  const d = s.data.value, it = item.value, h = hand.value;
  return d && it && h ? hitAimsOf(d, t.doc.value, props.boxId, it, h, t.goals.value) : [];
});
/** 結果が 1 通りの手か (tree-hand-plan の onlyOf) */
const only = computed(() => (hand.value && s.data.value ? onlyOf(s.data.value, t.doc.value, props.boxId, hand.value, preCat.value, hitAims.value) : null));
/** この手に替えると消える箱の数 (結果の箱から先。手の種類が同じなら 0。写しに打って数える) */
const gone = computed((): number => {
  const h = hand.value, k = kind.value;
  if (!props.current || !h || !k) return 0;
  const d = structuredClone(toRaw(t.doc.value));
  const before = Object.keys(d.boxes).length;
  setHand(d, props.boxId, h, k, hitAims.value, only.value);
  const kept = new Set(Object.keys(d.boxes));
  return before - Object.keys(t.doc.value.boxes).filter((id) => kept.has(id)).length;
});
/** この箱の見本に打てない手は確定させない (tree-hand-plan の problemOf) */
const problem = computed((): string | null => (hand.value && item.value && s.data.value ? problemOf(s.data.value, item.value, hand.value, hitAims.value, preCat.value, preFill.value) : null));
/**
 * スマホは手を 2 段の質問で選ぶ (10-26 夜オーナー OK): 1 段目 = 棚でカレンシー・お告げを持つ (狙いのチェックの欄は出さない)、
 * 2 段目 = 「どれが付いたら当たり?」(付きうる狙い aimChoices だけ、既定は狙い無し)。狙い無しのままなら 1 段目の帯の「狙い無しで決める」ですぐ決める。
 * 当たるまで繰り返す手は狙い無しが無いので 2 段目だけ。PC は今のまま (チェックの欄は持った物の欄の中)
 */
const phone = usePhone();
const aimStep = ref(false);
/**
 * スマホの 10-27 昼の直し (スイッチ phone1027): 持った物の説明は既定で閉じる (開くのは任意)。
 * 消去は高貴・カオスと同じく、まず持って「使う ›」→ 次のページで残したい MOD (上に ☑ の並び、一番下に全部消えてよい、既定オン。「n MOD 外れ MOD」は出さない)
 */
const P27 = computed(() => phone.value && flag("phone1027"));
/** カオススパムオーブの札と呼び名を出さない (スイッチ noSpam、10-27 昼オーナー「特殊過ぎて逆に困る」)。前に保存した当たるまでの手は開けば今まで通り (spam のまま決められる) */
const NS = flag("noSpam");
const helpOpen = ref(false);
const keepStep = ref(false);
watch(held, () => { aimStep.value = false; keepStep.value = false; helpOpen.value = false; });
function ok(): void {
  const h = hand.value, k = kind.value;
  simOp("hand-decide");
  if (h && k && !problem.value) emit("pick", h, k, hitAims.value, preCat.value, only.value);
}
</script>

<template>
  <!-- エミュのクラフトの画面と同じ並び: 左にアイテムのカード (幅もエミュと同じ既定)、右にカレンシーの棚。スマホは縦積み (カードが上) (10-24 オーナー「右側カレンシーで左側アイテムの姿勢はエミュ産で慣れてる」) -->
  <div v-if="needAim" data-tree-hand-need-aim class="flex flex-col items-start gap-3 py-6 text-[14px]">
    <p>{{ tr("この当たりの箱は、まだ当たりの MOD が決まっていません。先に MOD を選ぶと、この箱のアイテムができて次の手を選べます", "This hit box has no target mod yet. Pick the mod first; then the item at this box exists and you can choose the next craft") }}</p>
    <button type="button" data-tree-hand-pick-aim class="g-btn-red min-h-10 px-4" @click="emit('aim')">{{ tr("当たりの MOD を選ぶ", "Pick the hit mod") }}</button>
  </div>
  <div v-else data-tree-hand-pick class="grid min-h-0 items-start gap-4 text-[13px] max-md:grid-cols-[minmax(0,1fr)] md:grid-cols-[auto_minmax(0,1fr)]" @contextmenu="held && ($event.preventDefault(), release())">
    <!-- この箱の時点のアイテム (見本)。持ってカードを押す = この手にする (エミュと同じ操作) -->
    <!-- カードの下はエミュと同じく空ける (持っている間はカードのすぐ下に「押すと使う · 右クリック / Esc で手放す」が重ねて出る) -->
    <div class="flex min-w-0 flex-col gap-8 md:w-[480px]">
      <div data-tree-hand-card :class="held && problem ? 'cursor-not-allowed opacity-60' : ''" :title="problem ?? undefined"><StageItemCard v-if="shelfItem" :item="cardOf(preCat ? shelfItem : item ?? shelfItem)" :row-tags="rowTags(preCat ? shelfItem : item ?? shelfItem)" :added="[]" :removed="[]" :holding="!!held && !problem" :flash-key="0" :doomed="preview?.change ?? []" :open="preview?.open ?? null" @use="ok" /></div>
      <div class="flex min-w-0 flex-col gap-1.5">
        <p class="text-[12px] opacity-70">{{ tr("棚から持って、カードを押すとこの箱の次の手になる", "Hold a currency from the shelf and click the item to make it this box's next craft") }}</p>
        <!-- 打たずに分ける (分かれ目) のボタンは 10-25 に外した (オーナー「分かれ道マジでややこしいからボタンいらない」)。分かれ目は見本の木にある物だけ、窓 TreeSplitPick で行を直せる -->
        <p v-if="fracHidden" data-tree-hand-frac-off class="text-[12px] text-rose-200/90">{{ tr("フラクチャーのオーブ: 先に完成の MOD でフラクチャーを決めて (0 完成形の設定の ✦)", "Fracturing Orb: set a fracture on the final mods first (✦ in 0 Final item)") }}</p>
        <p v-if="delirHidden" data-tree-hand-delirium-off class="text-[12px] text-rose-200/90">{{ tr("錯乱のエッセンス: シミュでは使えない (付くノータブルがランダム)", "Essence of Delirium: not usable in the simulator (the notable is random)") }}</p>
        <button v-if="t.doc.value.boxes[boxId]?.out !== 'start'" type="button" data-tree-hand-back class="g-btn sm self-start" :title="tr('打たずに既にある箱へ戻す (窓を閉じて、戻り先の箱を押す)', 'Return to an existing box instead (closes this window; click the box)')" @click="emit('back')">↩ {{ tr("既にある箱へ戻す", "Return to a box") }}</button>
        <button v-if="current" type="button" class="g-btn sm self-start" @click="emit('clear')">{{ tr("この手を消す (下も消える)", "Remove this craft (and below)") }}</button>

    <!-- 持っている物と、残した入力 (触媒のカタリストの品質・カオススパム) -->
    <div v-if="held" class="flex flex-col gap-1.5 rounded-md bg-white/[0.04] p-2">
      <div class="flex min-w-0 items-center gap-1.5">
        <span class="flex shrink-0 items-center -space-x-1"><img v-for="ic in [held, ...used].filter((x) => !!iconOf(x))" :key="ic" :src="iconOf(ic)" alt="" class="size-6 object-contain" /></span>
        <b class="min-w-0 truncate max-md:overflow-visible max-md:whitespace-normal max-md:break-words" :title="hand ? handLabel(hand) : ''">{{ spamOn && !NS ? `${tr("カオススパムオーブ", "Chaos Spam Orb")} (${[nameOf(held), ...used.map(nameOf)].join(" + ")})` : [nameOf(held), ...used.map(nameOf), ...(echo && isBone(held) ? [nameOf(ECHO)] : [])].join(" + ") }}</b>
      </div>
      <!-- カオススパムオーブ: カオスの段を替える (カタリストの札と同じ形) と上限 -->
      <div v-if="spamOn && !NS" data-tree-hand-spam-tiers class="flex flex-wrap items-center gap-1">
        <button v-for="c in SPAM_TIERS" :key="c" type="button" data-tree-hand-spam-tier :data-tier="c" class="flex min-h-7 items-center gap-1 rounded-md border px-2 text-[12px]" :class="c === held ? 'border-amber-300 bg-amber-500/20 text-amber-100' : 'border-white/10 hover:bg-white/10'" :aria-pressed="c === held" @click="held = c"><img v-if="iconOf(c)" :src="iconOf(c)" alt="" class="size-5 object-contain" />{{ nameOf(c) }}</button>
        <span class="ml-1 flex items-center gap-1 text-[12px] opacity-80">{{ tr("上限", "Max") }}<input v-model.number="spamMax" type="number" min="1" class="h-7 w-16 rounded-md border border-white/15 bg-black/40 px-1 text-right" :placeholder="tr('なし', 'none')" />{{ tr("回", "") }}</span>
      </div>
      <!-- カタリストの手はここで種類を替える (棚にカタリストが無い、10-22 13 通り組んだ #7) -->
      <div v-if="isCatalyst(held)" data-tree-hand-cats class="flex flex-wrap gap-1">
        <!-- 絵は相場に無く出ないので名前 (「のカタリスト」を省く、10-22 開発版で空の四角が並んだ) -->
        <button v-for="c in TREE_CATALYSTS" :key="c" type="button" data-tree-hand-cat :data-cat="c" class="min-h-7 rounded-md border px-2 text-[12px]" :class="c === held ? 'border-amber-300 bg-amber-500/20 text-amber-100' : 'border-white/10 hover:bg-white/10'" :title="nameOf(c)" :aria-pressed="c === held" @click="held = c">{{ nameOf(c).replace(/のカタリスト$| Catalyst$/, "") }}</button>
      </div>
      <p v-if="preCat" data-tree-hand-pre-cat class="text-[12px] text-sky-200/90">{{ tr(`前に「${handName(preCat)} (品質を最大まで)」の手を足す (札を押すとカタリストを替えられる)`, `Adds "${handName(preCat)} (to max quality)" before this (click its chip to change the catalyst)`) }}</p>
      <!-- フラクチャー: 印の狙いを必ず固定、外れは費用で数える (10-24 オーナー「2 回外れて 1 回当たり」、10-25 に戻した) -->
      <p v-if="isFracture" data-tree-hand-frac-rule class="text-[12px] opacity-70">{{ tr("完成の MOD の印の狙いを必ず ✦ にする。固定できる MOD が 2 つ以上なら、2 回外れて 1 回当たりとして、ここまでの費用とフラクチャーを 2 回分足す", "Always fractures the marked final mod. With 2+ mods that could fracture, counts as 2 misses then a hit: adds this point's cost and the Fracturing Orb twice") }}</p>
      <!-- 足す手: 当たりの箱にする狙いをチェック (複数可)。チェックした MOD ごとに当たり、どれも付かなければ外れ、0 個 = 狙い無し (10-25 オーナー) -->
      <div v-if="showAims && !phone" data-tree-hand-aims class="flex flex-col gap-1 text-[12px]">
        <span v-if="spam && !checkedAims.length" data-tree-hand-aim-need class="text-rose-200/90">{{ tr("狙う MOD を選んで", "Pick a target mod") }}</span>
        <span v-else class="opacity-80">{{ tr("狙う MOD (☑ の MOD ごとに当たりの箱を作る。どれか 1 つ付けば当たり)", "Target mods (one hit box per ☑ mod; any one landing is a hit)") }}</span>
        <label v-for="a in aimChoices" :key="aimKey(a)" data-tree-hand-aim :data-aim="aimKey(a)" class="flex min-h-7 min-w-0 cursor-pointer items-center gap-2">
          <input type="checkbox" :checked="checkedAims.some((x) => aimKey(x) === aimKey(a))" @change="toggleAim(a)" /><span class="min-w-0 truncate max-md:overflow-visible max-md:whitespace-normal max-md:break-words" :title="t.aimLabel(a)">{{ t.aimLabel(a) }}</span>
        </label>
        <!-- 狙い無し (MOD とは排他。前はお告げの列の札、10-25 オーナー「狙い無しも左のチェックに付けるといいね」) -->
        <label v-if="!spam && !isInfinite" data-tree-hand-free class="flex min-h-7 cursor-pointer items-center gap-2" :title="tr('狙い無し (空きを 1 つ埋めるだけ。当たり / 外れに分けない)', 'No target (just fill an open slot; no hit / miss split)')">
          <input type="checkbox" :checked="freeOn" @change="toggleFree($event)" />{{ tr("狙い無し (何が付いても次へ)", "No target (anything counts)") }}
        </label>
      </div>
      <!-- 消去: 残したい MOD (10-27 オーナー)。既定は全部消えてよい = ✦ 以外は「n MOD 外れ MOD」、同じ形の箱になるまで消去の箱を並べる -->
      <div v-if="isRemove && !P27" data-tree-hand-keep class="flex flex-col gap-1 text-[12px]">
        <span class="opacity-80">{{ tr("残したい MOD (☑ の MOD が消えたら「狙いが消えた」。☑ の無い MOD は外れ MOD)", "Mods to keep (a ☑ mod removed = Target lost; unchecked mods are misses)") }}</span>
        <label data-tree-hand-keep-none class="flex min-h-7 cursor-pointer items-center gap-2 max-md:min-h-11">
          <input type="checkbox" :checked="!keepAims.length" @change="keepNone($event)" />{{ tr("全部消えてよい (同じ形の箱になるまで消去の箱を並べる)", "Anything may go (annul boxes until a box of the same shape)") }}
        </label>
        <span v-if="!keepAims.length && !flag('goalShape')" data-tree-hand-keep-junk class="pl-6 text-[#e0a060]">{{ tr(`${keepChoices.length} MOD 外れ MOD`, `${keepChoices.length} mods: misses`) }}</span>
        <label v-for="c in keepChoices" :key="aimKey(c.aim)" data-tree-hand-keep-mod :data-mod="aimKey(c.aim)" class="flex min-h-7 min-w-0 cursor-pointer items-center gap-2 max-md:min-h-11">
          <input type="checkbox" :checked="keepChecked.includes(aimKey(c.aim))" @change="toggleKeep(c.aim)" /><span class="min-w-0 truncate max-md:overflow-visible max-md:whitespace-normal max-md:break-words" :title="modText(c.mod)">{{ keepLabel(c) }}</span>
        </label>
      </div>
      <p v-if="kind" class="text-[11px] opacity-70">{{ tr("結果の箱", "Result boxes") }}: {{ only ? (only.length === 1 ? tr(`${outName(only[0]!.out)}だけ (結果は 1 通り)`, `${outName(only[0]!.out)} only (one possible result)`) : [...new Set(only.map((o) => outName(o.out)))].join(" + ")) : resultText ? tr(resultText[0], resultText[1]) : "" }}</p>
      <!-- 替える時は、消える箱の数を先に小さく (オーナー 10-22。1 つ戻す / Ctrl+Z で戻せる)。持ち直しは棚で別の物を押すだけ。決めるのはカードを押す -->
      <div class="flex flex-wrap items-center gap-1.5">
        <span v-if="problem" data-tree-hand-problem class="text-[11px] text-rose-200/90">{{ tr(`この箱では打てない: ${problem}`, `Can't be used on this box: ${problem}`) }}</span>
        <span v-else-if="gone" data-tree-hand-gone class="text-[11px] text-rose-200/90">{{ tr(`替えると下の ${gone} 箱が消える (1 つ戻すで戻せる)`, `Replacing removes ${gone} box(es) below (Undo restores)`) }}</span>
      </div>
    </div>
      </div>
    </div>

    <div data-tree-shelf @pointerdown="onShelfDown">
      <!-- カオススパムオーブ (シミュだけの札、レアの時だけ)。棚の札と同じ形 (ShelfButton の枠・絵・名前)、絵はカオスオーブそのまま、
           右上に「上級」「完全」と同じ形の札で「スパム」、見分けは札と枠の色だけ (10-25 オーナー、前の ↻ の印はこれに置き換え) -->
      <button v-if="!NS && ((TREE_SPAM_ORB && isRare) || spamOn)" type="button" data-tree-spam-orb :aria-pressed="spamOn" :disabled="!!spamWhy && !spamOn"
        class="group relative mb-2 flex w-[74px] flex-col items-center px-0.5 pb-1 text-[10px] transition disabled:cursor-not-allowed disabled:opacity-35 md:w-[80px] md:text-[11px]"
        :class="spamOn ? 'text-[var(--exile-color-text-title)]' : ''"
        :title="spamWhy ?? tr('狙う MOD が付くまでカオスを打ち続ける (狙いの側に空きがあれば先に高貴を 1 回)。レアの時だけ', 'Keep using Chaos until a target mod lands (an Exalted Orb first if the target side has room). Rare only')" @click="holdSpam">
        <span class="g-slot grid size-[52px] place-items-center ring-1 ring-rose-400/50 md:size-[56px]" :class="spamOn ? 'on' : ''"><img v-if="iconOf('chaos')" :src="iconOf('chaos')" alt="" class="h-9 w-9 object-contain md:h-[42px] md:w-[42px]" draggable="false" /></span>
        <span class="mt-0.5 min-h-[2.5em] text-center leading-tight">{{ tr("カオススパムオーブ", "Chaos Spam Orb") }}</span>
        <span class="absolute right-0.5 top-0.5 rounded bg-black/60 px-1 text-[9px] text-rose-300">{{ tr("スパム", "Spam") }}</span>
      </button>
      <CurrencyShelf @hold="onShelfHold">
        <!-- 持った物に掛けられるお告げ = クラフト台と同じ部品と置き場 (HeldOmens.vue を持ったアイコンのすぐ下に重ねる。inline-held だと棚の一番下で見切れた、10-21 本物のマウス)。
             足す手は同じ欄に「狙い無し」(適当打ち、オーナー 10-22「お告げの欄の中に適当打ちがまだ無い」) -->
        <template v-if="omensAllowedFor(held).length || (!!held && isBone(held))" #held><HeldOmens><!-- アビスの反響は並びのお告げの 1 つ (骨を持つと既定で掛かる)。前は並びとは別の大きな札「アビスの反響」を置いていた (10-26 夜オーナー「でかいアイコンもある」) -->
        </HeldOmens></template>
      </CurrencyShelf>
    </div>
    <!-- スマホだけ: 持っている間は下に「使う」の帯 (カードの「下の帯の『使う』でも」の帯。カードまで戻らず親指で決められる、10-25 シミュ 29 の点検) -->
    <!-- 320 で帯の右が切れた (棚の並びの最小の幅で枠ごと広がった) ので、スマホの並びの列は最小 0。帯は窓の下の余白 (12px) まで下げて、下に棚が覗かないように -->
    <div v-if="held" data-tree-hand-use-bar class="sticky -bottom-3 z-10 -mx-3 -mb-3 border-t border-white/10 bg-[#0c0a08]/95 px-3 pb-5 pt-2 md:hidden">
      <p class="mb-1 break-words text-[12px] font-bold text-amber-100">{{ tr(`${nameOf(held)} を持っている`, `Holding ${nameOf(held)}`) }}</p>
      <button v-if="heldHelp.length && P27" type="button" data-tree-hand-help-toggle class="mb-1 min-h-9 text-[12px] text-[#c9b48a] underline decoration-white/20" :aria-expanded="helpOpen" @click="helpOpen = !helpOpen">{{ helpOpen ? tr("説明を閉じる ▴", "Hide details ▴") : tr("説明 ▾", "Details ▾") }}</button>
      <p v-if="heldHelp.length && (!P27 || helpOpen)" data-tree-hand-held-help class="mb-2 break-words text-[12px] leading-snug text-[#d8ccb4]">{{ heldHelp.join(" ") }}</p>
      <!-- 狙いを選べる手は 2 つ: 狙い無し (今のチェック) のまま決める / 2 段目で狙いを選ぶ。繰り返しの手は 2 段目だけ -->
      <div v-if="showAims" class="flex gap-2">
        <!-- 左は普通の「キャンセル」(持った札を離す)、右は狙いを選ぶ (今の手を直す時は「狙いを再度選ぶ」)。10-27 オーナー「このまま決めるは日本語として変」 -->
        <button type="button" data-tree-hand-cancel class="g-btn !min-h-11 min-w-0 flex-1 whitespace-normal text-[14px] leading-tight" @click="release()">{{ tr("キャンセル", "Cancel") }}</button>
        <button type="button" data-tree-hand-aim-step class="g-btn-red !min-h-11 min-w-0 flex-1 whitespace-normal text-[14px] leading-tight" @click="aimStep = true">{{ current ? tr("狙いを再度選ぶ ›", "Pick targets again ›") : tr("狙いを選ぶ ›", "Pick targets ›") }}</button>
      </div>
      <div v-else-if="isRemove && P27" class="flex gap-2">
        <button type="button" data-tree-hand-cancel class="g-btn !min-h-11 min-w-0 flex-1 whitespace-normal text-[14px] leading-tight" @click="release()">{{ tr("キャンセル", "Cancel") }}</button>
        <button type="button" data-tree-hand-keep-step class="g-btn-red !min-h-11 min-w-0 flex-1 whitespace-normal text-[14px] leading-tight" @click="keepStep = true">{{ tr("使う ›", "Use ›") }}</button>
      </div>
      <button v-else type="button" data-tree-hand-use class="g-btn-red min-h-11 w-full text-[15px]" :disabled="!!problem" @click="ok">{{ tr("使う (この手にする)", "Use (make it this craft)") }}</button>
    </div>
    <!-- スマホの 2 段目「当たりにする MOD」(画面いっぱい、持った物の手で付きうる狙いだけ)。手の窓 (スマホは画面いっぱい) の中に重ねる:
         body へ出すと手の窓から見て枠の外の押しになり、MOD を押すと窓ごと閉じた (10-27) -->
      <div v-if="phone && aimStep && held && showAims" data-tree-hand-aim-page class="fixed inset-0 z-[320] flex flex-col bg-[#15110c] text-[14px]">
        <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-4 text-center">
          <p class="break-words text-[12px] text-[#9a8a70]">{{ hand ? handLabel(hand) : nameOf(held) }}</p>
          <h2 class="mt-1 text-[17px] font-bold text-[#f0e4c8]">{{ tr("当たりにする MOD", "Mods that count as a hit") }}</h2>
          <p class="mt-1 break-words text-[12px] text-[#9a8a70]">{{ spam ? tr("当たるまで繰り返す手は、狙う MOD を 1 つ以上選ぶ", "For a repeat-until-hit craft, pick at least one target") : tr("☑ の MOD ごとに当たりの箱を作る。どれか 1 つ付けば当たり", "One hit box per ☑ mod; any one landing is a hit") }}</p>
          <div data-tree-hand-aims class="mt-3 flex flex-col gap-1.5 text-left">
            <label v-for="a in aimChoices" :key="aimKey(a)" data-tree-hand-aim :data-aim="aimKey(a)" class="flex min-h-11 min-w-0 cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3">
              <input type="checkbox" class="size-5 shrink-0" :checked="checkedAims.some((x) => aimKey(x) === aimKey(a))" @change="toggleAim(a)" /><span class="min-w-0 break-words">{{ t.aimLabel(a) }}</span>
            </label>
            <label v-if="!spam && !isInfinite" data-tree-hand-free class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3">
              <input type="checkbox" class="size-5 shrink-0" :checked="freeOn" @change="toggleFree($event)" /><span class="min-w-0 break-words">{{ tr("狙い無し (何が付いても次へ)", "No target (anything counts)") }}</span>
            </label>
          </div>
          <p v-if="kind" class="mt-2 break-words text-[12px] opacity-70">{{ tr("結果の箱", "Result boxes") }}: {{ only ? (only.length === 1 ? tr(`${outName(only[0]!.out)}だけ (結果は 1 通り)`, `${outName(only[0]!.out)} only (one possible result)`) : [...new Set(only.map((o) => outName(o.out)))].join(" + ")) : resultText ? tr(resultText[0], resultText[1]) : "" }}</p>
          <p v-if="problem" class="mt-1 break-words text-[12px] text-rose-200/90">{{ tr(`この箱では打てない: ${problem}`, `Can't be used on this box: ${problem}`) }}</p>
        </div>
        <div class="flex gap-2 border-t border-white/10 px-3 py-2">
          <button type="button" data-tree-hand-aim-back class="g-btn !min-h-11 shrink-0 px-3" @click="aimStep = false">‹ {{ tr("戻る", "Back") }}</button>
          <button type="button" data-tree-hand-aim-go class="g-btn-red !min-h-11 min-w-0 flex-1 text-[15px]" :disabled="!!problem" @click="ok">{{ tr("決める", "Decide") }}</button>
        </div>
      </div>
    <!-- スマホの消去の 2 ページ目「残したい MOD」(aimStep のページと同じ形。上に ☑ の並び、一番下に全部消えてよい。10-27 昼オーナー) -->
      <div v-if="P27 && keepStep && held && isRemove" data-tree-hand-keep-page class="fixed inset-0 z-[320] flex flex-col bg-[#15110c] text-[14px]">
        <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-4 text-center">
          <p class="break-words text-[12px] text-[#9a8a70]">{{ hand ? handLabel(hand) : nameOf(held) }}</p>
          <h2 class="mt-1 text-[17px] font-bold text-[#f0e4c8]">{{ tr("残したい MOD", "Mods to keep") }}</h2>
          <p class="mt-1 break-words text-[12px] text-[#9a8a70]">{{ tr("☑ の MOD が消えたら「狙いが消えた」。☑ の無い MOD は外れ MOD", "A ☑ mod removed = Target lost; unchecked mods are misses") }}</p>
          <div data-tree-hand-keep class="mt-3 flex flex-col gap-1.5 text-left">
            <label v-for="c in keepChoices" :key="aimKey(c.aim)" data-tree-hand-keep-mod :data-mod="aimKey(c.aim)" class="flex min-h-11 min-w-0 cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3">
              <input type="checkbox" class="size-5 shrink-0" :checked="keepChecked.includes(aimKey(c.aim))" @change="toggleKeep(c.aim)" /><span class="min-w-0 break-words">{{ keepLabel(c) }}</span>
            </label>
            <label data-tree-hand-keep-none class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3">
              <input type="checkbox" class="size-5 shrink-0" :checked="!keepAims.length" @change="keepNone($event)" /><span class="min-w-0 break-words">{{ tr("全部消えてよい (同じ形の箱になるまで消去の箱を並べる)", "Anything may go (annul boxes until a box of the same shape)") }}</span>
            </label>
          </div>
          <p v-if="kind" class="mt-2 break-words text-[12px] opacity-70">{{ tr("結果の箱", "Result boxes") }}: {{ only ? (only.length === 1 ? tr(`${outName(only[0]!.out)}だけ (結果は 1 通り)`, `${outName(only[0]!.out)} only (one possible result)`) : [...new Set(only.map((o) => outName(o.out)))].join(" + ")) : resultText ? tr(resultText[0], resultText[1]) : "" }}</p>
          <p v-if="problem" class="mt-1 break-words text-[12px] text-rose-200/90">{{ tr(`この箱では打てない: ${problem}`, `Can't be used on this box: ${problem}`) }}</p>
        </div>
        <div class="flex gap-2 border-t border-white/10 px-3 py-2">
          <button type="button" data-tree-hand-keep-back class="g-btn !min-h-11 shrink-0 px-3" @click="keepStep = false">‹ {{ tr("戻る", "Back") }}</button>
          <button type="button" data-tree-hand-keep-go class="g-btn-red !min-h-11 min-w-0 flex-1 text-[15px]" :disabled="!!problem" @click="ok">{{ tr("決める", "Decide") }}</button>
        </div>
      </div>
    <!-- 「この手以降は削除されます」(スマホ、別の札を持った・狙いを変えた瞬間) -->
    <div v-if="warnOpen" data-tree-hand-warn class="fixed inset-0 z-[330] flex items-center justify-center bg-black/60 px-4" @click.self="warnStop">
      <div class="w-full max-w-sm rounded-xl border border-rose-400/60 bg-[#1d0f10] px-4 py-3 text-center">
        <p class="text-[16px] font-bold text-rose-100">{{ tr("この手以降は削除されます", "Everything after this craft will be removed") }}</p>
        <p class="mt-1 break-words text-[13px] text-[#e8d8c8]">{{ tr(`この箱から下の ${below} 箱が消えます (1 つ戻すで戻せる)`, `The ${below} box(es) below this one will be removed (Undo restores them)`) }}</p>
        <div class="mt-3 flex gap-2">
          <button type="button" data-tree-hand-warn-stop class="g-btn !min-h-11 flex-1" @click="warnStop">{{ tr("やめる", "Cancel") }}</button>
          <button type="button" data-tree-hand-warn-go class="g-btn-red !min-h-11 flex-1" @click="warnGo">{{ tr("続ける", "Continue") }}</button>
        </div>
      </div>
    </div>
    <!-- 持っている物の絵をカーソルに付ける (エミュと同じ共有の部品、スマホは出ない。10-26 オーナー「パソコン版持ってるかわからんから…エミュと同じ仕様で」) -->
    <HeldCursor :src="held ? iconOf(held) : null" />
  </div>
</template>

