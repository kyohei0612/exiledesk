// Web は工程を 50 手まで覚えて古い手を消す。消した手も手順 JSON には残す (2026-10-16 要望 0ce15a82: 手順を再生しても
// 送った人のアイテムにならなかった。30 手の手順の頭に、50 手より前に打ったエッセンス・フラクチャー・高貴が無かった)
import { describe, expect, it } from "vitest";
import type { StageItem } from "../src/services/craft-stage/types";

const look = (it: StageItem) => ({
  rarity: it.rarity, quality: it.quality ?? 0, sockets: it.sockets ?? 0,
  mods: [...it.prefixes, ...it.suffixes].map((m) => `${m.modId}#${m.tierIndex}:${JSON.stringify(m.values ?? null)}${m.fractured ? "f" : ""}${m.desecrated ? "d" : ""}`),
});

describe("50 手を超えた手順", () => {
  it("消した手も手順に入り、1 手戻した後でも再生すると今のアイテムと同じ", async () => {
    const { loadPatch } = await import("./helpers/patch");
    const { craftStage, LOG_KEEP } = await import("../src/state/craft-stage");
    const { playPlan } = await import("../src/services/craft-stage/run-plan");
    const data = await loadPatch();
    craftStage.data.value = data;
    craftStage.base.value = "Gold Ring";
    craftStage.itemLevel.value = 82;
    craftStage.reset();
    craftStage.use("transmute");
    craftStage.use("augment");
    craftStage.use("regal");
    for (let i = 0; i < 70; i++) craftStage.use(i % 3 === 0 ? "exalt" : "chaos");
    expect(craftStage.log.value.length).toBe(LOG_KEEP);
    const all = craftStage.log.value[LOG_KEEP - 1]!.out.index;
    expect(all).toBeGreaterThan(LOG_KEEP);
    // 戻して 30 手に (送った人の手順と同じ形)
    while (craftStage.log.value.length > 30) craftStage.undo();
    const plan = craftStage.plan();
    expect(plan.steps.length).toBe(all - (LOG_KEEP - 30));
    expect(plan.steps[0]!.currency).toBe("transmute");
    const r = playPlan(data, plan, {});
    expect(look(r.final)).toEqual(look(craftStage.item.value!));
    expect(craftStage.shareWhy.value).toBeNull();
    // 白に戻すと消した手も忘れる
    craftStage.reset();
    craftStage.use("transmute");
    expect(craftStage.plan().steps.map((s) => s.currency)).toEqual(["transmute"]);
  });
});
