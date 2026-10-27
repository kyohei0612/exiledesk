/**
 * use-phone-quiz.ts — シミュのスマホ版の組み方 = 質問で進める形 (2026-10-25 オーナー「スマホだけ自動完成で作って ただ、自動完成はあくまでも補助ね」、スイッチ simPhone)。
 * 木は PC と同じ TreeDoc (use-tree)。質問 = 「残りの道」。答え = PC と同じ操作 (手を付ける applyPick・↩ 戻り先 setBack・完成 setDone)。
 * 質問は 2 種類: ① hand = この箱で何を打つ? (始まり・「次の手を決める」にした結果の箱・品質だけ上げた後) / ② outs = 手の結果ごとにどうする? (まだ答えていない結果の箱がある手)。
 * 同じ状態の箱があれば PC と同じく自動の矢印 (applyPick の中の linkSameShape) で閉じ、その道は聞かない。
 * 完成の狙いが全部そろう道の箱はスマホだけ自動で完成 (markDone、答えと同じ 1 手 = 1 つ戻すで一緒に戻る)。「次の手を決める」にした箱は自動で完成にしない
 * (完成の後も答え直せる。PC は今のまま枝分かれできる。10-25 にやめた PC の「自動の完成」とは別、決めはメモ sim-decisions)
 */
import { computed, ref, shallowRef } from "vue";
import { useTreeLink } from "../tree/use-tree-link";
import type { TreeRunResult } from "../../../services/simulator/tree/tree-run";
import { aimKey, setBack, setDone, type TreeBox, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { heldSets } from "../../../services/simulator/tree/tree-shape";
import { useTree } from "../tree/use-tree";
import { handLabel, headOf, outName, outsName } from "../tree/tree-names";
import { tr } from "../../../i18n/lang";

/** 答えの要る結果の箱か (手も戻りも完成も分かれ目も無い。始まり・品質だけの通り抜けは ① で聞く) */
export function isOpen(b: TreeBox): boolean {
  return b.out !== "start" && b.out !== "pass" && !b.hand && !b.back && !b.done && !b.split;
}
/**
 * 外れの側の結果 (外れ・狙いが消えた)。② では先に並べ、決めていなければ「次へ」で ↩ 再度挑戦 (同じ手へ) にする
 * (10-26 夜オーナー「スマホ版は外れルートからツリーを完成させるか」「そうしたら順番に戻ることもなく、滞りなく進みそう。スタートから順に」)
 */
export const isMiss = (b: TreeBox | undefined): boolean => b?.out === "junk" || b?.out === "lost";
/** 再度挑戦の戻り先 (打つ前の箱。始まりの手の結果なら始まり) */
export const retryOf = (d: TreeDoc, id: string): string | null => d.boxes[id]?.parent ?? null;
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

/**
 * 結果の画面で、まだ打つカレンシーを選んでいない扱いか (スイッチ phoneResult1027)。決めていない・次の手を決めるにした箱に加え、
 * 外れの側で自動でつないだ戻り (autoBack、同じ形の箱へ) も選ぶ前は答えを出さない (10-27 昼オーナー「外れた場合なんだから一旦ここ自動で何も表示させずに打つカレンシー決めさす」)。
 * 同じ手を持つと setReturn (setBack が autoBack を外す) で初めて「↩ 再度挑戦 · n 段目へ戻る」
 */
export function awaitsPick(d: TreeDoc, id: string, later: ReadonlySet<string>): boolean {
  const b = d.boxes[id];
  if (!b || b.hand || b.split || b.done) return false;
  if (!b.back) return true;
  return !!b.autoBack && (isMiss(b) || b.out === "any") && !later.has(id);
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
/** 全体図 (PhoneMap) で戻り先の箱を選んでいる (② の「ほかの箱へ」。from = 結果の箱、ids = 戻れる箱。10-26 オーナー「どこに戻るか分からない」) */
export const mapPick = ref<{ from: string; ids: string[] } | null>(null);
/** 箱の重ね窓 (10-26 オーナーの選んだ案 B: 一覧・全体図・戻り先選びで箱を押すと、移らずに下から窓で中身を全部。pickFrom = 戻り先を選んでいる結果の箱) */
export const sheet = ref<{ id: string; pickFrom?: string; /** 足りない所から開いた時の文 (窓の頭に出す、10-26 モンキー 7 の 22) */ issue?: string } | null>(null);
/**
 * テストで回した時の木の形 (use-tree-check の routeKeyOf)。今の形と同じ間だけ、足りない所・未定の数を出す
 * (10-27 オーナー「組んでいる途中なら足りないのはそりゃそうだから、テスト走行をしないと表示しないように」。PC と同じ「テストで回す」)
 */
export const testedKey = ref<string | null>(null);
/** ② で今出している結果の箱の番号 (結果は 1 つずつ 1 画面、外れの側から。PhoneTreePage が質問が替わったら 0 に戻す) */
export const outStep = ref(0);
/** 最後に回した 100 人の結果 (PhoneTreePage の use-tree-run を写す。結果の行・重ね窓の「来た人・止まりの理由」) */
export const phoneRun = shallowRef<TreeRunResult | null>(null);

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
    const list = pass?.hand ? pass.outs : pass ? [] : b.outs;
    // 外れの側を先に (決める順 = 上から。並びの中は木の順のまま)
    return [...list.filter((o) => isMiss(d.boxes[o])), ...list.filter((o) => !isMiss(d.boxes[o]))];
  }
  /** その結果の箱から再度挑戦 (打つ前の箱へ戻る) できるか (PC の戻り先選びと同じ use-tree-link = その手をこの箱のアイテムにエンジンで打てるか) */
  function canRetry(o: string): string | null {
    const to = retryOf(t.doc.value, o);
    return to && useTreeLink(t.doc, ref<string | null>(o)).value.get(to) === null ? to : null;
  }
  /**
   * ② の「次へ」= 答えていない結果を 1 手で決めて次の質問へ: 外れの側は ↩ 再度挑戦 (戻れなければ「次の手を決める」)、当たりの側は「次の手を決める」。
   * 質問はスタートから段の順なので、前の段に未定を残さない (後ろの段から前の段へ質問が戻らない)
   */
  function decide(id: string): void { decideOuts(outsOf(id)); focus.value = null; }
  /** 結果の箱を 1 つだけ既定の答えで決める (② を 1 枚ずつ出す時の「次へ」、10-26 夜オーナー「結果を 1 つずつ 1 画面で」) */
  function decideOne(o: string): void { decideOuts([o]); }
  function decideOuts(list: string[]): void {
    const open = list.filter((o) => stateOf(o) === "open");
    const retry = open.flatMap((o) => { const to = isMiss(t.doc.value.boxes[o]) ? canRetry(o) : null; return to ? [[o, to] as const] : []; });
    const rest = open.filter((o) => !retry.some(([x]) => x === o));
    later.value = [...later.value, ...rest.filter((o) => !later.value.includes(o))];
    if (retry.length) answer((d) => { for (const [o, to] of retry) { setDone(d, o, null); setBack(d, o, to); } });
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
    for (let x: TreeBox | undefined = b; x; x = x.parent ? t.doc.value.boxes[x.parent] : undefined) if (x.out === "hit" && x.aim) held.unshift(x.anyOf && x.anyOf.length > 1 ? tr(`${x.anyOf.map(t.aimShort).join(" / ")} のどれか`, `any of ${x.anyOf.map(t.aimShort).join(" / ")}`) : t.aimShort(x.aim));
    const list = [...new Set(held)].join(tr("・", ", "));
    // 当たりは PC の枠の札と同じ「スピリットが付いた」(10-26 オーナー「枠の上のところに●がついた みたいな形でよくある枠の形にしたら枠中ごちゃんなくていいよな」)
    if (b.out === "hit") return headOf(b, t.aimShort);
    return held.length ? `${outsName(b)} (${list})` : outsName(b);
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
  /** 結果の画面でまだ選んでいない (awaitsPick) */
  const awaits = (id: string): boolean => awaitsPick(t.doc.value, id, laterSet.value);
  return { awaits, doc: t.doc, questions, current, focus, answered, later: laterSet, answer, reset, setLater, unLater, setReturn, setFinished, stateOf, outsOf, decide, decideOne, canRetry, boxTitle, pathText };
}
