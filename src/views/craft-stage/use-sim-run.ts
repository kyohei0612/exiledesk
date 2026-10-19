/**
 * use-sim-run.ts — シミュレーションの画面 (StageSimPanel.vue) の回す・止める・パターンごとの結果・工程の「決めた」・途中の保存。
 * StageSimPanel.vue から分けた (2026-10-16、500 行の決まり)。画面の 1 つごとに呼ぶ (状態は画面ごと)
 */
import { scrollToTop } from "../../utils/keep-place";
import { logRecord } from "../../utils/log-record";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { craftStage, nameOf, priceOf, writeSimSession } from "../../state/craft-stage";
import { fillModText } from "../../services/htc/mod-text";
import { tierDisplayRanges } from "../../services/mods/stat-scale";
import { type RecipeResult, type RecipeSpec } from "../../services/craft-stage/recipe-sim";
import { track } from "../../utils/track";
import { CURRENCY_FLOOR } from "../../vendor/poe2htc/engine/types";
import { freshItem } from "../../services/craft-stage/run-plan";
import { effectiveCls, limitOf } from "../../services/craft-stage/stage-core";
import { withRunes } from "../../vendor/poe2htc/engine/runes";
import { modTierWeight } from "../../vendor/poe2htc/engine/pool";
import { patternSets, runeEnForId, setByKey, type Pattern } from "../../services/craft-stage/pattern";
import { runQuizOnce, summarizeQuiz, type QuizResult, type QuizRoute, type QuizRun } from "../../services/craft-stage/quiz-recipe";
import { magicStartMods, quizFromSim, type QuizSimIn } from "../../services/craft-stage/quiz-build";
import { tr } from "../../i18n/lang";
import { sideLimits, sideUse } from "../../services/craft-stage/sim-methods";
import { greaterRouteCost, type GreaterRoute } from "../../services/craft-stage/sim-greater";
import type { SimTargetsCtx } from "./use-sim-targets";
import type { SimSearchCtx } from "./use-sim-search";


export function useSimRun(d: SimTargetsCtx & SimSearchCtx) {
  const { blocker, boughtDivine, fourDivine, rareDivine, fracMembers, fractureRow, fractureRows, itemDivine, magicDivine, makeRoute, makeSpec,
    market, maxSteps, methodOf, num, orderKeys, rows, runs, socketCount, targetsSig, whiteDivine } = d;
  const s = craftStage;
  /** 狙いをクイズのレシピの入力の形に (付け方は決めた物) */
  const simIn = () => s.simTargets.value.map((t) => ({ modId: t.modId, minTierIndex: t.minTierIndex, method: methodOf(t), ...(t.alts?.length ? { alts: t.alts } : {}), ...(t.need ? { need: t.need } : {}) }));
  /**
   * 計算の費用 (2026-10-05 オーナー「3 個買って 1 個成功品と仮定して、最低完全変成 3、次の完全増強、消去はセットで使う、フラクチャー 3 つは
   * 絶対にいる。深淵エッセンスは 3 個、ネクロマンシー、結晶化、骨それぞれ 3 回、確率的に計算してくれ。平均コスト 1 個作るコスト分かれば 3 倍」
   * 「完全やね消去 2 つ使うのは」)。
   *   1 回分 = 白 + 完全の変成 + (完全の増強 + 消去 × 2) × リロールの回数 + 王者 (無印) + 高貴 × (1 − p) + 骨 (壁) + フラクチャー
   *   リロールの回数 = 1 ÷ (完全の増強 1 回で狙いが付く確率)。確率はその側の普通の置き場の重み (下限 = 完全の増強の段の下限)
   *   1 個 = 1 回分 × 3 (骨の壁でフラクチャーが 1/3) + 固定できた後の消去 × 2 (2026-10-05 オーナー「消去 2 は必ずいるよ、完成後」)
   * お告げの側は、壁を置く側 = 狙いの反対側
   */
  const calc = computed(() => {
    const d = s.data.value, it = s.item.value, f = fractureRow.value;
    if (!d || !it || !f) return null;
    const m = d.mods.get(f.modId);
    if (!m) return null;
    /**
     * 変成・増強の等級は完全 (オーナー「最低完全変成、次の完全増強」)。完全の段の下限で狙いの段が出ない時 (兜のライフ T2 以上など) は
     * 上級 → 無印に落とす (2026-10-05、前は 0% と「—」で止まって見えた)
     */
    /**
     * その MOD の、下限 floor 以上・アイテムレベル以下・minIdx の段以上の重み。エンジンと同じ modTierWeight (下限に届く段が無い MOD も一番上の段は残る。
     * 前は丸ごと外していて、靴の増強で移動スピードが 30% と出た。エンジンは 18%。2026-10-20)
     */
    const wAt = (id: string, minIdx: number, floor: number): number => {
      const x = d.mods.get(id);
      return x ? modTierWeight(x, floor, s.itemLevel.value, minIdx) : 0;
    };
    // 置き場は狙いのルーンを差した物 (ウートレッドの時間術などルーンの MOD を狙う時、ルーンで増える MOD も割る方に入れる。前は差していない置き場で割り、
    // 靴の移動スピードが増強 1 回で 75% と出ていた。2026-10-20 見本の靴。2 の付きやすさ shareOf と同じ)
    const runeIds = [...new Set(s.simTargets.value.flatMap((t) => [t, ...(t.alts ?? [])]).map((t) => d.mods.get(t.modId)?.rune).filter((r): r is string => !!r))];
    const pools = (runeIds.length ? withRunes(effectiveCls(it), runeIds) : it.cls).pools.normal;
    const totalAt = (k: "prefixes" | "suffixes", floor: number): number => pools[k].reduce((a, id) => a + wAt(id, 0, floor), 0);
    const pAt = (floor: number) => {
      const w = (id: string, minIdx: number): number => wAt(id, minIdx, floor);
      // 候補ごとに自分の側の重みで割る (候補は両側でも良い)
      const totalOf = (k: "prefixes" | "suffixes"): number => totalAt(k, floor);
      const each = fracMembers.value.map((r) => {
        const total = totalOf(d.mods.get(r.modId)?.type === "suffix" ? "suffixes" : "prefixes");
        return { modId: r.modId, name: `${r.text} (${r.rank} 以上)`, p: total > 0 ? w(r.modId, r.minTierIndex) / total : 0 };
      });
      return { each, pHit: Math.min(1, each.reduce((a, x) => a + x.p, 0)) };
    };
    const grades = [
      { g: "perfect", floor: CURRENCY_FLOOR.augment.perfect, aug: "augment_perfect", tra: "transmute_perfect", ja: "完全" },
      { g: "greater", floor: CURRENCY_FLOOR.augment.greater, aug: "augment_greater", tra: "transmute_greater", ja: "上級" },
      { g: "base", floor: CURRENCY_FLOOR.augment.base, aug: "augment", tra: "transmute", ja: "無印" },
    ] as const;
    const gr = grades.find((x) => pAt(x.floor).pHit > 0) ?? grades[0];
    // 狙いのルーン (ルーンの MOD をフラクチャーで狙う時は、作り直すたびに白へ差す。2026-10-20 見本の靴: ウートレッドの代金が入っていなかった)
    const fracRunes = [...new Set(fracMembers.value.map((r) => d.mods.get(r.modId)?.rune).filter((r): r is string => !!r))].map((id) => runeEnForId(id)).filter((r): r is string => !!r);
    const runeLines = fracRunes.map((en) => ({ name: nameOf(`rune:${en}`), n: 1, each: priceOf(`rune:${en}`) }));
    // 候補ごとの付きやすさと合計 (どれか 1 つで良い)
    const { each, pHit } = pAt(gr.floor);
    const wall: "prefix" | "suffix" = m.type === "suffix" ? "prefix" : "suffix";
    const abyss = `essence:perfect:${it.cls.id}/PerfectEssence_EssenceAbyss`;
    const rerolls = pHit > 0 ? 1 / pHit : Infinity;
    const white = num(whiteDivine.value) ?? 0;
    // buy = 4 MOD のベースを買っても要る物 (壁とフラクチャー)
    // 1 から (自前): 壁は王者の後に骨 1 本だけ (側を選ばないのでお告げも深淵のエッセンスも要らない)。増強のリロールで狙いの 1 つだけ
    // になった時 (最初の増強で付かなかった時、確率 1 − p) は、王者で 2 つにしかならないので高貴で 3 つにしてから骨
    // (2026-10-05 オーナー「1 からの場合骨壁は単純で王者後は骨 1 個でいい、選ぶ必要ない」「増強リロールで 1 個だけ付いたら王者すると 1 個足りないから高貴打って 3 つに」)
    const lines: Array<{ name: string; n: number; each: number }> = [
      { name: "白のベース", n: 1, each: white },
      ...runeLines,
      { name: nameOf(gr.tra), n: 1, each: priceOf(gr.tra) },
      { name: `${nameOf(gr.aug)} (リロール)`, n: rerolls, each: priceOf(gr.aug) },
      { name: `${nameOf("annul")} (リロールに 2 つ)`, n: rerolls * 2, each: priceOf("annul") },
      // マジック → レアにする王者 (等級は問わないので無印。2026-10-05 オーナー「適当な王者がいるのか、レア化に。チャレンジ品作る時だから 3 個か」)
      { name: nameOf("regal"), n: 1, each: priceOf("regal") },
      { name: `${nameOf("exalt")} (リロールで 1 つだけの時)`, n: Math.max(0, 1 - pHit), each: priceOf("exalt") },
      { name: `${nameOf("desecrate")} (壁)`, n: 1, each: priceOf("desecrate") },
      { name: nameOf("fracture"), n: 1, each: priceOf("fracture") },
    ];
    const once = lines.reduce((a, l) => a + l.n * l.each, 0);
    /** 固定できた後に 1 度だけ: 消去 × 2 (固定した物と骨の壁のほかの外れ 2 つ) */
    const after = 2 * priceOf("annul");
    // 4 MOD のベースを買う時は満杯なので、壁は 深淵のエッセンス (結晶化で消す側を選ぶ) → 骨 (ネクロマンシー) で印を置き換える
    const buyLines: Array<{ name: string; n: number; each: number }> = [
      { name: nameOf(abyss), n: 1, each: priceOf(abyss) },
      { name: nameOf(wall === "prefix" ? "OmenofSinistralCrystallisation" : "OmenofDextralCrystallisation"), n: 1, each: priceOf(wall === "prefix" ? "OmenofSinistralCrystallisation" : "OmenofDextralCrystallisation") },
      { name: nameOf("desecrate"), n: 1, each: priceOf("desecrate") },
      { name: nameOf(wall === "prefix" ? "OmenofSinistralNecromancy" : "OmenofDextralNecromancy"), n: 1, each: priceOf(wall === "prefix" ? "OmenofSinistralNecromancy" : "OmenofDextralNecromancy") },
      { name: nameOf("fracture"), n: 1, each: priceOf("fracture") },
    ];
    /**
     * 4 MOD・当たり 1 のベースを買う時の 1 回分 (2026-10-05 オーナー「ベース買うか自前でするかの指標は? 4 MOD で当たり 1 のベース買って、
     * フラクチャーはどのみちかかるけど、消去が 2 個でいい、あとベース代」)。ベース代 + 消去 × 2 + 壁 (深淵のエッセンス・結晶化・骨・ネクロマンシー) + フラクチャー。
     * 分かれ目 = 自前の 1 回分 − ベース代以外 (これより安いベースなら買う方が得)
     */
    const buyRest = buyLines.reduce((a, l) => a + l.n * l.each, 0);
    const breakEven = once - buyRest;
    const fourN = num(fourDivine.value);
    const fourB = fourN;
    const buyOnce = fourB != null ? fourB + buyRest : null;
    /**
     * 適当なレアから (2026-10-18 オーナー「白と適当なレア → 消去でカオススパムルート、その費用の計算」): 満杯と見たレアを消去で 1 MOD まで削り、
     * 残った 1 つをカオスで入れ替えて狙いが付くまで (1 MOD なのでカオスは外して 1 つ付けるだけ、付く物は両側の重みから) → 高貴 × 2 で 3 MOD
     * → 骨の壁 → フラクチャー。1 個 = (レア + これ) × 3 + 消去 × 2 (白からと同じ)。カオスの等級は 1 個あたりが一番安い物 (段の下限は高貴と同じ)
     */
    const slots = (() => {
      try { const fi = { ...freshItem(d, s.base.value, s.itemLevel.value), rarity: "rare" as const }; return limitOf(fi, "prefix") + limitOf(fi, "suffix"); } catch { return 6; }
    })();
    const chaosGrades = [
      { id: "chaos_perfect", floor: CURRENCY_FLOOR.exalt.perfect, ja: "完全" },
      { id: "chaos_greater", floor: CURRENCY_FLOOR.exalt.greater, ja: "上級" },
      { id: "chaos", floor: CURRENCY_FLOOR.exalt.base, ja: "無印" },
    ].map((g) => {
      const all = totalAt("prefixes", g.floor) + totalAt("suffixes", g.floor);
      const p = all > 0 ? Math.min(1, fracMembers.value.reduce((a, r) => a + wAt(r.modId, r.minTierIndex, g.floor), 0) / all) : 0;
      return { ...g, p };
    }).filter((g) => g.p > 0);
    const cg = chaosGrades.length ? chaosGrades.reduce((a, b) => (priceOf(b.id) / b.p < priceOf(a.id) / a.p ? b : a)) : null;
    const rareLines: Array<{ name: string; n: number; each: number }> = cg ? [
      { name: `${nameOf("annul")} (1 MOD まで)`, n: Math.max(0, slots - 1), each: priceOf("annul") },
      { name: `${nameOf(cg.id)} (狙いが付くまで)`, n: 1 / cg.p, each: priceOf(cg.id) },
      { name: `${nameOf("exalt")} (3 MOD に)`, n: 2, each: priceOf("exalt") },
      { name: `${nameOf("desecrate")} (壁)`, n: 1, each: priceOf("desecrate") },
      { name: nameOf("fracture"), n: 1, each: priceOf("fracture") },
    ] : [];
    const rareRest = cg ? rareLines.reduce((a, l) => a + l.n * l.each, 0) : Infinity;
    const rareN = num(rareDivine.value);
    const rareTotal = rareN != null && cg ? (rareN + rareRest) * 3 + after : null;
    const rareChaos = cg ? { grade: cg.ja, p: cg.p, n: 1 / cg.p } : null;
    const g = greaterRouteCost({ data: d, targets: simIn(), fracSide: m.type === "suffix" ? "suffix" : "prefix", p: pHit, grade: gr, wAt, totalAt, white, runeLines, price: priceOf, name: nameOf });
    if (g) {
      // グレーターエッセンスを巻き込む道: 自前のフラクチャーだけ (買う始め方・適当なレアの道は無し)。固定の後に消さない (残す MOD を持ったまま進む)
      return { pHit, each, rerolls: g.augment, lines: g.lines, buyLines, once: g.once, after: 0, total: g.once * 3, noAbyss: false, cantRoll: pHit === 0 || g.cantKeep, grade: gr.ja, buyRest, breakEven: 0, buyOnce: null,
        slots, rareLines: [], rareRest: Infinity, rareTotal: null, rareChaos: null, greater: g };
    }
    return { pHit, each, rerolls, lines, buyLines, once, after, total: once * 3 + after, noAbyss: !(priceOf(abyss) > 0), cantRoll: pHit === 0, grade: gr.ja, buyRest, breakEven, buyOnce,
      slots, rareLines, rareRest, rareTotal, rareChaos, greater: null as GreaterRoute | null };
  });
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
    // 始め方を 1 で決めた時はその 1 つ (固定済みを買う = 入れた値段 / 4 MOD を買う = (ベース + 壁 + フラクチャー) × 3 + 消去 × 2)
    if (s.simStart.value === "fractured") return num(boughtDivine.value);
    if (s.simStart.value === "item") return num(itemDivine.value);
    if (s.simStart.value === "magic") return num(magicDivine.value);
    if (s.simStart.value === "four") return c && c.buyOnce != null && Number.isFinite(c.buyOnce) ? c.buyOnce * 3 + c.after : null;
    const xs: number[] = [];
    if (c) xs.push(c.total);
    if (c && c.buyOnce != null) xs.push(c.buyOnce * 3 + c.after);
    if (c && c.rareTotal != null) xs.push(c.rareTotal);
    const bN = num(boughtDivine.value);
    if (bN != null) xs.push(bN);
    const ys = xs.filter((x) => Number.isFinite(x));
    return ys.length ? Math.min(...ys) : null;
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
     * フラクチャー予定があれば、白・適当なレア・MOD 付きレア・フラクチャー済みを買う のどれから始めても、打ち方は「フラクチャー済みのベース (固定 MOD 1 つのレア)」から。
     * ベース代は 3 の一番安い道の費用 (startOnce = フラクチャー済みになるまで、やり直しの買い直し込み)。前は白から始まり、3 の値段 (フラクチャー済みまで) と
     * 5 の見出し (フラクチャー済みのベースから) と食い違っていた (2026-10-19 オーナーと通した時。10-08 の決め [[sim-cost-model]])
     */
    const fracStart = (s.simStart.value === "white" || s.simStart.value === "four" || s.simStart.value === "fractured") && s.simTargets.value.some((t) => methodOf(t) === "fracture");
    const st = fracStart ? "fractured" : s.simStart.value;
    const startPrice = st === "item" ? num(itemDivine.value) ?? 0 : st === "magic" ? num(magicDivine.value) ?? 0 : st === "fractured" ? startOnce.value ?? 0 : st === "four" ? num(fourDivine.value) ?? 0 : num(whiteDivine.value) ?? 0;
    return {
      data: d, base: s.base.value, itemLevel: s.itemLevel.value, start: st, startPrice, sockets: socketCount.value, startItem: startItemAt(),
      // ⑤ の関門は ④ の順番 (先の狙いは「付いていない」と見る。2026-10-20)。固定済みから始める時のどれが固定されたかは 3 の付きやすさの重み
      order: orderKeys.value, fracWeights: Object.fromEntries((calc.value?.each ?? []).map((e) => [e.modId, e.p])),
      targets: simIn(),
      // グレーターエッセンスを巻き込む道: 固定済みのレアは、残す MOD + エッセンス + 壁が付いた物 (2026-10-20)
      ...(fracStart && calc.value?.greater ? { greater: { essKey: calc.value.greater.essKey, keep: calc.value.greater.keep } } : {}),
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
      // 値段は 1 回引いたら覚える (相場の一覧を毎手引くと、500 回で 46 秒かかっていた)
      const memo = new Map<string, number>();
      const price = (k: string): number => { let v = memo.get(k); if (v == null) { v = priceOf(k); memo.set(k, v); } return v; };
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
          const { recipe } = quizFromSim(qb, JSON.parse(JSON.stringify(p.quiz)) as typeof p.quiz);
          const qruns: QuizRun[] = [];
          for (let i = 0; i < spec.runs; i++) {
            qruns.push(runQuizOnce(d, recipe, runSeed + i * 7919, { price, maxSteps: maxSteps.value }));
            if (i % 10 === 9) { progress.value = [k * spec.runs + i + 1, total]; await new Promise((r) => setTimeout(r)); if (my !== gen) return; }
          }
          const r = quizToRecipe(summarizeQuiz(qruns, price), recipe.routes[0]);
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
    flags: { whiteOk: whiteOk.value, modsDone: modsDone.value, fracDone: fracDone.value, startDone: startDone.value, orderDone: orderDone.value, patternDone: patternDone.value },
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
  return { calc, busy, phase, progress, progressBox, error, recipeOut, restCost, phone, onPhoneResize, restBases, startOnce,
    results, shown, resultOf, shownName, cheapestName, showResultByName, patternNote, togglePatternOff, showResult, ranFor, sig,
    hasSteps, quizBase, magicMods, quizToRecipe, patternChecks, runnable, blocked, ONE_RUNS, activePattern, STEP_ONLY_RUNS,
    stepRun, run, stop, FOLD_KEY, open, toggle, help, whiteOk, modsDone, sortDone, fracDone, orderDone, startDone, step3, startPrice,
    whiteDone, stepStart, stepOrder, patternDone, sessionNow, stale, modShort };
}
export type SimRunCtx = ReturnType<typeof useSimRun>;
