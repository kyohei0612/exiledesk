/**
 * 電波が無い時に送った要望・画像の置き場 (2026-10-15 PWA)。電波が戻ったら 1 回だけ送り、送れなくても捨てる (オーナー「送れなければ捨てる」)。
 * 置き場は localStorage (入らない大きさなら送れなかった扱い)
 */
import { rememberSent } from "../state/feedback-replies";
import { onOnline } from "./pwa";

const KEY = "exiledesk.web.outbox";
interface Item { url: string; body: string; text: string }

const read = (): Item[] => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown; return Array.isArray(v) ? (v as Item[]) : []; } catch { return []; } };

/** 置く。置けなければ false */
export function queueSend(url: string, body: string, text: string): boolean {
  try { localStorage.setItem(KEY, JSON.stringify([...read(), { url, body, text }].slice(-10))); return true; } catch { return false; }
}

let sending = false;
/** 溜まっている物を送る (結果にかかわらず消す) */
export async function flushOutbox(): Promise<void> {
  if (sending || navigator.onLine === false) return;
  const list = read();
  if (!list.length) return;
  sending = true;
  try { localStorage.removeItem(KEY); } catch { /* 無くてよい */ }
  try {
    for (const it of list) {
      try {
        const r = await fetch(it.url, { method: "POST", headers: { "content-type": "application/json" }, body: it.body });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; id?: string };
        if (r.ok && j.ok && j.id) rememberSent(j.id, it.text);
      } catch { /* 捨てる */ }
    }
  } finally { sending = false; }
}

/** 開いた時と電波が戻った時に送る */
export function startOutbox(): void {
  onOnline(() => void flushOutbox());
  void flushOutbox();
}
