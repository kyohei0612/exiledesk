/**
 * スキル名 EN → JA (GGG クライアント ActiveSkills.DisplayedName 由来、2026-09-12)
 *   build: `node scripts/build-skills-ja-from-client.mjs`
 * 用途: ベースが付与するスキル (不在のアミュレット / 王笏) と、その穴に入ったジェム名の表示。
 * ジェム名 (サポート含む) は ActiveSkills に無いことがあるので items-ja 系 (jaCurrency) にフォールバックする。
 */
import skillsJaRaw from "./skills-ja-client.json";
import gemsRaw from "./gems-client.json";
import { jaCurrency } from "./currencies-ja";

const SKILLS_JA = skillsJaRaw as Record<string, string>;

/**
 * ジェムの名前 (BaseItemTypes 由来)。**スキル名より先に引く**。
 *
 * オーナー報告 2026-09-20:「スキル名間違ってる奴洗い出して。アークメイジとかアーチメイジとか」。
 * クライアントには同じ物の日本語名が 2 つあり、訳が揃っていない:
 *   BaseItemTypes (ジェムそのものの名前) = アーチメイジ   ← ゲーム内でジェムに書いてある名前
 *   ActiveSkills.DisplayedName (スキル名) = アークメイジ
 * 画面に出しているのは監視するジェムなので、ジェムの名前を優先する (34 件ずれていた)。
 * ベースが付与するスキル (ジェムに無い物) は今まで通り ActiveSkills から引く。
 */
const GEMS_JA: Record<string, string> = Object.fromEntries((gemsRaw as { en: string; ja: string }[]).map((g) => [g.en, g.ja]));

export function jaSkill(englishName: string): string {
  return GEMS_JA[englishName] ?? SKILLS_JA[englishName] ?? jaCurrency(englishName);
}
