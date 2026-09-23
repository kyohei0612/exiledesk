/**
 * usePlay.ts — 1 手ずつ進める (2026-09-23)
 *
 * オーナー:「自動でやるのはベース決めまでにしよう。そっからは 1 手 1 手考えながらやろう。
 * 表示する情報量は最低限でいい。1 手進むごとに画面切り替わる感じ」。
 *
 * 今の状態 (付いた狙い・外れの数・ブリーチの MOD) を持ち、その状態で一番安い手を
 * [[spam-phase.ts]] / [[prefix-exalt.ts]] の `decide` に聞く。結果 (付いた / 外れ / 消えた物) を
 * 押すと状態が変わって、次の画面でまた聞き直す。1 手戻るもできる。
 */
import { computed, ref, watch } from "vue";
import type { SpamPlan } from "../../services/htc/spam-plan";
import type { PlayMove } from "../../services/htc/spam-total";

type Stage =
  | { kind: "spam" }
  | { kind: "breachOnce"; cost: number }
  | { kind: "phase" }
  | { kind: "pexalt" }
  | { kind: "fixed"; label: string; cost: number }
  | { kind: "desecrate" }
  | { kind: "done" };

interface State {
  /** 今の段 (stages の添字) */
  i: number;
  /** 今の段で付いた狙い */
  held: string[];
  junk: number;
  breach: boolean;
  /** 前の段までで付いた狙い (画面の「付いている」) */
  done: string[];
  spent: number;
  moves: number;
}

/** 画面に出す 1 手 */
export interface PlayScreen {
  label: string;
  /** 当たる確率 (確定の手は 1) */
  odds: number;
  /** 確率の言い方 (既定「当たる」。消去は「外れが消える」) */
  oddsLabel?: string;
  perTry: number;
  /** 押せる結果 */
  results: Array<{ text: string; apply: () => void }>;
}

export function usePlay(plan: { readonly value: SpamPlan | null }, name: (ids: readonly string[]) => string) {
  const stages = computed<Stage[]>(() => {
    const p = plan.value;
    if (!p?.total) return [];
    const out: Stage[] = [];
    if (p.spam) out.push({ kind: "spam" });
    if (p.phase?.breachOnce) out.push({ kind: "breachOnce", cost: p.phase.breachOnce });
    if (p.phase) out.push({ kind: "phase" });
    const f = p.finish;
    if (f?.exalt) out.push({ kind: "pexalt" });
    for (const st of f?.steps ?? []) out.push({ kind: "fixed", label: st.label, cost: st.cost });
    if (f?.desecrate) out.push({ kind: "desecrate" });
    out.push({ kind: "done" });
    return out;
  });
  const fresh = (): State => ({ i: 0, held: [], junk: 0, breach: false, done: [], spent: 0, moves: 0 });
  const state = ref<State>(fresh());
  const history = ref<State[]>([]);
  watch(stages, () => { state.value = fresh(); history.value = []; });

  const stage = computed(() => stages.value[state.value.i] ?? { kind: "done" as const });

  /** 状態を変える (1 手戻れるように前を積む)。段が揃ったら次の段へ進める */
  function step(next: Partial<State>, cost: number): void {
    history.value = [...history.value, state.value];
    let s: State = { ...state.value, ...next, spent: state.value.spent + cost, moves: state.value.moves + 1 };
    // 高貴の段は、次に打つ手が無くなったら (揃った) 次の段へ
    for (;;) {
      const st = stages.value[s.i];
      if (!st || (st.kind !== "phase" && st.kind !== "pexalt") || moveAt(st, s)) break;
      s = { ...s, i: s.i + 1, done: [...s.done, ...s.held], held: [], junk: 0 };
    }
    state.value = s;
  }
  const advance = (cost: number, extra: Partial<State> = {}): void =>
    step({ i: state.value.i + 1, done: [...state.value.done, ...state.value.held], held: [], junk: 0, ...extra }, cost);
  /** スパムの狙いが消えた / 剥がした: スパムからやり直し */
  const restart = (cost: number): void => step({ i: 0, held: [], junk: 0, breach: false, done: [] }, cost);

  function moveAt(st: Stage, s: State): PlayMove | null {
    const p = plan.value;
    if (st.kind === "phase") return p?.phase?.decide(s.held, s.junk, s.breach) ?? null;
    if (st.kind === "pexalt") return p?.finish?.exalt?.decide(s.held, s.junk, s.breach) ?? null;
    return null;
  }

  /** 今の画面 */
  const screen = computed<PlayScreen | null>(() => {
    const p = plan.value, st = stage.value, s = state.value;
    if (!p) return null;
    switch (st.kind) {
      case "spam": {
        const sp = p.spam!;
        const perTry = sp.expected * sp.odds;
        return { label: `${sp.currency} で ${name([sp.modId])} を狙う`, odds: sp.odds, perTry, results: [
          { text: `${name([sp.modId])} が付いた`, apply: () => advance(perTry, { done: [...s.done, sp.modId] }) },
          { text: "外れ (もう 1 回)", apply: () => step({}, perTry) },
        ] };
      }
      case "breachOnce":
        return { label: "高貴 + 左側の高貴なお告げでプレにゴミ → ブリーチのエッセンス + 左側の結晶化のお告げ (品質の上限 40%)",
          odds: 1, perTry: st.cost, results: [{ text: "やった", apply: () => advance(st.cost, { breach: true }) }] };
      case "fixed":
        return { label: st.label, odds: 1, perTry: st.cost, results: [{ text: "やった", apply: () => advance(st.cost) }] };
      case "desecrate": {
        const d = p.finish!.desecrate!;
        return { label: `冒涜 (${d.bone} + 左手のネクロマンシーのお告げ${d.echoes ? " + 反響のお告げ" : ""}) で ${name([d.modId])}`,
          odds: d.odds, perTry: d.perTry, results: [
            { text: "当たった", apply: () => advance(d.perTry, { done: [...s.done, d.modId] }) },
            { text: `外れ (消去のオーブ + 光のお告げで冒涜だけ消す)`, apply: () => step({}, d.perTry + d.light) },
          ] };
      }
      case "phase":
      case "pexalt": {
        const m = moveAt(st, s);
        if (!m) return null;
        if (m.kind === "reset") {
          return { label: m.label, odds: 1, perTry: m.perTry, results: [{ text: "剥がした (スパムから)", apply: () => restart(m.perTry) }] };
        }
        if (m.kind === "exalt") {
          return { label: m.label, odds: m.hits.reduce((a, h) => a + h.p, 0), perTry: m.perTry, results: [
            ...m.hits.map((h) => ({ text: `${name([h.modId])} が付いた`, apply: () => step({ held: [...s.held, h.modId], breach: m.breachAfter }, m.perTry) })),
            { text: "外れが付いた", apply: () => step({ junk: s.junk + 1, breach: m.breachAfter }, m.perTry) },
          ] };
        }
        // 消去: 何が消えたかを押す
        return { label: m.label, odds: m.removes.find((r) => r.kind === "junk")?.p ?? 0, oddsLabel: "外れが消える", perTry: m.perTry,
          results: m.removes.map((r) => ({
            text: r.kind === "junk" ? "外れが消えた" : r.kind === "breach" ? "ブリーチの MOD が消えた" : `${name([r.modId!])} が消えた${r.kind === "spam" ? " (スパムからやり直し)" : ""}`,
            apply: () => r.kind === "junk" ? step({ junk: s.junk - 1 }, m.perTry)
              : r.kind === "breach" ? step({ breach: false }, m.perTry)
                : r.kind === "spam" ? restart(m.perTry)
                  : step({ held: s.held.filter((x) => x !== r.modId) }, m.perTry),
          })) };
      }
      default:
        return null;
    }
  });

  /** 今の状態から完成までの残りの見込み (高貴換算)。今の段の残り + 後の段の平均 */
  const remaining = computed(() => {
    const p = plan.value;
    if (!p) return 0;
    const f = p.finish;
    const des = f?.desecrate ? f.desecrate.perTry / f.desecrate.odds + f.desecrate.light * (1 / f.desecrate.odds - 1) : 0;
    const each = (st: Stage): number => {
      switch (st.kind) {
        case "spam": return p.spam!.expected;
        case "breachOnce": case "fixed": return st.cost;
        case "phase": return (p.phase?.expected ?? 0) - (p.spam?.expected ?? 0) - (p.phase?.breachOnce ?? 0);
        case "pexalt": return f?.exalt?.expected ?? 0;
        case "desecrate": return des;
        default: return 0;
      }
    };
    const st = stage.value, s = state.value;
    const now = st.kind === "phase" || st.kind === "pexalt" ? moveAt(st, s)?.remaining ?? 0 : each(st);
    return now + stages.value.slice(s.i + 1).reduce((a, x) => a + each(x), 0);
  });

  const back = (): void => {
    const h = history.value;
    if (!h.length) return;
    state.value = h[h.length - 1]!;
    history.value = h.slice(0, -1);
  };
  const restartAll = (): void => { state.value = fresh(); history.value = []; };

  return { state, stage, screen, remaining, back, restartAll, canBack: computed(() => history.value.length > 0) };
}
