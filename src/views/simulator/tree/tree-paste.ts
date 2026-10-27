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
import { goalBlock } from "../../../services/simulator/sim-engine";
import { parseItemText } from "../../../services/simulator/paste/item-text";
import type { ItemTextMod, ItemTextReading } from "../../../services/simulator/paste/item-text-types";
import { craftStage as s } from "../../../state/craft-stage";
import type { StageItem } from "../../../services/craft-stage/types";
import { migrateStart, startRarity, type Aim, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { setCurrentTreeRecipe } from "../../../state/simulator/tree-recipes";
import { askLeave, openTreePage } from "../../../web/page";
import { track } from "../../../utils/track";
import { tr } from "../../../i18n/lang";
import { useTree } from "./use-tree";
import { maxQualityOf } from "../../../services/craft-stage/engine";
import { flag } from "../../../web/release-flags";
import { markPristine, quickSave, unsaved } from "./tree-save";

/** 最後に取り込んだ結果 (sim-mods の上に出す。閉じるか次の取り込みまで) */
export const pasteNote = ref<{ base: string; aims: number; bad: Array<{ line: string; why: string }>; /** 読み方が 2 通り以上の時だけ (先頭 = 仮に選んだ読み) */ readings?: ItemTextReading[]; /** 今の読み方 */ pick: number; /** 段が仮の MOD (1 行に足された値の割り方が決まらない) */ guess: string[]; /** エミュの「シミュレーターへ」から */ emu?: true } | null>(null);
/** 取り込めなかった時の理由 (貼る口の下に出す) */
export const pasteWhy = ref<string | null>(null);

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
  // 置き換える木が作りかけなら、置き換える前に 3 択 (保存して進む / 保存せず進む / やめる。10-26 モンキー 6: 前は ② から木へ戻る時に聞く形で、
  // その間にほかの道 (上のタブ等) で離れると聞かずに消えた)。保存済みのまま・白紙・新しいツリーのタブは聞かない
  if (unsaved(useTree().doc.value)) askLeave(() => importPaste(text), () => void quickSave());
  else importPaste(text);
  return true;
}

/** 取り込む。貼った文のベースとアイテムレベルへ切り替え、狙いを入れて ② 完成の MOD のページへ */
function importPaste(text: string): void {
  const data = s.data.value;
  if (!data) return;
  const r = parseItemText(data, text);
  if (!r.base) return;
  // 読み方 (ジン部長の parseItemText の readings。無ければ mods の 1 通り)。先頭 = 一番もっともらしい読み
  takeReadings(r.base, r.itemLevel, r.readings?.length ? r.readings : [{ mods: r.mods, skipped: r.skipped }], null, r.quality ? { value: r.quality.value, tag: r.quality.tag ?? null } : null);
  track("sim:paste");
}

/**
 * エミュで持っているアイテムを取り込む (エミュの「シミュレーターへ」、sim-links.ts の openSimWithItem。2026-10-26 夜オーナー「忍者コピーに似てる」)。
 * 付いている MOD を全部、貼り付けと同じ読み方で完成形の狙い (その段以上) に入れて ② へ。段は MOD 自身の段の並びから (エッセンスの MOD もエッセンス自身の段、表と同じ)。
 * エミュでフラクチャー済みの MOD は ✦ の印を付けたまま (貼り付けと同じ。10-27 オーナー「ツリーへ行く時に選べるようにしたから、フラクチャー MOD を付けた状態で」、10-26 夜の「オフで渡す」は取り消し)
 */
export function requestEmuItem(item: StageItem): void {
  const data = s.data.value;
  if (!data) return;
  const mods: ItemTextMod[] = [...item.prefixes, ...item.suffixes].map((m) => {
    const of = data.mods.get(m.modId)?.tiers.length ?? 0, text = tr(m.textJa, m.textEn);
    const tier = of && !m.unrevealed ? { index: m.tierIndex, of, label: `T${of - m.tierIndex}`, name: m.affix, fits: true } : null;
    return { text, modId: m.unrevealed ? null : m.modId, source: m.desecrated ? "desecrated" : m.crafted ? "essence" : "normal", side: m.side, sideFrom: "engine", tier, values: [...m.values], shownValues: [...m.values], boosts: [], fractured: !!m.fractured, desecrated: !!m.desecrated, crafted: !!m.crafted, unrevealed: !!m.unrevealed };
  });
  const go = (): void => { takeReadings({ en: item.base, ja: item.baseJa }, item.itemLevel, [{ mods, skipped: [] }], { base: item.base, rollSeed: item.rollSeed, implicitRoll: item.implicitRoll, implicitFixed: item.implicitFixed }, item.quality ? { value: item.quality, tag: item.qualityTag ?? null } : null); track("sim:fromEmu"); };
  // 作りかけの木を置き換える時は貼り付けと同じ 3 択
  if (unsaved(useTree().doc.value)) askLeave(go, () => void quickSave());
  else go();
}

/** 読めたアイテム (ベース・アイテムレベル・読み方) を木に入れて ② 完成の MOD のページへ (貼り付けとエミュの共通) */
/** emu = エミュから来た時の暗黙の振り (TreeDoc.goalImplicit)。貼り付けは無し */
/** quality = 貼った文・エミュのアイテムの品質と種類。完成形の品質の欄に入れておき、「品質も狙う」☑ をオンにした時にその値で出す (☑ は既定オフのまま。10-27 夜オーナー、スイッチ goalQuality) */
function takeReadings(base: { en: string; ja: string }, itemLevel: number | null | undefined, readings: ItemTextReading[], emu: TreeDoc["goalImplicit"] | null = null, quality: { value: number; tag: string | null } | null = null): void {
  const t = useTree();
  t.setBase(base.en, itemLevel ?? t.doc.value.itemLevel);
  // 貼った文のアイテムレベルを使う (白紙の木は適正で作られ、狙いに合わせて変わるので外す。文に無ければ今のまま)
  const ilvl = itemLevel;
  if (ilvl) t.edit((d) => { delete d.ilvlFit; d.itemLevel = ilvl; });
  // 前の木の「適正で合わせました」の一言は消す (貼った値なので)
  t.ilvlNote.value = null;
  const { aims, bad } = aimsOfReading(readings[0]!);
  setAims(aims);
  // 貼った木は名前なしの新しい木 (開いていたレシピの続きではない)
  setCurrentTreeRecipe(null);
  pasteNote.value = { base: tr(base.ja, base.en), aims: aims.length, bad, readings: readings.length > 1 ? readings : undefined, pick: 0, guess: guessOf(readings[0]!), ...(emu ? { emu: true as const } : {}) };
  // ② 完成の MOD のページへ (どの画面から貼っても同じ。ツリーの窓で開いていた時も)
  t.needBase.value = false;
  t.edit((d) => { if (emu) d.goalImplicit = emu; else delete d.goalImplicit; });
  if (flag("goalQuality")) {
    const g = t.goalItem.value?.item;
    t.edit((d) => {
      delete d.goalQualityOn; delete d.goalQuality; delete d.goalQualityTag; delete d.goalQualityCap;
      if (!quality || quality.value <= 0) return;
      d.goalQuality = quality.value;
      if (quality.tag) d.goalQualityTag = quality.tag;
      // ベースの上限を超える品質は、品質の帯の上限もその値まで上げておく
      if (g && quality.value > maxQualityOf(g)) d.goalQualityCap = quality.value;
    });
  }
  openTreePage("mods");
  t.goalPage.value = 2;
  // エミュから入れたままの木は、戻る時に保存を聞かない (10-26 夜オーナー)
  markPristine(emu ? t.doc.value : null);
}

/** 1 通りの読み方 → 完成形の狙いと、狙いにできなかった行 (読めなかった行も) */
function aimsOfReading(rd: ItemTextReading): { aims: Aim[]; bad: Array<{ line: string; why: string }> } {
  const data = s.data.value!, t = useTree();
  const bad: Array<{ line: string; why: string }> = rd.skipped.map((x) => ({ line: x.line, why: tr(x.reason.ja, x.reason.en) }));
  // 完成形の窓の表にある MOD と段 (表に無い MOD は狙いにできない)
  const known = new Set(t.rows.value.flatMap((row) => row.tiers.map((x) => `${x.modId ?? row.id}|${x.tier}`)));
  const lv = t.doc.value.itemLevel, aims: Aim[] = [];
  // フラクチャーの MOD を先に (印の候補)、ほかは貼った順
  for (const m of [...rd.mods.filter((x) => x.fractured), ...rd.mods.filter((x) => !x.fractured)]) {
    if (!m.modId || !m.tier) { bad.push({ line: m.text, why: m.unrevealed ? tr("未発現 (発現するまで MOD が決まらない)", "Unrevealed (the mod isn't known yet)") : tr("MOD が分からない", "Unknown mod") }); continue; }
    const tier = Number(m.tier.label.replace(/^T/, ""));
    if (!known.has(`${m.modId}|${tier}`)) { bad.push({ line: m.text, why: tr("完成の MOD の表に無い", "Not in the final-mod table") }); continue; }
    if (aims.some((a) => a.modId === m.modId)) continue;
    const why = goalBlock(data, t.doc.value.base, lv, aims.map((a) => ({ modId: a.modId, tier: a.tier })), { modId: m.modId, tier });
    if (why) { bad.push({ line: m.text, why }); continue; }
    // 冒涜の MOD はフラクチャーできない (完成形の窓と同じ)。印は付けず狙いだけ
    // 貼った素の値も持つ (完成形のカードにそのまま出す、use-tree の goalItem)
    aims.push({ modId: m.modId, tier, ...(m.fractured && !m.desecrated ? { fractured: true as const } : {}), ...(m.values.length ? { values: [...m.values] } : {}) });
  }
  return { aims, bad };
}
/** 完成形の狙いを入れ替える (1 手)。印はスタートの形を決める (use-tree の toggleFracture と同じく、印の MOD はスタートの MOD から外してレアリティを決め直す) */
function setAims(aims: Aim[]): void {
  useTree().edit((d) => {
    if (aims.length) d.memoAims = aims; else delete d.memoAims;
    migrateStart(d);
    d.start!.mods = d.start!.mods.filter((m) => !aims.some((a) => a.fractured && a.modId === m.modId));
    d.start!.rarity = startRarity(d);
  });
}
/**
 * 仮の読みを切り替える (② の帯の「仮の読み ▸」の候補を押した。10-25 オーナー: 合算の行の分け方が何通りも残る時だけ候補を出し、1 押しで狙いが入れ替わる)。
 * ベース・アイテムレベルはそのまま、狙いだけ (1 つ戻すで戻せる)
 */
export function pickReading(i: number): void {
  const n = pasteNote.value, rd = n?.readings?.[i];
  if (!n || !rd || i === n.pick) return;
  const { aims, bad } = aimsOfReading(rd);
  setAims(aims);
  pasteNote.value = { ...n, aims: aims.length, bad, pick: i, guess: guessOf(rd) };
}
/** 段が仮 (和の行の割り方が 2 通り以上、ジン部長の guess) の MOD の見出し (「T2? 名前」) */
function guessOf(rd: ItemTextReading): string[] {
  const t = useTree();
  return rd.mods.filter((m) => m.guess && m.modId && m.tier).map((m) => `${m.tier!.label}? ${t.aimShort({ modId: m.modId!, tier: Number(m.tier!.label.replace(/^T/, "")) })}`);
}
/** 候補の見出し: ほかの読み方と違う MOD だけ (段 + 名前、仮は「?」)。全部同じなら全部 */
export function readingLabel(i: number): string {
  const rs = pasteNote.value?.readings;
  if (!rs?.[i]) return "";
  const t = useTree();
  const key = (m: ItemTextMod): string => `${m.modId}|${m.tier?.label}`;
  const everywhere = (k: string): boolean => rs.every((r) => r.mods.some((m) => key(m) === k));
  const own = rs[i]!.mods.filter((m) => m.modId && m.tier && !everywhere(key(m)));
  return (own.length ? own : rs[i]!.mods.filter((m) => m.modId && m.tier)).map((m) => `${m.tier!.label}${m.guess ? "?" : ""} ${t.aimShort({ modId: m.modId!, tier: Number(m.tier!.label.replace(/^T/, "")) })}`).join(" + ");
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
