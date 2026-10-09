/**
 * 見張り (2026-10-07 オーナー「色々監視できる？報告もディスコに来たりできる？サーバーログは細かく見たい」「毎朝 9 時に報告」)。
 *   - alert():       異常をすぐ Discord に (同じ物は 6 時間に 1 回まで。KV に印、日報用に 2 日残す)
 *   - dailyReport(): 毎朝 9 時 (JST) の日報 = 昨日の 人・どこから・端末・使い方・段階と離脱・品質・要望・配信・異常・週
 *   - reqLog():      1 回ごとの記録 (ダッシュボードの「ログ」で見る。path・status・ms・国)
 * 訪問数などは Analytics Engine (events.ts) と Cloudflare の GraphQL (Web Analytics / Workers)。CF_ANALYTICS_TOKEN (Account Analytics: Read) が要る
 */
import { FUNNEL_SIM, STEP_JA, summarize, type Summary } from "./events";
import { listFeedback } from "./feedback";
import { dayCount } from "./logs";
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

/**
 * 異常を控える。同じ key は ALERT_TTL の間は 1 回だけ。日報 (毎朝 9 時) の「異常の通知」に載せるために alertlog: に残すだけで、
 * Discord にはすぐには送らない (2026-10-08 オーナー「配信の見張り通知はいらん、定時報告とバグのリアルタイム通知のみでおｋ」。
 * 前は 🚨 で即時に送っていた)。すぐ送るのは要望・バグ (feedback.ts) だけ
 */
export async function alert(env: Env, key: string, text: string, _fetchFn: Fetch = fetch, now = new Date()): Promise<boolean> {
  const k = `alert:${key}`;
  if (await env.LIVE.get(k)) return false;
  await env.LIVE.put(k, now.toISOString(), { expirationTtl: ALERT_TTL });
  await env.LIVE.put(`alertlog:${now.toISOString()}:${key}`, text.slice(0, 200), { expirationTtl: ALERT_LOG_TTL });
  console.warn(JSON.stringify({ alert: key, text: text.slice(0, 200) }));
  return true;
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

const n = (v: number | null | undefined): string => (v == null ? "不明" : Math.round(v).toLocaleString("ja-JP"));
const pct = (v: number | null): string => (v == null ? "不明" : `${Math.round(v * 100)}%`);
const refJa = (k: string): string => (k === "direct" ? "直接 (URL を直に開いた)" : k.replace(/^www\./, ""));

/**
 * 日報の文面 (文章で。2026-10-07 オーナー「数字の羅列は分かりづらい、文章で教えて」)。
 * 人が 0 の日は短く、来た日は 何人・どこから・端末・何をしたか・どこで減ったか・品質・要望・配信・異常・週 を段落で
 */
export function reportText(label: string, sum: Summary | null, usage: Usage, feedback: { requests: number; bugs: number }, live: LiveState | null, alerts: string[]): string {
  const out: string[] = [`📊 **ExileDesk 日報 ${label}**`];
  const fb = feedback.requests + feedback.bugs ? `要望が ${feedback.requests} 件、バグ報告が ${feedback.bugs} 件来ています。` : "要望・バグ報告はありません。";
  if (!sum) {
    out.push(`訪問の集計は取れませんでした (${usage.why ?? "集計の設定が無い"})。`);
  } else if (!sum.sessions) {
    out.push(label.includes("今日") ? "今日はまだ誰も来ていません。" : "昨日は誰も来ていません。");
  } else {
    const ret = sum.sessions - sum.newSessions;
    const when = label.includes("今日") ? "今日はここまでで" : "昨日は";
    const who = `${when} ${n(sum.sessions)} 回の訪問がありました (新しい人 ${n(sum.newSessions)}、前にも来た人 ${n(ret)}、人数にして ${n(sum.users)} 人)。`;
    const stay = sum.bounce == null ? "" : sum.bounce >= 0.5 ? `半分以上 (${pct(sum.bounce)}) は何もせずに閉じています。` : `${pct(sum.bounce)} は何もせずに閉じました。`;
    const dur = sum.medianMinutes == null ? "" : `残った人は真ん中で ${sum.medianMinutes < 1 ? "1 分未満" : `${sum.medianMinutes.toFixed(0)} 分ほど`}使っています。`;
    out.push([who, stay, dur].filter(Boolean).join(""));
    const refs = sum.refs.slice(0, 3).map(([k, v], i) => `${i === 0 ? "" : "次が "}${refJa(k)} ${v} 回`).join("、");
    const devMobile = sum.devices.find(([k]) => k === "mobile")?.[1] ?? 0;
    const devAll = sum.devices.reduce((a, [, v]) => a + v, 0) || 1;
    const dev = `端末は PC が ${Math.round(((devAll - devMobile) / devAll) * 100)}%、スマホが ${Math.round((devMobile / devAll) * 100)}%。`;
    const jp = sum.countries.find(([k]) => k === "JP")?.[1] ?? 0;
    const country = sum.countries.length ? (jp / devAll >= 0.9 ? "ほぼ日本からです。" : `国は ${sum.countries.slice(0, 3).map(([k, v]) => `${k} ${v}`).join("、")}。`) : "";
    // localhost は開発の確認 (自分) なので分けて書く (2026-10-08 オーナー「ガチで 13 人来たの？」)
    const local = sum.refs.find(([k]) => /^localhost|127\.0\.0\.1/.test(k))?.[1] ?? 0;
    out.push(`来た道は ${refs || "分かりません"}${local ? ` (localhost の ${n(local)} 回は開発の確認で、よそから来た人ではありません)` : ""}。${dev}${country}`);
    const use = (k: string): number => sum.byEvent.get(k)?.sessions ?? 0;
    // 「手で打った」は実際に 1 手以上打った印 (hand:use)。前は開いた時の画面 (mode:hand = 最初の画面) で数えていて訪問数と同じになっていた (2026-10-08)
    out.push(`使い方は、手で打った人が ${use("hand:use")}、シミュレーションを開いた人が ${use("mode:sim")}。そのうち実際に回したのが ${use("sim:run")}、完成まで出たのが ${use("sim:done")}、取引所を開いたのが ${use("trade:open")}、レシピを保存したのが ${use("recipe:save")} です。`);
    const f = funnelDrop(sum, FUNNEL_SIM);
    out.push(f ? `シミュレーションの流れで一番減ったのは「${f.from} → ${f.to}」(${f.before} 人 → ${f.after} 人、-${f.pct}%) です。ここでつまずく人が多いので見直す価値があります。` : "シミュレーションの流れで目立って減る所はありません。");
    const err = sum.byEvent.get("error");
    out.push(`${err ? `画面の JS エラーが ${err.count} 件 (${err.sessions} 人)${sum.errors.length ? `、多いのは「${sum.errors[0]![0].slice(0, 60)}」` : ""}。` : "画面の JS エラーはありません。"}サーバーは ${n(usage.liveRequests)} 回動いてエラー ${n(usage.liveErrors)}。${fb}`);
    if (sum.warnings.length) out.push(`集計で取れなかった所があります: ${sum.warnings.join(" / ")}`);
  }
  if (!sum || !sum.sessions) out.push(fb);
  out.push(live ? `配信の見張りは${live.errors.length ? `気になる所が ${live.errors.length} つ (${live.errors[0]!.slice(0, 80)})` : "異常なし"}、今は ${live.live.length} 人がライブ中です。` : "配信の見張りはまだ動いていません。");
  out.push(alerts.length ? `異常の通知が ${alerts.length} 回ありました: ${alerts.slice(0, 5).join(" / ")}。` : "異常の通知はありませんでした。");
  if (sum?.wau != null && sum.wau) out.push(`この 7 日で来た人は ${n(sum.wau)} 人です。`);
  return out.join("\n");
}

/** 段階で一番減った所 (前の段が 5 人以上で 3 割以上減った時だけ) */
function funnelDrop(sum: Summary, steps: readonly string[]): { from: string; to: string; before: number; after: number; pct: number } | null {
  const c = steps.map((s) => sum.byEvent.get(s)?.sessions ?? 0);
  let best: { from: string; to: string; before: number; after: number; pct: number } | null = null;
  for (let i = 1; i < c.length; i++) {
    const prev = c[i - 1]!, cur = c[i]!;
    if (prev < 5) continue;
    const drop = 1 - cur / prev;
    if (drop >= 0.3 && (!best || drop > best.pct / 100)) best = { from: STEP_JA[steps[i - 1]!] ?? steps[i - 1]!, to: STEP_JA[steps[i]!] ?? steps[i]!, before: prev, after: cur, pct: Math.round(drop * 100) };
  }
  return best;
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
  const base = reportText(label, sum, usage, { requests: day.filter((x) => x.kind === "request").length, bugs: day.filter((x) => x.kind === "bug").length }, live, alerts);
  // 分析用の記録 (D1) の昨日の件数
  const logDay = new Date(new Date(since).getTime() + 9 * 3600e3).toISOString().slice(0, 10);
  const lc = await dayCount(env, logDay).catch(() => null);
  const text = lc ? `${base}\n分析用の記録: ${lc.records.toLocaleString()} 件 (${lc.batches.toLocaleString()} まとまり)` : base;
  await postDiscord(env.DISCORD_WEBHOOK, text, fetchFn);
  return text;
}

export { STEP_JA };
