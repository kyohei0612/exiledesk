/**
 * _tree-all-bases-probe.test.ts — ツリーが全部の部位で使えるかの試し (2026-10-22 シミュ部長 11 本目、オーナー「全部のベースで使える」)。
 *
 *   pnpm exec vitest run -c scripts/_tree-all-bases-probe.config.ts
 *
 * 部位 (クラフト台のベース一覧の cls) ごとに一番高いベースで白紙の木を作り、画面と同じ部品で: 始まりの見本・棚 (オーブ・骨・エッセンス)・
 * 当たりの一覧 (modListFor)・始まりの箱の手 (カオスを当たるまで、狙い = 一覧の最初の普通の MOD の一番上の段) → 当たりを完成・精査・10 人回し。
 * 並べるだけ (見張りではない)。落ちた所・空の所が「全部のベースで使う」の直す所
 */
import { it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { modListFor, freshItem } from "../src/services/craft-stage/engine";
import { baseCatalog } from "../src/services/items/base-catalog";
import { newTree, setHand, setAim, setDone, migrateStart, type Aim } from "../src/services/simulator/tree/tree-model";
import { sampleOf, handProblem } from "../src/services/simulator/tree/tree-sample";
import { runTree } from "../src/services/simulator/tree/tree-run";
import { checkTree } from "../src/services/simulator/tree/tree-check";
import { bonesFor, essenceShelf, ORBS } from "../src/state/emulator/craft-stage-shelf";

it("全部の部位", () => {
  const data = loadPatch();
  const rows = baseCatalog(data, false);
  const best = new Map<string, (typeof rows)[number]>();
  for (const r of rows) { const b = best.get(r.cls); if (!b || r.lvl > b.lvl) best.set(r.cls, r); }
  const out: string[] = [];
  for (const [cls, r] of [...best].sort()) {
    const notes: string[] = [];
    try {
      const d = newTree(r.en, 82);
      migrateStart(d);
      d.startRandom = 3; // 始めの乱数の MOD (TreeStartPick の数。0 個のレアはカオスが打てない)
      const st = sampleOf(data, d, "start", 1);
      if (st.note) notes.push(`始まり: ${st.note}`);
      const it0 = st.item;
      const shelf = { orb: ORBS.flatMap((g) => g.keys).length, bone: bonesFor(it0).length, ess: essenceShelf(data, it0).flatMap((g) => g.keys).length };
      const list = modListFor(data, freshItem(data, r.en, 82, "rare"));
      const normal = list.filter((x) => x.group === "normal");
      const pick = normal.find((x) => x.tiers.length);
      if (!pick) { out.push(`${cls.padEnd(22)} ${r.ja} — 当たりの一覧に普通の MOD が無い (${list.length} 行)`); continue; }
      const top = pick.tiers[0]!;
      const aim: Aim = { modId: top.modId ?? pick.id, tier: Number(top.rank.slice(1)) };
      const hand = { currency: "chaos", omens: [], catalyst: null, quality: 0, repeat: { until: "hit" as const, max: null } };
      const prob = handProblem(data, it0, hand);
      if (prob) notes.push(`カオスが打てない: ${prob}`);
      setHand(d, "start", hand, "spam", [aim]);
      const hit = d.boxes.start!.outs.find((o) => d.boxes[o]!.out === "hit");
      if (hit) { setAim(d, hit, aim); setDone(d, hit, "main"); } else notes.push("当たりの箱ができない");
      const issues = checkTree(data, d);
      const run = runTree(data, d, { n: 10, seed: 1, price: () => 0 });
      out.push(`${cls.padEnd(22)} ${r.ja.padEnd(14)} 棚 オーブ ${shelf.orb} 骨 ${shelf.bone} エッセンス ${shelf.ess} · 普通の MOD ${normal.length} · 精査 ${issues.length}${issues.length ? ` [${issues.map((x) => x.kind).join(",")}]` : ""} · 10 人 完成 ${run.finished} 止まり ${run.stuck} 打ち止め ${run.capped}${notes.length ? ` · ${notes.join(" / ")}` : ""}`);
    } catch (e) {
      out.push(`${cls.padEnd(22)} ${r.ja} — 落ちた: ${(e as Error).message.slice(0, 120)}`);
    }
  }
  console.log(`部位 ${best.size}\n${out.join("\n")}`);
});
