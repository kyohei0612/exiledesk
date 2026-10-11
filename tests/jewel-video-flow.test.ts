// オーナーの参考動画 2 本のジュエルクラフトを、エミュレーターと同じ打ち方 (applyCurrency) で成功するまで回す (2026-10-11 オーナー「動画の奴再現できるかテストしてくれ」)
//   日本語: エメラルド。クリ率をフラクチャー → 消去 2 回 → カオスでクリダメ → 高貴 1 回 → 侮蔑 (外れたら消去してやり直し)
//          → 頭蓋骨 + 右手のネクロマンシー + 反響 → 左の消去で侮蔑を外す → 高貴で埋めてカオスでアタックダメージ → 獰猛
//   英語:   サファイア 2/2 (クリ率・クリダメ) を買う → 侮蔑 (外れたら買い直し) → 頭蓋骨 + 反響 (気に入らなければ光のお告げ + 消去)
//          → 左の消去で侮蔑を外す → 高貴 → カオスで最大 ES → 獰猛
// 回数を見る時は FLOW_STATS=1 で回す (費用の目安を出す)
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { revealOffers } from "../src/services/craft-stage/apply-desecrate";
import { allMods, overLimit } from "../src/services/craft-stage/stage-core";
import { mulberry32 } from "../src/services/htc/rng";
import type { StageItem, StageMod } from "../src/services/craft-stage/types";

const data = loadPatch();
const has = (ms: readonly StageMod[], id: string): boolean => ms.some((m) => m.modId.endsWith("/" + id));

interface Run { ok: boolean; uses: Record<string, number>; bases: number; log: string[]; item: StageItem }

/** 1 手打つ (弾かれた手は数えない = ゲームでも使われない)。omens は使ったお告げ (数える) */
function runner(seed: number) {
  const g = mulberry32(seed);
  const rng = () => g;
  const r: Run = { ok: false, uses: {}, bases: 0, log: [], item: null as unknown as StageItem };
  const use = (it: StageItem, key: string, omens: string[] = []): StageItem | null => {
    const x = applyCurrency(data, it, key, rng(), omens);
    if (!x.applied) return null;
    for (const k of [key.startsWith("reveal") ? "" : key, ...omens]) if (k) r.uses[k] = (r.uses[k] ?? 0) + 1;
    r.log.push(`${key}${omens.length ? ` [${omens.join(",")}]` : ""}: -${x.removed?.map((m) => m.textEn).join(" / ") ?? ""} +${x.added?.map((m) => m.textEn).join(" / ") ?? ""}`);
    return x.item;
  };
  /** 冒涜を発現: 3 つ → 無ければ反響で引き直し 3 つ → 無ければどれか (後で光のお告げで消す) */
  const reveal = (it: StageItem, want: string[]): StageItem => {
    const seedR = Math.floor(g() * 2 ** 31);
    const offers = revealOffers(data, it, mulberry32(seedR));
    const ok = (m: StageMod) => want.some((w) => m.modId.endsWith("/" + w));
    let key = "reveal:1:reroll";
    const i1 = offers.first.findIndex(ok), i2 = offers.reroll.findIndex(ok);
    if (i1 >= 0) key = `reveal:${i1 + 1}`;
    else if (i2 >= 0) key = `reveal:${i2 + 1}:reroll`;
    const x = applyCurrency(data, it, key, mulberry32(seedR), ["OmenofAbyssalEchoes"]);
    if (!x.applied) throw new Error(x.reason);
    r.uses.OmenofAbyssalEchoes = (r.uses.OmenofAbyssalEchoes ?? 0) + 1;
    r.log.push(`${key}: ${x.added![0]!.textEn}`);
    return x.item;
  };
  return { r, use, reveal, rng };
}

/** 日本語の動画 (エメラルド) */
function jpFlow(seed: number, cap = 5000): Run {
  const { r, use, reveal } = runner(seed);
  const WANT = ["JewelAttackSpeed", "JewelMovementSpeed", "JewelRadiusSpearCriticalDamage", "JewelRadiusSpearAttackSpeed", "JewelBowSpeed"];
  let it: StageItem | null = null;
  for (let n = 0; n < cap; n++) {
    // 土台: クリ率の付いたエメラルドを買って (錬金で作る) フラクチャー。クリ率が固定されなければ次の土台
    if (!it) {
      r.bases++;
      let b: StageItem | null = null;
      for (let k = 0; k < 100000 && !b; k++) {
        let x = applyCurrency(data, freshItem(data, "Emerald", 82), "alchemy", mulberry32(seed * 1e5 + r.bases * 1e3 + k)).item;
        for (let e = 0; e < 3 && allMods(x).length < 4; e++) x = applyCurrency(data, x, "exalt", mulberry32(seed * 7 + k * 13 + e)).item;
        if (allMods(x).length === 4 && has(x.suffixes, "JewelAttackCriticalChance")) b = x;
      }
      r.log.push(`買ったエメラルド #${r.bases}`);
      const f = use(b!, "fracture")!;
      if (!f.suffixes.some((m) => m.fractured && m.modId.endsWith("/JewelAttackCriticalChance"))) continue;
      it = use(use(f, "annul")!, "annul")!;
      continue;
    }
    const P = it.prefixes, S = it.suffixes;
    const contemptOk = has(P, "Emotion_CraftedJewelAdditionalSuffixAllowed"), contemptBad = has(S, "Emotion_CraftedJewelAdditionalPrefixAllowed");
    const desecrated = S.find((m) => m.desecrated);
    if (has(P, "JewelAttackDamage") && has(P, "Emotion_CraftedJewelSuffixEffect") && overLimit(it, "suffix")) { r.ok = true; break; }
    if (contemptBad) { it = use(it, "annul") ?? it; continue; } // 外れ: 消去して戻る
    if (overLimit(it, "suffix")) {
      // 侮蔑を外した後: 高貴で埋めて、カオスでアタックダメージ → 獰猛
      if (P.length < 2) it = use(it, "exalt") ?? it;
      else if (!has(P, "JewelAttackDamage")) it = use(it, "chaos") ?? it;
      else it = use(it, "emotion:Potent Liquid Ferocity") ?? it;
      continue;
    }
    // 冒涜が狙いでなければ光のお告げ + 消去で冒涜だけ消してやり直し
    if (desecrated && !desecrated.unrevealed && !WANT.some((w) => desecrated.modId.endsWith("/" + w))) { it = use(it, "annul", ["OmenofLight"]) ?? it; continue; }
    if (contemptOk && S.length === 3 && desecrated && !desecrated.unrevealed) { it = use(it, "annul", ["OmenofSinistralAnnulment"]) ?? it; continue; }
    if (desecrated?.unrevealed) { it = reveal(it, WANT); continue; }
    if (contemptOk && S.length === 2) { it = use(it, "desecrate", ["OmenofDextralNecromancy"]) ?? it; continue; }
    // 侮蔑の前: サフィはクリ率 (固定) + クリダメ、プレ 1 つ
    if (!has(S, "JewelAttackCriticalDamage")) { it = use(it, !allMods(it).some((m) => !m.fractured) ? "exalt" : allMods(it).length > 2 ? "annul" : "chaos") ?? it; continue; }
    if (S.length > 2) { it = use(it, "annul", ["OmenofDextralAnnulment"]) ?? it; continue; }
    if (P.length === 0) { it = use(it, "exalt") ?? it; continue; }
    if (P.length > 1) { it = use(it, "annul", ["OmenofSinistralAnnulment"]) ?? it; continue; }
    it = use(it, "emotion:Potent Liquid Contempt") ?? it;
  }
  r.item = it!;
  return r;
}

/** 英語の動画 (サファイア) */
function enFlow(seed: number, cap = 5000): Run {
  const { r, use, reveal } = runner(seed);
  const WANT = ["JewelIncreasedDuration", "JewelManaRegeneration"];
  let it: StageItem | null = null;
  for (let n = 0; n < cap; n++) {
    // 土台: 2/2 でサフィがクリ率・クリダメのサファイアを買う (作り方は数えない、買った数だけ)
    if (!it) {
      r.bases++;
      for (let k = 0; k < 100000 && !it; k++) {
        let b = applyCurrency(data, freshItem(data, "Sapphire", 82), "alchemy", mulberry32(seed * 1e5 + r.bases * 1e3 + k)).item;
        for (let e = 0; e < 3 && allMods(b).length < 4; e++) b = applyCurrency(data, b, "exalt", mulberry32(seed * 7 + k * 13 + e)).item;
        if (b.prefixes.length === 2 && has(b.suffixes, "JewelCriticalChance") && has(b.suffixes, "JewelCriticalDamage")) it = b;
      }
      r.log.push(`買ったサファイア #${r.bases}`);
      // 侮蔑: プレに当たって「サフィックス +1 個」なら続ける、外れたら次のサファイア
      const c = use(it!, "emotion:Potent Liquid Contempt")!;
      it = has(c.prefixes, "Emotion_CraftedJewelAdditionalSuffixAllowed") ? c : null;
      continue;
    }
    const P = it.prefixes, S = it.suffixes;
    const desecrated = S.find((m) => m.desecrated);
    if (has(P, "JewelEnergyShield") && has(P, "Emotion_CraftedJewelSuffixEffect") && overLimit(it, "suffix")) { r.ok = true; break; }
    if (overLimit(it, "suffix")) {
      if (P.length < 2) it = use(it, "exalt") ?? it;
      else if (!has(P, "JewelEnergyShield")) it = use(it, "chaos") ?? it;
      else it = use(it, "emotion:Potent Liquid Ferocity") ?? it;
      continue;
    }
    if (desecrated?.unrevealed) { it = reveal(it, WANT); continue; }
    if (desecrated && !WANT.some((w) => desecrated.modId.endsWith("/" + w))) { it = use(it, "annul", ["OmenofLight"]) ?? it; continue; }
    if (desecrated) { it = use(it, "annul", ["OmenofSinistralAnnulment"]) ?? it; continue; }
    it = use(it, "desecrate") ?? it;
  }
  r.item = it!;
  return r;
}

describe("参考動画のジュエルクラフトを最後まで", () => {
  it("日本語の動画 (エメラルド): クリ率固定・クリダメ・冒涜のサフィ 3 つ + アタックダメージ + 獰猛", () => {
    for (const seed of [1, 2, 3]) {
      const r = jpFlow(seed);
      expect(r.ok).toBe(true);
      expect(r.item.suffixes.map((m) => m.modId.split("/")[1])).toEqual(expect.arrayContaining(["JewelAttackCriticalChance", "JewelAttackCriticalDamage"]));
      expect(r.item.suffixes).toHaveLength(3);
    }
  });
  it("英語の動画 (サファイア): クリ率・クリダメ・冒涜のサフィ 3 つ + 最大 ES + 獰猛", () => {
    for (const seed of [1, 2, 3]) {
      const r = enFlow(seed);
      expect(r.ok).toBe(true);
      expect(r.item.suffixes).toHaveLength(3);
    }
  });
  it.runIf(process.env.FLOW_STATS)("回数の目安", () => {
    for (const [name, f] of [["jp", jpFlow], ["en", enFlow]] as const) {
      const N = 200, sum: Record<string, number[]> = {};
      let fail = 0;
      for (let i = 0; i < N; i++) {
        const r = f(1000 + i);
        if (!r.ok) { if (!fail++) console.log(name, "失敗の例", JSON.stringify(r.uses), "\n" + r.log.slice(-25).join("\n")); continue; }
        for (const [k, v] of Object.entries({ ...r.uses, bases: r.bases })) (sum[k] ??= []).push(v);
      }
      const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
      console.log(name, "fail", fail, Object.entries(sum).map(([k, a]) => `${k}: 平均 ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)} 中央 ${med(a)}`).join("\n"));
      const one = f(7);
      console.log(name, "例", one.ok, JSON.stringify(one.uses), "土台", one.bases, "\n" + one.log.filter((l) => !l.startsWith("chaos")).join("\n") + "\n完成:\n" + [...one.item.prefixes, ...one.item.suffixes].map((m) => `${m.side} ${m.textEn}${m.fractured ? " (固定)" : ""}${m.desecrated ? " (冒涜)" : ""}${m.crafted ? " (デリリウム)" : ""}`).join("\n"));
    }
  }, 600000);
});
