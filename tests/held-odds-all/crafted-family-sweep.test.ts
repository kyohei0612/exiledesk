// (重いので tests/held-odds-all に置く: リリースの CI は外す。間で待ちを入れてワーカーの返事を止めない。2026-10-11 リリースが vitest の Timeout calling "onTaskUpdate" で落ちた)
// 全部のベース × 全部のエッセンス: エッセンスで付けた MOD と同じ系統の MOD が、後の手 (高貴・完全の高貴・カオス・骨の発現) で
// 付いたり候補に出たり、確率表に出たりしない (2026-10-11 オーナー「他の MOD も大丈夫か」)。系統が複数ある MOD は全部の系統で見る
import { describe, expect, it } from "vitest";
import { loadPatch } from "../helpers/patch";
import { applyCurrency } from "../../src/services/craft-stage/apply-currency";
import { revealOffers } from "../../src/services/craft-stage/apply-desecrate";
import { heldOdds } from "../../src/services/craft-stage/held-odds";
import { freshItem } from "../../src/services/craft-stage/run-plan";
import { allMods } from "../../src/services/craft-stage/stage-core";
import { essenceShelf } from "../../src/state/stage/craft-stage-shelf";
import { mulberry32 } from "../../src/services/htc/rng";
import type { StageItem } from "../../src/services/craft-stage/types";

const data = loadPatch();
const BASES = [...new Set([...data.bases.values()].map((c) => c.bases?.[0]).filter((b): b is string => !!b))];
const fams = (id: string): string[] => { const m = data.mods.get(id); return m?.families?.length ? [...m.families] : m?.family ? [m.family] : []; };
const A = (it: StageItem | null, key: string, s: number): StageItem | null => {
  if (!it) return null;
  const r = applyCurrency(data, it, key, mulberry32(s), []);
  return r.applied ? r.item : null;
};
const LATER = ["exalt", "exalt_perfect", "chaos", "desecrate"];

describe("エッセンスの MOD の系統は後の手で塞がる (全ベース × 全エッセンス)", () => {
  for (const base of BASES) {
    it(base, async () => {
      const bad: string[] = [];
      const magic = A(freshItem(data, base, 82), "transmute", 1);
      const rare = A(magic, "regal", 2);
      const keys = [...new Set([...essenceShelf(data, magic), ...essenceShelf(data, rare)].flatMap((g) => g.keys))];
      let checked = 0;
      for (const key of keys) {
        await new Promise((r) => setTimeout(r, 0));
        // 普通・上級はマジックへ、パーフェクトはレアへ
        const it0 = A(key.startsWith("essence:perfect:") ? rare : magic, key, 3);
        if (!it0) continue;
        const crafted = allMods(it0).filter((m) => m.crafted);
        const blocked = new Set(crafted.flatMap((m) => fams(m.modId)));
        if (!blocked.size) continue;
        checked++;
        const hit = (id: string, where: string) => { if (crafted.some((c) => c.modId === id)) return; const f = fams(id).filter((x) => blocked.has(x)); if (f.length) bad.push(`${key} → ${where}: ${id} (${f.join(",")})`); };
        for (const later of LATER) {
          // カオスは先に 1 つ消すので、エッセンスの MOD が消えた時は同じ系統が付き直してよい (表はその混ぜ合わせ)。表は消さない手だけ見る
          const h = later === "chaos" ? null : heldOdds(data, it0, later, []);
          for (const id of h?.byMod.keys() ?? []) hit(id, `${later} の確率表`);
          for (let s = 1; s <= 30; s++) {
            const r = applyCurrency(data, it0, later, mulberry32(100 + s), []);
            if (!r.applied) break;
            const stillCrafted = crafted.every((c) => allMods(r.item).some((m) => m.modId === c.modId));
            if (stillCrafted) for (const m of r.added ?? []) if (!m.unrevealed) hit(m.modId, later);
            if (later === "desecrate") for (const o of revealOffers(data, r.item, mulberry32(500 + s)).first) hit(o.modId, "発現の候補");
          }
        }
      }
      expect(bad.slice(0, 30), bad.slice(0, 30).join("\n")).toEqual([]);
      if (keys.length) expect(checked).toBeGreaterThan(0);
    }, 300_000);
  }
});
