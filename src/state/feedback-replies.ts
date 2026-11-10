/**
 * feedback-replies.ts — 要望・バグへの返事 (2026-10-11 オーナー「直しましたの返信、次回起動時に教えたい」)
 *
 * 送った時にその要望の id と本文の頭を、送った人のブラウザにだけ覚える (rememberSent)。
 * 開いた時 (と 45 分おいて戻った時) に、まだ返事を見ていない id だけをサーバーに聞き (GET /feedback/replies)、
 * 返事があれば「更新しました」の窓の一番上に出す (ChangelogDialog)。スイッチ replyPopup の時は次に押した時のポップアップ (web/ReplyAsk.vue、U-36)。1 回見たら出さない。
 * 聞きに行くのは送ったことのある人だけなので、来た人全員の問い合わせは増えない
 */
import { ref } from "vue";
import { WEB_API_BASE } from "../web/config";
import { flag } from "../web/release-flags";

/** 返事のポップアップ (U-36、スイッチ replyPopup)。入っている時は更新の窓へ出さず popupReplies に入れ、次に押した時にポップアップ (web/ReplyAsk.vue) */
export const REPLY_POPUP = typeof window !== "undefined" && flag("replyPopup");

const SENT_KEY = "exiledesk.feedback.sent";
const SEEN_KEY = "exiledesk.feedback.replySeen";
interface Sent { id: string; at: string; text: string }
interface ShownReply { id: string; asked: string; reply: string; en?: string; version?: string; askImage?: boolean }
/** 出す返事 (まだ見ていない物) */
export const feedbackReplies = ref<ShownReply[]>([]);
/** ポップアップで出す返事 (REPLY_POPUP の時だけ。閉じたら見た事に) */
export const popupReplies = ref<ShownReply[]>([]);
/** 「返事を書く」の相手 (要望のページを返事の形で開く。送ると元の要望 id を replyTo に付ける、U-36) */
export const replyTo = ref<ShownReply | null>(null);
/** 返事で「画像を下さい」と頼まれた要望の id (押すと画像を送る窓が開く。WebApp の FeedbackDialog、2026-10-14) */
export const imageAskFor = ref<string | null>(null);

const read = <T,>(k: string, d: T): T => { try { return (JSON.parse(localStorage.getItem(k) ?? "null") as T) ?? d; } catch { return d; } };
const write = (k: string, v: unknown): void => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 覚えられなくても送れる */ } };

/** 要望を送れた時に呼ぶ (新しい 20 件まで) */
export function rememberSent(id: string, text: string): void {
  if (!id) return;
  const list = read<Sent[]>(SENT_KEY, []).filter((x) => x.id !== id);
  write(SENT_KEY, [{ id, at: new Date().toISOString(), text: text.slice(0, 60) }, ...list].slice(0, 20));
}

/** まだ返事を見ていない id の返事を聞く。あれば feedbackReplies に入れて true */
export async function checkReplies(): Promise<boolean> {
  const sent = read<Sent[]>(SENT_KEY, []);
  const seen = new Set(read<string[]>(SEEN_KEY, []));
  const ask = sent.filter((x) => !seen.has(x.id)).slice(0, 10);
  if (!ask.length) return false;
  try {
    const r = await fetch(`${WEB_API_BASE}/feedback/replies?ids=${ask.map((x) => encodeURIComponent(x.id)).join(",")}`, { credentials: "omit" });
    if (!r.ok) return false;
    const j = (await r.json()) as { replies?: Record<string, { text: string; en?: string; version?: string; askImage?: boolean }> };
    const got = ask.flatMap((x) => { const v = j.replies?.[x.id]; return v ? [{ id: x.id, asked: x.text, reply: v.text, ...(v.en ? { en: v.en } : {}), ...(v.version ? { version: v.version } : {}), ...(v.askImage ? { askImage: true } : {}) }] : []; });
    const list = REPLY_POPUP ? popupReplies : feedbackReplies;
    const have = new Set(list.value.map((x) => x.id));
    list.value = [...list.value, ...got.filter((x) => !have.has(x.id))];
    // ポップアップの時は更新の窓を開かせない (false)
    return got.length > 0 && !REPLY_POPUP;
  } catch { return false; }
}

/** 窓を閉じた時に呼ぶ: 出した返事は見た事にする (ポップアップの返事も) */
export function markRepliesSeen(): void {
  const all = [...feedbackReplies.value, ...popupReplies.value];
  if (!all.length) return;
  const seen = new Set(read<string[]>(SEEN_KEY, []));
  for (const r of all) seen.add(r.id);
  write(SEEN_KEY, [...seen].slice(-50));
  feedbackReplies.value = [];
  popupReplies.value = [];
}
