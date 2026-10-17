import { it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import TABLE from "../src/data/element-conversions.json";
it("probe", () => {
  const data = loadPatch();
  const rows = (TABLE as any).rows.filter((r: any) => r.res);
  const inTable = new Set<string>();
  for (const r of rows) for (const e of ["fire", "cold", "lightning", "chaos"]) { const s = r[e]; if (s) inTable.add(`${s.name}|${s.level}`); }
  const miss = new Map<string, string[]>();
  for (const m of data.mods.values()) {
    const fam = (m.families ?? [m.family]).join(",");
    if (!/(Fire|Cold|Lightning|Chaos)Resistance/i.test(fam) || /AllResist|AllElemental/i.test(fam)) continue;
    const bad = m.tiers.filter((t: any) => !inTable.has(`${t.name}|${t.ilvl}`));
    if (bad.length) { const k = `${m.source}`; miss.set(k, [...(miss.get(k) ?? []), `${m.id} (${bad.length}/${m.tiers.length})`]); }
  }
  for (const [k, v] of miss) console.log(k, v.length, "\n  " + v.slice(0, 30).join("\n  "));
});
