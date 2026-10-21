/**
 * use-sim-run.ts — シミュレーションの画面 (StageSimPanel.vue) の回す・止める・パターンごとの結果・工程の「決めた」・途中の保存。
 * StageSimPanel.vue から分けた (2026-10-16、500 行の決まり)。画面の 1 つごとに呼ぶ (状態は画面ごと)
 */
import { scrollToTop } from "../../utils/keep-place";
import { logRecord } from "../../utils/log-record";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { craftStage, priceOf, writeSimSession } from "../../state/craft-stage";
import { fillModText } from "../../services/htc/mod-text";
import { tierDisplayRanges } from "../../services/mods/stat-scale";
import { memoPrice, type RecipeResult, type RecipeSpec } from "../../services/simulator/recipe-sim";
import { track } from "../../utils/track";
import { patternSets, setByKey, type Pattern } from "../../services/simulator/pattern";
import { runQuizOnce, summarizeQuiz, type QuizResult, type QuizRoute, type QuizRun } from "../../services/simulator/quiz-recipe";
import { magicStartMods, quizFromSim, type QuizSimIn } from "../../services/simulator/quiz-build";
import { tr } from "../../i18n/lang";
import { sideLimits, sideUse } from "../../services/simulator/sim-methods";
import { selfCraftCosts, whiteCraftIn } from "../../services/simulator/self-craft-dist";
import type { SimTargetsCtx } from "./use-sim-targets";
import { useSimCalc } from "./use-sim-calc";
export type { KeepPlan } from "./use-sim-calc";
import type { SimSearchCtx } from "./use-sim-search";
import { simAuto } from "../../state/simulator/sim-state";


export function useSimRun(d: SimTargetsCtx & SimSearchCtx) {
  const { blocker, boughtDivine, fourDivine, rareDivine, fractureRow, fractureRows, wholeRoute, itemDivine, magicDivine, makeRoute, makeSpec,
    market, maxSteps, methodOf, num, orderKeys, rows, runs, socketCount, targetsSig, whiteDivine } = d;
  const s = craftStage;
  /** 反対側で揃える狙い (calc.keep の手順) */
  const keepTarget = () => { const h = calc.value?.keep?.host; return h ? simIn().find((t) => t.modId === h) ?? null : null; };
  /** 狙いをクイズのレシピの入力の形に (付け方は決めた物) */
  const simIn = () => s.simTargets.value.map((t) => ({ modId: t.modId, minTierIndex: t.minTierIndex, method: methodOf(t), ...(t.alts?.length ? { alts: t.alts } : {}), ...(t.need ? { need: t.need } : {}), ...(t.rest && (t.method === "fracture" || methodOf(t) === "augment") ? { rest: t.rest } : {}) }));
  const { calc } = useSimCalc(d, simIn);
  /** 白から自作の費用の分かれ方 (2 万人分、小さい順。③ の「買う値段までに作れる割合」。2026-10-20) */
  const whiteCosts = computed(() => { const c = calc.value; return c && !c.cantRoll && Number.isFinite(c.total) ? selfCraftCosts(whiteCraftIn(c, priceOf)) : null; });
  const busy = ref(false);
  const phase = ref("");
  const progress = ref<[number, number] | null>(null);
  /** 進み具合は SimProgress.vue だけが読む (ここで progress.value を読むと、更新のたびにこの画面全体が描き直される) */
  const progressBox = { progress };
  const error = ref("");
  const recipeOut = ref<{ r: RecipeResult; spec: RecipeSpec } | null>(null);
  /** フラクチャー済みから残りを作る費用 (ベース代 0 で回した平均)。買う側の比べに足す */
  /** 固定済みから先のクラフト費用だけ (ベース代を除く) と、使ったベースの数 (やり直しの買い直し・作り直し込み) */
  const restCost = ref<number | null>(null);
  /** スマホ (幅 768 CSS px 未満): 2 狙う MOD の「決めた →」を画面の下に固定、道具を指の大きさに (2026-10-08 レビュー) */
  const phone = ref(typeof window !== "undefined" && window.innerWidth < 768);
  const onPhoneResize = (): void => { phone.value = window.innerWidth < 768; };
  onMounted(() => window.addEventListener("resize", onPhoneResize));
  onBeforeUnmount(() => window.removeEventListener("resize", onPhoneResize));
  const restBases = ref(1);
  /**
   * 固定済みのベース 1 個の費用 (始め方のうち一番安い物。結果に依らない値: 自作 = 1 回分 × 3 + 消去 × 2、② = (ベース + 壁 + フラクチャー) × 3 + 消去 × 2、固定済みを買う = その値段)。
   * パターンを回す時のベース代にする。前は 0 で回していて、パターンの中で「最初から (新しいベース)」になった分 (違う MOD が固定された・固定済みで付けた狙いが消えた) が
   * 無料になっていた (2026-10-08 オーナー「フラクチャー済みから始める時は費用も込みじゃないと。自分でやったやつは掛かった分を足す」)
   */
  const startOnce = computed((): number | null => {
    const c = calc.value;
    // グレーターエッセンスを巻き込む道は自前のフラクチャーだけ (買う始め方は無い。2026-10-20 オーナー)
    if (c?.greater) return Number.isFinite(c.total) ? c.total : null;
    // 始め方を 1 で決めた時はその 1 つ (固定済みを買う = 入れた値段 / 4 MOD を買う = (ベース + フラクチャー) × 3)
    if (s.simStart.value === "fractured") return num(boughtDivine.value);
    if (s.simStart.value === "item") return num(itemDivine.value);
    if (s.simStart.value === "magic") return num(magicDivine.value);
    if (s.simStart.value === "four") return c && c.fourTotal != null && Number.isFinite(c.fourTotal) ? c.fourTotal : null;
    return startPick.value?.base ?? null;
  });
  /**
   * 一番安い始め方 (白から自作の時): 比べは「フラクチャー済み + 反対側の狙いが付くまで」(keep)、⑤ に渡すベース代は ⑤ で打つカオスを除いた分。
   * 白から自作で「一緒に揃える」が安ければ、その分をベース代に入れて ⑤ は揃えた狙いが付いたまま固定されたレアから (quizBase の keep)
   */
  const startPick = computed((): { kind: "white" | "four" | "fractured"; cost: number; base: number; together: boolean } | null => {
    const c = calc.value;
    if (!c) return null;
    const k = c.keep;
    const chaos = k ? k.chaos : 0;
    const xs: Array<{ kind: "white" | "four" | "fractured"; cost: number; base: number; together: boolean }> = [];
    const wt = !!k && k.use === "together";
    xs.push({ kind: "white", cost: c.total + (k ? Math.min(k.together, k.chaos) : 0), base: c.total + (wt ? k!.together : 0), together: wt });
    if (c.fourTotal != null) xs.push({ kind: "four", cost: c.fourTotal + chaos, base: c.fourTotal, together: false });
    const bN = num(boughtDivine.value);
    if (bN != null) xs.push({ kind: "fractured", cost: bN + chaos, base: bN, together: false });
    const ys = xs.filter((x) => Number.isFinite(x.cost));
    return ys.length ? ys.reduce((a, x) => (x.cost < a.cost ? x : a)) : null;
  });
  /** フラクチャー済みのベースを手に入れる一番安い始め方 (4 最安値スタート、値段の有る物だけ) */
  /** パターンごとの結果 (回した後)。見ている物を recipeOut / restCost に出す */
  const results = ref<Array<{ name: string; out: { r: RecipeResult; spec: RecipeSpec }; rest: number | null; bases: number; /** クイズのレシピの始め 1 個の値段 (ベース代の内訳) */ startPrice?: number }>>([]);
  const shown = ref(0);
  /** パターンの名前で結果を引く (一覧はパターンの並びで出す) */
  const resultOf = (name: string) => results.value.find((x) => x.name === name) ?? null;
  const shownName = computed(() => results.value[shown.value]?.name ?? "");
  const cheapestName = computed(() => (results.value.length > 1 ? results.value.reduce((b, y) => (y.out.r.perDone < b.out.r.perDone ? y : b)).name : ""));
  function showResultByName(name: string): void {
    const i = results.value.findIndex((x) => x.name === name);
    if (i >= 0) showResult(i);
  }
  /** 回していないパターンの一言 (未完成なら最初の打てない手) */
  function patternNote(p: Pattern): string {
    const left = s.simPlayLeft.value[p.name] ?? 0;
    return !hasSteps(p) ? tr("答えが無い", "No answers") : left ? tr(`未実行 · 答えの無い場面 ${left} (来た人はイレギュラー)`, `Not run · ${left} unanswered (counted as irregular)`) : tr("未実行", "Not run");
  }
  function togglePatternOff(i: number): void {
    s.simPatterns.value = s.simPatterns.value.map((p, k) => (k === i ? { ...p, off: !p.off } : p));
  }
  function showResult(i: number): void {
    const x = results.value[i];
    if (!x) return;
    shown.value = i;
    recipeOut.value = x.out;
    restCost.value = x.rest;
    restBases.value = x.bases;
  }
  const ranFor = ref("");
  const sig = computed(() => `${market.fetchedAt.value ?? 0}|${s.base.value}|s${socketCount.value}|${s.itemLevel.value}|${makeRoute.value}|${blocker.value}|${whiteDivine.value}|${s.simTargets.value.map((t) => methodOf(t)).join(",")}|${targetsSig()}|${JSON.stringify(s.simPatterns.value)}`);
  let gen = 0;

  /**
   * 全部まとめて回すパターン = 手があってチェックの入った物。組みかけでも組めている所までを完成品として回す
   * (2026-10-07 オーナー「回すパターンを選択できるように」「そこまでを完成品とする」)
   */
  /** 手があるか (打って作るパターンの手) */
  const hasSteps = (p: Pattern): boolean => !!p.quiz && Object.values(p.quiz.rules).some((r) => r.length > 0);
  /** エミュレーターの状態の写しを、3 で選んだアイテムレベルで (エミュレーターのレベルは引き継がない。2026-10-19 オーナー) */
  const startItemAt = () => (s.simStartItem.value ? { ...s.simStartItem.value, itemLevel: s.itemLevel.value } : null);
  /** クイズのレシピの入力 (狙う MOD・始め方・値段。答えはパターンに持つ。ADR-003) */
  const quizBase = computed<QuizSimIn | null>(() => {
    const d = s.data.value;
    if (!d || !s.base.value) return null;
    /**
     * フラクチャー予定があれば、白・MOD 付きレア・フラクチャー済みを買う のどれから始めても、打ち方は「フラクチャー済みのベース (固定 MOD 1 つのレア)」から。
     * ベース代は 3 の一番安い道の費用 (startOnce = フラクチャー済みになるまで、やり直しの買い直し込み)。前は白から始まり、3 の値段 (フラクチャー済みまで) と
     * 5 の見出し (フラクチャー済みのベースから) と食い違っていた (2026-10-19 オーナーと通した時。10-08 の決め [[sim-cost-model]])
     */
    // 白から全部 ⑤ で答える時 (増強スパムの狙いがある。2026-10-21) は白のまま
    const fracStart = !wholeRoute.value && (s.simStart.value === "white" || s.simStart.value === "four" || s.simStart.value === "fractured") && s.simTargets.value.some((t) => methodOf(t) === "fracture");
    const st = fracStart ? "fractured" : s.simStart.value;
    const startPrice = st === "item" ? num(itemDivine.value) ?? 0 : st === "magic" ? num(magicDivine.value) ?? 0 : st === "fractured" ? startOnce.value ?? 0 : st === "four" ? num(fourDivine.value) ?? 0 : num(whiteDivine.value) ?? 0;
    return {
      data: d, base: s.base.value, itemLevel: s.itemLevel.value, start: st, startPrice, sockets: socketCount.value, startItem: startItemAt(),
      // ⑤ の関門は ④ の順番 (先の狙いは「付いていない」と見る。2026-10-20)。固定済みから始める時のどれが固定されたかは 3 の付きやすさの重み
      order: orderKeys.value, fracWeights: Object.fromEntries((calc.value?.each ?? []).map((e) => [e.modId, e.p])),
      targets: simIn(), runePrice: (en: string) => priceOf(`rune:${en}`),
      // グレーターエッセンスを巻き込む道: 固定済みのレアは、残す MOD + エッセンス + 壁が付いた物 (2026-10-20)
      ...(fracStart && calc.value?.greater ? { greater: { essKey: calc.value.greater.essKey, keep: calc.value.greater.keep } } : {}),
      // 白から自作で反対側の狙いを「マジックで一緒に揃える」のが安い時: 揃えたまま王者でレア → 壁 → 固定 (2026-10-20)
      ...(fracStart && !calc.value?.greater && s.simStart.value === "white" && startPick.value?.together && keepTarget() ? { greater: { essKey: null, keep: keepTarget()! } } : {}),
    };
  });
  /** マジックを買う始め方で付いている MOD (2 の狙う MOD の最初のプレ 1 つ・サフィ 1 つ、quiz-build の magicStartMods と同じ) */
  const magicMods = computed(() => {
    const d = s.data.value, qb = quizBase.value;
    return d && qb ? magicStartMods(d, qb.targets).map((f) => modShort(f.mod, (d.mods.get(f.mod)?.tiers.length ?? 0) - Number(f.tier?.slice(1) ?? 0))) : [];
  });
  /** クイズの結果を今の結果の形に (結果の表示をそのまま使う) */
  /** 関門 (札) の短い名前 (打ち止めの理由に出す) */
  const gateName = (route: QuizRoute | undefined, id: string): string => {
    const g = route?.goal.find((x) => x.id === id);
    const m = g?.mods[0];
    return m ? `${modShort(m.modId, m.minTierIndex)}${g.mods.length > 1 ? tr(` ほか ${g.mods.length - 1}`, ` +${g.mods.length - 1}`) : ""}` : id;
  };
  function quizToRecipe(q: QuizResult, route?: QuizRoute): RecipeResult {
    const stops = [
      ...(q.capped ? [{ reason: "手が多すぎる", p: q.capped / (q.runs || 1) }] : []),
      // 関門の打ち止め (2026-10-20): どの関門で何回打って止めたか
      ...q.gates.filter((g) => g.stopped).map((g) => ({ reason: tr(`「${gateName(route, g.id)}」の関門で打ち止め (${(route?.caps?.[g.id] ?? 0).toLocaleString()} 回)`, `Stopped at the "${gateName(route, g.id)}" step (${(route?.caps?.[g.id] ?? 0).toLocaleString()} uses)`), p: g.stopped / (q.runs || 1) })),
      ...q.blocked.map((o) => ({ reason: tr(`打てない手: ${o.reason}`, `Unusable answer: ${o.reason}`), p: o.n / (q.runs || 1) })),
    ];
    // 答えの無い状況に来た人 (イレギュラー) は stops に入れず別に持つ (計算から外している。2026-10-20 オーナー)
    return { runs: q.runs, pDone: q.pDone, perDone: q.perDone, p50: q.p50, p80: q.p80, p90: q.p90, usage: q.usage, stops, sample: null, bases: q.bases, hitRates: [],
      ...(q.irregular ? { irregular: { n: q.irregular, of: q.runs + q.irregular } } : {}) };
  }
  const patternChecks = computed(() => s.simPatterns.value.filter(hasSteps).map((p) => ({ p, why: null as string | null })));
  // 答えの無い状況が残っていても回せる (来た人はイレギュラーとして止め、計算から外す。2026-10-20 オーナー)
  const runnable = computed(() => s.simPatterns.value.filter((p) => hasSteps(p) && !p.off));
  const blocked = computed((): string | null => {
    if (!rows.value.length) return "狙いがありません";
    if (!patternChecks.value.length) return "6 パターンに手がありません";
    if (!runnable.value.length) return "回すパターンにチェックが入っていません";
    return null;
  });

  /**
   * only: そのパターンだけ回す (未完成でも組めている所まで、1500 回。2026-10-07 オーナー「パターンを自分で追加して未完成の状態で 1500 回回したら
   * どんだけ付くのか実験したい、手動では個別に回す感じで、結果を下に」)。無ければ出来ているパターンを全部
   */
  const ONE_RUNS = 500;
  /** 6 パターンで開いているパターン (取引所で探すのに使う) */
  const activePattern = ref(0);
  // 上のタブで開いたパターンの結果を下に出す (回した物だけ。2026-10-07 パターンを並べて回すと、タブを替えても下は一番安い物のままだった)
  watch(() => s.simPatterns.value[activePattern.value]?.name, (n) => { if (n) showResultByName(n); });
  /**
   * 「この手だけ回す」の結果 (2026-10-07 オーナー「カオス何個分で単純にできるか知りたい」「8 割の人で出した方が良さそう」)。
   * その手の前までは当たった状態から、その手のカレンシーを何個打ったら付いたか (8 割の人・平均) とその手の費用。1 人 20,000 回まで
   */
  /** この手だけの人数 (全体と同じ 500 人。上限は全体と同じ maxSteps) */
  const STEP_ONLY_RUNS = 500;
  const stepRun = ref<{ k: number; i: number; presses: number; cost: number; p80Presses: number; p80Cost: number; pDone: number; busy: boolean } | null>(null);
  /**
   * 自動の時 (S3): 回して答えの無い状況 (イレギュラー) が出たら、自動の方策で答えを足して、そのパターンをもう一度だけ回す
   * (設計 auto-flow-design の 3-1 の穴埋め、解析君の answerFor)。StageSimPanel が use-sim-auto-order の autoAnswer を入れる。手動の時は null
   */
  let holeFiller: ((open: Array<{ route: string; situation: import("../../services/simulator/quiz-recipe").Situation }>) => Promise<number>) | null = null;
  function setHoleFiller(f: typeof holeFiller): void { holeFiller = f; }
  async function run(only?: number, stepOnly?: number): Promise<void> {
    const it = s.item.value, d = s.data.value;
    if (!it || !d) return;
    if (only == null && blocked.value) return;
    if (only != null && (!rows.value.length || !s.simPatterns.value[only] || !hasSteps(s.simPatterns.value[only]!))) return;
    const my = ++gen;
    busy.value = true;
    if (stepOnly != null && only != null) stepRun.value = { k: only, i: stepOnly, presses: 0, cost: 0, p80Presses: 0, p80Cost: 0, pDone: 0, busy: true };
    track(only == null ? "sim:run" : stepOnly != null ? "sim:run:step" : "sim:run:one");
    error.value = "";
    progress.value = null;
    try {
      phase.value = "試しています";
      const divine = 1; // 手で入れた値段は高貴建て
      const price = memoPrice(priceOf);
      // 1 回の「回す」の中は全パターン同じ乱数の並び (同じ手なら同じ結果、比べは手の違いだけになる。2026-10-08 使い倒しテスト)
      const runSeed = Math.floor(Date.now() % 1_000_000) * 10_000;
      const spec: RecipeSpec = {
        seed: runSeed,
        data: d, base: s.base.value, itemLevel: s.itemLevel.value, runs: stepOnly != null ? STEP_ONLY_RUNS : only != null ? ONE_RUNS : runs.value, price,
        maxSteps: maxSteps.value,
        targets: s.simTargets.value.flatMap((t) => (methodOf(t) === "fracture"
          ? [{ modId: t.modId, minTierIndex: t.minTierIndex, method: "fracture" as const }, ...(t.alts ?? []).map((a) => ({ ...a, method: "fracture" as const }))]
          : [{ modId: t.modId, minTierIndex: t.minTierIndex, method: methodOf(t), ...(t.alts?.length ? { alts: t.alts } : {}) }])),
        whiteBasePrice: (num(whiteDivine.value) ?? 0) * divine, sockets: socketCount.value,
        ...(s.simStart.value === "item" && s.simStartItem.value ? { startItem: startItemAt()!, startPrice: num(itemDivine.value) ?? 0 } : {}),
        ...(fractureRow.value ? { fractureStart: makeSpec.value } : {}),
      };
      // パターンごとに回す (2026-10-06 オーナー「パターンで回す」)。白から作る + (フラクチャーがあれば) 固定済みから残りを作る (ベース代 0) の 2 本。
      // 始め方の比べに使う
      const sets = patternSets(it.cls);
      // フラクチャーがある時は、フラクチャー済みのベースを手に入れるまでは 4 最安値スタートの計算で固定し (自作は 1 回分 × 3 + 消去 × 2)、
      // 回すのはフラクチャー済みから先だけ (2026-10-06 オーナー「白ベースでもフラクチャーまでの平均はほぼ一緒、3 回に 1 回当たる予算で
      // そこまでは固定で出しておｋ、他の選択肢も」)。始め方ごとの合計 = その始め方の費用 + 固定済みから先の平均
      // この手だけ: パターンをその手までで切る (その手の狙いまでが完成)
      const ps = (only != null ? [s.simPatterns.value[only]!] : runnable.value).filter((p) => !!p.quiz);
      const total = spec.runs * ps.length;
      const out: typeof results.value = [];
      for (const [k, p] of ps.entries()) {
        if (p.quiz) {
          // クイズのレシピ (ADR-003): 答えのとおりに 1 人ずつ最後まで。答えの無い状況・打てない手に来た人は未完成
          const qb = quizBase.value;
          if (!qb) continue;
          // 答えは見張り (Vue の reactive) の無い写しで渡す。見張りのまま 1 手ごとに読んでいて、回す時間の 1 割ほどがそれだった (2026-10-19 性能の記録)
          const runAll = async (quiz: NonNullable<typeof p.quiz>): Promise<{ recipe: ReturnType<typeof quizFromSim>["recipe"]; sum: QuizResult } | null> => {
            const { recipe } = quizFromSim(qb, JSON.parse(JSON.stringify(quiz)) as typeof quiz);
            const qruns: QuizRun[] = [];
            for (let i = 0; i < spec.runs; i++) {
              qruns.push(runQuizOnce(d, recipe, runSeed + i * 7919, { price, maxSteps: maxSteps.value }));
              if (i % 10 === 9) { progress.value = [k * spec.runs + i + 1, total]; await new Promise((r) => setTimeout(r)); if (my !== gen) return null; }
            }
            return { recipe, sum: summarizeQuiz(qruns, price) };
          };
          let got = await runAll(p.quiz);
          if (!got) return;
          // 自動の時: 答えの無い状況に自動の方策で答えを足して、もう一度だけ回す
          if (holeFiller && got.sum.open.length && only == null) {
            phase.value = "答えの無い場面を埋めています";
            const added = await holeFiller(got.sum.open.map((o) => ({ route: o.route, situation: o.situation })));
            const fresh = s.simPatterns.value.find((x) => x.name === p.name)?.quiz;
            if (added > 0 && fresh) { got = await runAll(fresh); if (!got) return; }
            phase.value = "試しています";
          }
          const { recipe } = got;
          const r = quizToRecipe(got.sum, recipe.routes[0]);
          out.push({ name: p.name, out: { r, spec }, rest: null, bases: r.bases, startPrice: recipe.start.price });
          continue;
        }
      }
      if (only != null && stepOnly != null) {
        // この手だけ: 並べた後の番号 (カレンシーの決まっていない手は飛ばす) でその手の打った数と費用を引く。全体の結果は触らない
        const ci = s.simPatterns.value[only]!.steps.slice(0, stepOnly).filter((st) => !!setByKey(sets, st.set)).length;
        const r = out[0]!.out.r;
        const a = r.stepAvg?.[ci];
        stepRun.value = { k: only, i: stepOnly, presses: a?.presses ?? 0, cost: a?.cost ?? 0, p80Presses: a?.p80Presses ?? 0, p80Cost: a?.p80Cost ?? 0, pDone: r.pDone, busy: false };
        return;
      }
      if (only != null) {
        // 1 つだけ回した時は、前の結果のそのパターンだけ入れ替える (他のパターンの結果は残す)
        const x = out[0]!;
        const list = results.value.filter((y) => y.name !== x.name);
        results.value = [...list, x];
        showResult(results.value.length - 1);
      } else {
        results.value = out;
        if (out.some((x) => x.out.r.pDone >= 0.5)) track("sim:done");
        showResult(out.reduce((b, x, i) => (x.out.r.perDone < out[b]!.out.r.perDone ? i : b), 0));
      }
      ranFor.value = sig.value;
      // 分析用の記録 (2026-10-09): 何を狙ってどう組んだら、いくらで何割完成したか
      logRecord("sim_run", {
        base: s.base.value, ilvl: s.itemLevel.value, start: s.simStart.value, runs: runs.value, maxSteps: maxSteps.value,
        targets: s.simTargets.value.map((t) => `${t.modId}#${t.minTierIndex}${t.method ? ":" + t.method : ""}${t.alts?.length ? "+" + t.alts.length : ""}`),
        results: out.map((x) => ({ name: x.name, answers: Object.values(s.simPatterns.value.find((p) => p.name === x.name)?.quiz?.rules ?? {}).reduce((a, r) => a + r.length, 0), perDone: Math.round(x.out.r.perDone * 100) / 100, pDone: Math.round(x.out.r.pDone * 1000) / 1000 })),
      });
      // スマホ: 回した結果 (1 個あたりの平均) を画面の上に (2026-10-09 スナップで確認: 「回す」の所に止まったまま結果が下に隠れていた)
      if (phone.value && my === gen) void nextTick(() => scrollToTop(document.querySelector("[data-sim-result]")));
    } catch (e) {
      if (my === gen) error.value = e instanceof Error ? e.message : String(e);
    } finally {
      if (my === gen) { busy.value = false; phase.value = ""; if (stepRun.value?.busy) stepRun.value = null; }
    }
  }
  function stop(): void {
    gen++;
    busy.value = false;
    phase.value = "";
    if (stepRun.value?.busy) stepRun.value = null;
  }
  watch(() => s.base.value, () => { recipeOut.value = null; restCost.value = null; results.value = []; });

  /**
   * 説明・内訳は閉じておき、要る時に開く (2026-10-05 オーナー「UI とにかく文字が多いから説明とかは閉じてデフォで、必要な時に開く感じで最低限に。活字疲れる」)。
   * 開け閉めは覚える
   */
  const FOLD_KEY = "exiledesk.craftStageSim.open";
  const open = ref<Record<string, boolean>>({});
  try { open.value = JSON.parse(localStorage.getItem(FOLD_KEY) ?? "{}"); } catch { /* 無くてよい */ }
  function toggle(k: "help" | "calc" | "usage" | "more"): void {
    open.value = { ...open.value, [k]: !open.value[k] };
    try { localStorage.setItem(FOLD_KEY, JSON.stringify(open.value)); } catch { /* 無くてよい */ }
  }
  const help = computed(() => !!open.value.help);

  /**
   * 1 つずつ進む (2026-10-05 オーナー「まだ決めてないところは表示させないでね、1 個 1 個進んで行く形で」
   * 「先に MOD 決めからでしょ」「フラクチャーは 2 番目で 1 番目は MOD 決め」)。
   *   白ベースの値段「進む」→ ① 狙う MOD (下の一覧から、「決めた」) → ② フラクチャー (① の中から固定する物、か「しない」)
   *   → ③ 付ける順番と付け方 (「決めた」) → 相場・回す → 比べ・結果 (回した後)
   * 前の段を直しても後ろは消さない。狙いが空になった時とベースを変えた時だけ始めに戻る
   */
  /** 白ベースの値段を入れて「進む」を押した */
  const whiteOk = ref(false);
  const modsDone = ref(false);
  const fracDone = ref(false);
  const orderDone = ref(false);
  /** 4 最安値スタートを決めた (フラクチャーがある時だけの工程) */
  const startDone = ref(false);
  /**
   * 工程 (2026-10-05 オーナーと組み直し「狙う MOD が 2 工程目、次が白ベース設定で増強消去スパムで狙う MOD (フラクチャー予定)、
   * ルートは 3 つ (自作の増強スパム / レアのフラクチャー無しベース / フラクチャー済み)、流れが一緒になるのはフラクチャー後。最安値クラフト設定」):
   *   1 ベース → 2 狙う MOD → 3 白ベース設定 (値段 + 増強・消去スパムで狙う = フラクチャー予定) → 4 最安値スタート (回さずに 3 ルートの計算)
   *   → 5 付ける順番と付け方 (フラクチャー後は共通) → 6 回す
   */
  // 枠より多い狙いは整理の欄 (SimTargetSort.vue) で「どれか N つ」にまとめてから 3 へ (2026-10-18 オーナー「決めたボタンを押してこの画面で付け方が同じ奴の設定」)
  const slotsFit = computed(() => { const u = sideUse(s.data.value, s.simTargets.value), l = sideLimits(s.data.value, s.base.value, s.itemLevel.value); return u.prefix <= l.prefix && u.suffix <= l.suffix; });
  /** 整理を決めた (SimTargetSort.vue の「決めた」。2 に戻ると外れる) */
  const sortDone = ref(false);
  watch(modsDone, (v) => { if (!v) sortDone.value = false; });
  const step3 = computed(() => modsDone.value && sortDone.value && rows.value.length > 0 && slotsFit.value);
  /** 3 で入れる始めのベース代 (始め方ごと: 白 / 固定済み / 4 MOD のレア) */
  const startPrice = computed(() => (s.simStart.value === "magic" ? magicDivine.value : s.simStart.value === "fractured" ? boughtDivine.value : s.simStart.value === "four" ? fourDivine.value : s.simStart.value === "item" ? itemDivine.value : whiteDivine.value));
  const whiteDone = computed(() => step3.value && whiteOk.value && fracDone.value && num(startPrice.value) != null);
  /** 4 最安値スタート (3 ルートの比べ) は白から + フラクチャー予定の時だけ。始め方を 1 で決めた時は飛ばす */
  const stepStart = computed(() => whiteDone.value && fractureRows.value.length > 0 && s.simStart.value === "white");
  const stepOrder = computed(() => whiteDone.value && (fractureRows.value.length === 0 || startDone.value || s.simStart.value !== "white"));
  /** 6 パターンを決めた */
  const patternDone = ref(false);
  /** 途中を覚える (変わるたびに)。開き直した時は CraftStage がベース・狙い・パターンを、ここが「決めた」を戻す */
  const sessionNow = () => ({
    base: s.base.value, itemLevel: s.itemLevel.value, targets: s.simTargets.value, sockets: s.simSockets.value, start: s.simStart.value, startItem: s.simStartItem.value, startCost: s.simStartCost.value, prices: { white: whiteDivine.value, four: fourDivine.value, bought: boughtDivine.value, item: itemDivine.value, magic: magicDivine.value, rare: rareDivine.value }, order: s.simOrder.value, patterns: s.simPatterns.value,
    flags: { whiteOk: whiteOk.value, modsDone: modsDone.value, fracDone: fracDone.value, startDone: startDone.value, orderDone: orderDone.value, patternDone: patternDone.value, auto: simAuto.value },
  });
  watch(() => JSON.stringify(sessionNow()), () => { if (s.simPicked.value) writeSimSession(sessionNow()); });
  const stale = computed(() => ranFor.value !== sig.value);
  /** MOD の短い名前 (数値を外して段の下限を付ける) */
  function modShort(id: string, minTier: number): string {
    const m = s.data.value?.mods.get(id);
    if (!m) return id;
    const t = m.tiers[minTier];
    const full = fillModText(m, t ? tierDisplayRanges(t) : []).replace(/\n/g, " / ");
    const name = full.replace(/[+-]?\(?\d[\d.]*(?:[-—~]\d[\d.]*)?\)?\s*から\s*[+-]?\(?\d[\d.]*(?:[-—~]\d[\d.]*)?\)?\s*の?/g, "").replace(/[+-]?\(?\d[\d.]*(?:[-—~]\d[\d.]*)?\)?/g, "").replace(/\s*%/g, "").replace(/をアタックに追加する/, "").replace(/\s+/g, " ").trim();
    return `${name} T${m.tiers.length - minTier}+`;
  }
  return { calc, whiteCosts, busy, phase, progress, progressBox, error, recipeOut, restCost, phone, onPhoneResize, restBases, startOnce,
    results, shown, resultOf, shownName, cheapestName, showResultByName, patternNote, togglePatternOff, showResult, ranFor, sig,
    hasSteps, quizBase, magicMods, quizToRecipe, patternChecks, runnable, blocked, ONE_RUNS, activePattern, STEP_ONLY_RUNS,
    stepRun, run, stop, setHoleFiller, FOLD_KEY, open, toggle, help, whiteOk, modsDone, sortDone, fracDone, orderDone, startDone, step3, startPrice,
    whiteDone, stepStart, stepOrder, patternDone, sessionNow, stale, modShort };
}
export type SimRunCtx = ReturnType<typeof useSimRun>;
