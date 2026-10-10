/**
 * apply-flux.ts — 耐性のフラックス (2026-10-04 オーナー「カレンシーフルチェック」で、相場に値段があって棚に無かった物)
 *
 * クライアントの説明文: 火炎フラックス「アイテム上の全ての冷気および雷耐性モッドを同等な火耐性モッドに変換する」、
 * 冷却 = 火・雷 → 冷気、雷撃 = 火・冷気 → 雷、虚無 = 火・冷気・雷 → 混沌。
 * 変え方はアルダーのルーンと同じ (stage-runes.ts の convertElements、同じ段の順位・段の中の同じ位置。対応はベースの置き場の
 * id / 文面の属性の言葉を替えた MOD = 仮定)。耐性の MOD (文面に Resistance) だけ。変える物が無ければ打てない。
 * 使い切りで、ソケットは要らない。コラプト・聖別の後は打てない (普通のカレンシーと同じ)
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import type { StageApply, StageItem } from "./types";
import { skip } from "./stage-core";
import { convertElements } from "./stage-runes";
import { tr } from "../../i18n/lang";

export const FLUX: Record<string, { element: string; eats: string[] }> = {
  flux_fire: { element: "fire", eats: ["cold", "lightning"] },
  flux_cold: { element: "cold", eats: ["fire", "lightning"] },
  flux_lightning: { element: "lightning", eats: ["fire", "cold"] },
  flux_chaos: { element: "chaos", eats: ["fire", "cold", "lightning"] },
};
export const FLUX_KEYS = Object.keys(FLUX);
export const isFlux = (key: string): boolean => key in FLUX;

export function applyFlux(data: PatchData, item: StageItem, key: string): StageApply {
  const f = FLUX[key]!;
  const c = convertElements(data, item, f.element, f.eats, (md) => /Resistance/.test(md.text ?? ""));
  if (!c.mods.length) return skip(item, tr("変換できる耐性モッドが無い", "No resistance mod to convert"));
  return { applied: true, item: c.item, added: c.mods.map((x) => x.to), removed: c.mods.map((x) => x.from), converted: { element: f.element, mods: c.mods } };
}
