/**
 * _daily-roll-entry.ts — daily-roll.mjs が束ねる入口 (2026-11-05、設計図 D-59)。16:00 の切り替えで組む物を、画面と同じエンジン・同じ関数で組む
 * (型 → 予定は daily-gen.ts、投稿の確かめは daily-check.ts の boxCheck、称号は daily-titles.ts。写さない)。
 * roll() は純粋な関数: GET /daily/roll.json の中身を受け、POST /daily/topic に送る物を返す。読み書きは daily-roll.mjs
 */
import type { PatchData } from "../src/services/craft-stage/engine";
import { freshItem } from "../src/services/craft-stage/engine";
import { modListFor } from "../src/services/craft-stage/mod-list";
import { parseItemText } from "../src/services/simulator/paste/item-text";
import { htcBaseInfo } from "../src/services/htc/patch";
import { jaTypeName } from "../src/i18n/item-names-ja";
import { classOfBase, devSamples, floorAims, nextFullSample, planWeek, slotOfClass, topicOfPlan, TOPIC_ILVL, type DailySample, type GenAim } from "../src/views/daily/daily-gen";
import { boxCheck, fullMods } from "../src/views/daily/daily-check";
import { awardsOf, type Award, type DayResult } from "../src/views/daily/daily-titles";
import { runCost, topicPrice } from "../src/views/daily/daily-cost";
export { loadPatchSync } from "./_htc-bridge-entry";

const DAY = 86400e3, JST = 9 * 3600e3, H16 = 16 * 3600e3;
/** 順位に載る完成率の下限 (%、D-02)。11-09 から 1 人でも完成すれば載る (100 人回しなので 1%、前は 90) */
const SOLVE_RATE = 1;
/** D-05 の部位の表・D-04 の段の決まりの版 (変えたら上げる)。11-10 に D-04 を全部 T3 以上に、予定の確かめの印 (D-80f) もこの版 */
export const RULES_VER = "D04T3-D05-2026-11-10";

const noOf = (day: string): number => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY);
const nameOf = (no: number): string => new Date(no * DAY).toISOString().slice(0, 10);
const weekdayOf = (no: number): number => (new Date(no * DAY).getUTCDay() + 6) % 7;
const startAt = (no: number): number => no * DAY + H16 - JST;
/** その日の挑戦が全部終わる時刻 = 次の日の 16:00 の 9 分 30 秒前 (14:50 のスタート + 1 時間 + 30 秒) */
const allDoneAt = (no: number): number => startAt(no + 1) - 9.5 * 60e3;

type FetchItem = { slot: string; base: string; ilvl: number | null; quality: number | null; quality_kind: string | null; mods: string; fractured: string | null; desecrated: string | null; corrupted: number; sanctified?: number | null; who: string };
type TopicRow = { id: string; day: string; slot: number; item_class: string | null; base: string; box_id: string | null; sample_id: string | null; seed?: number; prices?: string | null; ilvl?: number; aims?: string };
type BoxRow = { id: string; created: number; note: string; item: string; status: string; nick: string | null };
type TryRow = { nick_id: string; name: string; started_at: number; submitted_at: number | null; cost: number | null; rate: number | null; recipe: string | null; checked: number | null };
type ResultRow = { day: string; nick_id: string; place: number | null; cost: number; rate: number; used_ms: number; solved_n: number; entered_n: number; slot: number; base: string };
type AwardRow = { nick_id: string; title_id: string; title_ver: number; first_day: string; ja: string; en: string; rank: number; retired: number };
/** checked = 台本の確かめの印 (D-80f)。表に列がある D1 の行だけがこの鍵を持つ (無い D1 では鍵ごと無い) */
type PlanRow = { day: string; base: string; slot: number; sample_id: string | null; ilvl: number | null; aims: string | null; checked?: string | null };
export type RollInput = {
  now: number; target: string; week: string; closing: string; closed: boolean;
  job: { state: string } | null; items: FetchItem[]; samples: Array<{ id: string; base: string; mods: string; n: number }>; prevSamples: Array<{ id: string; base: string; mods: string; n: number }>;
  plan: PlanRow[]; topics: TopicRow[]; box: BoxRow[]; tries: TryRow[]; results: ResultRow[]; awards: AwardRow[];
};

// --- 型 (D-80c): 取った品の英語の文 → エンジンの行の名前と段 ---

/** poe.ninja の文の印 `[EnergyShield|Energy Shield]` → `Energy Shield` */
const plain = (s: string): string => s.replace(/\[([^\]|]*)\|([^\]]*)\]/g, "$2").replace(/\[([^\]]*)\]/g, "$1");

/** 1 品を DailySample の mods に。読めない行が 1 つでもあれば null (1 人分をそのまま使うので欠けた並びは作らない、D-06) */
export function sampleModsOf(data: PatchData, it: FetchItem): Array<{ name: string; tier: number }> | null {
  const lines = [
    ...(JSON.parse(it.mods) as string[]).map(plain),
    ...(it.fractured ? (JSON.parse(it.fractured) as string[]).map((s) => `${plain(s)} (fractured)`) : []),
    ...(it.desecrated ? (JSON.parse(it.desecrated) as string[]).map((s) => `${plain(s)} (desecrated)`) : []),
  ];
  if (!lines.length) return null;
  const q = it.quality && it.quality_kind ? [`${plain(it.quality_kind)}: +${it.quality}% (augmented)`, "--------"] : [];
  // 取った mods は明示だけ。印の無い文だと読みはベースの暗黙と同じ文の行 (サファイアの指輪の冷気耐性など) とその前を暗黙側に寄せるので、
  // ベースの暗黙を (implicit) 付きで先に置き、印のある形として読ませる (11-05、取得の 3 件が MOD 0 で落ちていた)
  const imp = (htcBaseInfo()[it.base]?.implicits ?? []).flatMap((im) => im.en.split("\n").map((l) => `${l} (implicit)`)); // 不在のアミュレットは 2 行で 1 つ
  const text = ["Item Class: Unknown", "Rarity: Rare", "Daily Sample", it.base, "--------", ...q, `Item Level: ${it.ilvl ?? TOPIC_ILVL}`, "--------", ...(imp.length ? [...imp, "--------"] : []), ...lines, ...(it.corrupted ? ["--------", "Corrupted"] : []), ...(it.sanctified ? ["--------", "Sanctified"] : [])].join("\n"); // 聖別の印で読みが値を ×0.78〜1.22 の幅で段に当てる (S-08f・D-80d)
  let r;
  try {
    r = parseItemText(data, text);
  } catch {
    return null;
  }
  if (!r.base || r.base.en !== it.base || r.skipped.some((s) => s.code !== "pseudoTotal" && s.code !== "hybridPart")) return null;
  let rows;
  try {
    rows = modListFor(data, freshItem(data, it.base, it.ilvl ?? TOPIC_ILVL));
  } catch {
    return null;
  }
  const out: Array<{ name: string; tier: number }> = [];
  for (const m of r.mods) {
    if (!m.modId || !m.tier) return null;
    const row = rows.find((x) => x.id === m.modId || x.tiers.some((t) => t.modId === m.modId));
    if (!row) return null;
    out.push({ name: row.id.slice(row.id.indexOf("/") + 1), tier: Number(m.tier.label.slice(1)) || 1 });
  }
  return out.length ? out : null;
}

const hashOf = (s: string): string => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36);
};

/** 取り直し (D-80f、daily-fetch-home.mjs --more) の品 → 週の型の行 (rollPost の week と同じ形 = 部位の札つき)。予定は組み直さない (毎日の台本の toFull が拾う) */
export function sampleRowsOf(data: PatchData, items: FetchItem[]): Array<DailySample & { itemClass: string | null }> {
  return samplesOf(data, items).samples.map((s) => ({ ...s, itemClass: classOfBase(s.base) }));
}

/** 週の取得の品 → 型 (同じベース・同じ並びは n で数える、同じアカウントは 1 人に) */
export function samplesOf(data: PatchData, items: FetchItem[]): { samples: DailySample[]; read: number; skipped: number } {
  const by = new Map<string, { s: DailySample; who: Set<string> }>();
  let read = 0, skipped = 0;
  for (const it of items) {
    const mods = sampleModsOf(data, it);
    if (!mods) { skipped++; continue; }
    read++;
    const key = `${it.base}|${mods.map((m) => `${m.name}:${m.tier}`).join(",")}`;
    const e = by.get(key) ?? { s: { id: `s-${hashOf(key)}`, base: it.base, mods, n: 0 }, who: new Set<string>() };
    e.who.add(it.who);
    e.s.n = e.who.size;
    by.set(key, e);
  }
  return { samples: [...by.values()].map((e) => e.s), read, skipped };
}

// --- 締め (D-59 ①・D-50・D-100・D-101) ---

/** 検算 (D-58)。1 = 合った、-1 = 合わない (順位から外す)、null = 見ない */
export type Verify = (t: TryRow) => number | null;
/** 検算するのは順位の上位だけ (D-58) */
const VERIFY_TOP = 10;

/**
 * お題の種と 16:00 の相場の写し (daily_topics.prices = /boot.json の market と同じ JSON) で、提出の木を daily-cost.ts の runCost で回し直す。
 * 費用 (0.1 神) と完成率が提出と同じなら 1。木が読めない・ベースやフラクチャーが違う時も -1。
 * 値段の引き方は挑戦の画面と同じ topicPrice (daily-cost.ts)。11-10 から画面もお題の種・値段で回す。予定のタスクの締めに --verify を付けるのは、その形が本番に出た後に始まった日から
 */
export function makeVerify(data: PatchData, topic: { base: string; ilvl: number; aims: GenAim[]; seed: number; prices: string | null }): Verify {
  const price = topicPrice(data, topic);
  if (!price) return () => null;
  return (t) => {
    if (!t.recipe || t.cost == null) return -1;
    let r: { cost: number; rate: number } | null = null;
    try {
      r = runCost(data, topic, t.recipe, price);
    } catch {
      r = null;
    }
    return r && Math.abs(r.cost - t.cost) < 0.05 && r.rate === Math.round(t.rate ?? -1) ? 1 : -1;
  };
}

function closeDay(inp: RollInput, verify: Verify): Record<string, unknown> | null {
  if (inp.closed || inp.now < allDoneAt(noOf(inp.closing))) return null;
  const topic = inp.topics.find((t) => t.day === inp.closing);
  if (!topic) return null;
  // 上位 VERIFY_TOP 人 (解決・安い順) だけ回し直す。外れた人が出たら次の人を繰り上げて見る
  const order = inp.tries.map((t, i) => ({ t, i })).filter(({ t }) => t.cost != null && (t.rate ?? 0) >= SOLVE_RATE).sort((a, b) => a.t.cost! - b.t.cost! || (a.t.submitted_at ?? 0) - (b.t.submitted_at ?? 0));
  const checked = inp.tries.map((t) => ({ nickId: t.nick_id, checked: t.checked }));
  let passed = 0;
  for (const { t, i } of order) {
    if (passed >= VERIFY_TOP) break;
    if (checked[i]!.checked == null) checked[i]!.checked = verify(t);
    if ((checked[i]!.checked ?? 1) >= 0) passed++;
  }
  const ok = (i: number) => (checked[i]!.checked ?? 0) >= 0;
  const solved = inp.tries.map((t, i) => ({ t, i })).filter(({ t, i }) => t.cost != null && (t.rate ?? 0) >= SOLVE_RATE && ok(i)).sort((a, b) => a.t.cost! - b.t.cost! || (a.t.submitted_at ?? 0) - (b.t.submitted_at ?? 0));
  const place = new Map(solved.map(({ t }, k) => [t.nick_id, k + 1]));
  const results = inp.tries.map((t, i) => ({
    nickId: t.nick_id, place: place.get(t.nick_id) ?? null, cost: t.cost, rate: t.rate, usedMs: t.submitted_at ? t.submitted_at - t.started_at : null,
    solvedN: solved.length, enteredN: inp.tries.length, slot: topic.slot, itemClass: topic.item_class, base: topic.base, checked: checked[i]!.checked, engineVer: null, facts: { facts_v: 0 },
  }));
  // 称号は全部の日から計算し直す (D-101)。nick は nick_id で見る (名前は変わらないが記録は id で持つ、D-52)
  const all: DayResult[] = [
    ...inp.results.filter((r) => r.day !== inp.closing).map((r) => ({ day: r.day, nick: r.nick_id, place: r.place, cost: r.cost, rate: r.rate, ms: r.used_ms, solvedN: r.solved_n, enteredN: r.entered_n, slot: r.slot, base: r.base })),
    ...results.map((r) => ({ day: inp.closing, nick: r.nickId, place: r.place, cost: r.cost ?? 0, rate: r.rate ?? 0, ms: r.usedMs ?? 0, solvedN: r.solvedN, enteredN: r.enteredN, slot: r.slot, base: r.base })),
  ];
  const prior = new Map<string, Award[]>();
  for (const a of inp.awards) (prior.get(a.nick_id) ?? prior.set(a.nick_id, []).get(a.nick_id)!).push({ id: a.title_id, ja: a.ja, en: a.en, rank: a.rank, ver: a.title_ver, firstDay: a.first_day, ...(a.retired ? { retired: true as const } : {}) });
  const nicks = new Set([...all.map((r) => r.nick), ...prior.keys()]);
  const awards = [...nicks].flatMap((n) => awardsOf(n, all, prior.get(n) ?? []).map((a) => ({ nickId: n, id: a.id, ver: a.ver, firstDay: a.firstDay, count: null, retired: !!a.retired, ja: a.ja, en: a.en, rank: a.rank })));
  return { day: inp.closing, results, checked: checked.filter((c) => c.checked != null), awards };
}

// --- 全体 ---

export type RollOut = { body: Record<string, unknown>; log: string[] };

export function roll(data: PatchData, inp: RollInput, engineVer: string, verifyOn = false): RollOut {
  const log: string[] = [];
  const body: Record<string, unknown> = {};
  const no = noOf(inp.target), monday = no - weekdayOf(no);
  const historyBefore = (d: number) => inp.topics.filter((t) => noOf(t.day) < d).map((t) => ({ slot: t.slot, cls: t.item_class ?? classOfBase(t.base) ?? "", base: t.base }));

  // ① 週の予定 (D-06・D-80b ④): その週の予定がまだ無ければ、取れた型 (足りなければ + 前の週、1 つも無ければ手の辞書) から月〜日を組む
  let plan = inp.plan.map((p) => ({ day: p.day, base: p.base, aims: p.aims ? (JSON.parse(p.aims) as GenAim[]) : null, ilvl: p.ilvl ?? TOPIC_ILVL, slot: p.slot, sampleId: p.sample_id }));
  if (!plan.length) {
    const fresh = samplesOf(data, inp.items);
    const prev = inp.prevSamples.map((s) => ({ id: s.id, base: s.base, mods: JSON.parse(s.mods), n: s.n }) as DailySample);
    let samples = fresh.samples, dev = false;
    if (inp.job?.state !== "done") samples = [...samples, ...prev.filter((p) => !samples.some((s) => s.id === p.id))];
    if (!samples.length) { samples = devSamples(data); dev = true; }
    log.push(`型: 取得 ${inp.job?.state ?? "無し"}・品 ${inp.items.length} (読めた ${fresh.read}・外した ${fresh.skipped}) → 型 ${samples.length}${dev ? " (手の辞書の見本)" : inp.job?.state !== "done" ? ` (前の週 ${prev.length} を足した)` : ""}`);
    const days = Array.from({ length: 7 }, (_, i) => nameOf(monday + i));
    const pw = planWeek(data, days, samples, historyBefore(monday), dev);
    // 曜日の部位の型が 1 つも無い日は空のままにせず、その日だけ前の週 → 手の辞書の見本から部位を問わず引く (毎日 1 個出す D-01 が先)
    if (pw.some((p) => !p)) {
      const spare = [...prev, ...devSamples(data)].filter((p) => !samples.some((s) => s.id === p.id));
      const picked = pw.flatMap((p) => (p ? [{ slot: p.slot, cls: classOfBase(p.base) ?? "", base: p.base }] : []));
      const alt = planWeek(data, days, spare, [...historyBefore(monday), ...picked], true);
      pw.forEach((p, i) => {
        if (!p && alt[i]) {
          pw[i] = alt[i];
          samples = [...samples, ...spare.filter((s) => s.id === alt[i]!.sampleId && !samples.some((x) => x.id === s.id))];
        }
      });
      log.push(`型の無い曜日を前の週・見本で埋めた: ${pw.filter(Boolean).length}/7`);
    }
    const rows = pw.map((p) => {
      if (!p) return null;
      const g = topicOfPlan(data, p, samples);
      const base = g?.base ?? p.base; // planWeek はフル MOD の人だけ選ぶので、ふつうは予定のまま
      return { day: p.day, slot: p.slot, itemClass: classOfBase(base), base, baseJa: jaTypeName(base), sampleId: g?.sampleId ?? p.sampleId, ilvl: g?.ilvl ?? TOPIC_ILVL, aims: g?.aims ?? null };
    });
    body.week = { week: inp.week, samples: samples.map((s) => ({ ...s, itemClass: classOfBase(s.base) })), plan: rows.filter(Boolean) };
    log.push(`予定: ${rows.map((r, i) => `${"月火水木金土日"[i]} ${r ? r.base : "—"}`).join("・")}`);
    plan = rows.flatMap((r) => (r ? [{ day: r.day, base: r.base, aims: r.aims, ilvl: r.ilvl, slot: r.slot, sampleId: r.sampleId }] : []));
  }

  // ② 投稿の機械の確かめ (D-20): 段の下限を D-04 に上げてから、エンジンで作れるか・悪口
  const checkedBox = inp.box.map((b) => {
    if (b.status !== "wait") return { b, status: b.status, aims: (JSON.parse(b.item) as { aims: GenAim[] }).aims };
    const it = JSON.parse(b.item) as { base: string; ilvl: number; aims: GenAim[] };
    const aims = floorAims(data, it.base, it.ilvl, it.aims);
    const why = boxCheck(data, { base: it.base, ilvl: it.ilvl, aims, note: b.note ?? "" }, b.nick ?? "");
    return { b, status: why ? "no" : "ok", why, aims };
  });
  const newly = checkedBox.filter((x) => x.b.status === "wait");
  if (newly.length) {
    body.box = newly.map((x) => ({ id: x.b.id, status: x.status, why: x.why ?? null, aims: x.aims }));
    log.push(`投稿の確かめ: ${newly.length} 件 (通った ${newly.filter((x) => x.status === "ok").length})`);
  }

  // ③ 前の日を締める (D-59 ①)
  const ct = inp.topics.find((t) => t.day === inp.closing);
  const verify: Verify = verifyOn && ct?.aims ? makeVerify(data, { base: ct.base, ilvl: ct.ilvl ?? TOPIC_ILVL, aims: JSON.parse(ct.aims) as GenAim[], seed: ct.seed ?? 1, prices: ct.prices ?? null }) : () => null;
  const close = closeDay(inp, verify);
  if (close) {
    body.close = close;
    log.push(`締め ${inp.closing}: 挑戦 ${inp.tries.length}・解決 ${(close.results as Array<{ place: number | null }>).filter((r) => r.place).length}`);
  }

  // 予定の 1 人分がフル MOD に届かなければ、同じ部位の次の 1 人へ (D-82、オーナー 11-09「フルMODだけにして」。判定を足す前に組んだ週の予定もここで差し替わる)
  type PlanDay = (typeof plan)[number];
  const weekSamples = [...inp.samples, ...inp.prevSamples].map((x) => ({ id: x.id, base: x.base, mods: JSON.parse(x.mods), n: x.n }) as DailySample);
  const toFull = (day: PlanDay): PlanDay => {
    // 段は D-04 (全部 T3 以上、11-10)。前の決まりで組んだ予定の段もここで揃える (変わった時だけ新しい物 = planFix で書き戻す)
    if (day.aims && fullMods(data, day.base, day.aims)) {
      const fl = floorAims(data, day.base, day.ilvl ?? TOPIC_ILVL, day.aims);
      return fl.some((a, i) => a.modId !== day.aims![i]!.modId || a.tier !== day.aims![i]!.tier) ? { ...day, aims: fl } : day;
    }
    const seen = new Set(historyBefore(noOf(day.day)).map((h) => h.base));
    // 同じ部位 (今週と前の週の型 → 手の辞書の見本) → 部位を問わず (同じ順)。部位を問わず引いた時は出す部位の札も品に合わせる
    const n = nextFullSample(data, day.day, day.base, weekSamples, seen, day.sampleId) ?? nextFullSample(data, day.day, day.base, devSamples(data), seen, null)
      ?? nextFullSample(data, day.day, null, weekSamples, seen, day.sampleId) ?? nextFullSample(data, day.day, null, devSamples(data), seen, null);
    log.push(`予定 ${day.day} ${day.base} はフル MOD でない (${day.aims?.length ?? 0} 個) → ${n ? `${n.s.base} (${n.aims.length} 個)` : "フル MOD の人がどこにもいない、予定のまま"}`);
    if (!n) return day;
    const c = classOfBase(n.s.base);
    return { ...day, base: n.s.base, aims: n.aims, sampleId: n.s.id, ilvl: TOPIC_ILVL, slot: (c && slotOfClass(c)) ?? day.slot };
  };
  // 今週の残りの予定 (明日から) も直して Worker の予定を書き換える。台本が回らなかった日の控えもフル MOD になる (お題の出た日は Worker が触らない)
  // D-80f: 表に確かめの印の列があれば、明日から先の予定を全部確かめ、フル MOD (段は D-04) に届いた日に印 (決まりの版) を付けて書き戻す。
  // 届かない日 (どこにも候補が無い) は印を付けず needMore に出す = daily-roll.mjs が忍者から人数を増やして取り直し、もう一度組む。列の無い D1 は変わった日だけ (前のまま)
  const marking = inp.plan.some((p) => "checked" in p);
  const ahead = plan.filter((p) => noOf(p.day) > no && !inp.topics.some((t) => t.day === p.day)).map((p) => [p, toFull(p)] as const);
  const isFull = (p: PlanDay): boolean => !!p.aims && fullMods(data, p.base, p.aims);
  const marked = (d: string): string | null => inp.plan.find((p) => p.day === d)?.checked ?? null;
  const fixes = ahead.filter(([a, b]) => a !== b || (marking && isFull(b) && marked(b.day) !== RULES_VER)).map(([, b]) => b);
  if (fixes.length) body.planFix = fixes.map((p) => ({ day: p.day, slot: p.slot, itemClass: classOfBase(p.base), base: p.base, baseJa: jaTypeName(p.base), sampleId: p.sampleId, ilvl: p.ilvl, aims: p.aims, ...(marking && isFull(p) ? { checked: RULES_VER } : {}) }));
  const short = ahead.filter(([, b]) => !isFull(b)).map(([, b]) => b.day);
  // 取り直しも印の列がある D1 (= D-80f を出した後) だけ。列を本番に当てるまでは前の動きのまま (忍者を取りに行かない)
  if (short.length && marking) { body.needMore = short; log.push(`お題に使える人が足りない日: ${short.join("・")} (取り直しの合図、D-80f)`); }

  // ④ お題 (D-84): 箱にその日の予定のベース → 箱から抽選 → 予定。候補はその日の 16:00 より前に通った投稿で、そのベースのフル MOD 以上の物だけ (前に通った物も見直す)
  if (!inp.topics.some((t) => t.day === inp.target)) {
    const planned = plan.find((p) => p.day === inp.target);
    const day = planned ? toFull(planned) : null;
    const box = checkedBox.filter((x) => x.status === "ok" && x.b.created < startAt(no) && fullMods(data, (JSON.parse(x.b.item) as { base: string }).base, x.aims));
    const pick = box.find((x) => day && JSON.parse(x.b.item).base === day.base) ?? (box.length ? box[Math.abs(Math.imul(no, 2654435761)) % box.length]! : null);
    if (pick) {
      const it = JSON.parse(pick.b.item) as { base: string; ilvl: number };
      const cls = classOfBase(it.base);
      body.topic = { day: inp.target, boxId: pick.b.id, slot: (cls && slotOfClass(cls)) ?? weekdayOf(no), itemClass: cls, base: it.base, baseJa: jaTypeName(it.base), ilvl: it.ilvl, aims: pick.aims, engineVer, rulesVer: RULES_VER };
      log.push(`お題 ${inp.target}: 投稿 ${pick.b.id} (${it.base})`);
    } else if (day?.aims) {
      body.topic = { day: inp.target, sampleId: day.sampleId, slot: day.slot, itemClass: classOfBase(day.base), base: day.base, baseJa: jaTypeName(day.base), ilvl: day.ilvl, aims: day.aims, engineVer, rulesVer: RULES_VER };
      log.push(`お題 ${inp.target}: 予定 (${day.base})`);
    } else log.push(`お題 ${inp.target}: 出せる物が無い`);
  } else log.push(`お題 ${inp.target}: もう出ている`);
  return { body, log };
}
