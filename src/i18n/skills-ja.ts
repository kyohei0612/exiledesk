/**
 * スキル名 EN → JA (GGG クライアント ActiveSkills.DisplayedName 由来、2026-09-12)
 *   build: `node scripts/build-skills-ja-from-client.mjs`
 * 用途: ベースが付与するスキル (不在のアミュレット / 王笏) と、その穴に入ったジェム名の表示。
 * ジェム名 (サポート含む) は ActiveSkills に無いことがあるので items-ja 系 (jaCurrency) にフォールバックする。
 */
import skillsJaRaw from "./skills-ja-client.json";
import { jaCurrency } from "./currencies-ja";

const SKILLS_JA = skillsJaRaw as Record<string, string>;

export function jaSkill(englishName: string): string {
  const hit = SKILLS_JA[englishName];
  if (hit) return hit;
  return jaCurrency(englishName);
}
