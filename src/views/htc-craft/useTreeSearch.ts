/**
 * useTreeSearch.ts — 固定済みの MOD が付いたベースを探す (固定済み / 固定無し・ゆるい / 厳しい) (2026-09-24)
 *
 * useHtcCraft.ts が 500 行を超えるので分けた (中身は 09-23 の樹 MOD の判定のまま)。
 * 固定済みの MOD = 樹 MOD と、貼り付けで固定済みだった普通の MOD ([[tree-buy.ts]] の `fracturedBuys`)。
 */
import { computed, ref, shallowRef, watch } from "vue";
import { treeFracturePlan } from "../../services/htc/tree-fracture-plan";
import { fracturedBuys, treeBuys, treeBuyQuery } from "../../services/htc/tree-buy";
import { batchFor, BATCH_TARGET, decide, summarize, type Batch, type Decision, type RouteSummary, type TreeListing } from "../../services/htc/tree-decide";
import { tradeAuto } from "../../services/trade2/auto-price";
import { autoPriceCached } from "../../services/trade2/query-cache";
import { marketStore } from "../../state/market-store";
import type { DropOnlyRow, PastedItem } from "../../services/htc/paste";
import type { Prices } from "../../vendor/poe2htc/optimizer/cost";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { ItemBase, PatchData } from "../../vendor/poe2htc/engine/types";

type Src<T> = { readonly value: T };

/** 樹 MOD を固定済みにする道 1 本の平均 (1 個ずつ買って試し、成功で止め、外れ続けたら固定済みを買う) */
export interface TreeRoute {
  key: "strict" | "loose" | "mixed" | "fractured";
  label: string;
  summary: RouteSummary;
  decision: Decision;
  /** 85% に届く個数 (何個くらい用意するかの目安) */
  need85: number | null;
}

/** 固定済み・固定無しの 3 本を取って判定した結果 */
export type TreeResult = {
  decision: Decision;
  /** 投げた検索ごとの件数と取引所のリンク (`key` = fractured / loose / strict) */
  found: Array<{ key: string; label: string; total: number; url: string | null; error?: string }>;
  skippedNoMods: number;
  /** 固定済みが自前の最安以下だったので、残りの検索を投げずに止めたか */
  earlyBuy: boolean;
  /** 自前の最安 (神)。固定済みがこれ以下なら買う */
  selfFloor: number | null;
  /**
   * オーナーの比べ方 (2026-09-23): ゆるい / 厳しいそれぞれ「85% に届く最小の個数だけ買う」総額と、
   * 固定済みの値段。**それ以上は買う必要が無い**。
   */
  strict: Batch | null;
  loose: Batch | null;
  fracturedPrice: number | null;
  /** 固定無し・ゆるいの最安 1 件 (神)。固定せずにそのまま作る時の初動 (オーナー 2026-09-25:「フラクチャー無し品の方が安い場合もある」) */
  loosePrice: number | null;
  /**
   * 道ごとの平均 (1 個ずつ買って試し、成功で止め、外れ続けたら固定済みを買う)。
   * **比べる物差しはこれ** (オーナー:「平均値で計算しよう」)。85% の個数は用意する数の目安。
   */
  routes: TreeRoute[];
  /** 平均が一番安い道 */
  best: "strict" | "loose" | "mixed" | "fractured" | null;
};

export function useTreeSearch(deps: {
  data: Src<PatchData | null>;
  base: Src<ItemBase | null>;
  prices: Src<Prices | null>;
  item: Src<PastedItem | null>;
  dropOnly: Src<DropOnlyRow[]>;
  fracturedTargets: Src<TierTarget[]>;
  /** 狙い全部 (候補の MOD を固定済みにして探す時に段を引く) */
  targets: Src<TierTarget[]>;
  /** modId → 画面の文面 */
  name: (modId: string) => string;
}) {
  const { data, base, prices, item, dropOnly, fracturedTargets } = deps;
  const stepTarget = (ids: readonly string[]): string => ids.map(deps.name).join(" + ");
  /** 取引所から取ってきた結果と判定。**押された時だけ**取る (3 本 = 約 21 秒) */
  const treeResult = shallowRef<TreeResult | null>(null);
  const treeBusy = ref(false);
  /**
   * 樹 MOD ごとに「どの段以上を探すか」(文面 → 段の添字)。**既定は貼り付けた物の段**
   * (オーナー 2026-09-23:「ティア選ばせるでいい、デフォではコピーした忍者の値」)。
   * 段を見ないと Thoughtful (7-9) のような低い段まで「成功」に数えてしまう。
   */
  const treeTierPick = ref<Record<string, number>>({});
  const treeError = ref<string | null>(null);
  /**
   * 固定する樹 MOD の側 (null = 全部の樹 MOD を固定済みで探す、前の扱い)。樹 MOD が 2 つある時、固定するのは重い側の
   * 1 つだけで、もう片方は付いていればいい (固定は 1 つしかできない。[[start-kind.ts]]、オーナー 2026-09-24)
   */
  const treeFixSide = ref<"P" | "S" | null>(null);

  /**
   * 創生の樹の MOD がある時の「買うか自前で固定するか」。**投げる前に出せる分だけ**。
   *
   * オーナーの順番: オーブの値段を見る (信号 0) → 固定済み品の最安 1 件 (信号 1) → 比べて起動。
   * ここは 1 段目で、オーブ・消去・鎖骨の実勢から「自前の固定費」と得な道を出します。
   */
  /**
   * 固定済みにする普通の MOD の組 → 3 本の検索の計画。樹 MOD は常に入る。
   * 今の始め方は今の固定済み、候補の各行はその MOD 1 つで呼ぶ (オーナー 2026-09-24:「MOD 複数選択だと
   * ゆるい厳しい条件によって値段違うから、選択した分それぞれ固定無しで展開したら見れるように」)
   */
  const planFor = (fixed: readonly TierTarget[]) => {
    const p = prices.value;
    // 樹 MOD に加え、貼り付けで固定済みだった普通の MOD も同じ 3 本で比べる (2026-09-24)
    if (!p || (dropOnly.value.length === 0 && fixed.length === 0)) return null;
    const div = p.currency.divine;
    if (!div) return null;
    const toDiv = (v: number | undefined): number | null => (v == null ? null : v / div);
    const plan = treeFracturePlan({
      orb: toDiv(p.currency.fracture),
      annul: toDiv(p.currency.annul) ?? 0,
      bone: toDiv(p.currency.desecrate) ?? 0,
    });
    const cls = base.value;
    // 選んだ段の下限を条件に入れる (3 本すべて)。取引所の値は品質込みで出るので、
    // 下限は素の値の段の下限でいい (品質の乗った出品は表示が大きくなって勝手に引っかかる)
    const mins: Record<string, number> = {};
    for (const d of dropOnly.value) {
      const idx = treeTierPick.value[d.text] ?? d.tier?.index;
      const t = idx != null ? d.tiers?.[idx] : undefined;
      if (t) mins[d.text] = t.min;
    }
    const d = data.value;
    // 固定しない側の樹 MOD は「付いていればいい」(explicit)。固定済みの検索でも固定済みにしない
    const fixSide = treeFixSide.value;
    const tree = treeBuys(dropOnly.value, { mins }).map((b, i) => (fixSide && dropOnly.value[i]?.side && dropOnly.value[i]!.side !== fixSide
      ? { ...b, filters: b.filters.map((f) => ({ ...f, id: f.id.replace(/^fractured\./, `${b.plain}.`) })) }
      : b));
    const buys = [...tree, ...(d ? fracturedBuys(d, fixed, (id) => stepTarget([id])) : [])];
    // stat に入れるのは作れない MOD だけ。ベース・ilvl・レア・コラプト無しは規定通り
    const common = {
      ilvlMin: item.value?.itemLevel ?? undefined,
      ...(item.value?.baseType ? { baseType: item.value.baseType } : {}),
      grantedSkill: item.value?.grantedSkill ?? null,
    };
    // 固定済みは最安 1 件。固定無しは「85% に届く最小の個数」を数えるので最安 10 件まで
    // (ゆるい方は 85% に 10 個前後要る。fetch は 1 回 10 件なので検索の本数は変わらない)
    const searches = [
      { key: "fractured" as const, label: "固定済み (買えばそのまま使える)", take: 1,
        query: cls ? treeBuyQuery(cls, buys, { ...common, fractured: true }) : null },
      { key: "loose" as const, label: "固定無し・ゆるい (消去ガチャで減らす)", take: 10,
        query: cls ? treeBuyQuery(cls, buys, { ...common, fractured: false }) : null },
      { key: "strict" as const, label: "固定無し・厳しい (欲しい MOD の側はその 1 つだけ = 冒涜しやすい)", take: 10,
        query: cls ? treeBuyQuery(cls, buys, { ...common, fractured: false, strict: true }) : null },
    ].filter((x) => x.query != null);
    return { plan, buys, searches };
  };
  const treePlan = computed(() => planFor(fracturedTargets.value));


  /**
   * 樹 MOD の 3 本を取引所に投げて、何を何個まで試すか決める。
   *
   * 投げるのは `treePlan.searches` の 3 本だけ (オーナー指定: 固定済み 1 件、固定無し 5 件ずつ)。
   * 間隔と上限は `autoPrice` (本番は Rust の門番) が持つので、ここでは並べて待つだけです。
   * 1 件ごとの MOD 数は fetch の結果から読みます ([[pricing.ts]] の `mods`)。**読めなかった物は
   * 確率が決まらないので外します** (外した数は画面に出す)。
   */
  /** 計画の 3 本を取って判定する (30 分以内に同じ条件で取った物はキャッシュ)。取れなかった本は理由付きで found に残る */
  async function runPlan(tp: NonNullable<ReturnType<typeof planFor>>): Promise<TreeResult> {
    const p = prices.value!;
    const div = p.currency.divine!;
    {
      const league = marketStore.league.value?.Value ?? "Standard";
      const rates = marketStore.rates.value;
      const listings: TreeListing[] = [];
      const found: Array<{ key: string; label: string; total: number; url: string | null; error?: string }> = [];
      let skippedNoMods = 0;
      let earlyBuy = false;
      // 自前で固定する時の最安 (4 MOD のベースがタダの時)。固定済みがこれ以下なら自前は絶対に勝てない。
      // オーナー:「フラクチャー品がフラクチャーオーブの 4 倍の値段なら買った方が良い、他の経費も含めて」。
      // 正確にはオーブが高い時は「減らして冒涜」で打つ回数が 3/N に減るので、約 3.5 倍が線になる
      const selfFloor = tp.plan.rows.find((r) => r.mods === 4)?.fixed ?? null;
      for (const sq of tp.searches) {
        // 固定済みが線以下でも残りは投げる (オーナー 2026-09-24:「ゆるい厳しい条件の奴も検索して 0 件だったのか
        // どうなのか確認する」。バグ確認のため 3 本とも結果を出す)
        const r = await autoPriceCached(league, sq.query, rates, sq.take);
        if (!r) {
          // 取れなかった物は 0 件と区別する (理由を持たせる)
          found.push({ key: sq.key, label: sq.label, total: 0, url: null, error: tradeAuto.lastError.value ?? "取れませんでした" });
          continue;
        }
        found.push({ key: sq.key, label: sq.label, total: r.total, url: r.searchUrl || null });
        if (sq.key === "fractured" && selfFloor != null && r.minExalted != null && r.minExalted / div <= selfFloor) {
          earlyBuy = true;
        }
        for (const x of r.listings.slice(0, sq.take)) {
          if (!Number.isFinite(x.amountExalted)) continue;
          const mods = x.mods ?? null;
          if (sq.key !== "fractured" && mods == null) { skippedNoMods++; continue; }
          const n = mods ?? 4;
          // 厳しい検索はプレフィックス 1 個 (条件で保証)。ゆるい検索は総数だけで確率が決まる
          const prefixes = sq.key === "strict" ? 1 : Math.ceil(n / 2);
          listings.push({
            source: sq.key,
            price: x.amountExalted / div,
            prefixes,
            suffixes: n - prefixes,
            label: `${(x.amountExalted / div).toFixed(2)} 神 / ${n} MOD${x.account ? " / " + x.account : ""}`,
          });
        }
      }
      const toDiv = (v: number | undefined): number | null => (v == null ? null : v / div);
      const dp = {
        orb: toDiv(p.currency.fracture) ?? Infinity,
        annul: toDiv(p.currency.annul) ?? 0,
        bone: toDiv(p.currency.desecrate) ?? 0,
        exalt: toDiv(p.currency.exalt) ?? 0,
        necro: toDiv(p.omens.OmenofDextralNecromancy),
        dextralExalt: toDiv(p.omens.OmenofDextralExaltation),
      };
      const decision = decide(listings, dp);
      const strict = batchFor(listings.filter((l) => l.source === "strict"), dp, BATCH_TARGET);
      const loose = batchFor(listings.filter((l) => l.source === "loose"), dp, BATCH_TARGET);
      const frList = listings.filter((l) => l.source === "fractured").sort((a, b) => a.price - b.price);
      const fracturedPrice = frList[0]?.price ?? null;
      const loosePrice = listings.filter((l) => l.source === "loose").sort((a, b) => a.price - b.price)[0]?.price ?? null;
      const only = (src: TreeListing["source"]) => [...listings.filter((l) => l.source === src), ...frList.slice(0, 1)];
      const routes: TreeRoute[] = [];
      const add = (key: "strict" | "loose" | "mixed" | "fractured", label: string, ls: TreeListing[], b: Batch | null) => {
        if (ls.length === 0) return;
        const dd = decide(ls, dp);
        if (dd.order.length === 0 && !dd.fallback) return;
        routes.push({ key, label, summary: summarize(dd), decision: dd, need85: b?.count ?? null });
      };
      add("strict", "厳しいを 1 個ずつ", only("strict"), strict);
      add("loose", "ゆるいを 1 個ずつ", only("loose"), loose);
      add("mixed", "両方まぜて安い順に 1 個ずつ", listings, null);
      if (fracturedPrice != null) add("fractured", "固定済みを買う", frList.slice(0, 1), null);
      const best = routes.length ? routes.reduce((a, b) => (b.summary.expected < a.summary.expected ? b : a)).key : null;
      return { decision, found, skippedNoMods, earlyBuy, selfFloor, strict, loose, fracturedPrice, loosePrice, routes, best };
    }
  }

  /** 今の固定済みで 3 本を取る (始め方) */
  async function searchTree(): Promise<void> {
    const tp = treePlan.value;
    if (!tp || !prices.value) return;
    if (!prices.value.currency.divine) { treeError.value = "相場が未取得なので値段を神に直せません。"; return; }
    treeBusy.value = true;
    treeError.value = null;
    treeResult.value = null;
    try {
      treeResult.value = await runPlan(tp);
      treeError.value = treeResult.value.found.find((f) => f.error)?.error ?? null;
    } catch (e) {
      treeError.value = String(e);
    } finally {
      treeBusy.value = false;
    }
  }

  /** 固定済みにする MOD を指定して 3 本を取る (候補の各行)。組めなければ null */
  async function searchFor(modIds: readonly string[]): Promise<TreeResult | null> {
    const fixed = deps.targets.value.filter((t) => modIds.includes(t.modId));
    const tp = planFor(fixed);
    if (!tp || !prices.value?.currency.divine) return null;
    return runPlan(tp);
  }

  // 固定済みにする MOD を選び直したら (setFractured)、前の結果は捨てる (別の物の値段になる)
  watch(() => treePlan.value?.searches.map((x) => JSON.stringify(x.query)).join("|"), () => { treeResult.value = null; treeError.value = null; });
  return { treeResult, treeBusy, treeError, treeTierPick, treePlan, searchTree, searchFor, planFor, treeFixSide };
}
