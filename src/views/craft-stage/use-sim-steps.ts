/**
 * use-sim-steps.ts — シミュレーションの画面 (StageSimPanel.vue) の工程の段・やり直し・状態が変わった時の戻し・1 つ戻す (Ctrl+Z)。
 * StageSimPanel.vue から分けた (2026-10-16、500 行の決まり)。画面の 1 つごとに呼ぶ (状態は画面ごと)
 */
import { useArmed } from "../../utils/use-armed";
import { revealBottom, scrollToTop } from "../../utils/keep-place";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { craftStage, writeSimSession } from "../../state/craft-stage";
import { type Pattern, ANY_TARGET, isRest } from "../../services/craft-stage/pattern";
import type { SimTargetsCtx } from "./use-sim-targets";
import type { SimRunCtx } from "./use-sim-run";
import { SIM_ILVL_MAX } from "./use-stage-base";
import { sideLimits, sideUse, sortBuckets } from "../../services/craft-stage/sim-methods";

/**
 * 工程を押すとそこからやり直す (後ろの工程は決め直し)。「1 つ戻す」は今の 1 つ前の工程へ
 * (2026-10-05 オーナー「各工程クリックでそこからやり直させて欲しい。ミスクリックもあるから 1 つ戻すボタンも」)
 */
export type Stage = "mods" | "white" | "start" | "order";
/**
 * 「1 つ戻す」= 直前の操作を 1 つ取り消す (工程ではなく、1 つ前の状態に。2026-10-05 オーナー「1 つ戻すは手じゃなくて行動、1 つ前の作業の状態」)。
 * 狙い (MOD・段・あるいは・どれか N つ・フラクチャー・付け方・順番)・工程の決めた / 戻した・ソケット・白ベースの値段を、変わるたびに前の形を積む
 */
/** patterns: やり直しで空にする前のパターン (空にした時だけ入れる。「1 つ戻す」でパターンも戻す) */
export type Snap = { targets: string; whiteOk: boolean; modsDone: boolean; fracDone: boolean; startDone: boolean; orderDone: boolean; sockets: number | null; white: number | null; patterns?: string };

export function useSimSteps(d: SimTargetsCtx & SimRunCtx) {
  const { fracDone, sortDone, hasSteps, itemDivine, keptKey, modsDone, num, orderDone, patternDone, phone, recipeOut, restBases, restCost,
    restoring, results, rows, sockets, socketsOk, startDone, step3, stepOrder, stepStart, whiteDivine, whiteOk } = d;
  const s = craftStage;
  const step4pre = computed(() => stepOrder.value && orderDone.value);
  /** 段の番号: 出ない段 (始め方を 1 で決めた時の 4 など) は詰める (2026-10-09 初見レビュー「4 はどこ?」) */
  const stepNo = computed(() => {
    const start = 3 + (step3.value ? 1 : 0);
    const order = start + (stepStart.value ? 1 : 0);
    return { start, order, play: order + (stepOrder.value ? 1 : 0) };
  });
  /** 2〜5 を 1 行に畳む (6 パターンを作る間) */
  const fold = ref(true);
  const step4 = computed(() => step4pre.value);
  watch(orderDone, (v) => { if (!v) patternDone.value = false; });
  /**
   * 狙いを選び直して、パターンの手が今の狙いに無い MOD を指していたら、パターンを空に戻す
   * (2026-10-07 オーナー「新しくしたらそもそもここのパターン 1 リセットだろ、前のキャッシュで読み込むと変なことになる」。
   * 前の手が残って、カードに MOD の英語の id が出ていた)
   */
  function resetStalePatterns(): void {
    const ids = new Set(s.simTargets.value.flatMap((t) => [t.modId, ...(t.alts ?? []).map((a) => a.modId)]));
    const stale = s.simPatterns.value.some((p) => p.steps.some((st) => !st.set.startsWith("rune|") && [st.target, st.target2, st.target3].some((x) => !!x && x !== ANY_TARGET && !isRest(x) && !ids.has(x))));
    if (stale) resetPatterns();
  }
  /**
   * パターンを空に戻す。6 パターンより前 (2〜5・アイテムレベル・ソケット) をやり直したら必ず (2026-10-07 オーナー「ベース選び直さなくても、
   * シミュレーション手前でやり直しが起こったら絶対リセットかけないとバグる」)。空にする前の物は「1 つ戻す」の控えに入れる
   */
  function resetPatterns(): void {
    if (!s.simPatterns.value.some(hasSteps)) return;
    lastSnap = { ...lastSnap, patterns: JSON.stringify(s.simPatterns.value) };
    s.simPatterns.value = [{ name: "パターン 1", steps: [], quiz: { v: 3, rules: {} } }];
    results.value = [];
    // 結果のブロックも消す (残すとパターン名の無い「の 1 個あたり」と前の内訳が出て、ベース代がクラフトに化けて見えた。2026-10-08 使い倒しテスト 1)
    recipeOut.value = null;
    restCost.value = null;
    restBases.value = 1;
    patternDone.value = false;
  }
  watch(() => s.simTargets.value.map((t) => t.modId).join(","), () => { if (!restoring.v) resetStalePatterns(); });
  /** 始め方が白以外なら、狙いの最初の 1 つが固定 MOD (1 ベースで選んだ始め方。2026-10-08)。手打ちの状態からは、固定されている MOD を狙いに入れた時だけ */
  watch([() => s.simStart.value, () => s.simTargets.value.length], () => {
    if (restoring.v || s.simStart.value === "white") return;
    const list = s.simTargets.value;
    if (s.simStart.value === "item") {
      const fixed = s.simStartItem.value ? [...s.simStartItem.value.prefixes, ...s.simStartItem.value.suffixes].find((m) => m.fractured)?.modId : undefined;
      if (fixed && list.some((t) => t.modId === fixed && t.method !== "fracture")) s.simTargets.value = list.map((t) => (t.modId === fixed ? { ...t, method: "fracture" as const } : t));
      return;
    }
    if (!list.length || list.some((t) => t.method === "fracture")) return;
    s.simTargets.value = list.map((t, i) => (i === 0 ? { ...t, method: "fracture" as const } : t));
  });
  // 始め方を変えたら 3 から先はやり直し (ベース代の入れ方・4 の有無が変わる)
  watch(() => s.simStart.value, (k) => {
    if (restoring.v) return;
    if (k === "item") itemDivine.value = s.simStartCost.value + (num(whiteDivine.value) ?? 0);
    if (whiteOk.value || startDone.value) goTo("white");
  }, { immediate: true });
  watch(() => s.simStartItem.value, () => { if (!restoring.v && s.simStart.value === "item") itemDivine.value = s.simStartCost.value + (num(whiteDivine.value) ?? 0); });
  /**
   * アイテムレベルを下げたら、届かなくなった段の狙いはそのレベルで届く一番良い段に落とす (1 つも届かなければ外す)。
   * 残すと付きやすさ <0.1% のまま回せて完成 0% になっていた (2026-10-08 使い倒しテスト 2)
   */
  /** アイテムレベルで下げる前の段 (戻した時に元の段へ。2026-10-08 完成判定 5: 下げたまま黙っていた) */
  const wantTier = new Map<string, number>();
  const ilvlNote = ref("");
  watch(() => s.itemLevel.value, (lv) => {
    const d = s.data.value;
    if (!d || restoring.v) return;
    let lowered = 0, raised = 0;
    const fit = (t: { modId: string; minTierIndex: number }): { modId: string; minTierIndex: number } | null => {
      const tiers = d.mods.get(t.modId)?.tiers ?? [];
      if (!tiers.length) return t;
      const want = Math.max(t.minTierIndex, wantTier.get(t.modId) ?? -1);
      // 届く一番良い段 (want 以下)
      let best = -1;
      for (let i = 0; i <= want && i < tiers.length; i++) if (tiers[i]!.ilvl <= lv) best = i;
      if (best < 0) return null;
      if (best < want) wantTier.set(t.modId, want); else wantTier.delete(t.modId);
      if (best < t.minTierIndex) lowered++;
      if (best > t.minTierIndex) raised++;
      return { ...t, minTierIndex: best };
    };
    let changed = false;
    const next = s.simTargets.value.flatMap((t) => {
      const c = fit(t);
      const alts = (t.alts ?? []).map(fit).filter((x): x is { modId: string; minTierIndex: number } => !!x);
      if (!c || c.minTierIndex !== t.minTierIndex || alts.length !== (t.alts?.length ?? 0) || alts.some((a, i) => a.minTierIndex !== t.alts![i]!.minTierIndex)) changed = true;
      return c ? [{ ...t, minTierIndex: c.minTierIndex, ...(t.alts ? { alts } : {}) }] : [];
    });
    if (changed) s.simTargets.value = next;
    ilvlNote.value = lowered ? `アイテムレベル ${lv} では届かない段を ${lowered} つ下げました (レベルを戻すと元の段に戻る)` : raised ? `元の段に ${raised} つ戻しました` : "";
  });
  watch(() => rows.value.length, (n) => { if (n === 0) { resetPatterns(); modsDone.value = false; whiteOk.value = false; fracDone.value = false; startDone.value = false; orderDone.value = false; } });
  // 2 狙う MOD に戻ったら、アイテムレベルは一番上に戻して全部の段を選べるように (3 に来るとまた狙いが全部付く一番低いレベルが入る、SimStartPick.vue)。
  // エミュレーターの状態からは、そのアイテムのレベルのまま
  watch(modsDone, (v) => { if (!v && !restoring.v && s.simStart.value !== "item") s.itemLevel.value = SIM_ILVL_MAX; });
  watch(keptKey, () => { if (restoring.v) return; resetPatterns(); modsDone.value = false; fracDone.value = false; startDone.value = false; orderDone.value = false; whiteOk.value = false; s.simAltFor.value = null; });
  // 下の MOD 一覧は ① で選んでいる間だけ。「決めた」で閉じる (2026-10-05 オーナー「役目終えたらこのベースに付く MOD はしまっていい、最初以外使わん」)。
  // 足し直す時は ① の「直す」で開き直す
  watch(() => socketsOk.value && !modsDone.value, (v) => { s.simShowMods.value = v; }, { immediate: true });
  function goTo(st: Stage): void {
    resetPatterns();
    if (st === "mods") modsDone.value = false;
    if (st === "mods" || st === "white") { whiteOk.value = false; fracDone.value = false; }
    if (st !== "order") startDone.value = false;
    orderDone.value = false;
  }
  /**
   * リセット: シミュレーションを最初 (1 ベースを選ぶ所) に戻す。選んだ MOD・工程・結果は消し、入れた値段 (ベースごとに覚えている) は残す。
   * 1 つ戻すでも戻せないので、2 回押した時だけ (2026-10-05 オーナー「シンプルにリセットボタン上に作って」)
   */
  const resetArm = useArmed();
  function resetAll(): void {
    if (!resetArm.arm()) return;
    s.simTargets.value = [];
    s.simAltFor.value = null;
    modsDone.value = false; whiteOk.value = false; fracDone.value = false; startDone.value = false; orderDone.value = false;
    recipeOut.value = null;
    restCost.value = null;
    results.value = [];
    s.simOrder.value = [];
    s.simPatterns.value = [{ name: "パターン 1", steps: [], quiz: { v: 3, rules: {} } }];
    s.simSockets.value = null;
    s.simStart.value = "white";
    s.simStartItem.value = null;
    // 覚えていた途中も消す (リセットはベースを選ぶ所から)
    void nextTick(() => writeSimSession(null));
    // ベースを選ぶ所から (この画面は一度消えて、選び直すと新しく始まる)
    s.simPicked.value = false;
  }
  /**
   * 手打ちの状態から: 2 狙う MOD を決めたら 3〜5 は飛ばしてそのまま 6 のツリー (2026-10-08 オーナー「この状態からシミュレーションツリーをスタート、
   * 費用もそこから」)。ベース代は既定のまま (作り直す時の買い直しの値段)、出す費用はこの状態から先
   */
  watch(modsDone, (v) => { if (v) ilvlNote.value = ""; });
  // まとめる組が無く枠にも収まっていれば、整理の欄は飛ばして 3 へ (狙い 1 つでも決めたを 2 回押していた。2026-10-18 初めての 10 人)
  watch(modsDone, (v) => {
    if (!v || restoring.v) return;
    const u = sideUse(s.data.value, s.simTargets.value), l = sideLimits(s.data.value, s.base.value, s.itemLevel.value);
    if (!sortBuckets(s.data.value, s.simTargets.value).length && u.prefix <= l.prefix && u.suffix <= l.suffix) sortDone.value = true;
  });
  // エミュレーターの状態からも 3 (始め方・ベース代)・4 (付ける順番) を通る (前は自動で済ませて 2 → 5 に番号が飛んだ。2026-10-18 初めての 10 人の 10 人目)
  /**
   * 「決めた →」で次の工程が開いたら、次に決める段 (金の枠) の下の線 + 24px まで送る (2026-10-08 オーナー「決めたで順に進むけど、スクロールは基本進むなら一番下に」、
   * 2026-10-18「番号が進む時もスクロールで次工程表示は必ず」「下枠 + 24px」)。戻した時 (この段に戻る) は動かさない
   */
  const panelEl = ref<HTMLElement | null>(null);
  watch([modsDone, sortDone, whiteOk, startDone, orderDone], (now, prev) => {
    if (restoring.v || !now.some((v, i) => v && !prev[i])) return;
    // スマホは画面が短いので、次に決める段 (金の枠) の頭を画面の上に (2026-10-09 スナップで確認: 一番下だと次の段が画面の下の端に出ていた)
    void nextTick(() => requestAnimationFrame(() => {
      const cur = panelEl.value?.querySelector("[data-sim-cur]");
      if (cur && phone.value) scrollToTop(cur);
      else if (cur) revealBottom(cur);
      else panelEl.value?.scrollIntoView({ block: "end", behavior: "smooth" });
    }));
  });
  /** 3 白ベース設定の「決めた」: 値段とフラクチャー予定 (無ければ「しない」) */
  function whiteDecide(): void {
    whiteOk.value = true;
    fracDone.value = true;
  }
  const snapNow = (): Snap => ({ targets: JSON.stringify(s.simTargets.value), whiteOk: whiteOk.value, modsDone: modsDone.value, fracDone: fracDone.value, startDone: startDone.value, orderDone: orderDone.value, sockets: sockets.value, white: whiteDivine.value });
  const undoStack = ref<Snap[]>([]);
  let lastSnap = snapNow();
  watch(() => JSON.stringify(snapNow()), () => {
    const cur = snapNow();
    if (!restoring.v && JSON.stringify(cur) !== JSON.stringify(lastSnap)) undoStack.value = [...undoStack.value.slice(-49), lastSnap];
    lastSnap = cur;
  });
  // ベースを変えたら積んだ物は捨てる (別のアイテムの状態に戻さない)
  watch(() => s.base.value, () => { undoStack.value = []; lastSnap = snapNow(); });
  // Ctrl+Z (手で打つ画面と同じ)。シミュレーションを開いている時はこちらの「1 つ戻す」(CraftStage.vue は手で打つ時だけ)
  function onKey(e: KeyboardEvent): void {
    if (s.mode.value !== "sim" || s.replay.value) return; // 手で打つ画面にいる間も消さずに隠しているので
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); undo(); }
  }
  onMounted(() => window.addEventListener("keydown", onKey));
  onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
  function undo(): void {
    const prev = undoStack.value[undoStack.value.length - 1];
    if (!prev) return;
    undoStack.value = undoStack.value.slice(0, -1);
    restoring.v = true;
    s.simTargets.value = JSON.parse(prev.targets);
    whiteOk.value = prev.whiteOk; modsDone.value = prev.modsDone; fracDone.value = prev.fracDone; startDone.value = prev.startDone ?? false; orderDone.value = prev.orderDone;
    sockets.value = prev.sockets; whiteDivine.value = prev.white;
    if (prev.patterns) s.simPatterns.value = JSON.parse(prev.patterns) as Pattern[];
    void nextTick(() => { lastSnap = snapNow(); restoring.v = false; });
  }
  return { step4pre, stepNo, fold, step4, resetStalePatterns, resetPatterns, wantTier, ilvlNote, goTo, resetArm, resetAll, panelEl,
    whiteDecide, snapNow, undoStack, onKey, undo };
}
