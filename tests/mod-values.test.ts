/**
 * MOD の数値の単位 (services/mods/stat-scale.ts) と全数点検 (services/mods/mod-values-check.ts)。
 * オーナー 2026-10-03「異界の MOD で、アミュレットなのに火スペルの MOD の中身が 400% とか。MOD をフルチェックしてくれ」。
 * 決まりは stat-scale.ts に 1 つ。計算機・クラフトステージ・取引所の下限・貼り付けの段の判定が全部そこを通る
 */
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { displayValue, rangeLabel, scaleOf, tierDisplayRanges } from "../src/services/mods/stat-scale";
import { checkModValues, isShown, textNumbers } from "../src/services/mods/mod-values-check";
import { sourceRanges } from "../src/services/mods/tiers";
import { normalizeModTemplate, stripRichTextMarkers } from "../src/services/mods/normalize";
import { makeStageMod } from "../src/services/craft-stage/stage-core";
import { modListFor } from "../src/services/craft-stage/mod-list";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { tradeFiltersFor } from "../src/services/htc/buy-or-craft";
import { rollEnchantValues } from "../src/services/craft-stage/apply-vaal";
import { mulberry32 } from "../src/services/htc/rng";
import bundle from "../src/i18n/mods-bundle.json";
import hiddenRaw from "../src/services/mods/stat-hidden.json";
import scaleTable from "../src/services/mods/stat-scale.json";
import htc from "../src/vendor/poe2htc/data/mods.json";
import extra from "../src/services/htc/extra-bases.json";
import type { Bundle, HiddenStats, HtcMod, DropOnlyInfo } from "../src/services/mods/mod-values-check";

const data = loadPatch();
const hidden: HiddenStats = { hidden: new Set((hiddenRaw as { hidden: string[] }).hidden), partly: (hiddenRaw as unknown as { partly: HiddenStats["partly"] }).partly };

describe("単位の決まり (stat-scale.ts)", () => {
  it("1 万分率 (permyriad) は ÷100、毎分 (per_minute) は ÷60、ミリ秒 (ms) は ÷1000、それ以外はそのまま", () => {
    expect(displayValue("fire_spell_additional_critical_strike_chance_permyriad", 400)).toBe(4);
    expect(displayValue("local_life_leech_from_physical_damage_permyriad", 645)).toBe(6.45);
    expect(displayValue("base_life_regeneration_rate_per_minute", 1746)).toBe(29.1);
    expect(displayValue("generate_x_charges_for_charms_per_minute", 5)).toBe(0.08);
    expect(displayValue("rage_loss_delay_ms_+", 3000)).toBe(3);
    expect(displayValue("base_maximum_life", 123)).toBe(123);
    expect(displayValue("critical_strike_chance_+%", 38)).toBe(38);
    expect(scaleOf("critical_strike_chance_+%")).toBeNull();
    expect(scaleOf(undefined)).toBeNull();
  });
  it("id に permyriad が無い 1 万分率 (武器のクリ率、+#% to Critical Hit Chance) も表 (csd の token) で ÷100", () => {
    expect(displayValue("local_critical_strike_chance", 645)).toBe(6.45);
    expect(displayValue("additional_base_critical_strike_chance", 50)).toBe(0.5);
    expect(displayValue("base_thorns_critical_strike_chance", 200)).toBe(2);
  });
  it("csd にしか無い換算 (ドッジロール ÷10、リザーブ効率 ×2、フォーティフィケーション ÷5) も表から", () => {
    expect(displayValue("dodge_roll_base_travel_distance", 3)).toBe(0.3);
    expect(displayValue("mana_reservation_efficiency_-2%_per_1", 2)).toBe(4);
    expect(displayValue("max_fortification_+1_per_5", 15)).toBe(3);
  });
  it("語尾の規則 (表に無い新しい stat の保険) は表と食い違わない", () => {
    const table = (scaleTable as { stats: Record<string, { div: number; digits: number }> }).stats;
    // クライアント側の例外: id は ms なのに csd は divide_by_one_hundred (GGG のデータの癖)。表が勝つので画面は正しい
    const KNOWN = new Set(["gain_a_modifier_from_enemies_in_presence_when_shapeshifting_ms"]);
    const bad: string[] = [];
    for (const [id, sc] of Object.entries(table)) {
      if (KNOWN.has(id)) continue;
      // 表を外した時の答え = 語尾の規則。表にある物は規則が同じ div を返すか、規則が黙る (null) か
      const byRule = /permyriad/.test(id) ? 100 : /per_minute/.test(id) ? 60 : /_ms(_|$)/.test(id) ? 1000 : null;
      if (byRule != null && byRule !== sc.div) bad.push(`${id}: 表 ${sc.div} / 規則 ${byRule}`);
    }
    expect(bad).toEqual([]);
  });
  it("段の幅: stats を持つ段は換算、持たない段 (poe2db 由来の表示値) はそのまま", () => {
    expect(tierDisplayRanges({ ranges: [[400, 500]], stats: ["fire_spell_additional_critical_strike_chance_permyriad"] })).toEqual([[4, 5]]);
    expect(tierDisplayRanges({ ranges: [[2, 4]], stats: [] })).toEqual([[2, 4]]);
    expect(tierDisplayRanges({ ranges: [[2, 4]] })).toEqual([[2, 4]]);
    // 数が合わない段は換算しない (対応がずれる)
    expect(tierDisplayRanges({ ranges: [[60, 120], [1, 2]], stats: ["base_life_regeneration_rate_per_minute"] })).toEqual([[60, 120], [1, 2]]);
    expect(rangeLabel({ ranges: [[1746, 1980]], stats: ["base_life_regeneration_rate_per_minute"] })).toBe("29.1-33");
    expect(rangeLabel({ ranges: [[1, 1], [10, 20]], stats: ["a", "b"] })).toBe("1 / 10-20");
  });
});

describe("代表の MOD の表示 (異界の火スペルのクリ率、毎秒再生、ms)", () => {
  it("アミュレットの異界の MOD「火スペルのクリティカルヒット率 +(4-5)%」は 4-5 (400 ではない)", () => {
    const mod = data.mods.get("Amulets/Otherworldly_FireSpellBaseCriticalChance")!;
    expect(mod).toBeTruthy();
    expect(rangeLabel(mod.tiers[0]!)).toBe("4-5");
    // 転がすのはデータの刻み (1 万分率の整数) なので 4.63% のような値になる (ゲームと同じ)。400% にはならない
    const sm = makeStageMod(mod, "suffix", 0, mulberry32(1));
    expect(sm.values[0]).toBeGreaterThanOrEqual(4);
    expect(sm.values[0]).toBeLessThanOrEqual(5);
    expect(sm.textEn).toMatch(/^\+(4(\.\d{1,2})?|5)% to Fire Spell/);
    expect(sm.textJa).toMatch(/火スペル.*(4(\.\d{1,2})?|5)%/);
    // MOD の一覧 (クラフトステージ / 動画のティア表) も同じ
    const item = freshItem(data, "Stellar Amulet", 82);
    const row = modListFor(data, item).find((r) => r.id === mod.id)!;
    expect(row.group).toBe("otherworldly");
    expect(row.tiers[0]!.text).toContain("(4-5)%");
  });
  it("アミュレットの毎秒ライフ再生 (毎分 1746-1980) は 29.1-33、取引所の下限も 29.1", () => {
    const mod = data.mods.get("Amulets/LifeRegeneration")!;
    const top = mod.tiers.length - 1;
    expect(rangeLabel(mod.tiers[top]!)).toBe("29.1-33");
    const { filters } = tradeFiltersFor(data, [{ modId: mod.id, minTierIndex: top }]);
    expect(filters[0]?.min).toBe(29.1);
  });
  it("弓のリーチ (1 万分率 900-990) は 9-9.9、武器のクリ率 (441-500) は 4.41-5", () => {
    expect(rangeLabel(data.mods.get("Bows/LifeLeechLocalPermyriad")!.tiers.at(-1)!)).toBe("9-9.9");
    expect(rangeLabel(data.mods.get("Bows/LocalBaseCriticalStrikeChance")!.tiers.at(-1)!)).toBe("4.41-5");
  });
  it("エンチャントの数値も画面の単位で転がす (フラスコのチャージ獲得 毎分 20-35 → 毎秒 0.33-0.58)", () => {
    const vals = rollEnchantValues([{ id: "generate_x_charges_for_mana_flasks_per_minute", min: 20, max: 35 }], mulberry32(3));
    expect(vals[0]).toBeGreaterThanOrEqual(0.33);
    expect(vals[0]).toBeLessThanOrEqual(0.58);
  });
});

describe("全数点検 (pnpm check:mods と同じ中身)", () => {
  const keyOf = (t: string) => normalizeModTemplate(stripRichTextMarkers(t)).toLowerCase().replace(/\s+/g, " ");
  const input = {
    bundle: bundle as unknown as Bundle,
    hidden,
    htcMods: Object.values((htc as unknown as { mods: Record<string, HtcMod> }).mods),
    extraMods: (extra as unknown as { mods: HtcMod[] }).mods,
    dropOnly: (extra as unknown as { dropOnly: Record<string, DropOnlyInfo> }).dropOnly,
    sourceRanges,
  };
  it("原本 / 計算機のエンジン / 足した MOD / 樹の MOD / ティア表 の全件で不一致 0", () => {
    const r = checkModValues(input, keyOf);
    expect(r.issues.map((i) => `${i.where} ${i.id} | ${i.expected} | ${i.actual} | ${i.why}`)).toEqual([]);
    expect(r.counts.bundleChecked).toBeGreaterThan(3000);
    expect(r.counts.htcMatched).toBeGreaterThan(10000);
    expect(r.counts.dropOnlyTiers).toBeGreaterThan(100);
  });
  it("点検は換算の間違いを見つける (換算しないまま出すと 1 万分率の MOD が不一致になる)", () => {
    const r = checkModValues({ ...input, bundle: { X: { text_en: "+(4-5)% to Fire Spell Critical Hit Chance", stats: [{ id: "unknown_stat_with_no_rule", min: 400, max: 500 }] } }, htcMods: [], extraMods: [], dropOnly: {}, sourceRanges: undefined }, keyOf);
    expect(r.issues.length).toBe(1);
    expect(r.issues[0]!.expected).toBe("400-500");
  });
  it("文の数字の読み方と、値が文に出ない stat の判定", () => {
    expect(textNumbers("+(4-5)% to Fire Spell [Critical|Critical Hit] Chance")).toEqual([[4, 5]]);
    expect(textNumbers("Adds (10-19) to (20-30) Physical Damage per 100 Life")).toEqual([[10, 19], [20, 30], [100, 100]]);
    // 「Attacks Chain an additional time」(1) は出ない、2 以上は「{0} additional times」で出る
    expect(isShown(hidden, "attacks_num_of_additional_chains", 1)).toBe(false);
    expect(isShown(hidden, "attacks_num_of_additional_chains", 2)).toBe(true);
    expect(isShown(hidden, "base_maximum_life", 10)).toBe(true);
  });
});
