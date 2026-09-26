/**
 * 規格外の賭け — 選択肢の比較 (全組み合わせの期待収支・一番得な組み合わせの自動選択・収支用の組み合わせ詳細)
 * useRareCraft.ts から切り出し (2026-09-26)。中身は変えていない。
 */
import { computed, watch, type ComputedRef } from "vue";
import { ECHOES, ECHO_API_ID, EXALTS, RIBS, SIDES, type EchoId, type ExaltId, type MaterialRow, type RecipeDef, type RibId, type SideId } from "./recipes";
import { simulate, type SimOptions } from "./sim";
import { evaluateLadder, type LadderBucket, type LadderResult, type PostOptions } from "./ladder";
import type { useRareSelection } from "./useRareSelection";

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

/** 相場つきの素材の行 (useRareCraft の materialRows と同じ形) */
type PricedMaterial = MaterialRow & { unit: number | null };
type SimPick = { essenceId: string; exalt: ExaltId; side: SideId; rib: RibId; echo: EchoId };

/** 比較に要る物 (useRareCraft の中で作った物をそのまま渡す) */
export interface VariantDeps {
  sel: ReturnType<typeof useRareSelection>;
  basePrice: ComputedRef<number | null>;
  floorPrice: ComputedRef<number | null>;
  ladderBuckets: ComputedRef<LadderBucket[]>;
  materials: ComputedRef<PricedMaterial[]>;
  result: ComputedRef<LadderResult | null>;
  priceOf: (apiId: string) => number | null;
  simOptionsFor: (o: SimPick, samples: number) => SimOptions;
  materialRows: (o: SimPick & { count: number; runeId: string }) => PricedMaterial[];
  costOf: (rows: { unit: number | null; qty: number }[]) => number | null;
  postFor: (rune: string) => PostOptions;
}

export function useRareVariants(d: VariantDeps) {
  const { recipe, essences, essenceId, rib, echo, exalt, side, runeId, quality, autoBest, programmatic, floorConds } = d.sel;
  const { basePrice, floorPrice, ladderBuckets, priceOf, simOptionsFor, materialRows, costOf, postFor } = d;

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
                const lr = evaluateLadder(s, postFor(ru.id), ladderBuckets.value, floorConds.value, floorPrice.value, c);
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
    if (recipe.value.metrics.includes("es") && quality.value > 0) ids.set("scrap", "鎧鍛冶の端材");
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
    if (!d.sel.isApplying()) autoBest.value = false;
  });
  // 自動のときは一番収支がいい組み合わせを出す
  watch(
    [() => bestVariant.value?.key ?? null, autoBest],
    ([key, on]) => {
      if (on && key && !bestVariant.value?.current) void applyVariant(key);
    },
    { immediate: true },
  );

  // ---- 収支の組み合わせ (2026-09-15) ----
  /** 素材欄の組み合わせのキー (比較表の Variant.key と同じ形) */
  const currentKey = computed(() => [essenceId.value, rib.value, echo.value, exalt.value, side.value, runeId.value].join("|"));
  function variantLabel(key: string): string {
    const [es, rb, ec, ex, sd, ru] = key.split("|");
    const r: RecipeDef = recipe.value;
    const parts = [
      r.essences.length > 1 ? r.essences.find((e) => e.id === es)?.label.replace(/ \(.+\)$/, "") : null,
      RIBS.find((x) => x.id === rb)?.label,
      ec === "echoes" ? "アビスの反響のお告げ" : null,
      EXALTS.find((x) => x.id === ex)?.label,
      sd === "suffix" ? "右側の高貴なお告げ" : null,
      r.runes.find((x) => x.id === ru)?.label.replace(/ \(.+\)$/, ""),
    ];
    return parts.filter(Boolean).join(" · ");
  }
  /**
   * 組み合わせ 1 つの「1 回の素材」と「売値の段ごとに売る確率」(収支の自動入力用)。
   * 素材欄の組み合わせなら上の計算 (2 万回) をそのまま使い、別の組み合わせなら同じ回数で計算し直す。
   */
  function detailFor(key: string): { materials: PricedMaterial[]; ladder: LadderResult | null } {
    if (key === currentKey.value) return { materials: d.materials.value, ladder: d.result.value };
    const [es, rb, ec, ex, sd, ru] = key.split("|");
    const o = { essenceId: es, rib: rb as RibId, echo: ec as EchoId, exalt: ex as ExaltId, side: sd as SideId };
    const so = simOptionsFor(o, 20000);
    const mats = materialRows({ ...o, count: so.exaltLevels.length, runeId: ru });
    const c0 = costOf(mats);
    const s = simulate(so);
    const ladder = s.ok && c0 != null && floorPrice.value != null ? evaluateLadder(s, postFor(ru), ladderBuckets.value, floorConds.value, floorPrice.value, c0) : null;
    return { materials: mats, ladder };
  }

  return { variants, bestVariant, unpricedOptions, selectVariant, currentKey, variantLabel, detailFor };
}
