/**
 * tree-paste.ts — シミュの「アイテムを貼り付けて取り込む」(2026-10-25 オーナー「ベース一覧の所に分かりやすく出したいけどね」)。
 * 貼った文 (トレード 日英・P6 / S0 の段の表記、poe.ninja、ゲームの Ctrl+C / Ctrl+Alt+C) はエンジンの parseItemText (item-text.ts) で読むだけ、シミュで読まない。
 * 読めたら必ず貼った文のベースとアイテムレベルに切り替え (適正は外す)、付いている MOD を完成形の狙い (その段以上、フラクチャーは ✦) に入れて完成の MOD のページへ。
 * 足せるかは完成形の窓と同じエンジンの goalBlock。読めなかった行・狙いにできなかった MOD は捨てずに pasteNote (sim-mods の上に出す)。
 * 貼る口はベース選びの枠 (TreePasteBox) と、シミュのどの段でも Ctrl+V (usePasteAnywhere、10-25 オーナー「ベースもコピーしてるから自動で変わらないと」:
 * 前は枠の外 (MOD のページ・ツリー・検索欄) で貼っても何も起きなかった)。今の木が消える時だけ 1 回確かめる (pendingPaste)
 */
import { onBeforeUnmount, onMounted, ref } from "vue";
import { goalBlock } from "../../../services/craft-stage/engine-sim";
import { parseItemText } from "../../../services/craft-stage/engine";
import { craftStage as s } from "../../../state/craft-stage";
import { migrateStart, startRarity, type Aim } from "../../../services/simulator/tree/tree-model";
import { openTreePage } from "../../../web/page";
import { track } from "../../../utils/track";
import { tr } from "../../../i18n/lang";
import { useTree } from "./use-tree";

/** 最後に取り込んだ結果 (sim-mods の上に出す。閉じるか次の取り込みまで) */
export const pasteNote = ref<{ base: string; aims: number; bad: Array<{ line: string; why: string }> } | null>(null);
/** 今の木が消えるので確かめている貼り付け (base = 画面に出す名前、boxes = 消える箱の数) */
export const pendingPaste = ref<{ text: string; base: string; boxes: number } | null>(null);
/** 取り込めなかった時の理由 (貼る口の下に出す) */
export const pasteWhy = ref<string | null>(null);

/**
 * 貼った文を取り込む頼み (貼る口から)。読めなければ理由。今の木 (始まりより下の箱) が消える時は確かめに回す。
 * quiet = 枠の外の貼り付け: アイテムの文に見えなければ何もせず false (普通の貼り付けのまま)
 */
export function requestPaste(text: string, quiet = false): boolean {
  const data = s.data.value;
  if (!data || !text.trim()) return false;
  const r = parseItemText(data, text);
  if (!r.base) {
    if (quiet) return false;
    pasteWhy.value = r.skipped[0] ? tr(r.skipped[0].reason.ja, r.skipped[0].reason.en) : tr("ベースが読めなかった", "Couldn't read the base");
    return true;
  }
  pasteWhy.value = null;
  const t = useTree();
  if (t.lostOnBase.value > 0) { pendingPaste.value = { text, base: tr(r.base.ja, r.base.en), boxes: t.lostOnBase.value }; return true; }
  importPaste(text);
  return true;
}
/** 確かめの「替える」 */
export function confirmPaste(): void { const p = pendingPaste.value; pendingPaste.value = null; if (p) importPaste(p.text); }

/** 取り込む (確かめの後)。必ず貼った文のベースとアイテムレベルへ切り替え、完成の MOD のページへ */
function importPaste(text: string): void {
  const data = s.data.value;
  if (!data) return;
  const r = parseItemText(data, text);
  if (!r.base) return;
  const t = useTree();
  t.setBase(r.base.en, r.itemLevel ?? t.doc.value.itemLevel);
  // 貼った文のアイテムレベルを使う (白紙の木は適正で作られ、狙いに合わせて変わるので外す。文に無ければ今のまま)
  const ilvl = r.itemLevel;
  if (ilvl) t.edit((d) => { delete d.ilvlFit; d.itemLevel = ilvl; });
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
  track("sim:paste");
  // 完成の MOD のページへ (どの段から貼っても同じ。ツリーの窓で開いていた時も)
  t.needBase.value = false;
  openTreePage("mods");
  t.goalPage.value = 2;
}

/**
 * シミュのどの段でも Ctrl+V でアイテムの文を貼れば取り込む (ベース選びの枠の外、MOD のページ・ツリー・検索欄でも)。
 * 1 行だけの貼り付け・アイテムの文に見えない物は普通の貼り付けのまま。部品の中で呼ぶ (付けている間だけ効く)
 */
export function usePasteAnywhere(): void {
  const on = (e: ClipboardEvent): void => {
    if (e.defaultPrevented || (e.target as HTMLElement | null)?.closest?.("[data-tree-paste]")) return;
    const text = e.clipboardData?.getData("text") ?? "";
    if (text.split(/\r?\n/).filter((l) => l.trim()).length < 3) return;
    if (requestPaste(text, true)) e.preventDefault();
  };
  onMounted(() => document.addEventListener("paste", on));
  onBeforeUnmount(() => document.removeEventListener("paste", on));
}
