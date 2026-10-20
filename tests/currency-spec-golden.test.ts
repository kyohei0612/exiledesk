/**
 * カレンシーの結果の控え (2026-10-16、ADR-004 の 5 段目)。
 * 説明文の分解 (spec/) に切り替えて、今の関数 (例外を書き足した作り) を消す前に、両方が同じだと確かめた結果を手の種類ごとのハッシュで控えた
 * (一言の順だけ違う物・説明文どおりに直した物は新しい作りの方)。
 * 控えと違ったら、打った結果が変わったということ。わざと変えた時 (ゲームでの確認・説明文の変更) は控えを取り直す:
 *   GOLDEN_WRITE=1 pnpm vitest run tests/currency-spec-golden
 * 正解の出どころは外 (説明文・クライアント・オーナーのゲームでの確認) で、これは「変わっていないか」の見張りだけ
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BASES, canon, data, moreStatesOf, statesOf } from "./helpers/spec-parity";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { mulberry32 } from "../src/services/htc/rng";
import { ALL_OMEN_SPECS } from "../src/services/craft-stage/spec/run-spec";
import { ORB_SPECS } from "../src/services/craft-stage/spec/orb-specs";
import { BONE_SPECS, ANNUL_SPEC } from "../src/services/craft-stage/spec/desecrate-specs";
import { ARTIFICER_SPEC, CATALYST_SPECS, QUALITY_SPECS } from "../src/services/craft-stage/spec/other-specs";
import { essenceShelf } from "../src/state/emulator/craft-stage-shelf";
import { runeKeys } from "../src/services/craft-stage/stage-runes";
import type { StageItem } from "../src/services/craft-stage/types";

const FILE = new URL("./golden/currency-golden.json", import.meta.url);
const WRITE = process.env.GOLDEN_WRITE === "1";

/** 手の種類 → その手に掛かるお告げ (1 つずつ) と、何も掛けない時 */
function omenSets(kind: string): string[][] {
  return [[], ...ALL_OMEN_SPECS.filter((o) => o.appliesTo === kind).map((o) => [o.key])];
}
const RUNES = [...runeKeys("lesser").slice(0, 3), ...runeKeys("greater").slice(0, 2), ...runeKeys("special"), ...runeKeys(undefined, "soulcore").slice(0, 3), "rune:Masterwork Rune", `${runeKeys("normal")[0]}@1`];
const states = (base: string): Array<[string, StageItem]> => [...statesOf(base, 82), ...statesOf(base, 35), ...moreStatesOf(base, 82)];

/** 手の組 (名前 → 打つ物の並び)。キーは打つアイテムごとに決まる物もある (エッセンス) */
const GROUPS: Record<string, (item: StageItem) => Array<{ key: string; kind: string }>> = {
  orbs: () => ORB_SPECS.map((s) => ({ key: s.stageKey, kind: s.kind })),
  bones: () => [...new Set(BONE_SPECS.map((s) => s.stageKey))].map((key) => ({ key, kind: "desecrate" })),
  reveal: () => ["reveal:1", "reveal:2", "reveal:3", "reveal:1:reroll", "reveal:9"].map((key) => ({ key, kind: "reveal" })),
  annul: () => [{ key: ANNUL_SPEC.stageKey, kind: ANNUL_SPEC.kind }],
  essence: (item) => [...essenceShelf(data, item).flatMap((g) => g.keys).slice(0, 40), "essence:breach"].map((key) => ({ key, kind: /^essence:(perfect|breach)/.test(key) ? "essence_perfect" : "essence" })),
  other: () => [...QUALITY_SPECS, ...CATALYST_SPECS, ARTIFICER_SPEC].map((s) => ({ key: s.stageKey, kind: s.kind })).concat(RUNES.map((key) => ({ key, kind: "rune" }))),
};

function hashGroup(name: string): { hash: string; n: number } {
  const h = createHash("sha256");
  let n = 0;
  for (const base of BASES) for (const [, item] of states(base)) {
    for (const { key, kind } of GROUPS[name]!(item)) for (const omens of omenSets(kind)) {
      const r = applyCurrency(data, item, key, mulberry32(20261016), omens);
      h.update(canon({ key, omens, a: r.applied, i: r.item, ad: r.added, rm: r.removed, u: r.omensUsed ?? [], ro: r.rolled ?? [], no: r.note ?? "", c: r.count ?? 1, au: r.augment ?? null, rs: r.reason ?? "", x: !!r.random }));
      n++;
      // 手順の再生の形 (触媒は 1 個ずつ)
      if (kind === "catalyst") {
        const r1 = applyCurrency(data, item, key, mulberry32(1), omens, { oneCatalyst: true });
        h.update(canon({ a: r1.applied, i: r1.item, rs: r1.reason ?? "" }));
      }
    }
  }
  return { hash: h.digest("hex"), n };
}

describe("カレンシーの結果の控え", () => {
  const saved: Record<string, { hash: string; n: number }> = (() => { try { return JSON.parse(readFileSync(FILE, "utf8")); } catch { return {}; } })();
  const out: Record<string, { hash: string; n: number }> = {};
  for (const name of Object.keys(GROUPS)) {
    it(name, () => {
      const now = hashGroup(name);
      out[name] = now;
      if (WRITE) {
        writeFileSync(FILE, JSON.stringify({ ...saved, ...out }, null, 1) + "\n");
        return;
      }
      expect(now, `${name}: 打った結果が控えと違う (わざとなら GOLDEN_WRITE=1 で取り直す)`).toEqual(saved[name]);
    });
  }
});
