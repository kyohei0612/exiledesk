/**
 * daily-hit.ts — デイリーの完成の物差しの中核: 値の下の端で比べる (D-35b ⑤、スイッチ dailyLowHit)。
 * 同じ MOD (同じ系統・数字を抜いた文が同じ行) なら、付いた MOD の段の幅の下の端 ≥ お題の段の幅の下の端 で当たり。
 * 実際に付いた値・品質・カタリストは見ない (同じ段なら必ず同じ結果 = 値の運で完成が変わらない)。
 * 行が複数ある MOD は狙いと同じ文の行だけ比べる (合金のおまけの行は問わない)。
 * オーナー 11-12「超越の合金さしたら下限値一緒だから完成になるのかな？ってイメージだね」
 * 文は言語に依らないようデータの英語の文で比べる。呼ぶのは daily-cost.ts の dailyHit だけ (挑戦の画面・提出・検算が同じ所を通る)
 */
import type { PatchData } from "../../services/craft-stage/engine";
import { tierDisplayRanges } from "../../services/mods/stat-scale";

type ModOf = NonNullable<ReturnType<PatchData["mods"]["get"]>>;
/** 文の 1 行: 数字を抜いた形・値の下の端 (出てきた順)・守りの種類 (アーマー / 回避 / ES) の集まり・能力値を 1 つに畳んだ形 */
type Row = { shape: string; lows: number[]; defs: string[]; attr: string; attrAny: boolean };

const NUM = /\((-?\d+(?:\.\d+)?)[-–](-?\d+(?:\.\d+)?)\)|\d+(?:\.\d+)?|#/g;
const DEF_WORD = "(?:Armour|Evasion Rating|Evasion|Energy Shield)";
/** 守りの種類の並び (「Armour, Evasion and Energy Shield」「Evasion and Energy Shield」「Energy Shield」) */
const DEF_LIST = new RegExp(`${DEF_WORD}(?:(?:, | and | or )${DEF_WORD})*`, "g");
const ATTR_WORD = "(?:Strength|Dexterity|Intelligence)";
/** 「または」で並べた能力値 (無限のエッセンスの「Strength, Dexterity or Intelligence」)。付く能力値は MOD ごとに 1 つで、どれかは系統で決まる。「and」の並び (両方付く別の MOD) は入れない */
const ATTR_ANY = new RegExp(`${ATTR_WORD}(?:, ${ATTR_WORD})* or ${ATTR_WORD}`);
const ATTR_ONE = new RegExp(ATTR_WORD, "g");
/** 幅の弱い方の端 (0 に近い方。減少の MOD は負の数で持つ) */
const weak = (a: number, b: number): number => (Math.abs(a) <= Math.abs(b) ? a : b);

/** その段の文を行に分け、行ごとの形と下の端を出す。文の穴と段の幅が合わない時は null (比べられない) */
function rowsOf(mod: ModOf, tier: ModOf["tiers"][number]): Row[] | null {
  const ranges = tierDisplayRanges(tier as never);
  let r = 0, bad = false;
  const rows = String(mod.text ?? "").split("\n").filter((s) => s.trim()).map((line): Row => {
    const lows: number[] = [];
    // 「#」は段の幅、文に字で書いてある数 (完全なエッセンスの「+3 to Level …」) はその数そのもの (fillModText と同じ読み方)
    const shape = line.replace(NUM, (tok: string, a?: string, b?: string) => {
      if (tok === "#") { const x = ranges[r++]; if (!x) bad = true; else lows.push(weak(Number(x[0]), Number(x[1] ?? x[0]))); }
      else if (a !== undefined) lows.push(weak(Number(a), Number(b)));
      else lows.push(Number(tok));
      return "#";
    });
    const defs = [...new Set((shape.match(DEF_LIST) ?? []).flatMap((s) => s.match(new RegExp(DEF_WORD, "g")) ?? []).map((s) => s.replace(" Rating", "")))];
    const s = shape.replace(DEF_LIST, "<守り>").trim();
    // 能力値: 「または」の並びは 1 つに畳む。能力値の語がちょうど 1 つの行 (普通の「+# to Dexterity」) も同じ形に畳んで、並びの行と比べられるようにする
    const attrAny = ATTR_ANY.test(s), one = (s.match(ATTR_ONE) ?? []).length === 1;
    return { shape: s, lows, defs, attr: attrAny ? s.replace(ATTR_ANY, "<能力値>") : one ? s.replace(ATTR_ONE, "<能力値>") : s, attrAny };
  });
  return bad || lows0(rows) ? null : rows;
}
const lows0 = (rows: Row[]): boolean => rows.some((x) => x.lows.some((v) => Number.isNaN(v)));

/**
 * 狙いの行 w を、付いた MOD の行 g が満たすか: 形が同じ・下の端が全部届く。
 * 守りの種類を並べた共通の文 (強化のエッセンスの「アーマー、回避力およびエナジーシールド」) は、狙いの守りの種類を全部含む時だけ同じ形と見る
 * (フォーカスの「エナジーシールド %」に当たる。アーマーの狙いに回避だけの MOD は当たらない)。
 * 「または」で並べた能力値の共通の文 (無限のエッセンス) は、能力値を畳んだ形が同じなら同じ形と見る (付いた能力値が狙いと同じかは、呼ぶ側の系統の比べで決まっている)
 */
const meets = (w: Row, g: Row): boolean =>
  (w.shape === g.shape || (g.attrAny && !w.attrAny && w.attr === g.attr)) && w.lows.length === g.lows.length && w.defs.every((d) => g.defs.includes(d))
  && w.lows.every((v, i) => { const x = g.lows[i]!; return v === 0 ? true : Math.sign(x) === Math.sign(v) && Math.abs(x) >= Math.abs(v); });

/**
 * 付いた MOD (id と段の添字) がお題の狙い a に当たるか。比べられない時 (データに文が無い・穴と幅が合わない・段が無い) は null = 呼ぶ側が前の比べ方へ。
 * 系統が違えば外れ。行は「狙いの行が全部、付いた MOD のどれかの行で満たされる」(付いた側の余りの行は問わない)
 */
export function lowHitOf(data: PatchData, a: { modId: string; tier: number }, gotId: string, gotIndex: number): boolean | null {
  const want = data.mods.get(a.modId), got = data.mods.get(gotId);
  if (!want || !got) return null;
  if (!want.family || got.family !== want.family) return false;
  const wt = want.tiers[want.tiers.length - a.tier], gt = got.tiers[gotIndex];
  if (!wt || !gt) return null;
  const wr = rowsOf(want, wt), gr = rowsOf(got, gt);
  if (!wr || !gr || !wr.length) return null;
  return wr.every((w) => gr.some((g) => meets(w, g)));
}
