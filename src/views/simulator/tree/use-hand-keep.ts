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
import { midAims, stoneAims } from "../../../services/simulator/tree/tree-veil";
import { aimKey, type Aim, type Hand } from "../../../services/simulator/tree/tree-model";
import { keepAskOf, keepChoicesOf, keepDefaultOf } from "./tree-hand-plan";
import { boxTagsOf, chosenMod } from "./tree-row-tags";
import { aimOpts, targetsOf } from "../../../services/simulator/tree/tree-sample";
import { isAimMod } from "../../../services/simulator/tree/tree-aim";
import { useTree } from "./use-tree";
import { modText, tr } from "../../../i18n/lang";

const aimOn = (d: PatchData, m: StageMod, g: Aim): boolean => isAimMod(m, targetsOf(d, [g]), aimOpts(d));
export function useHandKeep(o: { boxId: string; current: Hand | null; item: Ref<StageItem | null>; held: Ref<string | null>; omens: Ref<string[]>; cardOf: (it: StageItem) => StageItem }) {
  const t = useTree();
  /** 消去 (全部消えてよい = 消去の箱を並べる、全部は残せない) か */
  const isRemove = computed(() => !!o.held.value && effectOf(o.held.value) === "remove");
  const choices = computed(() => { const d = s.data.value, it = o.item.value, h = o.held.value; return d && it && h ? keepChoicesOf(d, it, h, o.omens.value, t.goals.value) : []; });
  /** 残したい MOD を聞くか = 消えうる MOD が 2 つ以上 (1 つ以下は確定で消える = ☑ も 2 ページ目も出さず、結果は 1 箱。光のお告げ + 冒涜 1 つなど、S-27b) */
  const ask = computed(() => { const d = s.data.value, it = o.item.value, h = o.held.value; return !!d && !!it && !!h && keepAskOf(d, it, h, o.omens.value, t.goals.value); });
  /** カードの見本の ☑ の印 (箱のカードと同じ見本、S-82) */
  const aimedNow = (d: PatchData, it: StageItem | null): ReadonlySet<string> => (it && aimedOfCard(d, t.doc.value, o.boxId, it)) || sampleAimed(d, t.doc.value, o.boxId, 1);
  /**
   * 消える手の既定 = 持っている狙い (カードの見本の ☑ の印)。消去の既定は全部消えてよいだが、持っている途中の狙いは残す側 (S-33c。全部の候補になる時は全部消えてよいのまま、S-27b。
   * 11-02 オーナー「狙いの完成に含めるって話途中で消えるけどやないとハズレMODあつかいやろ」)
   */
  const defaults = (): string[] => {
    const d = s.data.value;
    if (!d) return [];
    if (!isRemove.value) return keepDefaultOf(choices.value, aimedNow(d, o.item.value), stoneAims(t.doc.value)).map(aimKey);
    const am = aimedNow(d, o.item.value), mid = choices.value.filter((c) => am.has(c.aim.modId) && midAims(t.doc.value).some((a) => a.modId === c.aim.modId));
    return mid.length && mid.length < choices.value.length ? mid.map((c) => aimKey(c.aim)) : [];
  };
  /** 消去でない消える手で、候補が 1 つ (確定で消える = 聞かない) か (S-27f) */
  const lone = computed(() => !isRemove.value && !ask.value && choices.value.length === 1);
  /** この手で消えない狙いの MOD (☑ 固定の行、S-27e。✦ は出さない。候補を聞く時と、候補 1 つの消える手 = S-27f) */
  const fixed = computed((): StageMod[] => {
    const d = s.data.value, it = o.item.value, h = o.held.value;
    if (!d || !it || !h || !(ask.value || lone.value)) return [];
    const am = aimedNow(d, it), stay = new Set(outsideAimed(d, t.doc.value, { currency: h, omens: o.omens.value, catalyst: null, quality: 0 }, am, it));
    const goals = [...(t.doc.value.memoAims ?? []), ...midAims(t.doc.value)].filter((g) => stay.has(g.modId) && !fractureMarks(t.doc.value).some((f) => f.modId === g.modId));
    return [...it.prefixes, ...it.suffixes].filter((m) => !m.fractured && !choices.value.some((c) => c.mod.modId === m.modId) && goals.some((g) => aimOn(d, m, g)));
  });
  const checked = ref<string[]>((o.current?.keep ?? []).map(aimKey));
  /** 自分で触ったか (持ち替えると既定に戻る)。前の手で残したい MOD を決めていればそれ */
  let touched = !!o.current?.keep;
  watch(o.held, () => { touched = false; });
  watch(choices, () => { if (!touched) checked.value = defaults(); }, { immediate: true });
  const aims = computed((): Aim[] => choices.value.filter((c) => checked.value.includes(aimKey(c.aim))).map((c) => c.aim));
  function toggle(a: Aim): void {
    const k = aimKey(a), was = [...checked.value]; touched = true;
    // 消去は全部の候補を残せないので、最後の 1 つを押したら前に ☑ した物から移す (S-27b)
    const full = isRemove.value && !was.includes(k) && was.length >= choices.value.length - 1;
    checked.value = was.includes(k) ? was.filter((x) => x !== k) : [...(full ? was.slice(1) : was), k];
  }
  function none(e: Event): void { touched = true; checked.value = []; (e.target as HTMLInputElement).checked = true; }
  const text = (m: StageMod): string => { const it = o.item.value ? o.cardOf(o.item.value) : null; return modText((it ? [...it.prefixes, ...it.suffixes].find((x) => x.modId === m.modId) : null) ?? m); }; // 値はカードと同じ (cardOf、10-28 モンキー見た目 1: 欄 94% / カード 96%)
  /**
   * 乱数で付いた外れは「外れ MOD」(カードの札と同じ boxTagsOf で外れの行)。狙い・途中の狙い・選んで付けた MOD (エッセンス・発現済みの冒涜) は名前 (S-83。
   * 11-02 オーナー「狙ってないMODはカードでもハズレMODやろ…なんで乱数で出たハズレMODも消去持った時に出るんや」)
   */
  const junk = (c: { mod: StageMod }): boolean => {
    const d = s.data.value, it = o.item.value;
    if (!d || !it || chosenMod(d, c.mod)) return false;
    const tag = boxTagsOf(d, t.doc.value, o.boxId, o.cardOf(it)).get(c.mod.modId);
    return !!tag?.replace && tag.tone === "bad";
  };
  const label = (c: { aim: Aim; mod: StageMod }): string => (junk(c) ? tr("外れ MOD", "Miss mod") : text(c.mod));
  /**
   * 聞かないが欄は出す = 候補 1 つの消える手で、消えない狙いがある時 (S-27f、11-07 オーナー「残したいMODってのでまぁデフォでチェック欲しいね 一応ね」)。
   * ☑ 固定の行だけを見せ、打ち方・保存 (Hand.keep) は変えない
   */
  const fixedOnly = computed(() => lone.value && fixed.value.length > 0);
  return { isRemove, choices, fixed, ask, fixedOnly, checked, aims, toggle, none, label };
}
export type HandKeep = ReturnType<typeof useHandKeep>;
