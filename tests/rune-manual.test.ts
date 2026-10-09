// ルーンの特殊 MOD (2026-10-09 オーナー): 差していなければ 0%、手で付けたらルーンも差す、ソケットから外せる
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { forceKey } from "../src/services/craft-stage/apply-force";
import { modListFor } from "../src/services/craft-stage/mod-list";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { stageRuneIds } from "../src/services/craft-stage/stage-core";
import { unsocketKey } from "../src/services/craft-stage/stage-runes";
import { mulberry32 } from "../src/services/htc/rng";

const data = loadPatch();

describe("ルーンの特殊 MOD", () => {
  let gloves = freshItem(data, "Riveted Mitts", 82);
  gloves = applyCurrency(data, gloves, "transmute", mulberry32(1)).item;
  gloves = applyCurrency(data, gloves, "regal", mulberry32(2)).item;
  gloves = applyCurrency(data, gloves, "artificer", mulberry32(3)).item;
  const runeMod = [...gloves.cls.pools.rune!["kolrs-hunt"]!.prefixes, ...gloves.cls.pools.rune!["kolrs-hunt"]!.suffixes][0]!;

  it("差していないルーンの MOD は一覧で 0%", () => {
    const rows = modListFor(data, gloves).filter((r) => r.group === "rune" && !r.socketed);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.share === 0)).toBe(true);
  });
  it("手で付けるとルーンも差さり、ソケットから外せる", () => {
    expect(gloves.sockets).toBeGreaterThan(0);
    const r = applyCurrency(data, gloves, forceKey(runeMod, null, "n"), mulberry32(4));
    expect(r.applied).toBe(true);
    expect(stageRuneIds(r.item)).toContain("kolrs-hunt");
    expect([...r.item.prefixes, ...r.item.suffixes].some((m) => m.modId === runeMod)).toBe(true);
    const off = applyCurrency(data, r.item, unsocketKey(1), mulberry32(5));
    expect(off.applied).toBe(true);
    expect(off.item.augments ?? []).toHaveLength(0);
  });
});
