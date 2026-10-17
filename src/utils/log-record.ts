/**
 * 分析用の記録を 1 件 (2026-10-09 オーナー「ユーザーのデータを分析できるようにログはしっかり残そう。分析に使えるやつは全てログに」)。
 * 送る仕組み (まとめて 1 分おき・画面を離れる時) は services/telemetry/log-sender.ts。画面の部品からはこれを呼ぶだけ。
 * 個人の情報 (名前・IP・ログインの情報) は入れない。data は短い JSON にする
 */
export function logRecord(kind: string, data: Record<string, unknown>): void {
  try {
    const g = globalThis as { __exiledeskLog?: (k: string, d: Record<string, unknown>) => void; __exiledeskLogEarly?: Array<[string, Record<string, unknown>, number]> };
    if (g.__exiledeskLog) { g.__exiledeskLog(kind, data); return; }
    // 送る仕組みが始まる前の記録は取っておき、始まった時に送る (2026-10-17: 入口の visit が始まる前に呼ばれて 1 件も届いていなかった)
    const early = (g.__exiledeskLogEarly ??= []);
    if (early.length < 50) early.push([kind, data, Date.now()]);
  } catch { /* 記録は落としてよい */ }
}
