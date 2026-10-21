/**
 * _tree-check-probe.test.ts — ツリーのルート精査 (tree-check.ts) の品質のチェックを、組んだ木で並べて見る台本 (2026-10-21 シミュ部長)。
 *
 *   pnpm exec vitest run -c scripts/_tree-check-probe.config.ts
 *
 * 見る物: 触媒の品質が当たりに効かない / 前に別の種類の触媒 (品質は使い切るので穴にならない) / 聖別の後の手 (エンジンの理由で打てない) と、精査にかかる時間。
 * 合否は付けない (出た穴を並べるだけ。見張りではない)
 */
import { it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { CATALYSTS } from "../src/services/craft-stage/engine";
import { checkTree } from "../src/services/simulator/tree/tree-check";
import type { Hand, TreeBox, TreeDoc } from "../src/services/simulator/tree/tree-model";

const data = loadPatch();
const A = (m: string, t: number) => ({ modId: `Rings/${m}`, tier: t });
const mk = (id: string, out: TreeBox["out"], parent: string | null, extra: Partial<TreeBox> = {}): TreeBox => ({ id, x: 0, y: 0, out, aim: null, hand: null, outs: [], back: null, done: null, parent, ...extra });
const H = (currency: string, omens: string[] = [], catalyst: string | null = null): Hand => ({ currency, omens, catalyst, quality: 0, catalystCount: 0, repeat: null } as Hand);
const doc = (boxes: Record<string, TreeBox>): TreeDoc => ({ schema: "exiledesk-tree/0", base: "Gold Ring", itemLevel: 82, fracture: A("Special_genesis_tree_caster_SpellDamage", 2), seq: 50, boxes });
const CAT = "OmenofCatalysingExaltation";

/** 始まり → 高貴 (触媒、カタリスト cat) → 当たり 全耐性 (完成) / 外れ → 始まりへ */
function catalysed(cat: string, before?: string): TreeDoc {
  const b: Record<string, TreeBox> = {
    start: mk("start", "start", null, { hand: H("exalt"), outs: ["s1", "s2"] }),
    s1: mk("s1", "hit", "start", { aim: A("IncreasedCastSpeed", 3), hand: H("exalt", [CAT], cat), outs: ["h1", "j1"] }),
    s2: mk("s2", "junk", "start", { back: "start" }),
    h1: mk("h1", "hit", "s1", { aim: A("AllResistances", 3), done: "main" }),
    j1: mk("j1", "junk", "s1", { back: "start" }),
  };
  if (before) { b.start!.hand = H("exalt", [CAT], before); }
  return doc(b);
}
/** 始まり → 高貴 → 当たり → 神 + 聖別 → (結果の箱) → 高貴 */
function sanctified(): TreeDoc {
  return doc({
    start: mk("start", "start", null, { hand: H("exalt"), outs: ["s1", "s2"] }),
    s1: mk("s1", "hit", "start", { aim: A("IncreasedCastSpeed", 3), hand: H("exalt"), outs: ["t1", "t2"] }),
    s2: mk("s2", "junk", "start", { back: "start" }),
    t1: mk("t1", "hit", "s1", { aim: A("AllResistances", 3), hand: H("divine", ["OmenofSanctification"]), outs: ["u1"] }),
    t2: mk("t2", "junk", "s1", { back: "start" }),
    u1: mk("u1", "junk", "t1", { hand: H("exalt"), outs: ["v1", "v2"] }),
    v1: mk("v1", "hit", "u1", { aim: A("FireResistance", 3), done: "main" }),
    v2: mk("v2", "junk", "u1", { back: "start" }),
  });
}

/** 始まり → 高貴 (狙い無し) → 打った後 → 高貴 → 当たり (完成)。mark = 打った後の箱に × を付ける MOD */
function free(mark?: string): TreeDoc {
  return doc({
    start: mk("start", "start", null, { hand: { ...H("exalt"), free: true }, outs: ["a1"] }),
    a1: mk("a1", "any", "start", { hand: H("exalt"), outs: ["h1", "j1"], ...(mark ? { unwanted: [mark] } : {}) }),
    h1: mk("h1", "hit", "a1", { aim: A("AllResistances", 3), done: "main" }),
    j1: mk("j1", "junk", "a1", { back: "start" }),
  });
}

it("ルート精査の品質", () => {
  console.log("カタリスト:", CATALYSTS.map((c) => c.tag).join(" "));
  const cases: Array<[string, TreeDoc]> = [
    ...CATALYSTS.map((c): [string, TreeDoc] => [`触媒 ${c.tag} → 全耐性`, catalysed(`catalyst_${c.tag}`)]),
    [`前に attack、後に ${CATALYSTS[1]!.tag}`, catalysed(`catalyst_${CATALYSTS[1]!.tag}`, `catalyst_${CATALYSTS[0]!.tag}`)],
    ["聖別の後に高貴", sanctified()],
    ["狙い無しの高貴 → 打った後 → 高貴", free()],
    ["狙い無しの後に × (全部の MOD に付けたつもりで、付いた物を全部印)", free("*")],
  ];
  for (const [name, d] of cases) {
    const t0 = performance.now();
    if (d.boxes.a1?.unwanted?.[0] === "*") d.boxes.a1.unwanted = [...data.mods.keys()].filter((k) => k.startsWith("Rings/"));
    const out = checkTree(data, d);
    console.log(`\n■ ${name} (${(performance.now() - t0).toFixed(0)} ms)`);
    for (const x of out) console.log(`  [${x.boxId}] ${x.kind}: ${x.text}`);
  }
});
