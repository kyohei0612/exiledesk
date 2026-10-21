/**
 * use-tree.ts — ツリーのページの状態 (2026-10-22 表面だけ): 今のツリー・1 つ戻す (Ctrl+Z)・ブラウザに覚える・金の指輪の MOD の一覧。
 * MOD の一覧はエンジンの入口の modListFor (クラフト台の MOD 一覧と同じ行。自前の表は作らない)。ベースは金の指輪 ilvl 82 だけ (オーナー 10-22)
 */
import { computed, shallowRef } from "vue";
import { craftStage as s } from "../../../state/craft-stage";
import { freshItem, modListFor } from "../../../services/craft-stage/engine";
import { isTreeDoc, newTree, type Aim, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { tr } from "../../../i18n/lang";

export type ModRow = ReturnType<typeof modListFor>[number];

export const TREE_BASE = "Gold Ring";
export const TREE_ILVL = 82;
const KEY = "exiledesk.tree.v0";
const UNDO_MAX = 100;

function load(): TreeDoc {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "null"); if (isTreeDoc(v)) return v; } catch { /* 無くてよい */ }
  return newTree(TREE_BASE, TREE_ILVL);
}
function save(d: TreeDoc): void {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* 覚えられなくても使える */ }
}

const doc = shallowRef<TreeDoc>(load());
const undoStack: string[] = [];
const canUndo = shallowRef(false);

/** 組み替えを 1 回 (写しを書き換えて差し替える。前の形は 1 つ戻す用に控える) */
function edit(fn: (d: TreeDoc) => void): void {
  const before = JSON.stringify(doc.value);
  const d = JSON.parse(before) as TreeDoc;
  fn(d);
  const after = JSON.stringify(d);
  if (after === before) return;
  undoStack.push(before);
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  canUndo.value = true;
  doc.value = d;
  save(d);
}
/** 1 つ戻す。ツリーのメモの文は戻さない (メモ欄の中の Ctrl+Z が受け持つ。ツリーの Ctrl+Z で書いた文がまとめて消えた、10-22) */
function undo(): void {
  const prev = undoStack.pop();
  canUndo.value = undoStack.length > 0;
  if (!prev) return;
  const d = JSON.parse(prev) as TreeDoc;
  d.note = doc.value.note;
  doc.value = d;
  save(d);
}
/** ツリーのメモの文を書く (打つたびに覚える、1 つ戻すには入れない) */
function setTreeNote(text: string): void {
  if ((doc.value.note ?? "") === text) return;
  const d: TreeDoc = { ...doc.value, note: text };
  if (!text) delete d.note;
  doc.value = d;
  save(d);
}
/** 白紙に戻す (1 つ戻すで戻せる) */
function reset(): void { edit((d) => { Object.assign(d, newTree(TREE_BASE, TREE_ILVL)); }); }

/** 金の指輪 (ilvl 82、レア) に付く MOD の行。データが読めるまでは空 */
const rows = computed((): ModRow[] => {
  const data = s.data.value;
  if (!data) return [];
  return modListFor(data, freshItem(data, TREE_BASE, TREE_ILVL, "rare"));
});
const rowOfMod = (modId: string): ModRow | undefined => rows.value.find((r) => r.id === modId || r.tiers.some((t) => t.modId === modId));

/** 当たりの札の文 (「T2 以上」+ MOD の文。箱の幅で切れても段が見えるよう段が先) */
function aimLabel(a: Aim | null): string {
  if (!a) return "";
  const r = rowOfMod(a.modId);
  const side = r ? (r.side === "prefix" ? tr("プレ", "Prefix") : tr("サフィ", "Suffix")) : "";
  return `${a.tier === 1 ? "T1" : tr(`T${a.tier} 以上`, `T${a.tier}+`)} ${side} ${r?.template ?? a.modId}`;
}
/** フラクチャーの文 (その段の数値で埋めた文 + 段) */
function fractureLabel(a: Aim | null): string {
  if (!a) return "";
  const r = rowOfMod(a.modId);
  const t = r?.tiers[a.tier - 1];
  return `T${a.tier} ${t?.text ?? r?.text ?? a.modId}`;
}

export function useTree() {
  return { doc, edit, undo, canUndo, reset, setTreeNote, rows, aimLabel, fractureLabel };
}
