/**
 * ユニークのコラプトの賭け — 状態 / 相場 / trade2 (2026-09-13)
 *
 *   ユニークを選ぶ → そのクラスの付加プール (クライアント由来、i18n/vaal-enchants.json) から狙いを選ぶ
 *   → trade2 で「未コラプト最安 (材料)」「コラプト済み最安 (外れ)」「狙いの付加つきの最安」を自動で取る
 *   → アーキテクトオーブ: 1 個目を決めて 2 個目の狙いを選ぶと「2 重コラプト品の最安」も取る
 *   素材価格 (ヴァールオーブ / アーキテクトオーブ): カレンシーランキングの相場 (marketStore)
 *   期待値: unique-corrupt/model.ts
 *
 * trade2 の検索回数 (擬似レート制限 5 分 26 回): 基本 2 + 狙い (最大 3) + 2 重 (最安 1 + 狙い最大 2) = 最大 8 回。
 * 一度取った値はクエリごとに覚えて、変わった分だけ取り直す。
 */
import { computed, onScopeDispose, ref, watch } from "vue";
import { marketStore } from "../../state/market-store";
import { buildUniqueCorruptQuery } from "../../services/trade2/query";
import { trade2QueryUrl } from "../../services/trade2/league";
import { autoMinWithUrl, isRateLimited, tradeAuto } from "../../services/trade2/auto-price";
import vaalEnchants from "../../i18n/vaal-enchants.json";
import {
  DEFAULT_UNIQUE_CORRUPT_PARAMS,
  evaluateArchitect,
  evaluateUniqueCorrupt,
  type FourthOutcome,
  type TargetPrice,
  type UniqueCorruptParams,
} from "./model";

export interface EnchantInfo {
  id: string;
  group: string;
  en: string;
  ja: string;
  /** trade2 の stat id (enchant.stat_*)。空なら相場は取れない */
  trade: string[];
}
export interface UniqueInfo {
  en: string;
  ja: string;
  base: string;
  cls: string;
  fourth: FourthOutcome;
  pool: string[];
}

interface EnchantFile {
  mods: Record<string, { domain: string; group: string; en: string; ja: string; trade: string[]; spawn: { t: string; w: number }[] }>;
  uniques: Record<string, { ja: string; base: string; cls: string; group: string; fourth: FourthOutcome; pool: string[] }>;
}
const FILE = vaalEnchants as unknown as EnchantFile;
export const ENCHANTS: Record<string, EnchantInfo> = Object.fromEntries(
  Object.entries(FILE.mods).map(([id, m]) => [id, { id, group: m.group, en: m.en, ja: m.ja, trade: m.trade }]),
);
export const UNIQUES: UniqueInfo[] = Object.entries(FILE.uniques)
  .map(([en, u]) => ({ en, ja: u.ja, base: u.base, cls: u.cls, fourth: u.fourth, pool: u.pool }))
  .sort((a, b) => a.ja.localeCompare(b.ja, "ja"));

/** 装備クラスの日本語 (表示用) */
export const CLASS_JA: Record<string, string> = {
  Ring: "指輪",
  Amulet: "アミュレット",
  Belt: "ベルト",
  "Body Armour": "鎧",
  Helmet: "兜",
  Gloves: "手袋",
  Boots: "靴",
  Shield: "盾",
  Buckler: "バックラー",
  Focus: "フォーカス",
  Quiver: "矢筒",
  Jewel: "ジュエル",
  Wand: "ワンド",
  Sceptre: "王笏",
  Staff: "杖",
  Warstaff: "クォータースタッフ",
  Bow: "弓",
  Crossbow: "クロスボウ",
  Spear: "槍",
  Dagger: "短剣",
  "One Hand Mace": "片手メイス",
  "Two Hand Mace": "両手メイス",
  "One Hand Sword": "片手剣",
  "Two Hand Sword": "両手剣",
  Talisman: "タリスマン",
  Flail: "フレイル",
};

/** 狙いの上限 (trade2 の検索回数を抑える) */
export const MAX_TARGETS = 3;
export const MAX_SECOND_TARGETS = 2;

interface Fetched {
  price: number | null;
  url: string | null;
}

export function useUniqueCorrupt() {
  // ---- ユニーク選択 ----
  const query = ref("");
  const selected = ref<UniqueInfo | null>(null);
  const matches = computed<UniqueInfo[]>(() => {
    const q = query.value.trim().toLowerCase();
    if (!q) return [];
    const hit = UNIQUES.filter((u) => u.ja.toLowerCase().includes(q) || u.en.toLowerCase().includes(q));
    hit.sort((a, b) => {
      const as = a.ja.toLowerCase().startsWith(q) || a.en.toLowerCase().startsWith(q) ? 0 : 1;
      const bs = b.ja.toLowerCase().startsWith(q) || b.en.toLowerCase().startsWith(q) ? 0 : 1;
      return as - bs || a.ja.localeCompare(b.ja, "ja");
    });
    return hit.slice(0, 12);
  });
  const targets = ref<string[]>([]);
  const firstEnchant = ref<string | null>(null);
  const secondTargets = ref<string[]>([]);
  function select(u: UniqueInfo): void {
    selected.value = u;
    query.value = u.ja;
    targets.value = [];
    firstEnchant.value = null;
    secondTargets.value = [];
    fetchSeq++; // 取得中なら捨てる (古いユニークのクエリを続けない)
  }
  /** 選んだユニークのクラスの付加プール */
  const pool = computed<EnchantInfo[]>(() => (selected.value ? selected.value.pool.map((id) => ENCHANTS[id]).filter((m): m is EnchantInfo => !!m) : []));
  const poolSize = computed(() => pool.value.length);
  function toggleTarget(id: string): void {
    const cur = targets.value;
    if (cur.includes(id)) {
      targets.value = cur.filter((x) => x !== id);
      if (firstEnchant.value === id) firstEnchant.value = null;
      return;
    }
    if (cur.length >= MAX_TARGETS) return;
    targets.value = [...cur, id];
  }
  /** 2 個目のプール = 1 個目と別グループ */
  const secondPool = computed<EnchantInfo[]>(() => {
    const first = firstEnchant.value ? ENCHANTS[firstEnchant.value] : null;
    return first ? pool.value.filter((m) => m.group !== first.group) : [];
  });
  function toggleSecond(id: string): void {
    const cur = secondTargets.value;
    if (cur.includes(id)) {
      secondTargets.value = cur.filter((x) => x !== id);
      return;
    }
    if (cur.length >= MAX_SECOND_TARGETS) return;
    secondTargets.value = [...cur, id];
  }
  watch(firstEnchant, () => {
    secondTargets.value = [];
  });

  // ---- 相場 (アプリ共通の相場ストア) ----
  const league = marketStore.league;
  const marketError = marketStore.error;
  const marketLabel = marketStore.fetchedLabel;
  const priceOf = marketStore.priceOf;
  async function loadMarket(): Promise<void> {
    await marketStore.ensureMarket();
  }
  const tradeLeague = computed(() => league.value?.Value ?? "Standard");
  const auto = computed(() => ({
    vaal: priceOf("vaal"),
    architect: priceOf("architects-orb"),
    uniqueRef: marketStore.uniquePriceOf(selected.value?.en ?? null),
  }));

  // ---- trade2 (クエリごとに覚える) ----
  const fetched = ref<Record<string, Fetched>>({});
  const pricing = ref(false);
  const priceError = ref<string | null>(null);
  type QueryKind = "base" | "floor" | `target:${string}` | "twice-floor" | `twice:${string}`;
  function queryFor(kind: QueryKind): ReturnType<typeof buildUniqueCorruptQuery> | null {
    const u = selected.value;
    if (!u) return null;
    if (kind === "base") return buildUniqueCorruptQuery(u.en, { corrupted: false });
    if (kind === "floor") return buildUniqueCorruptQuery(u.en, { corrupted: true, twiceCorrupted: false });
    if (kind === "twice-floor") {
      const f = firstEnchant.value ? ENCHANTS[firstEnchant.value] : null;
      if (!f || f.trade.length === 0) return null;
      return buildUniqueCorruptQuery(u.en, { corrupted: true, twiceCorrupted: true, enchantStats: f.trade });
    }
    if (kind.startsWith("target:")) {
      const m = ENCHANTS[kind.slice("target:".length)];
      if (!m || m.trade.length === 0) return null;
      return buildUniqueCorruptQuery(u.en, { corrupted: true, twiceCorrupted: false, enchantStats: m.trade });
    }
    const f = firstEnchant.value ? ENCHANTS[firstEnchant.value] : null;
    const m = ENCHANTS[kind.slice("twice:".length)];
    if (!f || !m || f.trade.length === 0 || m.trade.length === 0) return null;
    return buildUniqueCorruptQuery(u.en, { corrupted: true, twiceCorrupted: true, enchantStats: [...f.trade, ...m.trade] });
  }
  const cacheKey = (kind: QueryKind): string => `${selected.value?.en ?? ""}|${tradeLeague.value}|${kind}|${kind.startsWith("twice") ? firstEnchant.value ?? "" : ""}`;
  /** いま要る検索 (順番 = 取る順番)。trade2 で検索できない付加 (stat id なし) は除く */
  const wanted = computed<QueryKind[]>(() => {
    if (!selected.value) return [];
    const list: QueryKind[] = ["base", "floor", ...targets.value.map((id): QueryKind => `target:${id}`)];
    if (firstEnchant.value) list.push("twice-floor", ...secondTargets.value.map((id): QueryKind => `twice:${id}`));
    return list.filter((k) => queryFor(k) != null);
  });
  function get(kind: QueryKind): Fetched | null {
    return fetched.value[cacheKey(kind)] ?? null;
  }
  function tradeUrl(kind: QueryKind): string | null {
    const done = get(kind)?.url;
    if (done) return done;
    const q = queryFor(kind);
    return q ? trade2QueryUrl(tradeLeague.value, q) : null;
  }
  let fetchSeq = 0;
  /** 取得中に条件が変わった (取得が終わったらもう一度回す) */
  let dirty = false;
  /** 取得中の残り件数 (ボタンの文言用。force のときは全件) */
  const remaining = ref(0);
  /** 足りない物だけ trade2 で取る (force なら全部取り直す)。取得中に増えた分も同じループで拾う */
  async function fetchPrices(force = false): Promise<void> {
    if (!selected.value || league.value == null) return;
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
        const todo = wanted.value.filter((k) => (force ? !done.has(cacheKey(k)) : !get(k)));
        remaining.value = todo.length;
        const kind = todo[0];
        if (!kind) break;
        const key = cacheKey(kind);
        const q = queryFor(kind);
        if (!q) break;
        const { min, url } = await autoMinWithUrl(tradeLeague.value, q, marketStore.rates.value);
        if (seq !== fetchSeq) return;
        done.add(key);
        if (min == null && url == null) {
          // 検索 ID すら返らない = 429 か通信エラー。「取得済み」にはせず、次の機会に取り直す
          priceError.value = tradeAuto.lastError.value;
          break;
        }
        fetched.value = { ...fetched.value, [key]: { price: min, url } };
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
  watch([wanted, tradeLeague], () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => void fetchPrices(), 600);
  });
  onScopeDispose(() => {
    if (debounce) clearTimeout(debounce);
    fetchSeq++;
  });
  const pending = computed(() => wanted.value.filter((k) => !get(k)).length);

  // ---- 計算 ----
  const params = ref<UniqueCorruptParams>({ weights: { ...DEFAULT_UNIQUE_CORRUPT_PARAMS.weights }, architectSurvive: DEFAULT_UNIQUE_CORRUPT_PARAMS.architectSurvive });
  function resetParams(): void {
    params.value = { weights: { ...DEFAULT_UNIQUE_CORRUPT_PARAMS.weights }, architectSurvive: DEFAULT_UNIQUE_CORRUPT_PARAMS.architectSurvive };
  }
  const basePrice = computed(() => get("base")?.price ?? null);
  const floorPrice = computed(() => get("floor")?.price ?? null);
  const targetPrices = computed<TargetPrice[]>(() =>
    targets.value.map((id) => ({ id, label: ENCHANTS[id]?.ja ?? id, price: get(`target:${id}`)?.price ?? null })),
  );
  const result = computed(() =>
    evaluateUniqueCorrupt(
      {
        basePrice: basePrice.value,
        vaalPrice: auto.value.vaal,
        floorPrice: floorPrice.value,
        poolSize: poolSize.value,
        fourth: selected.value?.fourth ?? "none",
        targets: targetPrices.value,
      },
      params.value,
    ),
  );
  const firstValue = computed(() => (firstEnchant.value ? (get(`target:${firstEnchant.value}`)?.price ?? null) : null));
  const twiceFloorPrice = computed(() => get("twice-floor")?.price ?? null);
  const secondPrices = computed<TargetPrice[]>(() =>
    secondTargets.value.map((id) => ({ id, label: ENCHANTS[id]?.ja ?? id, price: get(`twice:${id}`)?.price ?? null })),
  );
  const architect = computed(() =>
    evaluateArchitect(
      {
        itemValue: firstValue.value,
        orbPrice: auto.value.architect,
        poolSize: secondPool.value.length,
        targets: secondPrices.value,
        floorPrice: twiceFloorPrice.value,
      },
      params.value,
    ),
  );

  return {
    query,
    selected,
    matches,
    select,
    pool,
    poolSize,
    targets,
    toggleTarget,
    firstEnchant,
    secondPool,
    secondTargets,
    toggleSecond,
    league,
    marketError,
    marketLabel,
    loadMarket,
    auto,
    pricing,
    priceError,
    pending,
    remaining,
    fetchPrices,
    get,
    tradeUrl,
    basePrice,
    floorPrice,
    targetPrices,
    firstValue,
    twiceFloorPrice,
    secondPrices,
    params,
    resetParams,
    result,
    architect,
    tradeAuto,
  };
}
