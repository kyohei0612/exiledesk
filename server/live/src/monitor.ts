/**
 * 見張り (2026-10-07 オーナー「色々監視できる？報告もディスコに来たりできる？サーバーログは細かく見たい」「毎朝 9 時に報告」)。
 *   - alert():       異常をすぐ Discord に (同じ物は 6 時間に 1 回まで。KV に印、日報用に 2 日残す)
 *   - dailyReport(): 毎朝 9 時 (JST) の日報 = 昨日の 人・どこから・端末・使い方・段階と離脱・品質・要望・配信・異常・週
 *   - reqLog():      1 回ごとの記録 (ダッシュボードの「ログ」で見る。path・status・ms・国)
 * 訪問数などは Analytics Engine (events.ts) と Cloudflare の GraphQL (Web Analytics / Workers)。CF_ANALYTICS_TOKEN (Account Analytics: Read) が要る
 */
import { FUNNEL_HAND, FUNNEL_SIM, STEP_JA, funnelText, summarize, type Summary } from "./events";
import { listFeedback } from "./feedback";
import type { Env, Fetch, LiveState } from "./types";

const ALERT_TTL = 6 * 3600;
const ALERT_LOG_TTL = 2 * 86400;

/** Discord に 1 本 (webhook が無ければ何もしない) */
export async function postDiscord(webhook: string | undefined, content: string, fetchFn: Fetch = fetch): Promise<boolean> {
  if (!webhook) return false;
  try {
    const r = await fetchFn(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: content.slice(0, 1950), allowed_mentions: { parse: [] } }) });
    return r.ok;
  } catch { return false; }
}

/** 異常をすぐ知らせる。同じ key は ALERT_TTL の間は 1 回だけ。日報のために alertlog: にも残す */
export async function alert(env: Env, key: string, text: string, fetchFn: Fetch = fetch, now = new Date()): Promise<boolean> {
  const k = `alert:${key}`;
  if (await env.LIVE.get(k)) return false;
  await env.LIVE.put(k, now.toISOString(), { expirationTtl: ALERT_TTL });
  await env.LIVE.put(`alertlog:${now.toISOString()}:${key}`, text.slice(0, 200), { expirationTtl: ALERT_LOG_TTL });
  console.warn(JSON.stringify({ alert: key, text: text.slice(0, 200) }));
  const jst = new Date(now.getTime() + 9 * 3600e3).toISOString().slice(11, 16);
  return postDiscord(env.DISCORD_WEBHOOK, `🚨 **${key}** ${jst} JST\n${text}`, fetchFn);
}

/** 昨日 (since〜until) に出た異常の一覧 */
export async function alertsBetween(env: Env, since: string, until: string): Promise<string[]> {
  const l = await env.LIVE.list({ prefix: "alertlog:", limit: 200 });
  return l.keys.map((k) => k.name).filter((n) => { const t = n.slice("alertlog:".length, "alertlog:".length + 24); return t >= since && t < until; }).map((n) => n.split(":").slice(4).join(":"));
}

/** 1 回ごとの記録 (JSON 1 行。ダッシュボードのログで絞り込める) */
export function reqLog(req: Request, url: URL, status: number, ms: number, extra: Record<string, unknown> = {}): void {
  const cf = (req as Request & { cf?: { country?: string } }).cf;
  console.log(JSON.stringify({ path: url.pathname, status, ms: Math.round(ms), country: cf?.country ?? null, ...extra }));
}

/** 日本時間の「昨日」の始まりと終わり (UTC の ISO)、1 週間前。today = true なら「今日のここまで」(確かめ用) */
export function yesterdayJst(now = new Date(), today = false): { since: string; until: string; weekSince: string; label: string } {
  const jst = new Date(now.getTime() + 9 * 3600e3);
  const todayStart = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - 9 * 3600e3;
  const since = new Date(today ? todayStart : todayStart - 86400e3), until = today ? now : new Date(todayStart), weekSince = new Date(until.getTime() - 7 * 86400e3);
  const d = new Date(since.getTime() + 9 * 3600e3);
  return { since: since.toISOString(), until: until.toISOString(), weekSince: weekSince.toISOString(), label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}${today ? " (今日のここまで)" : ""}` };
}

export interface Usage { visits: number | null; pageViews: number | null; liveRequests: number | null; liveErrors: number | null; why?: string }

/** Cloudflare の集計 (GraphQL): Web Analytics の訪問とページ、サーバー (exiledesk-live) の回数とエラー */
export async function fetchUsage(env: Env, since: string, until: string, fetchFn: Fetch = fetch): Promise<Usage> {
  const out: Usage = { visits: null, pageViews: null, liveRequests: null, liveErrors: null };
  if (!env.CF_ANALYTICS_TOKEN || !env.CF_ACCOUNT_ID) { out.why = "CF_ANALYTICS_TOKEN が無い"; return out; }
  const query = `query($acc: String!, $since: Time!, $until: Time!, $site: String!, $script: String!) {
    viewer { accounts(filter: { accountTag: $acc }) {
      rum: rumPageloadEventsAdaptiveGroups(limit: 1, filter: { datetime_geq: $since, datetime_lt: $until, siteTag: $site }) { count sum { visits } }
      wk: workersInvocationsAdaptive(limit: 1, filter: { datetime_geq: $since, datetime_lt: $until, scriptName: $script }) { sum { requests errors } }
    } }
  }`;
  try {
    const r = await fetchFn("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` },
      body: JSON.stringify({ query, variables: { acc: env.CF_ACCOUNT_ID, since, until, site: env.WEB_ANALYTICS_SITE ?? "", script: "exiledesk-live" } }),
    });
    const j = (await r.json()) as { data?: { viewer?: { accounts?: Array<{ rum?: Array<{ count: number; sum: { visits: number } }>; wk?: Array<{ sum: { requests: number; errors: number } }> }> } }; errors?: Array<{ message: string }> };
    if (j.errors?.length) { out.why = j.errors.map((e) => e.message).join("; ").slice(0, 200); return out; }
    const a = j.data?.viewer?.accounts?.[0];
    const rum = a?.rum?.[0], wk = a?.wk?.[0];
    out.pageViews = rum?.count ?? 0; out.visits = rum?.sum?.visits ?? 0;
    out.liveRequests = wk?.sum?.requests ?? 0; out.liveErrors = wk?.sum?.errors ?? 0;
  } catch (e) { out.why = String(e).slice(0, 200); }
  return out;
}

const n = (v: number | null | undefined): string => (v == null ? "—" : Math.round(v).toLocaleString("ja-JP"));
const pct = (v: number | null): string => (v == null ? "—" : `${Math.round(v * 100)}%`);
const list = (xs: Array<[string, number]>): string => (xs.length ? xs.map(([k, v]) => `${k} ${v}`).join(" · ") : "—");

/** 日報の文面 (Discord 1 本に収める) */
export function reportText(label: string, sum: Summary | null, usage: Usage, feedback: { requests: number; bugs: number }, live: LiveState | null, alerts: string[]): string {
  const lines: string[] = [`📊 **ExileDesk 日報 ${label}**`];
  if (sum) {
    const ret = sum.sessions ? sum.sessions - sum.newSessions : 0;
    lines.push(`**人** 訪問 ${n(sum.sessions)} (新規 ${n(sum.newSessions)} / 再訪 ${n(ret)}) · ユーザー ${n(sum.users)} · 直帰 ${pct(sum.bounce)} · 滞在の中央 ${sum.medianMinutes == null ? "—" : `${sum.medianMinutes.toFixed(1)} 分`}`);
    lines.push(`**どこから** ${list(sum.refs)}`);
    lines.push(`**端末** ${list(sum.devices.map(([k, v]) => [k === "mobile" ? "スマホ" : "PC", v]))} · **国** ${list(sum.countries)}`);
    const use = (k: string): number => sum.byEvent.get(k)?.sessions ?? 0;
    lines.push(`**使い方** 手で打つ ${use("mode:hand")} · シミュレーション ${use("mode:sim")} · 回した ${use("sim:run")} · 取引所 ${use("trade:open")} · レシピ保存 ${use("recipe:save")}`);
    lines.push(`**段階 (シミュ)** ${funnelText(sum, FUNNEL_SIM)}`);
    lines.push(`**段階 (手)** ${funnelText(sum, FUNNEL_HAND)}`);
    const err = sum.byEvent.get("error");
    lines.push(`**品質** JS エラー ${err ? `${err.count} 件 / ${err.sessions} 人${sum.errors.length ? ` (${sum.errors.map(([k, v]) => `${k.slice(0, 50)} ×${v}`).join(" / ")})` : ""}` : "0"} · サーバー ${n(usage.liveRequests)} 回 / エラー ${n(usage.liveErrors)}`);
    if (sum.warnings.length) lines.push(`**集計の警告** ${sum.warnings.join(" / ")}`);
  } else {
    lines.push(`**人** 取れなかった (${usage.why ?? "集計の設定が無い"})`);
  }
  if (usage.visits != null) lines.push(`**Web Analytics** 訪問 ${n(usage.visits)} · ページ ${n(usage.pageViews)}`);
  lines.push(`**要望** ${feedback.requests} · **バグ** ${feedback.bugs}`);
  lines.push(live ? `**配信の見張り** ${live.live.length} 人ライブ中 · ${live.channels.length} ch · ${live.errors.length ? `気になる所 ${live.errors.length} (${live.errors[0]!.slice(0, 80)})` : "異常なし"}` : "**配信の見張り** まだ動いていない");
  lines.push(`**異常** ${alerts.length ? alerts.slice(0, 5).join(" / ") : "なし"}`);
  if (sum?.wau != null) lines.push(`**週** 7 日のユーザー ${n(sum.wau)}`);
  return lines.join("\n");
}

/** 日報を組んで Discord に (無ければ文面だけ返す) */
export async function dailyReport(env: Env, fetchFn: Fetch = fetch, now = new Date(), today = false): Promise<string> {
  const { since, until, weekSince, label } = yesterdayJst(now, today);
  const [sum, usage, fb, alerts] = await Promise.all([
    env.CF_ANALYTICS_TOKEN ? summarize(env, since, until, weekSince, fetchFn).catch((e) => { console.warn("summarize failed", String(e)); return null; }) : Promise.resolve(null),
    fetchUsage(env, since, until, fetchFn),
    listFeedback(env.LIVE, 200),
    alertsBetween(env, since, until),
  ]);
  const day = fb.filter((x) => x.at >= since && x.at < until);
  const live = (await env.LIVE.get("state", "json")) as LiveState | null;
  const text = reportText(label, sum, usage, { requests: day.filter((x) => x.kind === "request").length, bugs: day.filter((x) => x.kind === "bug").length }, live, alerts);
  await postDiscord(env.DISCORD_WEBHOOK, text, fetchFn);
  return text;
}

export { STEP_JA };
