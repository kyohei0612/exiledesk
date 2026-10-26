/**
 * 今日のユニーク: ベース選びの部位のタイルの絵 (2026-10-26 夜オーナー「ランダムにしようか、それぞれのユニーク。飽きるでしょ」「1 日ごとに変える、9 時」
 * 「負荷は今と変わらない感じ」)。部位ごとの候補 (同じ種類のユニーク、scripts/build-fam-uniques.py → fam-uniques.json) から、
 * 日本時間 9 時 (= 世界時 0 時) で変わる日の番号と部位の名前を種に 1 つ。その日は誰が開いても同じ絵で、読む絵は前と同じくタイルごとに 1 枚
 * (ほかの候補は読まない)。光の色も表に前もって計算してあり、画面では色を計算しない
 */
import { uniqueArt } from "../../services/assets/unique-art";
import FAM_UNIQUES from "./fam-uniques.json";

const FAM_TODAY = FAM_UNIQUES as unknown as Record<string, Array<[string, string]>>;
const DAY = Math.floor(Date.now() / 86_400_000);

/** 絵の URL → 絵の名前。アプリの URL は http://asset.localhost/C%3A%5C…%5C名前.webp (区切りが \ で符号化されている) ので、戻してから / と \ の両方で切る */
export const stemOf = (src: string): string => (decodeURIComponent(src.split(/[?#]/)[0]!).split(/[\\/]/).pop() ?? "").replace(/\.webp$/, "");

/** その部位の今日のユニークの英語名。候補が無い部位は fallback (前の手で決めた 1 つ) */
export function todayUnique(fam: string, fallback?: string): string | null {
  const list = FAM_TODAY[fam];
  if (!list?.length) return fallback ?? null;
  const key = `${DAY}:${fam}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return list[(h >>> 0) % list.length]![0];
}

/** 今日のユニークの光の色 (絵の名前 → "R,G,B")。初めて要った時に 1 回だけ作る */
let glow: Map<string, string> | null = null;
export function glowOfStem(stem: string): string | undefined {
  if (!glow) {
    glow = new Map();
    for (const list of Object.values(FAM_TODAY)) for (const [en, c] of list) { const u = c ? uniqueArt(en) : null; if (u) glow.set(stemOf(u), c); }
  }
  return glow.get(stem);
}
