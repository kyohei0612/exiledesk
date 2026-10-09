// 履歴の手を押してその手の直後に戻る (2026-10-09 オーナー「工程クリックしてもそこの工程に戻れない」)
import { describe, expect, it } from "vitest";

describe("craftStage.goTo", () => {
  it("押した手の直後の状態に戻り、その後に打つと先の手は捨てる。1 手戻すとも食い違わない", async () => {
    const { loadPatch } = await import("./helpers/patch");
    const { craftStage } = await import("../src/state/craft-stage");
    craftStage.data.value = await loadPatch();
    craftStage.base.value = "Gold Ring";
    craftStage.itemLevel.value = 82;
    craftStage.reset();
    for (const k of ["transmute", "augment", "regal", "exalt", "exalt"]) craftStage.use(k);
    const log = craftStage.log.value;
    expect(log.length).toBe(5);
    const idx = log.map((s) => s.out.index);

    craftStage.goTo(idx[1]!);
    expect(craftStage.log.value.length).toBe(2);
    expect(craftStage.item.value).toBe(log[1]!.after);

    // 最後の手 / 無い手を押しても動かない
    craftStage.goTo(idx[1]!);
    craftStage.goTo(9999);
    expect(craftStage.log.value.length).toBe(2);

    // 1 手戻すは押した手の前へ
    craftStage.undo();
    expect(craftStage.item.value).toBe(log[0]!.after);

    // 打ち直すと先の手は捨てて続きの番号で積む
    craftStage.use("augment");
    expect(craftStage.log.value.length).toBe(2);
    expect(craftStage.log.value[0]).toBe(log[0]);
    expect(craftStage.log.value[1]).not.toBe(log[1]);
  });
});
