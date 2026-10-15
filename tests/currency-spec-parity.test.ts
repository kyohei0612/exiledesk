/**
 * ADR-004 の土台 (2026-10-16): 説明文の分解 (spec/) で打った結果 = 今の applyCurrency の結果。
 * 冒涜まわり (骨 4 種 × 部位・発現・ネクロマンシー・勢力・腐食・反響) と消去 (光・左右の消去) を、
 * いくつものベース × 状態 × アイテムレベル × お告げ × 種で打ち比べ、手順の再生 (続けて打つ・手順 JSON) でも全部の手を比べる。
 * 説明文はクライアントの currency-hover / 用語集の写しと同じか (パッチで変わったら落ちる)。
 * 今の関数と違う所は、どちらが正しいかを決めるまで「分かっている違い」として下に並べる (docs/reviews/2026-10-16-adr-004-desecrate-rules.md)
 */
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { freshItem, splitOmens, startItem } from "../src/services/craft-stage/run-plan";
import { bonesFor } from "../src/state/craft-stage-shelf";
import { mulberry32 } from "../src/services/htc/rng";
import { itemBaseFor } from "../src/services/htc/bridge";
import { applyBySpec, resolveSpec, specCovers } from "../src/services/craft-stage/spec/run-spec";
import { BONE_SPECS, CURRENCY_SPECS, OMEN_SPECS } from "../src/services/craft-stage/spec/desecrate-specs";
import { bossOmenAllowed, desecrationBoneFor } from "../src/vendor/poe2htc/engine/probability";
import { categoriesIn, clientClassOf, ENGINE_CATEGORIES } from "../src/services/mods/item-classes";
import { OMEN_FOR } from "../src/services/craft-stage/omens";
import STAGE_BASES from "../src/services/craft-stage/stage-bases.json";
import HOVER_EN from "../src/i18n/currency-hover-en.json";
import HOVER_JA from "../src/i18n/currency-hover-ja.json";
import KW_EN from "../src/i18n/keywords-en.json";
import KW_JA from "../src/i18n/keywords-ja.json";
import FIXTURE_PLAN from "./fixtures/plan-essence-crit-spear.json";
import type { StageApply, StageItem } from "../src/services/craft-stage/types";
import type { CraftStagePlan } from "../src/services/craft-stage/contract";

const data = loadPatch();

/** キーの並びに依らない文字列 (中身の比べ用) */
function canon(x: unknown): string {
  return JSON.stringify(x, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]])) : v));
}
interface Diff { where: string; field: string; old: string; next: string }
/** 1 手の比べ。結果 (打てたか・当たり所か・アイテム・足し引き・食ったお告げ・付いた確率) と一言 */
function compare(where: string, a: StageApply, b: StageApply, out: Diff[]): void {
  const fields: Array<[string, unknown, unknown]> = [
    ["applied", a.applied, b.applied],
    ["random", !!a.random, !!b.random],
    ["item", a.item, b.item],
    ["added", a.added, b.added],
    ["removed", a.removed, b.removed],
    ["omensUsed", a.omensUsed ?? [], b.omensUsed ?? []],
    ["rolled", a.rolled ?? [], b.rolled ?? []],
    ["reason", a.reason ?? "", b.reason ?? ""],
  ];
  for (const [field, x, y] of fields) {
    const cx = canon(x), cy = canon(y);
    if (cx !== cy) out.push({ where, field, old: cx.slice(0, 200), next: cy.slice(0, 200) });
  }
}
const show = (d: Diff[]): string => d.slice(0, 8).map((x) => `${x.where} [${x.field}]\n  今: ${x.old}\n  新: ${x.next}`).join("\n");

/** 部位ごとに 1 つ (ステージのベースの最後 = 高いレベルの物) と、枠の暗黙のあるベース・ジュエル */
const BASES: string[] = (() => {
  const byCls = new Map<string, string>();
  for (const [name, v] of Object.entries((STAGE_BASES as { bases: Record<string, { cls: string }> }).bases)) byCls.set(v.cls, name);
  const names = [...byCls.values(), "Gold Ring", "Dusk Ring", "Absent Amulet", "Amber Amulet", "Akoyan Spear", "Ruby", "Emerald", "Sapphire"];
  return [...new Set(names)].filter((n) => itemBaseFor(data, n));
})();
const RARE_BASES = BASES.filter((n) => !/Flask$/.test(n));

/** 打つ前の状態 (今の applyCurrency で作る。同じ物を両方に渡す) */
function statesOf(base: string, ilvl: number): Array<[string, StageItem]> {
  const out: Array<[string, StageItem]> = [];
  let k = 0;
  const step = (it: StageItem, key: string, omens: string[] = []): StageItem => applyCurrency(data, it, key, mulberry32(ilvl * 1000 + ++k), omens).item;
  const white = freshItem(data, base, ilvl);
  out.push(["ノーマル", white]);
  if (/Flask$/.test(base)) return out;
  const magic = step(white, "transmute");
  out.push(["マジック", magic]);
  const rare1 = step(magic, "regal");
  out.push(["レア 2 つ", rare1]);
  const rare4 = step(white, "alchemy");
  out.push(["レア 4 つ", rare4]);
  const rare5 = step(rare4, "exalt");
  out.push(["レア 5 つ", rare5]);
  const full = step(rare5, "exalt");
  out.push(["レア 満杯", full]);
  let pre = rare4;
  for (let i = 0; i < 3; i++) pre = step(pre, "exalt", ["OmenofSinistralExaltation"]);
  out.push(["プレ満杯", pre]);
  const frac = step(full, "fracture");
  out.push(["フラクチャー済み", frac]);
  const hidden = step(rare4, "desecrate");
  out.push(["未発現", hidden]);
  const hiddenFull = step(full, "desecrate");
  out.push(["満杯から未発現", hiddenFull]);
  out.push(["発現済み", step(hidden, "reveal:1")]);
  const mark = step(rare4, `essence:perfect:${rare4.cls.id}/PerfectEssence_EssenceAbyss`);
  out.push(["深淵の王の印", mark]);
  out.push(["腐食", step(rare4, "desecrate", ["OmenofPutrefaction"])]);
  out.push(["コラプト", { ...rare4, corrupted: true }]);
  out.push(["ミラー", { ...rare4, mirrored: true }]);
  out.push(["未鑑定", { ...rare4, identified: false }]);
  out.push(["予見", { ...rare4, foreseen: true }]);
  return out;
}

const BONE_OMENS: string[][] = [
  [], ["OmenofSinistralNecromancy"], ["OmenofDextralNecromancy"],
  ["OmenoftheSovereign"], ["OmenoftheLiege"], ["OmenoftheBlackblooded"],
  ["OmenofDextralNecromancy", "OmenoftheBlackblooded"], ["OmenoftheLiege", "OmenofSinistralNecromancy"],
  ["OmenofPutrefaction"], ["OmenofPutrefaction", "OmenofSinistralNecromancy"],
  ["OmenofAbyssalEchoes"], ["OmenofLight"],
];
const REVEAL_KEYS = ["reveal:1", "reveal:2", "reveal:3", "reveal:4", "reveal:1:reroll", "reveal:3:reroll", "reveal:x"];
const REVEAL_OMENS: string[][] = [[], ["OmenofAbyssalEchoes"], ["OmenofAbyssalEchoes", "OmenofDextralNecromancy"]];
const ANNUL_OMENS: string[][] = [[], ["OmenofLight"], ["OmenofSinistralAnnulment"], ["OmenofDextralAnnulment"], ["OmenofLight", "OmenofDextralAnnulment"], ["OmenofSinistralNecromancy"], ["OmenofGreaterAnnulment"]];
const ILVLS = [35, 64, 82];
const SEEDS = [1, 7, 20261016];

/**
 * 分かっている違い (今の関数の方が説明文と合わない、か、決まりの順が違うだけ)。どれもオーナーの確認待ち
 *   1. 古代の骨 + 腐食のお告げで、アイテムレベル 40 未満: 今は腐食が先に効いて打てる。新しい作りは「古代の骨はアイテムレベル 40 未満に使えない」が先
 *   2. 噛み切られた骨をアイテムレベル 65 以上のレア以外に: 弾く一言が違うだけ (今はアイテムレベル、新はレアリティ)
 */
function knownDiff(key: string, item: StageItem, omens: readonly string[]): string | null {
  if (key === "desecrate_ancient" && omens.includes("OmenofPutrefaction") && item.itemLevel < 40 && item.rarity === "rare") return "古代の骨 + 腐食 + アイテムレベル 40 未満";
  if (key === "desecrate_gnawed" && item.itemLevel > 64 && item.rarity !== "rare") return "噛み切られた骨の一言の順";
  return null;
}

describe("説明文はクライアントの写しと同じ", () => {
  const en = HOVER_EN as Record<string, { e: string[] }>;
  const ja = HOVER_JA as Record<string, { e: string[] }>;
  it("カレンシー (骨・消去) と発現の用語集", () => {
    for (const s of CURRENCY_SPECS) {
      if (s.key.startsWith("keyword:")) {
        const k = s.key.slice("keyword:".length);
        expect((KW_EN as Record<string, { d: string }>)[k]!.d).toContain(s.text.en[0]);
        expect((KW_JA as Record<string, { d: string }>)[k]!.d).toContain(s.text.ja[0]);
        continue;
      }
      expect(en[s.key]?.e, s.key).toEqual(s.text.en);
      expect(ja[s.key]?.e, s.key).toEqual(s.text.ja);
    }
  });
  it("お告げ", () => {
    for (const o of OMEN_SPECS) {
      expect(en[o.hover]?.e, o.key).toEqual(o.text.en);
      expect(ja[o.hover]?.e, o.key).toEqual(o.text.ja);
    }
  });
  it("骨はクライアントにある物で全部 (頭蓋骨は保存された物だけ、変質した骨は鎖骨だけ)", () => {
    const client = Object.keys(en).filter((k) => /(jawbone|rib|collarbone|cranium)$/.test(k) && /^(gnawed|preserved|ancient|altered)/.test(k)).sort();
    expect(BONE_SPECS.map((s) => s.key).sort()).toEqual(client);
  });
  it("お告げの掛かる手は今の棚 (OMEN_FOR) と同じ", () => {
    for (const kind of ["desecrate", "reveal", "annul"]) {
      const mine = OMEN_SPECS.filter((o) => o.appliesTo === kind).map((o) => o.key).sort();
      expect(mine, kind).toEqual([...(OMEN_FOR[kind] ?? [])].sort());
    }
  });
});

describe("対象の部位はクライアントの区分から", () => {
  it("骨の種類は今の desecrationBoneFor と同じ部位に当たる", () => {
    const part = { jawbone: "jawbone", rib: "rib", collarbone: "collarbone", cranium: "cranium" } as const;
    for (const cat of ENGINE_CATEGORIES) {
      const item = { ...freshItem(data, "Gold Ring", 82), cls: { ...freshItem(data, "Gold Ring", 82).cls, category: cat } } as StageItem;
      const r = resolveSpec("desecrate", item)!;
      const want = desecrationBoneFor(cat);
      // 今の関数は知らない部位を肋骨に落とす。新しい作りは合う骨が無いと言う (フラスコ・チャームなど)
      if (r.reason) { expect(["rib"]).toContain(want); continue; }
      expect(r.spec.key, cat).toBe(`preserved${part[want]}`);
    }
  });
  it("鎖骨の「アミュレット、指輪またはベルト」= 宝飾品のまとまり", () => {
    expect(new Set(categoriesIn("jewellery").map(clientClassOf))).toEqual(new Set(["Amulet", "Ring", "Belt"]));
  });
  it("勢力のお告げの対象 = 今の bossOmenAllowed", () => {
    const fac = OMEN_SPECS.find((o) => o.key === "OmenoftheSovereign")!;
    for (const cat of ENGINE_CATEGORIES) {
      const item = { ...freshItem(data, "Gold Ring", 82), rarity: "rare", cls: { ...freshItem(data, "Gold Ring", 82).cls, category: cat } } as StageItem;
      const ok = !fac.target!.groups || fac.target!.groups.some((g) => categoriesIn(g).includes(cat));
      expect(ok, cat).toBe(bossOmenAllowed(cat));
      void item;
    }
  });
});

describe("打ち比べ: 新しい作り = applyCurrency", () => {
  it(`骨 (棚に出る物) × ${BONE_OMENS.length} 通りのお告げ`, () => {
    const diffs: Diff[] = [];
    const known = new Map<string, number>();
    let n = 0, hit = 0;
    for (const base of BASES) for (const ilvl of ILVLS) for (const [label, item] of statesOf(base, ilvl)) {
      for (const key of bonesFor(item)) for (const omens of BONE_OMENS) for (const seed of SEEDS) {
        const a = applyCurrency(data, item, key, mulberry32(seed), omens);
        const b = applyBySpec(data, item, key, mulberry32(seed), omens)!;
        n++;
        if (a.applied) hit++;
        const d: Diff[] = [];
        compare(`${base} Lv${ilvl} ${label} ${key} [${omens.join("+")}] 種 ${seed}`, a, b, d);
        const k = d.length ? knownDiff(key, item, omens) : null;
        if (k) known.set(k, (known.get(k) ?? 0) + 1);
        else diffs.push(...d);
      }
    }
    console.log(`骨: ベース ${BASES.length}、${n} 通り (打てた ${hit})、分かっている違い ${JSON.stringify([...known])}`);
    expect(diffs.length, show(diffs)).toBe(0);
    expect(n).toBeGreaterThan(5000);
  });

  it("発現 (番号・引き直し・形の違う手) × 反響のお告げ", () => {
    const diffs: Diff[] = [];
    let n = 0, hit = 0;
    for (const base of RARE_BASES) for (const ilvl of ILVLS) for (const [label, item] of statesOf(base, ilvl)) {
      for (const key of REVEAL_KEYS) for (const omens of REVEAL_OMENS) for (const seed of SEEDS) {
        const a = applyCurrency(data, item, key, mulberry32(seed), omens);
        const b = applyBySpec(data, item, key, mulberry32(seed), omens)!;
        n++;
        if (a.applied) hit++;
        compare(`${base} Lv${ilvl} ${label} ${key} [${omens.join("+")}] 種 ${seed}`, a, b, diffs);
      }
    }
    console.log(`発現: ${n} 通り (打てた ${hit})`);
    expect(diffs.length, show(diffs)).toBe(0);
  });

  it("消去 × 光・左右の消去のお告げ", () => {
    const diffs: Diff[] = [];
    let n = 0, hit = 0;
    for (const base of BASES) for (const ilvl of [82]) for (const [label, item] of statesOf(base, ilvl)) {
      for (const omens of ANNUL_OMENS) for (const seed of SEEDS) {
        const a = applyCurrency(data, item, "annul", mulberry32(seed), omens);
        const b = applyBySpec(data, item, "annul", mulberry32(seed), omens)!;
        n++;
        if (a.applied) hit++;
        compare(`${base} ${label} annul [${omens.join("+")}] 種 ${seed}`, a, b, diffs);
      }
    }
    console.log(`消去: ${n} 通り (打てた ${hit})`);
    expect(diffs.length, show(diffs)).toBe(0);
  });
});

/**
 * 手を続けて打つ: 移した手は両方で、移していない手は今の関数で。毎手のアイテムを比べ、続きは今の関数の結果から。
 * 棚に出ない骨 (盾に変質した鎖骨など) は比べない (下の「分かっている違い」で別に見る)
 */
function replay(name: string, start: StageItem, steps: Array<{ key: string; omens: string[]; seed: number }>, diffs: Diff[]): number {
  let item = start;
  let n = 0;
  steps.forEach((s, i) => {
    const a = applyCurrency(data, item, s.key, mulberry32(s.seed), s.omens);
    const offShelf = s.key.startsWith("desecrate") && !bonesFor(item).includes(s.key);
    if (specCovers(s.key) && !offShelf) {
      const b = applyBySpec(data, item, s.key, mulberry32(s.seed), s.omens)!;
      compare(`${name} 手 ${i + 1} ${s.key} [${s.omens.join("+")}]`, a, b, diffs);
      n++;
    }
    item = a.item;
  });
  return n;
}

describe("手順の再生: 毎手同じ", () => {
  it("手順 JSON (槍のエッセンス・発現の見本)", () => {
    const diffs: Diff[] = [];
    const plans: CraftStagePlan[] = [
      FIXTURE_PLAN as unknown as CraftStagePlan,
      {
        schema: "craft-stage-plan/1", base: "Amber Amulet", item_level: 82, seed: 20261003,
        start: { rarity: "rare", mods: [{ mod: "Amulets/IncreasedLife", tier: "T2" }, { mod: "Amulets/IncreasedMana", tier: "T3" }, { mod: "Amulets/AllResistances", tier: "T2" }, { mod: "Amulets/Strength", tier: "T3" }] },
        steps: [
          { currency: "exalt_perfect", omen: "OmenofSinistralExaltation" },
          { currency: "desecrate", omen: "OmenofDextralNecromancy" },
          { currency: "reveal:2:reroll", omen: "OmenofAbyssalEchoes" },
          { currency: "annul", omen: "OmenofLight" },
          { currency: "desecrate_ancient", omen: "OmenoftheLiege" },
          { currency: "reveal:1" },
        ],
      } as unknown as CraftStagePlan,
    ];
    let n = 0;
    for (const plan of plans) {
      const steps: Array<{ key: string; omens: string[]; seed: number }> = [];
      let index = 0;
      for (const ps of plan.steps) for (let k = 0; k < (ps.times ?? 1); k++) {
        index++;
        steps.push({ key: ps.currency, omens: splitOmens(ps.omen), seed: (ps as { seed?: number }).seed ?? plan.seed + index });
      }
      n += replay(plan.base, startItem(data, plan), steps, diffs);
    }
    expect(n).toBeGreaterThan(5);
    expect(diffs.length, show(diffs)).toBe(0);
  });

  it("でたらめに続けて打つ (骨・発現・消去・高貴・カオス・エッセンス)", () => {
    const diffs: Diff[] = [];
    let n = 0;
    const KEYS = ["desecrate", "desecrate_ancient", "desecrate_gnawed", "desecrate_altered", "reveal:1", "reveal:2", "reveal:3", "reveal:1:reroll", "annul", "exalt", "chaos", "exalt_perfect", "fracture"];
    const OMENS = ["OmenofSinistralNecromancy", "OmenofDextralNecromancy", "OmenoftheSovereign", "OmenoftheLiege", "OmenoftheBlackblooded", "OmenofPutrefaction", "OmenofAbyssalEchoes", "OmenofLight", "OmenofSinistralAnnulment", "OmenofDextralAnnulment", "OmenofSinistralExaltation"];
    for (const base of RARE_BASES) for (const walk of [1, 2, 3]) {
      const pick = mulberry32(walk * 7919 + base.length);
      const start = applyCurrency(data, freshItem(data, base, [82, 64, 45][walk - 1]!), "alchemy", mulberry32(walk)).item;
      const steps = Array.from({ length: 30 }, (_, i) => {
        const key = KEYS[Math.floor(pick() * KEYS.length)]!;
        const omens = pick() < 0.5 ? [] : [OMENS[Math.floor(pick() * OMENS.length)]!];
        return { key, omens, seed: walk * 100000 + i };
      });
      n += replay(`${base} 道 ${walk}`, start, steps, diffs);
    }
    console.log(`続けて打つ: 移した手 ${n} 手`);
    expect(diffs.length, show(diffs)).toBe(0);
  });
});

describe("分かっている違い (オーナーの確認待ち)", () => {
  it("古代の骨 + 腐食のお告げ、アイテムレベル 40 未満: 今は打てる、新しい作りは古代の骨の制約で打てない", () => {
    const item = applyCurrency(data, freshItem(data, "Gold Ring", 35), "alchemy", mulberry32(3)).item;
    expect(applyCurrency(data, item, "desecrate_ancient", mulberry32(1), ["OmenofPutrefaction"]).applied).toBe(true);
    expect(applyBySpec(data, item, "desecrate_ancient", mulberry32(1), ["OmenofPutrefaction"])!.applied).toBe(false);
  });
  it("棚に無い骨 (古代の頭蓋骨・武器の変質した骨): 今の関数は打ててしまう物がある、新しい作りはクライアントにある骨だけ", () => {
    const jewel = applyCurrency(data, freshItem(data, "Ruby", 82), "alchemy", mulberry32(3)).item;
    expect(bonesFor(jewel)).toEqual(["desecrate"]);
    expect(applyCurrency(data, jewel, "desecrate_ancient", mulberry32(1)).applied).toBe(true);
    expect(applyBySpec(data, jewel, "desecrate_ancient", mulberry32(1))!.applied).toBe(false);
    const wand = applyCurrency(data, freshItem(data, "Withered Wand", 82), "alchemy", mulberry32(3)).item;
    expect(applyCurrency(data, wand, "desecrate_altered", mulberry32(1)).applied).toBe(false);
    expect(applyBySpec(data, wand, "desecrate_altered", mulberry32(1))!.reason).toBe(applyCurrency(data, wand, "desecrate_altered", mulberry32(1)).reason);
  });
});
