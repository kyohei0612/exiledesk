/**
 * 応答のレート制限ヘッダの読み取り (表示 / 待ち時間 / ルール)
 *
 * trade-history.ts から切り出し (2026-09-26)。
 */
import { MARGIN, periodLabel } from "./store";

/** 制限の状態を人が読める形に (例: "1 分 1/5 · 10 分 3/10 · 3 時間 15/15 (締め出し 3600 秒)") */
export function describeRateLimit(rl: Record<string, string> | null | undefined): string {
  if (!rl) return "";
  for (const scope of ["account", "ip"]) {
    const rules = rl[`x-rate-limit-${scope}`]?.split(",") ?? [];
    const states = rl[`x-rate-limit-${scope}-state`]?.split(",") ?? [];
    if (rules.length === 0) continue;
    return rules
      .map((rule, i) => {
        const [max, period] = rule.split(":").map(Number);
        const [hits, , restricted] = (states[i] ?? "").split(":").map(Number);
        return `${periodLabel(period)} ${Number.isFinite(hits) ? hits : "?"}/${max}${restricted > 0 ? ` (締め出し ${restricted} 秒)` : ""}`;
      })
      .join(" · ");
  }
  return "";
}

/**
 * 応答のレート制限ヘッダから、サーバー都合で待つべき時間 (ms)。
 * 締め出し中はその窓の長さ (最長 3 時間) を待つ。2026-09-16 実測: 1 時間の締め出しが解けた直後に 1 回取っただけで、
 * 3 時間の窓がまだ埋まっていて再び 3600 秒締め出された。
 */
export function waitFromRateLimit(rl: Record<string, string> | null | undefined): number {
  if (!rl) return 0;
  let wait = 0;
  for (const scope of ["account", "ip"]) {
    const rules = rl[`x-rate-limit-${scope}`]?.split(",") ?? [];
    const states = rl[`x-rate-limit-${scope}-state`]?.split(",") ?? [];
    rules.forEach((rule, i) => {
      const [max, period] = rule.split(":").map(Number);
      const [hits, , restricted] = (states[i] ?? "").split(":").map(Number);
      if (restricted > 0) wait = Math.max(wait, Math.max(restricted, period) * 1000);
      else if (max > 0 && period > 0 && hits >= max - MARGIN) wait = Math.max(wait, period * 1000);
    });
  }
  return wait;
}

/** 応答ヘッダから制限ルール (account 優先) を取り出す */
export function rulesOf(rl: Record<string, string> | null | undefined): string | null {
  return rl?.["x-rate-limit-account"] || rl?.["x-rate-limit-ip"] || null;
}

export const clock = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
