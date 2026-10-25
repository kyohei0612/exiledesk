/**
 * use-phone-quiz.ts — シミュのスマホ版の組み方 = 質問で進める形 (2026-10-25 オーナー「スマホだけ自動完成で作って ただ、自動完成はあくまでも補助ね」、スイッチ simPhone)。
 * 木は PC と同じ TreeDoc (use-tree)。質問 = 「残りの道」。答え = PC と同じ操作 (手を付ける applyPick・↩ 戻り先 setBack・完成 setDone)。
 * 質問は 2 種類: ① hand = この箱で何を打つ? (始まり・「次の手を決める」にした結果の箱・品質だけ上げた後) / ② outs = 手の結果ごとにどうする? (まだ答えていない結果の箱がある手)。
 * 同じ状態の箱があれば PC と同じく自動の矢印 (applyPick の中の linkSameShape) で閉じ、その道は聞かない。
 * 完成の狙いが全部そろう道の箱はスマホだけ自動で完成 (markDone、答えと同じ 1 手 = 1 つ戻すで一緒に戻る)。「次の手を決める」にした箱は自動で完成にしない
 * (完成の後も答え直せる。PC は今のまま枝分かれできる。10-25 にやめた PC の「自動の完成」とは別、決めはメモ sim-decisions)
 */
import { computed, ref } from "vue";
import { aimKey, setBack, setDone, type TreeBox, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { heldSets } from "../../../services/simulator/tree/tree-shape";
import { useTree } from "../tree/use-tree";
import { handLabel, outName } from "../tree/tree-names";
import { tr } from "../../../i18n/lang";

/** 答えの要る結果の箱か (手も戻りも完成も分かれ目も無い。始まり・品質だけの通り抜けは ① で聞く) */
export function isOpen(b: TreeBox): boolean {
  return b.out !== "start" && b.out !== "pass" && !b.hand && !b.back && !b.done && !b.split;
}
/** 始まりから辿った順 (上の段から、同じ段は左から)。質問の順番 */
export function walkOrder(d: TreeDoc): string[] {
  const out: string[] = [], seen = new Set<string>(), q = ["start"];
  while (q.length) {
    const id = q.shift()!;
    if (seen.has(id) || !d.boxes[id]) continue;
    seen.add(id); out.push(id);
    q.push(...d.boxes[id]!.outs);
  }
  return out;
}
/** その箱に着いた人が、完成の狙いを全部持っているか (道の当たりの組がどれも全部を含む。✦ の印は始めから付いている) */
export function completes(d: TreeDoc, id: string): boolean {
  const goals = (d.memoAims ?? []).filter((g) => !g.fractured);
  if (!goals.length) return false;
  const sets = heldSets(d, id);
  return sets.length > 0 && sets.every((s) => goals.every((g) => s.includes(aimKey(g))));
}
/** 始まりからその箱までの道 (箱の id の並び) */
export function pathOf(d: TreeDoc, id: string): string[] {
  const p: string[] = [];
  for (let x: string | null = id; x; x = d.boxes[x]?.parent ?? null) p.unshift(x);
  return p;
}
/** 自動で完成 (スマホだけ、補助): 答えの要る箱のうち、完成の狙いが全部そろう当たりの箱に完成の印。later = 「次の手を決める」にした箱 (付けない) */
export function markDone(d: TreeDoc, later: ReadonlySet<string>): void {
  for (const b of Object.values(d.boxes)) if ((b.out === "hit" || b.out === "branch") && isOpen(b) && !later.has(b.id) && completes(d, b.id)) setDone(d, b.id, "main");
}

export type Question = { kind: "hand"; id: string } | { kind: "outs"; id: string };
/** ① で聞く箱か (手がまだ無い始まり・品質だけの通り抜け・「次の手を決める」にした結果の箱) */
const needsHand = (b: TreeBox, later: ReadonlySet<string>): boolean => !b.hand && !b.split && (b.out === "start" || (b.out === "pass" && !b.back) || (later.has(b.id) && isOpen(b)));
/** ② で聞く手か (結果の箱のどれかがまだ答えていない) */
const needsOuts = (d: TreeDoc, b: TreeBox, later: ReadonlySet<string>): boolean => !!b.hand && b.outs.some((o) => { const c = d.boxes[o]; return !!c && isOpen(c) && !later.has(o); });
/** 残りの質問 (質問の順) */
export function questionsOf(d: TreeDoc, later: ReadonlySet<string>): Question[] {
  const out: Question[] = [];
  for (const id of walkOrder(d)) {
    const b = d.boxes[id]!;
    if (needsOuts(d, b, later)) out.push({ kind: "outs", id });
    else if (needsHand(b, later)) out.push({ kind: "hand", id });
  }
  return out;
}

/** 「次の手を決める」にした箱 (木の外、このページの間だけ。開き直すと答えていない結果は ② でもう一度聞く) */
const later = ref<string[]>([]);
/** 一覧から選んで答え直している質問 (無ければ残りの先頭) */
const focus = ref<Question | null>(null);

export function usePhoneQuiz() {
  const t = useTree();
  const laterSet = computed(() => new Set(later.value));
  const questions = computed(() => questionsOf(t.doc.value, laterSet.value));
  /** 今の質問 (一覧で選んだ物、無ければ残りの先頭。無ければ全部決まった) */
  const current = computed((): Question | null => {
    const f = focus.value;
    const fb = f ? t.doc.value.boxes[f.id] : null;
    // 1 つ戻すで手が消えた箱の ② は ① で聞く
    if (f && fb) return f.kind === "outs" && !fb.hand ? { kind: "hand", id: f.id } : f;
    return questions.value[0] ?? null;
  });
  /** 答えた箱の数 (手・戻り・完成のどれかがある箱) */
  const answered = computed(() => Object.values(t.doc.value.boxes).filter((b) => !!b.hand || !!b.back || !!b.done).length);
  /** 答える = 木を 1 手で組み替え、同じ 1 手で自動の完成も付ける (1 つ戻すで一緒に戻る) */
  function answer(fn: (d: TreeDoc) => void): void {
    t.edit((d) => { fn(d); markDone(d, laterSet.value); });
    later.value = later.value.filter((id) => !!t.doc.value.boxes[id] && isOpen(t.doc.value.boxes[id]!));
  }
  /** 結果の箱を「次の手を決める」にする (戻り・完成は外す。後で ① で聞く) */
  function setLater(id: string): void {
    if (!later.value.includes(id)) later.value = [...later.value, id];
    const b = t.doc.value.boxes[id];
    if (b && (b.back || b.done)) answer((d) => { setBack(d, id, null); setDone(d, id, null); });
  }
  /** 別の木を開いた = 木の外の印 (次の手を決める・一覧で選んだ質問) を空に */
  function reset(): void { later.value = []; focus.value = null; }
  /** 「次の手を決める」を外す (② でもう一度聞く) */
  function unLater(id: string): void { later.value = later.value.filter((x) => x !== id); }
  /** 戻りの矢印 (同じ手をもう一度 = 親の箱・始めから = start・ほかの箱) */
  function setReturn(id: string, to: string): void {
    later.value = later.value.filter((x) => x !== id);
    answer((d) => { setDone(d, id, null); setBack(d, id, to); });
  }
  function setFinished(id: string): void {
    later.value = later.value.filter((x) => x !== id);
    answer((d) => { setBack(d, id, null); setDone(d, id, "main"); });
  }
  /** 結果の箱の今の答え */
  function stateOf(id: string): "later" | "back" | "done" | "hand" | "open" {
    const b = t.doc.value.boxes[id];
    if (!b) return "open";
    if (b.hand || b.split) return "hand";
    if (b.done) return "done";
    if (b.back) return "back";
    return laterSet.value.has(id) ? "later" : "open";
  }

  /** ② の結果の箱 (品質だけ上げた後の通り抜けはその先の手の結果) */
  function outsOf(id: string): string[] {
    const d = t.doc.value, b = d.boxes[id];
    if (!b) return [];
    const pass = b.outs.length === 1 && d.boxes[b.outs[0]!]?.out === "pass" ? d.boxes[b.outs[0]!]! : null;
    return pass?.hand ? pass.outs : pass ? [] : b.outs;
  }
  /** ② の「決めた」= 答えていない結果は「次の手を決める」にして次の質問へ */
  function decide(id: string): void {
    for (const o of outsOf(id)) if (stateOf(o) === "open") setLater(o);
    focus.value = null;
  }
  /**
   * 箱の名前 (SimTreePage の boxLabel と同じ形)。当たりは道で揃った狙いを全部 (スマホは木が見えないので、同じ MOD の当たりの箱が見分けられるように)、
   * ほかは結果の名前 + 道で付いている狙い
   */
  function boxTitle(id: string): string {
    const b = t.doc.value.boxes[id];
    if (!b) return "";
    if (b.out === "start") return outName("start");
    const held: string[] = [];
    for (let x: TreeBox | undefined = b; x; x = x.parent ? t.doc.value.boxes[x.parent] : undefined) if (x.out === "hit" && x.aim) held.unshift(t.aimShort(x.aim));
    const list = [...new Set(held)].join(tr("・", ", "));
    if (b.out === "hit") return `${outName("hit")} ${list}`;
    return held.length ? `${outName(b.out)} (${list})` : outName(b.out);
  }
  /** 道の短い 1 行 (始まり › 手 › 結果 …) */
  function pathText(id: string): string {
    const d = t.doc.value, p = pathOf(d, id), parts: string[] = [];
    p.forEach((x, i) => {
      const b = d.boxes[x]!;
      if (i > 0 && b.out !== "pass") parts.push(boxTitle(x));
      if (i === 0) parts.push(outName("start"));
      if (b.hand && i < p.length - 1) parts.push(handLabel(b.hand));
    });
    return parts.join(" › ");
  }
  return { doc: t.doc, questions, current, focus, answered, later: laterSet, answer, reset, setLater, unLater, setReturn, setFinished, stateOf, outsOf, decide, boxTitle, pathText };
}
