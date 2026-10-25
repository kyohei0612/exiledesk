/**
 * tree-paste.ts — ベース選び (sim-base) の「アイテムを貼り付けて取り込む」(2026-10-25 オーナー「ベース一覧の所に分かりやすく出したいけどね」)。
 * 貼った文 (トレード 日英・P6 / S0 の段の表記、poe.ninja、ゲームの Ctrl+C / Ctrl+Alt+C) はエンジンの parseItemText (item-text.ts) で読むだけ、シミュで読まない。
 * 読めたらベースを選び、付いている MOD を完成形の狙い (その段以上) に入れる (フラクチャーの MOD は ✦ の印)。足せるかは完成形の窓と同じエンジンの goalBlock。
 * 読めなかった行・狙いにできなかった MOD は捨てずに pasteNote に残し、完成の MOD のページ (sim-mods) で見せる
 */
import { ref } from "vue";
import { goalBlock } from "../../../services/craft-stage/engine-sim";
import { parseItemText } from "../../../services/craft-stage/engine";
import { craftStage as s } from "../../../state/craft-stage";
import { migrateStart, startRarity, type Aim } from "../../../services/simulator/tree/tree-model";
import { tr } from "../../../i18n/lang";
import { useTree } from "./use-tree";

/** 最後に取り込んだ結果 (sim-mods の上に出す。閉じるか次の取り込みまで) */
export const pasteNote = ref<{ base: string; aims: number; bad: Array<{ line: string; why: string }> } | null>(null);

/** 取り込む。読めなければ理由 (ベースが分からない等) を返し、木は変えない */
export function importPaste(text: string): { ok: true } | { ok: false; why: string } {
  const data = s.data.value;
  if (!data) return { ok: false, why: tr("データの読み込み中", "Loading data") };
  const r = parseItemText(data, text);
  if (!r.base) return { ok: false, why: r.skipped[0] ? tr(r.skipped[0].reason.ja, r.skipped[0].reason.en) : tr("ベースが読めなかった", "Couldn't read the base") };
  const t = useTree();
  t.setBase(r.base.en, r.itemLevel ?? t.doc.value.itemLevel);
  const bad: Array<{ line: string; why: string }> = r.skipped.map((x) => ({ line: x.line, why: tr(x.reason.ja, x.reason.en) }));
  // 完成形の窓の表にある MOD と段 (表に無い MOD は狙いにできない)
  const known = new Set(t.rows.value.flatMap((row) => row.tiers.map((x) => `${x.modId ?? row.id}|${x.tier}`)));
  const lv = t.doc.value.itemLevel, aims: Aim[] = [];
  // フラクチャーの MOD を先に (印の候補)、ほかは貼った順
  for (const m of [...r.mods.filter((x) => x.fractured), ...r.mods.filter((x) => !x.fractured)]) {
    if (!m.modId || !m.tier) { bad.push({ line: m.text, why: m.unrevealed ? tr("未発現 (発現するまで MOD が決まらない)", "Unrevealed (the mod isn't known yet)") : tr("MOD が分からない", "Unknown mod") }); continue; }
    const tier = Number(m.tier.label.replace(/^T/, ""));
    if (!known.has(`${m.modId}|${tier}`)) { bad.push({ line: m.text, why: tr("完成の MOD の表に無い", "Not in the final-mod table") }); continue; }
    if (aims.some((a) => a.modId === m.modId)) continue;
    const why = goalBlock(data, t.doc.value.base, lv, aims.map((a) => ({ modId: a.modId, tier: a.tier })), { modId: m.modId, tier });
    if (why) { bad.push({ line: m.text, why }); continue; }
    // 冒涜の MOD はフラクチャーできない (完成形の窓と同じ)。印は付けず狙いだけ
    aims.push({ modId: m.modId, tier, ...(m.fractured && !m.desecrated ? { fractured: true as const } : {}) });
  }
  // 印はスタートの形を決める (use-tree の toggleFracture と同じく、印の MOD はスタートの MOD から外してレアリティを決め直す)
  t.edit((d) => {
    if (aims.length) d.memoAims = aims; else delete d.memoAims;
    migrateStart(d);
    d.start!.mods = d.start!.mods.filter((m) => !aims.some((a) => a.fractured && a.modId === m.modId));
    d.start!.rarity = startRarity(d);
  });
  pasteNote.value = { base: tr(r.base.ja, r.base.en), aims: aims.length, bad };
  return { ok: true };
}
