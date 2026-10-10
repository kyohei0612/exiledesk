/**
 * 見張り (2026-10-07 オーナー「色々監視できる？報告もディスコに来たりできる？サーバーログは細かく見たい」「毎朝 9 時に報告」)。
 *   - alert():       異常をすぐ Discord に (同じ物は 6 時間に 1 回まで。KV に印、日報用に 2 日残す)
 *   - dailyReport(): 毎朝 9 時 (JST) の日報 = 昨日の 人・どこから・端末・使い方・段階と離脱・品質・要望・配信・異常・週
 *   - reqLog():      1 回ごとの記録 (ダッシュボードの「ログ」で見る。path・status・ms・国)
 * 訪問数などは Analytics Engine (events.ts) と Cloudflare の GraphQL (Web Analytics / Workers)。CF_ANALYTICS_TOKEN (Account Analytics: Read) が要る
 */
import { FUNNEL_SIM, STEP_JA, summarize, type Summary } from "./events";
import { listFeedback } from "./feedback";
import { countBetween } from "./logs";
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
  // 日報は 9:00 (JST) が境 (2026-10-10 オーナー「9:00 報告なら 9:00 を境に。今朝の報告は昨日の 9:01 から今朝の 8:59 まで」)。
  // 9:00 JST = 0:00 UTC。前は「昨日 0〜24 時」で、夜中〜朝の分が 1 日遅れて載っていた
  const nine = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const since = new Date(today ? nine : nine - 86400e3), until = today ? now : new Date(nine), weekSince = new Date(until.getTime() - 7 * 86400e3);
  return { since: since.toISOString(), until: until.toISOString(), weekSince: weekSince.toISOString(), label: today ? "今日のここまで" : "この 24 時間" };
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

/**
 * 日報の文面 (文章で。2026-10-07 オーナー「数字の羅列は分かりづらい、文章で教えて」)。
 * 人が 0 の日は短く、来た日は 何人・どこから・端末・何をしたか・どこで減ったか・品質・要望・配信・異常・週 を段落で
 */
/** 使われ方に出す印の名前 (人数が 1 以上の物を全部、この順で。開いた・滞在・エラー・最初の画面は出さない) */
const USE_JA: Array<[string, string]> = [
  ["hand:use", "手で打った"], ["mode:sim", "シミュレーションを開いた"], ["sim:base", "シミュレーション: ベースを選んだ"], ["sim:targets", "シミュレーション: 狙いを決めた"],
  ["sim:order", "シミュレーション: 順番を決めた"], ["sim:pattern", "シミュレーション: 手順を組んだ"], ["sim:run", "シミュレーションを回した"], ["sim:done", "シミュレーションで完成まで出た"],
  ["trade:open", "取引所を開いた"], ["recipe:save", "レシピを保存した"], ["feedback:open", "要望・バグの窓を開いた"], ["feedback:sent", "要望・バグを送った"],
];
/** 来た道の名前 (t.co は X) */
const fromJa = (k: string): string => (k === "direct" ? "URL から直接開いた人" : k === "t.co" || /(^|\.)(x|twitter)\.com$/.test(k) ? "X から来た人" : `${k.replace(/^www\./, "")} から来た人`);

export function reportText(label: string, sum: Summary | null, usage: Usage, feedback: { requests: number; bugs: number }, live: LiveState | null, alerts: string[], records?: number | null): string {
  // 2026-10-10 オーナーの書いた形: 見出しごとの短い箇条書き。人は訪問と使った時間だけ、使われ方は 1 以上の物を全部、要望とバグはまとめて
  const out: string[] = [`📊 **ExileDesk 日報 ${label}**`];
  const sec = (title: string, lines: Array<string | null | false>): void => {
    const ls = lines.filter((x): x is string => !!x);
    if (ls.length) out.push("", `**${title}**`, ...ls.map((x) => `・${x}`));
  };
  const today = label.includes("今日");
  if (!sum) {
    sec("人", [`訪問の集計は取れませんでした (${usage.why ?? "集計の設定が無い"})`]);
  } else if (!sum.sessions) {
    sec("人", [today ? "今日はまだ誰も来ていません" : "誰も来ていません"]);
  } else {
    sec("人", [
      `訪問 ${n(sum.sessions)} 回`,
      sum.medianMinutes == null ? null : sum.medianMinutes < 1 ? "半分の人は 1 分未満で閉じた" : `半分の人が ${sum.medianMinutes.toFixed(0)} 分以上使った`,
    ]);
    const devMobile = sum.devices.find(([k]) => k === "mobile")?.[1] ?? 0;
    const devAll = sum.devices.reduce((a, [, v]) => a + v, 0) || 1;
    const jp = sum.countries.find(([k]) => k === "JP")?.[1] ?? 0;
    // localhost は開発の確認 (自分) なので出さない (2026-10-08 オーナー「ガチで 13 人来たの？」)
    const refs = sum.refs.filter(([k]) => !/^localhost|127\.0\.0\.1/.test(k)).sort((a, b) => (a[0] === "direct" ? -1 : b[0] === "direct" ? 1 : 0));
    sec("どこから", [
      // 1 行ずつ (2026-10-10 オーナー「訪問リストは改行してリストで表示」)
      ...refs.slice(0, 6).map(([k, v]) => `${fromJa(k)} ${v} 人`),
      `PC ${Math.round(((devAll - devMobile) / devAll) * 100)}% / スマホ ${Math.round((devMobile / devAll) * 100)}%${sum.countries.length ? ` · ${jp / devAll >= 0.9 ? "ほぼ日本" : sum.countries.slice(0, 3).map(([k, v]) => `${k} ${v}`).join("、")}` : ""}`,
    ]);
    const used = USE_JA.map(([k, ja]) => [ja, sum.byEvent.get(k)?.sessions ?? 0] as const).filter(([, v]) => v > 0);
    sec("使われ方 (人数)", used.length ? used.map(([ja, v]) => `${ja} ${v}`) : ["開いただけで、何も使われていません"]);
  }
  // 要望とバグは仕分けしていないのでまとめて (オーナー 2026-10-10)
  sec("届いた物", [`要望・バグ報告 ${feedback.requests + feedback.bugs}`]);
  const err = sum?.byEvent.get("error");
  // 中身の見えないエラー (外のスクリプト) は分けて、直す対象から外す (2026-10-10)
  const ext = sum?.extErrors ?? null;
  const own = err && err.count - (ext?.count ?? 0) > 0 ? { count: err.count - (ext?.count ?? 0), sessions: Math.max(1, err.sessions - (ext?.sessions ?? 0)) } : null;
  sec("問題", [
    own ? `画面のエラー ${own.count} 件 (${own.sessions} 人)${sum!.errors.length ? `: ${sum!.errors[0]![0].slice(0, 60)}` : ""}` : sum ? "画面のエラー なし" : null,
    ext ? `外のスクリプトのエラー ${ext.count} 件 (${ext.sessions} 人): X などのアプリ内ブラウザやウォレットが足した物で、ExileDesk の不具合ではない` : null,
    `サーバー: ${n(usage.liveRequests)} 回・エラー ${n(usage.liveErrors)}`,
    alerts.length ? `異常の通知 ${alerts.length} 回: ${alerts.slice(0, 5).join(" / ")}` : "異常の通知 なし",
    live ? `配信の見張り ${live.errors.length ? `気になる所 ${live.errors.length} (${live.errors[0]!.slice(0, 80)})` : "異常なし"} · ライブ中 ${live.live.length} 人` : "配信の見張り まだ動いていない",
    sum?.warnings.length ? `集計で取れなかった所: ${sum.warnings.join(" / ")}` : null,
    records != null ? `分析用の記録 ${records.toLocaleString("ja-JP")} 件` : null,
  ]);
  // 結果を踏まえたアドバイス (2026-10-10 オーナー「最後に結果踏まえたアドバイス」)。数字の決まりで出し分け、多くて 3 つ
  sec("アドバイス", adviceOf(sum, feedback, alerts));
  return out.join("\n");
}

/** 日報の最後のアドバイス (大事な順に 3 つまで。当てはまる物が無ければ「様子見で OK」) */
export function adviceOf(sum: Summary | null, feedback: { requests: number; bugs: number }, alerts: string[]): string[] {
  const out: string[] = [];
  const err = sum?.byEvent.get("error");
  // 中身の見えないエラー (外のスクリプト) は分けて、直す対象から外す (2026-10-10)
  const ext = sum?.extErrors ?? null;
  const own = err && err.count - (ext?.count ?? 0) > 0 ? { count: err.count - (ext?.count ?? 0), sessions: Math.max(1, err.sessions - (ext?.sessions ?? 0)) } : null;
  if (own) out.push(`画面のエラーが出ています。${sum!.errors.length ? `多い「${sum!.errors[0]![0].slice(0, 40)}」から` : "多い物から"}直すと良さそうです`);
  const fb = feedback.requests + feedback.bugs;
  if (fb) out.push(`要望・バグ報告が ${fb} 件あります。中身を見て、バグは再現できるか、要望はすぐできる物から`);
  if (alerts.length) out.push("異常の通知が出ています。サーバーや相場の取得が止まっていないか確認を");
  if (sum && sum.sessions >= 5) {
    if (sum.bounce != null && sum.bounce >= 0.5) out.push("半分以上が何もせずに閉じています。最初の画面で何をすればいいか分かりにくい可能性。最初の 1 手を目立たせると良さそうです");
    const hand = sum.byEvent.get("hand:use")?.sessions ?? 0;
    if (hand / sum.sessions < 0.3) out.push(`開いても実際に打った人が ${Math.round((hand / sum.sessions) * 100)}% だけです。「まずこれを押す」の案内を足すと良さそうです`);
    const f = (sum.byEvent.get("mode:sim")?.sessions ?? 0) > 0 ? funnelDrop(sum, FUNNEL_SIM.filter((x) => x !== "open")) : null;
    if (f && f.pct >= 50) out.push(`シミュレーションの「${f.from} → ${f.to}」で半分以上がやめています。この段を見直す価値があります`);
    const mobile = sum.devices.find(([k]) => k === "mobile")?.[1] ?? 0;
    const all = sum.devices.reduce((a, [, v]) => a + v, 0) || 1;
    if (mobile / all >= 0.4) out.push(`スマホが ${Math.round((mobile / all) * 100)}% あります。スマホの使い心地を優先すると効きそうです`);
    if (sum.sessions >= 10 && (sum.sessions - sum.newSessions) / sum.sessions < 0.2) out.push("また来た人が 2 割未満です。保存・お気に入りなど、もう一度来るきっかけを作ると良さそうです");
  }
  return out.length ? out.slice(0, 3) : ["大きな問題は見当たりません。このまま様子見で OK です"];
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
  const y = yesterdayJst(now, today);
  const { until, label } = y;
  // 数え始め (STATS_SINCE) より前は数えない (消せない Analytics Engine / Web Analytics にも線を引く)。日付が全部前なら 0 件
  const floor = env.STATS_SINCE ?? "";
  const since = y.since < floor ? (floor < until ? floor : until) : y.since;
  // 数え始めで途中から数えた時はそう書く (2026-10-10: 3 時間分だけなのに 1 日分に見えた)
  const cut = since > y.since ? (() => { const j = new Date(new Date(since).getTime() + 9 * 3600e3); return ` (${j.getUTCMonth() + 1}/${j.getUTCDate()} ${j.getUTCHours()}:${String(j.getUTCMinutes()).padStart(2, "0")} から数えています)`; })() : "";
  const weekSince = y.weekSince < floor ? (floor < until ? floor : until) : y.weekSince;
  const [sum, usage, fb, alerts] = await Promise.all([
    env.CF_ANALYTICS_TOKEN ? summarize(env, since, until, weekSince, fetchFn).catch((e) => { console.warn("summarize failed", String(e)); return null; }) : Promise.resolve(null),
    fetchUsage(env, since, until, fetchFn),
    listFeedback(env.LIVE, 200),
    alertsBetween(env, since, until),
  ]);
  const day = fb.filter((x) => x.at >= since && x.at < until);
  const live = (await env.LIVE.get("state", "json")) as LiveState | null;
  const lc = await countBetween(env, since, until).catch(() => null);
  const base = reportText(label + cut, sum, usage, { requests: day.filter((x) => x.kind === "request").length, bugs: day.filter((x) => x.kind === "bug").length }, live, alerts, lc?.records ?? null);
  const text = base;
  await postDiscord(env.DISCORD_WEBHOOK, text, fetchFn);
  return text;
}

export { STEP_JA };
