<!--
  TreeBox.vue — ツリーの箱 1 つ (2026-10-22 表面だけ)。始まり (フラクチャー) / 当たり / 外れ / 外れが消えた / 狙いが消えた。
  当たりは押すと MOD を選ぶ、下の＋で次の手。外れ・消えたの箱は消せない。見出しの鉛筆でメモ (10-22 試し打ちの欄を消したのでここから)。数字 (通った人数・ここまでの費用) は計算を繋ぐまで出さない
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { rowFitOf, setNatural } from "./use-row-fit";
import { useArmed } from "../../../utils/use-armed";
import { useDismiss } from "../../../utils/use-dismiss";
import { subtree } from "../../../services/simulator/tree/tree-model";
import Icon from "../../../components/ui/Icon.vue";
import { mergedAway, mergedInto } from "../../../services/simulator/tree/tree-merge-open";
import StageItemCard from "../../../components/for-share/item/StageItemCard.vue";
import { craftStage as s } from "../../../state/craft-stage";
import { boxCardOf } from "./box-card";
import { previewUse } from "../../../services/craft-stage/engine";
import { LINE_Y } from "../../../services/simulator/tree/tree-row-tops";
import { CHIP_HALF } from "./tree-lines";
import { splitAny, splitOuts } from "../../../services/simulator/tree/tree-model-ops";
import { boxAims, BOX_H, BOX_W, fractureMarks, START_JUNK, startOf, startRarity, startsFractured, multiFracWhite, type TreeBox } from "../../../services/simulator/tree/tree-model";
import { tr } from "../../../i18n/lang"; import { flag } from "../../../web/release-flags";
import { useTree } from "./use-tree";
import { setSameHiOwn } from "./tree-hand-plan";
import { SAME_HI } from "../../../services/simulator/tree/tree-outcome";
import { lvLook } from "./tree-whittle-marks";
import type { BandView } from "./use-tree-bands";
import { bandsInto } from "../../../services/simulator/tree/tree-band";
import { handLabel, headOf, OUT_LOOK, rarityName, splitWhenText, sureFracText, boxesEn } from "./tree-names";
import { boxArrow, orphanHits } from "./tree-fail";
import { joinLook, joinNoWhy, useTreeJoin } from "./use-tree-join";
import { foreseenAt, holdsAt, noHitHeld } from "../../../services/simulator/tree/tree-foresee";
import { cantHandOf } from "../../../services/simulator/tree/tree-frame-check";

const props = defineProps<{ box: TreeBox; /** 引いて見るだけの時の ＋ の倍率 (1 / 木の倍率。無ければ見るだけの間は ＋ を出さない、S-147c) */ plusFar?: number; /** 沼った場所の青枠の倍率 (1 / 木の倍率、0 = 枠無し、S-72) */ swamp?: number; /** 自分で置く時の位置 (Vue Flow の箱の中では無し = Vue Flow が置く) */ x?: number; y?: number; removable: boolean; selected: boolean; backLabel: string; /** 縮めて見ている時: 押せる物を出さず、押すとそこへ寄る */ viewOnly?: boolean; /** ハズレ整理の前のグレー (S-191・S-198) */ gray?: boolean; /** 次に押す箱 (S-198) */ guide?: boolean; /** 片付いたハズレ (S-198) */ settled?: boolean; /** 上の札の一覧で選んだ札を使っている */ glow?: boolean; /** ルート精査で見つかった穴 (文) */ issue?: string | null;
  /** 縮めた時の倍率の逆数 (押せる物だけこれで大きさを戻し、画面の上で 24px 以上を保つ。オーナー 10-22「縮めても押せる物は小さくならない」) */ inv?: number;
  /** スマホの道の画面: エッセンスの行は MOD の名前で出す (S-94h、tree-row-tags の routeRowTags) */ routeNames?: boolean;
  /** 削減の手前の枠の帯 (帯の頭の箱だけ、S-65c ⑫) */ bands?: BandView[];
  /** 見るだけの箱でも帯は押せる (縮めて見ている時。帯を押すとその枠の手の窓、S-147j) */ bandOn?: boolean }>();
const emit = defineEmits<{
  /** 箱を引っ張り始めた (押した所から。判定はページの use-gesture.ts) */
  drag: [e: PointerEvent]; aim: [];
  /** 穴の ! を押した (穴の一覧の窓を開く、10-25 オーナー) */
  issue: []; remove: []; clearBack: []; done: []; fail: []; note: [];
  /** 始まりの箱のベースを押した (ベースとアイテムレベルを選ぶ欄) */
  base: [];
  /** マウスを乗せた / 外した (その箱の線を濃く・乗せた時のカード) */
  hover: [on: boolean];
  /** 戻り先の札に乗せた / 外した・押した */
  backHover: [on: boolean]; backGo: [];
  /** ＋を押した (押すだけ = 足す、長押しで引っ張る = 箱の上で離すとつなぐ。決めるのはページ) */
  plus: [kind: "side" | "next", e: PointerEvent];
  /** 要確認の印を押した (確かめたので印を消す) */
  checked: [];
  /** 削減の手前の枠の帯を押した (その枠の箱 id) */
  band: [id: string, e: PointerEvent];
}>();
const t = useTree();
/**
 * × = この箱を作った手を消す (その手の結果の箱すべてと、その下も。親の箱は手が無い形に戻り、手を選び直せる)。1 回目で赤く「下の n 箱ごと消す」、
 * 3 秒のうちにもう一度で消す (1 つ戻すで戻せる)。どの箱にも (スタートは除く)。前の「この当たりを消す」(当たりの箱 1 つだけ) はこれにまとめた
 * (10-27 オーナー「途中で狙いの MOD を変えたい時の挙動が分かりづらい。枠の × ボタンを押して消せるように。消したら作ったカレンシーごと消える感じ」)
 */
/** 「下の n 箱ごと消す」は 8 秒待つ (3 秒では押す前に × に戻った、10-27 夕モンキー 5) */
// 時間では戻さず、枠 (この箱の ×) の外を押すか Esc で戻す (8 秒でもモンキーの台本の間に戻った、10-27 夜モンキー 2 回目 3。スイッチ armKeep)
const rm = useArmed(2147483647);
useDismiss(() => rm.is(props.box.id), [], rm.clear, { swallow: false, keep: `[data-box-id="${props.box.id}"] [data-tree-box-remove]` });
const rmCount = computed(() => { const d = t.doc.value, p = props.box.parent ? d.boxes[props.box.parent] : undefined; return p ? p.outs.reduce((n, o) => n + subtree(d, o).length, 0) : 0; });
const rmTitle = computed(() => tr(`この箱を作った手 (${(() => { const h = props.box.parent ? t.doc.value.boxes[props.box.parent]?.hand : null; return h ? handLabel(h) : ""; })()}) と、その結果の箱 ${rmCount.value} 個を消す (手を選び直せる)`, `Remove the craft that made this box and its ${boxesEn(rmCount.value, "result ")} (pick the craft again)`));
/** 箱の中の今のアイテムの枠 (乗せた時のカードと同じ部品を縮める。見本は箱の形に合う人、10-26 オーナー「枠は現状のアイテムの枠が表示してあげたら？いまカードで表示してる情報」) */
/** アイテムの枠の幅 (乗せた時のカードと同じ大きさ。縮めない、10-26 オーナー「枠いっぱいに表示していいのにこれ縮小してるから？拡大も欲しいんだけどそこ」) */
const CARD_W = BOX_W - 16;
/** この箱からまとめられるか (下の操作の行の「まとめる」の入口。押すとこの箱をまとめ先にして上の帯の「まとめる」と同じ選び方へ) */
/** 当たりの箱の「次の手が未定」は赤くせず静かな印だけ (足りない所には数える。10-26 オーナー「一旦整理してA」) */
/** 同じ段の箱は縦の大きさも揃える: 中身は上詰め、下の行は下の辺へ (S-141b、スイッチ rowFit)。中身だけの高さ = 箱の高さ − 伸ばした分 (fill) を測って use-row-fit へ */
const rootEl = ref<HTMLElement>(), fillEl = ref<HTMLElement>();
const fitH = computed(() => (props.x === undefined && props.box.out !== "pass" ? rowFitOf(t.doc.value, props.box.id) : 0));
let ro: ResizeObserver | null = null;
onMounted(() => { if (props.x !== undefined || !rootEl.value) return; ro = new ResizeObserver(() => { const r = rootEl.value; if (r) setNatural(props.box.id, Math.round(r.offsetHeight - (fillEl.value?.offsetHeight ?? 0))); }); ro.observe(rootEl.value); });
onBeforeUnmount(() => ro?.disconnect());
/** 決める事が残っている箱 (足りない所に何か出ている箱) は全部、右上の角の丸い赤の「!」の 1 つの印 + 赤枠。題の横の「! 未定」は出さない (S-89b、スイッチ unsetMark、10-28 深夜オーナー「この未定ってマーク共通にして全体」) */
const unset = computed(() => !!props.issue);
// 別の道の同じ状態の当たり (sameHitsOf) は、完成・次の手がある箱どうしでもまとめられる (10-26 夜オーナー「中身がある箱どうしは自動でせずまとめる」)
/* 人が選ぶ「まとめる」「↩ 戻り先を選ぶ」は出さない (S-52b。10-28 深夜オーナー「だってなかったら自分でカレンシー足してるじゃんね今　まとめるは消していいわな」)。「分ける」は前の「どれか」の箱にだけ */
/** MOD の値は木の中で揃える (貼った値か段の真ん中、tree-fixed-values。10-26 夜オーナー「ツリー内で同じ MOD じゃないと混乱する」) */
/** スタートの箱も結果の箱と同じアイテムカード (レアリティの色・名前・MOD の行、✦ はフラクチャーの印。10-28 夜オーナー「スタートもアイテムカードで表示させてくれツリー」、スイッチ startCard) */
/** この箱の手が代表の品に打てない理由 (保存から開いた木に残った手、S-107c)。親の手が打てない箱は結果が作れていないので「完成」の印を出さない */
const cantHand = computed(() => (s.data.value && props.box.hand ? cantHandOf(s.data.value, t.doc.value, props.box.id) : null));
const parentCant = computed(() => !!s.data.value && !!props.box.parent && !!cantHandOf(s.data.value, t.doc.value, props.box.parent));
const doneShown = computed(() => !!props.box.done && !(props.box.done === "main" && parentCant.value));
/** 箱のカード (見本 → 値を揃える → 札、box-card の 1 本。スマホの道の画面はエッセンスの行を名前で) */
const sampled = computed(() => (s.data.value ? boxCardOf(s.data.value, t.doc.value, props.box.id, { box: props.box, routeNames: props.routeNames }) : null));
const sample = computed(() => sampled.value?.sample ?? null);
/** この箱の手で消える・入れ替わる候補の MOD (オレンジの文字。手の窓・エミュと同じエンジンの previewUse、10-27 オーナー「打つ前の箱のカード」も)。手の無い箱・打てない手は無し */
const cardDoomed = computed((): readonly string[] => { const d = s.data.value, it = sample.value, h = props.box.hand; if (!d || !it || !h) return []; try { return previewUse(d, it, h.currency, h.omens, { essence: true })?.change ?? []; } catch { return []; } });
const cardItem = computed(() => sampled.value?.item ?? null);
/** ヒネコラで持っている所は枠を紫に (S-39、開発版だけ。11-05 オーナー「枠を紫にしようかヒネコラで持ってる挙動」): hold = ヒネコラの結果の箱 (手は「持つ」)、seenOut = そこに持った手の結果の箱 */
const hold = computed(() => holdsAt(t.doc.value, props.box.id));
const seenOut = computed(() => foreseenAt(t.doc.value, props.box.id));
/** 持った手に当たりが無い (狙い無し = 全部ハズレ、S-39。11-05 ブラック「画面で『狙いを ☑ して』と分かるように」) */
const allMiss = computed(() => noHitHeld(t.doc.value, props.box.id));
const cardTags = computed(() => sampled.value?.tags ?? null);
/** 要確認 (古い版・壊れたレシピで読めなかった所、tree-migrate) の文 */
const CHECK_PART = { out: ["結果の種類", "result kind"], aim: ["狙い", "target"], hand: ["打つ手", "craft"], link: ["矢印の先", "link"] } as const;
const checkTitle = computed(() => (props.box.check ?? []).map((k) => tr(CHECK_PART[k][0], CHECK_PART[k][1])).join(" · "));
// 外れ・狙いが消えたの箱の「カオススパム」の近道は 10-25 に消した (オーナー「ハズレMODついた時の枠の中カオススパムっておかしいな消してくれ戻るボタンだけでしょ」。
// 外れの箱の道は ↩ 戻る と ＋ で枝を足すだけ、当たるまでは手を足す棚のカオススパムオーブで選ぶ)

/** 結果ごとの名前・色・印 (tree-names.ts の OUT_LOOK、まとめた札と同じ) */
const kind = computed(() => OUT_LOOK[props.box.out]);
/** 「エッセンスと同じ MOD (同格以上)」の箱 (S-33e ⑥、ボタンで 統合 / 新しいツリー を切り替える) */
const sameHi = computed(() => props.box.out === "blocked" && props.box.junkKey === SAME_HI);
/** 同格以上の箱の 2 つのボタン (点いている方 = 今の選び、HI_OFF = 選んでいない方のグレー、S-33e ⑥) */
const HI_ROW = "flex min-w-0 shrink-0 gap-0.5", HI_BTN = "nodrag h-6 shrink-0 !whitespace-nowrap rounded ring-1 px-0.5 text-[10.5px]", HI_OFF = "ring-white/15 text-sim-body opacity-45 hover:opacity-80", HI_ON_MERGE = "ring-cyan-300/80 bg-cyan-400/20 text-cyan-100", HI_ON_OWN = "ring-amber-300/80 bg-amber-400/20 text-amber-100";
/** 枠の上の線に乗る題 (tree-names の headOf) */
/** ヒネコラのハズレ (当たり以外をまとめた箱、S-39) は「ハズレ (打たない)」 */
// 同じ枠へまとめた箱も 11-11 から親の真下に自分の題で描く (S-66。前はまとめ先の題に「 / 」で並べた)
const head = computed(() => {
  if (props.box.seen) return tr("ハズレ (打たない)", "Miss (not used)");
  // 帯で見せる枠の頭 (S-65c ⑫、11-10 オーナー「上のその枠にはMODレベル事設定みたいな名前で」)
  if (props.bands?.length) return tr("MOD レベルごとの設定", "Settings per mod level");
  return headOf(props.box, t.aimShort);
});
/** 打たない枠のハズレ (ヒネコラで持つ削減を打たない、S-39 ②b) */
const skipped = computed(() => !!props.box.seen && !!(props.box.parent && t.doc.value.boxes[props.box.parent]?.hand?.noUse));
/** ここへまとめた (描かない) 箱の数 = ヒネコラのハズレ箱の「当たり以外 n 通り」(tree-merge-open の mergedInto) */
const joinedIn = computed(() => mergedInto(t.doc.value, props.box.id));
/** どの帯から来たか (削減の帯の結果の箱、11-11 オーナー追い 6。線を 1 つの札に入れても箱で読めるように) */
const fromBands = computed(() => bandsInto(t.doc.value, props.box.id, mergedAway));
/** 乗せた時の題の全文 (当たりは MOD の文そのまま) */
const headTitle = computed(() => (props.box.out === "hit" && props.box.aim ? boxAims(props.box).map(t.aimShort).join(" / ") : head.value));
/** 札に乗せた時の説明。割合 % は木の画面に一切出さない (S-76 撤回、11-06 オーナー「なにこのいらん注記指示したっけ」。本当の割合は 100 人回し) */
const legendTitle = computed(() => (props.box.out === "hit" && props.box.aim ? tr(`${headTitle.value} (押すと付く MOD を選び直す)`, `${headTitle.value} (click to change the mod)`) : headTitle.value));
/** 縁の色 (完成は明るい金) と光り方。選んだ・光らせた時は強く */
/** 失敗 (ここで終わり) の答え  */
const rgb = computed(() => (props.box.done === "fail" ? "224,112,122" : doneShown.value ? "242,210,122" : hold.value || seenOut.value ? "190,160,255" : kind.value.c));
/** 頭の札を大きく・結果の色で塗る (S-80c 案 A、スイッチ headTagsA) */
const headA = flag("headTagsA");
const neon = computed(() => {
  const strong = props.glow || props.selected || !!props.box.done;
  return { borderColor: `rgba(${rgb.value},${strong ? 0.95 : 0.55})`, boxShadow: `0 0 0 1px rgba(${rgb.value},${strong ? 0.5 : 0.18}), 0 0 ${strong ? 22 : 12}px rgba(${rgb.value},${strong ? 0.45 : 0.16})` };
});
const doneText = computed(() => (props.box.done === "fail" ? tr("失敗 (ここで終わり)", "Failed (ends here)") : props.box.done && !doneShown.value ? tr("完成 (結果が作れていない)", "Done (result can't be made)") : props.box.done ? tr("完成", "Done") : tr("完成にする", "Mark done")));
/** 下の＋を出す (完成の箱からも伸ばせる。手を付けると完成の印は外れ、同じ形の完成の箱もそこへ戻る、tree-merge の joinSameShape) */
// 戻りのある箱からも伸ばせる (手を付けると戻りは外れる = setHand。前は × で戻りを外さないと＋が出なかった、10-26 失敗時の挙動の洗い出しの 2)
// 戻り先 (↩ 戻る・再度挑戦) か「→ 同じ MOD 群のため統合」が付いた箱は次の手を付けない = 下と横の ＋ を出さない。× で外すと戻る (10-26 夜オーナー「共存はしないだろここ」)
/** ＋ を出す箱 = 手・分かれ目・↩・完成 / 失敗の無い箱 (S-54b・S-89b。完成を外せばまた出る。10-22 の「完成の箱からも伸ばせる」の残りを 11-04 に外した) */
const free = computed(() => !props.box.hand && !props.box.split && !props.box.back && !props.box.done);
/** 上の帯の「まとめる」で箱を選んでいる間の見え方 (use-tree-join.ts。箱ごとの「まとめる」は 10-26 に外した = 引いた時に箱の外へ溢れた、オーナー「拡大バグ」) */
const jl = computed(() => joinLook(t.doc.value, props.box.id));
const join = useTreeJoin();
/** 完成の狙いから外した MOD の当たりの箱 (tree-fail の orphanHits) */
const orphan = computed(() => props.box.out === "hit" && orphanHits(t.doc.value).includes(props.box.id));
/** 分かれ目の先の箱の文 = 親の分かれ目の行の条件 */
const branchText = computed(() => { const r = props.box.parent ? t.doc.value.boxes[props.box.parent]?.split?.find((x) => x.to === props.box.id) : null; return r ? splitWhenText(r.when) : ""; });
/** 押せる物を隠す時 (一望) */
const quiet = computed(() => !!props.viewOnly);
/** 箱の地を押した (ボタン以外) = 引っ張る用。押せない時 (一望・手) は Vue Flow に任せる (画面が動く / 押した判定) */
function down(e: PointerEvent): void {
  // 箱は並べ方が決めた位置に固定: つかんで動かさない (S-140、スイッチ boxFixed。押したまま動かすと画面の送りになる)
  if (quiet.value || flag("boxFixed") || (e.target as HTMLElement).closest("button")) return;
  emit("drag", e);
}
const k = computed(() => Math.max(1, props.inv ?? 1));
/** 箱の下の端 → ＋ の真ん中 = 手の札の真ん中と同じ (use-tree-edges の rowJy) */
/** 引いて見る時の ＋ の倍率の上限 (S-147c)。上限が無いと 0.2 倍で 5〜6.5 倍になり、＋ が段の間 (GAP_Y) に浮いて次の段に掛かった */
const PLUS_FAR_MAX = 3;
const plusK = computed(() => (props.plusFar != null ? Math.min(PLUS_FAR_MAX, props.plusFar) : k.value));
const PLUS_Y = LINE_Y + CHIP_HALF;
/** 倍率を上げても ＋ が枠に掛からない所まで下げる (半径 14 + 間 6) */
const plusY = computed(() => Math.max(PLUS_Y, 20 * plusK.value));
const plusOn = computed(() => free.value && (!quiet.value || !!props.plusFar) && !props.bands?.length);
/** 帯の上の字 (組の名前と次の削減で消える物、11-10 案 ③ の見本と同じ) */
const BAND_TXT: Record<string, [string, string, string, string]> = { lo: ["▼ 低い", "▼ Lower", "外れが消える", "miss goes"], eq: ["＝ 同じ", "= Same", "半々で消える", "50/50"], hi: ["▲ 高い", "▲ Higher", "狙いが消える", "keeper goes"] };
/** スタートの形は印で決まる (10-23 オーナー): フラクチャーの印 (✦ の候補)・＋の MOD・1 行目の文 */
// フラクチャー前から (start.from four) は印があっても白から始まるので、スタートの箱には印も＋の MOD も出さない (10-24 夜オーナー)
const marks = computed(() => (startsFractured(t.doc.value) ? fractureMarks(t.doc.value) : []));
const plusMods = computed(() => (startsFractured(t.doc.value) || !fractureMarks(t.doc.value).length ? startOf(t.doc.value).mods : []));
/** 2 行目: 印あり = ＋の数・外れの数、印なし = ほかの＋の数・レアリティ。ルーン・ベースの値段 */
const startRest = computed(() => {
  const st = startOf(t.doc.value), n = plusMods.value.length, junk = Math.max(0, START_JUNK - n);
  const parts = marks.value.length ? [n ? tr(`＋${n}`, `+${n}`) : "", junk ? tr(`外れ ${junk}`, `${junk} miss`) : ""] : [n > 1 ? tr(`ほか ${n - 1} つ`, `+${n - 1} more`) : "", n ? rarityName(startRarity(t.doc.value)) : ""];
  return [costLine.value, ...parts, st.runes?.length ? tr(`ルーン ${st.runes.length}`, `${st.runes.length} rune(s)`) : ""].filter(Boolean).join(" · ");
});
/** ベースの値段の 1 行 (始め方を比べた一番安い物、use-tree の baseCost。値段を入れていなければ出さない) */
const costLine = computed(() => {
  // フラクチャーの始め方を決めていれば必ず出す (済みから / 前から ×3、10-24 夜オーナー「選んだ方はスタートの箱に見える形で」)
  const f = fractureMarks(t.doc.value).length ? startOf(t.doc.value).from : undefined;
  const b = t.baseCost.value?.best, c = t.startChoice.value;
  const name = f === "four" && multiFracWhite(t.doc.value) ? tr("白ベースから", "white base") : f === "four" ? tr(`フラクチャー前から ${sureFracText(fractureMarks(t.doc.value).length).split(" ")[0]}`, `pre-fracture ${sureFracText(fractureMarks(t.doc.value).length).split(" ")[0]}`) : f === "fractured" ? tr("フラクチャー済みから", "fractured") : b?.short ?? "";
  const cost = f ? c?.cost ?? null : b?.cost ?? null;
  if (cost == null) return name;
  const n = cost >= 100 ? cost.toFixed(0) : cost >= 10 ? cost.toFixed(1) : cost.toFixed(2);
  return tr(`ベース ${n} 神 · ${name}`, `Base ${n} div · ${name}`);
});
const startTitle = computed(() => [
  ...(marks.value.length > 1 ? [tr("この中のどれか 1 つが固定される", "One of these gets fractured")] : []),
  ...marks.value.map((m) => `✦ ${t.startModLabel(m, true)}`), ...plusMods.value.map((m) => `＋ ${t.startModLabel(m)}`),
].join("\n") || tr("白 (ノーマル) から。押すと始まりの形", "From white (normal). Click for the start"));
/** 押せる物を倍率の逆数で戻す (origin = 大きくする軸。まとまりごとに端を軸にして、隣と重ならないように) */
const keep = (origin: string): Record<string, string> => (k.value > 1 ? { scale: String(k.value), transformOrigin: origin } : {});
/** 横に字が並ぶボタンは zoom で戻す (scale は場所を取らず、スタートの「ベース」が右の「フラクチャー済みから」に被った。11-07 オーナー「UI崩れてなかったっけスタートフラクチャー枠のとこ」) */
const keepFlow = computed((): Record<string, string> => (k.value > 1 ? { zoom: String(k.value) } : {}));

</script>


<template>
  <!-- 押せる物は全部 24px 以上 (2026-10-22 押しにくい所の洗い出し、notes/2026-10-22-tree-ui-click-audit.md) -->
  <!-- 押すは Vue Flow の箱の node-click、引っ張るは use-gesture.ts (Vue Flow の引っ張りは遊びの 5px 分が動きから抜けた)。
       引っ張りは pointerdown の既定の動きを止めるので Vue Flow の画面の送りは始まらない。nopan は付けない (付けると箱の上のホイールで拡大縮小されなかった)、中のボタンは nodrag -->
  <!-- 包み = 置き場だけ。中に枠 (data-tree-box) と、その下の枠の外に削減の帯 (S-65c ⑫、11-11 オーナー追い 8「線出すならこいつら枠の下がいいんじゃね」)。Vue Flow の箱の高さは帯まで -->
  <div data-tree-box-wrap :class="x === undefined ? 'relative' : 'absolute'" :style="{ ...(x === undefined ? {} : { left: `${x}px`, top: `${y}px` }), width: `${BOX_W}px` }">
  <div ref="rootEl" data-tree-box :data-box-id="box.id" :data-tree-swamp="swamp ? '' : undefined" :data-sample-note="sampled?.note || undefined" class="relative select-none rounded-xl border-[1.5px] bg-gradient-to-b from-[#1d1812] to-[#110e0a] px-2 py-1 text-[12px] transition-shadow"
    :class="['flex flex-col', viewOnly ? 'cursor-pointer' : flag('boxFixed') ? 'cursor-default' : 'cursor-grab', gray ? 'opacity-45 grayscale' : '', guide ? 'ring-2 ring-amber-300 !border-amber-200 !shadow-[0_0_24px_rgba(252,211,77,0.8)]' : '', settled ? 'ring-1 ring-amber-200/35' : '', glow ? 'ring-2 ring-amber-200/70' : '', issue && !jl && !hold && !seenOut ? '!border-rose-500 !shadow-[0_0_16px_rgba(244,63,94,0.55)]' : '', jl === 'no' ? 'opacity-25 grayscale' : jl ? '!border-amber-200 !shadow-[0_0_24px_rgba(252,211,77,0.8)]' : '']"
    :style="{ width: `${BOX_W}px`, minHeight: `${Math.max(BOX_H, fitH)}px`, ...neon, ...(swamp ? { outline: `${3 * swamp}px solid #38bdf8` } : {}) }" @pointerdown="down" @pointerenter="emit('hover', true)" @pointerleave="emit('hover', false)">
    <!-- 縮めている時 (k > 1) は押せる物の行を倍率分高くし、まだ「—」だけの数字の行は隠す (箱が小さくても押せる物どうしが重ならない) -->
    <!-- 題は枠の上の線に乗る札 (よくある枠の形。枠の中は割合・中身・戻り方だけ。10-26 オーナー「枠の上のところに●がついた みたいな形でよくある枠の形にしたら枠中ごちゃんなくていいよな」) -->
    <!-- 札は枠の上辺の横の真ん中 (10-26 夜オーナー「この ◎ が付いたとか外れとかは真ん中が良いな、枠の」。左上だと未定の ! と重なった)。割合 % は出さない (S-76 撤回) -->
    <!-- 札の横に箱の印 (未定の !・完成・狙いに無い・要らない・要確認)。前は枠の中の 1 行目にあり、その行が枠を下げていた (10-26 夜オーナー「上枠もっと広げれるじゃろ」) -->
    <button v-if="unset" type="button" data-tree-unset data-tree-issue class="nodrag absolute -right-2.5 -top-2.5 z-10 flex size-5 items-center justify-center rounded-full bg-rose-600 text-[12px] font-bold text-white shadow-[0_0_8px_rgba(244,63,94,0.7)] hover:bg-rose-500" :title="tr(`${issue} (押すと未設定の一覧)`, `${issue} (click for the list of unset boxes)`)" @click.stop="emit('issue')">!</button>
    <div class="absolute left-1/2 flex max-w-[calc(100%-16px)] -translate-x-1/2 items-center gap-1 whitespace-nowrap" :class="headA ? 'head-a bottom-[calc(100%-13px)] w-[calc(100%-16px)]' : '-top-[10px]'">
    <component :is="box.out === 'hit' && box.aim && !quiet ? 'button' : 'span'" :type="box.out === 'hit' && box.aim && !quiet ? 'button' : undefined" data-tree-legend class="nodrag flex min-w-0 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 text-[11px] font-bold leading-[18px]" :style="headA ? { color: '#111', borderColor: `rgb(${rgb})`, background: `rgb(${rgb})`, boxShadow: `0 0 10px rgba(${rgb},0.6)` } : { color: `rgb(${rgb})`, borderColor: `rgba(${rgb},0.55)`, background: '#15110c' }" :class="box.out === 'hit' && box.aim && !quiet ? 'hover:brightness-125' : 'pointer-events-none'" :title="legendTitle" @click.stop="box.out === 'hit' && box.aim && !quiet && emit('aim')"><Icon :name="kind.icon" class="size-3 shrink-0" /><span class="min-w-0 truncate">{{ head }}</span></component>
    <!-- 開いた時の組み直しで増えた箱 (前の形の木に無かった札、S-107・⑦19 案 A。保存しない) -->
    <span v-if="box.fresh" data-tree-fresh class="shrink-0 rounded-md border border-sky-400/60 bg-sim-panel px-1.5 text-[11px] font-bold leading-[18px] text-sky-300" :title="tr('今の決まりで組み直した時に、前の保存には無かった結果の箱。行き先を確かめて決める', 'A result box that was not in the saved recipe and appeared when rebuilt with the current rules. Check where it goes')">{{ tr("組み直しで増えた", "New after rebuild") }}</span>
    <span v-if="hold || seenOut" data-tree-foresee-frame class="shrink-0 rounded-md border border-violet-300/60 bg-[#15110c] px-1.5 text-[11px] font-bold leading-[18px] text-violet-200" :title="hold ? tr('ヒネコラで予見したアイテム: 次の手の結果が使う前に見える', 'Foreseen with Hinekora: the next craft’s result is visible before use') : tr('予見で見えた結果 (ヒネコラで持った手の結果)', 'A foreseen result (of the craft held after Hinekora)')">{{ hold ? tr("予見", "Foresight") : tr("予見の結果", "Foreseen") }}</span>
    <span v-for="lv in fromBands" :key="`from-${lv}`" data-tree-from-band :data-band-lv="lv" class="shrink-0 rounded-md px-1.5 text-[11px] font-bold leading-[18px] text-black" :style="{ background: `rgb(${lvLook(lv).rgb})` }" :title="tr(`${BAND_TXT[lv]![0]} の帯から来た結果`, `Result from the ${BAND_TXT[lv]![1]} band`)">{{ tr(BAND_TXT[lv]![0], BAND_TXT[lv]![1]) }}</span>
    <template v-if="box.out !== 'start'">
      <span v-if="orphan" data-tree-orphan class="shrink-0 rounded-sm bg-[#3a1418] px-1 text-[10px] font-bold leading-[18px] text-rose-200" :title="tr('この当たりの MOD は完成の狙いから外した (木からは消えていない。× で消すか、完成の MOD で狙いに戻す)', 'This hit mod was removed from the final targets (the box stays; remove it with × or add the target back)')">{{ tr("狙いに無い", "Not a target") }}</span>
      <span v-if="doneShown" class="shrink-0 rounded-full px-1.5 text-[10px] font-bold leading-[18px]" :class="box.done === 'fail' ? 'bg-rose-900/70 text-rose-100' : 'bg-[#3a2e14] text-amber-100'">{{ doneText }}</span>
      <span v-if="box.unwanted?.length" data-tree-unwanted class="shrink-0 rounded-sm bg-[#3a1418] px-1.5 text-[11px] font-bold leading-[18px] text-rose-200" :title="tr(`× (要らない) の印 ${box.unwanted.length} 個 (前の試し打ちで付けた物)`, `${box.unwanted.length} mod(s) marked × (unwanted, set in the old try-out)`)">× {{ box.unwanted.length }}</span>
      <button v-if="box.check?.length" type="button" data-tree-check class="nodrag shrink-0 rounded-sm bg-amber-500 px-1.5 text-[11px] font-bold leading-[18px] text-black hover:bg-amber-400" :class="quiet ? 'pointer-events-none' : ''" :title="tr(`読めなかった所: ${checkTitle} (直したら押して印を消す)`, `Couldn’t read: ${checkTitle} (fix it, then click to clear)`)" @click.stop="!quiet && emit('checked')">{{ tr("要確認", "Check") }}</button>
    </template>
    </div>
    <!-- 1 行目 (始まりの箱だけ: Lv・✎)。ほかの箱は 1 行目を無くし、✎ ✕ は下の行の右 (10-26 夜オーナー「今のバツの所にメモマークあれば上枠もっと広げれるじゃろ」) -->
    <div v-if="box.out === 'start'" class="mt-1.5 flex items-center gap-1.5" :style="{ height: `${24 * k}px` }">
      <!-- 始まりのアイテムレベルは見出しに (ベースの名前が長いと下の行で切れて見えない、10-22 靴) -->
      <span v-if="box.out === 'start'" class="shrink-0 text-[11px] opacity-70">{{ tr(`Lv ${t.doc.value.itemLevel}${t.doc.value.ilvlFit ? " 適正" : ""}`, `ilvl ${t.doc.value.itemLevel}${t.doc.value.ilvlFit ? " fit" : ""}`) }}</span>
      <span v-if="orphan" data-tree-orphan class="shrink-0 rounded-sm bg-rose-400/20 px-1 text-[10px] font-bold text-rose-200" :title="tr('この当たりの MOD は完成の狙いから外した (木からは消えていない。× で消すか、完成の MOD で狙いに戻す)', 'This hit mod was removed from the final targets (the box stays; remove it with × or add the target back)')">{{ tr("狙いに無い", "Not a target") }}</span>
      <span v-if="doneShown" class="shrink-0 rounded-full px-1.5 text-[10px] font-bold" :class="box.done === 'fail' ? 'bg-rose-400/25 text-rose-100' : 'bg-amber-300/25 text-amber-100'">{{ doneText }}</span>
      <span v-if="box.unwanted?.length" data-tree-unwanted class="shrink-0 rounded-sm bg-rose-400/20 px-1.5 text-[11px] font-bold text-rose-200" :title="tr(`× (要らない) の印 ${box.unwanted.length} 個 (前の試し打ちで付けた物)`, `${box.unwanted.length} mod(s) marked × (unwanted, set in the old try-out)`)">× {{ box.unwanted.length }}</span>
      <button v-if="box.check?.length" type="button" data-tree-check class="nodrag shrink-0 rounded-sm bg-amber-500/80 px-1.5 text-[11px] font-bold text-black hover:bg-amber-400" :class="quiet ? 'pointer-events-none' : ''" :title="tr(`読めなかった所: ${checkTitle} (直したら押して印を消す)`, `Couldn’t read: ${checkTitle} (fix it, then click to clear)`)" @click.stop="!quiet && emit('checked')">{{ tr("要確認", "Check") }}</button>
      <span class="flex-1" />
      <span class="flex items-center" :style="keep('right center')">
      <button v-if="!quiet" type="button" data-tree-note-mark class="nodrag flex size-6 items-center justify-center rounded hover:bg-white/10" :class="box.note ? 'text-amber-300' : 'text-white/30 hover:text-white/70'" :title="box.note || tr('メモを書く', 'Write a note')" @click.stop="emit('note')"><Icon name="pencil" class="size-3.5" /></button>
      <button v-if="removable && !quiet" type="button" data-tree-box-remove class="nodrag -mr-1 flex min-h-6 shrink-0 items-center justify-center rounded" :class="rm.is(box.id) ? 'whitespace-nowrap bg-rose-700 px-1.5 text-[11px] font-bold text-white hover:bg-rose-600' : 'size-6 opacity-60 hover:bg-white/10 hover:opacity-100'" :title="rmTitle" @click.stop="rm.arm(box.id) && emit('remove')"><template v-if="rm.is(box.id)">{{ tr(`下の ${rmCount} 箱ごと消す`, `Remove ${boxesEn(rmCount)}`) }}</template><Icon v-else name="x" class="size-3.5" /></button>
      </span>
    </div>

    <!-- 中身: 始まり = ベースとフラクチャー / 当たり = 付く MOD (右の＋に掛からない幅) -->
    <div class="min-w-0">
      <button v-if="box.out === 'hit' && !box.aim" type="button" class="nodrag block w-[calc(100%-14px)] truncate text-left text-[13px] hover:underline" :style="{ height: `${24 * k}px`, lineHeight: `${24 * k}px` }" :class="[box.aim ? 'text-[#c8c8ff]' : 'text-amber-300', quiet ? 'pointer-events-none' : '']" :title="t.boxAimLabel(box)" @click.stop="!quiet && emit('aim')">
        {{ box.aim ? t.boxAimLabel(box) : tr("＋ 付く MOD を選ぶ", "+ Pick the mod") }}
      </button>
      <p v-else-if="box.out === 'branch'" data-tree-branch-text class="truncate leading-6 text-teal-100" :title="branchText">{{ branchText }}</p>
      <!-- 失敗の箱は戻りがあれば「どこへ・なぜ」の文 (tree-fail の routeText、名前は下の札。10-26 オーナー「失敗時の挙動を作りこむ」の案 2)、無ければ何が起きたか -->
    </div>
    <!-- 今のアイテムの枠 (乗せた時のカードと同じ StageItemCard の MOD の行だけを箱の幅いっぱいに (縮めない)。10-26 オーナー「アイテム枠は個人的に好きやからそのままがいいなさっきの」「枠内はアイテムの形とその下に次どうするかくらいか？まとめるとかも別にアイテム枠の下とかに出したらええんちゃう」) -->
    <!-- 箱の流れの中に置き、MOD が多ければ箱が伸びる (切らない) -->
    <div v-if="cardItem" data-tree-box-card :class="[box.out === 'start' ? 'mt-0.5' : 'mt-3', box.out === 'start' && !quiet ? 'nodrag cursor-pointer rounded-md hover:brightness-110' : 'pointer-events-none']" :title="box.out === 'start' ? startTitle : undefined" @click.stop="box.out === 'start' && !quiet && emit('aim')">
      <div :style="{ width: `${CARD_W}px` }"><StageItemCard :row-group="null" :item="cardItem" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="CARD_W" compact mods-only with-title quality-row :row-tags="cardTags" :doomed="cardDoomed" /></div>
    </div>
    <!-- スタートのカードの下: 始め方・ベースの値段の 1 行と ＋MOD (スイッチ startCard。カードを押すと始まりの形の窓、ベースは名前の帯の下の文字から) -->
    <!-- 読むだけ (スマホの全体図・道、縮めて見ている時) はボタンを出さない (11-07 ux-review 19) -->
    <div v-if="box.out === 'start'" data-tree-start-under class="mt-1 flex min-w-0 items-center gap-1.5" :style="{ minHeight: `${24 * k}px` }">
      <button v-if="!quiet" type="button" data-tree-base class="nodrag shrink-0 rounded border border-white/15 px-1 text-[11px] leading-6 hover:bg-white/10" :style="keepFlow" :title="tr('ベースとアイテムレベルを選ぶ', 'Choose the base and item level')" @click.stop="emit('base')">{{ tr("ベース", "Base") }}</button>
      <p v-if="startRest" data-tree-start-rest class="min-w-0 flex-1 break-words text-balance text-[11px] leading-4 tracking-tight opacity-70" :title="t.baseCost.value?.best ? `${tr('一番安い始め方', 'Cheapest start')}: ${t.baseCost.value.best.label} · ${startRest}` : startRest">{{ startRest }}</p>
      <span v-else class="flex-1" />
      <button v-if="!quiet" type="button" data-tree-start-plus-btn class="nodrag flex h-6 shrink-0 items-center justify-center whitespace-nowrap rounded border border-white/15 px-1 text-[11px] leading-none hover:bg-white/10" :style="keepFlow" :title="marks.length ? tr('＋ MOD を足す (外れを差し替える)', '+ Add a mod (replaces a miss mod)') : tr('＋ 始まりに付いている MOD を足す', '+ Add a starting mod')" @click.stop="emit('aim')">{{ tr("＋MOD", "+Mod") }}</button>
    </div>


    <!-- 下の行: 戻りの矢印・完成 (下の＋は箱の外なので重ならない) -->
    <!-- 次どうするか (10-26 オーナー「アイテム枠は個人的に好きやからそのままがいいなさっきの」「枠内はアイテムの形とその下に次どうするかくらいか？まとめるとかも別にアイテム枠の下とかに出したらええんちゃう」) -->
    <!-- 切らずに折り返す (10-26 オーナー「枠いっぱいに表示していいのにこれ縮小してるから？拡大も欲しいんだけどそこ」「↩ 再度挑戦 · 3 …」が切れていた) -->
    <div ref="fillEl" class="flex-1" />
    <div class="mt-1 flex flex-wrap items-center gap-1 text-[12px]">
      <!-- 引いた時 (k > 1) は「分ける」を絵 1 つに (行の幅は (箱の幅 − 38) ÷ k で、文字だと「まとめる・↩・完成」が箱の外へ溢れた、10-26 オーナー「拡大バグ」) -->
      <!-- 同じ側の「どれか」の当たりの箱を MOD ごとに分ける / 分けた箱をまとめる (10-26 オーナー「戻るとかの所に分けるみたいな」) -->
      <span v-if="box.seen" data-tree-box-seen class="w-full text-violet-200/80">{{ skipped ? tr("打たない枠 · 手は使わずアイテムはこのまま", "Skipped frame · craft not used, item unchanged") : tr(`当たり以外 ${joinedIn + 1} 通り · 手は使わずアイテムはこのまま`, `${joinedIn + 1} non-hit result(s) · craft not used, item unchanged`) }}</span>
      <span v-if="allMiss" data-tree-foresee-nohit class="w-full text-amber-200" :title="tr('ヒネコラの後は狙いの結果だけ使い、ほかはハズレ (打たない)。手の札を押して狙いの MOD に ☑ する', 'After Hinekora only the targeted result is used; everything else is a miss. Click the craft and tick the target mods')">{{ tr("狙いを ☑ して (今は全部ハズレ)", "Tick a target (all results are misses now)") }}</span>
      <span v-if="box.hand && !bands?.length" data-tree-next-hand class="min-w-0 break-words" :class="hold ? 'text-violet-100' : 'text-amber-100/90'" :title="handLabel(box.hand)">{{ hold ? tr("持つ:", "Hold:") : "→" }} {{ handLabel(box.hand) }}</span>
      <span v-if="cantHand" data-tree-cant-hand class="w-full break-words text-rose-300">{{ tr(`この品には打てない手 (${cantHand})`, `Can't be used on this item (${cantHand})`) }}</span>
      <!-- 「エッセンスと同じ MOD (同格以上)」はボタン 2 つでいつも選ぶ: 選んでいる方が点き、選んでいない方はグレー (押すと切り替え)。既定は「エッセンスと同じ枠で扱う」。
           選んだ後も「→ n 段目へ進む」の文に置き換えない。下の行の頭に全幅の 1 行で、ほかの札と同じ高さ (S-33e ⑥、11-08 夜オーナー「ボタンは2つね…選んでないほうグレーアウト」「4段目へ進むとかに切り替えなくておk」「枠の中が整頓してくれ」) -->
      <span v-if="sameHi" data-tree-same-hi-pick :class="[HI_ROW, quiet ? 'pointer-events-none' : '', box.ownTree ? 'basis-full' : '']">
        <button type="button" data-tree-same-hi-merge :aria-pressed="!box.ownTree" :class="[HI_BTN, box.ownTree ? HI_OFF : HI_ON_MERGE]" :title="box.hand ? tr('足した手と下の箱を外し、エッセンスを打った当たりの箱と同じに扱う (1 つ戻すで戻せる)', 'Remove the added craft and the boxes below, and treat this box as the essence hit box (Undo restores)') : tr('この箱の人はエッセンスを打った当たりの箱と同じに扱う (既定)', 'Treat this box as the essence hit box (default)')" @click.stop="box.ownTree && t.edit((d) => setSameHiOwn(d, box.id, false))">{{ tr("エッセンスと同じ枠で扱う", "Treat as essence") }}</button>
        <button type="button" data-tree-same-hi-own :aria-pressed="!!box.ownTree" :class="[HI_BTN, box.ownTree ? HI_ON_OWN : HI_OFF]" :title="tr('エッセンスと同じ枠で扱うのをやめ、この箱から別の道を組む', 'Stop treating it as the essence result and build a separate route from this box')" @click.stop="!box.ownTree && t.edit((d) => setSameHiOwn(d, box.id, true))">{{ tr("新しいツリーを作る", "New tree") }}</button>
      </span>
      <template v-if="box.back && !sameHi">
        <!-- 戻り先の札: 乗せると戻りの線が出て戻り先が光る、押すとそこへ寄る (線は既定で引かない、10-22) -->
        <!-- × (戻りを外す) は文のすぐ右隣 (10-26 夜オーナー「バツはその行動のすぐ隣が良いな」。前は札が伸びて × は右端だった) -->
        <button type="button" data-tree-back-tag class="nodrag flex min-h-6 min-w-0 items-center rounded px-1 text-left text-cyan-200 hover:bg-cyan-400/15" :class="quiet ? '!pointer-events-none' : ''" :title="tr(`${backLabel} (押すとそこへ寄る)`, `${backLabel} (click to go there)`)"
          @pointerenter="emit('backHover', true)" @pointerleave="emit('backHover', false)" @focus="emit('backHover', true)" @blur="emit('backHover', false)" @click.stop="!quiet && emit('backGo')"><span class="min-w-0 break-words">{{ boxArrow(t.doc.value, box.id) }} {{ backLabel }}</span></button>
        <button v-if="!quiet" type="button" class="nodrag -mr-1 flex size-6 items-center justify-center rounded opacity-60 hover:bg-white/10 hover:opacity-100" :title="tr('戻りの矢印を外す', 'Remove the return arrow')" @click.stop="emit('clearBack')"><Icon name="x" class="size-3" /></button>
      </template>
      <template v-else-if="!box.back && !box.hand && !box.split && box.out !== 'start' && !quiet">
        <!-- 当たりの箱は「↩ 戻る」を出さない (次の手は＋、10-26 オーナー「狙いがついたら再挑戦おかしくね、狙いついたらシンプルにプラスボタンじゃない？」) -->
        <!-- 当たりの箱の次どうするか = まとめる (横にまとめられる箱がある時だけ。無ければ＋だけ、10-26 オーナー「そこに表示させるとしたらまとめるボタンかな、まぁ原則プレフィックスとサフィではまとめれないけどこれはルール化してもええよな」) -->
        <button v-if="(box.out === 'hit' || box.out === 'branch' || box.out === 'any')" type="button" class="nodrag h-6 shrink-0 whitespace-nowrap rounded border border-amber-400/40 px-1.5 text-amber-200 hover:border-amber-300" @click.stop="emit('done')" :title="doneText">{{ (k > 1 || (box.anyOf?.length ?? 0) > 1) && !box.done ? tr("完成", "Done") : doneText }}</button>
        <!-- 失敗 (ここで終わり): 外れ MOD が固定された枝など、続けない結果の箱 (10-28 オーナー) -->
        <button v-if="flag('treeFailAny') || (box.done !== 'main' && box.out !== 'hit' && box.out !== 'branch')" type="button" data-tree-box-fail class="nodrag h-6 shrink-0 whitespace-nowrap rounded border border-rose-400/40 px-1.5 text-rose-200 hover:border-rose-300" :title="tr('ここで終わり (回す時はここに着いた人を失敗と数える)', 'End here (runs that arrive here count as failed)')" @click.stop="emit('fail')">{{ box.done === "fail" ? tr("失敗を外す", "Undo fail") : tr("失敗", "Fail") }}</button>
        <!-- 外れ・狙いが消えたの行き先に一番使う手 (オーナー 10-22): 当たりのどれかが付くまでカオス -->
      </template>
      <!-- 右下: ✎ (メモ) と この当たりを消す ✕ (前は枠の中の 1 行目、10-26 夜オーナー「今のバツの所にメモマークあれば」) -->
      <span v-if="box.out !== 'start' && !quiet" class="ml-auto flex items-center" :style="keep('right center')">
        <button type="button" data-tree-note-mark class="nodrag flex size-6 items-center justify-center rounded hover:bg-white/10" :class="box.note ? 'text-amber-300' : 'text-white/30 hover:text-white/70'" :title="box.note || tr('メモを書く', 'Write a note')" @click.stop="emit('note')"><Icon name="pencil" class="size-3.5" /></button>
        <button v-if="removable" type="button" data-tree-box-remove class="nodrag -mr-1 flex min-h-6 shrink-0 items-center justify-center rounded" :class="rm.is(box.id) ? 'whitespace-nowrap bg-rose-700 px-1.5 text-[11px] font-bold text-white hover:bg-rose-600' : 'size-6 opacity-60 hover:bg-white/10 hover:opacity-100'" :title="rmTitle" @click.stop="rm.arm(box.id) && emit('remove')"><template v-if="rm.is(box.id)">{{ tr(`下の ${rmCount} 箱ごと消す`, `Remove ${boxesEn(rmCount)}`) }}</template><Icon v-else name="x" class="size-3.5" /></button>
      </span>
    </div>
    <!-- 操作 (分ける・まとめる。箱の一番下、上の帯の「まとめる」と同じ選び方へ入る入口) -->
    <div v-if="!quiet && ((box.anyOf?.length ?? 0) > 1 || (box.mergedOuts?.length ?? 0) > 0)" class="mt-1 flex items-center justify-end gap-1 text-[12px]">
      <button v-if="((box.anyOf?.length ?? 0) > 1 || (box.mergedOuts?.length ?? 0) > 0)" type="button" data-tree-split-any class="nodrag h-6 shrink-0 whitespace-nowrap rounded border border-amber-300/40 px-1.5 text-amber-100 hover:border-amber-200" :title="tr('MOD ごとに当たりの箱を分ける (先頭の MOD はこの箱のまま、続きの手もそのまま。1 つ戻すで戻せる)', 'Split into one hit box per mod (the first mod keeps this box and its next steps; Undo restores)')" @click.stop="t.edit((d) => (box.anyOf?.length ? splitAny(d, box.id) : splitOuts(d, box.id)))"><Icon v-if="k > 1" name="layers" class="size-3.5" /><template v-else>{{ tr("分ける", "Split") }}</template></button>
    </div>

    <!-- 動きをまとめる窓 (画面の真ん中の重ね窓。木の中に置くと寄り・位置で完成形の札や枠に隠れた): 同じ側の手の無い横の当たりを選んで、この箱にまとめる (10-26 オーナー「選択した枠にまとめる」) -->
    <!-- 「まとめる」で選んでいる間: 箱の上の押す面 (まとめられる箱は金に光り、ほかは灰色。まとめ先・選んだ = ✓ の札。10-26 オーナー「まとめれる枠光って他グレーアウトで見やすく」、use-tree-join.ts) -->
    <div v-if="jl" data-tree-join-hit :data-join="jl" :title="jl === 'no' ? joinNoWhy(t.doc.value, box.id) : undefined" class="nodrag absolute -inset-px z-20 flex items-start justify-end rounded-xl p-1" :class="jl === 'no' ? 'cursor-not-allowed' : jl === 'can' ? 'cursor-pointer hover:bg-amber-300/15' : 'cursor-pointer bg-amber-300/15 ring-[3px] ring-amber-100'" @pointerdown.stop @click.stop="join.toggle(box.id)">
      <span v-if="jl === 'anchor' || jl === 'picked'" class="rounded-full bg-amber-300 px-1.5 text-[11px] font-bold text-black" :style="keep('right top')">{{ jl === "anchor" ? tr("まとめ先", "Into") : "✓" }}</span>
    </div>
    <!-- 下の＋ = 次に打つ手。手を付けた時に札が出る位置 (線を伸ばした先、S-147c) に置く。枠から離すので引いた木でも箱に隠れない (11-02 オーナー「その位置にプラス置いてあげたら？」) -->
    <span v-if="plusOn" data-tree-next-stem class="pointer-events-none absolute left-1/2 top-full w-0.5 -translate-x-1/2 bg-amber-400/40" :style="{ height: `${plusY}px` }" />
    <!-- 予見の枠では ＋ でなく「進む」(次に持つ手を選ぶ、11-05 オーナー「UI的には進むがイイかもね＋じゃなくて」) -->
    <button v-if="plusOn" type="button" data-tree-next :data-tree-foresee-next="hold ? '' : undefined" :style="{ scale: String(plusK), top: `calc(100% + ${plusY}px)` }" class="nodrag absolute left-1/2 flex h-7 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full border-2 bg-[#1d1812]" :class="hold ? 'whitespace-nowrap border-violet-300/80 px-3 text-[12px] font-bold text-violet-100 hover:bg-violet-500/30' : 'w-7 border-amber-400/70 text-amber-200 hover:bg-amber-500/30'"
      :title="hold ? tr('予見したアイテムで次に持つ手を選ぶ (結果が見える)', 'Choose the next craft to hold on the foreseen item (its result is visible)') : tr('次に打つ手を足す。長押しで引っ張り箱の上で離すとその箱へ戻る', 'Add the next craft. Hold and drag onto a box to return there')" @pointerdown.stop="emit('plus', 'next', $event)" @click.stop><template v-if="hold">{{ tr("進む", "Next") }}</template><Icon v-else name="plus" class="size-4" /></button>
  </div>
  <!-- 削減の手前の枠の帯 (S-65c ⑫、11-10 オーナー案 ③): 枠ごとに 1 本、押すとその枠の手の窓 (未設定なら次に打つ手)。線は帯の真下から下へ。帯は枠の外のすぐ下 (追い 8) -->
  <div v-if="bands?.length" data-tree-bands class="mt-1 flex gap-1">
    <button v-for="x in bands" :key="x.id" type="button" data-tree-band :data-band-lv="x.lv" :data-box-id="x.id" class="nodrag relative flex min-w-0 flex-1 flex-col items-stretch gap-0.5 rounded-md border px-1 pb-0.5 pt-1 text-[11px] leading-4 hover:brightness-125"
      :class="[quiet && !bandOn ? 'pointer-events-none' : '', x.selected ? 'ring-2 ring-amber-200' : '']" :style="{ borderColor: `rgba(${lvLook(x.lv).rgb},0.75)`, background: `linear-gradient(rgba(${lvLook(x.lv).rgb},0.12), rgba(${lvLook(x.lv).rgb},0.12)), #15110c` }"
      :title="`${tr(lvLook(x.lv).tja, lvLook(x.lv).ten)} — ${x.hand ?? tr('未設定 (押して次に打つ手を選ぶ)', 'Unset (click to choose the next craft)')}`" @pointerdown.stop="(!quiet || bandOn) && emit('band', x.id, $event)" @click.stop>
      <span class="truncate rounded-sm text-center font-bold text-black" :style="{ background: `rgb(${lvLook(x.lv).rgb})` }">{{ tr(BAND_TXT[x.lv]![0], BAND_TXT[x.lv]![1]) }}</span>
      <span class="truncate text-center text-white/70">{{ tr(BAND_TXT[x.lv]![2], BAND_TXT[x.lv]![3]) }}</span>
      <!-- 手は帯の下の札 (絵と名前、11-11 オーナー「どこに何打って…一ミリも分からん」)。帯の中は未設定の時だけ -->
      <span v-if="!x.hand" data-tree-band-hand class="truncate text-center font-bold text-rose-300">{{ tr("未設定 ＋", "Unset +") }}</span>
      <span v-if="x.issue" data-tree-band-issue class="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white">!</span>
    </button>
  </div>
  </div>
</template>

<style scoped>
/* 頭の札の列を大きく (S-80c 案 A、スイッチ headTagsA)。列の子 (結果の名前・予見・来た帯…) をそろえて 15px */
.head-a > * { font-size: 15px !important; line-height: 26px !important; padding: 0 8px !important; border-radius: 7px !important; }
.head-a > * :deep(svg) { width: 16px; height: 16px; }
/* 入らない時は結果の名前の札を縮めず (「…」で切らない)、ほかの札を上の段へ回す (枠の上辺に乗るのは結果の名前の段) */
.head-a { flex-wrap: wrap-reverse; justify-content: center; row-gap: 3px; }
.head-a > [data-tree-legend] { flex-shrink: 0; max-width: 100%; }
</style>
