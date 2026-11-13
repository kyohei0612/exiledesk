/**
 * granted-skills.ts — 付与スキルを 1 つ選んで付くベースの候補 (嘆きの / 前兆の / 不在のアミュレット。表は i18n/inherent-skills.json、
 * 名前は取引所の i18n/trade2-skills.json と同じ英語)。GrantedSkillPick (U-12f) が使う
 */
import inherentSkills from "../../../i18n/inherent-skills.json";

export type GrantedSkill = { en: string; ja: string };
const SKILLS = inherentSkills as Record<string, GrantedSkill[]>;
/** そのベース (英語の名前) で選べる付与スキル。選べないベースは空 */
export const grantedSkillsOf = (base: string | null | undefined): readonly GrantedSkill[] => (base ? SKILLS[base] ?? [] : []);
