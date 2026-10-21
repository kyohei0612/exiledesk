// 「外れは溜めるな」(dont-hoard-misses) の図 3 枚を日英で書く。
// 数字は記事の表 (解析君、scripts/analysis/gold-ring-suffix-ev.mjs の 300 人ずつ・±10%) をそのまま写す。表を直したらここも直す。
// 使い方: node docs/org/blog/charts/dont-hoard-misses.mjs → src/data/blog/img/dont-hoard-misses-*.{ja,en}.svg
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { C, svg, text, hbars, fmt } from "./svg.mjs";

const OUT = resolve(import.meta.dirname, "../../../../src/data/blog/img");
mkdirSync(OUT, { recursive: true });

const D = {
  A: { cost: 441, chaos: 1683, annul: 32, greater: 0, lost: 46 },
  B: { cost: 400, chaos: 1197, annul: 135, greater: 108, lost: 35 },
  C: { cost: 220, chaos: 930, annul: 57, greater: 44, lost: 25 },
  res: { cost: 111 },
};

const L = {
  ja: {
    unit: (n) => `${fmt(n)} 神`, count: (n) => `${fmt(n)} 個`, times: (n) => `${fmt(n)} 回`,
    A: "A レアリティだけカオス", B: "B 3 つまで埋める", C: "C 外れはすぐ消去", res: "C で狙いを単体耐性 T1 に",
    costTitle: "1 個あたりの費用 (神のオーブ)", costNote: "エンジンで 300 人ずつ打った平均。細い線は ±10% の幅",
    costAlt: "1 個あたりの費用: A 441 神、B 400 神、C 220 神。C の打ち方で狙いを単体耐性 T1 に替えると 111 神",
    usesTitle: "1 人あたりに使った数", usesNote: "A・B・C は上の図と同じ打ち方。桁が違うので 1 枚ずつ",
    panels: [["chaos", "カオスオーブ", "count"], ["annul", "消去のオーブ", "count"], ["greater", "高貴なオーブ (上級)", "count"], ["lost", "狙いが全部消えてやり直した回数", "times"]],
    usesAlt: "1 人あたり: カオスオーブ A 1,683 個・B 1,197 個・C 930 個、消去のオーブ A 32 個・B 135 個・C 57 個、高貴なオーブ (上級) A 0 個・B 108 個・C 44 個、狙いが全部消えた回数 A 46 回・B 35 回・C 25 回",
    eraseTitle: "消去 1 回で狙いが消える確率", target: "狙い", miss: "外れ", frac: "フラクチャー",
    rowB: "B 溜めてから消す", rowC: "C すぐ消す", pB: "1/3", pC: "1/2",
    noteB: ["1 回あたりは低いが、消す回数が多い", "消去 135 個・やり直し 35 回"],
    noteC: ["1 回あたりは高いが、消す回数が少ない", "消去 57 個・やり直し 25 回"],
    eraseAlt: "サフィックスに狙い 1 つと外れ 2 つなら消去で狙いが消える確率は 1/3、狙い 1 つと外れ 1 つなら 1/2。B は消去 135 個・やり直し 35 回、C は消去 57 個・やり直し 25 回",
  },
  en: {
    unit: (n) => `${fmt(n)} div`, count: (n) => fmt(n), times: (n) => `${fmt(n)}×`,
    A: "A Chaos for Rarity only", B: "B Fill to three", C: "C Annul misses at once", res: "C, single res T1 target",
    costTitle: "Cost per finished ring (Divine Orbs)", costNote: "Average of 300 engine runs each. Thin line = ±10%",
    costAlt: "Cost per ring: A 441 div, B 400 div, C 220 div. Method C with a single resistance T1 target instead of Rarity: 111 div",
    usesTitle: "Used per run", usesNote: "Same A, B, C as above. Separate panels because the scales differ",
    panels: [["chaos", "Chaos Orb", "count"], ["annul", "Orb of Annulment", "count"], ["greater", "Greater Exalted Orb", "count"], ["lost", "Lost all targets, restarted", "times"]],
    usesAlt: "Per run: Chaos Orb A 1,683, B 1,197, C 930; Orb of Annulment A 32, B 135, C 57; Greater Exalted Orb A 0, B 108, C 44; lost all targets A 46, B 35, C 25 times",
    eraseTitle: "Chance one Annulment hits the target", target: "Target", miss: "Miss", frac: "Fractured",
    rowB: "B Annul later", rowC: "C Annul at once", pB: "1/3", pC: "1/2",
    noteB: ["Lower per Annulment, but many more of them", "135 Annulments · 35 restarts"],
    noteC: ["Higher per Annulment, but far fewer", "57 Annulments · 25 restarts"],
    eraseAlt: "With one target and two misses in the suffixes, an Annulment hits the target 1 in 3; with one target and one miss, 1 in 2. B used 135 Annulments and restarted 35 times; C used 57 and restarted 25 times",
  },
};

const W = 560;

function cost(t) {
  const top = 30 + 22 + 18;
  const main = hbars([
    { label: t.A, value: D.A.cost, valueText: t.unit(D.A.cost), band: 0.1 },
    { label: t.B, value: D.B.cost, valueText: t.unit(D.B.cost), band: 0.1 },
    { label: t.C, value: D.C.cost, valueText: t.unit(D.C.cost), band: 0.1, hi: true },
  ], { y: top, max: 500, labelW: 190, barW: 270 });
  const y2 = top + main.height + 14;
  const res = hbars([{ label: t.res, value: D.res.cost, valueText: t.unit(D.res.cost), band: 0.1, hi: true }], { y: y2, max: 500, labelW: 190, barW: 270 });
  const h = y2 + res.height + 6;
  const body = text(20, 30, t.costTitle, { size: 17, weight: 700 }) + text(20, 52, t.costNote, { size: 13, fill: C.sub })
    + main.body + `<rect x="20" y="${y2 - 9}" width="${W - 40}" height="2" fill="${C.line}"/>` + res.body;
  return svg(W, h, t.costAlt, body);
}

function uses(t) {
  let y = 30, body = text(20, y, t.usesTitle, { size: 17, weight: 700 }) + text(20, y + 22, t.usesNote, { size: 13, fill: C.sub });
  y += 46;
  for (const [k, name, kind] of t.panels) {
    body += text(20, y + 14, name, { size: 14, fill: C.fg, weight: 700 });
    const max = Math.max(D.A[k], D.B[k], D.C[k]);
    const p = hbars(["A", "B", "C"].map((m) => ({ label: m, value: D[m][k], valueText: t[kind](D[m][k]), hi: m === "C" })),
      { y: y + 24, max, labelW: 26, barW: 430, rowH: 24, barH: 14, labelSize: 13 });
    body += p.body;
    y += 24 + p.height + 16;
  }
  return svg(W, y, t.usesAlt, body);
}

function erase(t) {
  const slot = (x, y, kind) => {
    const fill = kind === "t" ? C.hi : kind === "m" ? C.bad : C.line;
    const label = kind === "t" ? t.target : kind === "m" ? t.miss : "";
    return `<rect x="${x}" y="${y}" width="84" height="34" rx="6" fill="${fill}"/>` + (label ? text(x + 42, y + 23, label, { size: 14, fill: C.bg, anchor: "middle", weight: 700 }) : "");
  };
  const row = (y, name, slots, p, note) =>
    text(20, y + 22, name, { size: 15, weight: 700 })
    + slots.map((k, i) => slot(170 + i * 92, y, k)).join("")
    + text(W - 24, y + 26, p, { size: 26, fill: C.hi, anchor: "end", weight: 700 })
    + text(170, y + 56, note[0], { size: 13, fill: C.sub }) + text(170, y + 76, note[1], { size: 13, fill: C.fg });
  const body = text(20, 30, t.eraseTitle, { size: 17, weight: 700 })
    + row(52, t.rowB, ["t", "m", "m"], t.pB, t.noteB)
    + `<rect x="20" y="148" width="${W - 40}" height="2" fill="${C.line}"/>`
    + row(166, t.rowC, ["t", "m", "e"], t.pC, t.noteC);
  return svg(W, 262, t.eraseAlt, body);
}

for (const lang of ["ja", "en"]) {
  const t = L[lang];
  for (const [name, fn] of [["cost", cost], ["uses", uses], ["erase", erase]]) {
    const f = resolve(OUT, `dont-hoard-misses-${name}.${lang}.svg`);
    writeFileSync(f, fn(t));
    console.log(f);
  }
  console.log(`alt (${lang}):`, t.costAlt, "|", t.usesAlt, "|", t.eraseAlt);
}
