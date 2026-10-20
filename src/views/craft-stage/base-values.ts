/**
 * base-values.ts — クラフト台で MOD の数字を素の値で出す (2026-10-21 J11、オーナー「MOD の数字は上乗せを全部抜いた素の値と段で出す、盛った値は要る所でだけ小さく」)。
 * 上乗せと割り戻しはエンジンの入口 (boosts.ts・stage-core の boostedMod・retext) から取り、ここは画面の文にするだけ。
 * 開発版 (pnpm dev:web・deploy:web-dev) だけ。本番はオーナーの OK の後に BASE_VALUES_ON を外す (docs/pending-release.md)。
 */
import { craftStage } from "../../state/craft-stage";
import { modText } from "../../i18n/lang";
import { boostedMod, retext } from "../../services/craft-stage/stage-core";
import type { StageItem, StageMod } from "../../services/craft-stage/types";

export const BASE_VALUES_ON = import.meta.env.DEV || import.meta.env.VITE_DEV_PREVIEW === "1";

/** 値を短く (2 つ以上は「a-b」) */
const valuesText = (vs: readonly number[]): string => vs.join("-");

/** 聖別した MOD は聖別の前の値 (素) の文、それ以外は MOD の文のまま (values は素) */
export function baseModText(m: StageMod): string {
  if (!m.sanctify) return modText(m);
  return modText({ ...m, ...retext(m, m.sanctify.base, craftStage.data.value ?? undefined) });
}

/**
 * アイテムの MOD の行: 素の値の文と、盛った値 (品質・反対側の効果・明示 MOD の強さ・聖別。素と違う時だけ、小さく添える用)
 */
export function modLineOf(item: StageItem, m: StageMod): { text: string; shown: string | null } {
  const b = boostedMod(item, m, craftStage.data.value ?? undefined);
  const shown = b ? b.values : m.sanctify ? m.values : null;
  const base = m.sanctify ? m.sanctify.base : m.values;
  return { text: baseModText(m), shown: shown && valuesText(shown) !== valuesText(base) ? valuesText(shown) : null };
}
