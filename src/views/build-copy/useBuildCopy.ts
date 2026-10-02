/**
 * 火力チェックのタブ「値段」の状態と計算 (旧 忍者ビルドコピー、2026-09-26。2026-10-03 に火力チェックへ統合)
 *
 * オーナー:「ビルドのコードを貼ったら、装備から何から何までトータル何神かかるかと、それぞれトレード2へ行けるようにリスト化して。
 * ルーンはルーンで何にいくら、被ってる奴は ×3。スキル関係はいいとして、サポジェムの特にリネージュサポートだけ抜き出して値段」。
 * 2026-10-03「忍者ビルドコピーは火力チェックに統合。値段は『取る』ボタンを押した分だけ (自動では走らない)」。
 *   コード (火力チェックが読んだ PoB コード。自分 / 相手) → load() = 解析だけ (ローカル、通信なし)。コードが変わるたびに自動
 *   fetchPrices() = 「値段を取る」を押した時だけ: ユニークの相場 (poe.ninja)・カレンシーの相場 (poe2scout) を読み、取引所で順に取る
 *   ユニーク: poe.ninja の相場。種類違い・ソケットのある物は取引所で探す ([[useAutoPrices.ts]])
 *   レア: ティアで組んだ検索 (rare-query.ts)。取引所で順に相場を取る (ジュエル以外。ジュエルは手入れ)
 *   ルーン / リネージュサポート: 同じ物をまとめて × 個数 × 単価 (poe2scout の相場。読めていれば解析の時点で出る)
 * 合計は値段の分かった物だけ足し、取引所の相場を取り終えてから出す。
 *   ティアと割合 → [[useRareTiers.ts]]、手入れの値段 → [[manual-prices.ts]]
 * 履歴のイベント名 ("build-copy") とファイル名 (build-copy.jsonl) は統合前のまま (memory: build-copy)
 */
import { isLegacyRune } from "../../services/market/legacy-rune";
import { recordHistory } from "../../services/history";
import { computed, ref, shallowRef } from "vue";
import { openUrl } from "@tauri-apps/plugin-opener";
import { decodePobCode, parseBuild, type BuildItem, type ParsedBuild } from "../../services/build-copy/pob";
import { currencyPrice, isLineage, loadUniquePrices, typeQuery, uniquePrice, uniqueTradeQuery } from "../../services/build-copy/prices";
import { analyzeRare, prepareRareQueries, rareLinks, type RareAnalysis, type RareLink } from "../../services/build-copy/rare-query";
import type { RareAutoResult } from "../../services/build-copy/rare-auto";
import { marketStore } from "../../state/market-store";
import { snapshotNameToTradeLeague, trade2QueryUrl } from "../../services/trade2/league";
import { buildUniqueNameQuery } from "../../services/trade2/query";
import { jaTypeName, jaUniqueName } from "../../services/trade2/localize";
import { jaCurrency } from "../../i18n/currencies-ja";
import itemsJaClient from "../../i18n/items-ja-client.json";
import { isTauriRuntime } from "../../utils/isTauriRuntime";
import { manualExalted, manualOf, setManualOf, type ManualPrice } from "./manual-prices";
import { useRareTiers } from "./useRareTiers";
import { tradeSearchedUnique, useAutoPrices } from "./useAutoPrices";
import type { DisplayCurrency } from "../../state/display-currency";

const BASES = Object.keys(itemsJaClient as Record<string, string>).sort((a, b) => b.length - a.length);
/** マジックの名前 (「Conjurer's Ultimate Life Flask of the Constant」) からベース (「Ultimate Life Flask」) を探す */
function baseOfMagic(name: string): string {
  return BASES.find((b) => b.length > 3 && name.includes(b)) ?? "";
}

export interface ItemRow {
  i: number;
  item: BuildItem;
  nameJa: string;
  baseJa: string;
  /** 高貴建て (分からなければ null) */
  price: number | null;
  /** 値段の出どころ */
  src: "unique" | "rare" | "none";
  /** レアの解析 (MOD とティア) と、選んだティアで作った取引所リンク (ゆるさ違い) */
  rare: { analysis: RareAnalysis; links: RareLink[]; picked: Record<number, number>; ratio: number } | null;
  /** レアの値段の欄 (手入れ / 自動で取った値段) */
  manual: ManualPrice | null;
  /** 取引所で探すユニーク (種類違い・ソケットのある物。poe.ninja の相場はそこを区別しない) */
  tradeUnique: boolean;
  /** 取引所で相場を取るか (ジュエル以外のレア / 取引所で探すユニーク) */
  autoTarget: boolean;
  /** 自動で取った結果 (どこで何件)、取っている途中の段階、順番待ち */
  auto: RareAutoResult | null;
  autoStep: string | null;
  queued: boolean;
}
export interface BulkRow {
  nameEn: string;
  nameJa: string;
  count: number;
  unit: number | null;
}
const leagueSlug = () => (marketStore.league.value?.Value ?? "").toLowerCase().replace(/\s+/g, "-");

/**
 * who = 履歴に書く「誰のビルドか」(自分 / 相手)。タブ「値段」は自分と相手で 1 つずつ作る (値段の取れた結果を別々に持つ)
 */
export function useBuildCopy(who: "mine" | "target" = "mine") {
  /** 解析した PoB コード (火力チェックから渡される) */
  const code = ref("");
  const build = ref<ParsedBuild | null>(null);
  const error = ref<string | null>(null);
  /** 解析中 (ローカル。一瞬) */
  const loading = ref(false);
  /** 相場を読んでいる途中 (「値段を取る」を押した後、取引所に行く前の poe.ninja / poe2scout) */
  const pricing = ref(false);
  const progress = ref("");
  /** レアの解析 (解析の時に 1 回。行の番号 → 解析) */
  const analyses = shallowRef(new Map<number, RareAnalysis>());
  const tiers = useRareTiers(analyses);
  const auto = useAutoPrices({ build, analyses, picked: tiers.picked, ratios: tiers.ratios });
  /** 相場を読み込み直したら数え直す */
  const priceTick = ref(0);
  /** このコードで一度でも「値段を取る」を押して回り切ったか (合計はそれから出す。前は「取る」を促す) */
  const fetched = ref(false);

  function setManual(row: number, amount: number | null, currency: DisplayCurrency): void {
    const it = build.value?.items[row];
    if (it) setManualOf(it, amount, currency);
  }
  /** 読み込んだビルドを消す (火力チェックの相手を外した時など) */
  function clear(): void {
    code.value = "";
    build.value = null;
    error.value = null;
    analyses.value = new Map();
    tiers.clearTiers();
    auto.reset();
  }

  /**
   * 解析だけ (ローカル、通信なし): PoB コード → 装備・ジェム、レアの MOD とティア。
   * 値段はここでは取らない (オーナー 2026-10-03「値段は『取る』ボタンを押した分だけ」)。
   * 読めている相場 (起動時のカレンシー、前に取ったユニーク) があれば、行の値段にはそのまま出る
   */
  async function load(next = code.value): Promise<void> {
    error.value = null;
    const c = next.trim();
    code.value = c;
    if (!c) {
      clear();
      return;
    }
    loading.value = true;
    fetched.value = false;
    auto.reset();
    try {
      build.value = parseBuild(await decodePobCode(c));
      if (!build.value.items.length) error.value = "装備が見つかりません (PoB のコードか確かめてください)";
      await prepareRareQueries();
      tiers.clearTiers();
      analyses.value = new Map(
        (build.value?.items ?? [])
          .map((it, i) => [i, it] as const)
          .filter(([, it]) => it.rarity === "RARE")
          .map(([i, it]) => [i, analyzeRare(it)]),
      );
      priceTick.value++;
      // 履歴 (2026-09-30): 読めた装備・ジェム (who = 自分 / 相手)
      recordHistory("build-copy", "load", { who, code: c, build: build.value });
    } catch (e) {
      build.value = null;
      error.value = `読めませんでした: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      loading.value = false;
    }
  }

  /**
   * 「値段を取る」(押した時だけ。自動では走らない): カレンシーの相場 (poe2scout) → ユニークの相場 (poe.ninja、30 分は覚える)
   * → 取引所で順に (レアと、取引所で探すユニーク。useAutoPrices、使用権は trade-lock)。resume = 中止した所から
   */
  async function fetchPrices(resume = false): Promise<void> {
    if (!build.value || pricing.value || auto.busy.value) return;
    pricing.value = true;
    error.value = null;
    try {
      progress.value = "カレンシーの相場を読んでいます";
      await marketStore.ensureMarket();
      progress.value = "ユニークの相場を読んでいます (poe.ninja)";
      await loadUniquePrices((d, t) => (progress.value = `ユニークの相場を読んでいます (poe.ninja ${d}/${t})`));
      priceTick.value++;
    } catch (e) {
      error.value = `相場を読めませんでした: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      pricing.value = false;
      progress.value = "";
    }
    await auto.run(undefined, resume);
    fetched.value = true;
  }

  const items = computed<ItemRow[]>(() => {
    void priceTick.value;
    return (build.value?.items ?? []).map((item, i) => {
      const unique = item.rarity === "UNIQUE" || item.rarity === "RELIC";
      const base = item.base || baseOfMagic(item.name);
      const au = auto.results.get(i) ?? null;
      const man = item.rarity === "RARE" ? manualOf(item) : null;
      const tradeUnique = unique && tradeSearchedUnique(item);
      const a = analyses.value.get(i);
      return {
        i,
        item,
        // レアの名前はでたらめな組み合わせなので、主にはベースの日本語名を出す (固有の名前は画面で小さく)
        nameJa: unique ? jaUniqueName(item.name) : base ? jaTypeName(base) : item.name,
        baseJa: base ? jaTypeName(base) : "",
        price: unique ? (au?.exalted ?? uniquePrice(item.name, item.base)?.exalted ?? null) : manualExalted(man),
        src: unique ? "unique" : item.rarity === "RARE" ? "rare" : "none",
        manual: man,
        tradeUnique,
        autoTarget: tradeUnique || (item.rarity === "RARE" && item.kind !== "jewel" && !!a),
        auto: au,
        autoStep: auto.steps.get(i) ?? null,
        queued: auto.queued.has(i),
        rare: (() => {
          if (!a) return null;
          const p = tiers.picked.get(i) ?? {};
          const ratio = tiers.ratios.get(i) ?? 100;
          return { analysis: a, links: rareLinks(a, p, ratio), picked: p, ratio };
        })(),
      };
    });
  });

  /** 同じ名前をまとめる */
  function bulk(names: string[]): BulkRow[] {
    void priceTick.value;
    const m = new Map<string, number>();
    for (const n of names) m.set(n, (m.get(n) ?? 0) + 1);
    return [...m.entries()]
      // 遺産のルーンはアルダーの遺産の値段 (相場に無い)。名前の横にそう書く
      .map(([nameEn, count]) => ({ nameEn, nameJa: isLegacyRune(nameEn) ? `${jaCurrency(nameEn)} (アルダーの遺産の値段)` : jaCurrency(nameEn), count, unit: currencyPrice(nameEn) }))
      .sort((a, b) => (b.unit ?? 0) * b.count - (a.unit ?? 0) * a.count);
  }
  const runes = computed(() => bulk((build.value?.items ?? []).flatMap((x) => x.runes)));
  const lineage = computed(() => bulk((build.value?.gems ?? []).filter((g) => g.support && isLineage(g.name)).map((g) => g.name)));

  /** 合計 (分かった物だけ)。unknown = 相場の無いユニーク・ルーンなど、rares = 値段の無いレア */
  const totals = computed(() => {
    let sum = 0;
    let unknown = 0;
    let rares = 0;
    for (const r of items.value) {
      if (r.price != null) sum += r.price;
      else if (r.src === "rare") rares++;
      else if (r.src !== "none") unknown++;
    }
    for (const r of [...runes.value, ...lineage.value]) {
      if (r.unit != null) sum += r.unit * r.count;
      else unknown++;
    }
    return { sum, unknown, rares };
  });

  async function openQuery(query: unknown): Promise<void> {
    if (!isTauriRuntime()) return;
    await openUrl(trade2QueryUrl(snapshotNameToTradeLeague(leagueSlug()), query));
  }
  /**
   * 行の「トレード2へ」: 自動で値段を取った所 (最後に止まった検索) があればそこへ
   * (オーナー 2026-09-27「トレード2へは最終的に止まったところの状態を」)
   */
  function tradeItem(r: ItemRow): void {
    const it = r.item;
    if (r.auto?.query) return void openQuery(r.auto.query);
    if (r.src === "unique") {
      const uq = uniqueTradeQuery(it);
      void openQuery(uq && "queries" in uq ? uq.queries[0] : buildUniqueNameQuery(it.name, { baseType: it.base || undefined, noCorrupted: !it.corrupted }));
    } else if (r.src === "rare" && r.rare?.links[0]) void openQuery(r.rare.links[0].query);
    else if (r.baseJa) void openQuery(typeQuery(it.base || baseOfMagic(it.name)));
  }
  /** レアのゆるさ違いのリンク */
  function tradeLink(q: unknown): void {
    void openQuery(q);
  }

  return {
    code,
    build,
    error,
    loading,
    pricing,
    progress,
    load,
    fetchPrices,
    clear,
    setManual,
    auto,
    items,
    runes,
    lineage,
    totals,
    fetched,
    tradeItem,
    tradeLink,
    pickTier: tiers.pickTier,
    lowerTiers: tiers.lowerTiers,
    raiseTiers: tiers.raiseTiers,
    resetTiers: tiers.resetTiers,
  };
}
