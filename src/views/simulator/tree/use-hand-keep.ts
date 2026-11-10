/**
 * use-hand-keep.ts — 手の窓の「残したい MOD」(TreeHandShelf.vue から分けた、2026-10-31)。消去 (S-27、10-27 オーナー) と では
 * 消去でない消える手 (カオス・パーフェクトエッセンス・満杯の側の骨、S-27d、10-31 朝オーナー決め 7)。
 * 消去の既定 = 全部消えてよい (☑ 無し)、消える手の既定 = 持っている狙い (☑ の印) 全部 = 今までの数え。候補が 1 つ以下なら聞かない (S-27b)
 */
import { computed, ref, watch, type Ref } from "vue";
import { craftStage as s } from "../../../state/craft-stage";
import type { PatchData, StageItem, StageMod } from "../../../services/craft-stage/engine";
import { effectOf } from "../../../services/simulator/tree/tree-hands";
import { aimedOfCard, outsideAimed, sampleAimed } from "../../../services/simulator/tree/tree-judge";
import { fractureMarks } from "../../../services/simulator/tree/tree-model";
import { stoneAims } from "../../../services/simulator/tree/tree-veil";
import { aimKey, type Aim, type Hand } from "../../../services/simulator/tree/tree-model";
import { isSwapEssenceKey } from "../../../services/simulator/tree/tree-keep";
import { keepAskOf, keepChoicesOf, keepDefaultOf } from "./tree-hand-plan";
import { aimOpts, targetsOf } from "../../../services/simulator/tree/tree-sample";
import { isAimMod } from "../../../services/simulator/tree/tree-aim";
import { useTree } from "./use-tree";
import { modText } from "../../../i18n/lang";
import { keepablesOf } from "./tree-row-tags";
import { aimedList } from "../../../services/simulator/tree/tree-miss";

const aimOn = (d: PatchData, m: StageMod, g: Aim): boolean => isAimMod(m, targetsOf(d, [g]), aimOpts(d));
export function useHandKeep(o: { boxId: string; current: Hand | null; item: Ref<StageItem | null>; held: Ref<string | null>; omens: Ref<string[]>; cardOf: (it: StageItem) => StageItem }) {
  const t = useTree();
  /** 消去 (全部消えてよい = 消去の箱を並べる、全部は残せない) か */
  const isRemove = computed(() => !!o.held.value && effectOf(o.held.value) === "remove");
  /** パーフェクトエッセンス (付く MOD が決まった入れ替え): ☑ しなかった MOD も外れにせず、☑ が無ければ消えた MOD ごとに枝 (S-29 のエッセンスの枝、11-07) */
  const isSwap = computed(() => isSwapEssenceKey(o.held.value));
  /** 比べる相手 (削減の差し替えで見る欲しい MOD) = カードの見本の ☑ の印の札 (枠を作る所・猿の口 planPick と同じ) */
  const wanted = (d: PatchData, it: StageItem): ReturnType<typeof aimedList> => aimedList(d, t.doc.value, aimedNow(d, it));
  const choices = computed(() => { const d = s.data.value, it = o.item.value, h = o.held.value; return d && it && h ? keepChoicesOf(d, it, h, o.omens.value, wanted(d, it)) : []; });
  /**
   * 残したい MOD を聞くか = この品の乱数の外れを付きうる段に差し替えて当てた結果で、消えうる MOD が 2 つ以上 (S-27d の頭の 1 本、11-10 オーナー「3つともおｋ」)。
   * 1 つ以下は確定で消える = ☑ も 2 ページ目も出さず、結果は 1 箱 (光のお告げ + 冒涜 1 つなど、S-27b)。削減で枠が 2 つ以上に分かれる時もこの数えで聞く (前は別の数え whittleSplit)
   */
  const ask = computed(() => { const d = s.data.value, it = o.item.value, h = o.held.value; return !!d && !!it && !!h && keepAskOf(d, it, h, o.omens.value, wanted(d, it)); });
  /** カードの見本の ☑ の印 (箱のカードと同じ見本、S-82) */
  const aimedNow = (d: PatchData, it: StageItem | null): ReadonlySet<string> => (it && aimedOfCard(d, t.doc.value, o.boxId, it)) || sampleAimed(d, t.doc.value, o.boxId, 1);
  /**
   * ☑ で選べる候補 = 消えうる MOD のうち外れ MOD 以外 (☑ の印 + 付けた完成形に無いエッセンスでまだ外れでない物、keepablesOf)。外れ MOD は選べない
   * (S-27b、11-07 オーナー「残したいMODにハズレMODは選択できないようにさせてくれ意味わからんから」、11-08「ハズレMOD以外は…選択できるように」)。
   * 聞くか (ask)・全部は残せない (toggle) は外れも含めた choices で数える (削減の「標的 2 つ以上で聞く」も外れを数える)
   */
  const picks = computed(() => {
    const d = s.data.value, it = o.item.value;
    if (!d || !it) return [];
    const am = new Set([...aimedNow(d, it), ...keepablesOf(d, t.doc.value, o.boxId, it)]);
    return choices.value.filter((c) => am.has(c.mod.modId));
  });
  /** 残したい MOD の欄を出すか = 聞く手で、選べる狙いが 1 つ以上 (0 なら欄を出さず全部消えてよい) */
  const show = computed(() => ask.value && picks.value.length > 0);
  /** 消える手の既定 = 持っている狙い (カードの見本の ☑ の印)。消去の既定は全部消えてよい (S-27。完成形に無いエッセンスの MOD は外れなので残す側に入れない = S-33c、11-07) */
  const defaults = (): string[] => {
    const d = s.data.value;
    if (!d || isRemove.value) return [];
    return keepDefaultOf(choices.value, aimedNow(d, o.item.value), stoneAims(d, t.doc.value)).map(aimKey);
  };
  /** 消去でない消える手で、候補が 1 つ (確定で消える = 聞かない) か (S-27f) */
  const lone = computed(() => !isRemove.value && !ask.value && choices.value.length === 1);
  /** この手で消えない狙いの MOD (☑ 固定の行、S-27e。✦ は出さない。候補を聞く時と、候補 1 つの消える手 = S-27f) */
  const fixed = computed((): StageMod[] => {
    const d = s.data.value, it = o.item.value, h = o.held.value;
    if (!d || !it || !h || !(ask.value || lone.value)) return [];
    const am = aimedNow(d, it), stay = new Set(outsideAimed(d, t.doc.value, { currency: h, omens: o.omens.value, catalyst: null, quality: 0 }, am, it));
    const goals = [...(t.doc.value.memoAims ?? [])].filter((g) => stay.has(g.modId) && !fractureMarks(t.doc.value).some((f) => f.modId === g.modId));
    return [...it.prefixes, ...it.suffixes].filter((m) => !m.fractured && !choices.value.some((c) => c.mod.modId === m.modId) && goals.some((g) => aimOn(d, m, g)));
  });
  const checked = ref<string[]>((o.current?.keep ?? []).map(aimKey));
  /** 自分で触ったか (持ち替えると既定に戻る)。前の手で残したい MOD を決めていればそれ */
  let touched = !!o.current?.keep;
  watch(o.held, () => { touched = false; });
  watch(choices, () => { if (!touched) checked.value = defaults(); }, { immediate: true });
  const aims = computed((): Aim[] => picks.value.filter((c) => checked.value.includes(aimKey(c.aim))).map((c) => c.aim));
  function toggle(a: Aim): void {
    const k = aimKey(a), was = [...checked.value]; touched = true;
    // 消去は全部の候補を残せないので、最後の 1 つを押したら前に ☑ した物から移す (S-27b)
    const full = isRemove.value && !was.includes(k) && was.length >= choices.value.length - 1;
    checked.value = was.includes(k) ? was.filter((x) => x !== k) : [...(full ? was.slice(1) : was), k];
  }
  function none(e: Event): void { touched = true; checked.value = []; (e.target as HTMLInputElement).checked = true; }
  const text = (m: StageMod): string => { const it = o.item.value ? o.cardOf(o.item.value) : null; return modText((it ? [...it.prefixes, ...it.suffixes].find((x) => x.modId === m.modId) : null) ?? m); }; // 値はカードと同じ (cardOf、10-28 モンキー見た目 1: 欄 94% / カード 96%)
  /** 選べるのは狙いだけなので一覧の字はいつも MOD の名前 (前は乱数の外れを「外れ MOD」の字で並べた、S-83) */
  const label = (c: { aim: Aim; mod: StageMod }): string => text(c.mod);
  /** この手で消えない MOD の行の字も値はカードと同じ (木の数値は既定で段の下限、S-202 ②。前は元の品の値で、欄 27% / カード 25% と割れた) */
  const fixedLabel = (m: StageMod): string => text(m);
  /**
   * 聞かないが欄は出す = 候補 1 つの消える手で、消えない狙いがある時 (S-27f、11-07 オーナー「残したいMODってのでまぁデフォでチェック欲しいね 一応ね」)。
   * ☑ 固定の行だけを見せ、打ち方・保存 (Hand.keep) は変えない
   */
  const fixedOnly = computed(() => lone.value && fixed.value.length > 0);
  return { isRemove, isSwap, choices, picks, show, fixed, ask, fixedOnly, checked, aims, toggle, none, label, fixedLabel };
}
export type HandKeep = ReturnType<typeof useHandKeep>;
