/**
 * goal-row-blocks.ts — 完成形の MOD 選び (TreeGoalPage) で、開いた行の頭に出す押せない理由をまとめる (S-04)。
 * 理由ごとに段をまとめる。束ねた行 (火・冷気…のダメージ増加を 1 行に) は段の名前が MOD ごとに T1 から並ぶので、
 * 止まる MOD の名前 (数値は #、normalizeModTemplate) で言う (11-05 オーナー「おｋ頼んで」、前は「T1〜T8」で全部の段に読めた)。
 * 断りの中身は呼ぶ側の why (goalBlockLoose) のまま、ここは並べ方だけ
 */
import { normalizeModTemplate } from "../../mods/normalize";
import { tr } from "../../../i18n/lang";

type RowTier = { modId?: string; tier: number; rank: string; text: string };

/** 行 r の段ごとの理由 why(modId, tier) を、理由ごとに [段か MOD の名前, 理由] にまとめる。全部の段が止まる理由は名前なし */
export function rowBlockLines(r: { id: string; tiers: RowTier[] }, why: (modId: string, tier: number) => string | null): Array<{ why: string; ranks: string }> {
  const span = (rs: string[], n: number): string => (rs.length === n ? "" : rs.length > 2 ? `${rs[0]}〜${rs[rs.length - 1]}` : rs.join(tr("・", ", ")));
  const idOf = (x: RowTier): string => x.modId ?? r.id;
  const countOf = (id: string): number => r.tiers.filter((x) => idOf(x) === id).length;
  const mods = [...new Set(r.tiers.map(idOf))];
  const by = new Map<string, Map<string, string[]>>();
  for (const x of r.tiers) {
    const w = why(idOf(x), x.tier);
    if (!w) continue;
    const m = by.get(w) ?? new Map<string, string[]>();
    m.set(idOf(x), [...(m.get(idOf(x)) ?? []), x.rank]);
    by.set(w, m);
  }
  return [...by].map(([w, m]) => {
    if (mods.length === 1) return { why: w, ranks: span([...m.values()][0]!, r.tiers.length) };
    if (m.size === mods.length && [...m].every(([id, rs]) => rs.length === countOf(id))) return { why: w, ranks: "" };
    const name = (id: string): string => normalizeModTemplate(r.tiers.find((x) => idOf(x) === id)?.text ?? id);
    return { why: w, ranks: [...m].map(([id, rs]) => { const k = span(rs, countOf(id)); return k ? `${name(id)} (${k})` : name(id); }).join(tr("・", ", ")) };
  });
}
