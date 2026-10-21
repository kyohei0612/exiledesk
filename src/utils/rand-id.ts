/** 記録の id に使う乱数の文字 (12 文字前後の英数。log-sender.ts と web/track.ts の uid・sid) */
export const randId = (): string => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
