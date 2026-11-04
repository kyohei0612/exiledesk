/**
 * _dev-daily-entry.ts — dev-daily-api.mjs が束ねて読む所。見本の順位の人に持たせる木 (お題のスタートだけ) を画面と同じ関数で作る
 */
import { newTree } from "../src/services/simulator/tree/tree-model";
import { toRecipeV1 } from "../src/services/simulator/tree/tree-recipe-v1";
import { fillTopicDoc } from "../src/views/daily/daily-aims";
import type { GenAim } from "../src/views/daily/daily-gen";


/** お題の木 (フラクチャー済みのスタートだけ) を exiledesk-recipe/1 の JSON で */
export function startRecipe(base: string, ilvl: number, aims: GenAim[], fractured: string): string {
  const d = newTree(base, ilvl);
  fillTopicDoc(d, aims, fractured);
  return JSON.stringify(toRecipeV1(d));
}
