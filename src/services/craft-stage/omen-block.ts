/**
 * omen-block.ts — そのお告げを今掛けられるか (2026-10-22 オーナー「絶対これダメでしょ、進行不能」。消去のオーブ + 消せる物が無い側のお告げが
 * 「有効」で選べて、その手が打てなくなっていた)。掛けると持った物が打てなくなる・掛けても意味が無いお告げは、理由を返す (お告げの欄で灰色・押せない、
 * 既に掛かっていれば外す)。打てるかは打つ時と同じ applyCurrency (乱数で決まる物は打てる扱い)、意味が無いかは omens.ts の omenNoteOf の block
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { mulberry32 } from "../htc/rng";
import { tr } from "../../i18n/lang";
import { applyCurrency } from "./apply-currency";
import { OMEN_EXCLUSIVE, omenNoteOf } from "./omens";
import type { StageItem } from "./types";

export function omenBlock(data: PatchData | null | undefined, item: StageItem | null | undefined, held: string | null | undefined, omens: readonly string[], omen: string): string | null {
  if (!data || !item || !held) return null;
  const note = omenNoteOf(omen, item, data);
  if (note?.block) return note.text;
  // 同じ組のお告げ (左右など) は掛け替えになるので、それを抜いた上に足して比べる
  const rivals = new Set(OMEN_EXCLUSIVE.filter((g) => g.includes(omen)).flat());
  const rest = omens.filter((o) => o !== omen && !rivals.has(o));
  const tryWith = (om: readonly string[]) => applyCurrency(data, item, held, mulberry32(0), om);
  const without = tryWith(rest);
  if (!without.applied && !without.random) return null; // お告げ無しでも打てない時は、お告げのせいではない
  const withIt = tryWith([...rest, omen]);
  return withIt.applied || withIt.random ? null : withIt.reason ?? tr("掛けると打てない", "Can't use with this omen");
}
