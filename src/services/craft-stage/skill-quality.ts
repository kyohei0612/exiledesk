/**
 * skill-quality.ts — ワンド・スタッフの品質で、武器に付いているスキルの何が上がるか (2026-10-17 オーナー「スキルの品質か、完全理解いるわな」)。
 * 武器の品質は MOD には効かず、付与スキルの品質になる (poe2db の Quality「equipment that grant Skills grant a specific bonus to their Skill based on their Quality」)。
 * スキルは base-info.json の skills、品質の効果はジェムの表 (gem-hover の q = 品質 qq% の時の文)。今の品質の値は qq% の値を比で割って切り捨て。
 * セプターは「セプターのスキルには品質が乗らない (不具合らしい)」という話があり確かめられていないので出さない
 */
import baseInfo from "../../data/base-info.json";
import { gemHoverOf } from "../gem-hover";

const CASTER = ["Wands", "Staves"];

/**
 * 数字を品質の比で縮める。秒・メートルの後に付く数は小数 (ゲームは内部でミリ秒・小さい単位で持つ。+1 秒は品質 1% で 0.05 秒) で 2 桁まで、
 * 数 (投射物 +1 など) と % は切り捨ての整数
 */
const scale = (line: string, r: number): string =>
  line.replace(/(\d+(?:\.\d+)?)(\s*(?:秒|m(?![a-z])|メートル|seconds?|metres?))?/g, (_, n: string, unit?: string) => {
    const v = Number(n) * r;
    return (unit || n.includes(".") ? String(Math.floor(v * 100 + 1e-9) / 100) : String(Math.floor(v + 1e-9))) + (unit ?? "");
  });

/** 品質 quality% の時の付与スキルの上乗せ (スキル名と文。品質 0 やスキルの無い武器は空) */
export function skillQualityOf(base: string, category: string, quality: number): Array<{ name: string; lines: string[] }> {
  if (!CASTER.includes(category) || quality <= 0) return [];
  const skills = (baseInfo as Record<string, { skills?: string[] }>)[base]?.skills ?? [];
  return skills.flatMap((en) => {
    const g = gemHoverOf(en);
    if (!g?.q?.length || !g.qq) return [];
    const r = Math.min(quality, g.qq) / g.qq;
    return [{ name: g.n, lines: g.q.map((l) => scale(l, r)) }];
  });
}
