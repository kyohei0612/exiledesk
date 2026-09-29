/**
 * スキル・ジェムの絵 (2026-09-29、POE2Tube 要望 ⑰-6 kyohei「スキルの画像もいる、ジェムかスキルの画像」)。
 * scripts/build-skill-art-from-client.mjs がクライアントから取り出して public/skill-art/ に置く:
 *   <id>_icon.webp = スキルのアイコン (スキルバーの四角い絵、PoB の Data/Skills の icon)、<id>_gem.webp = ジェムの絵 (アイテム)
 * 一覧 (skill-art.json) は POE2Tube も読む: { id, en, ja, color (red/green/blue/white), support, tags, icon, gem }。
 * 本番のアプリは画像パック (asset-packs.ts) から読む。無ければ null
 */
import list from "./skill-art.json";
import { assetUrl } from "../assets/asset-packs";

export interface SkillArt { id: string; en: string; ja: string; color: "red" | "green" | "blue" | "white"; support: boolean; tags: string[]; icon: string | null; gem: string | null }
export const SKILL_ART = list as SkillArt[];
const BY_EN = new Map(SKILL_ART.map((s) => [s.en, s]));
export const skillArtOf = (en: string): SkillArt | null => BY_EN.get(en) ?? null;
/** スキルのアイコン (無ければジェムの絵) */
export function skillIcon(en: string): string | null {
  const s = BY_EN.get(en);
  const f = s?.icon ?? s?.gem;
  return f ? assetUrl("skill-art", `${f}.webp`) : null;
}
/** ジェムの絵 (アイテムとしての宝石) */
export function gemArt(en: string): string | null {
  const f = BY_EN.get(en)?.gem;
  return f ? assetUrl("skill-art", `${f}.webp`) : null;
}
