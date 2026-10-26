/**
 * use-tree-join.ts — ツリーの上で箱を選んで「まとめる」(10-26 オーナー「まとめるボタンで枠選ぶ形が良い、その時に説明でればいい」)。
 * 前は箱ごとの下の行に「まとめる」があり、引いた時に箱の外へ溢れた (オーナー「拡大バグ」)。今は上の帯の「まとめる」を押す → 1 つ目に押した箱がまとめ先、
 * 続けて同じ形の横の箱 (当たりは同じ側の当たり = joinableOf、外れ・狙いが消えたなどは同じ形 = joinableShapeOf) を押して選ぶ → 「まとめる」で 1 箱に。
 * 選べない箱は薄く。Esc・枠の外で取り消し (メモ feedback-click-outside-cancel)。スマホは結果の行の「動きをまとめる」の一覧のまま (PhoneOutRow)
 */
import { ref } from "vue";
import { absorbOuts, joinableOf, joinSide } from "../../../services/simulator/tree/tree-model-ops";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { joinableShapeOf } from "../../../services/simulator/tree/tree-shape";
import { sideGroup } from "./tree-hand-plan";
import { useTree } from "./use-tree";

/** 選んでいる間だけ (anchor = まとめ先、pick = 一緒にまとめる箱) */
export const joinMode = ref<{ anchor: string | null; pick: string[] } | null>(null);

/** その箱とまとめられる横の箱 */
export function joinCandidates(doc: TreeDoc, id: string): string[] {
  const b = doc.boxes[id];
  if (!b || b.out === "start") return [];
  if (b.out !== "hit") return joinableShapeOf(doc, id);
  const g = sideGroup();
  return g ? joinableOf(doc, id, g) : [];
}

/** 箱の今の見え方: anchor = まとめ先、picked = 選んだ、can = 押せる、no = 押せない (薄く) */
export type JoinLook = "anchor" | "picked" | "can" | "no";
export function joinLook(doc: TreeDoc, id: string): JoinLook | null {
  const m = joinMode.value;
  if (!m) return null;
  if (m.anchor === id) return "anchor";
  if (m.pick.includes(id)) return "picked";
  if (!m.anchor) return joinCandidates(doc, id).length ? "can" : "no";
  return joinCandidates(doc, m.anchor).includes(id) ? "can" : "no";
}

export function useTreeJoin() {
  const t = useTree();
  const start = (): void => { joinMode.value = { anchor: null, pick: [] }; };
  const cancel = (): void => { joinMode.value = null; };
  /** 箱を押した: まとめ先を決める / 選ぶ・外す。まとめ先をもう一度押すと選び直し */
  function toggle(id: string): void {
    const m = joinMode.value, look = joinLook(t.doc.value, id);
    if (!m || look === "no") return;
    if (look === "anchor") joinMode.value = { anchor: null, pick: [] };
    else if (!m.anchor) joinMode.value = { anchor: id, pick: [] };
    else joinMode.value = { anchor: m.anchor, pick: look === "picked" ? m.pick.filter((x) => x !== id) : [...m.pick, id] };
  }
  function apply(): void {
    const m = joinMode.value;
    joinMode.value = null;
    if (!m?.anchor || !m.pick.length) return;
    const anchor = m.anchor, ok = joinCandidates(t.doc.value, anchor).filter((x) => m.pick.includes(x));
    if (!ok.length) return;
    if (t.doc.value.boxes[anchor]?.out !== "hit") { t.edit((d) => absorbOuts(d, anchor, ok)); return; }
    const g = sideGroup();
    if (g) t.edit((d) => joinSide(d, anchor, g, ok));
  }
  return { start, cancel, toggle, apply };
}
