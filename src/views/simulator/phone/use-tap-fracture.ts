/**
 * use-tap-fracture.ts — スマホの形 (767px 以下) で「フラクチャーから」始める時、完成形のカードの MOD を押すとフラクチャー (✦) にする
 * (10-26 夜オーナー「スマホ版はフラクチャーのホットキー (右クリック) が無いから、MOD を押したらフラクチャーさせよう」
 * 「PC からもそういう挙動にできるようにしてくれ。スマホ仕様になったらクリックでフラクチャー」= 指の端末かどうかでなく画面の幅で決める)。
 * 印は 1 つだけ (押した MOD だけに付け、ほかは外す)。もう一度押すと外す。決め方は PC の TreeStartAsk の decide と同じ形 (1 回の編集、1 つ戻すで戻せる)
 */
import { computed } from "vue";
import { usePhone } from "../../../utils/use-phone";
import { tr } from "../../../i18n/lang";
import { migrateStart, startRarity, startsFractured, type Aim } from "../../../services/simulator/tree/tree-model";
import type { StageMod } from "../../../services/craft-stage/engine";
import { useTree } from "../tree/use-tree";

export function useTapFracture() {
  const t = useTree();
  const phone = usePhone();
  /** 押すとフラクチャーになる形 (スマホの幅で、スタートが「フラクチャーから」= 印があって 4 MOD からでない、か印を全部外した後も from が fractured) */
  const on = computed(() => phone.value && (startsFractured(t.doc.value) || t.doc.value.start?.from === "fractured"));
  const marked = computed(() => t.goals.value.find((a) => a.fractured) ?? null);
  /** カードの上の案内の 1 行 */
  const note = computed(() => {
    const m = marked.value;
    return m
      ? tr(`✦ ${t.aimShort(m)} をフラクチャーにしました (もう一度押すと外す)`, `✦ ${t.aimShort(m)} is fractured (tap it again to unmark)`)
      : tr("MOD を押すとフラクチャー (✦) にできます", "Tap a mod to make it fractured (✦)");
  });
  /** カードの MOD を押した (狙いでない MOD・冒涜の MOD は付けない。付いている印を外すのはよい) */
  function tap(modId: string, m?: StageMod): void {
    const g = t.goals.value.find((a) => a.modId === modId);
    if (!g || (m?.desecrated && !g.fractured)) return;
    const off = !!g.fractured;
    t.edit((d) => {
      const list: Aim[] = d.memoAims ?? [];
      for (const a of list) { if (!off && a.modId === modId) a.fractured = true; else delete a.fractured; }
      d.memoAims = list;
      migrateStart(d);
      d.start!.from = "fractured";
      d.start!.mods = d.start!.mods.filter((x) => !list.some((a) => a.fractured && a.modId === x.modId));
      d.start!.rarity = startRarity(d);
    });
  }
  return { on, note, tap };
}
