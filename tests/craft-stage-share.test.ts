// 手順の共有 (2026-10-12 オーナー): 手順を URL の # に縮めて入れる (サーバー・KV は使わない)。
// 縮めて戻すと同じ手順、受け取った側の再生で同じ結果。最初のカレンシーの後に手で MOD を足していたら共有できない
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { decodeShare, encodeShare, shareBlock, shareCodeOf } from "../src/services/craft-stage/share";
import { forceKey } from "../src/services/craft-stage/apply-force";
import { qualitySetKey } from "../src/services/craft-stage/apply-currency";
import { playPlan } from "../src/services/craft-stage/run-plan";
import type { StageItem } from "../src/services/craft-stage/types";

const data = loadPatch();
const idOf = (base: string, re: RegExp): string => [...data.mods.values()].find((m) => m.id.startsWith(`${base}/`) && m.source === "normal" && re.test(m.id))!.id;
const look = (it: StageItem) => ({
  rarity: it.rarity, quality: it.quality ?? 0, sockets: it.sockets ?? 0, rollSeed: it.rollSeed,
  mods: [...it.prefixes, ...it.suffixes].map((m) => `${m.modId}#${m.tierIndex}:${JSON.stringify(m.values ?? null)}${m.fractured ? "f" : ""}${m.desecrated ? "d" : ""}${m.unrevealed ? "u" : ""}`),
});
const steps = (...keys: string[]) => keys.map((currency, i) => ({ currency, index: i + 1 }));

describe("共有できるか (shareBlock)", () => {
  const f = forceKey("Rings/IncreasedLife", "T1", "n");
  it("打つ前に手で足した MOD は始めのベースなので共有できる", () => {
    expect(shareBlock(steps(f, f, "regal", "exalt"))).toBeNull();
    expect(shareBlock(steps("transmute", "augment"))).toBeNull();
  });
  it("打ち始めた後に手で MOD を足したら共有できない", () => {
    expect(shareBlock(steps(f, "regal", f))).toMatch(/手で足している/);
    expect(shareBlock(steps("transmute", forceKey("Rings/IncreasedLife", null, "x")))).toMatch(/手で足している/);
  });
  it("品質を合わせる手は打った数に入れない。何も打っていない・最初の手が消えた手順は共有できない", () => {
    expect(shareBlock(steps(qualitySetKey(20), f, "exalt"))).toBeNull();
    expect(shareBlock([])).toMatch(/まだ/);
    expect(shareBlock(steps(f))).toMatch(/まだ/);
    expect(shareBlock([{ currency: "exalt", index: 7 }, { currency: "exalt", index: 8 }])).toMatch(/50 手/);
  });
});

describe("URL に縮める (encodeShare / decodeShare)", () => {
  it("手で打った手順 → URL → 戻すと同じ手順、再生で同じアイテム (始めの MOD・打つ前に手で足した MOD・お告げ・カタリスト込み)", async () => {
    const { craftStage } = await import("../src/state/craft-stage");
    craftStage.data.value = data;
    craftStage.base.value = "Gold Ring";
    craftStage.itemLevel.value = 82;
    craftStage.reset();
    craftStage.addStartMod({ mod: "IncreasedLife", tier: "T2" });
    craftStage.use(forceKey(idOf("Rings", /FireResistance$/), "T1", "n"));
    for (const k of ["regal", "exalt", "exalt"]) craftStage.use(k);
    craftStage.toggleOmen("OmenofWhittling");
    craftStage.use("chaos");
    const { CATALYSTS } = await import("../src/state/for-share/craft-stage-shelf");
    const cat = CATALYSTS.find((k) => craftStage.usable(k) == null)!;
    craftStage.use(cat);
    expect(craftStage.log.value[craftStage.log.value.length - 1]!.after.quality ?? 0).toBeGreaterThan(0);
    expect(craftStage.shareWhy.value).toBeNull();
    const plan = craftStage.sharePlan();
    const code = await encodeShare(plan);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = await decodeShare(code);
    expect(back.base).toBe(plan.base);
    expect(back.seed).toBe(plan.seed);
    expect((back as { start?: unknown }).start).toEqual((plan as { start?: unknown }).start);
    expect(back.steps.map((s) => [s.currency, s.omen ?? null, s.times ?? 1, (s as { seed?: number }).seed])).toEqual(plan.steps.map((s) => [s.currency, s.omen ?? null, s.times ?? 1, (s as { seed?: number }).seed]));
    expect(back.steps.some((s) => s.omen === "OmenofWhittling")).toBe(true);
    const { final, steps: played } = playPlan(data, back, {});
    expect(look(final)).toEqual(look(craftStage.item.value!));
    // 手ごとも同じ (カタリストは再生だと 1 個ずつの手に分かれるので、その前まで)
    const n = craftStage.log.value.length - 1;
    expect(played.slice(0, n).map((p) => look(p.after))).toEqual(craftStage.log.value.slice(0, n).map((p) => look(p.after)));

    // 打ち始めた後に手で足すと押せない
    // (足す枠は乱数次第で埋まっているので、必ず効く「手で外す」で。どちらも force: の手)
    const n0 = craftStage.log.value.length;
    craftStage.use(forceKey(craftStage.item.value!.prefixes[0]?.modId ?? craftStage.item.value!.suffixes[0]!.modId, null, "x"));
    expect(craftStage.log.value.length).toBe(n0 + 1);
    expect(craftStage.shareWhy.value).toMatch(/手で足している/);
  });

  it("受け取った側: 再生で前後に送れて、ここから打つで手で打つ方へ続く", async () => {
    const { craftStage } = await import("../src/state/craft-stage");
    craftStage.reset();
    for (const k of ["transmute", "augment", "regal", "exalt"]) craftStage.use(k);
    const want = look(craftStage.item.value!);
    const plan = await decodeShare(await encodeShare(craftStage.sharePlan()));
    craftStage.reset();
    craftStage.loadReplay(plan, 9999, true);
    expect(craftStage.replay.value?.shared).toBe(true);
    expect(look(craftStage.item.value!)).toEqual(want);
    expect(craftStage.replayLength.value).toBe(4);
    craftStage.replayTo(1);
    expect(craftStage.log.value.length).toBe(1);
    expect(craftStage.item.value!.rarity).toBe("magic");
    craftStage.replayTo(99);
    expect(look(craftStage.item.value!)).toEqual(want);
    // 再生中でも、その手順をそのまま共有し直せる
    expect(craftStage.shareWhy.value).toBeNull();
    craftStage.replayTo(3);
    craftStage.continueFromReplay();
    expect(craftStage.replay.value).toBeNull();
    craftStage.use("exalt");
    expect(craftStage.log.value.length).toBe(4);
    craftStage.undo();
    expect(craftStage.log.value.length).toBe(3);
  });

  it("# の形", () => {
    expect(shareCodeOf("#share=abc_-9")).toBe("abc_-9");
    expect(shareCodeOf("#migrate=abc")).toBeNull();
    expect(shareCodeOf("")).toBeNull();
  });
  it("壊れた中身は読めないと返す", async () => {
    await expect(decodeShare("AAAA")).rejects.toThrow();
  });
});
