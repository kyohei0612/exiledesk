// アイテムレベルを変える手 (ilvl:N、2026-10-16)。カオススパム確率機でアイテムレベルを変えて回した時、前の手は元のアイテムレベルのまま再生される
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { runPlan } from "../src/services/craft-stage/run-plan";
import type { CraftStagePlan } from "../src/services/craft-stage/contract";

const data = loadPatch();
const meta = { prices: {}, exiledeskVersion: "test", patch: "0.5.0", league: null, generatedAt: "2026-10-16T00:00:00Z" };
const plan = (steps: Array<{ currency: string }>) => ({ schema: "craft-stage-plan/1", base: "Gold Ring", item_level: 65, seed: 1016, steps }) as unknown as CraftStagePlan;

describe("アイテムレベルを変える手", () => {
  it("手順の途中でアイテムレベルが変わり、その前の手は始めのアイテムレベルのまま", () => {
    const r = runPlan(data, plan([{ currency: "alchemy" }, { currency: "ilvl:82" }, { currency: "chaos" }]), meta);
    const st = r.steps as unknown as Array<{ applied: boolean; currency_ja: string; after: { item_level?: number; itemLevel?: number } }>;
    expect(st.every((x) => x.applied)).toBe(true);
    expect(st[1]!.currency_ja).toBe("アイテムレベルを 82 に");
    // 錬金は 65 のまま (同じ種の手順で始めを 82 にした物と同じ結果にならない)
    const only = runPlan(data, plan([{ currency: "alchemy" }]), meta).steps[0]!;
    expect(JSON.stringify(st[0]!.after)).toBe(JSON.stringify((only as unknown as { after: unknown }).after));
  });
});
