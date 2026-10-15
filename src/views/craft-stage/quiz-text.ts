/**
 * quiz-text.ts — クイズのレシピ (ADR-003) の条件と答えの言葉。クイズの画面と手順の画像で同じ言葉を使う
 */
import { nameOf } from "../../state/craft-stage";
import { tr } from "../../i18n/lang";
import type { QuizAction, QuizSlot, When } from "../../services/craft-stage/quiz-recipe";

export const SLOT_STATE: Array<[string, string]> = [["無い", "none"], ["段が低い", "low tier"], ["付いている", "on"], ["固定", "fractured"]];
const RARITY: Record<string, [string, string]> = { n: ["ノーマル", "Normal"], m: ["マジック", "Magic"], r: ["レア", "Rare"], u: ["ユニーク", "Unique"] };
const stateText = (v: string | number): string => tr(SLOT_STATE[Number(v)]?.[0] ?? "", SLOT_STATE[Number(v)]?.[1] ?? "");

export function slotName(s: QuizSlot, nameOfMod: (id: string) => string): string {
  if (!s.mods.length) return tr(s.side === "prefix" ? "プレ (何でも)" : "サフィ (何でも)", s.side === "prefix" ? "Prefix (any)" : "Suffix (any)");
  const n = nameOfMod(s.mods[0]!.modId);
  return s.mods.length > 1 ? `${n} ${tr(`ほか ${s.mods.length - 1}`, `+${s.mods.length - 1}`)}` : n;
}
/** 条件の 1 項目 (札は「A 名前: 状態」) */
export function chipText(goal: readonly QuizSlot[], k: string, v: string | number, nameOfMod: (id: string) => string): string {
  const s = goal.find((g) => g.id === k);
  if (s) return `${k} ${slotName(s, nameOfMod)}: ${stateText(v)}`;
  if (k === "r") return tr(RARITY[String(v)]?.[0] ?? String(v), RARITY[String(v)]?.[1] ?? String(v));
  const side = k.startsWith("p.") ? tr("プレ", "Prefix") : tr("サフィ", "Suffix");
  if (k.endsWith(".n")) return tr(`${side} ${v} つ`, `${side} ${v}`);
  if (k.endsWith(".hid")) return tr(`未発現 (${side}) ${v}`, `Unrevealed (${side}) ${v}`);
  if (k.endsWith(".bad")) return tr(`冒涜の外れ (${side}) ${v}`, `Unwanted desecrated (${side}) ${v}`);
  if (k.endsWith(".junk")) return tr(`狙い以外 (${side}) ${v}`, `Other mods (${side}) ${v}`);
  if (k.endsWith(".free")) return tr(`空き (${side}) ${v}`, `Open (${side}) ${v}`);
  if (k.endsWith(".fx")) return tr(`狙い以外の固定 (${side}) ${v}`, `Other fractured (${side}) ${v}`);
  if (k === "fx") return tr(`固定 ${v}`, `Fractured ${v}`);
  if (k === "aug") return tr(`ルーン ${v}`, `Runes ${v}`);
  if (k === "n") return tr(`MOD ${v} つ`, `${v} mods`);
  return `${k} ${v}`;
}
/** 答えの条件 (札は「A: 無い」と短く) */
export function whenText(goal: readonly QuizSlot[], w: When, nameOfMod: (id: string) => string): string {
  const keys = Object.keys(w);
  if (!keys.length) return tr("いつでも", "Always");
  return keys.map((k) => {
    const v = w[k]!;
    const vs = Array.isArray(v) ? v : [v];
    if (goal.some((g) => g.id === k)) return `${k}: ${vs.map(stateText).join("/")}`;
    return vs.map((x) => chipText(goal, k, x, nameOfMod)).join(" / ");
  }).join(" · ");
}
export function actionText(a: QuizAction): string {
  if ("restart" in a) return tr("買い直して最初から", "Buy a new base and start over");
  if ("reveal" in a) return tr(`発現 (狙いの札を取る${a.reveal.echoes ? "・反響で引き直し" : ""})`, `Reveal (take a target${a.reveal.echoes ? ", reroll with Echoes" : ""})`);
  return [nameOf(a.use), ...(a.omens ?? []).map((o) => nameOf(o))].join(" + ");
}
