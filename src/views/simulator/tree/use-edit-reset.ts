/**
 * use-edit-reset.ts — 今ある木の前提 (ベース・アイテムレベル・完成の狙い・✦・始め方・途中で消える MOD・完成形) を完成形の設定で変えたら、木はスタートだけに戻す
 * (S-67、10-28 夜オーナー「今あるツリーを編集っていみでMOD一覧に戻ってなにかしら変更加えるんだったらリセットが普通でしょ」「保存を促した方が良いね」、スイッチ resetOnEdit)。
 * 前は始め方をフラクチャー済みから白に変えても前の木 (高貴なオーブ (完全) の手) が残り、ノーマルに高貴を打つ木になった。
 * 完成形の設定を開いた時の木を覚え、出る時 (決めた・← ツリーに戻る・× / Esc) に前提が変わっていて手のある木なら「保存して変える / 保存せず変える / やめる」を聞く。
 * やめる = 開いた時の木へ戻して設定の画面に残る。手の無い木は聞かずに出る
 */
import { nextTick, ref } from "vue";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { currentTreeRecipe, overwriteTreeRecipe, saveTreeRecipe, setCurrentTreeRecipe } from "../../../state/simulator/tree-recipes";
import { flag } from "../../../web/release-flags";
import { autoName } from "./tree-save";
import type { useTree } from "./use-tree";

const hasHand = (d: TreeDoc): boolean => Object.keys(d.boxes).length > 1 || !!d.boxes.start?.hand;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
/** 木の前提 (これが変わると木の中の手と見本が合わなくなる物) */
const premiseOf = (d: TreeDoc): string => JSON.stringify([d.base, d.itemLevel, !!d.ilvlFit, d.memoAims ?? [], d.start ?? null, d.wayMods ?? [], d.goal ?? null]);

/**
 * 開いた時の木 (窓どうしで受け渡す: 始まりの形の窓の「0 完成形の設定で印を変える →」は確かめを通らずに完成形の設定へ移るので、
 * 前の窓で覚えた木をそのまま使う。出た = 続きをした時に空にする)
 */
let kept: { before: TreeDoc | null; premise: string } | null = null;

export function useEditReset(t: ReturnType<typeof useTree>) {
  const on = flag("resetOnEdit");
  let before: TreeDoc | null = null, premise = "";
  /** 確かめを出している間の続き (出た後にする事) と、消える箱の数 */
  const ask = ref<null | { next: () => void; boxes: number }>(null);
  /** 完成形の設定を開いた時の木を覚える */
  function remember(): void {
    if (kept) { before = kept.before; premise = kept.premise; return; }
    const d = t.doc.value;
    before = hasHand(d) ? clone(d) : null;
    premise = premiseOf(d);
    kept = { before, premise };
  }
  /** 出る前に: 前提が変わっていて手のある木なら聞く (聞いた時は false) */
  function leave(next: () => void): void {
    const d = t.doc.value;
    if (!on || !before || !hasHand(d) || premiseOf(d) === premise) { kept = null; next(); return; }
    ask.value = { next, boxes: Object.values(before.boxes).filter((b) => b.out !== "start" && b.out !== "pass").length };
  }
  function answer(kind: "save" | "drop" | "cancel"): void {
    const a = ask.value, old = before;
    ask.value = null;
    if (!a || !old) return;
    if (kind === "cancel") {
      // 開いた時の木へ戻す (設定の画面に残る)
      t.edit((d) => { for (const k of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[k]; Object.assign(d, clone(old)); });
      return;
    }
    if (kind === "save") {
      const cur = currentTreeRecipe.value;
      if (cur) overwriteTreeRecipe(cur.id, old); else saveTreeRecipe(autoName(old), old);
    }
    // 変えた後は名前なしの新しい木 (開いていたレシピへ次の保存で上書きしない、ベースを替える時と同じ)
    setCurrentTreeRecipe(null);
    t.reset();
    kept = null;
    a.next();
  }
  /** 窓が確かめを通らずに閉じた (レシピを開いた・貼り付けなど): 完成形の設定も始まりの形も閉じていれば覚えた木を捨てる */
  function forgetIfClosed(): void { void nextTick(() => { if (!t.goalPage.value && !t.startPage.value) kept = null; }); }
  return { ask, remember, leave, answer, forgetIfClosed };
}
