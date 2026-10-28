<!--
  TreeBox.vue — ツリーの箱 1 つ (2026-10-22 表面だけ)。始まり (フラクチャー) / 当たり / 外れ / 外れが消えた / 狙いが消えた。
  当たりは押すと MOD を選ぶ、横の＋で当たりを足す、下の＋で次の手。外れ・消えたの箱は消せない。見出しの鉛筆でメモ (10-22 試し打ちの欄を消したのでここから)。数字 (通った人数・ここまでの費用) は計算を繋ぐまで出さない
-->
<script setup lang="ts">
import { computed } from "vue";
import { flag } from "../../../web/release-flags";
import { useArmed } from "../../../utils/use-armed";
import { useDismiss } from "../../../utils/use-dismiss";
import { subtree } from "../../../services/simulator/tree/tree-model";
import Icon from "../../../components/ui/Icon.vue";
import { mergedInto } from "../../../services/simulator/tree/tree-merge-open";
import StageItemCard from "../../../components/for-share/item/StageItemCard.vue";
import { craftStage as s } from "../../../state/craft-stage";
import { shapeSampleOf } from "../../../services/simulator/tree/tree-sample-shape";
import { fixedValues } from "./tree-fixed-values";
import { previewUse } from "../../../services/emulator/emu-engine";
import { sideAims } from "./tree-side-aims";
import { treeRowTags } from "./tree-row-tags";
import { splitAny, splitOuts } from "../../../services/simulator/tree/tree-model-ops";
import { boxAims, BOX_H, BOX_W, fractureMarks, START_JUNK, startOf, startRarity, startsFractured, multiFracWhite, type TreeBox } from "../../../services/simulator/tree/tree-model";
import { tr } from "../../../i18n/lang";
import { jaTypeName } from "../../../i18n/item-names-ja";
import { useTree } from "./use-tree";
import { handLabel, headOf, OUT_LOOK, rarityName, splitWhenText, sureFracText } from "./tree-names";
import { pctText, useTreeOdds } from "./tree-odds";
import { orphanHits } from "./tree-fail";
import { joinCandidates, joinLook, joinMode, joinNoWhy, useTreeJoin } from "./use-tree-join";
import { sameHitsOf } from "../../../services/simulator/tree/tree-shape";
import { hitLoose } from "./tree-hand-plan";

const props = defineProps<{ box: TreeBox; /** 自分で置く時の位置 (Vue Flow の箱の中では無し = Vue Flow が置く) */ x?: number; y?: number; removable: boolean; picking: boolean; selected: boolean; backLabel: string; /** 縮めて見ている時: 押せる物を出さず、押すとそこへ寄る */ viewOnly?: boolean; /** 上の札の一覧で選んだ札を使っている */ glow?: boolean; /** ルート精査で見つかった穴 (文) */ issue?: string | null;
  /** 縮めた時の倍率の逆数 (押せる物だけこれで大きさを戻し、画面の上で 24px 以上を保つ。オーナー 10-22「縮めても押せる物は小さくならない」) */ inv?: number;
  /** 戻り先を選んでいる間のつなげない理由 (灰色にする。use-tree-link.ts) */ linkNo?: string | null }>();
const emit = defineEmits<{
  /** 箱を引っ張り始めた (押した所から。判定はページの use-gesture.ts) */
  drag: [e: PointerEvent]; aim: [];
  /** 穴の ! を押した (穴の一覧の窓を開く、10-25 オーナー) */
  issue: []; remove: []; back: []; clearBack: []; done: []; fail: []; note: [];
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
}>();
const t = useTree();
/**
 * × = この箱を作った手を消す (その手の結果の箱すべてと、その下も。親の箱は手が無い形に戻り、手を選び直せる)。1 回目で赤く「下の n 箱ごと消す」、
 * 3 秒のうちにもう一度で消す (1 つ戻すで戻せる)。どの箱にも (スタートは除く)。前の「この当たりを消す」(当たりの箱 1 つだけ) はこれにまとめた
 * (10-27 オーナー「途中で狙いの MOD を変えたい時の挙動が分かりづらい。枠の × ボタンを押して消せるように。消したら作ったカレンシーごと消える感じ」)
 */
/** 「下の n 箱ごと消す」は 8 秒待つ (3 秒では押す前に × に戻った、10-27 夕モンキー 5。スイッチ goalShape) */
// 時間では戻さず、枠 (この箱の ×) の外を押すか Esc で戻す (8 秒でもモンキーの台本の間に戻った、10-27 夜モンキー 2 回目 3。スイッチ armKeep)
const rm = useArmed(flag("armKeep") ? 2147483647 : flag("goalShape") ? 8000 : undefined);
if (flag("armKeep")) useDismiss(() => rm.is(props.box.id), [], rm.clear, { swallow: false, keep: `[data-box-id="${props.box.id}"] [data-tree-box-remove]` });
const rmCount = computed(() => { const d = t.doc.value, p = props.box.parent ? d.boxes[props.box.parent] : undefined; return p ? p.outs.reduce((n, o) => n + subtree(d, o).length, 0) : 0; });
const rmTitle = computed(() => tr(`この箱を作った手 (${(() => { const h = props.box.parent ? t.doc.value.boxes[props.box.parent]?.hand : null; return h ? handLabel(h) : ""; })()}) と、その結果の箱 ${rmCount.value} 個を消す (手を選び直せる)`, `Remove the craft that made this box and its ${rmCount.value} result box(es) (pick the craft again)`));
/** 箱の中の今のアイテムの枠 (乗せた時のカードと同じ部品を縮める。見本は箱の形に合う人、10-26 オーナー「枠は現状のアイテムの枠が表示してあげたら？いまカードで表示してる情報」) */
/** アイテムの枠の幅 (乗せた時のカードと同じ大きさ。縮めない、10-26 オーナー「枠いっぱいに表示していいのにこれ縮小してるから？拡大も欲しいんだけどそこ」) */
const CARD_W = BOX_W - 16;
/** この箱からまとめられるか (下の操作の行の「まとめる」の入口。押すとこの箱をまとめ先にして上の帯の「まとめる」と同じ選び方へ) */
/** 当たりの箱の「次の手が未定」は赤くせず静かな印だけ (足りない所には数える。10-26 オーナー「一旦整理してA」) */
const quietOpen = computed(() => props.box.out === "hit" && !!props.issue && /行き先を決めていない|Not decided|No next/.test(props.issue));
// 別の道の同じ状態の当たり (sameHitsOf) は、完成・次の手がある箱どうしでもまとめられる (10-26 夜オーナー「中身がある箱どうしは自動でせずまとめる」)
const canJoin = computed(() => (!props.box.hand && !props.box.done ? joinCandidates(t.doc.value, props.box.id).length > 0 : sameHitsOf(t.doc.value, props.box.id, hitLoose(t.doc.value)).length > 0));
const startJoin = (): void => { joinMode.value = { anchor: props.box.id, pick: [] }; };
/** MOD の値は木の中で揃える (貼った値か段の真ん中、tree-fixed-values。10-26 夜オーナー「ツリー内で同じ MOD じゃないと混乱する」) */
/** スタートの箱も結果の箱と同じアイテムカード (レアリティの色・名前・MOD の行、✦ はフラクチャーの印。10-28 夜オーナー「スタートもアイテムカードで表示させてくれツリー」、スイッチ startCard) */
const START_CARD = flag("startCard");
const sample = computed(() => (s.data.value && (props.box.out !== "start" || START_CARD) ? shapeSampleOf(s.data.value, t.doc.value, props.box.id) : null));
/** この箱の手で消える・入れ替わる候補の MOD (オレンジの文字。手の窓・エミュと同じエンジンの previewUse、10-27 オーナー「打つ前の箱のカード」も)。手の無い箱・打てない手は無し */
const cardDoomed = computed((): readonly string[] => { const d = s.data.value, it = sample.value, h = props.box.hand; if (!d || !it || !h) return []; try { return previewUse(d, it, h.currency, h.omens)?.change ?? []; } catch { return []; } });
const cardItem = computed(() => (s.data.value && sample.value ? fixedValues(s.data.value, t.doc.value, sample.value) : null));
const cardTags = computed(() => (s.data.value && cardItem.value ? treeRowTags(s.data.value, t.doc.value, props.box.unwanted ?? [], cardItem.value, props.box) : null));
/** 要確認 (古い版・壊れたレシピで読めなかった所、tree-migrate) の文 */
const CHECK_PART = { out: ["結果の種類", "result kind"], aim: ["狙い", "target"], hand: ["打つ手", "craft"], link: ["矢印の先", "link"] } as const;
const checkTitle = computed(() => (props.box.check ?? []).map((k) => tr(CHECK_PART[k][0], CHECK_PART[k][1])).join(" · "));
// 外れ・狙いが消えたの箱の「カオススパム」の近道は 10-25 に消した (オーナー「ハズレMODついた時の枠の中カオススパムっておかしいな消してくれ戻るボタンだけでしょ」。
// 外れの箱の道は ↩ 戻る と ＋ で枝を足すだけ、当たるまでは手を足す棚のカオススパムオーブで選ぶ)

/** 結果ごとの名前・色・印 (tree-names.ts の OUT_LOOK、まとめた札と同じ) */
const kind = computed(() => OUT_LOOK[props.box.out]);
/** 枠の上の線に乗る題 (tree-names の headOf) */
const head = computed(() => headOf(props.box, t.aimShort));
/** ここへまとめた (描かない) 箱の数 (案 A、tree-merge-open の mergedInto) */
const joinedIn = computed(() => mergedInto(t.doc.value, props.box.id));
/** 乗せた時の題の全文 (当たりは MOD の文そのまま) */
const headTitle = computed(() => (props.box.out === "hit" && props.box.aim ? boxAims(props.box).map(t.aimShort).join(" / ") : head.value));
/** この結果の箱に着く割合 (無ければ出さない、tree-odds.ts) */
const treeOdds = useTreeOdds();
const odds = computed(() => treeOdds.value.get(props.box.id) ?? null);
/** 札に乗せた時の説明 (割合は箱の中に出さずここへ、10-26 夜オーナー「ここ 1% と次の手って日本語いらない」) */
const legendTitle = computed(() => [
  props.box.out === "hit" && props.box.aim ? tr(`${headTitle.value} (押すと付く MOD を選び直す)`, `${headTitle.value} (click to change the mod)`) : headTitle.value,
  odds.value != null ? tr(`この手でこの結果になる割合 ${pctText(odds.value)} (1 手分)`, `Chance from the craft: ${pctText(odds.value)} (one use)`) : "",
].filter(Boolean).join("\n"));
/** 縁の色 (完成は明るい金) と光り方。選んだ・光らせた時は強く */
/** 失敗 (ここで終わり) の答え (スイッチ failEnd) */
const FAIL = flag("failEnd");
const rgb = computed(() => (props.box.done === "fail" ? "224,112,122" : props.box.done ? "242,210,122" : kind.value.c));
const neon = computed(() => {
  const strong = props.glow || props.selected || !!props.box.done;
  return { borderColor: `rgba(${rgb.value},${strong ? 0.95 : 0.55})`, boxShadow: `0 0 0 1px rgba(${rgb.value},${strong ? 0.5 : 0.18}), 0 0 ${strong ? 22 : 12}px rgba(${rgb.value},${strong ? 0.45 : 0.16})` };
});
const doneText = computed(() => (props.box.done === "fail" ? tr("失敗 (ここで終わり)", "Failed (ends here)") : props.box.done ? tr("完成", "Done") : tr("完成にする", "Mark done")));
/** 下の＋を出す (完成の箱からも伸ばせる。手を付けると完成の印は外れ、同じ形の完成の箱もそこへ戻る、tree-merge の joinSameShape) */
// 戻りのある箱からも伸ばせる (手を付けると戻りは外れる = setHand。前は × で戻りを外さないと＋が出なかった、10-26 失敗時の挙動の洗い出しの 2)
// 戻り先 (↩ 戻る・再度挑戦) か「→ 同じ MOD 群のため統合」が付いた箱は次の手を付けない = 下と横の ＋ を出さない。× で外すと戻る (10-26 夜オーナー「共存はしないだろここ」)
const free = computed(() => !props.box.hand && !props.box.split && !props.box.back);
/** 横の ＋ は足せる別の当たりがある時だけ (tree-side-aims。10-26 夜オーナー: もう付いている MOD しか無い箱が足された) */
const canSide = computed(() => { const d = s.data.value; if (!d || props.box.back) return false; const r = sideAims(d, t.doc.value, t.goals.value, props.box.id); return r === null || r.length > 0; });
/** 上の帯の「まとめる」で箱を選んでいる間の見え方 (use-tree-join.ts。箱ごとの「まとめる」は 10-26 に外した = 引いた時に箱の外へ溢れた、オーナー「拡大バグ」) */
const jl = computed(() => joinLook(t.doc.value, props.box.id));
const join = useTreeJoin();
/** 完成の狙いから外した MOD の当たりの箱 (tree-fail の orphanHits) */
const orphan = computed(() => props.box.out === "hit" && orphanHits(t.doc.value).includes(props.box.id));
/** 分かれ目の先の箱の文 = 親の分かれ目の行の条件 */
const branchText = computed(() => { const r = props.box.parent ? t.doc.value.boxes[props.box.parent]?.split?.find((x) => x.to === props.box.id) : null; return r ? splitWhenText(r.when) : ""; });
/** 押せる物を隠す時 (戻り先を選んでいる・一望) */
const quiet = computed(() => props.picking || !!props.viewOnly);
/** 箱の地を押した (ボタン以外) = 引っ張る用。押せない時 (戻り先を選ぶ・一望・手) は Vue Flow に任せる (画面が動く / 押した判定) */
function down(e: PointerEvent): void {
  if (quiet.value || (e.target as HTMLElement).closest("button")) return;
  emit("drag", e);
}
const k = computed(() => Math.max(1, props.inv ?? 1));
/** スタートの形は印で決まる (10-23 オーナー): フラクチャーの印 (✦ の候補)・＋の MOD・1 行目の文 */
// フラクチャー前から (start.from four) は印があっても白から始まるので、スタートの箱には印も＋の MOD も出さない (10-24 夜オーナー)
const marks = computed(() => (startsFractured(t.doc.value) ? fractureMarks(t.doc.value) : []));
const plusMods = computed(() => (startsFractured(t.doc.value) || !fractureMarks(t.doc.value).length ? startOf(t.doc.value).mods : []));
const startHead = computed(() => {
  const m = marks.value;
  if (m.length > 1) return tr(`✦ フラクチャー MOD ×${m.length}`, `✦ Fractured mod ×${m.length}`);
  if (m[0]) return `✦ ${t.startModLabel(m[0], true)}`;
  return plusMods.value[0] ? t.startModLabel(plusMods.value[0]) : tr("白 (ノーマル)", "White (normal)");
});
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

</script>


<template>
  <!-- 押せる物は全部 24px 以上 (2026-10-22 押しにくい所の洗い出し、notes/2026-10-22-tree-ui-click-audit.md) -->
  <!-- 押すは Vue Flow の箱の node-click、引っ張るは use-gesture.ts (Vue Flow の引っ張りは遊びの 5px 分が動きから抜けた)。
       引っ張りは pointerdown の既定の動きを止めるので Vue Flow の画面の送りは始まらない。nopan は付けない (付けると箱の上のホイールで拡大縮小されなかった)、中のボタンは nodrag -->
  <div data-tree-box :data-box-id="box.id" class="select-none rounded-xl border-[1.5px] bg-gradient-to-b from-[#1d1812] to-[#110e0a] px-2 py-1 text-[12px] transition-shadow"
    :class="[x === undefined ? 'relative' : 'absolute', picking || viewOnly ? 'cursor-pointer' : 'cursor-grab', picking ? (linkNo ? 'cursor-not-allowed opacity-35 grayscale' : 'ring-2 ring-cyan-400/70 hover:ring-cyan-300') : '', glow ? 'ring-2 ring-amber-200/70' : '', issue && !jl && !quietOpen ? '!border-rose-500 !shadow-[0_0_16px_rgba(244,63,94,0.55)]' : '', jl === 'no' ? 'opacity-25 grayscale' : jl ? '!border-amber-200 !shadow-[0_0_24px_rgba(252,211,77,0.8)]' : '']"
    :style="{ ...(x === undefined ? {} : { left: `${x}px`, top: `${y}px` }), width: `${BOX_W}px`, minHeight: `${BOX_H}px`, ...neon }" :title="picking && linkNo ? linkNo : undefined" @pointerdown="down" @pointerenter="emit('hover', true)" @pointerleave="emit('hover', false)">
    <!-- 縮めている時 (k > 1) は押せる物の行を倍率分高くし、まだ「—」だけの数字の行は隠す (箱が小さくても押せる物どうしが重ならない) -->
    <!-- 題は枠の上の線に乗る札 (よくある枠の形。枠の中は割合・中身・戻り方だけ。10-26 オーナー「枠の上のところに●がついた みたいな形でよくある枠の形にしたら枠中ごちゃんなくていいよな」) -->
    <!-- 札は枠の上辺の横の真ん中 (10-26 夜オーナー「この ◎ が付いたとか外れとかは真ん中が良いな、枠の」。左上だと未定の ! と重なった)。この結果に着く割合 (tree-odds.ts) は乗せた時の説明だけ -->
    <!-- 札の横に箱の印 (未定の !・完成・狙いに無い・要らない・要確認)。前は枠の中の 1 行目にあり、その行が枠を下げていた (10-26 夜オーナー「上枠もっと広げれるじゃろ」) -->
    <div class="absolute -top-[10px] left-1/2 flex max-w-[calc(100%-16px)] -translate-x-1/2 items-center gap-1 whitespace-nowrap">
    <component :is="box.out === 'hit' && box.aim && !quiet ? 'button' : 'span'" :type="box.out === 'hit' && box.aim && !quiet ? 'button' : undefined" data-tree-legend class="nodrag flex min-w-0 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 text-[11px] font-bold leading-[18px]" :style="{ color: `rgb(${rgb})`, borderColor: `rgba(${rgb},0.55)`, background: '#15110c' }" :class="box.out === 'hit' && box.aim && !quiet ? 'hover:brightness-125' : 'pointer-events-none'" :title="legendTitle" @click.stop="box.out === 'hit' && box.aim && !quiet && emit('aim')"><Icon :name="kind.icon" class="size-3 shrink-0" /><span class="min-w-0 truncate">{{ head }}</span></component>
    <!-- まとめた箱がある = 線が何本か入る (案 A、S-66、スイッチ mergeOpen) -->
    <span v-if="joinedIn" data-tree-merged-in class="shrink-0 rounded-md border px-1.5 text-[11px] font-bold leading-[18px]" :style="{ color: `rgb(${rgb})`, borderColor: `rgba(${rgb},0.55)`, background: '#15110c' }" :title="tr('同じ形の結果の箱をここへまとめた (線が何本かこの箱へ入る)', 'Results with the same shape were merged into this box')">{{ tr(`${joinedIn + 1} 本から合流`, `Merged from ${joinedIn + 1}`) }}</span>
    <template v-if="box.out !== 'start'">
      <span v-if="orphan" data-tree-orphan class="shrink-0 rounded-sm bg-[#3a1418] px-1 text-[10px] font-bold leading-[18px] text-rose-200" :title="tr('この当たりの MOD は完成の狙いから外した (木からは消えていない。× で消すか、完成の MOD で狙いに戻す)', 'This hit mod was removed from the final targets (the box stays; remove it with × or add the target back)')">{{ tr("狙いに無い", "Not a target") }}</span>
      <span v-if="box.done" class="shrink-0 rounded-full px-1.5 text-[10px] font-bold leading-[18px]" :class="box.done === 'fail' ? 'bg-rose-900/70 text-rose-100' : 'bg-[#3a2e14] text-amber-100'">{{ doneText }}</span>
      <span v-if="box.unwanted?.length" data-tree-unwanted class="shrink-0 rounded-sm bg-[#3a1418] px-1.5 text-[11px] font-bold leading-[18px] text-rose-200" :title="tr(`× (要らない) の印 ${box.unwanted.length} 個 (前の試し打ちで付けた物)`, `${box.unwanted.length} mod(s) marked × (unwanted, set in the old try-out)`)">× {{ box.unwanted.length }}</span>
      <button v-if="box.check?.length" type="button" data-tree-check class="nodrag shrink-0 rounded-sm bg-amber-500 px-1.5 text-[11px] font-bold leading-[18px] text-black hover:bg-amber-400" :class="quiet ? 'pointer-events-none' : ''" :title="tr(`読めなかった所: ${checkTitle} (直したら押して印を消す)`, `Couldn’t read: ${checkTitle} (fix it, then click to clear)`)" @click.stop="!quiet && emit('checked')">{{ tr("要確認", "Check") }}</button>
      <button v-if="issue && !quietOpen" type="button" data-tree-issue class="nodrag shrink-0 whitespace-nowrap rounded-sm bg-rose-600 px-1.5 text-[11px] font-bold leading-[18px] text-white hover:bg-rose-500" :title="tr(`${issue} (押すと足りない所の一覧)`, `${issue} (click for the list of what is missing)`)" @click.stop="emit('issue')">{{ /行き先を決めていない|最初の手を決めていない/.test(issue) && k === 1 ? tr("! 未定", "! Open") : "!" }}</button>
    </template>
    </div>
    <!-- 1 行目 (始まりの箱だけ: Lv・✎)。ほかの箱は 1 行目を無くし、✎ ✕ は下の行の右 (10-26 夜オーナー「今のバツの所にメモマークあれば上枠もっと広げれるじゃろ」) -->
    <div v-if="box.out === 'start'" class="mt-1.5 flex items-center gap-1.5" :style="{ height: `${24 * k}px` }">
      <!-- 始まりのアイテムレベルは見出しに (ベースの名前が長いと下の行で切れて見えない、10-22 靴) -->
      <span v-if="box.out === 'start'" class="shrink-0 text-[11px] opacity-70">{{ tr(`Lv ${t.doc.value.itemLevel}${t.doc.value.ilvlFit ? " 適正" : ""}`, `ilvl ${t.doc.value.itemLevel}${t.doc.value.ilvlFit ? " fit" : ""}`) }}</span>
      <span v-if="orphan" data-tree-orphan class="shrink-0 rounded-sm bg-rose-400/20 px-1 text-[10px] font-bold text-rose-200" :title="tr('この当たりの MOD は完成の狙いから外した (木からは消えていない。× で消すか、完成の MOD で狙いに戻す)', 'This hit mod was removed from the final targets (the box stays; remove it with × or add the target back)')">{{ tr("狙いに無い", "Not a target") }}</span>
      <span v-if="box.done" class="shrink-0 rounded-full px-1.5 text-[10px] font-bold" :class="box.done === 'fail' ? 'bg-rose-400/25 text-rose-100' : 'bg-amber-300/25 text-amber-100'">{{ doneText }}</span>
      <span v-if="box.unwanted?.length" data-tree-unwanted class="shrink-0 rounded-sm bg-rose-400/20 px-1.5 text-[11px] font-bold text-rose-200" :title="tr(`× (要らない) の印 ${box.unwanted.length} 個 (前の試し打ちで付けた物)`, `${box.unwanted.length} mod(s) marked × (unwanted, set in the old try-out)`)">× {{ box.unwanted.length }}</span>
      <button v-if="box.check?.length" type="button" data-tree-check class="nodrag shrink-0 rounded-sm bg-amber-500/80 px-1.5 text-[11px] font-bold text-black hover:bg-amber-400" :class="quiet ? 'pointer-events-none' : ''" :title="tr(`読めなかった所: ${checkTitle} (直したら押して印を消す)`, `Couldn’t read: ${checkTitle} (fix it, then click to clear)`)" @click.stop="!quiet && emit('checked')">{{ tr("要確認", "Check") }}</button>
      <!-- 当たりの箱の次の手が未定の時は印を出さない (下の＋だけ。前は「<1% ＋ 次の手」の文字が枠の上の札とかぶった、10-26 夜オーナー「ここ 1% と次の手って日本語いらない」) -->
      <button v-if="issue && !quietOpen" type="button" data-tree-issue class="nodrag shrink-0 whitespace-nowrap rounded-sm bg-rose-600 px-1.5 text-[11px] font-bold text-white hover:bg-rose-500" :title="tr(`${issue} (押すと足りない所の一覧)`, `${issue} (click for the list of what is missing)`)" @click.stop="emit('issue')">{{ /行き先を決めていない|最初の手を決めていない/.test(issue) && k === 1 ? tr("! 未定", "! Open") : "!" }}</button>
      <span class="flex-1" />
      <span class="flex items-center" :style="keep('right center')">
      <button v-if="!quiet" type="button" data-tree-note-mark class="nodrag flex size-6 items-center justify-center rounded hover:bg-white/10" :class="box.note ? 'text-amber-300' : 'text-white/30 hover:text-white/70'" :title="box.note || tr('メモを書く', 'Write a note')" @click.stop="emit('note')"><Icon name="pencil" class="size-3.5" /></button>
      <button v-if="removable && !quiet" type="button" data-tree-box-remove class="nodrag -mr-1 flex min-h-6 shrink-0 items-center justify-center rounded" :class="rm.is(box.id) ? 'whitespace-nowrap bg-rose-700 px-1.5 text-[11px] font-bold text-white hover:bg-rose-600' : 'size-6 opacity-60 hover:bg-white/10 hover:opacity-100'" :title="rmTitle" @click.stop="rm.arm(box.id) && emit('remove')"><template v-if="rm.is(box.id)">{{ tr(`下の ${rmCount} 箱ごと消す`, `Remove ${rmCount} box(es)`) }}</template><Icon v-else name="x" class="size-3.5" /></button>
      </span>
    </div>

    <!-- 中身: 始まり = ベースとフラクチャー / 当たり = 付く MOD (右の＋に掛からない幅) -->
    <div class="min-w-0">
      <template v-if="box.out === 'start' && !START_CARD">
        <!-- ベースとアイテムレベル: 押すと右の欄で選ぶ (10-22、前は金の指輪 ilvl 82 に固定) -->
        <button type="button" data-tree-base class="nodrag block w-full truncate text-left text-[13px] font-bold hover:underline" :class="quiet ? 'pointer-events-none' : ''" :style="{ height: `${24 * k}px`, lineHeight: `${24 * k}px` }" :title="tr('ベースとアイテムレベルを選ぶ', 'Choose the base and item level')" @click.stop="!quiet && emit('base')">
          {{ tr(jaTypeName(t.doc.value.base), t.doc.value.base) }}
        </button>
        <!-- 始まりの形 (押すとスタートの重ね窓、10-23 オーナー「印で決まる、スタートの枠に＋」): 1 行目は ✦ の候補 (2 つ以上は ×n、乗せると中身) か白、右の「＋MOD」で MOD を足す・外れを差し替え (手を足す下の丸い＋と見分ける、10-26 猿の 4) -->
        <div class="flex min-w-0 items-center gap-1" :style="{ height: `${24 * k}px` }">
          <button type="button" data-tree-start-mods class="nodrag block min-w-0 flex-1 truncate text-left hover:underline" :class="[marks.length ? 'text-mod-fractured' : 'text-[#c8c8ff]', quiet ? 'pointer-events-none' : '']" :style="{ lineHeight: `${24 * k}px` }" :title="startTitle" @click.stop="!quiet && emit('aim')">{{ startHead }}</button>
          <button v-if="!quiet" type="button" data-tree-start-plus-btn class="nodrag flex h-6 shrink-0 items-center justify-center whitespace-nowrap rounded border border-white/15 px-1 text-[11px] leading-none hover:bg-white/10" :style="keep('right center')" :title="marks.length ? tr('＋ MOD を足す (外れを差し替える)', '+ Add a mod (replaces a miss mod)') : tr('＋ 始まりに付いている MOD を足す', '+ Add a starting mod')" @click.stop="emit('aim')">{{ tr("＋MOD", "+Mod") }}</button>
        </div>
        <p v-if="startRest" data-tree-start-rest class="truncate text-[12px] opacity-70" :title="t.baseCost.value?.best ? `${tr('一番安い始め方', 'Cheapest start')}: ${t.baseCost.value.best.label} · ${startRest}` : startRest" :style="{ height: `${24 * k}px`, lineHeight: `${24 * k}px` }">{{ startRest }}</p>
      </template>
      <button v-else-if="box.out === 'hit' && !box.aim" type="button" class="nodrag block w-[calc(100%-14px)] truncate text-left text-[13px] hover:underline" :style="{ height: `${24 * k}px`, lineHeight: `${24 * k}px` }" :class="[box.aim ? 'text-[#c8c8ff]' : 'text-amber-300', quiet ? 'pointer-events-none' : '']" :title="t.boxAimLabel(box)" @click.stop="!quiet && emit('aim')">
        {{ box.aim ? t.boxAimLabel(box) : tr("＋ 付く MOD を選ぶ", "+ Pick the mod") }}
      </button>
      <p v-else-if="box.out === 'branch'" data-tree-branch-text class="truncate leading-6 text-teal-100" :title="branchText">{{ branchText }}</p>
      <!-- 失敗の箱は戻りがあれば「どこへ・なぜ」の文 (tree-fail の routeText、名前は下の札。10-26 オーナー「失敗時の挙動を作りこむ」の案 2)、無ければ何が起きたか -->
    </div>
    <!-- 今のアイテムの枠 (乗せた時のカードと同じ StageItemCard の MOD の行だけを箱の幅いっぱいに (縮めない)。10-26 オーナー「アイテム枠は個人的に好きやからそのままがいいなさっきの」「枠内はアイテムの形とその下に次どうするかくらいか？まとめるとかも別にアイテム枠の下とかに出したらええんちゃう」) -->
    <!-- 箱の流れの中に置き、MOD が多ければ箱が伸びる (切らない) -->
    <div v-if="cardItem" data-tree-box-card :class="[box.out === 'start' ? 'mt-0.5' : 'mt-3', box.out === 'start' && !quiet ? 'nodrag cursor-pointer rounded-md hover:brightness-110' : 'pointer-events-none']" :title="box.out === 'start' ? startTitle : undefined" @click.stop="box.out === 'start' && !quiet && emit('aim')">
      <div :style="{ width: `${CARD_W}px` }"><StageItemCard :item="cardItem" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="CARD_W" compact mods-only with-title :row-tags="cardTags" :doomed="cardDoomed" /></div>
    </div>
    <!-- スタートのカードの下: 始め方・ベースの値段の 1 行と ＋MOD (スイッチ startCard。カードを押すと始まりの形の窓、ベースは名前の帯の下の文字から) -->
    <div v-if="box.out === 'start' && START_CARD" data-tree-start-under class="mt-1 flex min-w-0 items-center gap-1" :style="{ minHeight: `${24 * k}px` }">
      <button type="button" data-tree-base class="nodrag shrink-0 rounded border border-white/15 px-1 text-[11px] leading-6 hover:bg-white/10" :class="quiet ? 'pointer-events-none' : ''" :style="keep('left center')" :title="tr('ベースとアイテムレベルを選ぶ', 'Choose the base and item level')" @click.stop="!quiet && emit('base')">{{ tr("ベース", "Base") }}</button>
      <p v-if="startRest" data-tree-start-rest class="min-w-0 flex-1 truncate text-[12px] opacity-70" :title="t.baseCost.value?.best ? `${tr('一番安い始め方', 'Cheapest start')}: ${t.baseCost.value.best.label} · ${startRest}` : startRest">{{ startRest }}</p>
      <span v-else class="flex-1" />
      <button v-if="!quiet" type="button" data-tree-start-plus-btn class="nodrag flex h-6 shrink-0 items-center justify-center whitespace-nowrap rounded border border-white/15 px-1 text-[11px] leading-none hover:bg-white/10" :style="keep('right center')" :title="marks.length ? tr('＋ MOD を足す (外れを差し替える)', '+ Add a mod (replaces a miss mod)') : tr('＋ 始まりに付いている MOD を足す', '+ Add a starting mod')" @click.stop="emit('aim')">{{ tr("＋MOD", "+Mod") }}</button>
    </div>


    <!-- 下の行: 戻りの矢印・完成 (下の＋は箱の外なので重ならない) -->
    <!-- 次どうするか (10-26 オーナー「アイテム枠は個人的に好きやからそのままがいいなさっきの」「枠内はアイテムの形とその下に次どうするかくらいか？まとめるとかも別にアイテム枠の下とかに出したらええんちゃう」) -->
    <!-- 切らずに折り返す (10-26 オーナー「枠いっぱいに表示していいのにこれ縮小してるから？拡大も欲しいんだけどそこ」「↩ 再度挑戦 · 3 …」が切れていた) -->
    <div class="mt-1 flex flex-wrap items-center gap-1 text-[12px]">
      <!-- 引いた時 (k > 1) は「分ける」を絵 1 つに (行の幅は (箱の幅 − 38) ÷ k で、文字だと「まとめる・↩・完成」が箱の外へ溢れた、10-26 オーナー「拡大バグ」) -->
      <!-- 同じ側の「どれか」の当たりの箱を MOD ごとに分ける / 分けた箱をまとめる (10-26 オーナー「戻るとかの所に分けるみたいな」) -->
      <span v-if="box.hand" data-tree-next-hand class="min-w-0 break-words text-amber-100/90" :title="handLabel(box.hand)">→ {{ handLabel(box.hand) }}</span>
      <template v-if="box.back">
        <!-- 戻り先の札: 乗せると戻りの線が出て戻り先が光る、押すとそこへ寄る (線は既定で引かない、10-22) -->
        <!-- × (戻りを外す) は文のすぐ右隣 (10-26 夜オーナー「バツはその行動のすぐ隣が良いな」。前は札が伸びて × は右端だった) -->
        <button type="button" data-tree-back-tag class="nodrag flex min-h-6 min-w-0 items-center rounded px-1 text-left text-cyan-200 hover:bg-cyan-400/15" :class="quiet ? '!pointer-events-none' : ''" :title="tr(`${backLabel} (押すとそこへ寄る)`, `${backLabel} (click to go there)`)"
          @pointerenter="emit('backHover', true)" @pointerleave="emit('backHover', false)" @focus="emit('backHover', true)" @blur="emit('backHover', false)" @click.stop="!quiet && emit('backGo')"><span class="min-w-0 break-words">{{ box.out === "hit" && t.doc.value.boxes[box.back]?.out === "hit" ? "→" : "↩" }} {{ backLabel }}</span></button>
        <button v-if="!quiet" type="button" class="nodrag -mr-1 flex size-6 items-center justify-center rounded opacity-60 hover:bg-white/10 hover:opacity-100" :title="tr('戻りの矢印を外す', 'Remove the return arrow')" @click.stop="emit('clearBack')"><Icon name="x" class="size-3" /></button>
      </template>
      <template v-else-if="!box.hand && !box.split && box.out !== 'start' && !quiet">
        <!-- 当たりの箱は「↩ 戻る」を出さない (次の手は＋、10-26 オーナー「狙いがついたら再挑戦おかしくね、狙いついたらシンプルにプラスボタンじゃない？」) -->
        <!-- 戻り先がまだ無い箱: 押すと戻り先を選ぶ (再度挑戦・n 段目へ戻る・始めに戻るなどは選ぶ帯で)。短い「↩ 戻る」・縮めた時の「↩」だけはやめた (10-27 オーナー「本番でまだ『戻る』になっている」、決まった言い方は選んだ後の札の「↩ n 段目へ戻る」) -->
        <button v-if="!box.done && box.out !== 'hit'" type="button" data-tree-back-pick class="nodrag min-h-6 shrink-0 rounded border border-cyan-400/40 px-1.5 text-left text-cyan-200 hover:border-cyan-300" :title="tr('戻り先を選ぶ (再度挑戦・既にある箱・始めに戻る)', 'Choose where to return (retry, an existing box, or the start)')" @click.stop="emit('back')">{{ tr("↩ 戻り先を選ぶ", "↩ Choose return") }}</button>
        <!-- 当たりの箱の次どうするか = まとめる (横にまとめられる箱がある時だけ。無ければ＋だけ、10-26 オーナー「そこに表示させるとしたらまとめるボタンかな、まぁ原則プレフィックスとサフィではまとめれないけどこれはルール化してもええよな」) -->
        <button v-if="box.out === 'hit' && canJoin" type="button" data-tree-box-join class="nodrag h-6 shrink-0 whitespace-nowrap rounded border border-amber-300/40 px-1.5 text-amber-100 hover:border-amber-200" :title="tr('この箱にまとめる (同じ側の横の当たりを選ぶ。プレとサフィはまとめない)', 'Merge into this box (pick same-side hits beside it; prefixes and suffixes are never merged)')" @click.stop="startJoin">{{ tr("まとめる", "Merge") }}</button>
        <button v-if="box.out === 'hit' || box.out === 'branch'" type="button" class="nodrag h-6 shrink-0 whitespace-nowrap rounded border border-amber-400/40 px-1.5 text-amber-200 hover:border-amber-300" @click.stop="emit('done')" :title="doneText">{{ (k > 1 || (box.anyOf?.length ?? 0) > 1) && !box.done ? tr("完成", "Done") : doneText }}</button>
        <!-- 失敗 (ここで終わり): 外れ MOD が固定された枝など、続けない結果の箱 (10-28 オーナー、スイッチ failEnd) -->
        <button v-if="FAIL && box.done !== 'main' && box.out !== 'hit' && box.out !== 'branch'" type="button" data-tree-box-fail class="nodrag h-6 shrink-0 whitespace-nowrap rounded border border-rose-400/40 px-1.5 text-rose-200 hover:border-rose-300" :title="tr('ここで終わり (回す時はここに着いた人を失敗と数える)', 'End here (runs that arrive here count as failed)')" @click.stop="emit('fail')">{{ box.done === "fail" ? tr("失敗を外す", "Undo fail") : tr("失敗", "Fail") }}</button>
        <!-- 外れ・狙いが消えたの行き先に一番使う手 (オーナー 10-22): 当たりのどれかが付くまでカオス -->
      </template>
      <!-- 右下: ✎ (メモ) と この当たりを消す ✕ (前は枠の中の 1 行目、10-26 夜オーナー「今のバツの所にメモマークあれば」) -->
      <span v-if="box.out !== 'start' && !quiet" class="ml-auto flex items-center" :style="keep('right center')">
        <button type="button" data-tree-note-mark class="nodrag flex size-6 items-center justify-center rounded hover:bg-white/10" :class="box.note ? 'text-amber-300' : 'text-white/30 hover:text-white/70'" :title="box.note || tr('メモを書く', 'Write a note')" @click.stop="emit('note')"><Icon name="pencil" class="size-3.5" /></button>
        <button v-if="removable" type="button" data-tree-box-remove class="nodrag -mr-1 flex min-h-6 shrink-0 items-center justify-center rounded" :class="rm.is(box.id) ? 'whitespace-nowrap bg-rose-700 px-1.5 text-[11px] font-bold text-white hover:bg-rose-600' : 'size-6 opacity-60 hover:bg-white/10 hover:opacity-100'" :title="rmTitle" @click.stop="rm.arm(box.id) && emit('remove')"><template v-if="rm.is(box.id)">{{ tr(`下の ${rmCount} 箱ごと消す`, `Remove ${rmCount} box(es)`) }}</template><Icon v-else name="x" class="size-3.5" /></button>
      </span>
    </div>
    <!-- 操作 (分ける・まとめる。箱の一番下、上の帯の「まとめる」と同じ選び方へ入る入口) -->
    <div v-if="!quiet && ((canJoin && box.out !== 'hit') || (box.anyOf?.length ?? 0) > 1 || (box.mergedOuts?.length ?? 0) > 0)" class="mt-1 flex items-center justify-end gap-1 text-[12px]">
      <button v-if="((box.anyOf?.length ?? 0) > 1 || (box.mergedOuts?.length ?? 0) > 0)" type="button" data-tree-split-any class="nodrag h-6 shrink-0 whitespace-nowrap rounded border border-amber-300/40 px-1.5 text-amber-100 hover:border-amber-200" :title="tr('MOD ごとに当たりの箱を分ける (先頭の MOD はこの箱のまま、続きの手もそのまま。1 つ戻すで戻せる)', 'Split into one hit box per mod (the first mod keeps this box and its next steps; Undo restores)')" @click.stop="t.edit((d) => (box.anyOf?.length ? splitAny(d, box.id) : splitOuts(d, box.id)))"><Icon v-if="k > 1" name="layers" class="size-3.5" /><template v-else>{{ tr("分ける", "Split") }}</template></button>
      <button v-if="canJoin && box.out !== 'hit' && !((box.anyOf?.length ?? 0) > 1 || (box.mergedOuts?.length ?? 0) > 0)" type="button" data-tree-box-join class="nodrag h-6 shrink-0 whitespace-nowrap rounded border border-amber-300/40 px-1.5 text-amber-100 hover:border-amber-200" :title="tr('この箱にまとめる (同じ形の横の箱を選ぶ)', 'Merge into this box (pick same-shape boxes beside it)')" @click.stop="startJoin"><Icon v-if="k > 1" name="layers" class="size-3.5" /><template v-else>{{ tr("まとめる", "Merge") }}</template></button>
    </div>

    <!-- 動きをまとめる窓 (画面の真ん中の重ね窓。木の中に置くと寄り・位置で完成形の札や枠に隠れた): 同じ側の手の無い横の当たりを選んで、この箱にまとめる (10-26 オーナー「選択した枠にまとめる」) -->
    <!-- 横の＋ = 当たりを足す (どれか 1 つが叶う) -->
    <button v-if="box.out === 'hit' && !quiet && canSide" type="button" data-tree-add-hit :style="k > 1 ? { ...keep('center'), top: 'calc(50% + 4px)' } : {}" class="nodrag absolute -right-4 top-1/2 flex size-7 -translate-y-1/2 touch-none items-center justify-center rounded-full border-2 border-amber-400/70 bg-[#1d1812] text-amber-200 hover:bg-amber-500/30"
      :title="tr('当たりを横に足す (どれか 1 つが叶えば当たり)。長押しで引っ張り箱の上で離すとその箱へつなぐ', 'Add another hit beside (any one counts). Hold and drag onto a box to link')" @pointerdown.stop="emit('plus', 'side', $event)" @click.stop><Icon name="plus" class="size-4" /></button>
    <!-- 「まとめる」で選んでいる間: 箱の上の押す面 (まとめられる箱は金に光り、ほかは灰色。まとめ先・選んだ = ✓ の札。10-26 オーナー「まとめれる枠光って他グレーアウトで見やすく」、use-tree-join.ts) -->
    <div v-if="jl" data-tree-join-hit :data-join="jl" :title="jl === 'no' ? joinNoWhy(t.doc.value, box.id) : undefined" class="nodrag absolute -inset-px z-20 flex items-start justify-end rounded-xl p-1" :class="jl === 'no' ? 'cursor-not-allowed' : jl === 'can' ? 'cursor-pointer hover:bg-amber-300/15' : 'cursor-pointer bg-amber-300/15 ring-[3px] ring-amber-100'" @pointerdown.stop @click.stop="join.toggle(box.id)">
      <span v-if="jl === 'anchor' || jl === 'picked'" class="rounded-full bg-amber-300 px-1.5 text-[11px] font-bold text-black" :style="keep('right top')">{{ jl === "anchor" ? tr("まとめ先", "Into") : "✓" }}</span>
    </div>
    <!-- 下の＋ = 次に打つ手 (箱の下の外。完成・戻るのボタンと重ならない) -->
    <button v-if="free && !quiet" type="button" data-tree-next :style="keep('center')" class="nodrag absolute -bottom-[34px] left-1/2 flex size-7 -translate-x-1/2 touch-none items-center justify-center rounded-full border-2 border-amber-400/70 bg-[#1d1812] text-amber-200 hover:bg-amber-500/30"
      :title="tr('次に打つ手を足す。長押しで引っ張り箱の上で離すとその箱へ戻る', 'Add the next craft. Hold and drag onto a box to return there')" @pointerdown.stop="emit('plus', 'next', $event)" @click.stop><Icon name="plus" class="size-4" /></button>
  </div>
</template>
