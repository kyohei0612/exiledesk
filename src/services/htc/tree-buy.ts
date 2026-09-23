/**
 * tree-buy.ts — 創生の樹の MOD は「固定済みを買う」しか無い (2026-09-23)
 *
 * オーナーの決定 (2026-09-23):「創生の樹ありだと、作れないものはフラクチャーが前提って話は
 * そのまま決定事項でよさそう。カオススパムにしろなんにせよ失敗しないクラフトはないからね」。
 *
 * ## なぜ前提になるのか
 * 創生の樹からしか出ない MOD は**クラフトで二度と付けられません**。そして手順のほうは、
 * カオスでも消去でも**ランダムに MOD を飛ばします**。失敗しないクラフトは無いので、
 * 固定されていない樹 MOD を抱えたまま走ると、**いつか必ず消えて出品ごと死にます**。
 *
 * だから「乗っている物を買う」ではなく「**固定済みの物を買う**」が条件になります。
 * 実測 (巻き込む螺旋 / 5 カオス): 主線はカオス 230 回。樹 MOD 2 つは固定されていないので、
 * 出てくる 50.9 神という数字は**その 2 つが生き残る前提**の、使えない数字でした。
 *
 * ## 検索は組めます
 * この MOD は**エンジンに無い**ので、普通の経路 (`tradeFiltersFor`) では stat を引けません。
 * ただしクライアントは stat id を持っているので、`htcDropOnly()` に持たせました
 * (`scripts/_htc-mod-tags.mjs`)。そこから `trade2-stat-mapping.json` を通せば
 * `fractured.stat_...` の条件になります。**買うしか無い MOD なのに検索も組めない、では
 * 手詰まり**なので、ここだけ直結しています。
 *
 * ## ここは投げません
 * 組み立てるだけです ([[api-probing-policy]])。
 */
import statMapping from "../../i18n/trade2-stat-mapping.json";
import { htcDropOnly } from "./patch";
import { buildSpecQuery } from "../trade2/query";
import { tradeCategoryOf } from "./buy-or-craft";
import type { ItemBase } from "../../vendor/poe2htc/engine/types";

const STAT_MAP = statMapping as Record<string, string>;

/** 固定済みで買うしかない 1 行 */
export interface TreeBuy {
  /** 貼り付けの文面 (日本語のまま) */
  text: string;
  /** どのタグの樹から出るか (`genesis_tree_caster` など) */
  tag: string;
  side: "P" | "S";
  /** trade2 の条件 (`fractured.stat_...`)。組めなければ空 */
  filters: { id: string; min?: number }[];
  /** 条件を組めたか。false なら手で探すしかない */
  searchable: boolean;
  /** 組めなかった理由 */
  why?: string;
}

/**
 * 「作れないと断った行」を、固定済みで探すための条件に直します。
 *
 * 渡すのは `targetsFor` が返す **`dropOnly`** です ── `skipped` (日本語の文面) から引き直すと、
 * 文面の正規化が 1 箇所ずれただけで「買うしかない MOD なのに検索も組めない」に落ちます
 * (2026-09-23 に実際そうなった)。照合は貼り付けを読む時に 1 回だけ済ませてあります。
 *
 * `mins` を渡すと下限つきの条件になります。**渡さないと段を問わない条件**になり、
 * 目的の段より低い出品も返ります。
 */
export function treeBuys(
  rows: readonly { text: string; tag: string; name: string; stats?: string[] }[],
  opts: { mins?: Record<string, number> } = {},
): TreeBuy[] {
  const table = htcDropOnly();
  const out: TreeBuy[] = [];
  for (const row of rows) {
    const side = Object.values(table).find((v) => v.name === row.name)?.side ?? "P";
    const filters: { id: string; min?: number }[] = [];
    const missing: string[] = [];
    for (const sid of row.stats ?? []) {
      const trade = STAT_MAP[sid];
      if (!trade) { missing.push(sid); continue; }
      const min = opts.mins?.[row.text];
      filters.push({ id: trade.replace(/^explicit\./, "fractured."), ...(min != null ? { min } : {}) });
    }
    out.push({
      text: row.text,
      tag: row.tag,
      side,
      filters,
      searchable: filters.length > 0,
      ...(filters.length === 0
        ? { why: `stat id を取引所の条件に直せませんでした (${missing.join(", ") || "stat が無い"})` }
        : {}),
    });
  }
  return out;
}

/**
 * 固定済みの樹 MOD を持つ出品を探すクエリ。**1 本にまとめます** ── 樹 MOD が 2 つ要るなら
 * 両方を条件に入れた 1 回の検索で済み、上位集合は勝手に返ります ([[search-cut.ts]])。
 */
export function treeBuyQuery(
  cls: ItemBase,
  buys: readonly TreeBuy[],
  opts: {
    ilvlMin?: number; baseType?: string;
    /**
     * 固定済みを探すか (`true`、既定)、固定されていない物を探すか (`false`)。
     *
     * オーナー指示 (2026-09-23):「フラクチャー品だろうがフラクチャー無しだろうが、検索に投げるのは
     * **作れない MOD だけ**。他のアイテムレベルとかコラプト無しとかは規定通り」。
     * 違いは stat の頭だけ ── 取引所は固定済みを `fractured.`、それ以外を `explicit.` で分けて
     * 持つので、固定無しで探せば固定済みは自然に混ざりません。
     */
    fractured?: boolean;
  } = {},
): ReturnType<typeof buildSpecQuery> | null {
  const fractured = opts.fractured ?? true;
  // 下限が無い条件は min を落として送る (段を問わない検索)
  const filters = buys.flatMap((b) => b.filters).map((f) => ({
    id: fractured ? f.id : f.id.replace(/^fractured\./, "explicit."),
    min: f.min ?? 0,
  }));
  if (filters.length === 0) return null;
  const category = tradeCategoryOf(cls);
  if (!opts.baseType && !category) return null;
  return buildSpecQuery({
    ...(opts.baseType ? { baseType: opts.baseType } : {}),
    ...(category ? { category } : {}),
    rarity: "nonunique",
    ...(opts.ilvlMin != null ? { ilvlMin: opts.ilvlMin } : {}),
    stats: filters,
  });
}
