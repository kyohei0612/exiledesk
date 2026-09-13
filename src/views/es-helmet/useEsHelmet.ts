/**
 * ES 兜のクラフト — 状態 / 相場 / trade2 (2026-09-14)
 *
 *   プリセット (標準 = ソケット 1 のマジックベース / 上位 = 2 ソケットの規格外ノーマルベース) を選ぶ
 *   → trade2 で「ベース最安」「当たり (ES 450+ · 耐性 60+) 最安」「中 (ES 400+ · 耐性 60+) 最安」「外れ (ES 350+) 最安」を自動で取る
 *   → 素材 (エッセンス / お告げ / 肋骨 / エグザルト / ルーン) はカレンシーランキングの相場
 *   → 期待値: es-helmet/model.ts
 * trade2 の検索はプリセットごとに 4 回。しきい値を変えた時はその分だけ取り直す (クエリごとに覚える)。
 */
import { computed, onScopeDispose, ref, watch } from "vue";
import { marketStore } from "../../state/market-store";
import { buildSpecQuery, type SpecQueryOptions } from "../../services/trade2/query";
import { trade2QueryUrl } from "../../services/trade2/league";
import { autoMinWithUrl, isRateLimited, tradeAuto } from "../../services/trade2/auto-price";
import { DEFAULT_ES_HELMET_PROBS, evaluateEsHelmet, scenarioTable, type EsHelmetInputs, type EsHelmetProbs } from "./model";

/** trade2 の stat id (JP 実測 2026-09-13) */
const STAT_LOCAL_ES = "explicit.stat_4052037485"; // +# エナジーシールド (ローカル)
const STAT_TOTAL_ELE_RES = "pseudo.pseudo_total_elemental_resistance"; // 元素耐性の合計 (擬似)
const CATEGORY = "armour.helmet";

export interface Preset {
  id: "standard" | "premium";
  label: string;
  note: string;
  /** ベースのレアリティとソケット数 */
  baseRarity: "magic" | "normal";
  sockets: number;
  /** 当たりの耐性合計 */
  resHit: number;
  /** ベースの ES 下限 (ノーマルベースは素の ES がそのまま効くので高めに) */
  baseEsMin: number;
}
export const PRESETS: readonly Preset[] = [
  { id: "standard", label: "標準 (ソケット 1)", note: "T1 フラット ES 付きのマジックベース → ES 450+ · 耐性 60+ を約 2 神で売る", baseRarity: "magic", sockets: 1, resHit: 60, baseEsMin: 100 },
  { id: "premium", label: "上位 (2 ソケット)", note: "規格外 (2 ソケット) のノーマルベース (ES 120+) → ES 450+ · 耐性 80+ を 20 神〜で売る", baseRarity: "normal", sockets: 2, resHit: 80, baseEsMin: 120 },
];

export interface Thresholds {
  /** ベースの ilvl 下限 (T1 耐性は 82、ES ベースは 80 で妥協) */
  ilvlMin: number;
  /** マジックベースに要るフラット ES の下限 */
  flatEsMin: number;
  esHit: number;
  esMid: number;
  resMid: number;
  /** 外れの売値を測る ES 下限 */
  esMiss: number;
}
export const DEFAULT_THRESHOLDS: Thresholds = { ilvlMin: 80, flatEsMin: 40, esHit: 450, esMid: 400, resMid: 60, esMiss: 350 };

interface Fetched {
  price: number | null;
  url: string | null;
}
type Kind = "base" | "hit" | "mid" | "miss";

export function useEsHelmet() {
  const presetId = ref<Preset["id"]>("standard");
  const preset = computed<Preset>(() => PRESETS.find((p) => p.id === presetId.value) ?? PRESETS[0]);
  const th = ref<Thresholds>({ ...DEFAULT_THRESHOLDS });
  function resetThresholds(): void {
    th.value = { ...DEFAULT_THRESHOLDS };
  }
  /** 完全エグザルト + 大エグザルトのお告げ (2 つ同時) を使う上位手順 */
  const usePerfectExalt = ref(false);
  /** ソケットに大アイアンルーンを入れる */
  const useRunes = ref(true);

  // ---- 相場 (アプリ共通) ----
  const league = marketStore.league;
  const marketError = marketStore.error;
  const marketLabel = marketStore.fetchedLabel;
  const priceOf = marketStore.priceOf;
  async function loadMarket(): Promise<void> {
    await marketStore.ensureMarket();
    // 画面を開いた時点で 4 件取りに行く (以後はプリセット / しきい値 / リーグの変更で差分だけ)
    void fetchPrices();
  }
  const tradeLeague = computed(() => league.value?.Value ?? "Standard");

  /** 1 回に使う素材 (単価はカレンシーランキング) */
  const materials = computed(() => {
    const s = preset.value.sockets;
    const rows: { key: string; apiId: string; label: string; note: string; qty: number }[] = [
      { key: "essence", apiId: "greater-essence-of-enhancement", label: "強化の大エッセンス", note: "%ES を確定で付ける (クラフト MOD 枠)。マジック → レア", qty: 1 },
      { key: "omen", apiId: "omen-of-sinistral-necromancy", label: "左の降霊のお告げ", note: "冒涜をプレフィックス側に寄せる", qty: 1 },
      { key: "rib", apiId: "preserved-rib", label: "保存された肋骨", note: "魂の井戸で 3 択 → ハイブリッド ES を選ぶ", qty: 1 },
    ];
    if (usePerfectExalt.value) {
      rows.push({ key: "pexalt", apiId: "perfect-exalted-orb", label: "完全なエグザルテッドオーブ", note: "MOD レベル 50 以上の耐性", qty: 1 });
      rows.push({ key: "gomen", apiId: "omen-of-greater-exaltation", label: "大エグザルトのお告げ", note: "1 回で 2 つ付ける", qty: 1 });
    } else {
      rows.push({ key: "gexalt", apiId: "greater-exalted-orb", label: "大エグザルテッドオーブ", note: "耐性 2 つを狙う (運)", qty: 2 });
    }
    if (useRunes.value && s > 0) {
      rows.push({ key: "artificer", apiId: "artificers", label: "職人のオーブ", note: "ソケットが無ければ開ける", qty: s });
      rows.push({ key: "rune", apiId: "greater-iron-rune", label: "大アイアンルーン", note: "防御 % で ES を上乗せ", qty: s });
    }
    return rows.map((r) => ({ ...r, unit: priceOf(r.apiId) }));
  });

  // ---- trade2 (クエリごとに覚える) ----
  function queryFor(kind: Kind): ReturnType<typeof buildSpecQuery> {
    const p = preset.value;
    const t = th.value;
    const o: SpecQueryOptions = { category: CATEGORY, rarity: "nonunique", socketsMin: p.sockets };
    if (kind === "base") {
      return buildSpecQuery({
        category: CATEGORY,
        rarity: p.baseRarity,
        ilvlMin: t.ilvlMin,
        esMin: p.baseEsMin,
        socketsMin: p.sockets,
        stats: p.baseRarity === "magic" ? [{ id: STAT_LOCAL_ES, min: t.flatEsMin }] : [],
      });
    }
    if (kind === "hit") return buildSpecQuery({ ...o, esMin: t.esHit, stats: [{ id: STAT_TOTAL_ELE_RES, min: p.resHit }] });
    if (kind === "mid") return buildSpecQuery({ ...o, esMin: t.esMid, stats: [{ id: STAT_TOTAL_ELE_RES, min: t.resMid }] });
    return buildSpecQuery({ ...o, esMin: t.esMiss });
  }
  const cacheKey = (kind: Kind): string => `${tradeLeague.value}|${kind}|${JSON.stringify(queryFor(kind))}`;
  const fetched = ref<Record<string, Fetched>>({});
  const pricing = ref(false);
  const priceError = ref<string | null>(null);
  const remaining = ref(0);
  const KINDS: Kind[] = ["base", "hit", "mid", "miss"];
  function get(kind: Kind): Fetched | null {
    return fetched.value[cacheKey(kind)] ?? null;
  }
  function tradeUrl(kind: Kind): string | null {
    return get(kind)?.url ?? trade2QueryUrl(tradeLeague.value, queryFor(kind));
  }
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
        const todo = KINDS.filter((k) => (force ? !done.has(cacheKey(k)) : !get(k)));
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
  watch([presetId, th, tradeLeague], () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => void fetchPrices(), 800);
  }, { deep: true });
  onScopeDispose(() => {
    if (debounce) clearTimeout(debounce);
    fetchSeq++;
  });
  const pending = computed(() => KINDS.filter((k) => !get(k)).length);

  // ---- 計算 ----
  const probs = ref<EsHelmetProbs>({ ...DEFAULT_ES_HELMET_PROBS });
  function resetProbs(): void {
    probs.value = { ...DEFAULT_ES_HELMET_PROBS };
  }
  const basePrice = computed(() => get("base")?.price ?? null);
  const hitPrice = computed(() => get("hit")?.price ?? null);
  const midPrice = computed(() => get("mid")?.price ?? null);
  const missPrice = computed(() => get("miss")?.price ?? null);
  const inputs = computed<EsHelmetInputs>(() => ({
    basePrice: basePrice.value,
    materials: materials.value.map((m) => ({ key: m.key, label: m.label, unit: m.unit, qty: m.qty })),
    hitPrice: hitPrice.value,
    midPrice: midPrice.value,
    missPrice: missPrice.value,
  }));
  const result = computed(() => evaluateEsHelmet(inputs.value, probs.value));
  const scenarios = computed(() => scenarioTable(inputs.value, probs.value.mid, [0.1, 0.2, 0.35, 0.5]));

  return {
    presetId,
    preset,
    PRESETS,
    th,
    resetThresholds,
    usePerfectExalt,
    useRunes,
    league,
    marketError,
    marketLabel,
    loadMarket,
    materials,
    pricing,
    priceError,
    pending,
    remaining,
    fetchPrices,
    get,
    tradeUrl,
    basePrice,
    hitPrice,
    midPrice,
    missPrice,
    probs,
    resetProbs,
    inputs,
    result,
    scenarios,
    tradeAuto,
  };
}
