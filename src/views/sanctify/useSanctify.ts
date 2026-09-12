/**
 * 聖別の賭け — 状態 / 相場 / 評価 (2026-09-12)
 *
 *   貼り付け解析: services/items/parse-item.ts (ゲーム内 Ctrl+C、日英)
 *   費用:         poe2scout (神のオーブ + 聖別のお告げ)
 *   期待値:       sanctify/model.ts
 */
import { computed, ref } from "vue";
import { marketStore } from "../../state/market-store";
import { parseItemText, type ParsedItem } from "../../services/items/parse-item";
import { buildRareBaseQuery, statFiltersFromIds } from "../../services/trade2/query";
import { trade2QueryUrl } from "../../services/trade2/league";
import { autoMin, isRateLimited, tradeAuto } from "../../services/trade2/auto-price";
import {
  DEFAULT_SANCTIFY_PARAMS,
  evaluateSanctify,
  type SanctifyAffix,
  type SanctifyParams,
  type SanctifyPrices,
  type SanctifyResult,
} from "./model";

let seq = 0;
const nextId = (): string => `a${++seq}`;

/** 表示値の小数桁 (例 "1.5" → 1、"24" → 0) */
function decimalsOf(text: string, value: number): number {
  const m = text.match(new RegExp(`(?<![\\d.])${String(value).replace(".", "[.]")}(?![\\d])`));
  const s = m ? m[0] : String(value);
  const dot = s.indexOf(".");
  return dot < 0 ? 0 : Math.min(2, s.length - dot - 1);
}

function defaultsFor(shown: number, decimals: number): { brickBelow: number; target: number } {
  const m = Math.pow(10, decimals);
  const brick = Math.floor(shown * 0.9 * m) / m;
  const target = Math.ceil(shown * 1.1 * m) / m;
  return { brickBelow: brick, target: Math.max(target, shown) };
}

export function useSanctify() {
  // ---- 貼り付け ----
  const text = ref("");
  const parsed = ref<ParsedItem | null>(null);
  const parseError = ref<string | null>(null);
  const affixes = ref<SanctifyAffix[]>([]);
  const qualityPct = ref(0);

  function analyze(): void {
    parseError.value = null;
    const p = parseItemText(text.value);
    if (!p) {
      parsed.value = null;
      parseError.value = "装備テキストとして読めませんでした。ゲーム内で装備に Ctrl+C した内容をそのまま貼ってください。";
      return;
    }
    parsed.value = p;
    const list: SanctifyAffix[] = [];
    for (const m of p.mods) {
      if (!m.identified) continue;
      const v = m.stats[0]?.value;
      if (typeof v !== "number" || !Number.isFinite(v) || v === 0) continue;
      const shown = Math.abs(v);
      const decimals = decimalsOf(m.textEn, shown);
      const d = defaultsFor(shown, decimals);
      list.push({
        id: nextId(),
        label: m.textJa || m.raw,
        shown,
        decimals,
        qualityApplies: false,
        key: true,
        brickBelow: d.brickBelow,
        target: d.target,
        jackpot: null,
        statIds: m.stats.map((st) => st.id),
      });
    }
    affixes.value = list;
    // 品質は貼り付け文の「品質: +20%」から拾う (無ければそのまま)
    const q = text.value.match(/(?:Quality|品質)[^\d]*?(\d+)\s*%/);
    if (q) qualityPct.value = Number(q[1]);
    void fetchPrices();
  }

  function addAffix(): void {
    affixes.value = [
      ...affixes.value,
      { id: nextId(), label: "", shown: 10, decimals: 0, qualityApplies: false, key: true, brickBelow: 9, target: 11, jackpot: null },
    ];
  }
  function removeAffix(id: string): void {
    affixes.value = affixes.value.filter((a) => a.id !== id);
  }
  function resetDefaults(a: SanctifyAffix): void {
    const d = defaultsFor(a.shown, a.decimals);
    a.brickBelow = d.brickBelow;
    a.target = d.target;
  }

  // ---- 相場 (アプリ共通の相場ストア) ----
  const league = marketStore.league;
  const marketError = marketStore.error;
  const marketLabel = marketStore.fetchedLabel;
  const loadMarket = (): Promise<void> => marketStore.ensureMarket();
  const priceOf = marketStore.priceOf;
  const divinePrice = computed(() => priceOf("divine"));
  const omenPrice = computed(() => priceOf("omen-of-sanctification"));
  const cost = computed(() => (divinePrice.value ?? 0) + (omenPrice.value ?? 0));
  const divineRate = computed(() => league.value?.DivinePrice || 1);

  // ---- 売値 (trade2 自動 → 手で上書き可) / 前提 ----
  const prices = ref<SanctifyPrices>({ unsanctified: null, unchanged: null, bricked: 0, hit: null, jackpot: null });
  const pricing = ref(false);
  /** 現状維持の売値を自動で埋めた時の係数 (未聖別 × これ)。加工不可になる分だけ安い、の目安 */
  const UNCHANGED_RATIO = 0.7;
  const autoNote = ref<string | null>(null);
  const hasJackpot = computed(() => affixes.value.some((a) => a.key && a.jackpot != null));

  /** 重要モッドの下限を「表示値 / 目標 / 大当たり」にした同ベース・同 mod のレア検索 */
  function queryFor(kind: "shown" | "target" | "jackpot") {
    const keys = affixes.value.filter((a) => a.key && a.statIds && a.statIds.length > 0);
    const entries = keys.map((a) => ({
      ids: a.statIds!,
      min: kind === "shown" ? a.shown : kind === "target" ? a.target : a.jackpot,
    }));
    const filters = statFiltersFromIds(entries);
    if (filters.length === 0) return null;
    return buildRareBaseQuery(parsed.value?.baseEn ?? null, filters);
  }
  const tradeLeague = computed(() => league.value?.Value ?? "Standard");
  function tradeUrl(kind: "shown" | "target" | "jackpot"): string | null {
    const q = queryFor(kind);
    return q ? trade2QueryUrl(tradeLeague.value, q) : null;
  }
  let fetchSeq = 0;
  /** 未聖別 (今の値) / 当たり (目標値) / 大当たり を trade2 で取る。取れた物だけ埋め、現状維持は未聖別 × 0.7 の目安 */
  async function fetchPrices(): Promise<void> {
    if (pricing.value || isRateLimited()) return;
    const seq = ++fetchSeq;
    pricing.value = true;
    autoNote.value = null;
    try {
      const kinds: Array<"shown" | "target" | "jackpot"> = ["shown", "target"];
      if (hasJackpot.value) kinds.push("jackpot");
      for (const kind of kinds) {
        const q = queryFor(kind);
        if (!q) {
          autoNote.value = "trade2 に対応する stat が無いモッドだけなので自動取得できません。手入力してください";
          continue;
        }
        const v = await autoMin(tradeLeague.value, q, marketStore.rates.value);
        if (seq !== fetchSeq) return;
        if (v == null) continue;
        if (kind === "shown") {
          prices.value = { ...prices.value, unsanctified: v, unchanged: Math.round(v * UNCHANGED_RATIO * 100) / 100 };
        } else if (kind === "target") {
          prices.value = { ...prices.value, hit: v };
        } else {
          prices.value = { ...prices.value, jackpot: v };
        }
      }
    } finally {
      if (seq === fetchSeq) pricing.value = false;
    }
  }

  const params = ref<SanctifyParams>({ ...DEFAULT_SANCTIFY_PARAMS });
  function resetParams(): void {
    params.value = { ...DEFAULT_SANCTIFY_PARAMS };
  }

  const result = computed<SanctifyResult>(() => evaluateSanctify(affixes.value, qualityPct.value, prices.value, cost.value, params.value));

  return {
    text,
    parsed,
    parseError,
    affixes,
    qualityPct,
    analyze,
    addAffix,
    removeAffix,
    resetDefaults,
    league,
    marketError,
    marketLabel,
    loadMarket,
    divinePrice,
    omenPrice,
    cost,
    divineRate,
    prices,
    pricing,
    autoNote,
    fetchPrices,
    tradeUrl,
    tradeAuto,
    params,
    resetParams,
    result,
    hasJackpot,
  };
}
