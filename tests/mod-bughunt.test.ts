// クラフトステージ (エミュレーター) の MOD まわりのバグ洗い出し (2026-10-10)。
// 各 it は「正しい振る舞い」を書いてあり、落ちる = バグの再現。仕様かもしれない物は describe を分けてある
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { heldOdds } from "../src/services/craft-stage/held-odds";
import { freshItem, playPlan } from "../src/services/craft-stage/run-plan";
import { mulberry32 } from "../src/services/htc/rng";
import { allMods, room, takenFamilies } from "../src/services/craft-stage/stage-core";
import { socketCapOf } from "../src/services/craft-stage/stage-runes";
import { modListFor } from "../src/services/craft-stage/mod-list";
import { familyKeysOf } from "../src/services/mods/mod-rules";
import type { StageItem } from "../src/services/craft-stage/types";
import type { CraftStagePlan } from "../src/services/craft-stage/contract";
import { ESSENCE_KEYS } from "../src/services/htc/essence-key-table";
import { essenceLevelOf } from "../src/vendor/poe2htc/optimizer/cost";
import { runRecipeOnce, type RecipeSpec } from "../src/services/craft-stage/recipe-sim";

const data = loadPatch();
const A = (it: StageItem, key: string, seed: number, omens: string[] = [], hint: Parameters<typeof applyCurrency>[5] = {}): StageItem => {
  const r = applyCurrency(data, it, key, mulberry32(seed), omens, hint);
  if (!r.applied) throw new Error(`${key}: ${r.reason}`);
  return r.item;
};
/** 両側が埋まるまで側の高貴を打ったレア */
function fullRare(base: string, seed: number): StageItem {
  let it = A(A(freshItem(data, base, 82), "transmute", seed), "regal", seed + 1);
  let s = seed + 2;
  while (room(it, "prefix")) it = A(it, "exalt", s++, ["OmenofSinistralExaltation"]);
  while (room(it, "suffix")) it = A(it, "exalt", s++, ["OmenofDextralExaltation"]);
  return it;
}
/** 普通の MOD を指名で付ける (手で付ける手) */
const force = (it: StageItem, modId: string, flag = "n") => A(it, `force:${modId}||${flag}`, 1);

describe("バグ: 確率表 (held-odds) と打つ処理の食い違い", () => {
  it("両側が埋まったレアのカオス: 消えた側にしか付かないのに、表は反対側の MOD にも確率を出す", () => {
    const ring = fullRare("Gold Ring", 101);
    expect(allMods(ring).length).toBe(6);
    const h = heldOdds(data, ring, "chaos", [])!;
    const sideOf = (id: string) => (data.mods.get(id)?.type === "suffix" ? "suffix" : "prefix");
    let tablePrefix = 0;
    for (const [id, x] of h.byMod) if (sideOf(id) === "prefix") tablePrefix += x.w / h.total;
    // 打った結果: 付いた側は必ず消えた側
    let samePrefix = 0, sameSide = 0;
    const N = 2000;
    for (let s = 1; s <= N; s++) {
      const r = applyCurrency(data, ring, "chaos", mulberry32(5000 + s), []);
      if (r.added[0]?.side === r.removed[0]?.side) sameSide++;
      if (r.added[0]?.side === "prefix") samePrefix++;
    }
    expect(sameSide).toBe(N);
    // 実際のプレに付く割合 ≒ 0.5 (6 つから等しく 1 つ消すので)。表もそうであるべき
    expect(Math.abs(tablePrefix - samePrefix / N), `表のプレ ${tablePrefix.toFixed(3)} / 実際 ${(samePrefix / N).toFixed(3)}`).toBeLessThan(0.04);
  });

  it("深淵の王の印がある時の骨: 骨は必ず印の側に付くのに、表は反対側の MOD にも確率を出す", () => {
    // 2 MOD のレア → 深淵のエッセンス (1 つ消して消した側に印)
    let ring = A(A(freshItem(data, "Gold Ring", 82), "transmute", 11), "regal", 12);
    ring = A(ring, "essence:perfect:Rings/PerfectEssence_EssenceAbyss", 13);
    const mark = allMods(ring).find((m) => m.abyssMark)!;
    expect(mark).toBeTruthy();
    const other = mark.side === "prefix" ? "suffix" : "prefix";
    // 打つと: 未発現は必ず印の側
    for (let s = 1; s <= 200; s++) {
      const b = applyCurrency(data, ring, "desecrate", mulberry32(s), []);
      expect(b.added[0]?.side).toBe(mark.side);
    }
    const h = heldOdds(data, ring, "desecrate", [])!;
    const wrong = [...h.byMod.entries()].filter(([id, x]) => x.w > 0 && (data.mods.get(id)?.type === "suffix" ? "suffix" : "prefix") === other);
    expect(wrong.length, `印の反対側 (${other}) の MOD が ${wrong.length} 個、表に確率付きで出る`).toBe(0);
  });
});

describe("バグ: 手順 JSON の再生 (1 手戻す・再生) が手で打った結果と違う", () => {
  it("手で打つ画面は規格外のソケット (熟練工の上限 + 1) で始まるが、plan() に書かれないので再生でルーンの手が打てない", () => {
    const base = "Garment";
    const white = freshItem(data, base, 82);
    // state/craft-stage.ts の fullSockets と同じ
    const cap = socketCapOf(white.base, white.cls.category);
    const emu = { ...white, sockets: cap + 1 };
    const rune = "rune:Lesser Desert Rune";
    const r = applyCurrency(data, emu, rune, mulberry32(1), []);
    expect(r.applied, r.reason).toBe(true);
    // craftStage.plan() と同じ形 (2026-10-10 から start.sockets に始めのソケットを書く)
    const plan = { schema: "craft-stage-plan/1", title: null, base, item_level: 82, start_rarity: "normal", start_paste: null, start: { sockets: cap + 1 }, seed: 1000,
      steps: [{ currency: rune, omen: null, times: 1, note: null, seed: 1 }] } as unknown as CraftStagePlan;
    const { steps } = playPlan(data, plan, {});
    expect(steps[0]!.out.applied, `再生: ${steps[0]!.out.reason}`).toBe(true);
  });

  it("カタリストは手で打つと 1 手で上限まで、再生 (playPlan) は 1 手 = 1% で品質が違う", () => {
    const ring = A(A(freshItem(data, "Gold Ring", 82), "transmute", 1), "regal", 2);
    const manual = applyCurrency(data, ring, "catalyst_life", mulberry32(3), []);
    expect(manual.applied).toBe(true);
    const plan = { schema: "craft-stage-plan/1", title: null, base: "Gold Ring", item_level: 82, start_rarity: "normal", start_paste: null, seed: 1000,
      steps: [
        { currency: "transmute", omen: null, times: 1, note: null, seed: 1 },
        { currency: "regal", omen: null, times: 1, note: null, seed: 2 },
        // craftStage.plan() はカタリストを上げた品質の分の回数で書く (2026-10-10)
        { currency: "catalyst_life", omen: null, times: manual.item.quality, note: null, seed: 3 },
      ] } as unknown as CraftStagePlan;
    const { final } = playPlan(data, plan, {});
    expect(final.quality, `手で打った品質 ${manual.item.quality} / 再生 ${final.quality}`).toBe(manual.item.quality);
  });
});

describe("バグ: フラクチャー・印の引き継ぎ", () => {
  it("フラクチャーした深淵の王の印を、次の骨が消してしまう (固定済みは消えないはず)", () => {
    // 4 MOD のレア → 深淵のエッセンス (1 消して印で 4 のまま) → フラクチャーで印が固定されるまで種を探す
    let ring = A(A(freshItem(data, "Gold Ring", 82), "transmute", 21), "regal", 22);
    ring = A(ring, "exalt", 23);
    ring = A(ring, "essence:perfect:Rings/PerfectEssence_EssenceAbyss", 24);
    ring = A(ring, "exalt", 25);
    expect(allMods(ring).length).toBe(4);
    let fr: StageItem | null = null;
    for (let s = 1; s < 200 && !fr; s++) {
      const r = applyCurrency(data, ring, "fracture", mulberry32(s), []);
      if (r.applied && allMods(r.item).some((m) => m.abyssMark && m.fractured)) fr = r.item;
    }
    expect(fr, "印がフラクチャーされる種が無い").not.toBeNull();
    const b = applyCurrency(data, fr!, "desecrate", mulberry32(7), []);
    // 固定済みが消えていないこと
    expect(b.removed.some((m) => m.fractured), "骨で固定済みの印が消えた").toBe(false);
  });
});


describe("バグ: 追加分 (乱数の打ち回し・データの点検で見つけた物)", () => {
  it("両側が埋まったレアの骨: 打つと 1 つ差し替えて付くのに、確率表は空 (全部 0%・グレーアウト)", () => {
    const ring = fullRare("Gold Ring", 301);
    const b = applyCurrency(data, ring, "desecrate", mulberry32(1), []);
    expect(b.applied, b.reason).toBe(true);
    const h = heldOdds(data, ring, "desecrate", [])!;
    expect(h.byMod.size, "骨の表に 1 つも出ない").toBeGreaterThan(0);
  });

  it("エッセンスの段の名前がデータで崩れている部位: 普通 / レッサーのエッセンスが「ティアが無い」、1 つ上のエッセンスが 1 つ下の段を付ける", () => {
    const bad: string[] = [];
    for (const k of Object.keys(ESSENCE_KEYS)) {
      const m = /^essence:(lesser|normal|greater):(.+)$/.exec(k);
      if (!m) continue;
      const mod = data.mods.get(m[2]!);
      if (!mod) continue;
      const names = mod.tiers.map((t) => essenceLevelOf(String(t.name ?? "")));
      if (!names.includes(m[1]!) || new Set(names).size !== names.length) bad.push(`${k} [${mod.tiers.map((t) => t.name).join(" / ")}]`);
    }
    expect(bad).toEqual([]);
  });

  it("耐性のフラックスが固定済み (フラクチャー) の耐性を別の MOD に変えてしまう", () => {
    let ring = force(freshItem(data, "Gold Ring", 82), "Rings/ColdResistance");
    ring = A(ring, "regal", 1);
    ring = A(ring, "exalt", 2);
    ring = A(ring, "exalt", 3);
    expect(allMods(ring).length).toBe(4);
    ring = A(ring, "force:Rings/ColdResistance||f", 4);
    const fixed = allMods(ring).find((m) => m.fractured)!;
    expect(fixed.modId).toBe("Rings/ColdResistance");
    const r = applyCurrency(data, ring, "flux_fire", mulberry32(1), []);
    const after = allMods(r.item).find((m) => m.fractured);
    expect(after?.modId, "固定済みの冷気耐性が火耐性に変わった").toBe("Rings/ColdResistance");
  });

  it("シミュレーター: アイテムレベルが上級・完全の下限 (44 / 70) 未満でも上級・完全を選んで、1 手目で止まる", () => {
    const m = data.mods.get("Rings/IncreasedLife")!;
    const ilvl = 60;
    const top = m.tiers.map((t, i) => [t.ilvl, i] as const).filter(([l]) => l <= ilvl).pop()!;
    const spec: RecipeSpec = { data, base: "Gold Ring", itemLevel: ilvl, runs: 1, price: () => 1, seed: 1, targets: [{ modId: m.id, minTierIndex: top[1], method: "exalt" }] };
    const r = runRecipeOnce(spec, 5000);
    expect(r.reason ?? "完成", `止まった理由: ${r.reason}`).not.toMatch(/アイテムレベルが \d+ 未満/);
  });

  it("アストリッドの創造性を置き換えると、エッセンスの MOD が 2 つのまま上限 1 を超える", () => {
    let body = { ...freshItem(data, "Garment", 82), sockets: 1 };
    body = A(body, "rune:Astrid's Creativity", 1);
    body = A(body, "force:Body_Armours_str_dex_int/Essence_IncreasedLife||e", 2);
    body = A(body, "force:Body_Armours_str_dex_int/Essence_ColdResistance||e", 3);
    expect(allMods(body).filter((m) => m.crafted).length).toBe(2);
    const r = applyCurrency(data, body, "rune:Lesser Desert Rune@1", mulberry32(4), []);
    // 置き換えられないか、置き換えるならエッセンスの MOD が 1 つまでに戻るべき
    if (r.applied) expect(allMods(r.item).filter((m) => m.crafted).length, "エッセンスの MOD 2 つでアストリッド無し").toBeLessThanOrEqual(1);
  });
});

// 2026-10-10 オーナーが決めた: エッセンスは同じ系統の普通の MOD と一緒に付く / フラクチャーは未発現の冒涜以外なんでも固定できる / フラックスで系統が被るのはあり
describe("決まり (オーナー確認済み)", () => {
  it("エッセンスと普通の MOD の同じ系統: エッセンスは打てないのに、エッセンスの後の高貴では同じ系統の普通の MOD が付く (順番で結果が違う)", () => {
    // 先に普通の火耐性 → エッセンス (火耐性) は打てない
    const magic = force(freshItem(data, "Gold Ring", 82), "Rings/FireResistance");
    const e1 = applyCurrency(data, magic, "essence:greater:Rings/Essence_FireResistance", mulberry32(1), []);
    // 先にエッセンスの火耐性 → 高貴の指名で普通の火耐性が付く
    let ring = A(freshItem(data, "Gold Ring", 82), "transmute", 2);
    ring = A(ring, "essence:greater:Rings/Essence_FireResistance", 3);
    const e2 = applyCurrency(data, ring, "exalt", mulberry32(4), [], { pick: [{ mod: "Rings/FireResistance" }] });
    const fams = allMods(e2.item).filter((m) => m.family === "FireResistance").length;
    // どちらかに揃うべき (両方 OK か、両方 NG)
    expect({ essenceAfterNormal: e1.applied, normalAfterEssence: e2.applied, fireResCount: fams }).toEqual(
      e1.applied ? { essenceAfterNormal: true, normalAfterEssence: true, fireResCount: 2 } : { essenceAfterNormal: false, normalAfterEssence: false, fireResCount: 0 },
    );
  });

  it("普通の火耐性が付いた指輪にも、エッセンスの火耐性は付く (一覧も付けられる扱い)", () => {
    const magic = force(freshItem(data, "Gold Ring", 82), "Rings/FireResistance");
    const row = modListFor(data, magic).find((r) => r.id === "Rings/Essence_FireResistance");
    const r = applyCurrency(data, magic, "essence:greater:Rings/Essence_FireResistance", mulberry32(1), []);
    expect(r.applied, r.reason).toBe(true);
    expect(!!row?.blocked, "一覧で付かない扱いになっている").toBe(false);
  });

  it("フラクチャーのオーブはエッセンス (クラフト) の MOD も固定するが、手で付ける「固定」は「冒涜・エッセンスの MOD は固定できない」と断る", () => {
    // マジック 2 MOD → 普通のエッセンスでレア (3) → 高貴で 4
    let ring = A(A(freshItem(data, "Gold Ring", 82), "transmute", 31), "augment", 32);
    ring = A(ring, "essence:normal:Rings/Essence_IncreasedLife", 33);
    ring = A(ring, "exalt", 34);
    expect(allMods(ring).length).toBe(4);
    const crafted = allMods(ring).find((m) => m.crafted)!;
    let orbFixedCrafted = false;
    for (let s = 1; s < 100 && !orbFixedCrafted; s++) {
      const r = applyCurrency(data, ring, "fracture", mulberry32(s), []);
      if (allMods(r.item).some((m) => m.crafted && m.fractured)) orbFixedCrafted = true;
    }
    const manual = applyCurrency(data, ring, `force:${crafted.modId}||f`, mulberry32(1), []);
    expect({ orb: orbFixedCrafted, manual: manual.applied }).toEqual({ orb: manual.applied, manual: manual.applied });
  });

  it("フラクチャーのオーブは MOD 4 つ以上、手で付ける「固定」(f) は好きな状態を作る手なので 4 つ未満でも足せる", () => {
    const ring = A(A(freshItem(data, "Gold Ring", 82), "transmute", 41), "regal", 42);
    expect(allMods(ring).length).toBe(2);
    const orb = applyCurrency(data, ring, "fracture", mulberry32(1), []);
    const manual = applyCurrency(data, ring, "force:Rings/ChaosResistance||f", mulberry32(1), []);
    expect({ orb: orb.applied, manual: manual.applied }).toEqual({ orb: false, manual: true });
  });

  it("耐性のフラックスで、同じ系統の MOD が 2 つになってよい (火耐性 + 冷気耐性 → 火炎フラックス → 火耐性 2 つ)", () => {
    let ring = force(freshItem(data, "Gold Ring", 82), "Rings/FireResistance");
    ring = force(ring, "Rings/IncreasedLife");
    ring = A(ring, "regal", 1, [], { pick: [{ mod: "Rings/ColdResistance" }] });
    expect(allMods(ring).map((m) => m.family)).toEqual(expect.arrayContaining(["FireResistance", "ColdResistance"]));
    const r = applyCurrency(data, ring, "flux_fire", mulberry32(1), []);
    expect(r.applied, r.reason).toBe(true);
    const keys = allMods(r.item).flatMap((m) => { const md = data.mods.get(m.modId); return md ? familyKeysOf(md) : [m.family]; });
    expect(keys.filter((k) => k === "FireResistance").length, `系統: ${keys.join(",")}`).toBe(2);
  });

  it("パーフェクトエッセンス: 同じ系統の MOD を乱数の消去で消せた時だけ打てる (打てるかどうかが乱数で決まる)", () => {
    // 普通のマナ再生? → 同じ系統のパーフェクトエッセンス (ManaRegeneration)
    let ring = force(freshItem(data, "Gold Ring", 82), "Rings/ManaRegeneration");
    ring = A(ring, "regal", 1);
    ring = A(ring, "exalt", 2);
    expect(allMods(ring).some((m) => m.family === "ManaRegeneration")).toBe(true);
    const outcomes = new Set<boolean>();
    for (let s = 1; s <= 60; s++) outcomes.add(applyCurrency(data, ring, "essence:perfect:Rings/PerfectEssence_ManaRegeneration", mulberry32(s), []).applied);
    expect(outcomes.size, "種で打てたり打てなかったりする").toBe(1);
  });
});

describe("確認: 決まりどおりの物 (通る)", () => {
  it("未発現の冒涜はフラクチャーされない・消去で消える", () => {
    let ring = A(A(freshItem(data, "Gold Ring", 82), "transmute", 51), "regal", 52);
    ring = A(ring, "exalt", 53);
    ring = A(ring, "desecrate", 54);
    for (let s = 1; s < 100; s++) {
      const r = applyCurrency(data, ring, "fracture", mulberry32(s), []);
      expect(allMods(r.item).some((m) => m.unrevealed && m.fractured)).toBe(false);
    }
    let gone = false;
    for (let s = 1; s < 100 && !gone; s++) gone = applyCurrency(data, ring, "annul", mulberry32(s), []).removed.some((m) => m.unrevealed);
    expect(gone).toBe(true);
  });
  it("付いた MOD の系統は被らない (高貴 2,000 回)", () => {
    for (let s = 1; s <= 300; s++) {
      const it = fullRare("Gold Ring", 10_000 + s * 50);
      const keys = allMods(it).flatMap((m) => { const md = data.mods.get(m.modId); return md ? familyKeysOf(md) : []; });
      expect(new Set(keys).size).toBe(keys.length);
      void takenFamilies;
    }
  });
});
