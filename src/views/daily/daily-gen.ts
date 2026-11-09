/**
 * daily-gen.ts — 週の予定とお題を組む (D-05・D-06・D-04・D-82・D-83)。全部が純粋な関数で、同じ型のファイル・同じ履歴なら同じ予定とお題。
 * 型のファイル (D-80b・D-80c) = 取れた人の装備の 1 品ずつ (ベース・接頭と接尾の行の名前と段)。取るのはサーバー管理人 (D-91)、ここは読むだけ。
 * 週のファイルが 1 つも無い時は手の辞書 daily-types.ts から見本の型を作る (D-80 の控え)。乱数は mulberry32
 */
import { freshItem, mulberry32, type PatchData } from "../../services/craft-stage/engine";
import { modListFor, type ListRow } from "../../services/craft-stage/mod-list";
import { baseStatsOf } from "../../services/craft-stage/stage-bases";
import { clientClassOf, ENGINE_CATEGORIES, handsOf, inGroup, kindOf } from "../../services/mods/item-classes";
import { goalBlock } from "../../services/simulator/sim-engine";
import { lang } from "../../i18n/lang";
import { DAILY_TYPES } from "./daily-types";
import { fullMods } from "./daily-check";

export type GenAim = { modId: string; tier: number; ja: string; en: string };
/** 型の 1 品。mods = 接頭・接尾の行の名前 (エンジンの行の id の / の後ろ) と段。暗黙は持たない (D-06) */
export type DailySample = { id: string; base: string; mods: Array<{ name: string; tier: number }>; n: number };
/** 週の予定の 1 日 (daily_plan) */
export type PlanDay = { day: string; slot: number; base: string; sampleId: string };
export type GenTopic = { day: string; sampleId: string; base: string; ilvl: number; aims: GenAim[]; slot: number };

/** 型のファイルにアイテムレベルは無いので、お題はこのレベル */
export const TOPIC_ILVL = 82;

/**
 * 狙いの字 (ja・en) を MOD 一覧の段の字から引く口。一覧の字は画面の言語で決まるので、言語を一時的に替えて 2 回引く
 * (前は今の言語の字を ja・en の両方に入れていて、en に日本語が入っていた、11-05)。行が引けなければ null
 */
export function aimTextsOf(data: PatchData, base: string, ilvl: number): (modId: string, tier: number) => { ja: string; en: string } | null {
  const rowsIn = (l: "ja" | "en"): ListRow[] => {
    const was = lang.value;
    lang.value = l;
    try { return modListFor(data, freshItem(data, base, ilvl)); } catch { return []; } finally { lang.value = was; }
  };
  const ja = rowsIn("ja"), en = rowsIn("en");
  const textOf = (rows: ListRow[], modId: string, tier: number): string | null => {
    for (const r of rows) { const t = r.tiers.find((x) => (x.modId ?? r.id) === modId && x.tier === tier); if (t) return t.text; }
    return null;
  };
  return (modId, tier) => { const j = textOf(ja, modId, tier), e = textOf(en, modId, tier); return j && e ? { ja: j, en: e } : null; };
}

/** 曜日の部位 (D-05、0 = 月)。部位は item-classes のまとまりで見て、名前を手で並べない */
export const SLOTS: readonly { ja: string; en: string; has: (category: string) => boolean }[] = [
  { ja: "片手武器", en: "One-handed weapons", has: (c) => kindOf(c) === "weapon" && handsOf(c) === 1 },
  { ja: "両手武器", en: "Two-handed weapons", has: (c) => kindOf(c) === "weapon" && handsOf(c) === 2 },
  { ja: "ジュエル・オフハンド", en: "Jewels & off-hands", has: (c) => inGroup(c, "jewel") || inGroup(c, "quiver") || inGroup(c, "shieldLike") },
  { ja: "兜・手袋", en: "Helmets & gloves", has: (c) => ["Helmet", "Gloves"].includes(clientClassOf(c) ?? "") },
  { ja: "鎧", en: "Body armour", has: (c) => inGroup(c, "bodyArmour") },
  { ja: "靴・ベルト", en: "Boots & belts", has: (c) => ["Boots", "Belt"].includes(clientClassOf(c) ?? "") },
  { ja: "アミュ・指輪", en: "Amulets & rings", has: (c) => inGroup(c, "ringAmulet") },
];

/** ベース → 部位 (クライアントの部位 Id)。エンジンに部位の表が無い物は null (山に入らない、D-05) */
const CLASS_CAT = new Map<string, string>();
for (const c of ENGINE_CATEGORIES) { const k = clientClassOf(c); if (k && !CLASS_CAT.has(k)) CLASS_CAT.set(k, c); }
export const classOfBase = (base: string): string | null => { const k = baseStatsOf(base)?.cls; return k && CLASS_CAT.has(k) ? k : null; };
export const slotOfClass = (cls: string): number | null => { const c = CLASS_CAT.get(cls); if (!c) return null; const i = SLOTS.findIndex((s) => s.has(c)); return i < 0 ? null : i; };

const seedOf = (s: string): number => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const pickOf = <T>(a: readonly T[], rng: () => number): T => a[Math.floor(rng() * a.length)]!;
const nameOf = (r: ListRow): string => r.id.slice(r.id.indexOf("/") + 1);

/** 段の下限 (D-04): 元が T1 なら T1、ほかは全部 T2 以上 */
export const tierFloor = (tier: number): number => (tier <= 1 ? 1 : 2);
/** 行の段のうちアイテムレベルで出る物から、元の段 tier の下限 (D-04) の段。無ければその上の段の一番近い物。どちらも無ければ undefined */
const floorTierOf = (r: ListRow | undefined, ilvl: number, tier: number): { able: ListRow["tiers"]; t: ListRow["tiers"][number] | undefined } => {
  const want = tierFloor(tier), able = (r?.tiers ?? []).filter((x) => x.ilvl <= ilvl).sort((x, y) => x.tier - y.tier);
  return { able, t: able.find((x) => x.tier === want) ?? able.find((x) => x.tier > want) };
};

/**
 * 1 人分の並びをそのままお題にする (D-06・D-82)。段は D-04、付かない並び (D-83) は null。
 * 段の下限の段がアイテムレベルで出ない MOD は、出る中で一番上の段
 */
export function aimsOfSample(data: PatchData, s: DailySample, ilvl = TOPIC_ILVL): GenAim[] | null {
  let rows: ListRow[];
  try { rows = modListFor(data, freshItem(data, s.base, ilvl)).filter((r) => r.group === "normal"); } catch { return null; }
  const aims: GenAim[] = [], texts = aimTextsOf(data, s.base, ilvl);
  for (const m of s.mods) {
    const r = rows.find((x) => nameOf(x) === m.name);
    if (!r) return null;
    const f = floorTierOf(r, ilvl, m.tier), t = f.t ?? f.able[0];
    if (!t) return null;
    const modId = t.modId ?? r.id;
    if (goalBlock(data, s.base, ilvl, aims.map((a) => ({ modId: a.modId, tier: a.tier })), { modId, tier: t.tier })) return null;
    aims.push({ modId, tier: t.tier, ...(texts(modId, t.tier) ?? { ja: t.text, en: t.text }) });
  }
  return aims.length ? aims : null;
}

/** お題にできる 1 人分か: 並びが付き (D-83)、そのベースのフル MOD 以上 (D-84 と同じ判定 fullMods、オーナー 11-09「フルMODだけにして」)。できれば狙い */
export function fullAimsOfSample(data: PatchData, s: DailySample, ilvl = TOPIC_ILVL): GenAim[] | null {
  const aims = aimsOfSample(data, s, ilvl);
  return aims && fullMods(data, s.base, aims) ? aims : null;
}

/** 投稿の狙いを D-04 の段に上げる (同じ系統をまとめた行は段ごとに modId が違うので表から引き直す)。行が見つからない狙いはそのまま */
export function floorAims(data: PatchData, base: string, ilvl: number, aims: readonly GenAim[]): GenAim[] {
  let rows: ListRow[] = [];
  try { rows = modListFor(data, freshItem(data, base, ilvl)); } catch { /* 表が引けなければそのまま */ }
  return aims.map((a) => {
    const r = rows.find((x) => x.id === a.modId || x.tiers.some((t) => t.modId === a.modId));
    const { t } = floorTierOf(r, ilvl, a.tier);
    return r && t ? { ...a, modId: t.modId ?? r.id, tier: t.tier } : { ...a, tier: Math.min(a.tier, tierFloor(a.tier)) };
  });
}

/** 履歴 = 前に出たお題 (古い順)。部位の山とベースの「まだ出ていない」をここから数える (D-06、別の表を持たない) */
export type PlanHistory = ReadonlyArray<{ slot: number; cls: string; base: string }>;

/**
 * 週の予定 (D-06)。days = 月〜日の日付、samples = その週の型。曜日ごとに ① 部位の山から 1 つ ② その部位のレアのうちまだ出ていないベースを先に
 * ③ その中から無作為に 1 人分。日付の種で引く。型の無い部位は山から外し、曜日に型が 1 つも無ければその日は空 (null)。
 * anySlot = 手の辞書の見本の間だけ、曜日に型が無い日は部位を問わず引く (見本は指輪・防具しか無いので)
 */
export function planWeek(data: PatchData, days: readonly string[], samples: readonly DailySample[], history: PlanHistory, anySlot = false): Array<PlanDay | null> {
  const past = [...history];
  return days.map((day, wd) => {
    const rng = mulberry32(seedOf(`plan:${day}`));
    const fit = samples.filter((s) => { const k = classOfBase(s.base); return k != null && slotOfClass(k) === wd; });
    const mine = fit.length || !anySlot ? fit : samples.filter((s) => classOfBase(s.base) != null);
    const classes = [...new Set(mine.map((s) => classOfBase(s.base)!))].sort();
    if (!classes.length) return null;
    // 部位の山: 今の周で出た部位を除いた残りから引く。全部出たら混ぜ直す
    const shown = past.filter((h) => h.slot === wd).map((h) => h.cls).filter((c) => classes.includes(c));
    const cycle = new Set(shown.slice(shown.length - (shown.length % classes.length)));
    const rest = classes.filter((c) => !cycle.has(c));
    const first = pickOf(rest.length ? rest : classes, rng);
    // 引いた部位で並びが 1 つも付かなければ、残りの部位を順に
    for (const cls of [first, ...rest.filter((c) => c !== first), ...classes.filter((c) => cycle.has(c) && c !== first)]) {
      const inCls = mine.filter((s) => classOfBase(s.base) === cls);
      const seen = new Set(past.map((h) => h.base));
      const fresh = inCls.filter((s) => !seen.has(s.base));
      // 無作為に 1 人分 (同じ並びの人数 n だけ重く)。付かない並びは次の人へ (D-83)
      const pool = (fresh.length ? fresh : inCls).flatMap((s) => Array.from({ length: Math.max(1, s.n) }, () => s));
      while (pool.length) {
        const s = pool.splice(Math.floor(rng() * pool.length), 1)[0]!;
        if (!fullAimsOfSample(data, s)) { for (let i = pool.length - 1; i >= 0; i--) if (pool[i]!.id === s.id) pool.splice(i, 1); continue; }
        past.push({ slot: wd, cls, base: s.base });
        // slot はその品の部位 (見本で部位を問わず引いた日も、出す名前は品に合わせる)
        return { day, slot: slotOfClass(cls) ?? wd, base: s.base, sampleId: s.id };
      }
    }
    return null;
  });
}

/** 予定の 1 日 → お題 (D-82)。予定の 1 人分がフル MOD に届かなければ、同じ部位の次の 1 人へ (nextFullSample) */
export function topicOfPlan(data: PatchData, p: PlanDay, samples: readonly DailySample[], seen: ReadonlySet<string> = new Set()): GenTopic | null {
  const s = samples.find((x) => x.id === p.sampleId), aims = s ? fullAimsOfSample(data, s) : null;
  if (s && aims) return { day: p.day, sampleId: s.id, base: s.base, ilvl: TOPIC_ILVL, aims, slot: p.slot };
  const n = nextFullSample(data, p.day, p.base, samples, seen, p.sampleId);
  return n ? { day: p.day, sampleId: n.s.id, base: n.s.base, ilvl: TOPIC_ILVL, aims: n.aims, slot: p.slot } : null;
}

/**
 * 予定の 1 人分がお題にできない時の次の 1 人 (D-82)。同じ部位 (base と同じ部位の種別) の型から、まだ出ていないベースを先に、日付の種で無作為に。
 * 予定を組んだ後にフル MOD の判定を足した週 (11-09 の週) の予定も、出す日にここで差し替わる。見つからなければ null
 */
export function nextFullSample(data: PatchData, day: string, base: string | null, samples: readonly DailySample[], seen: ReadonlySet<string>, skipId: string | null): { s: DailySample; aims: GenAim[] } | null {
  const cls = base ? classOfBase(base) : null;
  if (base && !cls) return null;
  const rng = mulberry32(seedOf(`next:${day}`));
  // base = null は部位を問わない (同じ部位にフル MOD の人が 1 人もいない時の控え、毎日 1 個出す D-01 が先)
  const inCls = samples.filter((s) => s.id !== skipId && classOfBase(s.base) != null && (!cls || classOfBase(s.base) === cls));
  const fresh = inCls.filter((s) => !seen.has(s.base));
  for (const list of fresh.length ? [fresh, inCls.filter((s) => seen.has(s.base))] : [inCls]) {
    const pool = list.flatMap((s) => Array.from({ length: Math.max(1, s.n) }, () => s));
    while (pool.length) {
      const s = pool.splice(Math.floor(rng() * pool.length), 1)[0]!;
      const aims = fullAimsOfSample(data, s);
      if (aims) return { s, aims };
      for (let i = pool.length - 1; i >= 0; i--) if (pool[i]!.id === s.id) pool.splice(i, 1);
    }
  }
  return null;
}

/** 手の辞書から見本の型を作る (週のファイルが 1 つも無い時、D-80)。付く組だけ残し、段は T3 の見本 */
export function devSamples(data: PatchData): DailySample[] {
  const out: DailySample[] = [];
  for (const ty of DAILY_TYPES) {
    if (ty.off) continue;
    const mods: DailySample["mods"] = [];
    for (const name of [...ty.must, ...ty.pool.filter((p) => !ty.must.includes(p))]) {
      if (mods.length >= 6) break;
      const trial: DailySample = { id: ty.id, base: ty.base, mods: [...mods, { name, tier: mods.length ? 3 : 1 }], n: 1 };
      if (aimsOfSample(data, trial)) mods.push(trial.mods.at(-1)!);
    }
    if (mods.length) out.push({ id: `dev-${ty.id}`, base: ty.base, mods, n: 1 });
  }
  return out;
}
