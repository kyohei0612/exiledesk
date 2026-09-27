/**
 * craft-stage.ts — クラフトステージの画面の状態 (2026-09-27、ADR-001 docs/decisions/001-craft-stage.md)
 *
 * オーナー:「動画映えするシミュレーター、配信用。実際に同じ挙動でカレンシーをクリックして押すと変化する」
 * 「操作は Craft of Exile 仕様 (アイコンを持ってアイテムをクリック)」「カレンシーの種類・アイコン・名前・値段は計算機の物にリンク」。
 *   - 手で打つ: 棚のカレンシーを持って (held) アイテムを押すと 1 手。seed は 開始の seed + 手の番号 なので、打った手をそのまま
 *     手順 JSON にして scripts/craft-stage-run.mjs に流すと同じ結果になる
 *   - 再生: 手順 JSON と step (URL の ?stage-plan=…&step=N) で、その手まで進めた状態を出す (POE2Tube の撮影用)
 * 1 手の中身は services/craft-stage (計算機と同じ規則)。値段は相場 (market-store、高貴建て)。
 */
import { computed, ref, shallowRef } from "vue";
import { loadHtcPatch } from "../services/htc/patch";
import { jaOfPriceKey } from "../services/htc/labels";
import priceKeys from "../services/htc/price-keys.json";
import { applyCurrency } from "../services/craft-stage/apply-currency";
import { freshItem, playPlan, playStep, resultOf, type PlayedStep } from "../services/craft-stage/run-plan";
import { mulberry32 } from "../services/htc/rng";
import { marketStore } from "./market-store";
import type { PatchData } from "../vendor/poe2htc/engine/types";
import type { StageItem } from "../services/craft-stage/types";
import type { CraftStagePlan } from "../services/craft-stage/contract";

/** 棚に並べるカレンシー (Phase 1 の 7 種。強さは 普通 / 上級 / 完全) */
export const SHELF: Array<{ kind: string; keys: string[] }> = [
  { kind: "transmute", keys: ["transmute", "transmute_greater", "transmute_perfect"] },
  { kind: "augment", keys: ["augment", "augment_greater", "augment_perfect"] },
  { kind: "regal", keys: ["regal", "regal_greater", "regal_perfect"] },
  { kind: "alchemy", keys: ["alchemy"] },
  { kind: "exalt", keys: ["exalt", "exalt_greater", "exalt_perfect"] },
  { kind: "chaos", keys: ["chaos", "chaos_greater", "chaos_perfect"] },
  { kind: "annul", keys: ["annul"] },
];
const KEYS = (priceKeys as { currency: Record<string, { en: string; ja: string }> }).currency;

const data = shallowRef<PatchData | null>(null);
const item = shallowRef<StageItem | null>(null);
const log = shallowRef<PlayedStep[]>([]);
const held = ref<string | null>(null);
const seed = ref(0);
const error = ref<string | null>(null);
/** 再生モード (URL の手順)。手で打つ操作は止める */
const replay = ref<{ plan: CraftStagePlan; step: number } | null>(null);
const base = ref("Gold Ring");
const itemLevel = ref(82);

/** カレンシーの英語名 (相場の行・アイコンを引く鍵) */
export const currencyEn = (key: string): string => KEYS[key]?.en ?? key;
/** 1 個の値段 (高貴建て、相場。無ければ 0) */
export function priceOf(key: string): number {
  const it = marketStore.items.value.find((x) => x.Text === currencyEn(key));
  return it && typeof it.CurrentPrice === "number" ? it.CurrentPrice : 0;
}
export const iconOf = (key: string): string => marketStore.items.value.find((x) => x.Text === currencyEn(key))?.IconUrl ?? "";
export const nameOf = (key: string): string => jaOfPriceKey(key, item.value?.cls) ?? KEYS[key]?.ja ?? key;

function newSeed(): number {
  return Math.floor(Date.now() % 1_000_000_000);
}

export const craftStage = {
  data, item, log, held, seed, error, replay, base, itemLevel,
  ready: computed(() => !!data.value && !!item.value),
  /** 累計の費用 (高貴) */
  total: computed(() => { const l = log.value; return l.length ? l[l.length - 1]!.out.cost.cumulative : 0; }),
  /** 直前の手 */
  last: computed(() => log.value[log.value.length - 1] ?? null),

  async init(): Promise<void> {
    if (data.value) return;
    try {
      data.value = await loadHtcPatch();
      const market = marketStore.ensureMarket();
      const q = new URLSearchParams(location.search);
      const raw = q.get("stage-plan");
      // 再生は費用も出すので相場を待つ (手で打つ時は待たない。値段は打った時に引く)
      if (raw) await market;
      if (raw) craftStage.loadReplay(JSON.parse(raw) as CraftStagePlan, Number(q.get("step") ?? "9999"));
      else craftStage.reset();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  },
  /** 白の新品から (ベース・アイテムレベルを変えた時も) */
  reset(): void {
    if (!data.value) return;
    try {
      item.value = freshItem(data.value, base.value, itemLevel.value);
      log.value = [];
      seed.value = newSeed();
      error.value = null;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  },
  /** その状態で打てるか (打てないなら理由) */
  usable(key: string): string | null {
    if (!data.value || !item.value) return "準備中";
    const r = applyCurrency(data.value, item.value, key, mulberry32(0));
    return r.applied ? null : (r.reason ?? "打てない");
  },
  /** 持っているカレンシーを 1 回打つ (Craft of Exile と同じ: 持ったままなら何度でも) */
  use(key: string | null = held.value): void {
    if (!key || !data.value || !item.value || replay.value) return;
    const index = log.value.length + 1;
    const p = playStep(data.value, item.value, key, { index, seed: seed.value + index, each: priceOf(key), cumulative: craftStage.total.value });
    log.value = [...log.value, p];
    item.value = p.after;
  },
  /** 1 手戻す */
  undo(): void {
    const l = log.value;
    if (!l.length || replay.value) return;
    item.value = l[l.length - 1]!.before;
    log.value = l.slice(0, -1);
  },
  hold(key: string | null): void {
    held.value = key;
  },
  /** 今までの手を手順 JSON に (同じ seed なので CLI に流すと同じ結果) */
  plan(): CraftStagePlan {
    return {
      schema: "craft-stage-plan/1",
      title: null,
      base: base.value,
      item_level: itemLevel.value,
      start_rarity: "normal",
      start_paste: null,
      seed: seed.value,
      steps: (log.value.length ? log.value.map((s) => ({ currency: s.out.currency, omen: null, times: 1, note: null })) : [{ currency: "transmute", omen: null, times: 1, note: null }]) as CraftStagePlan["steps"],
    };
  },
  /** 結果 JSON (今の相場の値段で) */
  result(version: string): unknown {
    if (!item.value) return null;
    return resultOf(replay.value?.plan ?? craftStage.plan(), log.value, item.value, {
      prices: {}, exiledeskVersion: version, patch: "0.5.0", league: marketStore.league.value?.Value ?? null,
    });
  },
  /** CLI (craft-stage-run.mjs --prices) に渡す相場 (高貴建て) */
  prices(): Record<string, number> {
    return Object.fromEntries(SHELF.flatMap((s) => s.keys).map((k) => [k, priceOf(k)]).filter(([, v]) => (v as number) > 0));
  },
  /** 再生: 手順 JSON を step 手目まで打った状態 */
  loadReplay(plan: CraftStagePlan, step: number): void {
    if (!data.value) return;
    try {
      const prices = Object.fromEntries(SHELF.flatMap((s) => s.keys).map((k) => [k, priceOf(k)]));
      const { steps, final } = playPlan(data.value, plan, prices, step);
      replay.value = { plan, step };
      base.value = plan.base;
      itemLevel.value = plan.item_level ?? 80;
      seed.value = plan.seed;
      log.value = steps;
      item.value = final;
      error.value = null;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  },
  /** 再生をやめて手で打つ */
  leaveReplay(): void {
    replay.value = null;
    craftStage.reset();
  },
};
