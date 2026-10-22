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

  it("消した手が残っている時は、工程を全部戻しても始めの MOD は外さない・足さない (手順とアイテムが食い違わない)", async () => {
    const { loadPatch } = await import("./helpers/patch");
    const { craftStage } = await import("../src/state/craft-stage");
    const { playPlan } = await import("../src/services/craft-stage/run-plan");
    const data = await loadPatch();
    craftStage.data.value = data;
    craftStage.base.value = "Withered Wand";
    craftStage.itemLevel.value = 82;
    craftStage.reset();
    craftStage.addStartMod({ mod: "Wands/IncreasedMana", fractured: true });
    expect(craftStage.startMods.value.length).toBe(1);
    for (let i = 0; i < 60; i++) craftStage.use(i % 2 ? "chaos" : "exalt", { quiet: true });
    while (craftStage.log.value.length) craftStage.undo();
    // 前は始めの MOD が外れてアイテムは白に戻り、手順には消した手が残って再生すると別物だった
    craftStage.undo();
    craftStage.addStartMod({ mod: "Wands/IncreasedMana" });
    expect(craftStage.startMods.value.length).toBe(1);
    const r = playPlan(data, craftStage.plan(), {});
    expect(look(r.final)).toEqual(look(craftStage.item.value!));
  });

  // 手で打つ操作を乱数で並べ、手順を再生すると今のアイテムと同じか (2026-10-16 要望 0ce15a82 の調べ。ワンドで遺産のルーン・エッセンス・
  // フラクチャー・骨と発現・お告げ・カタリスト・1 手戻す・工程に戻る・確率機の控えと戻し・共有の続きから打つ・50 手を超える長さ)
  it("ワンドで色々打って戻しても、手順の再生は今のアイテムと同じ", async () => {
    const { loadPatch } = await import("./helpers/patch");
    const { craftStage } = await import("../src/state/craft-stage");
    const { essenceShelf, CRAFT_RUNE_KEYS, ORBS, BONES, CATALYSTS, OMEN_GROUPS } = await import("../src/state/for-share/craft-stage-shelf");
    const { playPlan } = await import("../src/services/craft-stage/run-plan");
    const { mulberry32 } = await import("../src/services/htc/rng");
    const data = await loadPatch();
    craftStage.data.value = data;
    const omens = OMEN_GROUPS.flatMap((g) => g.keys);
    const fails: string[] = [];
    for (let trial = 0; trial < 12; trial++) {
      const rng = mulberry32(1000 + trial);
      const pick = <T,>(a: readonly T[]): T => a[Math.floor(rng() * a.length)]!;
      craftStage.base.value = "Withered Wand";
      craftStage.itemLevel.value = 82;
      craftStage.reset();
      craftStage.omens.value = [];
      let snap: ReturnType<typeof craftStage.snapshot> | null = null;
      const ops: string[] = [];
      for (let i = 0, n = 200 + Math.floor(rng() * 300); i < n; i++) {
        const r = rng();
        if (r < 0.03) { craftStage.undo(); ops.push("undo"); continue; }
        if (r < 0.04 && craftStage.log.value.length > 3) { const idx = pick(craftStage.log.value).out.index; craftStage.goTo(idx); ops.push(`goTo${idx}`); continue; }
        if (r > 0.97) { craftStage.toggleOmen(pick(omens)); ops.push("omen"); continue; }
        if (r > 0.96 && !snap) { snap = craftStage.snapshot(); ops.push("snap"); continue; }
        if (r > 0.955 && snap) { craftStage.restore(snap); snap = null; ops.push("restore"); continue; }
        if (r > 0.95 && craftStage.log.value.length) { craftStage.loadReplay(craftStage.plan(), 9999); craftStage.continueFromReplay(); ops.push("continue"); continue; }
        const keys = [...ORBS.flatMap((g) => g.keys), ...essenceShelf(data, craftStage.item.value).flatMap((g) => g.keys), ...CRAFT_RUNE_KEYS, ...BONES, ...CATALYSTS.slice(0, 3), "reveal:1", "reveal:2", "reveal:3"];
        const k = pick(keys);
        if (craftStage.usable(k)) continue;
        craftStage.use(k, { quiet: true });
        ops.push(k);
      }
      if (!craftStage.log.value.length) continue;
      const a = look(playPlan(data, craftStage.plan(), {}).final), b = look(craftStage.item.value!);
      if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(`trial ${trial}: ${ops.join(",")}`);
    }
    expect(fails).toEqual([]);
  }, 120_000);
});
