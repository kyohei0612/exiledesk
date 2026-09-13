/**
 * 規格外の賭け — 状態 / 相場 / trade2 (2026-09-14、ソケット 2 固定)
 *
 *   レシピ (ES 兜 / ライフ耐性手袋 / 移動速度靴) を選ぶ
 *   → trade2 で「ベース (マジック + ベース MOD のティア)」「売値の段 ×3」「外れ」の最安を自動で取る (クエリごとに覚える)
 *   → 素材はカレンシーランキングの相場
 *   → 当たり方は sim.ts (poe2db の推定重み × クライアントのティア値)、売値の段で期待収支を出す
 *   → 選択肢 (エッセンス × 肋骨 × 反響のお告げ × 高貴なオーブ × 右側のお告げ × ルーン。高貴なオーブは毎回 偉大なる高貴なお告げ と一緒に使って 2 つ足す) を全部比べ、既定では一番収支がいい組み合わせを素材に出す
 * trade2 の検索は条件ごとに 5 回。擬似レート制限 (5 分 26 回 + サーバーの残り回数) の中で直列に取る。
 */
import { computed, nextTick, onScopeDispose, ref, watch } from "vue";
import { marketStore } from "../../state/market-store";
import { buildSpecQuery } from "../../services/trade2/query";
import { trade2QueryUrl } from "../../services/trade2/league";
import { autoMinWithUrl, isRateLimited, tradeAuto } from "../../services/trade2/auto-price";
import {
  ECHOES,
  ECHO_API_ID,
  EXALT_ADDS,
  EXALTS,
  EXCEPTIONAL_SOCKETS,
  RECIPES,
  RIBS,
  SIDES,
  bucketLabel,
  exaltLevelsFor,
  materialsFor,
  type BucketDef,
  type EchoId,
  type ExaltId,
  type RecipeDef,
  type RecipeId,
  type RibId,
  type SideId,
} from "./recipes";
import {
  DEFAULT_NORMAL_SHARE,
  baseModTiers,
  effectiveExaltCount,
  evaluateLadder,
  findEssence,
  simulate,
  slotsAfterSetup,
  type LadderBucket,
  type Metric,
  type PostOptions,
  type SimOptions,
} from "./sim";

/** 指標 → trade2 の擬似 stat (ES は equipment_filters.es) */
const METRIC_TRADE: Record<Metric, string | null> = {
  es: null,
  life: "pseudo.pseudo_total_life",
  res: "pseudo.pseudo_total_elemental_resistance",
  chaos: "pseudo.pseudo_total_chaos_resistance",
  ms: "pseudo.pseudo_increased_movement_speed",
};

interface Fetched {
  price: number | null;
  url: string | null;
}
/** trade2 で取った相場 (クエリごと、画面をまたいで共有 = 開き直しで取り直さない) */
const FETCHED = ref<Record<string, Fetched>>({});
const RECIPE_KEY = "exiledesk.rare-craft.recipe";

type Kind = "base" | "floor" | `b:${string}`;

/** 比較表の 1 行 */
export interface Variant {
  key: string;
  essenceId: string;
  rib: RibId;
  echo: EchoId;
  exalt: ExaltId;
  count: number;
  side: SideId;
  runeId: string;
  labels: { essence: string; rib: string; echo: string; exalt: string; side: string; rune: string };
  cost: number;
  expectedSale: number;
  ev: number;
  pProfit: number;
  pTop: number;
  current: boolean;
}

function loadRecipe(): RecipeId {
  try {
    const v = localStorage.getItem(RECIPE_KEY);
    if (v && RECIPES.some((r) => r.id === v)) return v as RecipeId;
  } catch {
    /* 読めなくても動く */
  }
  return "es-helmet";
}

export function useRareCraft() {
  // ---- レシピと選択 ----
  const recipeId = ref<RecipeId>(loadRecipe());
  const recipe = computed<RecipeDef>(() => RECIPES.find((r) => r.id === recipeId.value) ?? RECIPES[0]);
  const pageId = ref(recipe.value.pages[0].id);
  const page = computed(() => recipe.value.pages.find((p) => p.id === pageId.value) ?? recipe.value.pages[0]);
  const ilvl = ref(recipe.value.ilvl);
  const baseTier = ref(recipe.value.baseMod.defaultTier);
  /** 規格外 = ソケット 2 固定 (オーナー指示 2026-09-14) */
  const sockets = computed(() => EXCEPTIONAL_SOCKETS);
  const quality = ref(recipe.value.quality);
  const baseEs = ref(page.value.baseEs);
  const essenceId = ref(recipe.value.defaultEssence);
  const rib = ref<RibId>("preserved");
  const exalt = ref<ExaltId>("greater");
  const echo = ref<EchoId>("none");
  const side = ref<SideId>("any");
  const runeId = ref(recipe.value.defaultRune);
  const buckets = ref<BucketDef[]>(recipe.value.buckets.map((b) => ({ key: b.key, conds: { ...b.conds } })));
  const floorConds = ref<Partial<Record<Metric, number>>>({ ...recipe.value.floor });
  /** 冒涜の 3 択で 2 つ目・3 つ目が通常の MOD になる確率 */
  const normalShare = ref(DEFAULT_NORMAL_SHARE);

  /**
   * 一番収支がいい組み合わせを素材に自動で出す (オーナー指示 2026-09-14)。
   * 素材の選択を手で変えたら自動は切れる (比較表の「これにする」も同じ)。
   */
  const autoBest = ref(true);
  let applying = false;
  async function programmatic(fn: () => void): Promise<void> {
    applying = true;
    fn();
    await nextTick();
    applying = false;
  }

  function resetForRecipe(): void {
    const r = recipe.value;
    void programmatic(() => {
      pageId.value = r.pages[0].id;
      ilvl.value = r.ilvl;
      baseTier.value = r.baseMod.defaultTier;
      quality.value = r.quality;
      baseEs.value = r.pages[0].baseEs;
      essenceId.value = r.defaultEssence;
      runeId.value = r.defaultRune;
      buckets.value = r.buckets.map((b) => ({ key: b.key, conds: { ...b.conds } }));
      floorConds.value = { ...r.floor };
    });
  }
  function resetThresholds(): void {
    const r = recipe.value;
    buckets.value = r.buckets.map((b) => ({ key: b.key, conds: { ...b.conds } }));
    floorConds.value = { ...r.floor };
  }
  watch(recipeId, (id) => {
    try {
      localStorage.setItem(RECIPE_KEY, id);
    } catch {
      /* 保存できなくても動く */
    }
    autoBest.value = true;
    resetForRecipe();
  });
  watch(pageId, () => {
    baseEs.value = page.value.baseEs;
  });

  // ---- 相場 (アプリ共通) ----
  const league = marketStore.league;
  const marketError = marketStore.error;
  const marketLabel = marketStore.fetchedLabel;
  const priceOf = marketStore.priceOf;
  const tradeLeague = computed(() => league.value?.Value ?? "Standard");
  async function loadMarket(): Promise<void> {
    await marketStore.ensureMarket();
    void fetchPrices();
  }

  // ---- ベース MOD のティアとエッセンス ----
  const tiers = computed(() => baseModTiers(pageId.value, recipe.value.baseMod.family, recipe.value.baseMod.stat, ilvl.value));
  const currentTier = computed(() => tiers.value[Math.min(Math.max(1, baseTier.value), Math.max(1, tiers.value.length)) - 1] ?? null);
  const essences = computed(() =>
    recipe.value.essences.map((e) => {
      const pe = findEssence(pageId.value, e.name, e.stat);
      const clash = !!pe && pe.family === recipe.value.baseMod.family;
      return { ...e, ok: !!pe && !clash, reason: !pe ? "この装備に付かない" : clash ? "ベースの MOD と同じ系統" : "", gen: pe?.gen ?? null, range: pe?.stats.find((s) => s.id === e.stat) ?? null };
    }),
  );
  watch(
    essences,
    (list) => {
      if (!list.find((e) => e.id === essenceId.value)?.ok) {
        const first = list.find((e) => e.ok);
        if (first) void programmatic(() => (essenceId.value = first.id));
      }
    },
    { immediate: true },
  );

  // ---- シミュレーションの条件 ----
  function simOptionsFor(o: { essenceId: string; exalt: ExaltId; side: SideId; rib: RibId; echo: EchoId }, samples: number): SimOptions {
    const r = recipe.value;
    const e = essences.value.find((x) => x.id === o.essenceId);
    const base = {
      page: pageId.value,
      ilvl: ilvl.value,
      baseMods: [{ family: r.baseMod.family, stat: r.baseMod.stat, tier: baseTier.value }],
      essence: e && e.ok ? { name: e.name, stat: e.stat } : null,
      desecrate: true,
    };
    const slots = slotsAfterSetup(base);
    const eff = effectiveExaltCount(slots, o.side, EXALT_ADDS);
    return {
      ...base,
      ribMinLevel: RIBS.find((x) => x.id === o.rib)?.minLevel ?? 0,
      normalShare: normalShare.value,
      echo: o.echo === "echoes",
      exaltLevels: exaltLevelsFor(o.exalt, eff),
      exaltSide: o.side,
      priority: r.priority,
      samples,
    };
  }
  const current = computed(() => ({ essenceId: essenceId.value, exalt: exalt.value, side: side.value, rib: rib.value, echo: echo.value }));
  const slots = computed(() => slotsAfterSetup(simOptionsFor(current.value, 0)));
  const effectiveCount = computed(() => effectiveExaltCount(slots.value, side.value, EXALT_ADDS));
  function postFor(rune: string): PostOptions {
    const rd = recipe.value.runes.find((x) => x.id === rune);
    return {
      baseEs: recipe.value.id === "es-helmet" ? baseEs.value : 0,
      quality: quality.value,
      rune: rd?.effect ?? {},
      runeCount: rd?.apiId ? sockets.value : 0,
    };
  }

  // ---- trade2 ----
  function condsToSpec(conds: Partial<Record<Metric, number>>): { esMin?: number; stats: { id: string; min: number }[] } {
    const stats: { id: string; min: number }[] = [];
    for (const k of Object.keys(conds) as Metric[]) {
      const v = conds[k];
      const id = METRIC_TRADE[k];
      if (v != null && id) stats.push({ id, min: v });
    }
    return { esMin: conds.es, stats };
  }
  const kinds = computed<Kind[]>(() => ["base", ...buckets.value.map((b): Kind => `b:${b.key}`), "floor"]);
  function queryFor(kind: Kind): ReturnType<typeof buildSpecQuery> {
    const r = recipe.value;
    const d = page.value.defence;
    const common = { category: r.category, socketsMin: sockets.value, arMin: d.arMin, evMin: d.evMin };
    if (kind === "base") {
      const t = currentTier.value;
      return buildSpecQuery({ ...common, rarity: "magic", ilvlMin: ilvl.value, esMin: d.esMin, stats: t ? [{ id: r.baseMod.tradeStat, min: t.min }] : [] });
    }
    const conds = kind === "floor" ? floorConds.value : (buckets.value.find((b) => `b:${b.key}` === kind)?.conds ?? {});
    const spec = condsToSpec(conds);
    return buildSpecQuery({ ...common, rarity: "nonunique", esMin: spec.esMin ?? d.esMin, stats: spec.stats });
  }
  const cacheKey = (kind: Kind): string => `${tradeLeague.value}|${JSON.stringify(queryFor(kind))}`;
  function get(kind: Kind): Fetched | null {
    return FETCHED.value[cacheKey(kind)] ?? null;
  }
  function tradeUrl(kind: Kind): string | null {
    return get(kind)?.url ?? trade2QueryUrl(tradeLeague.value, queryFor(kind));
  }
  const pricing = ref(false);
  const priceError = ref<string | null>(null);
  const remaining = ref(0);
  let fetchSeq = 0;
  let dirty = false;
  async function fetchPrices(force = false): Promise<void> {
    if (league.value == null) return;
    if (pricing.value) {
      dirty = true;
      return;
    }
    if (isRateLimited()) return;
    const seq = ++fetchSeq;
    pricing.value = true;
    priceError.value = null;
    const done = new Set<string>();
    try {
      for (;;) {
        const todo = kinds.value.filter((k) => (force ? !done.has(cacheKey(k)) : !get(k)));
        remaining.value = todo.length;
        const kind = todo[0];
        if (!kind) break;
        const key = cacheKey(kind);
        const { min, url } = await autoMinWithUrl(tradeLeague.value, queryFor(kind), marketStore.rates.value);
        if (seq !== fetchSeq) return;
        done.add(key);
        if (min == null && url == null) {
          priceError.value = tradeAuto.lastError.value;
          break;
        }
        FETCHED.value = { ...FETCHED.value, [key]: { price: min, url } };
      }
    } finally {
      if (seq === fetchSeq) {
        pricing.value = false;
        remaining.value = 0;
        if (dirty) {
          dirty = false;
          void fetchPrices();
        }
      }
    }
  }
  let debounce: ReturnType<typeof setTimeout> | null = null;
  watch(
    [kinds, () => kinds.value.map((k) => cacheKey(k)).join("\n")],
    () => {
      if (debounce) clearTimeout(debounce);
      // しきい値を打っている途中で検索しないように長めに待つ
      debounce = setTimeout(() => void fetchPrices(), 1500);
    },
  );
  onScopeDispose(() => {
    if (debounce) clearTimeout(debounce);
    fetchSeq++;
  });

  // ---- 相場の値 ----
  const basePrice = computed(() => get("base")?.price ?? null);
  const floorFetched = computed(() => get("floor"));
  /** 外れの売値: 取れて出品が無ければ 0 */
  const floorPrice = computed(() => (floorFetched.value ? (floorFetched.value.price ?? 0) : null));
  const ladderBuckets = computed<LadderBucket[]>(() =>
    buckets.value.map((b) => ({ key: b.key, label: bucketLabel(b.conds), conds: b.conds, price: get(`b:${b.key}`)?.price ?? null })),
  );

  // ---- 素材と費用 ----
  function materialRows(o: { essenceId: string; exalt: ExaltId; count: number; side: SideId; rib: RibId; echo: EchoId; runeId: string }) {
    return materialsFor(recipe.value, { essenceId: o.essenceId, rib: o.rib, echo: o.echo, exalt: o.exalt, count: o.count, side: o.side, runeId: o.runeId, sockets: sockets.value }).map((m) => ({
      ...m,
      unit: priceOf(m.apiId),
    }));
  }
  const materials = computed(() => materialRows({ ...current.value, count: effectiveCount.value, runeId: runeId.value }));
  function costOf(rows: { unit: number | null; qty: number }[]): number | null {
    if (basePrice.value == null) return null;
    let c = basePrice.value;
    for (const m of rows) {
      if (m.unit == null) return null;
      c += m.unit * m.qty;
    }
    return c;
  }
  const cost = computed(() => costOf(materials.value));
  const missing = computed(() => {
    const out: string[] = [];
    if (basePrice.value == null) out.push("ベースの最安");
    if (floorPrice.value == null) out.push("外れの売値");
    for (const m of materials.value) if (m.unit == null) out.push(m.label);
    return out;
  });

  // ---- 計算 ----
  const sim = computed(() => simulate(simOptionsFor(current.value, 20000)));
  const result = computed(() => {
    const s = sim.value;
    if (!s.ok || cost.value == null || floorPrice.value == null) return null;
    return evaluateLadder(s, postFor(runeId.value), ladderBuckets.value, floorPrice.value, cost.value);
  });
  /** 一番高い段 (N 回で 1 個以上当たる確率の対象) */
  const topRow = computed(() => {
    const r = result.value;
    if (!r) return null;
    const priced = r.rows.filter((x) => x.price != null);
    return priced.sort((a, b) => (b.price ?? 0) - (a.price ?? 0))[0] ?? null;
  });

  // ---- 選択肢の比較 ----
  const variants = computed<Variant[]>(() => {
    const out: Variant[] = [];
    if (basePrice.value == null || floorPrice.value == null) return out;
    for (const es of essences.value) {
      if (!es.ok) continue;
      for (const rb of RIBS) {
        for (const ec of ECHOES) {
          for (const ex of EXALTS) {
            for (const sd of SIDES) {
              const so = simOptionsFor({ essenceId: es.id, exalt: ex.id, side: sd.id, rib: rb.id, echo: ec.id }, 2500);
              const eff = so.exaltLevels.length;
              const s = simulate(so);
              if (!s.ok) continue;
              for (const ru of recipe.value.runes) {
                const c = costOf(materialRows({ essenceId: es.id, exalt: ex.id, count: eff, side: sd.id, rib: rb.id, echo: ec.id, runeId: ru.id }));
                if (c == null) continue;
                const lr = evaluateLadder(s, postFor(ru.id), ladderBuckets.value, floorPrice.value, c);
                const top = lr.rows.filter((x) => x.price != null).sort((a, b) => (b.price ?? 0) - (a.price ?? 0))[0];
                out.push({
                  key: `${es.id}|${rb.id}|${ec.id}|${ex.id}|${sd.id}|${ru.id}`,
                  essenceId: es.id,
                  rib: rb.id,
                  echo: ec.id,
                  exalt: ex.id,
                  count: eff,
                  side: sd.id,
                  runeId: ru.id,
                  labels: { essence: es.label, rib: rb.label, echo: ec.label, exalt: ex.label, side: sd.label, rune: ru.label },
                  cost: c,
                  expectedSale: lr.expectedSale,
                  ev: lr.ev,
                  pProfit: lr.pProfit,
                  pTop: top?.pSold ?? 0,
                  current: es.id === essenceId.value && rb.id === rib.value && ec.id === echo.value && ex.id === exalt.value && sd.id === side.value && ru.id === runeId.value,
                });
              }
            }
          }
        }
      }
    }
    return out.sort((a, b) => b.ev - a.ev);
  });
  const bestVariant = computed(() => variants.value[0] ?? null);
  /** 相場が無くて比較表に出せない素材 (その素材を使う組み合わせは表から消える) */
  const unpricedOptions = computed(() => {
    const ids = new Map<string, string>();
    for (const e of essences.value) if (e.ok) ids.set(e.apiId, e.label.replace(/ \(.+\)$/, ""));
    for (const rb of RIBS) ids.set(rb.apiId, rb.label);
    ids.set(ECHO_API_ID, "アビスの反響のお告げ");
    for (const ex of EXALTS) ids.set(ex.apiId, ex.label);
    ids.set("omen-of-greater-exaltation", "偉大なる高貴なお告げ");
    ids.set("omen-of-dextral-exaltation", "右側の高貴なお告げ");
    ids.set("artificers", "熟練工のオーブ");
    for (const ru of recipe.value.runes) if (ru.apiId) ids.set(ru.apiId, ru.label.replace(/ \(.+\)$/, ""));
    return [...ids].filter(([id]) => priceOf(id) == null).map(([, label]) => label);
  });

  function applyVariant(key: string): Promise<void> {
    const [es, rb, ec, ex, sd, ru] = key.split("|");
    return programmatic(() => {
      essenceId.value = es;
      rib.value = rb as RibId;
      echo.value = ec as EchoId;
      exalt.value = ex as ExaltId;
      side.value = sd as SideId;
      runeId.value = ru;
    });
  }
  /** 比較表の「これにする」(手で選んだので自動は切る) */
  function selectVariant(key: string): void {
    autoBest.value = false;
    void applyVariant(key);
  }
  // 素材の選択を手で変えたら自動を切る
  watch([essenceId, rib, echo, exalt, side, runeId], () => {
    if (!applying) autoBest.value = false;
  });
  // 自動のときは一番収支がいい組み合わせを出す
  watch(
    [() => bestVariant.value?.key ?? null, autoBest],
    ([key, on]) => {
      if (on && key && !bestVariant.value?.current) void applyVariant(key);
    },
    { immediate: true },
  );

  return {
    RECIPES,
    RIBS,
    EXALTS,
    SIDES,
    ECHOES,
    EXALT_ADDS,
    recipeId,
    recipe,
    pageId,
    page,
    ilvl,
    baseTier,
    tiers,
    currentTier,
    sockets,
    quality,
    baseEs,
    essenceId,
    essences,
    rib,
    exalt,
    echo,
    effectiveCount,
    side,
    runeId,
    normalShare,
    autoBest,
    slots,
    buckets,
    floorConds,
    resetThresholds,
    league,
    marketError,
    marketLabel,
    loadMarket,
    pricing,
    priceError,
    remaining,
    fetchPrices,
    get,
    tradeUrl,
    basePrice,
    floorPrice,
    ladderBuckets,
    materials,
    cost,
    missing,
    sim,
    result,
    topRow,
    variants,
    bestVariant,
    unpricedOptions,
    selectVariant,
    tradeAuto,
  };
}
