/**
 * use-tree.ts — ツリーのページの状態 (2026-10-22 表面だけ): 今のツリー・1 つ戻す (Ctrl+Z)・ブラウザに覚える・木のベースの MOD の一覧。
 * MOD の一覧はエンジンの入口の modListFor (クラフト台の MOD 一覧と同じ行。自前の表は作らない)。ベースとアイテムレベルは木の base・itemLevel (始まりの箱で選ぶ、10-22。前は金の指輪 ilvl 82 に固定)
 */
import { computed, shallowRef } from "vue";
import { craftStage as s } from "../../../state/craft-stage";
import { freshItem, modListFor } from "../../../services/craft-stage/engine";
import { isTreeDoc, newTree, type Aim, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { tr } from "../../../i18n/lang";

export type ModRow = ReturnType<typeof modListFor>[number];

/** 初めて開いた時の木のベース (見本と同じ金の指輪 ilvl 82) */
const FIRST_BASE = "Gold Ring";
const FIRST_ILVL = 82;
const KEY = "exiledesk.tree.v0";
const UNDO_MAX = 100;

function load(): TreeDoc {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    // 前の版の妥協の完成 (done: "compromise") は普通の箱 = 未完成として読む (妥協は無し、オーナー 10-22)
    if (isTreeDoc(v)) { for (const b of Object.values(v.boxes)) if (b.done !== "main") b.done = null; return v; }
  } catch { /* 無くてよい */ }
  return newTree(FIRST_BASE, FIRST_ILVL);
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
/** 別の木を開く (レシピ・共有の URL から。1 つ戻すで前の木へ戻せる) */
function open(tree: TreeDoc): void { edit((d) => { for (const k of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[k]; Object.assign(d, JSON.parse(JSON.stringify(tree))); }); }
/** 白紙に戻す (今のベースとアイテムレベルのまま。1 つ戻すで戻せる) */
function reset(): void { edit((d) => { Object.assign(d, newTree(d.base, d.itemLevel)); }); }
/** ベースを替える = そのベースの白紙から (狙い・手は前のベースの MOD なので残さない)。アイテムレベルだけなら木はそのまま。1 つ戻すで戻せる */
function setBase(base: string, itemLevel: number): void {
  edit((d) => {
    if (d.base === base) { d.itemLevel = itemLevel; return; }
    for (const k of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[k];
    Object.assign(d, newTree(base, itemLevel));
  });
}
/** ベースを替えると消える箱の数 (始まりより下の、画面に出る箱。品質を上げた後の通り抜けは数えない) */
const lostOnBase = computed(() => Object.values(doc.value.boxes).filter((b) => b.out !== "start" && b.out !== "pass").length);

/** 木のベース (レア) に付く MOD の行。データが読めるまでは空 */
const rows = computed((): ModRow[] => {
  const data = s.data.value;
  if (!data) return [];
  return modListFor(data, freshItem(data, doc.value.base, doc.value.itemLevel, "rare"));
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
  return { doc, edit, undo, canUndo, reset, setBase, lostOnBase, open, setTreeNote, rows, aimLabel, fractureLabel };
}
