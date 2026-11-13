/**
 * tree-surface.ts — 描き面 (TreeCanvas) ごとの木を中の部品 (箱・打つ手の札・回した層) へ渡す口と、隠れた面を止める口 (S-09c、スイッチ tabKeep)。
 * 箱は前は今のタブの木 (use-tree の doc) を直に読んでいたので、面を残しても替えるたびに隠れた面の箱がほかのタブの木で数え直された。
 * 面ごとの木を provide し、箱は inject で読む (面の外 = 縮めた時のポップアップは今のタブの木のまま)
 */
import { inject, isVNode, provide, type ComponentInternalInstance, type EffectScope, type InjectionKey, type Ref, type VNode } from "vue";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { useTree } from "./use-tree";

export type SurfaceDoc = { doc: Ref<TreeDoc>; opened: Ref<number> };
const KEY: InjectionKey<SurfaceDoc> = Symbol("tree-surface");
export const provideSurfaceDoc = (s: SurfaceDoc): void => provide(KEY, s);
/** この面の木と開いた回数 (面の外では今のタブの物) */
export const useSurfaceDoc = (): SurfaceDoc => inject(KEY, null) ?? useTree();

function walk(n: VNode | null | undefined, f: (s: EffectScope) => void): void {
  if (!n) return;
  if (n.component) { eachScope(n.component, f); return; }
  if (Array.isArray(n.children)) for (const c of n.children) if (isVNode(c)) walk(c, f);
}
// scope は Vue の中の持ち物 (型に出ていない)。部品ごとに 1 つ、描き直しと watch と computed を束ねる
function eachScope(i: ComponentInternalInstance, f: (s: EffectScope) => void): void { f((i as unknown as { scope: EffectScope }).scope); walk(i.subTree, f); }
/**
 * 面とその中の部品を全部止める / 動かす (Vue 3.5 の EffectScope.pause)。止めている間に変わった物は動かした時に 1 回だけ数え直す
 * (値が同じなら描き直さない)。部品ごとの scope は親から切れているので木の下まで辿る
 */
export const pauseTree = (i: ComponentInternalInstance, on: boolean): void => eachScope(i, (s) => (on ? s.pause() : s.resume()));
