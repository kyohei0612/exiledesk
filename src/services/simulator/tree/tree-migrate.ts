/**
 * tree-migrate.ts — 保存・共有・ファイルから来た木 (TreeDoc) を今の形へ読み替える (10-25 オーナー「レシピはユーザーによって貴重なデータ、絶対に消したくない、新しい版でも使えるように」)。
 * 決まり (docs/org/simulator/README): 木の形を変える時は schema の番号 (exiledesk-tree/N) を上げ、MIGRATIONS に N → N+1 の読み替えを足す。古い版は消さずに読み替える。
 * 読めない箱・手は捨てずに、その箱に要確認 (check) の印と元の値 (checkRaw) を残して開く。start の箱が無いなど木として読めない物だけ null (呼ぶ側が別の所に取っておく)
 */
import { migrateStart, TREE_SCHEMA_N, type OutKind, type TreeBox, type TreeDoc } from "./tree-model";

const SCHEMA = (n: number): string => `exiledesk-tree/${n}`;
/** N → N+1 の読み替え (形を変えたらここに足す)。番号の無い物 (10-25 までの開発版) は 0 と読む */
const MIGRATIONS: Record<number, (d: Record<string, unknown>) => void> = {
  // 0 → 1 (10-25 オーナー「オーブから枠までとかが長さ短すぎる」): 段の間を 200 → 240 にしたので、箱の縦の位置を 1.2 倍 (手で置いた所の並びもそのまま広がる)
  0: (d) => { for (const b of Object.values((d.boxes ?? {}) as Record<string, { y?: unknown }>)) if (typeof b?.y === "number") b.y = Math.round(b.y * 1.2); },
};

const OUTS: ReadonlySet<string> = new Set<OutKind | "start">(["hit", "junk", "junkGone", "lost", "any", "pass", "branch", "start"]);
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string" && !!v;
const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const aimOk = (a: unknown): boolean => a === null || (obj(a) && str(a.modId) && typeof a.tier === "number");
const handOk = (h: unknown): boolean => h === null || (obj(h) && str(h.currency) && Array.isArray(h.omens) && h.omens.every(str));

/** 木として読めるか (start の箱がある) と、どの版か。読めなければ null */
function versionOf(raw: unknown): number | null {
  if (!obj(raw) || !obj(raw.boxes) || !obj(raw.boxes.start)) return null;
  const m = typeof raw.schema === "string" ? /^exiledesk-tree\/(\d+)$/.exec(raw.schema) : null;
  if (typeof raw.schema === "string" && !m) return null;
  return m ? Number(m[1]) : 0;
}

/** 箱 1 つを直す (読めない所は既定の値にして印を付け、元の値を checkRaw に残す) */
function healBox(id: string, raw: unknown, ids: ReadonlySet<string>): TreeBox {
  const b = obj(raw) ? raw : {};
  const check = new Set<NonNullable<TreeBox["check"]>[number]>(Array.isArray(b.check) ? (b.check as TreeBox["check"])! : []);
  const keep: Record<string, unknown> = obj(b.checkRaw) ? { ...b.checkRaw } : {};
  const bad = (k: "out" | "aim" | "hand" | "link", field: string): void => { check.add(k); keep[field] = b[field]; };
  const out = OUTS.has(b.out as string) ? (b.out as TreeBox["out"]) : (bad("out", "out"), id === "start" ? "start" : "any");
  const aim = aimOk(b.aim ?? null) ? ((b.aim ?? null) as TreeBox["aim"]) : (bad("aim", "aim"), null);
  const hand = handOk(b.hand ?? null) ? ((b.hand ?? null) as TreeBox["hand"]) : (bad("hand", "hand"), null);
  const outsRaw = Array.isArray(b.outs) ? b.outs : [];
  const outs = outsRaw.filter((x): x is string => str(x) && ids.has(x));
  if (outs.length !== outsRaw.length) bad("link", "outs");
  const link = (field: "back" | "parent"): string | null => { const v = b[field] ?? null; if (v === null || (str(v) && ids.has(v))) return v as string | null; bad("link", field); return null; };
  const box: TreeBox = { ...(b as Partial<TreeBox>), id, x: num(b.x, 0), y: num(b.y, 0), out, aim, hand, outs, back: link("back"), done: b.done === "main" ? "main" : null, parent: id === "start" ? null : link("parent") };
  if (check.size) { box.check = [...check]; box.checkRaw = keep; } else { delete box.check; delete box.checkRaw; }
  return box;
}

/** 木を今の形へ (読めない箱・手は要確認の印で残す)。木として読めなければ null。fixed = 要確認の印が付いた箱の数 */
export function migrateTreeDoc(raw: unknown): { doc: TreeDoc; fixed: number } | null {
  let n = versionOf(raw);
  if (n === null || n > TREE_SCHEMA_N) return null;
  const d = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  for (; n < TREE_SCHEMA_N; n++) MIGRATIONS[n]?.(d);
  d.schema = SCHEMA(TREE_SCHEMA_N);
  const boxes = d.boxes as Record<string, unknown>;
  const ids = new Set(Object.keys(boxes));
  let fixed = 0;
  for (const id of ids) { const b = healBox(id, boxes[id], ids); if (b.check) fixed++; boxes[id] = b; }
  d.seq = num(d.seq, ids.size);
  d.base = typeof d.base === "string" ? d.base : "";
  d.itemLevel = num(d.itemLevel, 82);
  const doc = d as unknown as TreeDoc;
  migrateStart(doc);
  return { doc, fixed };
}
