/**
 * useHtcCraft.ts — お試し計算機の中身 (2026-09-22)
 *
 * オーナー指示:「簡単に UI 実装してみて。マジで簡易的な計算機的な奴でいい。動きが見たい」。
 *
 * ## 段構え — 重い物は押されるまで回さない
 * ソルバは**同期**で回るので、長い物を押されずに走らせると画面が固まります。だから:
 *   1. 読む + 目標 + 段階 0 + 設計図 … 合計 1 秒未満。開いたら自動
 *   2. 買い方 (3〜4 個買い 35 通り) … 20 秒ほど。**ボタンを押された時だけ**
 * 上の実測は太陽のアミュレット (ilvl 80 / 6 MOD) です。
 */
import { ref, shallowRef } from "vue";
import { loadHtcPatch } from "../../services/htc/patch";
import { parseJaItem, targetsFor, type PastedItem } from "../../services/htc/paste-ja";
import { itemBaseFor } from "../../services/htc/bridge";
import { craftedSurvey, isCraftedMod, type CraftedSurvey } from "../../services/htc/craft-slots";
import { boostedBy } from "../../services/htc/quality";
import { soloCosts, type SoloCost } from "../../services/htc/solo-cost";
import { planPreview, type PlanOption } from "../../services/htc/plan";
import { partialStarts, solveFinish, budgetForBuy } from "../../services/htc/partial-start";
import { fracturedBuyQuery } from "../../services/htc/fracture-route";
import { autoMinWithUrl } from "../../services/trade2/auto-price";
import { buildHtcPrices, type HtcPriceCoverage } from "../../services/htc/prices";
import { indexPrices, pricesForBase, type Prices } from "../../vendor/poe2htc/optimizer/cost";
import { displayCurrency } from "../../state/display-currency";
import { marketStore } from "../../state/market-store";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { ItemBase, PatchData } from "../../vendor/poe2htc/engine/types";

/** 画面に出す 1 目標 */
export interface TargetRow {
  modId: string;
  /** 貼り付けの文面 (日本語のまま) */
  text: string;
  side: "P" | "S";
  tierName: string;
  /** そのティアの範囲 (「150-164」) */
  range: string;
  /** 品質で底上げされている MOD か (装飾品のみ) */
  boosted: boolean;
  /** 確定で乗せる MOD か (エッセンス / パーフェクトエッセンス / 合金) */
  crafted: boolean;
}

/** 買い方 1 通り */
export interface BuyRow {
  bought: string[];
  rarity: string;
  /** 残りを仕上げる費用 (高貴建て) */
  finish: number;
  /** 完成品の売値を予算にした時、買値に出せる上限 (高貴建て)。出せなければ null */
  budget: number | null;
}

export function useHtcCraft() {
  const data = shallowRef<PatchData | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const item = shallowRef<PastedItem | null>(null);
  const base = shallowRef<ItemBase | null>(null);
  const prices = shallowRef<Prices | null>(null);
  const targets = shallowRef<TierTarget[]>([]);
  const rows = shallowRef<TargetRow[]>([]);
  const implicits = ref<string[]>([]);
  const skipped = ref<string[]>([]);
  /** 確定で乗せる MOD が何個あるか。**解く前に分かる** ([[craft-slots.ts]]) */
  const slots = shallowRef<CraftedSurvey | null>(null);

  const solo = shallowRef<SoloCost[]>([]);
  /** 案は**全部**持つ。本家も 3 案並べる (確率と 1 周の値段の釣り合いを見せるため) */
  const plans = shallowRef<PlanOption[]>([]);
  const plansEvaluated = ref(0);
  const buys = shallowRef<BuyRow[]>([]);
  const buysRunning = ref(false);
  /** 相場がどれだけ埋まっているか。空だと費用が出ないので画面で断る */
  const coverage = shallowRef<HtcPriceCoverage | null>(null);
  /** 各段にかかった時間 (ミリ秒) */
  const timings = ref<Array<[string, number]>>([]);
  /**
   * 「固定済みの物」の最安 (modId → 高貴建て / 検索 URL)。
   *
   * オーナー方針:「先にフラクチャー品みるのがいい。これ 1 神とかだから」。固定された MOD は
   * 消去でも消えないので、**一番つきにくい 1 個が固定された物を買うのが最大の梃子**
   * (実測: 素から 2,015 神 → 固定済みから 231 神)。
   */
  const fractured = ref<Record<string, { min: number | null; url: string | null; error?: string }>>({});
  const fracturedBusy = ref<string | null>(null);

  /**
   * 高貴建て → 画面の文字列。**神から始めます** (神 → 1 未満ならカオス → 1 未満なら高貴)。
   * オーナー指示 2026-09-22:「全部高貴じゃんややこしい。神優先で」。
   * クラフトの費用は桁が大きく振れるので、選んでいる通貨が高貴だと読めなくなる。
   */
  const money = (exalted: number | null): string =>
    displayCurrency.money(exalted, { round: "up", ladder: "top" });

  /**
   * 値段表。**`buildHtcPrices` を使うこと。**
   *
   * 相場の並び (poe.ninja の ApiId) とエンジンの価格キー (`transmute` / `exalt` / お告げの id) は
   * **別物**です。素直に写すとキーが 1 つも当たらず、全部 0 で解いて「タダで作れる」と出ます。
   * 対応表は `price-keys.json` (クライアント由来) で、それを通すのが `buildHtcPrices`。
   */
  function buildPrices(cls: ItemBase): { prices: Prices; coverage: HtcPriceCoverage } {
    const { file, coverage } = buildHtcPrices();
    return { prices: pricesForBase(indexPrices(file), cls), coverage };
  }

  /** 貼り付けを読んで、段階 0 と設計図まで出す (合計 1 秒未満) */
  async function run(text: string): Promise<void> {
    error.value = null;
    buys.value = [];
    timings.value = [];
    loading.value = true;
    try {
      if (!data.value) {
        const t = Date.now();
        data.value = await loadHtcPatch();
        timings.value.push(["データを読む", Date.now() - t]);
      }
      const d = data.value;

      let t = Date.now();
      const it = parseJaItem(text);
      timings.value.push(["貼り付けを読む", Date.now() - t]);
      item.value = it;
      if (!it.baseType) {
        error.value = "ベースが分かりません。アイテムの名前の行が入っているか確認してください。";
        return;
      }
      const cls = itemBaseFor(d, it.baseType);
      if (!cls) {
        error.value = `「${it.baseText}」はエンジンが知らないベースです。`;
        return;
      }
      base.value = cls;
      const built = buildPrices(cls);
      prices.value = built.prices;
      coverage.value = built.coverage;

      t = Date.now();
      const got = targetsFor(d, it);
      timings.value.push(["MOD とティアを決める", Date.now() - t]);
      targets.value = got.targets;
      implicits.value = got.implicits;
      skipped.value = got.skipped;
      rows.value = got.targets.map((tg, i) => {
        const mod = d.mods.get(tg.modId)!;
        const tier = mod.tiers[tg.minTierIndex ?? mod.tiers.length - 1]!;
        return {
          modId: tg.modId,
          text: got.texts[i] ?? tg.modId,
          side: mod.type === "prefix" ? "P" : "S",
          tierName: String(tier.name ?? ""),
          range: (tier.ranges ?? []).map((r2) => `${r2[0]}-${r2[1]}`).join(" / "),
          // **`boostedBy` を使うこと。**タグだけ見て書き直すと判定がずれる (向こうはクラスも見る)。
          // 実際ずれていて、割り戻したキャストスピードに印が付いていなかった (2026-09-23)
          boosted: !!(it.quality && it.catalystTag && boostedBy(mod, it.catalystTag)),
          crafted: isCraftedMod(mod),
        };
      });
      // 確定で乗せる MOD の数は解かなくても分かる。2 個ならアストリッドが要る
      slots.value = craftedSurvey(d, cls, got.targets);

      t = Date.now();
      solo.value = soloCosts(d, prices.value, cls, got.targets, { level: it.itemLevel ?? 82 });
      timings.value.push(["段階 0 (1 個ずつ自作するといくら)", Date.now() - t]);

      t = Date.now();
      const pv = planPreview(d, prices.value, cls, got.targets, { level: it.itemLevel ?? 82 });
      timings.value.push(["設計図", Date.now() - t]);
      plans.value = pv.options;
      plansEvaluated.value = pv.plansEvaluated;
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  }

  /**
   * 買い方を解く。**20 秒ほどかかる**ので押された時だけ。
   * 3 個以上買う案に絞る (1〜2 個買いは 1 件 5〜50 秒かかるうえ、まず成立しない)。
   */
  function solveBuys(listingDivine: number | null): void {
    const d = data.value;
    const cls = base.value;
    const p = prices.value;
    const it = item.value;
    if (!d || !cls || !p || !it) return;
    buysRunning.value = true;
    try {
      const t = Date.now();
      const listing = listingDivine != null ? listingDivine * (marketStore.rates.value.divine || 1) : null;
      const out: BuyRow[] = [];
      for (const o of partialStarts(d, cls, targets.value, { level: it.itemLevel ?? 82, maxBought: 4 })) {
        if (o.bought.length < 3) continue;
        const r = solveFinish(d, p, o, { spare: "free" });
        if (!r.feasible || !Number.isFinite(r.expectedCost)) continue;
        out.push({
          bought: o.bought.map((x) => rows.value.find((y) => y.modId === x.modId)?.text ?? x.modId),
          rarity: o.rarity,
          finish: r.expectedCost,
          budget: listing != null ? budgetForBuy(listing, r.expectedCost) : null,
        });
      }
      out.sort((a, b) => a.finish - b.finish);
      buys.value = out;
      timings.value.push([`買い方を解く (${out.length} 通り)`, Date.now() - t]);
    } finally {
      buysRunning.value = false;
    }
  }

  /** 手順の段が狙っている MOD を、貼り付けの文面 (日本語) で返す。2 つ足す段は 2 つ並べる */
  const stepTarget = (modIds: readonly string[]): string =>
    modIds.map((id) => rows.value.find((r) => r.modId === id)?.text ?? id.split("/")[1] ?? "").join(" + ");

  /**
   * その MOD が固定された物を取引所で探す。**1 回で search + fetch を 1 回ずつ**使うので、
   * 押された時だけ投げる (レート制限は Rust の門番と `autoPrice` が持つ)。
   */
  async function findFractured(modId: string): Promise<void> {
    const d = data.value;
    const cls = base.value;
    const it = item.value;
    if (!d || !cls || !it) return;
    const t = targets.value.find((x) => x.modId === modId);
    if (!t) return;
    fracturedBusy.value = modId;
    try {
      const q = fracturedBuyQuery(d, cls, t, {
        ...(it.itemLevel != null ? { ilvlMin: it.itemLevel } : {}),
        ...(it.baseType ? { baseType: it.baseType } : {}),
      });
      if (!q) {
        fractured.value = { ...fractured.value, [modId]: { min: null, url: null, error: "検索が組めません" } };
        return;
      }
      // リーグ名は相場と同じ物を使う (取引所に投げる名前は `Value`)
      const league = marketStore.league.value?.Value ?? "Standard";
      const r = await autoMinWithUrl(league, q.query, marketStore.rates.value);
      fractured.value = { ...fractured.value, [modId]: { min: r.min, url: r.url } };
    } catch (e) {
      fractured.value = { ...fractured.value, [modId]: { min: null, url: null, error: String(e) } };
    } finally {
      fracturedBusy.value = null;
    }
  }

  return {
    stepTarget, findFractured, fractured, fracturedBusy,
    loading, error, item, base, rows, implicits, skipped,
    solo, plans, plansEvaluated, buys, buysRunning, timings, coverage, slots,
    money, run, solveBuys,
  };
}
