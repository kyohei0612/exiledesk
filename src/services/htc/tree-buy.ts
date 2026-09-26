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
import { tradeCategoryOf, tradeFiltersFor } from "./buy-or-craft";
import type { ItemBase, PatchData } from "../../vendor/poe2htc/engine/types";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";

const STAT_MAP = statMapping as Record<string, string>;

/** 取引所の「プレフィックスモッド #個」「サフィックスモッド #個」(data-cache/trade2-stats-*.json で確認) */
export const STRICT_PREFIX = "pseudo.pseudo_number_of_prefix_mods";
export const STRICT_SUFFIX = "pseudo.pseudo_number_of_suffix_mods";

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
  /**
   * 固定済みでない時の取引所の種類。普通は explicit、樹が生む指輪などの「異界の MOD」は desecrated
   * (2026-09-24 金の指輪の of Invigoration)
   */
  plain: "explicit" | "desecrated";
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
    const info = Object.values(table).find((v) => v.name === row.name);
    const side = info?.side ?? "P";
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
      plain: info?.domain === "desecrated" ? "desecrated" : "explicit",
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
 * 貼り付けで固定済みだった**普通の MOD** (半影の指輪の火の追加ダメージなど) も、樹 MOD と同じ 3 本
 * (固定済み / 固定無し・ゆるい / 固定無し・厳しい) で比べるための行 (2026-09-24)。
 * オーナー:「フラクチャーありなしでいくなら、フラクチャー無し品とかも選択肢じゃなかったっけ。4 種類くらい」。
 * 条件は [[buy-or-craft.ts]] の `tradeFiltersFor` (素の段の下限) を `fractured.` にした物。
 */
export function fracturedBuys(data: PatchData, targets: readonly TierTarget[], name: (modId: string) => string): TreeBuy[] {
  return targets.map((t) => {
    const { filters } = tradeFiltersFor(data, [t]);
    const side = data.mods.get(t.modId)?.type === "suffix" ? "S" : "P";
    return {
      text: name(t.modId), tag: "fractured", side, plain: "explicit",
      filters: filters.map((f) => ({ id: f.id.replace(/^explicit\./, "fractured."), min: f.min })),
      searchable: filters.length > 0,
      ...(filters.length ? {} : { why: "取引所の条件にできる stat が見つからない" }),
    };
  });
}

/**
 * 固定済みの樹 MOD を持つ出品を探すクエリ。**1 本にまとめます** ── 樹 MOD が 2 つ要るなら
 * 両方を条件に入れた 1 回の検索で済み、上位集合は勝手に返ります。
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
    /**
     * 消去の要らない物だけに絞る (固定無しの時だけ意味がある)。
     *
     * オーナー案 (2026-09-23):「プレフィックスモッド #個を上限 1、サフィックスモッド #個を
     * 上限 3 にしたら、サフィックス冒涜やるだけで楽かも。消去ガチャやりたくない」。
     * 樹 MOD (プレフィックス) だけがプレフィックスに居る物なら、残りの作業はサフィ側だけで
     * 済み、樹 MOD に消去を当てる危険がありません。
     *
     * **サフィの数は問いません** (オーナー 2026-09-23:「プレフィックス上限 1 だったらサフィは
     * 何個でもいい。右側高貴使ったら増やせるからね、3 つまで安いし」)。足りなければ右側の高貴な
     * お告げで足してから冒涜するので、条件はプレフィックスの上限だけです。
     */
    strict?: boolean;
    /** ベースの付与スキル (不在のアミュレットなど。同じ付与スキルの素材だけ探す) */
    grantedSkill?: string | null;
    /** ルーンソケットの下限 (equipment_filters.rune_sockets)。武器・防具の規格外ベース用 (2026-09-26)。null なら送らない */
    socketsMin?: number | null;
  } = {},
): ReturnType<typeof buildSpecQuery> | null {
  const fractured = opts.fractured ?? true;
  // 下限が無い条件は min を落として送る (段を問わない検索)
  const filters: { id: string; min?: number; max?: number }[] = buys.flatMap((b) => b.filters.map((f) => ({
    id: fractured ? f.id : f.id.replace(/^fractured\./, `${b.plain}.`),
    min: f.min ?? 0,
  })));
  // 厳しい: 固定したい MOD の側は、その MOD だけ (もう片側は問わない)。樹 MOD はプレなので従来どおりプレ 1
  if (opts.strict && !fractured) {
    const nP = buys.filter((b) => b.side === "P").length, nS = buys.filter((b) => b.side === "S").length;
    if (nP) filters.push({ id: STRICT_PREFIX, max: nP });
    if (nS) filters.push({ id: STRICT_SUFFIX, max: nS });
  }
  if (filters.length === 0) return null;
  const category = tradeCategoryOf(cls);
  if (!opts.baseType && !category) return null;
  return buildSpecQuery({
    ...(opts.baseType ? { baseType: opts.baseType } : {}),
    ...(category ? { category } : {}),
    rarity: "nonunique",
    ...(opts.ilvlMin != null ? { ilvlMin: opts.ilvlMin } : {}),
    stats: filters,
    // 固定無しを探す時は「フラクチャー: いいえ」も入れる。stat を explicit にしただけだと、
    // 別の MOD が固定された物 (= もう樹 MOD を固定できない物) が返ってくる
    ...(fractured ? {} : { fracturedItem: false }),
    grantedSkill: opts.grantedSkill ?? null,
    ...(opts.socketsMin != null ? { socketsMin: opts.socketsMin } : {}),
  });
}
