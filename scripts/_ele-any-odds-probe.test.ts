/**
 * _ele-any-odds-probe.test.ts — 「いずれかの元素耐性」(S-10h ⑥) の高貴 1 回の当たりを、付いた元素ごとの代表の品で並べる台本 (2026-11-15 シミュ部長 49)。
 *
 *   pnpm exec vitest run -c scripts/_ele-any-odds-probe.config.ts
 *
 * 品はジンの突き合わせ (共有 progress/jin-eleany-exalt-check.md) と同じ形 = 金のアミュレット Lv82 レア、プレに命 T5。狙い = いずれか T2 以上。
 * 数はエンジンの addHitOdds (ちょうど)。並べるだけ (見張りではない)
 */
import { it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { addHitOdds, freshItem, makeStageMod, tierIndexOf } from "../src/services/craft-stage/engine";

it("いずれかの元素耐性の高貴 1 回", () => {
  const d = loadPatch();
  const mk = (id: string, T: number) => { const m = d.mods.get(id)!; return makeStageMod(m, m.type === "suffix" ? "suffix" : "prefix", tierIndexOf(d, id, T), () => 0.5); };
  const base = freshItem(d, "Gold Amulet", 82, "rare"), life = mk("Amulets/IncreasedLife", 5);
  const item = (ele: string | null, T = 1) => ({ ...base, prefixes: [life], suffixes: ele ? [mk(ele, T)] : [] });
  const F = "Amulets/FireResistance", C = "Amulets/ColdResistance", L = "Amulets/LightningResistance";
  const tgt = (n: number) => ({ modId: F, minTierIndex: tierIndexOf(d, F, 2), anyEle: n });
  const p = (it: ReturnType<typeof item>, n: number) => `${((addHitOdds(d, it, "exalt", [], [tgt(n)], { data: d, sameText: true })?.p ?? NaN) * 100).toFixed(3)}%`;
  console.log(`A 命 T5 だけ・1 つ目: ${p(item(null), 1)} (ジンの表 3.644%)`);
  console.log(`B 冷気 T5 (段の下) が付いた品・1 つ目: ${p(item(C, 5), 1)} (ジンの表 2.553%)`);
  console.log(`B' 火 T5 が付いた品・1 つ目: ${p(item(F, 5), 1)}`);
  console.log(`火 T1 で 1 つ目が付いた箱 → 2 つ目: ${p(item(F, 1), 2)}`);
  console.log(`冷気 T1 で 1 つ目が付いた箱 → 2 つ目: ${p(item(C, 1), 2)}`);
  console.log(`雷 T1 で 1 つ目が付いた箱 → 2 つ目: ${p(item(L, 1), 2)}`);
});
