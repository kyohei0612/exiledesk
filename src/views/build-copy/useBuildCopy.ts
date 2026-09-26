/**
 * 忍者ビルドコピーの状態と計算 (2026-09-26)
 *
 * オーナー:「ビルドのコードを貼ったら、装備から何から何までトータル何神かかるかと、それぞれトレード2へ行けるようにリスト化して。
 * ルーンはルーンで何にいくら、被ってる奴は ×3。スキル関係はいいとして、サポジェムの特にリネージュサポートだけ抜き出して値段」。
 *   ユニーク: poe.ninja の相場。種類違い・ソケットのある物は取引所で探す ([[useAutoPrices.ts]])
 *   レア: 段で組んだ検索 (rare-query.ts)。読み込んだら取引所で順に相場を取る (ジュエル以外。ジュエルは手入れ)
 *   ルーン / リネージュサポート: 同じ物をまとめて × 個数 × 単価 (poe2scout)
 * 合計は値段の分かった物だけ足し、取引所の相場を取り終えてから出す。
 *   段と割合 → [[useRareTiers.ts]]、手入れの値段 → [[manual-prices.ts]]
 */
import { computed, ref, shallowRef } from "vue";
import { openUrl } from "@tauri-apps/plugin-opener";
import { decodePobCode, parseBuild, type BuildItem, type ParsedBuild } from "../../services/build-copy/pob";
import { loadFromNinjaUrl, parseNinjaUrl } from "../../services/build-copy/ninja-url";
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
  /** レアの解析 (MOD と段) と、選んだ段で作った取引所リンク (ゆるさ違い) */
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

export function useBuildCopy() {
  const code = ref("");
  const build = ref<ParsedBuild | null>(null);
  const error = ref<string | null>(null);
  const loading = ref(false);
  const progress = ref("");
  /** レアの解析 (読み込みの時に 1 回。行の番号 → 解析) */
  const analyses = shallowRef(new Map<number, RareAnalysis>());
  const tiers = useRareTiers(analyses);
  const auto = useAutoPrices({ build, analyses, picked: tiers.picked, ratios: tiers.ratios });
  /** 相場を読み込み直したら数え直す */
  const priceTick = ref(0);

  function setManual(row: number, amount: number | null, currency: DisplayCurrency): void {
    const it = build.value?.items[row];
    if (it) setManualOf(it, amount, currency);
  }
  /** 読み込んだビルドを消して、貼る前に戻す (オーナー 2026-09-26「読み込んだあとリセットするボタン」) */
  function clear(): void {
    code.value = "";
    build.value = null;
    error.value = null;
    analyses.value = new Map();
    tiers.clearTiers();
    auto.reset();
  }

  async function load(): Promise<void> {
    error.value = null;
    const c = code.value.trim();
    if (!c) return;
    loading.value = true;
    auto.reset();
    try {
      // poe.ninja のビルドページの URL か、PoB のコードか (オーナー 2026-09-26「URL からも読めるように」)
      progress.value = "ビルドを読んでいます";
      build.value = parseNinjaUrl(c) ? await loadFromNinjaUrl(c) : parseBuild(await decodePobCode(c));
      if (!build.value.items.length) error.value = "装備が見つかりません (PoB のコードか確かめてください)";
      progress.value = "カレンシーの相場を読んでいます";
      await marketStore.ensureMarket();
      progress.value = "MOD のデータを読んでいます";
      await prepareRareQueries();
      tiers.clearTiers();
      analyses.value = new Map(
        (build.value?.items ?? [])
          .map((it, i) => [i, it] as const)
          .filter(([, it]) => it.rarity === "RARE")
          .map(([i, it]) => [i, analyzeRare(it)]),
      );
      progress.value = "ユニークの相場を読んでいます (poe.ninja)";
      await loadUniquePrices((d, t) => (progress.value = `ユニークの相場を読んでいます (poe.ninja ${d}/${t})`));
      priceTick.value++;
      // 読み込んだらそのまま取引所の相場も取る。合計は取り終えてから出す
      // (オーナー 2026-09-27「その最安値を自動で計算に加えて」「順番にレアもそのまま取得しちゃっていいよ」)
      void auto.run();
    } catch (e) {
      build.value = null;
      error.value = `読めませんでした: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      loading.value = false;
      progress.value = "";
    }
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
      .map(([nameEn, count]) => ({ nameEn, nameJa: jaCurrency(nameEn), count, unit: currencyPrice(nameEn) }))
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
    progress,
    load,
    clear,
    setManual,
    auto,
    items,
    runes,
    lineage,
    totals,
    tradeItem,
    tradeLink,
    pickTier: tiers.pickTier,
    lowerTiers: tiers.lowerTiers,
    raiseTiers: tiers.raiseTiers,
    resetTiers: tiers.resetTiers,
  };
}
