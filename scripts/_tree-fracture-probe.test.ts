/**
 * _tree-fracture-probe.test.ts — ツリーのフラクチャーの手 (fracture、✦ にする MOD の選び fractureOf) をエンジンで打って見る台本 (2026-10-22 シミュ部長 13 本目)。
 *
 *   pnpm exec vitest run -c scripts/_tree-fracture-probe.config.ts
 *
 * 金の指輪 (4 MOD のレア: マナ T1・命中 T2・火耐性 T2・冷気耐性 T2) にフラクチャーのオーブを 200 回: 乱数の時の ✦ の行き先と当たり / 外れ、マナを選んだ時。合否は付けない (並べるだけ)
 */
import { it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { applyCurrency, freshItem, modListFor, mulberry32 } from "../src/services/craft-stage/engine";
import { outcomeOf, playHand } from "../src/services/simulator/tree/tree-sample";
import type { Aim, Hand } from "../src/services/simulator/tree/tree-model";

const data = loadPatch();
const A = (m: string, t: number): Aim => ({ modId: `Rings/${m}`, tier: t });
it("fracture", () => {
  let item = freshItem(data, "Gold Ring", 82, "rare");
  const rows = modListFor(data, item).filter((r) => r.group === "normal");
  const fire = rows.find((r) => r.side === "suffix" && r.text.includes("火耐性"))!.id, cold = rows.find((r) => r.side === "suffix" && r.text.includes("冷気耐性"))!.id;
  const aims = [A("IncreasedMana", 1), A("IncreasedAccuracy", 2), { modId: fire, tier: 2 }];
  for (const k of ["force:Rings/IncreasedMana|T1|n", "force:Rings/IncreasedAccuracy|T2|n", `force:${fire}|T2|n`, `force:${cold}|T2|n`]) { const r = applyCurrency(data, item, k, mulberry32(1)); console.log(k, r.applied, r.reason ?? ""); item = r.item; }
  const H = (fractureOf?: string): Hand => ({ currency: "fracture", omens: [], catalyst: null, quality: 0, repeat: null, ...(fractureOf ? { fractureOf } : {}) });
  for (const f of [undefined, "Rings/IncreasedMana"]) {
    const by: Record<string, number> = {};
    for (let s = 1; s <= 200; s++) {
      const r = playHand(data, item, H(f), mulberry32(s), aims);
      const fr = [...r.item.prefixes, ...r.item.suffixes].find((m) => m.fractured)?.modId ?? (r.applied ? "none" : `cant:${r.reason}`);
      const oc = r.applied ? outcomeOf(data, item, r.item, aims, "fracture") : null;
      const k = `${fr} → ${oc ? `${oc.out}${oc.hits.length ? ` ${oc.hits[0]!.modId}` : ""}` : "-"}`;
      by[k] = (by[k] ?? 0) + 1;
    }
    console.log(`fractureOf=${f ?? "乱数"}`, by);
  }
});
