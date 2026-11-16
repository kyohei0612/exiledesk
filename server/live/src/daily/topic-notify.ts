/**
 * お題が決まったら #日報・報告 に 1 通 (設計図 D-85b、オーナー 11-16「お題決め完了時にディスコに欲しい感じだね」)。
 * 行き先は #日報・報告 と同じ REPORT_WEBHOOK (無ければ DISCORD_WEBHOOK)。流したお題は KV に中身の指紋を残し、同じなら流さない・違えば「直した」で 1 通。
 * 文は「本日のクラフトお題」の 1 行とお題の id だけで、品・狙いの MOD はクラフト箱 (D-20c) と同じ形の絵で付ける (オーナー 11-16「これもクラフト箱みたいに画像で欲しいな」「本日のクラフトお題で画像だけでいい」)。
 * 絵の元はお題の写し (type_snap の card、16:00 の台本が作る) → 無ければ箱の投稿の絵の元。絵が無い・取れない時だけ字の形 (topicContent) で流す。
 * 呼ぶ所: POST /daily/topic の後・鍵なしの POST /daily/topic-ping (15:00 の台本が --d1 で書いた後に叩く)・GET /daily.json を作り直した時 (流しそびれの拾い)。
 * 失敗しても投げない (お題の書き込みは止めない、D-20b と同じ)
 */
import type { Fetch } from "../types";
import { cardPng, CARD_ORIGIN, type BoxCard } from "./box-notify";
import { qualityOfSnap } from "../../../../src/views/daily/daily-quality";
import { dayNoOf, dayNoOfName, idOf } from "./time";

/** この日より前のお題は流さない (出した時にもう出ているお題を後から流さない) */
export const NOTIFY_FROM = "2026-11-17";
const MARK = "dailyTopicSent:";
const MARK_TTL = 30 * 86400;
export const DAILY_ORIGIN = "https://exiledesk.com";

export type TopicNote = {
  id: string; day: string; base: string; baseJa: string | null; ilvl: number; aims: unknown[]; shownBy: string;
  boxId: string | null; boxNick: string | null; quality: { tag: string; value: number } | null;
  /** 絵の元 (D-20c と同じ形)。無ければ字だけ */
  card: BoxCard | null;
};

const s = (v: unknown, max: number): string => (typeof v === "string" ? v : "").slice(0, max);
const WD = ["日", "月", "火", "水", "木", "金", "土"];

/** 中身の指紋 (品・アイテムレベル・狙い・箱・品質)。直す口で組み直したかを見分ける */
export function fingerprint(t: TopicNote): string {
  const raw = JSON.stringify([t.base, t.ilvl, t.aims, t.boxId, t.quality]);
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) h = Math.imul(h ^ raw.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** どこから来たお題か */
function sourceOf(t: TopicNote): string {
  if (t.boxId) return `📦 クラフト箱 (👤 ${t.boxNick ? t.boxNick.slice(0, 40) : "名前なし"})`;
  if (t.shownBy === "repeat") return "前の日のお題をもう 1 日 (今日の予定が確かめを通っていない)";
  if (t.shownBy === "plan") return "週の予定 (15:00 の台本が回らなかった日)";
  return "自動 (今週の型)";
}

/** Discord に出す文 (2000 字まで) */
export function topicContent(t: TopicNote, fixed: boolean, origin: string = DAILY_ORIGIN): string {
  const d = new Date(`${t.day}T00:00:00Z`);
  const when = `${d.getUTCMonth() + 1}/${d.getUTCDate()} (${WD[d.getUTCDay()]}) 16:00 JST から`;
  const ja = s(t.baseJa, 60) || s(t.base, 60) || "?", en = s(t.base, 60);
  const aims = t.aims.slice(0, 12).map((a) => {
    const x = (a ?? {}) as Record<string, unknown>;
    const name = s(x.ja, 120) || s(x.en, 120) || s(x.modId, 80) || "?";
    return `- ${name}${Number.isFinite(Number(x.tier)) ? ` (T${Number(x.tier)})` : ""}`;
  });
  const q = t.quality ? ` · 品質 ${t.quality.value}% (${s(t.quality.tag, 30)})` : "";
  return [
    `**${fixed ? "🔁 お題を直した" : "🎯 今日のお題"}** · ${when}`,
    `**${ja}**${en && en !== ja ? ` (${en})` : ""} · アイテムレベル ${Number.isFinite(t.ilvl) ? t.ilvl : "?"}${q}`,
    `狙いの MOD ${t.aims.length} 個`,
    ...aims,
    `どこから: ${sourceOf(t)}`,
    `▶ ${origin}/?page=daily&q=${t.id}`,
  ].join("\n").slice(0, 1900) + `\n-# お題の id ${t.id}`;
}

/** 絵を付ける時の文: 「本日のクラフトお題」の 1 行とお題の id */
export const picContent = (t: TopicNote, fixed: boolean): string => `**本日のクラフトお題**${fixed ? " (直した)" : ""}
-# お題の id ${t.id}`;

/** 1 通流す。png があれば付ける (feedback-images.ts・box-notify.ts と同じ files[0])。流せたら true (webhook が無い・失敗は false、投げない) */
export async function postTopic(webhook: string | undefined, content: string, fetchFn: Fetch = fetch, png: ArrayBuffer | null = null, name = "topic.png"): Promise<boolean> {
  const hook = (webhook ?? "").trim();
  if (!hook) return false;
  try {
    const form = new FormData();
    form.append("payload_json", JSON.stringify({ content, allowed_mentions: { parse: [] } }));
    if (png) form.append("files[0]", new Blob([png], { type: "image/png" }), name);
    const r = await fetchFn(hook, { method: "POST", body: form });
    return r.ok;
  } catch { return false; }
}

/** 絵の元を読む: お題の写しの card → 箱の投稿の card (見出しは本日のクラフトお題に)。形が合わなければ null */
function cardOf(snap: string | null | undefined, boxItem: string | null): BoxCard | null {
  for (const raw of [snap, boxItem]) {
    try {
      const c = (JSON.parse(raw ?? "null") as { card?: BoxCard } | null)?.card;
      if (c && typeof c.n === "string" && Array.isArray(c.r) && c.r.length) return { n: c.n, a: c.a ?? null, h: Array.isArray(c.h) ? c.h : [], r: c.r, l: c.l === "en" ? "en" : "ja", k: "topic" };
    } catch { /* 読めない物は次へ */ }
  }
  return null;
}

type Row = { id: string; day: string; base: string; base_ja: string | null; ilvl: number | null; aims: string; shown_by: string; box_id: string | null; type_snap?: string | null; nick: string | null; box_item: string | null };

/** 今の日と次の日のお題 (D1) */
async function topicsNear(db: D1Database, now: number): Promise<TopicNote[]> {
  const no = dayNoOf(now);
  const { results } = await db
    .prepare("SELECT t.id, t.day, t.base, t.base_ja, t.ilvl, t.aims, t.shown_by, t.box_id, t.type_snap, n.name AS nick, b.item AS box_item FROM daily_topics t LEFT JOIN daily_box b ON b.id = t.box_id LEFT JOIN daily_nicks n ON n.id = b.nick_id WHERE t.id IN (?, ?)")
    .bind(idOf(no), idOf(no + 1))
    .all<Row>();
  const out: TopicNote[] = [];
  for (const r of results) {
    let aims: unknown[] = [];
    try { const a = JSON.parse(r.aims); if (Array.isArray(a)) aims = a; } catch { /* 読めない狙いは 0 個で出す */ }
    out.push({ id: r.id, day: r.day, base: r.base, baseJa: r.base_ja, ilvl: r.ilvl ?? 82, aims, shownBy: r.shown_by, boxId: r.box_id, boxNick: r.nick, quality: qualityOfSnap(r.type_snap), card: cardOf(r.type_snap, r.box_item) });
  }
  return out.sort((a, b) => dayNoOfName(a.day) - dayNoOfName(b.day));
}

/** DAILY_NOTIFY_FROM = 日の門を替える (手元の wrangler dev の確かめだけ。本番には置かない) */
type NotifyEnv = { LOGS?: D1Database; LIVE: KVNamespace; REPORT_WEBHOOK?: string; DISCORD_WEBHOOK?: string; DAILY_NOTIFY_FROM?: string; /** 絵を作る配信のサーバー (手元の試しだけ替える、box-notify と同じ) */ BOX_CARD_ORIGIN?: string };

/** 流していないお題・中身の変わったお題を流す。流したお題の id を返す */
export async function notifyTopics(env: NotifyEnv, now: number, fetchFn: Fetch = fetch, origin: string = DAILY_ORIGIN): Promise<string[]> {
  const hook = env.REPORT_WEBHOOK || env.DISCORD_WEBHOOK;
  if (!env.LOGS || !hook) return [];
  const sent: string[] = [];
  for (const t of await topicsNear(env.LOGS, now)) {
    if (t.day < (env.DAILY_NOTIFY_FROM || NOTIFY_FROM)) continue;
    const fp = fingerprint(t), had = await env.LIVE.get(MARK + t.id);
    if (had === fp) continue;
    // 先に印を置く (見回りと台本の口が重なっても 2 通になりにくい)。流せなければ前の印に戻して次の見回りでもう 1 回
    await env.LIVE.put(MARK + t.id, fp, { expirationTtl: MARK_TTL });
    const fixed = had !== null, png = t.card ? await cardPng(t.card, env.BOX_CARD_ORIGIN || CARD_ORIGIN, fetchFn) : null;
    const ok = png ? await postTopic(hook, picContent(t, fixed), fetchFn, png, `topic-${t.id}.png`) : await postTopic(hook, topicContent(t, fixed, origin), fetchFn);
    if (ok) sent.push(t.id);
    else if (had !== null) await env.LIVE.put(MARK + t.id, had, { expirationTtl: MARK_TTL });
    else await env.LIVE.delete(MARK + t.id);
  }
  return sent;
}

