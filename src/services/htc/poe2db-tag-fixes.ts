/**
 * poe2db-tag-fixes.ts — MOD のタグを poe2db (今のページ) に合わせる (2026-10-18 オーナー「db に全て合わせてくれ」)。
 *
 * 直しの中身は scripts/audit-poe2db-tags.mjs --write が作る poe2db-tag-fixes.json ({ MOD の id: poe2db の段のタグ })。
 * 置き換えるのは画面に札で出すタグ (tag-ja.ts の TAG_STYLE) と冒涜の陣営 (アマナム・ウラマン・クルガル) だけ。
 * 内部のタグ (elemental_damage・resource など、札にしない物) はそのまま残す。
 * tags (抽選: 陣営のお告げ・均質化、カタリスト) と displayTags (画面・ジュエルのカタリスト) の両方を直す。patch.ts の最後で当てる
 */
import tagFixes from "./poe2db-tag-fixes.json";
import { TAG_STYLE } from "../mods/tag-ja";
import type { Mod, PatchData } from "../../vendor/poe2htc/engine/types";

const isFaction = (t: string): boolean => /^(ulaman|amanamu|kurgal)_mod$/.test(t);
/** poe2db に合わせて置き換えるタグ (札に出すタグと陣営) */
const replaceable = (t: string): boolean => !!TAG_STYLE[t] || isFaction(t);

export function applyPoe2dbTagFixes(data: PatchData): PatchData {
  const fixes = (tagFixes as { tags: Record<string, string[]> }).tags;
  const mods = new Map(data.mods);
  for (const [id, db] of Object.entries(fixes)) {
    const m = mods.get(id);
    if (!m) continue;
    const keep = (xs: readonly string[] | undefined): string[] => (xs ?? []).filter((t) => !replaceable(t));
    const next: Mod = {
      ...m,
      tags: [...new Set([...keep(m.tags), ...db])],
      ...(m.displayTags ? { displayTags: [...new Set([...keep(m.displayTags), ...db.filter((t) => !isFaction(t))])] } : {}),
    };
    mods.set(id, next);
  }
  return { ...data, mods };
}
