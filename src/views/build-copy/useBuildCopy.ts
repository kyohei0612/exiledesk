/**
 * 忍者ビルドコピーの状態と計算 (2026-09-26)
 *
 * オーナー:「ビルドのコードを貼ったら、装備から何から何までトータル何神かかるかと、それぞれトレード2へ行けるようにリスト化して。
 * ルーンはルーンで何にいくら、被ってる奴は ×3。スキル関係はいいとして、サポジェムの特にリネージュサポートだけ抜き出して値段」。
 *   装備 / ジュエル / フラスコ・チャーム: ユニークは poe.ninja の相場。レアは相場を取らず、段で組んだ検索のリンクだけ
 *   (オーナー「全部手動で検索かけるから絶対トレードにアクセスしなくていい」。ゆるさ違いの 3 本、rare-query.ts)
 *   ルーン: 同じ物をまとめて × 個数 × 単価
 *   リネージュサポート: 同じ物をまとめて × 個数 × 単価
 * 合計は値段の分かった物だけ足し、分からない物の数を横に出す。
 */
import { computed, reactive, ref, shallowRef } from "vue";
import { openUrl } from "@tauri-apps/plugin-opener";
import { decodePobCode, parseBuild, type BuildItem, type ParsedBuild } from "../../services/build-copy/pob";
import { loadFromNinjaUrl, parseNinjaUrl } from "../../services/build-copy/ninja-url";
import { currencyPrice, isLineage, loadUniquePrices, typeQuery, uniquePrice } from "../../services/build-copy/prices";
import { analyzeRare, prepareRareQueries, rareLinks, type RareAnalysis, type RareLink } from "../../services/build-copy/rare-query";
import { marketStore } from "../../state/market-store";
import { snapshotNameToTradeLeague, trade2QueryUrl } from "../../services/trade2/league";
import { buildUniqueNameQuery } from "../../services/trade2/query";
import { jaTypeName, jaUniqueName } from "../../services/trade2/localize";
import { jaCurrency } from "../../i18n/currencies-ja";
import itemsJaClient from "../../i18n/items-ja-client.json";
import { isTauriRuntime } from "../../utils/isTauriRuntime";

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
  rare: { analysis: RareAnalysis; links: RareLink[]; picked: Record<number, number> } | null;
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
  /** 選び直した段 (行の番号 → MOD の並び → tiers の添字)。オーナー 2026-09-26「ティアはいじれる様に」 */
  const picked = reactive(new Map<number, Record<number, number>>());
  function pickTier(row: number, mod: number, tier: number): void {
    picked.set(row, { ...(picked.get(row) ?? {}), [mod]: tier });
  }
  /** 相場を読み込み直したら数え直す */
  const priceTick = ref(0);

  async function load(): Promise<void> {
    error.value = null;
    const c = code.value.trim();
    if (!c) return;
    loading.value = true;
    try {
      // poe.ninja のビルドページの URL か、PoB のコードか (オーナー 2026-09-26「URL からも読めるように」)
      if (parseNinjaUrl(c)) {
        progress.value = "poe.ninja からキャラクターを読んでいます…";
        build.value = await loadFromNinjaUrl(c);
      } else {
        build.value = parseBuild(await decodePobCode(c));
      }
      if (!build.value.items.length) error.value = "装備が見つかりません (PoB のコードか確かめてください)";
      await marketStore.ensureMarket();
      progress.value = "MOD のデータを読んでいます…";
      await prepareRareQueries();
      picked.clear();
      analyses.value = new Map((build.value?.items ?? []).map((it, i) => [i, it] as const).filter(([, it]) => it.rarity === "RARE").map(([i, it]) => [i, analyzeRare(it)]));
      progress.value = "ユニークの相場を取得中…";
      await loadUniquePrices((d, t) => (progress.value = `ユニークの相場を取得中 (${d}/${t})…`));
      priceTick.value++;
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
      const up = unique ? uniquePrice(item.name, item.base) : null;
      return {
        i,
        item,
        // レアの名前はでたらめな組み合わせなので、主にはベースの日本語名を出す (固有の名前は画面で小さく)
        nameJa: unique ? jaUniqueName(item.name) : base ? jaTypeName(base) : item.name,
        baseJa: base ? jaTypeName(base) : "",
        price: unique ? (up?.exalted ?? null) : null,
        src: unique ? "unique" : item.rarity === "RARE" ? "rare" : "none",
        rare: (() => {
          const a = analyses.value.get(i);
          if (!a) return null;
          const p = picked.get(i) ?? {};
          return { analysis: a, links: rareLinks(a, p), picked: p };
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

  /** 合計 (分かった物だけ)。unknown = 相場の無いユニーク・ルーンなど、rares = 取引所で確かめるレア */
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
  /** 行の「トレード2へ」 */
  function tradeItem(r: ItemRow): void {
    const it = r.item;
    if (r.src === "unique") void openQuery(buildUniqueNameQuery(it.name, { baseType: it.base || undefined, noCorrupted: !it.corrupted }));
    else if (r.src === "rare" && r.rare?.links[0]) void openQuery(r.rare.links[0].query);
    else if (r.baseJa) void openQuery(typeQuery(it.base || baseOfMagic(it.name)));
  }
  /** レアのゆるさ違いのリンク */
  function tradeLink(q: unknown): void {
    void openQuery(q);
  }

  return { code, build, error, loading, progress, load, items, runes, lineage, totals, tradeItem, tradeLink, pickTier };
}
