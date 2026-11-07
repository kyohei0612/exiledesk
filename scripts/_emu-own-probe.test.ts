/**
 * エミュの画面の自前の判定をエンジンに寄せた前後の照らし (2026-11-07 エミュ部長 emu-own)。前 = 寄せる前の画面の式をここに写した物、
 * 後 = 今の画面が呼ぶエンジンの関数。全部のベース × ノーマル / マジック / レアで、答えが変わる所を数えて出す (変わる組は理由を見る)。
 *   ① 棚のエッセンスの段の絞り (CurrencyShelf.vue essByRarity → planSpec の offTarget)
 *   ② 棚のお告げの掛け替え (state/craft-stage.ts の OMEN_EXCLUSIVE → toggleOmen)
 *   ③ 発現の候補で要求レベルが上がるか (RevealPanel.vue raisesTo の MOD レベル × 0.8 → reqOfItem)
 * 回し方: pnpm -s exec vitest run -c scripts/_emu-own-probe.config.ts
 */
import { expect, it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { revealOffers } from "../src/services/craft-stage/apply-desecrate";
import { planSpec } from "../src/services/craft-stage/spec/run-spec";
import { parseKey } from "../src/services/craft-stage/key";
import { ALL_OMEN_SPECS, OMEN_EXCLUSIVE, toggleOmen } from "../src/services/craft-stage/spec/omen-layer";
import { reqOfItem } from "../src/services/craft-stage/stage-bases";
import { essenceShelf, bonesFor } from "../src/state/for-share/craft-stage-shelf";
import { mulberry32 } from "../src/services/htc/rng";
import type { StageItem, StageMod } from "../src/services/craft-stage/types";

const data = loadPatch();
const ILVL = 82;
const names = [...new Set([...data.bases.values()].flatMap((b) => (b.bases?.length ? [b.bases[0]!] : [])))];

/** 前: 画面の自前の式 */
function oldEss(ks: string[], r: string | undefined): string[] {
  const perfect = (k: string): boolean => k.startsWith("essence:perfect:");
  const out = r === "rare" ? ks.filter(perfect) : r === "normal" || r === "magic" ? ks.filter((k) => !perfect(k)) : ks;
  return out.length ? out : ks;
}
/** 後: 今の CurrencyShelf.vue と同じ (エンジンの planSpec に聞く) */
function newEss(ks: string[], it: StageItem): string[] {
  const fit = ks.filter((k) => planSpec(data, it, k, [])?.offTarget === false);
  if (fit.length) return fit;
  const plain = ks.filter((k) => { const pk = parseKey(k); return !(pk.type === "essence" && pk.tier === "perfect"); });
  return plain.length ? plain : ks;
}
function itemsOf(base: string): StageItem[] {
  const n = freshItem(data, base, ILVL);
  const m = applyCurrency(data, n, "transmute", mulberry32(3)).item;
  const r = applyCurrency(data, n, "alchemy", mulberry32(5)).item;
  const c = { ...r, corrupted: true };
  return [n, m, r, c];
}

it("① エッセンスの段の絞り: 前後の違い", () => {
  let groups = 0;
  const diff: string[] = [];
  for (const b of names) {
    for (const it of itemsOf(b)) {
      for (const g of essenceShelf(data, it)) {
        groups++;
        const a = oldEss(g.keys, it.rarity), z = newEss(g.keys, it);
        if (a.join() !== z.join()) diff.push(`${b} ${it.rarity}${it.corrupted ? "(コラプト)" : ""} ${g.kind}: 前 [${a.map((k) => k.split(":")[1]).join(",")}] 後 [${z.map((k) => k.split(":")[1]).join(",")}]`);
      }
    }
  }
  console.log(`① 比べた節 ${groups}、違い ${diff.length}\n${[...new Set(diff.map((d) => d.replace(/^\S+ /, "")))].slice(0, 40).join("\n")}`);
  expect(groups).toBeGreaterThan(0);
});

it("② お告げの掛け替え: 前後の違い", () => {
  const keys = ALL_OMEN_SPECS.map((o) => o.key);
  const oldToggle = (held: string[], id: string): string[] => {
    if (held.includes(id)) return held.filter((o) => o !== id);
    const rivals = new Set(OMEN_EXCLUSIVE.filter((g) => g.includes(id)).flat());
    return [...held.filter((o) => !rivals.has(o)), id];
  };
  let n = 0, diff = 0;
  // 2 枚・3 枚の順の全部 (掛ける・外すの続き)
  for (const a of keys) for (const b of keys) for (const c of keys) {
    let x: string[] = [], y: string[] = [];
    for (const k of [a, b, c]) { x = oldToggle(x, k); y = toggleOmen(y, k); n++; if (x.join() !== y.join()) diff++; }
  }
  console.log(`② 比べた手 ${n}、違い ${diff}`);
  expect(diff).toBe(0);
});

it("③ 発現の候補の要求レベル: 前後の違い", () => {
  let n = 0;
  const diff: string[] = [];
  for (const b of names) {
    const r = applyCurrency(data, freshItem(data, b, ILVL), "alchemy", mulberry32(9)).item;
    for (const bone of bonesFor(r)) {
      for (let s = 1; s <= 3; s++) {
        const d = applyCurrency(data, r, bone, mulberry32(s));
        if (!d.applied) continue;
        const it = d.item, o = revealOffers(data, it, mulberry32(s + 11));
        const now = reqOfItem(it)?.level ?? 0;
        for (const m of [...o.first, ...o.reroll] as StageMod[]) {
          n++;
          const before = Math.floor(m.modLevel * 0.8) > now ? Math.floor(m.modLevel * 0.8) : null;
          const side = m.side === "prefix" ? "prefixes" : "suffixes";
          const need = reqOfItem({ ...it, [side]: [...it[side], { ...m, unrevealed: false }] })?.level ?? 0;
          const after = need > now ? need : null;
          if (before !== after) diff.push(`${b} ${bone} ${m.modId}: 前 ${before} 後 ${after}`);
        }
      }
    }
  }
  console.log(`③ 比べた候補 ${n}、違い ${diff.length}\n${diff.slice(0, 20).join("\n")}`);
  expect(n).toBeGreaterThan(0);
});

it("④ 狙うの「回し方」の文の分け: 前 (kindOf の 4 つ) と後 (aimChainMode) の違い", async () => {
  const { kindOf } = await import("../src/services/craft-stage/apply-currency");
  const { aimChainMode } = await import("../src/services/craft-stage/aim-odds");
  const { ORBS } = await import("../src/state/for-share/craft-stage-shelf");
  const { REVEAL } = await import("../src/services/emulator/emu-engine");
  const before = (k: string): string => (k === REVEAL ? "reveal" : ({ desecrate: "bone", chaos: "spam", exalt: "add" } as Record<string, string>)[kindOf(k)] ?? "keep");
  const keys = new Set<string>([REVEAL, ...ORBS.flatMap((g) => g.keys)]);
  for (const b of names) {
    const r = applyCurrency(data, freshItem(data, b, ILVL), "alchemy", mulberry32(9)).item;
    for (const k of [...bonesFor(r), ...essenceShelf(data, r).flatMap((g) => g.keys)]) keys.add(k);
  }
  const diff = [...keys].flatMap((k) => { const a = before(k), z = aimChainMode({ currency: k, omens: [] }); return a === z ? [] : [`${k}: 前 ${a} 後 ${z}`]; });
  console.log(`④ 比べた鍵 ${keys.size}、違い ${diff.length}\n${diff.join("\n")}`);
  expect(keys.size).toBeGreaterThan(0);
});

it("⑤ 始めの状態を組む窓の付け方の可否: 前 (画面の自前 + 打った後は useReason) と後 (forceReason) の違い", async () => {
  const { forceReason, useReason } = await import("../src/services/craft-stage/apply-currency");
  const { forceKey } = await import("../src/services/craft-stage/apply-force");
  const { startFrom } = await import("../src/services/craft-stage/run-plan");
  type Way = "n" | "d" | "f";
  const tally = new Map<string, number>();
  let n = 0;
  for (const b of names.slice(0, 20)) {
    const base = freshItem(data, b, ILVL);
    const pools = base.cls.pools;
    const normal = [...pools.normal.prefixes, ...pools.normal.suffixes].slice(0, 6), desec = [...(pools.desecrated?.prefixes ?? []), ...(pools.desecrated?.suffixes ?? [])].slice(0, 4);
    if (!normal.length) continue;
    const fr = normal[0]!, de = desec[0];
    // 状態: start = 始めの状態 (打つ前)、after = 打った後
    const states: Array<{ name: string; start: boolean; item: StageItem }> = [
      { name: "始め 空", start: true, item: startFrom(data, b, ILVL, { mods: [] }, 1) },
      { name: "始め フラクチャー 1", start: true, item: startFrom(data, b, ILVL, { mods: [{ mod: fr, tier: null as unknown as string, fractured: true }] }, 1) },
      ...(de ? [{ name: "始め 冒涜 1", start: true, item: startFrom(data, b, ILVL, { mods: [{ mod: de, tier: null as unknown as string, desecrated: true }] }, 1) }] : []),
      { name: "打った後 レア", start: false, item: applyCurrency(data, freshItem(data, b, ILVL), "alchemy", mulberry32(4)).item },
    ];
    for (const st of states) {
      const it = st.item;
      const hasFr = it.prefixes.concat(it.suffixes).some((m) => m.fractured), hasDe = it.prefixes.concat(it.suffixes).some((m) => m.desecrated);
      for (const [group, ids] of [["normal", normal], ["desecrated", desec]] as const) {
        for (const id of ids) {
          const md = data.mods.get(id); if (!md) continue;
          const rank = `T${md.tiers.length}`;
          const desecratedPool = group === "desecrated";
          const plain: Way = desecratedPool ? "n" : "n";
          const list: Array<{ flag: Way; block: string | null }> = [
            { flag: plain, block: desecratedPool ? "pool" : null },
            { flag: "d", block: hasDe ? "1 つまで" : null },
            { flag: "f", block: desecratedPool ? "固定できない" : hasFr ? "1 つまで" : null },
          ];
          for (const w of list) {
            n++;
            const key = forceKey(id, rank, w.flag);
            const before = !!w.block || (!st.start && !!useReason(data, it, key, []));
            const after = !!forceReason(data, it, key);
            if (before !== after) { const k = `${st.name} ${group} ${w.flag}: 前 ${before ? "×" : "○"} 後 ${after ? "× " + forceReason(data, it, key)!.text : "○"}${before ? " (前の理由 " + (w.block ?? useReason(data, it, key, [])) + ")" : ""}`; tally.set(k, (tally.get(k) ?? 0) + 1); }
          }
        }
      }
    }
  }
  console.log(`⑤ 比べた付け方 ${n}、違い ${[...tally.values()].reduce((a, x) => a + x, 0)}\n${[...tally].map(([k, c]) => `${c} 件 ${k}`).slice(0, 30).join("\n")}`);
  expect(n).toBeGreaterThan(0);
});

it("⑥ 狙うの当たり: modId だけ (前) と sameText (後) の数の違い", async () => {
  const { aimChain, aimCombos, aimDone } = await import("../src/services/craft-stage/aim-odds");
  const { ORBS } = await import("../src/state/for-share/craft-stage-shelf");
  const hit = { data, sameText: true };
  let combos = 0, moved = 0, maxGap = 0, doneDiff = 0, items = 0;
  const gaps: string[] = [];
  // 狙い = 同じ部位に「同じ系統・同じ文の別 modId」がある MOD (違いが出うるのはここだけ。11-07 に全部位を数えて 6 組: ベルト・メイスの冒涜 MOD の 2 つ版とハンドラップ専用)
  const AIMS: Array<[string, string]> = [
    ["Belts", "Belts/Desecrated_FlaskChargesUsed"], ["Belts", "Belts/Desecrated_FlaskChargesUsed_2"],
    ["OneHand_Maces", "OneHand_Maces/Desecrated_ManaCostEfficiency"], ["TwoHand_Maces", "TwoHand_Maces/Desecrated_ManaCostEfficiency_2"],
    ["Gloves_dex_int", "Gloves_dex_int/LifeLeechPermyriad"],
  ];
  for (const [cls, id] of AIMS) {
    const b = data.bases.get(cls)?.bases?.find((x) => /wrap/i.test(x)) ?? data.bases.get(cls)?.bases?.[0];
    if (!b) continue;
    const it = applyCurrency(data, freshItem(data, b, ILVL), "alchemy", mulberry32(7)).item;
    items++;
    const ts = [{ modId: id, minTierIndex: 0 }];
    if (aimDone(it, ts) !== aimDone(it, ts, hit)) doneDiff++;
    const keys = [...ORBS.flatMap((g) => g.keys), ...bonesFor(it)];
    for (const c of aimCombos(data, it, keys)) {
      combos++;
      const a = aimChain(data, it, ts, c, 400, 17), z = aimChain(data, it, ts, c, 400, 17, hit);
      if (a !== z) { moved++; const g = Math.abs(z - a); if (g > maxGap) maxGap = g; if (gaps.length < 12) gaps.push(`${b} ${id} ${c.currency}${c.omens.length ? "+" + c.omens.join("+") : ""}: ${(a * 100).toFixed(1)}% → ${(z * 100).toFixed(1)}%`); }
    }
  }
  console.log(`⑥ 品 ${items}・打ち方 ${combos} のうち確率が動いた ${moved} (最大 ${(maxGap * 100).toFixed(1)} 点)・今もう付いているかの違い ${doneDiff}\n${gaps.join("\n")}`);
  expect(items).toBeGreaterThan(0);
});
