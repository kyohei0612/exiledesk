/**
 * account-client.ts — 共通アカウントの端末の側の口 (docs/spec/account.md A-xx、2026-11-03 案)。
 * server/live の /account/* と同じ形の関数と、この端末の札 (localStorage) だけを持つ。画面はまだ呼ばない (スイッチ account の下で A-90)。
 * 呼ぶのは押した時だけ (A-42・Y-100)。開いた時・打つ・回す間は呼ばない
 */
import { WEB_API_BASE } from "../web/config";

const KEY = "exiledesk.account.v1";
/** この端末の札と、最後に下ろした時刻 (同期の since) */
export interface AccountLocal { id: string; name: string | null; token: string; rev: number }
export type AccountResult<T> = { ok: true; value: T } | { ok: false; error: string; status: number; gone?: boolean };

export function myAccount(): AccountLocal | null {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as AccountLocal | null; return v && typeof v.token === "string" ? v : null; } catch { return null; }
}
export function saveAccount(a: AccountLocal | null): void {
  try { if (a) localStorage.setItem(KEY, JSON.stringify(a)); else localStorage.removeItem(KEY); } catch { /* 覚えられなくてもその場は動く */ }
}

/** 手元の確かめでは base を差し替える (wrangler dev の http://127.0.0.1:8787 など) */
async function post<T>(path: string, body: Record<string, unknown>, base = WEB_API_BASE): Promise<AccountResult<T>> {
  try {
    const r = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { error?: string; gone?: boolean } & T;
    if (!r.ok) {
      // 外された端末は札を捨てて、この端末だけの状態に戻る (A-14。保存物は消さない)
      if (j.gone) saveAccount(null);
      return { ok: false, error: j.error ?? `HTTP ${r.status}`, status: r.status, gone: j.gone };
    }
    return { ok: true, value: j };
  } catch (e) { return { ok: false, error: `つながらない (${String(e)})`, status: 0 }; }
}

/** 作る。コードはここで 1 度だけ返る (A-13)。端末には残さない */
export async function createAccount(name?: string, base?: string): Promise<AccountResult<{ code: string }>> {
  const r = await post<{ id: string; name: string | null; code: string; token: string }>("/account/new", name ? { name } : {}, base);
  if (!r.ok) return r;
  saveAccount({ id: r.value.id, name: r.value.name, token: r.value.token, rev: 0 });
  return { ok: true, value: { code: r.value.code } };
}
/** コードで別の端末をつなぐ (A-15) */
export async function linkAccount(code: string, base?: string): Promise<AccountResult<{ name: string | null }>> {
  const r = await post<{ id: string; name: string | null; token: string }>("/account/link", { code }, base);
  if (!r.ok) return r;
  saveAccount({ id: r.value.id, name: r.value.name, token: r.value.token, rev: 0 });
  return { ok: true, value: { name: r.value.name } };
}

function withToken<T>(path: string, body: Record<string, unknown> = {}, base?: string): Promise<AccountResult<T>> {
  const a = myAccount();
  if (!a) return Promise.resolve({ ok: false, error: "アカウントにつないでいない", status: 0 });
  return post<T>(path, { ...body, t: a.token }, base);
}
/** 作り直す。dropOthers でほかの端末を全部外す (A-14) */
export const reissueCode = (dropOthers = false, base?: string) => withToken<{ code: string }>("/account/code", { dropOthers }, base);
export const accountDevices = (base?: string) => withToken<{ name: string | null; created: number; codeAt: number; devices: Array<{ label: string; created: number; seen: number; me: boolean }> }>("/account/devices", {}, base);
export async function setAccountName(name: string, base?: string): Promise<AccountResult<{ name: string }>> {
  const r = await withToken<{ name: string }>("/account/name", { name }, base);
  const a = myAccount();
  if (r.ok && a) saveAccount({ ...a, name: r.value.name });
  return r;
}
export async function unlinkAccount(base?: string): Promise<AccountResult<{ ok: true }>> {
  const r = await withToken<{ ok: true }>("/account/unlink", {}, base);
  if (r.ok) saveAccount(null);
  return r;
}

export interface SyncItem { kind: string; id: string; updatedAt: number; deleted?: boolean; name?: string; body?: string }
/** 上げると下ろすを 1 回で (A-42)。since は前回の rev */
export async function syncRaw(put: SyncItem[], base?: string): Promise<AccountResult<{ rev: number; items: SyncItem[] }>> {
  const a = myAccount();
  const r = await withToken<{ rev: number; items: SyncItem[] }>("/account/sync", { since: a?.rev ?? 0, put }, base);
  const now = myAccount();
  if (r.ok && now) saveAccount({ ...now, rev: r.value.rev });
  return r;
}
