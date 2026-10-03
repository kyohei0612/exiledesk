/**
 * 計算機: 特別な MOD のルーンを差す時機 (2026-10-03、防具・武器への拡張 その 3)
 * コルの狩りを最初から差すと、マークスマンの MOD が全部の抽選の分母に入り、普通の狙いが出にくい。普通の狙いを先に作り、
 * マークスマンを狙う直前に差す (socket の手) 形を比べられるようにする
 */
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { itemBaseFor } from "../src/services/htc/bridge";
import { withRunes } from "../src/vendor/poe2htc/engine/runes";
import { simulateTree, type SimNode, type SimState } from "../src/services/htc/sim-route";
import { autoTree } from "../src/views/htc-craft/tree-auto";
import type { Prices } from "../src/vendor/poe2htc/optimizer/cost";

const data = loadPatch();
const raw = itemBaseFor(data, "Barbed Bracers")!;
const cls = withRunes(raw, ["kolrs-hunt"]);
const LIFE = "Gloves_dex/IncreasedLife", PS = "Gloves_dex/Rune_marksman_ProjectileSpeed";
const prices = { currency: { divine: 1000, exalt: 1, annul: 0 }, omens: { OmenofSinistralExaltation: 0, OmenofSinistralAnnulment: 0 } } as unknown as Prices;
const ctx = { data, cls, rawCls: raw, prices, itemLevel: 82, limits: { prefix: 3, suffix: 3 }, catalystOk: () => false, socketCost: 30 };
const start: SimState = { breach: false, slots: [] };
/** 左側の高貴 → 外れは左側の消去、でライフ T1 まで (回数 = 高貴の数) */
const lifeLoop = (withSocketAfter: boolean): SimNode[] => [
  { id: "x", action: { kind: "exalt", tier: "exalt", side: "prefix", catalyst: null }, targets: [{ modId: LIFE, minTier: data.mods.get(LIFE)!.tiers.length - 1 }], keep: [], clean: false, onHit: withSocketAfter ? "s" : "done", onMiss: "a" },
  { id: "a", action: { kind: "annul", side: "prefix" }, targets: [], keep: [], clean: false, onHit: "x", onMiss: "x" },
  ...(withSocketAfter ? [{ id: "s", action: { kind: "socket" as const }, targets: [], keep: [], clean: false, onHit: "done", onMiss: null }] : []),
];

describe("ルーンを差す時機", () => {
  it("差す前はルーンの置き場無しで引くので、ライフ T1 が早く出る (差す手で代を払う)", () => {
    const early = simulateTree({ ctx, start, nodes: lifeLoop(false), runs: 3000 });
    const late = simulateTree({ ctx, start, nodes: lifeLoop(true), runs: 3000 });
    expect(early.pDone).toBe(1);
    expect(late.pDone).toBe(1);
    // どちらもルーンの代 30 は 1 度。早く差す方は分母が大きいぶん高貴が多い
    expect(late.perDone).toBeLessThan(early.perDone);
  });
  it("自動で組む: lateSocket を渡すと、マークスマンを狙う手の前に差す手", () => {
    const base = { data, prices, targets: [{ modId: LIFE, minTierIndex: 0 }, { modId: PS, minTierIndex: 0 }], fixedIds: [], qualityTag: null, limits: { prefix: 3, suffix: 3 }, startCount: { prefix: 0, suffix: 0 }, startLoose: { prefix: 0, suffix: 0 }, chaosOk: false };
    // ルーンの MOD は最後の冒涜で取る (差した後なら冒涜の 3 択に出る)
    const nodes = autoTree({ ...base, lateSocket: [PS], desecratePick: PS } as never);
    const kinds = nodes.map((n) => n.action?.kind);
    expect(kinds).toContain("socket");
    expect(kinds.indexOf("socket")).toBeLessThan(nodes.findIndex((n) => n.targets.some((t) => t.modId === PS)));
    expect(autoTree(base as never).map((n) => n.action?.kind)).not.toContain("socket");
  });
});
