/**
 * engine-mods.ts — MOD の情報は 1 か所 (クラフトステージと同じエンジンのデータ) から引く (2026-10-05)
 *
 * オーナー「起点はクラフトステージの MOD。そこを起点として編集しよう。MOD がもし変わるシーズンだったら、他の MOD を使う計算やら動きも
 * 今一緒に経路を作っちゃってくれ」「基本 MOD 関係触る時は 1 か所から取るように」。
 *
 * エンジン (loadHtcPatch = 同梱の mods.json + クライアントから作る extra-bases.json + weight-overrides / rune-split) を正にして、
 * 文面 (poe.ninja・貼り付けの英語テンプレート) から MOD を引き、側 (プレ / サフィ)・段 (ティア表)・系統・取引所の stat を返す。
 * シーズンで MOD が変わったら、クライアントのデータを作り直す (pnpm data:client → extra-bases.json) だけで、ここを通る物は全部付いてくる。
 *
 * 使う物: 上位 MOD 一覧 (craft-v2) の取り込み・仕上げ・取引所の検索。前は別の表 (mods-bundle.json の多数決・tiers.ts・
 * mod-tier-and-group.json・mod-translations.ts) を持っていた。日本語訳 (mod-text-ja 等) と取引所の stat id の対応 (trade2-stat-mapping) は
 * エンジンに無い物なので別のまま。
 *
 * 同期で引く (集計は同期)。先に prepareEngineMods() で読んでおく (上位 MOD 一覧は取得・キャッシュ表示の前に読む)
 */
import { loadHtcPatch } from "../htc/patch";
import { classOfBase } from "../htc/bridge";
import { matchKey, modIndexOf } from "../htc/bridge-index";
import { jaOfMod } from "../htc/mod-text";
import { familyKeysOf } from "./mod-rules";
import { tierDisplayRanges } from "./stat-scale";
import type { ItemBase, Mod, PatchData } from "../../vendor/poe2htc/engine/types";
import type { ModTierRow, SlotKey } from "../craft-v2/types";

let data: PatchData | null = null;
/** エンジンを読んでおく (何度呼んでも 1 回) */
export async function prepareEngineMods(): Promise<void> {
  data ??= await loadHtcPatch();
}
/** 読んであれば返す (テスト・確かめ用) */
export const engineData = (): PatchData | null => data;

const NL = String.fromCharCode(10);

/** スロット → エンジンの種類 (ベースが取れていない古いキャッシュの時の既定) */
const SLOT_CATEGORIES: Record<SlotKey, readonly string[]> = {
  ring: ["Rings"], amulet: ["Amulets"], helm: ["Helmets"], gloves: ["Gloves"], body: ["Body_Armours"], boots: ["Boots"],
  weapon: ["Bows", "Crossbows", "Wands", "Sceptres", "Staves", "Quarterstaves", "Spears", "OneHand_Maces", "TwoHand_Maces", "Talismans"],
  weapon2: ["Bows", "Crossbows", "Wands", "Sceptres", "Staves", "Quarterstaves", "Spears", "OneHand_Maces", "TwoHand_Maces", "Talismans", "Shields", "Bucklers", "Foci", "Quivers"],
};

/** そのスロットで使われていたベースのエンジンの行。1 つも引けなければスロットの既定の種類の行全部 */
export function rowsForSlot(slot: SlotKey, baseNames: readonly string[]): ItemBase[] {
  const d = data;
  if (!d) return [];
  const out = new Map<string, ItemBase>();
  for (const n of baseNames) {
    const cls = classOfBase(d, n);
    if (cls) out.set(cls.id, cls);
  }
  if (out.size) return [...out.values()];
  const cats = new Set(SLOT_CATEGORIES[slot]);
  return [...d.bases.values()].filter((b) => cats.has(b.category));
}

/** 全部の行 (側・stat・日本語のように、行に依らない物を引く時) */
let allRows: ItemBase[] | null = null;
const everyRow = (): ItemBase[] => (allRows ??= data ? [...data.bases.values()] : []);

/**
 * 文面 → MOD (行ごとの索引で、MOD 全文の一致。`+` の有無のずれも見る)。lines = 複合 MOD の 1 行だけの一致も拾う
 */
export function engineModsFor(template: string, rows: readonly ItemBase[] = everyRow(), o: { lines?: boolean; exactOnly?: boolean; side?: "prefix" | "suffix"; wholeOnly?: boolean; special?: boolean } = {}): Mod[] {
  const d = data;
  if (!d) return [];
  const keys = [matchKey(template), matchKey(template.startsWith("+") ? template.slice(1) : `+${template}`)];
  const out = new Map<string, { mod: Mod; exact: boolean }>();
  // 自身の文面で当たる物は、行の置き場を全部見る (索引は 1 つの文面に 1 つの MOD なので、プレとサフィに同じ文面がある物
  // (アイテムのレアリティ) は片方が落ちる)
  const hits = (list: (row: ItemBase) => Mod[]) => {
    for (const row of rows) for (const m of list(row)) if (keys.some((k) => (o.wholeOnly ? wholeKey(m) === k : ownKeys(m).has(k)))) out.set(m.id, { mod: m, exact: true });
  };
  hits((row) => poolMods(d, row));
  // 通貨では付かないが現物に付く MOD (創生の樹・ハンドラップ、special) は、普通の置き場で引けない時だけ
  if (!out.size && o.special !== false) hits((row) => specialMods(d, row));
  if (out.size) return [...out.values()].map((x) => x.mod).filter((m) => !o.side || m.type === o.side);
  if (o.exactOnly) return [];
  for (const row of rows) {
    const idx = modIndexOf(d, row, "exclude");
    for (const k of keys) {
      const hit = idx.full.get(k) ?? (o.lines ? idx.line.get(k) : undefined);
      if (hit) { out.set(hit.mod.id, { mod: hit.mod, exact: ownKeys(hit.mod).has(k) }); break; }
    }
  }
  // 索引は「同じ系統の今の文面」でも引ける (同梱の文面が古い MOD 用)。その道は系統の 1 つ目の MOD に向くので、別の MOD に当たることがある
  // (セプターの「味方のクリティカル率」が「+#% to Critical Hit Chance」に当たっていた)。MOD 自身の文面で当たった物があれば、それだけにする
  const all = [...out.values()];
  const exact = all.filter((x) => x.exact);
  return (exact.length ? exact : all).map((x) => x.mod).filter((m) => !o.side || m.type === o.side);
}

/** 通貨では付かないが現物に付く MOD (創生の樹・ハンドラップ。extra-bases の special、文面を引くだけ) */
const specialCache = new WeakMap<ItemBase, Mod[]>();
function specialMods(d: PatchData, row: ItemBase): Mod[] {
  let list = specialCache.get(row);
  if (list) return list;
  const p = (row.pools as { special?: { prefixes: readonly string[]; suffixes: readonly string[] } }).special;
  list = p ? [...p.prefixes, ...p.suffixes].map((id) => d.mods.get(id)).filter((m): m is Mod => !!m) : [];
  specialCache.set(row, list);
  return list;
}
/** 行の置き場 (普通・冒涜・エッセンス・異界・特殊 MOD のルーン) の MOD 全部 */
const poolCache = new WeakMap<ItemBase, Mod[]>();
function poolMods(d: PatchData, row: ItemBase): Mod[] {
  let list = poolCache.get(row);
  if (list) return list;
  const ids = new Set<string>();
  const pools = (row.pools ?? {}) as unknown as Record<string, { prefixes?: readonly string[]; suffixes?: readonly string[] } | undefined>;
  for (const name of ["normal", "desecrated", "essence", "otherworldly"]) for (const id of [...(pools[name]?.prefixes ?? []), ...(pools[name]?.suffixes ?? [])]) ids.add(id);
  // 特殊 MOD のルーン (コルの狩り等) を差すと出る MOD も (上位プレイヤーの装備には付いている)
  const rune = (row.pools as unknown as { rune?: Record<string, { prefixes?: readonly string[]; suffixes?: readonly string[] }> }).rune ?? {};
  for (const p of Object.values(rune)) for (const id of [...(p.prefixes ?? []), ...(p.suffixes ?? [])]) ids.add(id);
  list = [...ids].map((id) => d.mods.get(id)).filter((m): m is Mod => !!m);
  poolCache.set(row, list);
  return list;
}

/** MOD 自身の文面全体の鍵 (複合 MOD の 1 行では当てない時) */
const wholeKey = (m: Mod): string => matchKey((m.text ?? "").replace(/\(-?\d+(?:\.\d+)?--?\d+(?:\.\d+)?\)|-?\d+(?:\.\d+)?/g, "#"));
/** MOD 自身の文面の鍵 (数値・範囲は # に。複合 MOD は 1 行ずつも) */
const ownKeyCache = new WeakMap<Mod, Set<string>>();
function ownKeys(m: Mod): Set<string> {
  let s = ownKeyCache.get(m);
  if (s) return s;
  const text = (m.text ?? "").replace(/\(-?\d+(?:\.\d+)?--?\d+(?:\.\d+)?\)|-?\d+(?:\.\d+)?/g, "#");
  s = new Set([text, ...text.split(NL)].map((t) => matchKey(t)).filter(Boolean));
  ownKeyCache.set(m, s);
  return s;
}

const sideCache = new Map<string, "P" | "S" | null>();
/**
 * プレ / サフィ (エンジンの MOD の側。行で割れる時は多い方)。rows = その装備の行 (同じ文面でも装備で側が違う物がある:
 * 兜の冒涜のアーケインサージはサフィ、指輪の創生の樹の物はプレ)。引けなければ null
 */
export function engineSide(template: string, rows: readonly ItemBase[] = everyRow()): "P" | "S" | null {
  const k = `${rows.map((r) => r.id).join(",")}|${matchKey(template)}`;
  if (sideCache.has(k)) return sideCache.get(k)!;
  // 自身の文面で当たった物だけ (系統の今の文面の道は、エンジンに無い種類 (ハンドラップ等) の MOD を別の MOD に結びがち)
  // 文面全体で当たる MOD を先に (複合 MOD の 1 行だけの一致は、無い時だけ。ブーツのスタン閾値がアーマーとの複合のプレに当たっていた)
  const whole = engineModsFor(template, rows, { exactOnly: true, wholeOnly: true });
  const mods = whole.length ? whole : engineModsFor(template, rows, { exactOnly: true });
  const p = mods.filter((m) => m.type === "prefix").length, s = mods.filter((m) => m.type === "suffix").length;
  const v = p || s ? (p >= s ? "P" : "S") : null;
  sideCache.set(k, v);
  return v;
}

/** 日本語のテンプレート (`#`、エンジンの MOD の日本語)。複合 MOD・引けない物は null */
export function engineJaTemplate(template: string): string | null {
  const m = engineModsFor(template, everyRow(), { exactOnly: true })[0];
  if (!m?.text || m.text.includes(NL)) return null;
  const ja = jaOfMod(m);
  return ja && !ja.includes(NL) ? ja : null;
}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const fmtRange = (lo: number, hi: number): string => (lo === hi ? `${lo}` : `${lo}-${hi}`);

/**
 * 段の表 (T1 = 一番上)。その行で付く MOD の段 (重み > 0、エッセンスだけの物は全部) を画面の単位で。同じ範囲の段は 1 つに。
 * 複数値 (Adds # to #) の下限は平均値範囲の中央 (取引所は平均 1 本で照合する、前の tiers.ts と同じ決まり)
 */
export function engineTiers(template: string, rows: readonly ItemBase[], side?: "prefix" | "suffix", o: { special?: boolean } = {}): ModTierRow[] {
  const seen = new Set<string>();
  const list: Array<{ mins: number[]; maxs: number[]; level: number }> = [];
  // 「#% reduced …」は内部では負の値。poe.ninja・画面は正の数で出すので向きを揃える
  const flip = /\breduced\b/i.test(template);
  // 段は文面全体で当たる MOD だけ (複合 MOD の 1 行は別物)。普通の MOD があればそれだけ (同じ文面のエッセンス・冒涜の段を混ぜない)
  const found = engineModsFor(template, rows, { wholeOnly: true, exactOnly: true, ...(side ? { side } : {}), ...(o.special === false ? { special: false } : {}) });
  const normal = found.filter((m) => m.source === "normal");
  for (const m of normal.length ? normal : found) {
    const live = m.tiers.filter((t) => t.weight > 0);
    for (const t of live.length ? live : m.tiers) {
      const r = tierDisplayRanges(t).map((x) => (flip && x.every((v) => v <= 0) ? x.map((v) => -v) : x));
      if (!r.length) continue;
      const mins = r.map((x) => Math.min(x[0]!, x[1] ?? x[0]!)), maxs = r.map((x) => Math.max(x[0]!, x[1] ?? x[0]!));
      const sig = `${mins.join("/")}|${maxs.join("/")}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      list.push({ mins, maxs, level: t.ilvl });
    }
  }
  list.sort((a, b) => mean(b.mins) - mean(a.mins) || b.level - a.level);
  return list.map((r, i) => ({
    tier: i + 1,
    min: r.mins[0]!,
    max: r.maxs[0]!,
    mins: r.mins,
    maxs: r.maxs,
    filterMin: Math.floor((r.mins.length === 1 ? r.mins[0]! : (mean(r.mins) + mean(r.maxs)) / 2) * 100) / 100,
    level: r.level,
    label: `T${i + 1}: ${r.mins.map((lo, j) => fmtRange(lo, r.maxs[j]!)).join(" / ")}`,
  }));
}

/** 系統 (片方しか付かない組)。同じ系統の MOD は一緒に付かない */
export function engineGroups(template: string, rows: readonly ItemBase[] = everyRow()): string[] {
  return [...new Set(engineModsFor(template, rows).flatMap((m) => familyKeysOf(m)))];
}

/**
 * ゲームの stat id (段の stats)。取引所の id は trade2-stat-mapping で引く。rows = その装備の行 (同じ文面でも装備で local / global が違う)。
 * 文面全体で当たる MOD を先に、無ければ複合 MOD の 1 行
 */
export function engineStatIds(template: string, rows: readonly ItemBase[] = everyRow(), side?: "prefix" | "suffix"): string[] {
  const o = side ? { side } : {};
  const whole = engineModsFor(template, rows, { exactOnly: true, wholeOnly: true, ...o });
  for (const m of whole.length ? whole : engineModsFor(template, rows, { exactOnly: true, ...o })) {
    const stats = (m.tiers[0] as { stats?: readonly string[] } | undefined)?.stats;
    if (stats?.length) return [...stats];
  }
  return [];
}
