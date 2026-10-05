/**
 * mod-values-check.ts — MOD の数値の全数点検 (2026-10-03、オーナー「MOD をフルチェックしてくれ」)
 *
 * 原本はクライアント (src/i18n/mods-bundle.json: text_en と stats の min/max)。見るのは 3 つ。
 *   (a) 原本の中で: stats の min/max を単位の決まり (stat-scale.ts) で画面の値にすると、text_en の数字 (「(4-5)」「10」) になるか
 *   (b) 計算機のエンジン (poe2htc の mods.json + クライアントで足した extra-bases.json の mods) の段の ranges が、
 *       画面の値にした時に原本の同じ MOD (codes か、系統 + 側 + レベル) の値と一致するか。stats の id も同じか
 *   (c) 画面で使う派生データ: 創生の樹の MOD の段 (extra-bases.json の dropOnly、文から取った表示値) と、
 *       上位プレイヤーの MOD のティア表 (services/mods/tiers.ts の sourceRanges) が原本の画面の値と同じか
 *
 * 純粋な関数。scripts/check-mod-values.mjs (pnpm check:mods) と tests/mod-values.test.ts が同じ物を呼ぶ。
 * 外部 API は叩かない。
 */
import { displayValue, tierDisplayRanges } from "./stat-scale";
import { stripRichTextMarkers } from "./normalize";

export interface BundleStat { id: string; min?: number; max?: number }
export interface BundleEntry {
  text_en?: string;
  type?: string;
  groups?: string[];
  level?: number;
  stats?: BundleStat[];
}
export type Bundle = Record<string, BundleEntry>;

export interface HtcTier { name?: string; ilvl: number; ranges: readonly (readonly (number | string)[])[]; stats?: readonly string[]; codes?: readonly string[] }
export interface HtcMod { id: string; family: string; type: string; text?: string; tiers: readonly HtcTier[] }
export interface DropOnlyInfo { name: string; stats?: string[]; tiers?: Array<{ name: string; min: number; max: number; level: number }> }

export interface Issue {
  /** どのデータ (bundle / htc / extra / dropOnly / tiers) */
  where: "bundle" | "htc" | "extra" | "dropOnly" | "tiers";
  /** MOD の id (エンジンの段は `id#段` ) */
  id: string;
  text: string;
  expected: string;
  actual: string;
  /** 何が合わないか (短い日本語) */
  why: string;
}

/**
 * 文に値が出ない stat (stat-hidden.json)。`hidden` はどんな値でも出ない物、`partly` は値によって出ない物
 * (行ごとの [下限, 上限, 出る=1]、null は無制限。上から順に min が入る最初の行が選ばれる = クライアントの文の作り方と同じ)
 */
export type Limit = [number | null, number | null] | ["!", number];
export interface PartlyHidden {
  /** この stat の、文の雛形 (descriptor) の中の位置 */
  pos: number;
  /** 雛形の stat 全部 (位置順) */
  stats: string[];
  /** 文の行 (上から順)。lim は位置ごとの限界、shown はその行にこの stat の値が出るか */
  lines: Array<{ lim: Limit[]; shown: 0 | 1 }>;
}
export interface HiddenStats {
  hidden: ReadonlySet<string>;
  partly?: Record<string, PartlyHidden>;
}

const inLimit = (lim: Limit, v: number): boolean => (lim[0] === "!" ? v !== lim[1] : (lim[0] == null || v >= lim[0]) && (lim[1] == null || v <= (lim[1] as number)));

/**
 * その stat の値 (min) が文に出るか。行の選び方はクライアントの文の作り方 (parse-stat-descriptions.mjs の matchLimits) と同じ:
 * 全部の位置の限界に値が入る最初の行。他の stat の値は MOD が持っていればその min、無ければ 0
 */
export function isShown(h: HiddenStats, statId: string, min: number, others: ReadonlyMap<string, number> = new Map()): boolean {
  if (h.hidden.has(statId)) return false;
  const p = h.partly?.[statId];
  if (!p) return true;
  const values = p.stats.map((s, i) => (i === p.pos ? min : others.get(s) ?? 0));
  const line = p.lines.find((l) => l.lim.every((lim, i) => inLimit(lim, values[i]!))) ?? p.lines[0];
  return (line?.shown ?? 1) === 1;
}

export interface CheckInput {
  bundle: Bundle;
  /** 文に値が出ない stat (stat-hidden.json)。照合から外す */
  hidden: HiddenStats;
  htcMods: readonly HtcMod[];
  extraMods: readonly HtcMod[];
  dropOnly: Record<string, DropOnlyInfo>;
  /** tiers.ts の sourceRanges (原本 1 件 → 表示の下限 / 上限)。省くと (c) のティア表は見ない */
  sourceRanges?: (entry: BundleEntry) => { mins: number[]; maxs: number[] } | null;
}

export interface CheckResult {
  issues: Issue[];
  counts: { bundleChecked: number; htcTiers: number; htcMatched: number; htcNoReference: number; dropOnlyTiers: number; tiersChecked: number };
  /** 原本に対応が見つからなかったエンジンの段 (不一致ではなく、照合できなかった物) */
  noReference: string[];
  /** 原本で、stat の値が文に出ない物 (不一致ではない。画面に入れる数字が無い) */
  notShown: string[];
}

const pair = (a: number, b: number): string => (a === b ? `${a}` : `${Math.min(a, b)}-${Math.max(a, b)}`);
const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.0051;

/** text_en の数字 (幅 / 裸) を全部。印は外す */
export function textNumbers(textEn: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const re = /\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)|(?<![\d.(-])(-?\d+(?:\.\d+)?)(?![\d.)-])/g;
  let m: RegExpExecArray | null;
  const s = stripRichTextMarkers(textEn);
  while ((m = re.exec(s))) {
    if (m[1] !== undefined) out.push([Number(m[1]), Number(m[2])]);
    else out.push([Number(m[3]), Number(m[3])]);
  }
  return out;
}

/** 原本 1 件の stat を画面の値にした幅 (hidden は除く)。数値の無い stat は飛ばす */
export function bundleDisplayRanges(e: BundleEntry, hidden: HiddenStats): Array<{ id: string; lo: number; hi: number }> {
  const out: Array<{ id: string; lo: number; hi: number }> = [];
  const mins = new Map((e.stats ?? []).filter((s) => typeof s.min === "number").map((s) => [s.id, s.min as number]));
  for (const s of e.stats ?? []) {
    if (typeof s.min !== "number" || typeof s.max !== "number" || !isShown(hidden, s.id, s.min, mins)) continue;
    const a = displayValue(s.id, s.min);
    const b = displayValue(s.id, s.max);
    out.push({ id: s.id, lo: Math.min(a, b), hi: Math.max(a, b) });
  }
  return out;
}

/** 幅の集まりを順序に関係なく比べる印 (符号は見ない: 「減少」の文は正で出る) */
const sig = (xs: Array<[number, number]>): string => xs.map(([a, b]) => pair(Math.abs(a), Math.abs(b))).sort().join("|");

/** 文の数字 1 つが、画面の値にした stat の幅と同じか (符号は見ない: 「(15-10)% reduced」の値は -15〜-10) */
const sameRange = ([a, b]: readonly [number, number], w: { lo: number; hi: number }): boolean => {
  const lo = Math.min(Math.abs(w.lo), Math.abs(w.hi));
  const hi = Math.max(Math.abs(w.lo), Math.abs(w.hi));
  const x = Math.min(Math.abs(a), Math.abs(b));
  const y = Math.max(Math.abs(a), Math.abs(b));
  return near(x, lo) && near(y, hi);
};

/**
 * (a) 原本: 画面の値にした stat の幅が text_en の数字に出ているか。
 *
 * 文の数字と stat の両方を突き合わせ、**どの stat にも説明されない数字が文に残る時だけ** NG にする
 * (換算を間違えた時はそうなる: 「+(4-5)%」に対して 400-500)。stat の値が文に出ないだけ (「Loads an additional bolt」の 1、
 * 「Attacks Chain an additional time」の 1、2 行の MOD で片方の行が文に無い物) は、画面に数字を入れる所が無いので
 * 表示の間違いは起きない。`notShown` に別に返す (不一致ではない)。
 * マップの MOD (キーが Map で始まる) は装備の画面に出ないので見ない
 */
export function checkBundle(bundle: Bundle, hidden: HiddenStats): { issues: Issue[]; checked: number; notShown: string[] } {
  const issues: Issue[] = [];
  const notShown: string[] = [];
  let checked = 0;
  for (const [id, e] of Object.entries(bundle)) {
    if (!e.text_en || /^Map/.test(id)) continue;
    const want = bundleDisplayRanges(e, hidden);
    if (want.length === 0) continue;
    checked++;
    const nums = textNumbers(e.text_en);
    const explained = nums.map((n) => want.some((w) => sameRange(n, w)));
    const missing = want.filter((w) => !nums.some((n) => sameRange(n, w)));
    if (missing.length === 0) continue;
    const stray = nums.filter((_n, i) => !explained[i]);
    if (stray.length === 0) {
      notShown.push(`${id} | ${e.text_en.replace(/\r?\n/g, " / ")} | ${missing.map((w) => `${w.id}=${pair(w.lo, w.hi)}`).join(", ")}`);
      continue;
    }
    for (const w of missing) {
      issues.push({ where: "bundle", id, text: e.text_en, expected: pair(w.lo, w.hi), actual: stray.map(([a, b]) => pair(a, b)).join(", "), why: `${w.id} を画面の値にしても文の数字と合わない` });
    }
  }
  return { issues, checked, notShown };
}

/** 原本の候補: 系統 (groups) + 側 + レベル + 値の数 */
/**
 * 原本の候補: 段の codes (上流がクライアントの MOD id を付けた物) と、系統 (groups) + 側 + レベル の両方。
 * codes は上流の突き合わせで、同じ系統の別の MOD を指している事がある (Wands/PerfectEssence_IncreasedMana の codes は
 * IncreasedMana10 だが、値 142-188 は AlloySpellLevelManaHybrid1 の物) ので、codes だけに頼らない。
 * エンジンの ranges は幅のある値だけ (「+1 to Level」の固定値は持たない) なので、数が合わない時は原本の固定値を抜いて比べる
 */
function candidatesFor(bundle: Bundle, byGroup: Map<string, string[]>, mod: HtcMod, tier: HtcTier, hidden: HiddenStats): Array<{ key: string; ranges: Array<{ id: string; lo: number; hi: number }> }> {
  const keys = new Set<string>(tier.codes ?? []);
  for (const k of byGroup.get(mod.family) ?? []) {
    const e = bundle[k];
    if (e && e.type === mod.type && (e.level ?? 0) === tier.ilvl) keys.add(k);
  }
  const out: Array<{ key: string; ranges: Array<{ id: string; lo: number; hi: number }> }> = [];
  for (const k of keys) {
    const e = bundle[k];
    if (!e) continue;
    let ranges = bundleDisplayRanges(e, hidden);
    if (ranges.length !== tier.ranges.length) ranges = ranges.filter((r) => r.lo !== r.hi);
    if (ranges.length !== tier.ranges.length) continue;
    out.push({ key: k, ranges });
  }
  return out;
}

/** (b) エンジンの段 (同梱 + 足した物) が原本の値と一致するか */
export function checkHtc(bundle: Bundle, hidden: HiddenStats, mods: readonly HtcMod[], where: "htc" | "extra"): { issues: Issue[]; tiers: number; matched: number; noReference: string[] } {
  const byGroup = new Map<string, string[]>();
  for (const [k, e] of Object.entries(bundle)) for (const g of e.groups ?? []) (byGroup.get(g) ?? byGroup.set(g, []).get(g)!).push(k);
  const issues: Issue[] = [];
  const noReference: string[] = [];
  let tiers = 0;
  let matched = 0;
  for (const m of mods) {
    m.tiers.forEach((t, i) => {
      if (!t.ranges.length) return; // 値の無い MOD (「Corrupted Blood cannot be inflicted」) は見る物が無い
      tiers++;
      const id = `${m.id}#${i}`;
      const text = m.text ?? m.family;
      const own = tierDisplayRanges(t).map(([a, b]) => [a!, b!] as [number, number]);
      // stats と ranges の数が合わない段は換算できない (tierDisplayRanges は生のまま返す)
      if (t.stats?.length && t.stats.length !== t.ranges.length) {
        issues.push({ where, id, text, expected: `stats ${t.stats.length} 個`, actual: `ranges ${t.ranges.length} 個`, why: "stats と ranges の数が違う (換算できない)" });
        return;
      }
      const cands = candidatesFor(bundle, byGroup, m, t, hidden);
      if (cands.length === 0) {
        noReference.push(`${id} ${text} [${own.map(([a, b]) => pair(a, b)).join(" / ")}]`);
        return;
      }
      const hits = cands.filter((c) => sig(c.ranges.map((r) => [r.lo, r.hi])) === sig(own));
      if (hits.length === 0) {
        issues.push({
          where, id, text,
          expected: cands.map((c) => `${c.key}: ${c.ranges.map((r) => pair(r.lo, r.hi)).join(" / ")}`).join(" | "),
          actual: own.map(([a, b]) => pair(a, b)).join(" / "),
          why: t.stats?.length ? "原本の値と違う (生の値のまま、または古い値)" : "原本の値と違う (stats 無しの段。poe2db の表示値が古い?)",
        });
        return;
      }
      matched++;
      // stat の id も同じか (持っている段だけ)。値の同じ候補が複数ある時 (同じ系統・同じレベルの武器用と装飾品用) はどれかと同じなら良い
      if (t.stats?.length) {
        const a = [...t.stats].sort().join(",");
        const ids = hits.map((h) => h.ranges.map((r) => r.id).sort().join(","));
        if (!ids.includes(a)) issues.push({ where, id, text, expected: ids.join(" | "), actual: a, why: "stat の id が原本と違う" });
      }
    });
  }
  return { issues, tiers, matched, noReference };
}

/** (c-1) 創生の樹の MOD の段 (文から取った表示値) が原本の画面の値と同じか */
export function checkDropOnly(bundle: Bundle, hidden: HiddenStats, dropOnly: Record<string, DropOnlyInfo>, keyOf: (textEn: string) => string): { issues: Issue[]; tiers: number } {
  const byKey = new Map<string, BundleEntry[]>();
  for (const e of Object.values(bundle)) {
    if (!e.text_en) continue;
    const k = keyOf(e.text_en);
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(e);
  }
  const issues: Issue[] = [];
  let tiers = 0;
  for (const [key, info] of Object.entries(dropOnly)) {
    for (const t of info.tiers ?? []) {
      tiers++;
      const ok = (byKey.get(key) ?? []).some((e) => bundleDisplayRanges(e, hidden).some((r) => near(r.lo, t.min) && near(r.hi, t.max)));
      if (!ok) issues.push({ where: "dropOnly", id: `${info.name} (${key})`, text: key, expected: "原本の画面の値のどれか", actual: pair(t.min, t.max), why: "樹の MOD の段が原本に無い" });
    }
  }
  return { issues, tiers };
}

/** (c-2) 上位プレイヤーの MOD のティア表の元 (tiers.ts の sourceRanges) が原本の画面の値と同じか */
export function checkTierSources(bundle: Bundle, hidden: HiddenStats, sourceRanges: NonNullable<CheckInput["sourceRanges"]>): { issues: Issue[]; checked: number } {
  const issues: Issue[] = [];
  let checked = 0;
  for (const [id, e] of Object.entries(bundle)) {
    const got = sourceRanges(e);
    if (!got) continue;
    checked++;
    const want = bundleDisplayRanges(e, hidden);
    // 値の無い stat (hidden) を抜いた分だけ比べる。数が違う時は文の数字 (表示値) を使っているので、原本の幅がその中に全部あれば良い
    const gotPairs = got.mins.map((lo, i) => [lo, got.maxs[i]!] as [number, number]);
    const missing = want.filter((w) => !gotPairs.some((p) => sameRange(p, w)));
    if (missing.length) {
      issues.push({ where: "tiers", id, text: e.text_en ?? "", expected: missing.map((w) => pair(w.lo, w.hi)).join(" / "), actual: gotPairs.map(([a, b]) => pair(a, b)).join(" / "), why: "ティア表の値が原本の画面の値と違う" });
    }
  }
  return { issues, checked };
}

export function checkModValues(input: CheckInput, keyOf: (textEn: string) => string): CheckResult {
  const a = checkBundle(input.bundle, input.hidden);
  const b = checkHtc(input.bundle, input.hidden, input.htcMods, "htc");
  // 通貨では付かない MOD (創生の樹・ハンドラップ、special: 文面・段・側を引くだけ) は点検しない。固定値の文面 (「追加で 1 つ」) を原本の別の MOD と
  // 突き合わせて「違う」と出るだけで、画面の値には使わない (2026-10-05)
  const x = checkHtc(input.bundle, input.hidden, input.extraMods.filter((m) => !(m as { special?: boolean }).special), "extra");
  const d = checkDropOnly(input.bundle, input.hidden, input.dropOnly, keyOf);
  const t = input.sourceRanges ? checkTierSources(input.bundle, input.hidden, input.sourceRanges) : { issues: [], checked: 0 };
  return {
    issues: [...a.issues, ...b.issues, ...x.issues, ...d.issues, ...t.issues],
    counts: {
      bundleChecked: a.checked,
      htcTiers: b.tiers + x.tiers,
      htcMatched: b.matched + x.matched,
      htcNoReference: b.noReference.length + x.noReference.length,
      dropOnlyTiers: d.tiers,
      tiersChecked: t.checked,
    },
    noReference: [...b.noReference, ...x.noReference],
    notShown: a.notShown,
  };
}
