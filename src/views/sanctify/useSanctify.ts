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
      });
    }
    affixes.value = list;
    // 品質は貼り付け文の「品質: +20%」から拾う (無ければそのまま)
    const q = text.value.match(/(?:Quality|品質)[^\d]*?(\d+)\s*%/);
    if (q) qualityPct.value = Number(q[1]);
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

  // ---- 売値 / 前提 ----
  const prices = ref<SanctifyPrices>({ unsanctified: null, unchanged: null, bricked: 0, hit: null, jackpot: null });
  const params = ref<SanctifyParams>({ ...DEFAULT_SANCTIFY_PARAMS });
  function resetParams(): void {
    params.value = { ...DEFAULT_SANCTIFY_PARAMS };
  }

  const result = computed<SanctifyResult>(() => evaluateSanctify(affixes.value, qualityPct.value, prices.value, cost.value, params.value));
  const hasJackpot = computed(() => affixes.value.some((a) => a.key && a.jackpot != null));

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
    params,
    resetParams,
    result,
    hasJackpot,
  };
}
