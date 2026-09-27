/**
 * ユニーク装備のお気に入り (2026-09-26)
 *
 * オーナー:「ユニークにお気に入り機能つけたい」。poe.ninja にはお気に入りが無い (見出しのハートは寄付の案内) ので自前。
 * 行の ☆ で付け外し、カテゴリ欄の「お気に入り」で絞り込み。キーは英名 + ベース (リーグが変わっても残る)。
 * localStorage に残す (取れない環境では今回だけ覚える)。
 */
import { ref } from "vue";

const KEY = "exiledesk.uniqueFavorites.v1";
/** お気に入りの上限 */
export const FAV_MAX = 5;

function load(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const favs = ref<Set<string>>(new Set(load()));

export function favKey(nameEn: string, baseEn: string): string {
  return `${nameEn}|${baseEn}`;
}

export const uniqueFavorites = {
  set: favs,
  has(key: string): boolean {
    return favs.value.has(key);
  },
  /** 付け外し。上限 (5 個) で付けられなければ false (オーナー 2026-09-27「お気に入りは最大 5 個まで」。取引所で最安値を記録するため) */
  toggle(key: string): boolean {
    const next = new Set(favs.value);
    if (next.has(key)) next.delete(key);
    else if (next.size >= FAV_MAX) return false;
    else next.add(key);
    favs.value = next;
    try {
      localStorage.setItem(KEY, JSON.stringify([...next]));
    } catch {
      /* 保存できない環境は今回だけ */
    }
    return true;
  },
};
