/**
 * use-hand-keep.ts — 手の窓の「残したい MOD」(TreeHandShelf.vue から分けた、2026-10-31)。消去 (S-27、10-27 オーナー) と、スイッチ keepAll では
 * 消去でない消える手 (カオス・パーフェクトエッセンス・満杯の側の骨、S-27d、10-31 朝オーナー決め 7)。
 * 消去の既定 = 全部消えてよい (☑ 無し)、消える手の既定 = 持っている狙い (☑ の印) 全部 = 今までの数え。候補が 1 つ以下なら聞かない (S-27b)
 */
import { computed, ref, watch, type Ref } from "vue";
import { craftStage as s } from "../../../state/craft-stage";
import type { StageItem, StageMod } from "../../../services/craft-stage/engine";
import { effectOf } from "../../../services/simulator/tree/tree-hands";
import { sampleAimed } from "../../../services/simulator/tree/tree-judge";
import { aimKey, type Aim, type Hand } from "../../../services/simulator/tree/tree-model";
import { keepAskOf, keepChoicesOf, keepDefaultOf } from "./tree-hand-plan";
import { boxTagsOf } from "./tree-row-tags";
import { useTree } from "./use-tree";
import { modText, tr } from "../../../i18n/lang";
import { flag } from "../../../web/release-flags";

export function useHandKeep(o: { boxId: string; current: Hand | null; item: Ref<StageItem | null>; held: Ref<string | null>; omens: Ref<string[]>; cardOf: (it: StageItem) => StageItem; warnIfBelow: (back: () => void) => void }) {
  const t = useTree();
  /** 消去 (全部消えてよい = 消去の箱を並べる、全部は残せない) か */
  const isRemove = computed(() => !!o.held.value && effectOf(o.held.value) === "remove");
  const choices = computed(() => { const d = s.data.value, it = o.item.value, h = o.held.value; return d && it && h && (isRemove.value || flag("keepAll")) ? keepChoicesOf(d, it, h, o.omens.value) : []; });
  /** 残したい MOD を聞くか = 消えうる MOD が 2 つ以上 (1 つ以下は確定で消える = ☑ も 2 ページ目も出さず、結果は 1 箱。光のお告げ + 冒涜 1 つなど、S-27b) */
  const ask = computed(() => { const d = s.data.value, it = o.item.value, h = o.held.value; return !!d && !!it && !!h && keepAskOf(d, it, h, o.omens.value); });
  /** 消える手の既定 = 持っている狙い (この箱の見本 1 の ☑ の印) */
  const defaults = (): string[] => { const d = s.data.value; return d && !isRemove.value ? keepDefaultOf(choices.value, sampleAimed(d, t.doc.value, o.boxId, 1)).map(aimKey) : []; };
  const checked = ref<string[]>((o.current?.keep ?? []).map(aimKey));
  /** 自分で触ったか (持ち替えると既定に戻る)。前の手で残したい MOD を決めていればそれ */
  let touched = !!o.current?.keep;
  watch(o.held, () => { touched = false; });
  watch(choices, () => { if (!touched) checked.value = defaults(); }, { immediate: true });
  const aims = computed((): Aim[] => choices.value.filter((c) => checked.value.includes(aimKey(c.aim))).map((c) => c.aim));
  function toggle(a: Aim): void {
    const k = aimKey(a), was = [...checked.value]; touched = true;
    checked.value = was.includes(k) ? was.filter((x) => x !== k) : [...was, k];
    o.warnIfBelow(() => { checked.value = was; });
  }
  function none(e: Event): void { const was = [...checked.value]; touched = true; checked.value = []; (e.target as HTMLInputElement).checked = true; o.warnIfBelow(() => { checked.value = was; }); }
  /** 行の名前は外れの MOD を「外れ MOD (名前)」とカードと揃える (10-27 夕モンキー 9)。決め方もカードの札と同じ (完成の狙いの範囲の値でも道で付いていなければ外れ、10-28 モンキー 7、スイッチ boxShape) */
  const isGoalMod = (a: Aim): boolean => (t.doc.value.memoAims ?? []).some((g) => g.modId === a.modId);
  const junk = (c: { aim: Aim; mod: StageMod }): boolean => (flag("boxShape") && s.data.value && o.item.value ? boxTagsOf(s.data.value, t.doc.value, o.boxId, o.item.value).get(c.mod.modId)?.tone === "bad" : !isGoalMod(c.aim));
  const text = (m: StageMod): string => { const it = o.item.value ? o.cardOf(o.item.value) : null; return modText((it ? [...it.prefixes, ...it.suffixes].find((x) => x.modId === m.modId) : null) ?? m); }; // 値はカードと同じ (cardOf、10-28 モンキー見た目 1: 欄 94% / カード 96%)
  // 外れは「外れ MOD」だけ (中身は教えない、S-82。10-28 夜オーナー「別にここのチェックでも教えなくていいハズレはハズレよ」、スイッチ boxShape)
  const label = (c: { aim: Aim; mod: StageMod }): string => (junk(c) ? (flag("boxShape") ? tr("外れ MOD", "Miss mod") : tr(`外れ MOD (${text(c.mod)})`, `Miss mod (${text(c.mod)})`)) : text(c.mod));
  /** 消去は全部の候補を残す ☑ はできない (消える MOD が無くなる = 消去が打てない。☑ の無い候補が最後の 1 つなら押せない、S-27b)。消える手はできる (S-27d) */
  const last = (a: Aim): boolean => isRemove.value && !checked.value.includes(aimKey(a)) && aims.value.length >= choices.value.length - 1;
  const lastText = tr("全部の MOD は残せない (消える MOD が無くなる)", "You can't keep every mod (nothing would be removed)");
  return { isRemove, choices, ask, checked, aims, toggle, none, label, last, lastText };
}
export type HandKeep = ReturnType<typeof useHandKeep>;
