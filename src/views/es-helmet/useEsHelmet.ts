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
import { computeEsHelmetOdds, HELMET_PAGES, type HelmetPage, type OddsOptions } from "./odds";

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
/** trade2 で取った相場 (クエリごと)。画面を開き直しても取り直さない (レート節約、オーナー指示 2026-09-14) */
const FETCHED = ref<Record<string, Fetched>>({});

export type RibOption = "preserved" | "ancient";
export type ExaltOption = "normal" | "greater" | "perfect";
export type RuneOption = "none" | "greater" | "perfect";
export const RIB_OPTIONS: { id: RibOption; label: string; apiId: string; minLevel: number; note: string }[] = [
  { id: "preserved", label: "保存された肋骨", apiId: "preserved-rib", minLevel: 0, note: "候補に制限なし" },
  { id: "ancient", label: "古代の肋骨", apiId: "ancient-rib", minLevel: 40, note: "MOD レベル 40 以上の候補だけ (兜の冒涜は全部レベル 65 なので差は出ない)" },
];
export const EXALT_OPTIONS: { id: ExaltOption; label: string; apiId: string; minLevel: number; note: string }[] = [
  { id: "normal", label: "高貴なオーブ", apiId: "exalted", minLevel: 1, note: "MOD レベルの下限なし (低ティアも混ざる)" },
  { id: "greater", label: "高貴なオーブ (上級)", apiId: "greater-exalted-orb", minLevel: 35, note: "MOD レベル 35 以上" },
  { id: "perfect", label: "高貴なオーブ (完全) + 偉大なる高貴なお告げ", apiId: "perfect-exalted-orb", minLevel: 50, note: "MOD レベル 50 以上を 2 つ同時 (3 つ目は上級)" },
];
export const RUNE_OPTIONS: { id: RuneOption; label: string; apiId: string | null; pct: number; note: string }[] = [
  { id: "none", label: "ルーンなし", apiId: null, pct: 0, note: "" },
  { id: "greater", label: "鉄のグレータールーン", apiId: "greater-iron-rune", pct: 18, note: "防御 18% で ES を上乗せ" },
  { id: "perfect", label: "鉄のパーフェクトルーン", apiId: "perfect-iron-rune", pct: 20, note: "防御 20% (高い)" },
];
export const EXALT_COUNT_OPTIONS = [2, 3];

export interface MaterialRow {
  key: string;
  apiId: string;
  label: string;
  note: string;
  qty: number;
}
export interface CraftOptions {
  rib: RibOption;
  exalt: ExaltOption;
  rune: RuneOption;
  exaltCount: number;
}
/** 選択肢 → 1 回に使う素材 (単価は別で引く) */
export function materialsFor(sockets: number, o: CraftOptions): MaterialRow[] {
  const rows: MaterialRow[] = [
    { key: "essence", apiId: "greater-essence-of-enhancement", label: "強化のグレーターエッセンス", note: "%ES を確定で付ける (クラフト MOD 枠)。マジック → レア", qty: 1 },
    { key: "omen", apiId: "omen-of-dextral-necromancy", label: "右手のネクロマンシーのお告げ", note: "冒涜を接尾辞側に (兜の冒涜は接尾辞だけ)", qty: 1 },
  ];
  const r = RIB_OPTIONS.find((x) => x.id === o.rib)!;
  rows.push({ key: "rib", apiId: r.apiId, label: r.label, note: `魂の井戸で 3 択 → 「X と混沌耐性」を選ぶ。${r.note}`, qty: 1 });
  const n = Math.max(2, o.exaltCount);
  if (o.exalt === "perfect") {
    rows.push({ key: "pexalt", apiId: "perfect-exalted-orb", label: "高貴なオーブ (完全)", note: "MOD レベル 50 以上", qty: 1 });
    rows.push({ key: "gomen", apiId: "omen-of-greater-exaltation", label: "偉大なる高貴なお告げ", note: "1 回で 2 つ付ける", qty: 1 });
    if (n > 2) rows.push({ key: "gexalt", apiId: "greater-exalted-orb", label: "高貴なオーブ (上級)", note: "3 つ目 (6 MOD まで埋める)", qty: n - 2 });
  } else {
    const ex = EXALT_OPTIONS.find((x) => x.id === o.exalt)!;
    rows.push({ key: "gexalt", apiId: ex.apiId, label: ex.label, note: n > 2 ? "空きを全部埋める (接頭辞 1 + 接尾辞 2)" : "耐性 2 つを狙う (運)、空きを 1 つ残す", qty: n });
  }
  const ru = RUNE_OPTIONS.find((x) => x.id === o.rune)!;
  if (ru.apiId && sockets > 0) {
    rows.push({ key: "artificer", apiId: "artificers", label: "熟練工のオーブ", note: "ソケットが無ければ開ける", qty: sockets });
    rows.push({ key: "rune", apiId: ru.apiId, label: ru.label, note: ru.note, qty: sockets });
  }
  return rows;
}

export function useEsHelmet() {
  const presetId = ref<Preset["id"]>("standard");
  const preset = computed<Preset>(() => PRESETS.find((p) => p.id === presetId.value) ?? PRESETS[0]);
  const th = ref<Thresholds>({ ...DEFAULT_THRESHOLDS });
  function resetThresholds(): void {
    th.value = { ...DEFAULT_THRESHOLDS };
  }
  /**
   * 手順の選択肢 (オーナー要望 2026-09-14「古代 / 完全高貴 / 完全ルーンのどれが良いか一目で」)。名前はクライアントの日本語。
   *   肋骨: 保存された肋骨 (何でも) / 古代の肋骨 (MOD レベル 40 以上の候補だけ → 高ティアのハイブリッド ES)
   *   エグザルト: 高貴なオーブ (上級) ×2 / 高貴なオーブ (完全) + 偉大なる高貴なお告げ (MOD レベル 50 以上を 2 つ同時)
   *   ルーン: なし / 鉄のグレータールーン / 鉄のパーフェクトルーン (ソケット数分)
   */
  const rib = ref<RibOption>("preserved");
  const exalt = ref<ExaltOption>("greater");
  const rune = ref<RuneOption>("greater");
  const exaltCount = ref(3);
  /** 当たり率の計算に使う前提 (poe2db の重み × クライアントのティア値) */
  const oddsIn = ref<{ page: HelmetPage; baseEs: number; flatEsTier: number; quality: number }>({ page: "Helmets_int", baseEs: 109, flatEsTier: 1, quality: 20 });
  const craftOptions = computed<CraftOptions>(() => ({ rib: rib.value, exalt: exalt.value, rune: rune.value, exaltCount: exaltCount.value }));

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
  const materials = computed(() => materialsFor(preset.value.sockets, craftOptions.value).map((r) => ({ ...r, unit: priceOf(r.apiId) })));

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
  const fetched = FETCHED;
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
  /** 手動の確率 (probsSource が manual の時だけ使う) */
  const manualProbs = ref<EsHelmetProbs>({ ...DEFAULT_ES_HELMET_PROBS });
  const probsSource = ref<"db" | "manual">("db");
  function resetProbs(): void {
    manualProbs.value = { ...DEFAULT_ES_HELMET_PROBS };
  }
  function oddsOptionsFor(o: CraftOptions, samples: number): OddsOptions {
    const p = preset.value;
    const t = th.value;
    return {
      page: oddsIn.value.page,
      ilvl: t.ilvlMin,
      baseEs: oddsIn.value.baseEs,
      flatEsTier: oddsIn.value.flatEsTier,
      sockets: p.sockets,
      runePct: RUNE_OPTIONS.find((x) => x.id === o.rune)?.pct ?? 0,
      quality: oddsIn.value.quality,
      exaltMinLevel: EXALT_OPTIONS.find((x) => x.id === o.exalt)?.minLevel ?? 1,
      exaltCount: o.exaltCount,
      ribMinLevel: RIB_OPTIONS.find((x) => x.id === o.rib)?.minLevel ?? 0,
      esHit: t.esHit,
      resHit: p.resHit,
      esMid: t.esMid,
      resMid: t.resMid,
      samples,
    };
  }
  /** いまの選択の計算結果 (診断つき) */
  const odds = computed(() => computeEsHelmetOdds(oddsOptionsFor(craftOptions.value, 20000)));
  const probs = computed<EsHelmetProbs>(() => (probsSource.value === "db" && odds.value.ok ? { hit: odds.value.pHit, mid: odds.value.pMid } : manualProbs.value));
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

  /**
   * 選択肢の比較 (肋骨 × エグザルト × ルーン × 回数): 費用と損益分岐は相場から、当たり率は poe2db の重みで計算 (手動モードなら共通の手動値)。
   */
  const variantKey = (o: CraftOptions): string => `${o.rib}|${o.exalt}|${o.rune}|${o.exaltCount}`;
  const variants = computed(() => {
    const out: {
      key: string;
      labels: { rib: string; exalt: string; rune: string; count: string };
      current: boolean;
      cost: number | null;
      breakeven: number | null;
      hit: number;
      mid: number;
      ev: number | null;
      ev10: number | null;
    }[] = [];
    for (const rb of RIB_OPTIONS) {
      for (const ex of EXALT_OPTIONS) {
        for (const ru of RUNE_OPTIONS) {
          for (const n of EXALT_COUNT_OPTIONS) {
            const o: CraftOptions = { rib: rb.id, exalt: ex.id, rune: ru.id, exaltCount: n };
            const key = variantKey(o);
            const mats = materialsFor(preset.value.sockets, o).map((r) => ({ key: r.key, label: r.label, unit: priceOf(r.apiId), qty: r.qty }));
            let hit = manualProbs.value.hit;
            let mid = manualProbs.value.mid;
            if (probsSource.value === "db") {
              const od = computeEsHelmetOdds(oddsOptionsFor(o, 6000));
              if (od.ok) {
                hit = od.pHit;
                mid = od.pMid;
              }
            }
            const r = evaluateEsHelmet({ ...inputs.value, materials: mats }, { hit, mid });
            out.push({
              key,
              labels: { rib: rb.label, exalt: ex.label, rune: ru.label, count: `${n} 個` },
              current: key === variantKey(craftOptions.value),
              cost: r.missing.length === 0 || r.cost > 0 ? r.cost : null,
              breakeven: r.ok ? r.breakeven : null,
              hit,
              mid,
              ev: r.ok ? r.ev : null,
              ev10: r.ok ? r.ev * 10 : null,
            });
          }
        }
      }
    }
    return out;
  });
  const bestVariantKey = computed(() => {
    let best: { key: string; ev: number } | null = null;
    for (const v of variants.value) if (v.ev != null && (best == null || v.ev > best.ev)) best = { key: v.key, ev: v.ev };
    return best?.key ?? null;
  });
  function selectVariant(key: string): void {
    const [rb, ex, ru, n] = key.split("|") as [RibOption, ExaltOption, RuneOption, string];
    rib.value = rb;
    exalt.value = ex;
    rune.value = ru;
    exaltCount.value = Number(n) || 2;
  }

  return {
    presetId,
    preset,
    PRESETS,
    th,
    resetThresholds,
    rib,
    exalt,
    rune,
    exaltCount,
    EXALT_COUNT_OPTIONS,
    oddsIn,
    HELMET_PAGES,
    odds,
    probsSource,
    manualProbs,
    RIB_OPTIONS,
    EXALT_OPTIONS,
    RUNE_OPTIONS,
    variants,
    bestVariantKey,
    selectVariant,
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
