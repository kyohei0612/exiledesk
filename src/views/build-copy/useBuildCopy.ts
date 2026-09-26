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
import { currencyPrice, isLineage, isVariantUnique, loadUniquePrices, typeQuery, uniquePrice, uniqueVariantQuery } from "../../services/build-copy/prices";
import { analyzeRare, prepareRareQueries, rareLinks, type RareAnalysis, type RareLink } from "../../services/build-copy/rare-query";
import { marketStore } from "../../state/market-store";
import { autoRarePrice, autoUniquePrice, type RareAutoResult } from "../../services/build-copy/rare-auto";
import { rateOf, type DisplayCurrency } from "../../state/display-currency";
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
  rare: { analysis: RareAnalysis; links: RareLink[]; picked: Record<number, number>; ratio: number } | null;
  /** レアの手入れの値段 (取引所で見た値段を打つ / 自動で取った値段) */
  manual: ManualPrice | null;
  /** 種類違いのあるユニーク (poe.ninja の相場は種類を区別しないので、取引所で同じ MOD の物を探す) */
  variant: boolean;
  /** 自動で取った結果 (どこで何件) と、取っている途中の段階 */
  auto: RareAutoResult | null;
  autoStep: string | null;
}
export interface BulkRow {
  nameEn: string;
  nameJa: string;
  count: number;
  unit: number | null;
}
export interface ManualPrice {
  amount: number;
  currency: DisplayCurrency;
}
/**
 * レアの手入れの値段 (オーナー 2026-09-26「レア装備どうしようか」→ 取引所で見た値段を打って合計に入れる)。
 * 同じビルドを読み直しても残るよう、固有名・ベース・部位で覚える
 */
const MANUAL_KEY = "exiledesk.buildCopy.manualPrices";
function loadManual(): Record<string, ManualPrice> {
  try {
    const v = JSON.parse(localStorage.getItem(MANUAL_KEY) ?? "{}") as unknown;
    return v && typeof v === "object" ? (v as Record<string, ManualPrice>) : {};
  } catch {
    return {};
  }
}
const isVariantUniqueItem = (it: BuildItem) => (it.rarity === "UNIQUE" || it.rarity === "RELIC") && isVariantUnique(it.name);
const manualKey = (it: BuildItem) => `${it.slot}|${it.name}|${it.base}`;
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
  /**
   * 数値で条件にする行 (ジュエル・特殊な MOD) の下限の割合 (%、行の番号 → 割合。無ければ 100)。
   * オーナー 2026-09-26「ジュエルはティアじゃなくて数値にしようか、割合で減らす感じで」
   */
  const ratios = reactive(new Map<number, number>());
  const RATIO_STEP = 10;
  const RATIO_MIN = 10;
  const RATIO_MAX = 150;
  function shiftRatio(row: number, dir: 1 | -1): void {
    const a = analyses.value.get(row);
    if (!a?.lines.length) return;
    const now = ratios.get(row) ?? 100;
    ratios.set(row, Math.min(RATIO_MAX, Math.max(RATIO_MIN, now + dir * RATIO_STEP)));
  }
  function pickTier(row: number, mod: number, tier: number): void {
    picked.set(row, { ...(picked.get(row) ?? {}), [mod]: tier });
  }
  /**
   * その行の全 MOD の段を 1 つずつ下げる (選べる段の中で、今より 1 つ下。一番下ならそのまま)。
   * オーナー 2026-09-26「各項目にティアを 1 つずつ下げる設定と、リセットを追加して」
   */
  function lowerTiers(row: number): void {
    shiftTiers(row, -1);
  }
  /** その行の全 MOD の段を 1 つずつ上げる (オーナー「上げるも一応ね、上下ティア変化させたい」) */
  function raiseTiers(row: number): void {
    shiftTiers(row, 1);
  }
  /** 選べる段の中で 1 つ上 (dir = 1) / 下 (dir = -1) へ。端ならそのまま */
  function shiftTiers(row: number, dir: 1 | -1): void {
    shiftRatio(row, dir);
    const a = analyses.value.get(row);
    if (!a?.mods.length) return;
    const cur = picked.get(row) ?? {};
    const next: Record<number, number> = { ...cur };
    a.mods.forEach((m, k) => {
      const now = cur[k] ?? m.tier;
      // tiers の添字は大きいほど上の段
      const cand = m.options.map((o) => o.i).filter((i) => (dir < 0 ? i < now : i > now));
      if (cand.length) next[k] = dir < 0 ? Math.max(...cand) : Math.min(...cand);
    });
    picked.set(row, next);
  }
  /** その行の段を付いている段に、割合を 100% に戻す */
  function resetTiers(row: number): void {
    picked.delete(row);
    ratios.delete(row);
  }
  const manual = reactive(loadManual());
  /** レアの値段を打つ (amount が空・0 なら値段は消し、選んだ通貨だけ覚える) */
  function setManual(row: number, amount: number | null, currency: DisplayCurrency): void {
    const it = build.value?.items[row];
    if (!it) return;
    const k = manualKey(it);
    if ((amount == null || !(amount > 0)) && currency === "divine") delete manual[k];
    else manual[k] = { amount: amount != null && amount > 0 ? amount : 0, currency };
    try {
      localStorage.setItem(MANUAL_KEY, JSON.stringify(manual));
    } catch {
      /* 保存できなくても画面では効く */
    }
  }
  /**
   * レアの相場を自動で取る (オーナー 2026-09-27「やっぱ自動がいいよね」。ジュエルは除く)。
   * 取った値段は手入れの欄に入れる (上書きできる)。row を渡すとその行だけ
   */
  const autoResults = reactive(new Map<number, RareAutoResult>());
  const autoStep = reactive(new Map<number, string>());
  const autoBusy = ref(false);
  const autoDone = ref(0);
  const autoTotal = ref(0);
  /** 全部を取っている途中 (行ごとの取り直しでは合計を隠さない) */
  const autoAll = ref(false);
  let autoGen = 0;
  /** 自動で取る行: ジュエル以外のレア + 種類違いのあるユニーク */
  const autoTargets = () =>
    (build.value?.items ?? []).flatMap((it, i) => ((it.rarity === "RARE" && analyses.value.has(i) && it.kind !== "jewel") || isVariantUniqueItem(it) ? [i] : []));
  async function autoPrices(row?: number): Promise<void> {
    if (autoBusy.value) return;
    const rows = row == null ? autoTargets() : [row];
    const gen = ++autoGen;
    autoBusy.value = true;
    autoAll.value = row == null;
    autoDone.value = 0;
    autoTotal.value = rows.length;
    try {
      for (const i of rows) {
        const it = build.value?.items[i];
        const a = analyses.value.get(i);
        if (!it || gen !== autoGen) break;
        const opts = { aborted: () => gen !== autoGen, onStep: (s: string) => autoStep.set(i, s) };
        const r = isVariantUniqueItem(it)
          ? await autoUniquePrice(uniqueVariantQuery(it.name, it.base, it.mods), opts)
          : a
            ? await autoRarePrice(a, picked.get(i) ?? {}, ratios.get(i) ?? 100, opts)
            : null;
        autoStep.delete(i);
        if (!r) break;
        autoResults.set(i, r);
        // レアは手入れの欄に入れる (上書きできる)。ユニークは取った値段をそのまま使う
        if (r.exalted != null && it.rarity === "RARE") setManual(i, ...unitOf(r.exalted));
        autoDone.value++;
      }
    } finally {
      autoStep.clear();
      if (gen === autoGen) {
        autoBusy.value = false;
        autoAll.value = false;
      }
    }
  }
  function stopAuto(): void {
    autoGen++;
    autoBusy.value = false;
    autoAll.value = false;
    autoStep.clear();
  }
  /** 高貴建て → 手入れの欄の数と通貨 (1 以上になる一番大きい通貨、小数 2 桁) */
  function unitOf(exalted: number): [number, DisplayCurrency] {
    for (const c of ["divine", "chaos"] as const) {
      const v = exalted / rateOf(c);
      if (v >= 1) return [Math.round(v * 100) / 100, c];
    }
    return [Math.round(exalted * 100) / 100, "exalted"];
  }
  /** 読み込んだビルドを消して、貼る前に戻す (オーナー 2026-09-26「読み込んだあとリセットするボタン」) */
  function clear(): void {
    code.value = "";
    build.value = null;
    error.value = null;
    analyses.value = new Map();
    picked.clear();
    ratios.clear();
    stopAuto();
    autoResults.clear();
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
      ratios.clear();
      stopAuto();
      autoResults.clear();
      analyses.value = new Map((build.value?.items ?? []).map((it, i) => [i, it] as const).filter(([, it]) => it.rarity === "RARE").map(([i, it]) => [i, analyzeRare(it)]));
      progress.value = "ユニークの相場を取得中…";
      await loadUniquePrices((d, t) => (progress.value = `ユニークの相場を取得中 (${d}/${t})…`));
      priceTick.value++;
      // 読み込んだらそのままレア・種類違いユニークの相場も取る。合計は取り終えてから出す
      // (オーナー 2026-09-27「その最安値を自動で計算に加えてはくれないの？」、2026-09-26「合計表示するのは全部取得終わってから」)
      void autoPrices();
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
      const au = autoResults.get(i);
      const man = item.rarity === "RARE" ? (manual[manualKey(item)] ?? null) : null;
      return {
        i,
        item,
        // レアの名前はでたらめな組み合わせなので、主にはベースの日本語名を出す (固有の名前は画面で小さく)
        nameJa: unique ? jaUniqueName(item.name) : base ? jaTypeName(base) : item.name,
        baseJa: base ? jaTypeName(base) : "",
        price: unique ? (au?.exalted ?? up?.exalted ?? null) : man && man.amount > 0 ? man.amount * rateOf(man.currency) : null,
        variant: isVariantUniqueItem(item),
        manual: man,
        auto: autoResults.get(i) ?? null,
        autoStep: autoStep.get(i) ?? null,
        src: unique ? "unique" : item.rarity === "RARE" ? "rare" : "none",
        rare: (() => {
          const a = analyses.value.get(i);
          if (!a) return null;
          const p = picked.get(i) ?? {};
          const ratio = ratios.get(i) ?? 100;
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

  return { code, build, error, loading, progress, load, clear, setManual, autoPrices, stopAuto, autoBusy, autoAll, autoDone, autoTotal, items, runes, lineage, totals, tradeItem, tradeLink, pickTier, lowerTiers, raiseTiers, resetTiers };
}
