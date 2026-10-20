/**
 * paste-target.ts — 取引所のアイテム (ゲームで Ctrl+C したテキスト) を、シミュレーター ② の狙う MOD (完成品) に写す (2026-10-20 要望 91832821 の ②)。
 *
 * 読むのは計算機の貼り付けと同じ物 (htc/paste の parseJaItem → targetsFor)。日本語・英語・poe.ninja の注記つきのどれでも通る。
 *   - 狙いの段 = 貼った値が入る段 (品質で上がった分は外して読む。targetsFor)。その段以上が当たり
 *   - 固定済み (fractured の注記) はフラクチャーの印。注記の無い日本語の貼り付けでは分からないので付けない
 *   - 写せない行は文で返す: このベースに付かない (創生の樹のドロップ限定もここ)・値がどの段にも入らず段を推し量った
 *   - 暗黙・ルーン・アノイントは完成品の狙いではないので写さない (数だけ返す)
 * 別のベースを貼った時は、部位が同じなら今のベースに写す (MOD の置き場は部位で決まる)。部位が違えば写さない。
 */
import { parseJaItem, targetsFor } from "../htc/paste";
import { classOfBase } from "../htc/bridge";
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import type { SimTargets } from "../../state/simulator/sim-state";

/** 画面に出す一言 (日本語・英語) */
export interface PasteNote { ja: string; en: string; kind: "skip" | "tier" | "base" | "info" }

export interface PasteResult {
  /** 写した狙い (空なら写さない) */
  targets: SimTargets;
  notes: PasteNote[];
  /** 貼り付けにあったベースの表記 */
  baseText: string | null;
}

export function pasteToTargets(data: PatchData, text: string, base: string): PasteResult {
  const item = parseJaItem(text);
  const notes: PasteNote[] = [];
  const fail = (ja: string, en: string): PasteResult => ({ targets: [], notes: [{ ja, en, kind: "base" }], baseText: item.baseText });
  if (!item.baseType) return fail("ベースが読めない (ゲームでアイテムに乗せて Ctrl+C したテキストを貼る)", "Could not read the base (paste the text copied with Ctrl+C in game)");
  if (item.baseType !== base) {
    const a = classOfBase(data, item.baseType), b = classOfBase(data, base);
    if (!a || !b || a.category !== b.category) return fail(`貼ったのは別の部位のベース (${item.baseText ?? item.baseType})。① でそのベースを選んでから貼る`, `The pasted item is a different item class (${item.baseType}). Pick that base in step 1 first`);
    notes.push({ kind: "base", ja: `貼ったベースは ${item.baseText ?? item.baseType}。同じ部位なので今のベースに写した`, en: `Pasted base is ${item.baseType}. Same item class, so copied onto the current base` });
  }
  const got = targetsFor(data, { ...item, baseType: base });
  const fracSet = new Set(got.fracturedTargets.map((t) => t.modId));
  const targets: SimTargets = [];
  got.targets.forEach((t, i) => {
    // 複合 MOD など同じ MOD が 2 行で来た時は 1 つにまとめる
    if (targets.some((x) => x.modId === t.modId)) return;
    targets.push({ modId: t.modId, minTierIndex: t.minTierIndex ?? 0, ...(fracSet.has(t.modId) ? { method: "fracture" as const } : {}) });
    if (got.fits && got.fits[i] === false) {
      const m = data.mods.get(t.modId);
      const rank = m ? `T${m.tiers.length - (t.minTierIndex ?? 0)}` : "";
      notes.push({ kind: "tier", ja: `段が分からない: ${got.texts[i]} (値がどの段にも入らない。${rank} にしたので ② で直す)`, en: `Tier unknown: ${got.texts[i]} (the value fits no tier; set to ${rank}, fix it in step 2)` });
    }
  });
  const drop = new Map(got.dropOnly.map((d) => [d.text, d]));
  for (const line of got.skipped) {
    const d = drop.get(line);
    notes.push(d
      ? { kind: "skip", ja: `写せない: ${line} (${d.tagJa} のドロップ限定。クラフトでは付かない)`, en: `Not copied: ${line} (drops only from ${d.tag}; cannot be crafted)` }
      : { kind: "skip", ja: `写せない: ${line} (このベースに付く MOD に無い)`, en: `Not copied: ${line} (not in this base's mod pool)` });
  }
  if (item.corrupted) notes.push({ kind: "info", ja: "コラプト済みのアイテム (狙いだけ写した)", en: "Corrupted item (only the mods were copied)" });
  if (!targets.length && !got.skipped.length) notes.push({ kind: "skip", ja: "写せる MOD が無い (暗黙・ルーンは写さない)", en: "No mods to copy (implicits and runes are not copied)" });
  return { targets, notes, baseText: item.baseText };
}
