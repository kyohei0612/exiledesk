/**
 * paste-sides.ts — 貼り付けの行を MOD に繋いだ後の側の直し ([[paste.ts]] から分けた。1 ファイル 500 行まで)
 */
import type { Mod, PatchData } from "../../vendor/poe2htc/engine/types";

/**
 * プレにもサフィにもある MOD (アイテムレアリティ増加など) を、**片側が枠 (普通は 3、黄昏の指輪は 4/2) を超えたら反対側へ回す**。
 *
 * 文面だけでは側が決まらず、繋ぎ先は片方 (サフィ) に寄る。poe.ninja の指輪 (2026-09-23) で
 * 「レアリティ + 能力値 + 火耐性 + 混沌耐性」がサフィ 4 つになり「枠が足りない」と止まっていた。
 * 同じクラスで文面が同じ・種類 (普通 / エッセンス…) が同じで、側だけ違う MOD を双子として探す。
 * 繋がらない行 (樹 MOD) が使う枠 (`taken`) も数える (呪文ダメージ + 呪文クリティカルの樹 MOD がサフィを
 * 1 つ使う指輪で、レアリティをプレへ回せていなかった)。
 */
export function balanceSides(
  data: PatchData, mods: Array<{ mod?: Mod | null }>, taken: { prefix: number; suffix: number }, limit: { prefix: number; suffix: number },
): void {
  const count = (side: "prefix" | "suffix"): number => mods.filter((b) => b.mod?.type === side).length + taken[side];
  for (const [over, other] of [["suffix", "prefix"], ["prefix", "suffix"]] as const) {
    for (const b of mods) {
      if (count(over) <= limit[over] || count(other) >= limit[other]) break;
      const m = b.mod;
      if (!m || m.type !== over) continue;
      const cls = m.id.split("/")[0];
      const twin = [...data.mods.values()].find((x) =>
        x.id.split("/")[0] === cls && x.type === other && x.source === m.source && x.text === m.text);
      if (twin) b.mod = twin;
    }
  }
}

/**
 * 2 行で 1 つの複合 MOD (光半径 + マナ自動回復 など) の**もう 1 行**を探す。
 *
 * 片方の行は複合 MOD の 1 行 (`viaLine`) として繋がるが、もう片方は単独の MOD
 * (マナ自動回復) としても繋がってしまい、狙いが 1 つ多く数えられていた
 * (poe.ninja の指輪 2026-09-23: サフィが 4 つになって「枠が足りない」)。
 * 複合 MOD と同じ側で、その stat の 1 つだけを持つ単独 MOD / 同じ複合 MOD の重複を「もう 1 行」とする。
 */
export function hybridLineParts(mods: ReadonlyArray<{ mod?: Mod | null; viaLine?: boolean }>): Set<number> {
  const parts = new Set<number>();
  // 同梱の型に stats は無いが、データには入っている (tiers[].stats)
  const statsOf = (m: Mod): readonly string[] => (m.tiers[0] as { stats?: string[] } | undefined)?.stats ?? [];
  mods.forEach((h, i) => {
    const H = h.mod;
    if (!H || !h.viaLine || parts.has(i)) return;
    const hs = statsOf(H);
    mods.forEach((b, j) => {
      const Y = b.mod;
      if (j === i || !Y || parts.has(j)) return;
      const ys = statsOf(Y);
      if (Y.id === H.id || (Y.type === H.type && ys.length === 1 && hs.includes(ys[0]!))) parts.add(j);
    });
  });
  return parts;
}