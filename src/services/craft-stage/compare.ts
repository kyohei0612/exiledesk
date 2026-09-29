/**
 * compare.ts — アイテム 2 つの違い (POE2Tube 要望 ⑪-3「装備を入れ替えるかの見方」、2026-09-29)
 *
 * MOD の文面の数値を # にした形 (同じ効果) で揃えて、行ごとに「増えた (B だけ) / 変わった (両方にあって数値が違う) / 消えた (A だけ)」に分ける。
 * 数値は MOD の values (転がった値)。エンチャント・固有の効果は比べない (MOD だけ)。
 * 要望 ⑭「数値 (+2から3 等) は必ず見えるように」: 数値が 2 つある MOD (「#から#の物理ダメージ」) は両方を持つ。
 * 要望 ㉑ (2026-09-30、撮った本編で読みにくかった): 消えた MOD の数字にマイナスを付けない (元の数字のまま「−」の印)、
 * 差が 0 の行は出さない、並びは 増えた → 変わった → 消えた。数値の書き方は画面 (VideoCompare) の lineText。
 */
import type { StageItem } from "./types";
import { allMods } from "./stage-core";

export interface DiffLine {
  /** 日本語の文面 (数値は #) */
  text: string;
  kind: "added" | "changed" | "removed";
  /** A (今の装備) の数値。増えた行は [] */
  a: number[];
  /** B (入れ替える物) の数値。消えた行は [] */
  b: number[];
  /** 数値ごとの差 (B − A)。増えた行は B の値、消えた行は A の値 (符号はそのまま。色は kind で決める) */
  deltas: number[];
  /** 並べる大きさ (1 つ目の差の大きさ) */
  delta: number;
}

/** 転がった値だけを順に # にする (「1 体ごとに」の 1 などは残す) */
function templateOf(text: string, values: readonly number[]): string {
  let out = text;
  let from = 0;
  for (const v of values) {
    const str = String(Math.abs(v));
    const i = out.indexOf(str, from);
    if (i < 0) continue;
    out = out.slice(0, i) + "#" + out.slice(i + str.length);
    from = i + 1;
  }
  return out;
}

const round = (v: number): number => Math.round(v * 100) / 100;
const ORDER = { added: 0, changed: 1, removed: 2 } as const;

export function diffItems(a: StageItem, b: StageItem): DiffLine[] {
  const pick = (it: StageItem) => {
    const m = new Map<string, { text: string; v: number[] }>();
    for (const x of allMods(it)) {
      if (x.unrevealed) continue;
      const k = templateOf(x.textEn, x.values);
      const cur = m.get(k);
      const v = x.values.map((n, i) => (cur?.v[i] ?? 0) + n);
      m.set(k, { text: templateOf(x.textJa, x.values), v });
    }
    return m;
  };
  const A = pick(a);
  const B = pick(b);
  const out: DiffLine[] = [];
  for (const k of new Set([...A.keys(), ...B.keys()])) {
    const x = A.get(k);
    const y = B.get(k);
    if (x && y) {
      const deltas = y.v.map((n, i) => round(n - (x.v[i] ?? 0)));
      // 差が 0 の行 (左右で同じ MOD) は出さない (要望 ㉑)
      if (deltas.every((d) => d === 0)) continue;
      out.push({ text: y.text, kind: "changed", a: x.v.map(round), b: y.v.map(round), deltas, delta: deltas.find((d) => d !== 0) ?? 0 });
    } else if (y) {
      out.push({ text: y.text, kind: "added", a: [], b: y.v.map(round), deltas: y.v.map(round), delta: round(y.v[0] ?? 0) });
    } else if (x) {
      out.push({ text: x.text, kind: "removed", a: x.v.map(round), b: [], deltas: x.v.map(round), delta: round(x.v[0] ?? 0) });
    }
  }
  // 増えた → 変わった → 消えた、その中は差の大きい順
  return out.sort((p, q) => ORDER[p.kind] - ORDER[q.kind] || Math.abs(q.delta) - Math.abs(p.delta));
}

/**
 * 差の列の 1 行を「名前」と「数値」に分ける (2026-09-30 オーナー「真ん中の奴、ゴチャってる」)。
 * MOD の文面は変えず、よくある言い回しだけ 名前 / 数値 に分ける:
 *   「アタックスピードが#%増加する」→ 名前「アタックスピード」数値「+#%」、「#から#の物理ダメージを追加する」→「物理ダメージ」「+#〜#」、
 *   「要求能力値が#%減少する」→「要求能力値」「−#%」、「命中力 +#」→「命中力」「+#」、
 *   「倒した敵1体ごとに#のマナを獲得する」→「マナ」「+#」補足「倒した敵1体ごと」。
 * 当たらない文は名前 = 文全体 (数値を入れた物)、数値は無し。値の # は呼ぶ側が埋める
 */
export function splitLine(text: string): { name: string; value: string; note: string } | null {
  const rules: Array<[RegExp, (m: RegExpExecArray) => { name: string; value: string; note: string }]> = [
    [/^#から#の(.+?)ダメージを(?:アタックに)?追加する$/, (m) => ({ name: `${m[1]}ダメージ`, value: "+#〜#", note: "" })],
    [/^(.+?)が#%(?:増加|上昇)する$/, (m) => ({ name: m[1]!, value: "+#%", note: "" })],
    [/^(.+?)が#%(?:減少|低下)する$/, (m) => ({ name: m[1]!, value: "−#%", note: "" })],
    [/^(.+?)ごとに#の(.+?)を獲得する$/, (m) => ({ name: m[2]!, value: "+#", note: `${m[1]}ごと` })],
    [/^(.+?) ([+-]?)#(%?)$/, (m) => ({ name: m[1]!, value: `${m[2] || "+"}#${m[3]}`, note: "" })],
  ];
  for (const [re, f] of rules) {
    const m = re.exec(text);
    if (m) return f(m);
  }
  return null;
}
