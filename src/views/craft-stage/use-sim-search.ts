/**
 * use-sim-search.ts — シミュレーションの画面 (StageSimPanel.vue) の取引所で探す (開くだけ)・完成品の値段・フラクチャー済みを作る費用・費用の見積もり。
 * StageSimPanel.vue から分けた (2026-10-16、500 行の決まり)。画面の 1 つごとに呼ぶ (状態は画面ごと)
 */
import { inGroup } from "../../services/mods/item-classes";
import { htcBaseInfo } from "../../services/htc/patch";
import { AFFIX_COUNT } from "../../services/htc/tree-buy";
import { computed, onMounted, ref, watch } from "vue";
import { craftStage, priceOf } from "../../state/craft-stage";
import { runRecipe } from "../../services/craft-stage/recipe-sim";
import { tradeFiltersFor } from "../../services/htc/buy-or-craft";
import { buildSpecQuery } from "../../services/trade2/query/spec";
import { openTradeQuery } from "../../services/pob-check/trade-links";
import { marketStore, MARKET_MAX_AGE_MS } from "../../state/market-store";
import { patternSets, setByKey, ANY_TARGET, isDouble, hasCands, isRest } from "../../services/craft-stage/pattern";
import { searchModGroups, type ModGroup, type ModPick } from "../../services/craft-stage/trade-search";
import type { SimTargetsCtx } from "./use-sim-targets";
import type { Kept } from "./use-sim-targets";


export function useSimSearch(d: SimTargetsCtx) {
  const { blocker, fracMembers, fractureRow, fractureRows, keptKey, makeRoute, methodOf, num, restRows, socketCount, socketQuery,
    targetsSig, toExalt, whiteDivine } = d;
  const s = craftStage;
  /** 相場 (カレンシー) */
  const market = marketStore;
  onMounted(() => void market.ensureMarket(MARKET_MAX_AGE_MS));
  /** 4 MOD のベースを取引所で探す (狙いの MOD が付いたレア。固定済みは除く。開くだけ) */
  /**
   * 取引所で探すアイテムレベルの下限 = 狙う MOD (候補も) のうち、狙いの段 (T○ 以上の一番下の段) を付けられるアイテムレベルの一番高い物
   * (2026-10-06 オーナー「最安値スタートは狙ってる MOD の最大値のアイテムレベルで探しておｋ」)。前は 1 で選んだアイテムレベルそのまま (82 など)。
   * 狙いが無ければ選んだアイテムレベル
   */
  // ジュエルはアイテムレベルを見ないので、取引所の検索にも入れない (2026-10-12 オーナー「ジュエルはアイテムレベル廃止」)
  const searchIlvl = computed((): number | undefined => {
    const d = s.data.value;
    if (inGroup(htcBaseInfo()[s.base.value ?? ""]?.cls ?? "", "jewel")) return undefined;
    // エッセンスの MOD はアイテムレベルに関係なく付くので数えない (2026-10-07)
    const need = s.simTargets.value.flatMap((t) => [t, ...(t.alts ?? [])]).map((x) => {
      const m = d?.mods.get(x.modId);
      return m && m.source !== "essence" && m.source !== "perfect_essence" ? m.tiers[x.minTierIndex]?.ilvl ?? 0 : 0;
    });
    const n = Math.max(0, ...need);
    return n > 0 ? Math.min(n, s.itemLevel.value) : s.itemLevel.value;
  });
  async function searchFour(): Promise<void> {
    const q = fracQuery("explicit");
    // MOD は 4 つまで (3 MOD + 狙い 1。5〜6 MOD だとフラクチャーの当たりが 1/5〜1/6 になる。2026-10-08 オーナー「4 MOD 以下の検索フィルターになってない」)
    if (q) await openTradeQuery(buildSpecQuery({ baseType: s.base.value, rarity: "nonunique", ilvlMin: searchIlvl.value, ...q, stats: [...q.stats, { id: AFFIX_COUNT, max: 4 }], fracturedItem: false, noSanctified: true, ...socketQuery() }));
  }
  /**
   * フラクチャーの候補の取引所の条件。候補が 2 つ以上なら「どれか 1 つ」のグループ (取引所の count、1 つ以上)
   * (2026-10-05 オーナー「フラクチャーどれか 1 つで検索かけるのに、これだと火耐性しか出ない、どれかの検索方法ないか」: 前は最初の候補だけで探していた)。
   * kind: 普通 (explicit) か固定済み (fractured)
   */
  function fracQuery(kind: "explicit" | "fractured"): { stats: { id: string; min?: number }[]; anyOf: { filters: { id: string; min?: number }[]; count: number }[] } | null {
    const d = s.data.value;
    if (!d || !fracMembers.value.length) return null;
    const fs = fracMembers.value.flatMap((m) => tradeFiltersFor(d, [{ modId: m.modId, minTierIndex: m.minTierIndex }]).filters
      .map((x) => ({ id: x.id.replace(/^explicit\./, `${kind}.`), ...(x.min != null ? { min: x.min } : {}) })));
    if (!fs.length) return null;
    return fs.length === 1 ? { stats: fs, anyOf: [] } : { stats: [], anyOf: [{ filters: fs, count: 1 }] };
  }
  /** 白のベースを取引所で探す (開くだけ) */
  async function searchWhite(): Promise<void> {
    await openTradeQuery(buildSpecQuery({ baseType: s.base.value, rarity: "normal", ilvlMin: searchIlvl.value, stats: [], noSanctified: true, ...socketQuery() }));
  }
  /** フラクチャーの候補が違う側に分かれている (作り方が変わるので今は止める) */
  /** フラクチャーの候補が両側に分かれている (選べるが、同じ側を推奨する) */
  const mixedSides = computed(() => new Set(fractureRows.value.map((r) => r.side)).size > 1);
  const makeSpec = computed(() => ({ kind: "make" as const, route: makeRoute.value, blocker: makeRoute.value === "magic" && blocker.value }));
  /** 付いた状態のベースを取引所で探す (開くだけ。値段は手で入れる) */
  async function searchBought(): Promise<void> {
    const q = fracQuery("fractured");
    if (q) await openTradeQuery(buildSpecQuery({ baseType: s.base.value, rarity: "nonunique", ilvlMin: searchIlvl.value, ...q, fracturedItem: true, noSanctified: true, ...socketQuery() }));
  }

  /**
   * 完成品の値段 (神、手で入れる)。2026-10-05 オーナー「完成品はトレードへ案内させる URL でおけ、手動で入れてもらおう」。
   * ベース・アイテムレベル・狙い (段) の組ごとに覚える
   */
  const doneDivine = ref<number | null>(null);
  const DONE_KEY = "exiledesk.craftStageSim.donePrices";
  const doneAll = ref<Record<string, Kept>>({});
  try { doneAll.value = JSON.parse(localStorage.getItem(DONE_KEY) ?? "{}"); } catch { /* 無くてよい */ }
  const doneKey = computed(() => `${keptKey.value}|${targetsSig().split(",").sort().join(",")}`);
  let loadingDone = false;
  watch(doneKey, () => {
    loadingDone = true;
    doneDivine.value = toExalt(doneAll.value[doneKey.value]);
    void Promise.resolve().then(() => { loadingDone = false; });
  }, { immediate: true });
  watch(doneDivine, (v) => {
    if (loadingDone) return;
    const cur = { ...doneAll.value };
    const n = num(v);
    if (n == null) delete cur[doneKey.value];
    else cur[doneKey.value] = { v: n, at: Date.now(), u: "exalt" };
    doneAll.value = cur;
    try { localStorage.setItem(DONE_KEY, JSON.stringify(cur)); } catch { /* 無くてよい */ }
  });
  const doneAge = computed(() => {
    const k = doneAll.value[doneKey.value];
    if (!k) return null;
    const min = Math.floor((Date.now() - k.at) / 60000);
    const text = min < 1 ? "今入れた" : min < 60 ? `${min} 分前に入れた` : min < 1440 ? `${Math.floor(min / 60)} 時間前に入れた` : `${Math.floor(min / 1440)} 日前に入れた`;
    return { text, old: min >= 1440 };
  });
  /**
   * 完成品を取引所で探す (開くだけ)。一番ゆるく: どの MOD も 普通 / 固定済み / 冒涜 のどれでもいい。
   * フラクチャーの候補が 2 つ以上なら「そのどれか」を 1 つのグループに
   */
  async function searchDone(): Promise<void> {
    const d = s.data.value;
    if (!d) return;
    // 検索の組み立ては trade-search.ts に 1 本化 (2026-10-07 オーナー「エンジン作ってそれと同じ奴を実装、一括管理」)
    const groups: ModGroup[] = [];
    if (fracMembers.value.length) groups.push({ picks: fracMembers.value });
    for (const r of restRows.value) groups.push({ picks: [r, ...(s.simTargets.value.find((t) => t.modId === r.modId)?.alts ?? [])], count: r.need });
    await searchModGroups(d, { groups });
  }

  /**
   * そのパターンの組めている所まで (付ける MOD と固定) が付いた物を取引所で探す (開くだけ、JP)。2026-10-07 オーナー「回すの横あたりに、
   * ここまでを trade2 へそのまま JP で検索できるボタン」。完成品の検索と同じくゆるく (普通 / 固定済み / 冒涜のどれでも)。
   * 候補の手 (どれか N つ) はグループに、残りの手があれば候補ぜんぶ。打つだけ・ルーンの手は入れない
   */
  async function searchPattern(k: number): Promise<void> {
    const d = s.data.value, it = s.item.value, p = s.simPatterns.value[k];
    if (!d || !it || !p) return;
    const sets = patternSets(it.cls);
    const withAlts = (id: string): ModPick[] => { const t = s.simTargets.value.find((x) => x.modId === id); return t ? [t, ...(t.alts ?? [])] : []; };
    const groups: ModGroup[] = [];
    if (fracMembers.value.length) groups.push({ picks: fracMembers.value });
    // クイズのレシピ (ADR-003): 狙う MOD (フラクチャー以外) をそれぞれ。どれか N つは「この中から N つ」
    if (p.quiz) {
      for (const t of s.simTargets.value) {
        if (methodOf(t) === "fracture") continue;
        const picks = [t, ...(t.alts ?? [])];
        groups.push(picks.length > 1 ? { picks, count: Math.max(1, Math.min(t.need ?? 1, picks.length)) } : { picks });
      }
      await searchModGroups(d, { groups });
      return;
    }
    const restOfStep = new Set(p.steps.filter((st) => isRest(st.target)).map((st) => Number(st.target!.slice(5))));
    p.steps.forEach((st, j) => {
      const x = setByKey(sets, st.set);
      if (!x || !st.target || st.target === ANY_TARGET || x.kind === "rune" || isRest(st.target)) return;
      const ids = [st.target, st.target2, st.target3].filter((y): y is string => !!y);
      // 候補の手: 残りの手が後にあれば候補ぜんぶ、無ければどれか N つ (偉大は 2)
      if (ids.length > 1 && hasCands(x)) groups.push({ picks: ids.flatMap(withAlts), count: restOfStep.has(j) ? ids.length : isDouble(x) ? 2 : 1 });
      else groups.push({ picks: withAlts(st.target) });
    });
    await searchModGroups(d, { groups });
  }

  /**
   * フラクチャー済みのベースを自分で作ったらいくらか (買うかの分かれ目)。2026-10-05 オーナー「ベースって買った方がええよな、基準は」→
   * 「作るとこのくらい → これより安ければ買う方が得」。錬金 → カオス → フラクチャー (外れたら白から) → 消去で固定した 1 個だけ、を回す
   */
  const makeCost = ref<{ key: string; perDone: number; p50: number; p90: number; pDone: number; fractures: number; magic: number; chaos: number; bases: number } | null>(null);
  const makeBusy = ref(false);
  let makeGen = 0;
  const makeKey = computed(() => (fractureRow.value
    ? `${s.base.value}|${s.itemLevel.value}|${fracMembers.value.map((f) => `${f.modId}:${f.minTierIndex}`).join(",")}|${makeRoute.value}|${makeSpec.value.blocker}|${whiteDivine.value ?? 0}|s${socketCount.value}|${market.fetchedAt.value ?? 0}` : ""));
  watch(makeKey, async (key) => {
    const d = s.data.value, f = fractureRow.value;
    const my = ++makeGen;
    if (!key || !d || !f) { makeCost.value = null; makeBusy.value = false; return; }
    // 入力を打っている間は待つ
    await new Promise((r) => setTimeout(r, 300));
    if (my !== makeGen) return;
    if (makeCost.value?.key === key) return;
    makeBusy.value = true;
    const memo = new Map<string, number>();
    const price = (k: string): number => { let v = memo.get(k); if (v == null) { v = priceOf(k); memo.set(k, v); } return v; };
    const r = await runRecipe({
      data: d, base: s.base.value, itemLevel: s.itemLevel.value, runs: 500, price, fractureStart: makeSpec.value,
      whiteBasePrice: num(whiteDivine.value) ?? 0, sockets: socketCount.value,
      targets: fracMembers.value.map((x) => ({ modId: x.modId, minTierIndex: x.minTierIndex, method: "fracture" as const })),
    }, undefined, () => my !== makeGen);
    if (my !== makeGen) return;
    makeBusy.value = false;
    // 指標 (2026-10-05 オーナー「結局指標が欲しいよね、4 回に 1 回フラクチャー成功なんだっけ」「1/3 の場合ね」): 1 個できるまでの平均の回数
    const n = (re: RegExp): number => (r?.usage ?? []).filter((u) => re.test(u.key)).reduce((a, u) => a + u.count, 0);
    makeCost.value = r ? { key, perDone: r.perDone, p50: r.p50, p90: r.p90, pDone: r.pDone, fractures: n(/^fracture$/), magic: n(/^(transmute|augment)/), chaos: n(/^(alchemy|chaos)/), bases: r.bases } : null;
  }, { immediate: true });
  return { market, searchIlvl, searchFour, fracQuery, searchWhite, mixedSides, makeSpec, searchBought, doneDivine, DONE_KEY,
    doneAll, doneKey, doneAge, searchDone, searchPattern, makeCost, makeBusy, makeKey };
}
export type SimSearchCtx = ReturnType<typeof useSimSearch>;
