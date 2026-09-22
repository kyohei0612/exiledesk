/**
 * labels.ts — クラフトの手順を**ゲーム公式の日本語**で書く (2026-09-22)
 *
 * オーナー指示:「お告げ系も全部、今回の正規の日本語名前で動きできる?」
 *
 * **訳さない。**名前はクライアントの日本語テーブルから取った物 (`price-keys.json` /
 * `essence-keys.json` の `ja`) をそのまま出します。勝手に訳すと事故ります ──
 * 実際に `OmenoftheBlackblooded` を「黒血のお告げ」と書いてしまいましたが、
 * ゲームの表記は**「ブラックブラッドのお告げ」**でした (オーナー指摘 2026-09-22)。
 *
 * ## 手の翻訳は上流に任せる
 * MDP の手 (`McAction`) が「どの通貨 + どのお告げ」なのかは、上流の `pricedStepOf` と
 * `stepOmenIds` が既に知っています。ここで書き写すと上流とずれるので、**その 2 つを通して**
 * 名前を引くだけにしています (`pricedStepOf` は export するために上流へ 1 語だけ手を入れました。
 * `vendor/poe2htc/README.md` の差分 5)。
 */
import { pricedStepOf } from "../../vendor/poe2htc/optimizer/markovActions";
import { currencyKey, stepOmenIds } from "../../vendor/poe2htc/optimizer/cost";
import { desecrationBoneFor } from "../../vendor/poe2htc/engine/probability";
import type { McAction } from "../../vendor/poe2htc/optimizer/markovActions";
import type { PricedStep } from "../../vendor/poe2htc/optimizer/cost";
import type { ItemBase } from "../../vendor/poe2htc/engine/types";
import keys from "./price-keys.json";
import essenceKeys from "./essence-keys.json";
import type { GameName } from "./prices";

interface PriceKeys {
  currency: Record<string, GameName>;
  bones: Record<string, GameName>;
  omens: Record<string, GameName>;
}
const KEYS = keys as PriceKeys;
const ESSENCE_KEYS = (essenceKeys as { keys: Record<string, GameName> }).keys;

/**
 * 値段のキー → ゲーム内の日本語名。引けなければ null (キーのまま出さない)。
 *
 * 冒涜 (`desecrate` / `desecrate_ancient`) は**どの骨を食うかが装備の種別で決まる**ので
 * (武器 = 顎の骨 / 防具 = 肋骨 / 装飾品 = 鎖骨)、クラスが分かる時だけ骨の名前に解決する。
 * 上流の `pricesForBase` が値段に対してやっているのと同じ対応。
 */
export function jaOfPriceKey(key: string, cls?: ItemBase): string | null {
  if (key.startsWith("essence:")) return ESSENCE_KEYS[key]?.ja ?? null;
  if (cls && (key === "desecrate" || key === "desecrate_ancient")) {
    const bone = desecrationBoneFor(cls.category);
    const boneKey = key === "desecrate_ancient" ? `${bone}_ancient` : bone;
    return KEYS.bones[boneKey]?.ja ?? null;
  }
  return KEYS.currency[key]?.ja ?? KEYS.bones[key]?.ja ?? null;
}

/** お告げの id → ゲーム内の日本語名 */
export function jaOfOmen(omenId: string): string | null {
  return KEYS.omens[omenId]?.ja ?? null;
}

/** 手 1 つの内訳 (画面でそのまま並べられる形) */
export interface StepLabel {
  /** 使う通貨 / 骨 / エッセンスの日本語名。引けなければキーをそのまま */
  currency: string;
  /** 一緒に使うお告げの日本語名 (無ければ空) */
  omens: string[];
  /** 「高貴なオーブ (上級) + 左側の高貴なお告げ」のような 1 行 */
  text: string;
}

/**
 * 値段のキーとお告げから 1 行を組む。
 *
 * お告げは `stepOmenIds` が全部返す ── アビスの反響も含まれている (値段だけ別勘定)。
 * ここで足すと二重になるので足さない。
 */
function labelOf(step: PricedStep, cls?: ItemBase): StepLabel {
  const key = currencyKey(step);
  const currency = jaOfPriceKey(key, cls) ?? key;
  const omens = stepOmenIds(step).map((id) => jaOfOmen(id) ?? id).filter(Boolean);
  const text = omens.length ? `${currency} + ${omens.join(" + ")}` : currency;
  // 触媒の高貴のお告げは「お告げを使う」だけでは手順にならない。**先にカタリストを何個撒くか**が
  // 本体の費用なので、そこまで書かないと画面を見て真似できない。
  if (step.catalysing) {
    const c = step.catalysing;
    const cat = jaOfPriceKey(`catalyst_${c.tag}`) ?? c.tag;
    return { currency, omens, text: `${cat} を ${c.catalysts} 個 (品質 ${c.quality}%) → ${text}` };
  }
  return { currency, omens, text };
}

/** MDP が出す手を日本語にする。冒涜の骨を名前で出すにはクラスが要る */
export function labelOfAction(action: McAction, cls?: ItemBase): StepLabel {
  return labelOf(pricedStepOf(action), cls);
}

/** 線形プランナが出す手を日本語にする */
export function labelOfStep(step: PricedStep, cls?: ItemBase): StepLabel {
  return labelOf(step, cls);
}
