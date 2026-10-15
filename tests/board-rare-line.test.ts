// 掲示板の「当たりの速報」の線 (src/services/board/rare-line.ts)。BOARD_LINES_OUT=1 の時は docs/board-rare-lines.md (オーナーの確認用の一覧) を書き出す
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { belowLine, lineOf, MAX_SUM, rareLineOf, RARE_SUM, tierChances, type TierChance } from "../src/services/board/rare-line";
import { baseCatalog, classJa } from "../src/services/items/base-catalog";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { freshItem, playStep } from "../src/services/craft-stage/run-plan";
import { HIT_CUR_RE, rareHitOf } from "../src/services/board/rare-hit";
import type { StageItem } from "../src/services/craft-stage/types";
import { mulberry32 } from "../src/services/htc/rng";
import { jaOfModAlways } from "../src/services/htc/mod-text";

const data = loadPatch();
const modTextJa = (d: typeof data, id: string): string => { const m = d.mods.get(id); return m ? jaOfModAlways(m).replace(/\|/g, "/") : id; };
const T = (p: number, id = "x"): TierChance => ({ modId: id, tierIndex: 0, tierName: "T1", side: "prefix", p });

describe("線の引き方", () => {
  it("T1 を珍しい順に足して和が RARE_SUM を超えない所まで。一番珍しい T1 は必ず入る", () => {
    expect(lineOf([T(0.0001), T(0.0002), T(0.0003), T(0.01)])!.line).toBe(0.0002);
    expect(lineOf([T(0.0012), T(0.003)])!).toMatchObject({ line: 0.0012, count: 1 });
    expect(lineOf([])).toBeNull();
  });
  it("T1 以外の段は見ない (重みの低い系統の下の段で線が上がらない)", () => {
    const low = { ...T(0.00005), tierName: "T6" };
    expect(lineOf([low, T(0.0003)])!.line).toBe(0.0003);
    expect(belowLine(0.00005, "T6", lineOf([low, T(0.0003)]))).toBe(false);
  });
  it("T1 がどれも珍しくない (ジュエル) は流さない", () => {
    expect(lineOf([T(0.012), T(0.013)])).toBeNull();
    expect(rareLineOf(data, "Ruby")).toBeNull();
  });
  it("線ちょうどの確率の段は揃えて入れる", () => {
    const l = lineOf([T(0.0002, "a"), T(0.0002, "b"), T(0.0002, "c"), T(0.01)])!;
    expect(l.count).toBe(3);
    expect(belowLine(0.0002, "T1", l)).toBe(true);
    expect(belowLine(0.00021, "T1", l)).toBe(false);
    expect(belowLine(0.0001, "T1", null)).toBe(false);
  });
  it("指輪の一番珍しい段は 0.1% より上 (一律 0.1% だと流れない、ロードマップの実測 0.124%)", () => {
    const l = rareLineOf(data, "Gold Ring")!;
    expect(l.rarest.p).toBeGreaterThan(0.001);
    expect(l.line).toBe(l.rarest.p);
  });
  it("両手武器は一番珍しい段が 0.1% より下", () => {
    const l = rareLineOf(data, "Hardwood Spear") ?? rareLineOf(data, "Crude Bow")!;
    expect(l.rarest.p).toBeLessThan(0.001);
    expect(l.sum).toBeLessThanOrEqual(RARE_SUM + 1e-12);
  });
  it("付いた瞬間の確率は、白のレアに足す時の確率と同じ (打つ処理の rolled.chance と突き合わせ)", () => {
    const ring = { ...freshItem(data, "Gold Ring", 82), rarity: "rare" as const };
    const ts = tierChances(data, "Gold Ring");
    for (let s = 1; s <= 40; s++) {
      const r = applyCurrency(data, ring, "exalt", mulberry32(s), []);
      const got = r.rolled![0]!;
      const t = ts.find((x) => x.modId === got.modId && x.tierName === got.tierName)!;
      expect(got.chance).toBeCloseTo(t.p, 12);
    }
  });
});

describe("打った手から札を作る (rare-hit.ts)", () => {
  const playOn = (it: StageItem, key: string, seed: number) => playStep(data, it, key, { index: 1, seed, price: () => 0, cumulative: 0 });
  it("高貴で T1 の線以下を引いた時だけ札。見込みは線の和と合う", () => {
    const ring = { ...freshItem(data, "Gold Ring", 82), rarity: "rare" as const };
    const line = rareLineOf(data, "Gold Ring")!;
    let hits = 0;
    const N = 20000;
    for (let s = 1; s <= N; s++) {
      const h = rareHitOf(data, playOn(ring, "exalt", s), 7);
      if (!h) continue;
      hits++;
      expect(h).toMatchObject({ base: "Gold Ring", ilvl: 82, cur: "exalt", n: 7 });
      expect(h.p).toBeLessThanOrEqual(line.line * (1 + 1e-9));
      expect(data.mods.get(h.modId)!.tiers.length - h.ti).toBe(1);
    }
    expect(hits / N).toBeGreaterThan(line.sum * 0.6);
    expect(hits / N).toBeLessThan(line.sum * 1.4);
  });
  it("札にしない手: 指名・エッセンス・骨・打てなかった手", () => {
    const ring = { ...freshItem(data, "Gold Ring", 82), rarity: "rare" as const };
    for (let s = 1; s <= 300; s++) {
      expect(rareHitOf(data, playOn(ring, "desecrate", s), 1)).toBeNull();
      expect(rareHitOf(data, playOn(freshItem(data, "Gold Ring", 82), "exalt", s), 1)).toBeNull();
    }
    expect(HIT_CUR_RE.test("chaos_perfect")).toBe(true);
    expect(HIT_CUR_RE.test("essence:x")).toBe(false);
  });
});

// オーナーの確認用の一覧 (BOARD_LINES_OUT=1 npx vitest run tests/board-rare-line.test.ts)
it.runIf(process.env.BOARD_LINES_OUT === "1")("docs/board-rare-lines.md を書き出す", () => {
  const rows = baseCatalog(data, false);
  const byCls = new Map<string, { bases: string[]; line: ReturnType<typeof rareLineOf> }>();
  const none = new Map<string, number>();
  for (const r of rows) {
    const l = rareLineOf(data, r.en);
    if (!l) { none.set(r.cls, (none.get(r.cls) ?? 0) + 1); continue; }
    const key = `${r.cls}|${l.line.toFixed(12)}|${l.rarest.modId}|${l.count}`;
    const cur = byCls.get(key) ?? { bases: [], line: l };
    cur.bases.push(r.ja);
    byCls.set(key, cur);
  }
  const pct = (p: number): string => `${(p * 100).toFixed(p < 0.0001 ? 4 : 3)}%`;
  const lines = [...byCls.entries()].map(([k, v]) => ({ cls: k.split("|")[0]!, ...v })).sort((a, b) => a.cls.localeCompare(b.cls));
  const out = [
    "# 掲示板の「当たりの速報」の線 (ベースごと)",
    "",
    "src/services/board/rare-line.ts が自動で出した線の一覧 (オーナーの確認用)。書き出し: `BOARD_LINES_OUT=1 npx vitest run tests/board-rare-line.test.ts`",
    "",
    "- 白のベース (アイテムレベル 82) をレアにして、高貴のオーブで 1 つ足す時の段ごとの確率から引く",
    `- 各 MOD の T1 を珍しい順に足し、確率の和が ${pct(RARE_SUM)} (= ${Math.round(1 / RARE_SUM).toLocaleString()} 回に 1 回) を超えない所までを「クソレア」にする。一番珍しい T1 は必ず入る (同じ確率の T1 はまとめて入る)`,
    "- T1 だけを見る: 下の段も入れると、重みの低い系統 (ベルト・靴の混沌耐性) は T6〜T1 が同じ確率で 6 段まとめて入り、80 回に 1 回流れた",
    `- T1 の和が ${pct(MAX_SUM)} を超える (珍しい段が無い) ベースは流さない: ジュエル (全部の MOD がほぼ同じ確率)`,
    "- エミュレーターで T1 が付いて、付いた瞬間の確率が「線」以下なら、名前を出さずにタイムラインへ札を出す (変成・増強・王者・錬金・高貴・カオスの乱数で付いた MOD だけ。指名・エッセンス・骨は出さない)",
    "- 「見込み」= 白のレアに 1 回足して流れる確率 (MOD が付いているほど他の段の確率が上がるので、実際はこれより少し流れにくい)",
    "- 同じ部位で線が同じベースは 1 行にまとめた",
    "",
    "| 部位 | 線 | 一番珍しい段 | 段の数 | 見込み | ベース |",
    "|---|---|---|---|---|---|",
    ...lines.map((x) => {
      const r = x.line!.rarest;
      return `| ${classJa(x.cls)} | ${pct(x.line!.line)} | ${modTextJa(data, r.modId)} ${r.tierName} (${pct(r.p)}) | ${x.line!.count} | 1/${Math.round(1 / x.line!.sum).toLocaleString()} | ${x.bases.length > 4 ? `${x.bases.slice(0, 4).join("・")} ほか ${x.bases.length - 4}` : x.bases.join("・")} |`;
    }),
    "",
    "## 流さない部位",
    "",
    ...[...none.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([c, n]) => `- ${classJa(c)} (${n} ベース)`),
    "",
  ];
  writeFileSync("docs/board-rare-lines.md", out.join("\n"));
});
