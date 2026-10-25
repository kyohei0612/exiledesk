/**
 * tree-paste.ts — シミュの「アイテムを貼り付けて取り込む」(2026-10-25 オーナー「ベース一覧の所に分かりやすく出したいけどね」)。
 * 貼った文 (トレード 日英・P6 / S0 の段の表記、poe.ninja、ゲームの Ctrl+C / Ctrl+Alt+C) はエンジンの parseItemText (item-text.ts) で読むだけ、シミュで読まない。
 * 読めたら貼った文のベースとアイテムレベル (適正に変えない) に切り替え、付いている MOD を完成形の狙い (その段以上、フラクチャーは ✦) に入れて ② 完成の MOD のページへ。
 * 足せるかは完成形の窓と同じエンジンの goalBlock。読めなかった行・狙いにできなかった MOD は捨てずに pasteNote (sim-mods の上に出す)。
 * 貼る口はベース選びの枠 (TreePasteBox) と、シミュのどの画面でも Ctrl+V (usePasteAnywhere)。
 * 10-25 オーナー「どの画面からでもコピペしたら 2 の画面に」「ツリーへ押した際にツリー作成中なら保存云々は聞かんとあかん。新しいツリーでやるなら聞かない」:
 * 貼った時に作りかけ (保存していない手のある木) を置き換えるなら pastePrev に控え、② から木へ戻る時に TreeGoalPage が保存を聞く
 */
import { onBeforeUnmount, onMounted, ref } from "vue";
import { goalBlock } from "../../../services/craft-stage/engine-sim";
import { parseItemText } from "../../../services/craft-stage/engine";
import { craftStage as s } from "../../../state/craft-stage";
import { migrateStart, startRarity, type Aim, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { currentTreeRecipe, overwriteTreeRecipe, sameTree, saveTreeRecipe, setCurrentTreeRecipe } from "../../../state/simulator/tree-recipes";
import { jaTypeName } from "../../../i18n/item-names-ja";
import { openTreePage } from "../../../web/page";
import { track } from "../../../utils/track";
import { tr } from "../../../i18n/lang";
import { fmtDate } from "../recipe-share";
import { useTree } from "./use-tree";

/** 最後に取り込んだ結果 (sim-mods の上に出す。閉じるか次の取り込みまで) */
export const pasteNote = ref<{ base: string; aims: number; bad: Array<{ line: string; why: string }> } | null>(null);
/** 取り込めなかった時の理由 (貼る口の下に出す) */
export const pasteWhy = ref<string | null>(null);
/** 貼り付けで置き換えた作りかけの木 (保存していない手のある木)。② から木へ戻る時に保存を聞く。recipeId = 開いていたレシピ (上書き先) */
export const pastePrev = ref<{ doc: TreeDoc; name: string; recipeId: string | null; boxes: number } | null>(null);

/**
 * 貼った文を取り込む (貼る口から)。読めなければ理由を出して true。
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
  const t = useTree(), d = t.doc.value, cur = currentTreeRecipe.value;
  // 置き換える木が作りかけなら控える (続けて貼った時は最初の木のまま)。保存済みのまま・白紙・新しいツリーのタブは聞かない
  const dirty = cur ? !sameTree(d, cur.tree) : t.lostOnBase.value > 0;
  if (dirty && !pastePrev.value) pastePrev.value = { doc: JSON.parse(JSON.stringify(d)) as TreeDoc, name: cur?.name ?? `${tr(jaTypeName(d.base), d.base)} ${fmtDate(Date.now())}`, recipeId: cur?.id ?? null, boxes: t.lostOnBase.value };
  importPaste(text);
  return true;
}
/** 控えた木を保存する (開いていたレシピなら上書き、無ければ新しく)。今の木 (貼った物) は名前なしのまま */
export function savePrev(): void {
  const p = pastePrev.value;
  if (!p) return;
  if (p.recipeId) overwriteTreeRecipe(p.recipeId, p.doc); else saveTreeRecipe(p.name, p.doc);
  setCurrentTreeRecipe(null);
  pastePrev.value = null;
}

/** 取り込む。貼った文のベースとアイテムレベルへ切り替え、狙いを入れて ② 完成の MOD のページへ */
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
  // 前の木の「適正で合わせました」の一言は消す (貼った値なので)
  t.ilvlNote.value = null;
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
  // 貼った木は名前なしの新しい木 (開いていたレシピの続きではない)
  setCurrentTreeRecipe(null);
  pasteNote.value = { base: tr(r.base.ja, r.base.en), aims: aims.length, bad };
  track("sim:paste");
  // ② 完成の MOD のページへ (どの画面から貼っても同じ。ツリーの窓で開いていた時も)
  t.needBase.value = false;
  openTreePage("mods");
  t.goalPage.value = 2;
}

/**
 * シミュのどの画面でも Ctrl+V でアイテムの文を貼れば取り込む (ベース選びの枠の外、MOD のページ・ツリー・検索欄でも)。
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
