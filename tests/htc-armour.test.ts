/**
 * クラフト計算機の防具・武器への拡張 その 1: 手袋の特別な MOD (コルの狩り = マークスマン / カトラの陰鬱 = 腐敗) (2026-10-03)
 *
 * オーナー決定: 最初は手袋。仕組み (pools.rune → withRunes → 計算機の base) は兜・鎧・靴・武器にもそのまま効く作りで、
 * 画面に出すのは手袋で確かめてから。特別な MOD の重みはクライアントのデータに無いのでエンジンの仮の値 (1000) のまま、画面で断る。
 * 買うベースのソケットは全部 2 (規格外)
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { loadPatch } from "./helpers/patch";
import { usePicker } from "../src/views/htc-craft/usePicker";
import { itemBaseFor } from "../src/services/htc/bridge";
import { withRunes } from "../src/vendor/poe2htc/engine/runes";
import {
  NO_SOCKET, SOCKET_RUNES, SPECIAL_RUNE_ON_SCREEN, effectiveSocket, poolRuneIds, requiredRunes, socketBlock, socketCostOf,
  socketRunesFor, socketsNeeded, withRequired, type SocketPick,
} from "../src/services/htc/sockets";
import { tradeCategoryOf } from "../src/services/htc/buy-or-craft";
import { simulateTree, type SimNode, type SimState } from "../src/services/htc/sim-route";
import { tierWeight } from "../src/services/mods/mod-rules";
import { parseJaItem, targetsFor } from "../src/services/htc/paste";
import { fillHashes, jaOfMod } from "../src/services/htc/mod-text";
import { tierDisplayRanges } from "../src/services/mods/stat-scale";
import type { ItemBase } from "../src/vendor/poe2htc/engine/types";
import type { Prices } from "../src/vendor/poe2htc/optimizer/cost";
import bases from "../src/vendor/poe2htc/data/base_items.json";
import extra from "../src/services/htc/extra-bases.json";

const data = loadPatch();
type RawItem = { id: string; category: string; bases: string[]; pools: { rune?: Record<string, { prefixes: string[]; suffixes: string[] }> } };
const ITEMS = (bases as unknown as { items: RawItem[] }).items;
const GLOVES = ITEMS.filter((x) => x.category === "Gloves");
const KOLR = "kolrs-hunt", KATLA = "katlas-gloom";

/** その手袋の行の、ベースから選ぶ道の候補 */
function pickerRows(baseName: string) {
  const pk = usePicker();
  pk.useData(data);
  pk.chooseBase(data, baseName);
  return pk.modRows.value;
}

describe("ベースから選ぶ: オーグメント (コルの狩り 等) の種類", () => {
  it("手袋の 6 つの属性の行すべてに、コルでマークスマン・カトラで腐敗の系統が並び、数がデータどおり", () => {
    expect(GLOVES.length).toBe(6);
    for (const g of GLOVES) {
      const rows = pickerRows(g.bases[0]!);
      for (const rune of [KOLR, KATLA]) {
        const pool = g.pools.rune?.[rune];
        expect(pool, `${g.id} ${rune}`).toBeDefined();
        const got = rows.filter((r) => r.group === "rune" && r.rune === rune);
        expect(got.map((r) => r.modId).sort(), `${g.id} ${rune}`).toEqual([...pool!.prefixes, ...pool!.suffixes].sort());
        expect(got.filter((r) => r.side === "P").length).toBe(pool!.prefixes.length);
        expect(got.every((r) => r.runeJa && r.runeJa !== rune)).toBe(true);
      }
      // マークスマン = 投射物、腐敗 = 状態異常の系統
      expect(rows.some((r) => r.rune === KOLR && r.modId.endsWith("Rune_marksman_ProjectileSpeed"))).toBe(true);
      expect(rows.some((r) => r.rune === KATLA && r.modId.endsWith("Rune_decay_PoisonEffect"))).toBe(true);
    }
  });
  it("出やすさは、差した時の高貴・カオスの抽選 (普通 + そのルーン) の中の割合", () => {
    const rows = pickerRows("Barbed Bracers");
    const ps = rows.find((r) => r.modId === "Gloves_dex/Rune_marksman_ProjectileSpeed")!;
    const totalP = rows.filter((r) => r.side === "P" && (r.group === "normal" || r.rune === KOLR)).reduce((a, r) => a + r.weight, 0);
    expect(ps.share).toBeCloseTo(ps.weight / totalP, 10);
    expect(ps.weight).toBe(3000); // ilvl 82 で 3 ティア × 仮の 1000
  });
  it("盾・指輪には出ない (差せる部位でない)", () => {
    for (const name of ["Aged Tower Shield", "Amethyst Ring"]) {
      expect(pickerRows(name).filter((r) => r.group === "rune")).toEqual([]);
    }
  });
});

describe("ソケット: 特別な MOD のルーン", () => {
  const pick = (p: Partial<SocketPick>): SocketPick => ({ ...NO_SOCKET, ...p });
  it("6 種ともソケットバウンド、差せる部位はエンジンのルーンの表", () => {
    const sp = SOCKET_RUNES.filter((r) => r.pool);
    expect(sp.map((r) => r.key).sort()).toEqual(["katla", "kolr", "medved", "thrud", "uhtred", "vorana"]);
    expect(sp.every((r) => r.bound && !r.corruptOk)).toBe(true);
    expect(sp.find((r) => r.key === "kolr")!.categories).toEqual(["Gloves"]);
    expect(sp.find((r) => r.key === "kolr")!.effect).toContain("マークスマン");
  });
  it("2 ソケットに コル + カトラ + セール は穴が足りない / コル + アストリッドは組める", () => {
    const kk = pick({ kolr: true, katla: true });
    expect(socketsNeeded(kk)).toBe(2);
    expect(socketBlock("Gloves", false, kk, "serle")).toContain("穴が足りない");
    expect(socketBlock("Gloves", false, pick({ kolr: true, serle: true }), "katla")).toContain("穴が足りない");
    // アストリッドは置き換えられる (先にアストリッドでクラフト → コルで置き換え) ので、穴は 1 つで足りる
    const ka = pick({ kolr: true, astrid: true });
    expect(socketsNeeded(ka)).toBe(1);
    expect(socketBlock("Gloves", false, pick({ kolr: true }), "astrid")).toBeNull();
    expect(socketBlock("Gloves", false, pick({ kolr: true, astrid: true }), "serle")).toBeNull();
  });
  it("盾・指輪・兜には差せない。画面に出すのは手袋だけ (他の部位は確かめてから)", () => {
    expect(socketBlock("Shields", false, NO_SOCKET, "kolr")).toContain("差せない");
    expect(socketBlock("Rings", false, NO_SOCKET, "kolr")).not.toBeNull();
    expect(socketBlock("Helmets", false, NO_SOCKET, "kolr")).toContain("差せない");
    expect(effectiveSocket("Shields", false, pick({ kolr: true })).kolr).toBeUndefined();
    expect(socketRunesFor("Gloves").map((r) => r.key)).toEqual(["astrid", "serle", "kolr", "katla"]);
    expect(socketRunesFor("Helmets").map((r) => r.key)).toEqual(["astrid", "serle"]);
    expect([...SPECIAL_RUNE_ON_SCREEN]).toEqual(["Gloves"]);
  });
  it("狙いに特別な MOD があれば、そのルーンは差したまま (外せない)", () => {
    const req = requiredRunes(data, ["Gloves_dex/Rune_marksman_ProjectileSpeed", "Gloves_dex/IncreasedLife"]);
    expect(req).toEqual(["kolr"]);
    const on = effectiveSocket("Gloves", false, withRequired(NO_SOCKET, req));
    expect(on.kolr).toBe(true);
    expect(poolRuneIds(on)).toEqual([KOLR]);
  });
  it("代はルーンの相場 (rune:<id>)、規格外 (2 ソケット) なら熟練工のオーブは要らない。相場に無ければ作れない扱い", () => {
    const p = { currency: { "rune:kolrs-hunt": 30, artificer: 1 }, omens: {} } as unknown as Prices;
    const c = socketCostOf(p, pick({ kolr: true }));
    expect(c.total).toBe(30);
    expect(c.lines.length).toBe(1);
    expect(socketCostOf({ currency: {}, omens: {} } as unknown as Prices, pick({ katla: true })).total).toBe(Infinity);
  });
});

describe("シミュレーター: コル込みで回る", () => {
  const raw = itemBaseFor(data, "Barbed Bracers")!;
  const cls: ItemBase = withRunes(raw, [KOLR]);
  const PS = "Gloves_dex/Rune_marksman_ProjectileSpeed";
  it("withRunes でマークスマンの MOD が高貴・カオスのプールに入る (差さなければ入らない)", () => {
    expect(raw.pools.normal.prefixes).not.toContain(PS);
    expect(cls.pools.normal.prefixes).toContain(PS);
    expect(cls.pools.normal.prefixes.length).toBe(raw.pools.normal.prefixes.length + raw.pools.rune![KOLR]!.prefixes.length);
  });
  it("右側の高貴 → 外れは消去、で投射物速度が出るまでの回数が、仮の重み (1 ティア 1000) どおりの確率に合う", () => {
    const D = 500;
    const prices = {
      currency: { divine: D, exalt: 1, annul: 2, "rune:kolrs-hunt": 30 },
      omens: { OmenofSinistralExaltation: 1, OmenofSinistralAnnulment: 1 },
    } as unknown as Prices;
    const lv = 82;
    const ctx = { data, cls, prices, itemLevel: lv, limits: { prefix: 3, suffix: 3 }, catalystOk: () => false, socketCost: socketCostOf(prices, { ...NO_SOCKET, kolr: true }).total };
    const start: SimState = { breach: false, slots: [] };
    const nodes: SimNode[] = [
      { id: "x", action: { kind: "exalt", tier: "exalt", side: "prefix", catalyst: null }, targets: [{ modId: PS, minTier: 0 }], keep: [], clean: false, onHit: "done", onMiss: "a" },
      { id: "a", action: { kind: "annul", side: "prefix" }, targets: [], keep: [], clean: false, onHit: "x", onMiss: "x" },
    ];
    const r = simulateTree({ ctx, start, nodes, runs: 4000 });
    expect(r.pDone).toBe(1);
    // 空の手袋のプレに 1 つ足す確率 = 投射物速度の重み / (普通のプレ + コルのプレ の重み)
    const w = (id: string): number => tierWeight(data.mods.get(id)!, 0, lv);
    const p = w(PS) / cls.pools.normal.prefixes.reduce((a, id) => a + w(id), 0);
    expect(w(PS)).toBe(3000);
    const tries = r.perNode[0]!.tries;
    expect(Math.abs(tries - 1 / p) / (1 / p)).toBeLessThan(0.1);
    // ルーンの代は 1 回の作成に 1 度
    expect(r.socketCost).toBe(30);
  });
});

describe("貼り付け: ルーンの MOD は「そのルーンを差したまま作る」狙いに", () => {
  it("手袋の投射物速度 (コル) は狙いに入り、狙いからコルが要ると分かる", () => {
    const m = data.mods.get("Gloves_dex/Rune_marksman_ProjectileSpeed")!;
    const t = m.tiers[m.tiers.length - 1]!;
    const line = fillHashes(jaOfMod(m), tierDisplayRanges(t).map(([lo]) => [lo!, lo!]));
    const text = [
      "アイテムクラス: 手袋",
      "レアリティ: レア",
      "テストの手",
      (extra as unknown as { baseInfo: Record<string, { ja: string }> }).baseInfo["Barbed Bracers"]?.ja ?? "Barbed Bracers",
      "--------",
      "アイテムレベル: 82",
      "--------",
      line.replace(/[()]/g, "").replace(/(\d+)-\1/, "$1"),
    ].join("\n");
    const item = parseJaItem(text);
    expect(item.baseType).toBe("Barbed Bracers");
    const got = targetsFor(data, item);
    expect(got.targets.map((x) => x.modId)).toContain("Gloves_dex/Rune_marksman_ProjectileSpeed");
    expect(requiredRunes(data, got.targets.map((x) => x.modId))).toEqual(["kolr"]);
  });
});

// 取引所のフィルタ表 (data-cache/trade2-filters-jp.json) は git に入っていない手元の写し。CI では無いので、その時は飛ばす
const FILTERS = "data-cache/trade2-filters-jp.json";
describe("取引所のカテゴリ (buy-or-craft の TRADE_CATEGORY)", () => {
  it.skipIf(!existsSync(FILTERS))("エンジンの全クラスが埋まっていて、取引所の選択肢にある値", () => {
    const raw = JSON.parse(readFileSync(FILTERS, "utf-8")) as unknown;
    const ids = new Set<string>();
    const walk = (x: unknown): void => {
      if (Array.isArray(x)) { x.forEach(walk); return; }
      if (x && typeof x === "object") {
        const o = x as Record<string, unknown>;
        if (o.id === "category" && o.option) for (const op of (o.option as { options: Array<{ id: string | null }> }).options) if (op.id) ids.add(op.id);
        Object.values(o).forEach(walk);
      }
    };
    walk(raw);
    const cats = new Set([...ITEMS, ...(extra as unknown as { items: RawItem[] }).items].map((x) => x.category));
    expect(cats.size).toBeGreaterThanOrEqual(21);
    for (const c of cats) {
      const v = tradeCategoryOf({ category: c } as ItemBase);
      expect(v, c).not.toBeNull();
      expect(ids.has(v!), `${c} → ${v}`).toBe(true);
    }
  });
});
