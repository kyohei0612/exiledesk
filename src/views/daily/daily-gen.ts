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
import { fullMods, noNormalBase } from "./daily-check";

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
  { ja: "ジュエル・オフハンド", en: "Jewels & off-hands", has: (c) => inGroup(c, "quiver") || inGroup(c, "shieldLike") }, // ジュエルは 11-14 から出さない (noNormalBase)。札の名前はそのまま
  { ja: "兜・手袋", en: "Helmets & gloves", has: (c) => ["Helmet", "Gloves"].includes(clientClassOf(c) ?? "") },
  { ja: "鎧", en: "Body armour", has: (c) => inGroup(c, "bodyArmour") },
  { ja: "靴・ベルト", en: "Boots & belts", has: (c) => ["Boots", "Belt"].includes(clientClassOf(c) ?? "") },
  { ja: "アミュ・指輪", en: "Amulets & rings", has: (c) => inGroup(c, "ringAmulet") },
];

/** ベース → 部位 (クライアントの部位 Id)。エンジンに部位の表が無い物は null (山に入らない、D-05) */
const CLASS_CAT = new Map<string, string>();
for (const c of ENGINE_CATEGORIES) { const k = clientClassOf(c); if (k && !CLASS_CAT.has(k)) CLASS_CAT.set(k, c); }
/** ノーマルの無いベース (ジュエル) は部位なし = 予定・引き直し・忍者の品の山に入らない (D-05・D-84、11-14 noNormalBase) */
export const classOfBase = (base: string): string | null => { const k = baseStatsOf(base)?.cls; return k && CLASS_CAT.has(k) && !noNormalBase(base) ? k : null; };
/** 宝飾品 = 指輪・アミュレット・ベルト (D-04b の例外) */
export const isJewellery = (base: string): boolean => { const k = classOfBase(base); const c = k ? CLASS_CAT.get(k) : undefined; return !!c && (inGroup(c, "ringAmulet") || clientClassOf(c) === "Belt"); };
export const slotOfClass = (cls: string): number | null => { const c = CLASS_CAT.get(cls); if (!c) return null; const i = SLOTS.findIndex((s) => s.has(c)); return i < 0 ? null : i; };

const seedOf = (s: string): number => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const pickOf = <T>(a: readonly T[], rng: () => number): T => a[Math.floor(rng() * a.length)]!;
const nameOf = (r: ListRow): string => r.id.slice(r.id.indexOf("/") + 1);

/**
 * 段の下限 (D-04): 元の段に関係なく全部 T2 以上 (11-13 のお題から、オーナー 11-13「t2でいっちゃうか」。エッセンス・合金で決め打ちできて手応えが無い、が訳)。
 * 前の「全部 T3 以上」(11-10〜11-12 のお題。11-12 に 1 回 T2 に上げてすぐ戻した、そのお題も出た直後に T3 に書き換えた = D-21 の例外の記録)・「元が T1 なら T1、ほかは T2 以上」(11-05) はやめ。引数は前の形のまま残す (呼ぶ所を変えない)
 */
export const TIER_FLOOR = 2;
export const tierFloor = (_tier: number): number => TIER_FLOOR;
/**
 * 行の段のうちアイテムレベルで出る物から、下限 (D-04 = T2) の段。無ければその下の段の一番近い物、それも無ければ持っている中で一番下の段
 * (下限の段を持たない MOD は「持っている中で一番下」= どれが付いても達成)。段が 1 つも無ければ undefined
 */
const floorTierOf = (r: ListRow | undefined, ilvl: number, tier: number): { able: ListRow["tiers"]; t: ListRow["tiers"][number] | undefined } => {
  const want = tierFloor(tier), able = (r?.tiers ?? []).filter((x) => x.ilvl <= ilvl).sort((x, y) => x.tier - y.tier);
  // スキルのレベル系は D-04 の例外: アイテムレベルの中で付く一番上の段を必ず求める (11-11 オーナー「スキルレベル系はt1にしよう強制。マックスやないとなMODでつく中で」)
  if (r && isSkillLevel(r)) return { able, t: able[0] };
  return { able, t: able.find((x) => x.tier === want) ?? able.find((x) => x.tier > want) ?? able[able.length - 1] };
};
/** スキルのレベル系の MOD (全てのスペルスキルのレベル +# など)。行の id の系統名で見る (字は言語で変わるので使わない) */
export const isSkillLevel = (r: Pick<ListRow, "id" | "family">): boolean => /GemLevel/i.test(r.id) || /GemLevel/i.test(r.family);
/** 狙いの行 (同じ系統をまとめた行は段ごとに modId が違うので、行の id か段の modId で引く)。段を揃える所とエッセンスの入れ替えで 1 か所 */
const rowOfAim = (rows: readonly ListRow[], a: Pick<GenAim, "modId">): ListRow | undefined => rows.find((x) => x.id === a.modId || x.tiers.some((t) => t.modId === a.modId));

/**
 * 1 人分の並びをそのままお題にする (D-06・D-82)。段は D-04、付かない並び (D-83) は null。
 * 下限 (T3) の段がアイテムレベルで出ない MOD は floorTierOf の決まり (その下の段 → 持っている中で一番下)
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
  if (!aims) return null;
  if (fullMods(data, s.base, aims)) return aims;
  return essenceFill(data, s.base, ilvl, aims);
}

/**
 * フル MOD に 1 つ足りない忍者の品に、完全なエッセンスの MOD を 1 つ足してフル MOD にする (D-04b ②、11-11 オーナー「5 MODとかで必須にエッセンスなかったら足したら？6モッドに出来るやろ」)。
 * 宝飾品も同じ (11-11 オーナー「とにかく6モッドが条件絶対」「指輪なら他の指輪」)。もうエッセンスがある品・足しても付かない品は null = 呼ぶ側 (planWeek・nextFullSample) が同じ部位の別の品へ。
 * 足すのは付く組 (goalBlock) が通り、足した形がフル MOD (fullMods) になる時だけ (2 つ以上足りない品は足せないので外れる)。
 * 付くエッセンスが複数なら、そのエッセンスの MOD と同じ系統の普通の MOD の付く確率 (その側の重みの中の割合) が高い物 (普通に付かない物は 0、同じならエンジンの並び順)。足せなければ null
 */
export function essenceFill(data: PatchData, base: string, ilvl: number, aims: readonly GenAim[]): GenAim[] | null {
  let rows: ListRow[];
  try { rows = modListFor(data, freshItem(data, base, ilvl)); } catch { return null; }
  const perfectTier = (r: ListRow) => r.tiers.find((t) => t.essence?.en.startsWith("Perfect Essence"));
  const ess = rows.filter((r) => r.group === "perfect_essence" && perfectTier(r));
  if (!ess.length || aims.some((a) => { const r = rowOfAim(rows, a); return !!r && r.group !== "normal"; })) return null;
  const norm = rows.filter((r) => r.group === "normal");
  const sideTotal = (side: string) => norm.filter((r) => r.side === side).reduce((n, r) => n + r.weight, 0) || 1;
  const natural = (e: ListRow) => { const n = norm.find((x) => !!x.family && x.family === e.family); return n ? n.weight / sideTotal(n.side) : 0; };
  const texts = aimTextsOf(data, base, ilvl);
  const plain = aims.map((a) => ({ modId: a.modId, tier: a.tier }));
  const cands = ess.map((e) => {
    const t = perfectTier(e)!, modId = t.modId ?? e.id;
    return { pct: natural(e), add: { modId, tier: t.tier, ...(texts(modId, t.tier) ?? { ja: t.text, en: t.text }) } as GenAim };
  }).filter((c) => !goalBlock(data, base, ilvl, plain, { modId: c.add.modId, tier: c.add.tier }) && fullMods(data, base, [...aims, c.add]))
    .sort((x, y) => y.pct - x.pct);
  return cands[0] ? [...aims, cands[0].add] : null;
}

/** 投稿の狙いを D-04 の段に上げる (同じ系統をまとめた行は段ごとに modId が違うので表から引き直す)。行が見つからない狙いはそのまま */
export function floorAims(data: PatchData, base: string, ilvl: number, aims: readonly GenAim[]): GenAim[] {
  let rows: ListRow[] = [];
  try { rows = modListFor(data, freshItem(data, base, ilvl)); } catch { /* 表が引けなければそのまま */ }
  const texts = aimTextsOf(data, base, ilvl);
  return aims.map((a) => {
    const r = rowOfAim(rows, a);
    // エッセンスの MOD (D-04b) は段がエッセンスで決まっているので動かさない
    if (r && r.group !== "normal") return a;
    const { t } = floorTierOf(r, ilvl, a.tier);
    if (!r || !t) return { ...a, tier: tierFloor(a.tier) };
    // 字も揃えた段の物に引き直す (前は段だけ下げて元の段の値の字が残り、T3 のお題に T1 の値が書かれていた、11-11)
    const modId = t.modId ?? r.id;
    return { ...a, modId, tier: t.tier, ...(texts(modId, t.tier) ?? {}) };
  });
}

/**
 * 完全なエッセンスは入れられる時だけ 1 つ (D-04b、11-11 オーナー「エッセンス無理やり使わんでも」)。
 * そのベースに付くパーフェクトエッセンス (Perfect Essence of …、ヒステリー・アビス・合金などの特別な物は数えない) と同じ系統の狙いがあり、
 * 替えても値が下がらない時だけ、その狙いをエッセンスの MOD に替える (他は替えない)。替える候補が複数なら付く確率 (その側の普通の MOD の重みの中の割合) が一番高い物、同じなら忍者の装備で持つ人が少ない方。
 * 替えない: 宝飾品・スキルのレベル系・値が下がる・替えると付かない組 (goalBlock)・付くパーフェクトエッセンスが無い品・もう入っている品。投稿 (箱) には使わない
 */
export function essenceSwap(data: PatchData, base: string, ilvl: number, aims: readonly GenAim[], samples: readonly DailySample[] = []): { aims: GenAim[]; swap: { from: GenAim; to: GenAim; essence: string } | null } {
  // 宝飾品 (指輪・アミュレット・ベルト) は忍者の品の MOD の組のまま、エッセンスを入れない・替えない (11-11 オーナー「忍者どおりに」)
  if (isJewellery(base)) return { aims: [...aims], swap: null };
  let rows: ListRow[];
  try { rows = modListFor(data, freshItem(data, base, ilvl)); } catch { return { aims: [...aims], swap: null }; }
  const perfectTier = (r: ListRow) => r.tiers.find((t) => t.essence?.en.startsWith("Perfect Essence"));
  const ess = rows.filter((r) => r.group === "perfect_essence" && perfectTier(r));
  // もう入っている = 狙いがエッセンスの MOD そのもの。同じ系統の普通の MOD は入っている扱いにせず、下でその狙いを先にエッセンスへ替える
  const essRows = new Set(ess);
  if (!ess.length || aims.some((a) => { const r = rowOfAim(rows, a); return !!r && essRows.has(r); })) return { aims: [...aims], swap: null };
  const norm = rows.filter((r) => r.group === "normal");
  const sideTotal = (side: string) => norm.filter((r) => r.side === side).reduce((s, r) => s + r.weight, 0) || 1;
  const cls = classOfBase(base);
  const holders = (r: ListRow) => samples.filter((s) => classOfBase(s.base) === cls && s.mods.some((m) => m.name === nameOf(r))).length;
  const texts = aimTextsOf(data, base, ilvl);
  // 同じ MOD (同じ系統) が狙いにあれば、他を替えずにその狙いをエッセンスの MOD に替える (確率の高い狙いを替えるのは同じ系統が無い時だけ、
  // 11-11 オーナー「同じMODなら普通にエッセンスに変えたらええんやないかそもそもやが」)。順は 同じ系統 → 確率の高い方 → 持つ人が少ない方
  // ただし段 (数字) を下げる替え方はしない: 同じ系統でもエッセンスの値が狙いより小さければ替えない (11-11 オーナー「優先はMODのティアね同じ以下ならエッセンスで代用ってだけで、減らしてOKじゃないからな」)。
  // 値は字の数字の合計で比べる (同じ系統なら字の形が同じなので比べられる。近接スキルのレベル +4 とアタックスキルのレベル +2 は 4 > 2 で替えない)
  const sameFam = (r: ListRow, e: ListRow) => !!r.family && r.family === e.family;
  const valOf = (s: string) => (s.match(/\d+(?:\.\d+)?/g) ?? []).reduce((n, x) => n + Number(x), 0);
  let best: { i: number; same: boolean; pct: number; held: number; to: GenAim; essence: string } | null = null;
  for (const e of ess) {
    const t = perfectTier(e)!, modId = t.modId ?? e.id;
    const to: GenAim = { modId, tier: t.tier, ...(texts(modId, t.tier) ?? { ja: t.text, en: t.text }) };
    const cands = aims.map((a, i) => ({ i, r: rowOfAim(rows, a) })).filter((c) => c.r && c.r.group === "normal" && sameFam(c.r, e)) // 入れるのは同じ系統の狙いを替えられる時だけ (11-11 オーナー「エッセンス無理やり使わんでも」、前の「同じ側の確率の高い狙いを替える」はやめ)
      // 同じ系統で値が下がる狙いは替えない (その狙いは残し、ほかの狙いを替える候補にもしない = 並べると系統がぶつかるので goalBlock でも外れる)
      .filter((c) => !sameFam(c.r!, e) || valOf(to.en) >= valOf(aims[c.i]!.en))
      // スキルのレベル系の狙いは T1 から一切動かさない (エッセンスでも替えない・例外なし、11-11 オーナー「レベルは妥協ないね」)
      .filter((c) => !isSkillLevel(c.r!))
      .map((c) => ({ i: c.i, same: sameFam(c.r!, e), pct: c.r!.weight / sideTotal(c.r!.side), held: holders(c.r!) }))
      .filter((c) => !goalBlock(data, base, ilvl, aims.filter((_, j) => j !== c.i).map((a) => ({ modId: a.modId, tier: a.tier })), { modId, tier: t.tier }))
      .sort((x, y) => Number(y.same) - Number(x.same) || y.pct - x.pct || x.held - y.held);
    const c = cands[0];
    if (c && (!best || (c.same && !best.same) || (c.same === best.same && (c.pct > best.pct || (c.pct === best.pct && c.held < best.held))))) best = { ...c, to, essence: t.essence!.ja };
  }
  if (!best) return { aims: [...aims], swap: null };
  const out = aims.map((a, i) => (i === best!.i ? best!.to : a));
  return { aims: out, swap: { from: aims[best.i]!, to: best.to, essence: best.essence } };
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
  // 完全なエッセンスを 1 つ (D-04b)
  if (s && aims) return { day: p.day, sampleId: s.id, base: s.base, ilvl: TOPIC_ILVL, aims: essenceSwap(data, s.base, TOPIC_ILVL, aims, samples).aims, slot: p.slot };
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
      if (aims) return { s, aims: essenceSwap(data, s.base, TOPIC_ILVL, aims, samples).aims }; // 完全なエッセンスを 1 つ (D-04b)
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
