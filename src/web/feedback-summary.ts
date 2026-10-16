/**
 * feedback-summary.ts — 要望に付ける「何を作っていて、どこまで打ったか」を日本語の文で (2026-10-12 オーナー
 * 「計算機の内容を日本語で報告して欲しい。何を作っててどこで止まってるのか知りたい」)。
 * Discord の知らせの本文に出す (server/live の notifyDiscord)。コードの id は添付の JSON に残る。画面の言語にかかわらず日本語
 */
import { craftStage, nameOf, readSimSession } from "../state/craft-stage";
import { classJa } from "../services/items/base-catalog";
import type { PlayedStep } from "../services/craft-stage/run-plan";
import type { StageItem, StageMod } from "../services/craft-stage/types";

const RARITY_JA: Record<string, string> = { normal: "ノーマル", magic: "マジック", rare: "レア", unique: "ユニーク" };

const modLine = (m: StageMod): string =>
  `${m.side === "prefix" ? "プレフィックス" : "サフィックス"}: ${m.textJa.replace(/\n/g, " / ")}${m.fractured ? " (固定)" : ""}${m.desecrated ? " (冒涜)" : ""}${m.crafted ? (m.modId.includes("/Emotion_") ? " (デリリウム)" : " (エッセンス)") : ""}`;

/** 打った手を続けて同じ物はまとめて (「カオスオーブ ×21 → 完全なカオスオーブ ×33」)。長い時は最後の方だけ */
export function stepsJa(log: readonly PlayedStep[], max = 14): string {
  const groups: Array<{ name: string; n: number }> = [];
  for (const p of log) {
    const o = p.out;
    const name = `${o.currency_ja}${o.omen_ja ? ` (${o.omen_ja})` : ""}${o.applied === false ? " (弾かれた)" : ""}`;
    const last = groups[groups.length - 1];
    if (last?.name === name) last.n++;
    else groups.push({ name, n: 1 });
  }
  const shown = groups.slice(-max).map((g) => (g.n > 1 ? `${g.name} ×${g.n}` : g.name));
  return `${groups.length > max ? "… → " : ""}${shown.join(" → ")}`;
}

/** 最後の手で何が変わったか */
function lastChange(p: PlayedStep): string {
  const add = p.added.map((m) => `+${m.textJa.replace(/\n/g, " / ")}`);
  const rem = p.removed.map((m) => `-${m.textJa.replace(/\n/g, " / ")}`);
  const head = `${p.out.currency_ja}${p.out.omen_ja ? ` (${p.out.omen_ja})` : ""}`;
  if (p.out.applied === false) return `${head}: 弾かれた${p.out.reason ? ` (${p.out.reason})` : ""}`;
  return `${head}${add.length || rem.length ? `: ${[...rem, ...add].join(" ")}` : ""}`;
}

function itemHead(it: StageItem): string {
  const cls = classJa(it.cls.id, false);
  return `${it.baseJa}${cls && cls !== it.baseJa ? ` (${cls})` : ""} · アイテムレベル ${it.itemLevel} · ${RARITY_JA[it.rarity] ?? it.rarity}${it.corrupted ? " · コラプト" : ""}`;
}

/** 本文の行 (Discord にそのまま並べる) */
export function feedbackSummaryJa(): string[] {
  const s = craftStage;
  const it = s.item.value;
  const out: string[] = [];
  if (s.mode.value === "sim") {
    const ses = readSimSession();
    out.push(`シミュレーター: ${it ? itemHead(it) : s.base.value}`);
    if (ses) out.push(`狙い ${ses.targets.length} 個 · パターン ${ses.patterns.length} つ`);
    return out;
  }
  if (!it) return out;
  out.push(`作っている物: ${itemHead(it)}`);
  const mods = [...it.prefixes, ...it.suffixes];
  out.push(mods.length ? `今の MOD:\n${mods.map((m) => `　${modLine(m)}`).join("\n")}` : "今の MOD: 無し");
  const log = s.log.value;
  if (log.length) {
    out.push(`打った手 (${log.length} 手): ${stepsJa(log)}`);
    out.push(`最後の手: ${lastChange(log[log.length - 1]!)}`);
  }
  // 押しても打てなかった (何回押したかと理由)。止まっている所の手がかり
  const miss = s.miss.value;
  if (miss) out.push(`打てなかった: ${miss.reason}${miss.n > 1 ? ` (${miss.n} 回)` : ""}`);
  const held = s.held.value;
  if (held) out.push(`持っている物: ${nameOf(held)}${s.omens.value.length ? ` · 掛けたお告げ: ${s.omens.value.map((o) => nameOf(o)).join("・")}` : ""}`);
  else if (s.omens.value.length) out.push(`掛けたお告げ: ${s.omens.value.map((o) => nameOf(o)).join("・")}`);
  return out;
}
