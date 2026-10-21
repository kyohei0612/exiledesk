/**
 * held-omens.ts — 持っている物に掛けられるお告げ (HeldOmens.vue と、slot を出すか決める呼ぶ側で使う。2026-10-22 共通の部品に)。
 * 骨 (冒涜) を持った時は、後の発現で使うアビスの反響も並べる (2026-10-05 オーナー「アビス系だけど、骨持った瞬間に反響のお告げも
 * ON にできるように下に表示しないと」)。掛けるだけで、使われるのは発現の手 (OMEN_FOR の決まりは変えない)
 */
import { kindOf } from "../../services/craft-stage/apply-currency";
import { OMEN_FOR } from "../../services/craft-stage/omens";

export function heldOmensOf(held: string | null): string[] {
  if (!held) return [];
  const kind = kindOf(held);
  return [...(OMEN_FOR[kind] ?? []), ...(kind === "desecrate" ? OMEN_FOR.reveal ?? [] : [])];
}
