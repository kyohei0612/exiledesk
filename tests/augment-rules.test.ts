/**
 * オーグメント (ルーン / ソウルコア / アイドル) をはめる・置き換える・取り外す決まり (2026-10-03)
 * 表は src/i18n/augment-rules.json (scripts/build-augment-rules-from-client.mjs がクライアントの説明文から作る)
 */
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { AUGMENT_RULES, AUGMENT_RULES_UNEXPECTED, augmentRule, limitBlock, SLOT_CLASSES, slotOk } from "../src/services/augment-rules";
import { ARMOUR, CASTER, MARTIAL } from "../src/services/craft-stage/apply-act";
import { freshItem, runPlan } from "../src/services/craft-stage/run-plan";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { mulberry32 } from "../src/services/htc/rng";
import { RUNES, runeEffectFor } from "../src/services/craft-stage/stage-runes";
import { SOCKET_RUNES } from "../src/services/htc/sockets";
import kinds from "../src/i18n/augment-kinds.json";
import type { StageItem } from "../src/services/craft-stage/types";
import type { CraftStagePlan } from "../src/services/craft-stage/contract";

const data = loadPatch();
const A = (item: StageItem, key: string) => applyCurrency(data, item, key, mulberry32(1), [], {});
/** ソケットを n 個付けた白のアイテム */
const socketed = (base: string, n: number, lvl = 82): StageItem => ({ ...freshItem(data, base, lvl), sockets: n });

describe("説明文から作った表", () => {
  it("augment-kinds のオーグメント (ジェム以外) が全部入っている", () => {
    const want = Object.entries(kinds as Record<string, string>).filter(([, k]) => k !== "gem").map(([n]) => n);
    expect(want.filter((n) => !AUGMENT_RULES[n])).toEqual([]);
  });
  it("アストリッドの創造性 = 取り外し不可・置き換え可 (ソケットバウンドではない)", () => {
    expect(augmentRule("Astrid's Creativity")).toMatchObject({ removable: false, replaceable: true, bound: false, slots: null, replacedGoes: "destroyed" });
  });
  it("ソケットバウンドの代表 (セールの凱旋・アトジリのソウルコア) = 取り外しも置き換えも不可、部位の制限も読む", () => {
    expect(augmentRule("Serle's Triumph")).toMatchObject({ removable: false, replaceable: false, bound: true });
    expect(augmentRule("Atziri's Soul Core of Inoculation")).toMatchObject({ bound: true, slots: ["靴"] });
    // アルダーの○○ は「レアの武器」
    expect(augmentRule("Passion of Aldur")).toMatchObject({ bound: true, slots: ["武器"], rarity: "rare" });
  });
  it("普通のルーン (説明文の無い物) は既定文: 武器または防具、取り外し不可・置き換え可", () => {
    expect(augmentRule("Desert Rune")).toMatchObject({ removable: false, replaceable: true, bound: false, slots: ["武器", "防具"], textFrom: "ClientStrings.ItemDescriptionSoulCore" });
  });
  it("ソケットバウンドは IsSocketBound と全部合っている (合わない物は unexpected に出る)", () => {
    const bound = Object.entries(AUGMENT_RULES).filter(([, r]) => r.bound).map(([n]) => n);
    expect(bound.length).toBe(17);
    expect(AUGMENT_RULES_UNEXPECTED.filter((u) => u.why.some((w) => w.includes("IsSocketBound")))).toEqual([]);
  });
  it("文の型が想定外の物は値を埋めていない (傑作のルーン・アルダーの遺産)", () => {
    expect(AUGMENT_RULES_UNEXPECTED.map((u) => u.en).sort()).toEqual(["Aldur's Legacy", "Masterwork Rune"]);
    expect(augmentRule("Masterwork Rune")).toMatchObject({ removable: null, replaceable: null, bound: null });
  });
  it("部位の言葉は全部計算機の部位に引ける、部位のまとまりはクラフトステージと同じ", () => {
    for (const r of Object.values(AUGMENT_RULES)) for (const s of r.slots ?? []) expect(SLOT_CLASSES[s], s).toBeTruthy();
    expect(SLOT_CLASSES["マーシャル武器"]).toEqual(MARTIAL);
    expect(SLOT_CLASSES["防具"]).toEqual(ARMOUR);
    expect(SLOT_CLASSES["武器"]).toEqual([...MARTIAL, ...CASTER]);
  });
  /**
   * 説明文の部位と SoulCoreStats の効き目の部位が食い違う物 (2026-10-03 時点のクライアント)。クラフトステージは**効果のデータを正**にする
   * (グロルドは取引所の出品で 靴 883 / 手袋 0 を確認)。増えたらここで気づく
   */
  it("効き目のある部位は説明文の部位の中 (食い違いは分かっている 5 件だけ)", () => {
    const cats = [...MARTIAL, ...CASTER, ...ARMOUR];
    const bad: string[] = [];
    for (const [en, row] of Object.entries(RUNES)) {
      const rule = augmentRule(en);
      if (!rule?.slotsKnown) continue;
      for (const c of cats) if (runeEffectFor(row, c) && slotOk(rule, c) === false) bad.push(`${en} @ ${c}`);
    }
    expect(bad.sort()).toEqual([
      "Idol of Grold @ Boots", // 説明文: 手袋またはセプター / 効き目: Boots
      "Legacy of Dunkelhalt @ Bucklers", // 説明文: 盾 / 効き目: Buckler
      "Rune of Accumulation @ Spears", // 説明文: 遠距離武器または手袋 / 効き目: Crossbow Bow or Spear
      "Rune of Consistency @ Staves", // 説明文: ワンド、セプターまたは兜 / 効き目: Caster Weapon
      "Soul Core of Ticaba @ Bucklers", // 説明文: 武器、鎧または盾 / 効き目: Shield or Buckler
    ]);
  });
  it("はめられる数: 遺産のルーンは種類 (アルダーの遺産) でまとめて 1 個、普通のルーンは制限なし", () => {
    expect(limitBlock("Legacy of Bramblejack", ["Legacy of Ashrend"])).toBe("アルダーの遺産は 1 つのアイテムに 1 個まで");
    expect(limitBlock("Desert Rune", ["Desert Rune", "Desert Rune"])).toBeNull();
    expect(limitBlock("Astrid's Creativity", ["Astrid's Creativity"])).toBe("アストリッドの創造性は 1 つのアイテムに 1 個まで");
  });
  it("クラフト計算機のソケット (アストリッド / セール) も表から", () => {
    expect(SOCKET_RUNES.find((r) => r.key === "astrid")).toMatchObject({ bound: false, corruptOk: false });
    expect(SOCKET_RUNES.find((r) => r.key === "serle")).toMatchObject({ bound: true, corruptOk: false });
  });
});

describe("クラフトステージで はめる・置き換える", () => {
  it("普通のルーン → 別のルーンで上書き (元のルーンは壊れる)", () => {
    const one = A(socketed("Chain Mail", 1, 30), "rune:Lesser Desert Rune");
    expect(one.applied).toBe(true);
    const two = A(one.item, "rune:Lesser Glacial Rune");
    expect(two.applied).toBe(true);
    expect(two.item.augments?.map((a) => a.en)).toEqual(["Lesser Glacial Rune"]);
    expect(two.augment).toMatchObject({ socket: 1, replaced: { en: "Lesser Desert Rune" }, replacedGoes: "destroyed" });
  });
  it("空きがあれば空きに、@n でそのソケットを置き換え", () => {
    let it = A(socketed("Chain Mail", 2, 30), "rune:Lesser Desert Rune").item;
    it = A(it, "rune:Lesser Glacial Rune").item;
    expect(it.augments?.map((a) => a.en)).toEqual(["Lesser Desert Rune", "Lesser Glacial Rune"]);
    const r = A(it, "rune:Lesser Storm Rune@2");
    expect(r.item.augments?.map((a) => a.en)).toEqual(["Lesser Desert Rune", "Lesser Storm Rune"]);
    expect(r.augment).toMatchObject({ socket: 2, replaced: { en: "Lesser Glacial Rune" } });
    expect(A(it, "rune:Lesser Storm Rune@3")).toMatchObject({ applied: false });
  });
  it("ソケットバウンド (セールの凱旋) は上書きできない (理由の札)", () => {
    const rare = { ...socketed("Chain Mail", 1), rarity: "rare" as const };
    const s = A(rare, "rune:Serle's Triumph");
    expect(s.applied).toBe(true);
    expect(A(s.item, "rune:Lesser Desert Rune")).toMatchObject({ applied: false, reason: "セールの凱旋はソケットバウンドなので置き換えられない" });
  });
  it("アストリッドは上書きできる (セールの凱旋で置き換え)", () => {
    const a = A(socketed("Chain Mail", 1), "rune:Astrid's Creativity");
    expect(a.applied).toBe(true);
    const s = A(a.item, "rune:Serle's Triumph");
    expect(s.applied).toBe(true);
    expect(s.item.augments?.map((x) => x.en)).toEqual(["Serle's Triumph"]);
    expect(s.augment?.replaced?.en).toBe("Astrid's Creativity");
  });
  it("空きが無い時は左から最初の置き換えられる物 (ソケットバウンドは飛ばす)", () => {
    let it = A(socketed("Chain Mail", 2), "rune:Serle's Triumph").item;
    it = A(it, "rune:Lesser Desert Rune").item;
    const r = A(it, "rune:Lesser Glacial Rune");
    expect(r.item.augments?.map((a) => a.en)).toEqual(["Serle's Triumph", "Lesser Glacial Rune"]);
  });
  it("部位の制限: 靴だけの物は兜にはめられない", () => {
    const r = A(socketed("Twig Circlet", 1, 82), "rune:Farrul's Rune of Grace");
    expect(r.applied).toBe(false);
    expect(r.reason).toContain("靴");
  });
  it("決まりの読めない物 (傑作のルーン) ははめない", () => {
    expect(A(socketed("Chain Mail", 1), "rune:Masterwork Rune")).toMatchObject({ applied: false });
  });
  it("結果 JSON の手に augment_change (置き換えた物と行き先)", () => {
    const plan = { schema: "craft-stage-plan/1", base: "Chain Mail", item_level: 30, seed: 7, steps: [{ currency: "artificer" }, { currency: "rune:Lesser Desert Rune" }, { currency: "rune:Lesser Glacial Rune" }] } as unknown as CraftStagePlan;
    const r = runPlan(data, plan, { prices: {}, exiledeskVersion: "test", patch: "0.5.0", league: null, generatedAt: "2026-10-03T00:00:00Z" });
    const last = r.steps[2] as unknown as { applied: boolean; augment_change: { socket: number; replaced: { en: string }; replaced_goes: string } };
    expect(last.applied).toBe(true);
    expect(last.augment_change).toMatchObject({ socket: 1, replaced: { en: "Lesser Desert Rune" }, replaced_goes: "destroyed" });
  });
});
