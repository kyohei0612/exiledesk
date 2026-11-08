/**
 * 要望に必ず添える作りかけの木 (11-08 オーナー「1おけ」: 保存せずに閉じた後や、別のページから送っても辿れるように)。
 * シミュの木は離れると白紙に戻る (作業中の木は持ち越さない、10-24 夜) ので、シミュが木を替えた時に詰めた形 (#recipe= の後ろの code) をここへ書き、
 * 要望の窓 (FeedbackDialog の contextNow) が読むだけ。名前は入れない (Y-62、code は名前を空で詰める)。開き直す用ではない
 */
const KEY = "exiledesk.feedback.tree-draft";
/** 古い木は添えない (前の日の木が別の要望に付かないよう) */
const KEEP_MS = 24 * 60 * 60 * 1000;
/** 添える上限 (サーバーの添付は全部で 96 KB = server/live/src/feedback.ts の MAX_CONTEXT。ほかの添付の分を残す) */
const MAX_CODE = 60_000;

/** シミュから: 今の木の code (白紙の木・空なら null で消す) */
export function noteTreeDraft(code: string | null): void {
  try {
    if (code) localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
    else localStorage.removeItem(KEY);
  } catch { /* 書けなくても要望は送れる */ }
}

/** 要望の窓から: 添える木 (無い・古いなら null。大きすぎる時は長さだけ) */
export function treeDraftNow(): { code: string; ageSec: number } | { tooBig: number; ageSec: number } | null {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? "null") as { code?: unknown; at?: unknown } | null;
    if (!j || typeof j.code !== "string" || typeof j.at !== "number" || Date.now() - j.at > KEEP_MS) return null;
    const ageSec = Math.round((Date.now() - j.at) / 1000);
    return j.code.length > MAX_CODE ? { tooBig: j.code.length, ageSec } : { code: j.code, ageSec };
  } catch { return null; }
}
