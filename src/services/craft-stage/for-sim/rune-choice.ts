/**
 * rune-choice.ts — そのアイテムに差せるルーン (2026-10-22 シミュの自前の式を入口へ、sim-own-logic.md の B14)。
 * 差せるかはエンジンの applyCurrency (rune:<英語名>) にソケット 1 つの形で聞く (ソケットの数・空きは見ない = ベースに差せる種類か)
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { applyCurrency } from "../apply-currency";
import { RUNES, runeEffectFor, type RuneEffect, type RuneRow } from "../stage-runes";
import { mulberry32 } from "../../htc/rng";
import type { StageItem } from "../types";

/** 今のゲームに有るルーン (ソウルコアなどは入れない) のうち、このアイテムのベースに差せる物 (RUNES の並び)。effect = このベースでの効果 */
export function runesFor(data: PatchData, item: StageItem): Array<{ en: string; rune: RuneRow; effect: RuneEffect | null }> {
  return Object.entries(RUNES).filter(([en, r]) => r.kind === "rune" && r.available !== false && applyCurrency(data, { ...item, sockets: 1 }, `rune:${en}`, mulberry32(1)).applied)
    .map(([en, rune]) => ({ en, rune, effect: runeEffectFor(rune, item.cls.category) }));
}
