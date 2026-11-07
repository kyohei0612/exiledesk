/**
 * 手の種類を動作の部品から引く (E-1、2026-11-07 ジン jin-base。洗い出し base-audit-1107 の G-1)。
 *
 * 土台は「付ける・消す・入れ替える」+「性質を変える」+「値」(オーナー 11-07)。カレンシーは部品 (CurrencySpec.actions) の並びなので、
 * 種類は鍵の文字 (kindOf の "chaos" など) ではなく部品で決める: 消す (remove) と付ける (add・addUnrevealed・addEssence・addEmotion) が両方ある・発現 = 入れ替える。
 * お告げで部品が置き換わる手 (腐食・聖別) は planSpec の actions で見る (actionClassOf)。
 * 骨 (addUnrevealed だけ) は付ける。満杯の側なら入れ替わるが、それは枠の決まり (basis.ts の boneSlotOf) で、部品の並びではない
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import type { StageItem } from "../types";
import type { Action } from "./types";
import { planSpec, specOfKey } from "./run-spec";

/** 動作の部品の名前 (Action の鍵) */
export type ActionName = "add" | "addUnrevealed" | "addEssence" | "addEmotion" | "remove" | "reveal" | "fracture" | "corrupt" | "setRarity" | "quality" | "catalyst" | "addSocket" | "socketAugment" | "convertElements" | "reroll" | "sanctify";
/** add = 付ける / remove = 消す / replace = 入れ替える (消してから付ける・発現) / property = 性質を変える (固定・レアリティ・品質・ソケット・元素 …) / values = 値 (神・聖別) */
export type ActionClass = "add" | "remove" | "replace" | "property" | "values";

const ADDS: ReadonlySet<ActionName> = new Set(["add", "addUnrevealed", "addEssence", "addEmotion"]);
const VALUES: ReadonlySet<ActionName> = new Set(["reroll", "sanctify"]);
export const actionName = (a: Action): ActionName => Object.keys(a)[0] as ActionName;

/** 部品の並び → 種類と部品の名前 (部品が無ければ cls は null) */
export function actionClass(actions: readonly Action[]): { cls: ActionClass | null; parts: ActionName[] } {
  const parts = actions.map(actionName);
  const has = (s: ReadonlySet<ActionName>): boolean => parts.some((p) => s.has(p));
  const removes = parts.includes("remove");
  const cls: ActionClass | null = !parts.length ? null
    : has(VALUES) ? "values"
    : parts.includes("reveal") || (removes && has(ADDS)) ? "replace"
    : has(ADDS) ? "add"
    : removes ? "remove"
    : "property";
  return { cls, parts };
}
/** 持っている手 (鍵・お告げ) を今の品に打つ時の種類 (お告げで置き換わった部品で見る)。説明文に移していない手 (指名・スパム …) は cls が null */
export function actionClassOf(data: PatchData, item: StageItem, key: string, omens: readonly string[] = []): { cls: ActionClass | null; parts: ActionName[] } {
  const plan = planSpec(data, item, key, omens);
  return plan ? actionClass(plan.actions) : { cls: null, parts: [] };
}
/**
 * 品の無い所 (木の手の鍵だけ) での種類: 鍵 → カレンシーの部品の並び (run-spec.ts の specOfKey)。お告げは掛けない
 * (腐食・聖別のようにお告げで部品が置き換わる手は actionClassOf)。2026-11-07 シミュ部長 sim-light22 の頼み (木の effectOf を部品から引く、G-1 の S-5)
 */
export function actionClassOfKey(key: string): { cls: ActionClass | null; parts: ActionName[] } {
  const spec = specOfKey(key);
  return spec ? actionClass(spec.actions) : { cls: null, parts: [] };
}
