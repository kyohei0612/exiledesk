/**
 * board-api.ts — 掲示板 (Web 版だけ、2026-10-16 最初の段) とサーバー (server/live の board.ts) のやり取り。
 * 端末の番号は使い方の記録・要望と同じ localStorage の exiledesk.web.uid (無ければ作る)。画面には出さない
 */
import { ref } from "vue";
import { WEB_API_BASE } from "../../web/config";
import { tr } from "../../i18n/lang";

export type BoardTag = "advice" | "show" | "beginner" | "expert";
/** タグ (書く時に 1 つ。オーナー「どんな人たちに返信して欲しいか」) */
export const BOARD_TAGS: ReadonlyArray<{ k: BoardTag; ja: string; en: string }> = [
  { k: "advice", ja: "相談", en: "Advice" },
  { k: "show", ja: "自慢", en: "Show-off" },
  { k: "beginner", ja: "初心者に優しく", en: "Beginner-friendly" },
  { k: "expert", ja: "上級者に聞きたい", en: "Ask the experts" },
];
export const tagLabel = (k: string): string => { const t = BOARD_TAGS.find((x) => x.k === k); return t ? tr(t.ja, t.en) : k; };
export const NAMELESS = (): string => tr("名無しのエグザイル", "Nameless Exile");
export const MAX_TEXT = 1000;
export const MAX_NAME = 20;

/** 当たりの速報の中身 (サーバーは形だけ確かめる。文は見る側の画面が自分のデータで作る) */
export interface BoardHit { base: string; ilvl: number; cur: string; n: number; modId: string; ti: number; v: number[]; p: number }
export type BoardItem = { id: string; kind: "post"; name: string; tag: string; text: string } | { id: string; kind: "hit"; hit: BoardHit };

/** 掲示板のタブを開いているか (クラフトステージのタブの並び。エミュレーター・シミュレーターの中身は隠すだけで残す) */
export const boardOn = ref(false);

const UID_KEY = "exiledesk.web.uid";
export function boardUid(): string {
  try {
    const v = localStorage.getItem(UID_KEY);
    if (v) return v;
    const u = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
    localStorage.setItem(UID_KEY, u);
    return u;
  } catch { return ""; }
}

/** 名前は端末に覚える (次に書く時も同じ) */
const NAME_KEY = "exiledesk.board.name";
export const boardName = ref((() => { try { return localStorage.getItem(NAME_KEY) ?? ""; } catch { return ""; } })());
export function rememberName(v: string): void { try { if (v) localStorage.setItem(NAME_KEY, v); else localStorage.removeItem(NAME_KEY); } catch { /* 覚えられなくてよい */ } }

/** 当たりを掲示板に流すか (既定は流す。オーナー「流したくない人は設定で止められる」) */
const HITS_KEY = "exiledesk.board.hits";
export const boardHitsOn = ref((() => { try { return localStorage.getItem(HITS_KEY) !== "0"; } catch { return true; } })());
export function setBoardHits(v: boolean): void { boardHitsOn.value = v; try { if (v) localStorage.removeItem(HITS_KEY); else localStorage.setItem(HITS_KEY, "0"); } catch { /* 今の間は効く */ } }

export async function fetchBoard(tag: string | null, before: string | null): Promise<{ items: BoardItem[]; more: boolean }> {
  const q = new URLSearchParams();
  if (tag) q.set("tag", tag);
  if (before) q.set("before", before);
  const r = await fetch(`${WEB_API_BASE}/board.json${q.size ? `?${q}` : ""}`, { credentials: "omit" });
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as { items: BoardItem[]; more: boolean };
}

const postJson = async (path: string, body: unknown): Promise<{ ok?: boolean; error?: string; item?: BoardItem }> => {
  const r = await fetch(`${WEB_API_BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "omit" });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; item?: BoardItem };
  if (!r.ok && !j.error) j.error = String(r.status);
  return j;
};

/** サーバーの理由 (日本語) を英語の画面向けに */
const ERR_EN: Record<string, string> = {
  "続けて書けるのは 1 分に 1 件": "You can post once per minute",
  "書きすぎ (1 時間に 10 件まで)": "Too many posts (10 per hour)",
  "この端末からは書き込めません": "Posting is blocked from this device",
  "使えない言葉が入っています": "Your post contains a blocked word",
  "外のリンクは貼れません": "Links to other sites are not allowed",
  "メールアドレス・電話番号は書けません": "Email addresses and phone numbers are not allowed",
  "本文が空": "The post is empty",
  "タグを選んでください": "Choose a tag",
};
export const errText = (e: string): string => tr(e, ERR_EN[e] ?? e);

export async function sendPost(p: { name: string; tag: BoardTag; text: string; website: string }): Promise<{ item?: BoardItem; error?: string }> {
  try {
    const j = await postJson("/board/post", { uid: boardUid(), ...p });
    return j.ok && j.item ? { item: j.item } : { error: j.error ?? "?" };
  } catch (e) { return { error: String((e as Error).message ?? e) }; }
}
export async function reportItem(id: string): Promise<boolean> {
  try { return !!(await postJson("/board/report", { uid: boardUid(), id })).ok; } catch { return false; }
}
export async function sendHit(h: BoardHit): Promise<void> {
  try { await postJson("/board/hit", { uid: boardUid(), ...h }); } catch { /* 札は落としてよい */ }
}
