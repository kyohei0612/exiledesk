/**
 * shelf-context.ts — 棚 (CurrencyShelf / ShelfButton) が見るアイテム・お告げ・持っている物 (2026-10-09)。
 * 既定は手で打つ画面 (craftStage)。シミュレーションの「打って作る」(StagePlayEditor) は自分のアイテムで provide して、
 * 手打ちと同じ棚 (今のアイテムに打てる物を前に、使えない物は畳む) をそのまま使う
 * (2026-10-09 オーナー「イメージは完全に手打ちの UI」「クラフトに使えるカレンシーは全部出さんとあかん」)
 */
import { inject, provide, type InjectionKey, type Ref } from "vue";
import type { PatchData } from "../vendor/poe2htc/engine/types";
import type { StageItem } from "../services/craft-stage/types";
import { craftStage } from "./craft-stage";

export interface ShelfCtx {
  data: Ref<PatchData | null>;
  item: Ref<StageItem | null>;
  omens: Ref<string[]>;
  held: Ref<string | null>;
  /** 打てない理由 (打てるなら null) */
  usable(key: string): string | null;
  toggleOmen(id: string): void;
}
const KEY: InjectionKey<ShelfCtx> = Symbol("shelf");
const handCtx = (): ShelfCtx => ({
  data: craftStage.data, item: craftStage.item, omens: craftStage.omens, held: craftStage.held,
  usable: (k) => craftStage.usable(k), toggleOmen: (id) => craftStage.toggleOmen(id),
});
export const provideShelf = (ctx: ShelfCtx): void => provide(KEY, ctx);
export const useShelf = (): ShelfCtx => inject(KEY, handCtx, true);
