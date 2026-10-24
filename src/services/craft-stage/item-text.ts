/**
 * item-text.ts — 貼り付けたアイテムの文を読む (2026-10-20 ジン部長、入口 engine.ts の `parseItemText`)。形は item-text-types.ts。
 *
 * 土台は計算機の貼り付け (htc/paste-parse.ts の行の型・ベース名、paste-targets.ts の `targetsFor` = MOD と段の割り出し)。
 * ここで足したのは貼り付けの「形」の読み分け:
 *   - トレード / poe.ninja のコピーは区切り線も暗黙の印も無い → ベースの暗黙 (エンジンのベースの行 `implicits`) と照らして暗黙を分け、
 *     それより前の行 (ルーン・エンチャント・コラプトの暗黙) も暗黙側に置く。MOD に数えない。
 *   - 「コラプト / 二重コラプト」は状態として読む (MOD の数え方は変えない)。
 *   - 「W」「P」の行・`~b/o` の値段・品質の種類・未発現のプレ / サフィ・武器の基本値の行・付与スキル・ソケット。
 *   - Ctrl+Alt+C の `{ Prefix Modifier "名前" (Tier: 3) }` の見出し (側はここが正)、poe.ninja の行末の注記。
 */
import { baseInText, baseOfLine, matchModLine, noteOfLine, stripMarkers, type LineKind, type PastedItem, type PastedLine } from "../htc/paste-parse";
import { targetsFor } from "../htc/paste-targets";
import { htcBaseInfo } from "../htc/patch";
import { classOfBase, sideLimits } from "../htc/bridge";
import { catalystTagFromLabel, rawValue } from "../htc/quality";
import { matchKey } from "../htc/bridge-index";
import { tierDisplayRanges } from "../mods/stat-scale";
import { catalystBoosts, magnitudeTagOf } from "./stage-core";
import { RUNES, runeCategoryOf, runeEffectFor } from "./stage-runes";
import { matchCorruption } from "../mods/corruption";
import { anointOfLine } from "../mods/anoint";
import { unboost } from "./boosts";
import type { StageItem } from "./types";
import type { Mod, PatchData } from "../../vendor/poe2htc/engine/types";
import type { ItemTextBoost, ItemTextCorruption, ItemTextImplicit, ItemTextResult, ItemTextSkip, ItemTextSkipCode, ItemTextWords } from "./item-text-types";

const REASON: Readonly<Record<ItemTextSkipCode, ItemTextWords>> = {
  noBase: { ja: "ベースが分からない (MOD の置き場が決まらない)", en: "Unknown base type (the mod pool cannot be chosen)" },
  unknownText: { ja: "MOD の文として読めない", en: "Not recognised as a modifier" },
  notInPool: { ja: "このベースのクラフトの MOD に無い (コラプト・ユニーク・ドロップ限定など)", en: "Not a craftable modifier on this base (corruption, unique, drop-only…)" },
  dropOnly: { ja: "創生の樹などドロップ限定の MOD (クラフトでは付かない、枠は使う)", en: "Drop-only modifier (cannot be crafted, still takes an affix slot)" },
  hybridPart: { ja: "2 行で 1 つの MOD のもう 1 行 (1 つに数えた)", en: "Second line of a two-line modifier (counted once)" },
  flaskCharmUnsupported: { ja: "フラスコ・チャームは未対応", en: "Flasks and charms are not supported" },
  corruptionUnknown: { ja: "コラプトした物で、クラフトの MOD にも poe2db のコラプトの表にも無い (不明)", en: "Corrupted item: not a craftable modifier and not in poe2db's corruption list (unknown)" },
};
const skip = (line: string, code: ItemTextSkipCode): ItemTextSkip => ({ line, code, reason: REASON[code] });

const RARITY: Readonly<Record<string, ItemTextResult["rarity"]>> = {
  normal: "normal", magic: "magic", rare: "rare", unique: "unique",
  ノーマル: "normal", マジック: "magic", レア: "rare", ユニーク: "unique",
};
const CORRUPTED_ONCE = new Set(["Corrupted", "コラプト", "コラプト済み", "コラプト状態"]);
const CORRUPTED_TWICE = new Set(["Twice Corrupted", "二重コラプト"]);
const FLAGS = new Set(["Mirrored", "Fractured Item", "Unidentified", "Unmodifiable", "Sanctified", "Split", "ミラー", "未鑑定"]);
/** `{ Prefix Modifier "Razor-sharp" (Tier: 3) — … }` (ゲームの Ctrl+Alt+C)。Desecrated / Fractured が前に付く物も */
const GROUP = /^\{\s*(?:(?:Desecrated|Fractured|Crafted)\s+)?(Prefix|Suffix|Implicit|Unique|Corrupted|Enchant|Rune)\b[^"(}]*(?:"([^"]*)")?(?:\s*\(Tier:\s*(\d+)\))?/i;
const UNREVEALED = /^(?:Unrevealed\s.*\b(Prefix|Suffix)|未発現.*(プレフィックス|サフィックス))$/i;
/** `Label: value` / `ラベル：値`。MOD の行は (付与スキルを除いて) コロンを持たない */
const PROPERTY = /^([^:：]{1,40})[:：]\s*(.*)$/;

/** Ctrl+Alt+C の `45(30-45)` は振った値の後に段の幅。値だけ残す */
const stripRangeHint = (line: string): string => line.replace(/(\d+(?:\.\d+)?)\((?:-?\d+(?:\.\d+)?)(?:-(?:\d+(?:\.\d+)?))?\)/g, "$1");
/** フラスコ・チャームの種類の名前・ベース名 */
const FLASK_CHARM = /\b(?:Flasks?|Charms?)\b|フラスコ|チャーム$/i;
const bare = (t: string): string => stripMarkers(t).replace(/[0-9.()+\-%\s]+/g, "");

interface Body {
  line: string; text: string; note: LineKind | null;
  template: string | null; values: number[];
  side?: "prefix" | "suffix"; group?: "implicit" | "enchant" | "rune"; tierName?: string;
  /** トレードのサイトの段の表記 (行頭の「P6 」「S0 」、または P6 だけの行の次の行)。0 はエッセンス・完全エッセンス・合金 */
  tradeTier?: number;
}
/** トレードのサイトの段の表記: 「P6 文」「S0 文」、または「P6」だけの行 (2026-10-24 オーナーの見本、jp.pathofexile.com の画面) */
const TRADE_TIER = /^([PS])(\d+)(?:\s+(.+))?$/;

/**
 * アイテムの文を読む。data = loadHtcPatch() の物 (MOD・段はここから引く)。
 * 空や文でない物でも投げずに返す (base が null なら読めなかった)。
 */
export function parseItemText(data: PatchData, text: string): ItemTextResult {
  const raw = text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const out: ItemTextResult = {
    source: "unknown", lang: /[぀-ヿ一-鿿]/.test(text) ? "ja" : "en",
    name: null, base: null, cls: null, rarity: null, itemLevel: null, quality: null,
    implicits: [], mods: [], count: { prefix: 0, suffix: 0, limit: { prefix: 3, suffix: 3 } },
    corrupted: 0, flags: [], sockets: { count: null, runes: [] }, grants: [], properties: [], price: null, skipped: [],
  };
  let separators = false, gameHead = false, tradeMarks = false, noted = false, advanced = false;
  const names: string[] = [];
  /** 種類の名前 (Item Class: の値・トレードの「指輪」「Flask」の行) */
  const kindWords: string[] = [];
  const body: Body[] = [];
  const unrevealed: { line: string; side: "prefix" | "suffix" }[] = [];
  let group: Pick<Body, "side" | "group" | "tierName"> | null = null;
  let inBody = false;
  let tierNext: { side: "prefix" | "suffix"; tradeTier: number } | null = null;

  for (const line0 of raw) {
    // 段の表記 (P6・S0) は外して側と段に。表記だけの行は次の行に掛ける
    const tt = TRADE_TIER.exec(line0);
    const tier: { side: "prefix" | "suffix"; tradeTier: number } | null = tt ? { side: tt[1] === "P" ? "prefix" as const : "suffix" as const, tradeTier: Number(tt[2]) } : tierNext;
    if (tt && !tt[3]) { tierNext = tier; continue; }
    tierNext = null;
    const line = tt ? tt[3]! : line0;
    if (/^-{3,}$/.test(line)) { separators = true; group = null; continue; }
    if (/^[WP]$/.test(line)) { tradeMarks = true; continue; }
    const price = /^(?:Note:\s*)?~(?:b\/o|price)\s+(.+)$/i.exec(line);
    if (price) { out.price = price[1]!.trim(); tradeMarks = true; continue; }
    if (CORRUPTED_TWICE.has(line)) { out.corrupted = 2; continue; }
    if (CORRUPTED_ONCE.has(line)) { out.corrupted = Math.max(out.corrupted, 1) as 1 | 2; continue; }
    if (FLAGS.has(line)) { out.flags.push(line); continue; }
    const un = UNREVEALED.exec(line);
    if (un) { unrevealed.push({ line, side: /prefix|プレ/i.test(un[1] ?? un[2]!) ? "prefix" : "suffix" }); inBody = true; continue; }
    const g = GROUP.exec(line);
    if (g) {
      advanced = true; inBody = true;
      const w = g[1]!.toLowerCase();
      group = {
        ...(w === "prefix" || w === "suffix" ? { side: w } : {}),
        ...(w === "implicit" || w === "corrupted" ? { group: "implicit" as const } : w === "enchant" ? { group: "enchant" as const } : w === "rune" ? { group: "rune" as const } : {}),
        ...(g[2] ? { tierName: g[2] } : {}),
      };
      continue;
    }
    // 「Bonded: …」(アイドル・ルーンの絆の効果、poe.ninja は (rune) の印つき) はコロンがあっても属性ではなくルーンの行
    const prop = /^Bonded:/i.test(line) ? null : PROPERTY.exec(line);
    if (prop) {
      const [, label, value] = prop as unknown as [string, string, string];
      const l = label.trim();
      if (/^(Item Class|アイテムクラス)$/i.test(l)) { gameHead = true; kindWords.push(value.trim()); continue; }
      if (/^(Rarity|レアリティ)$/i.test(l)) { gameHead = true; out.rarity = RARITY[value.trim().toLowerCase()] ?? RARITY[value.trim()] ?? null; continue; }
      if (/^(Item Level|アイテムレベル)$/i.test(l)) { out.itemLevel = Number(/\d+/.exec(value)?.[0] ?? NaN) || null; inBody = true; continue; }
      if (/^(Quality|品質)/i.test(l)) {
        const q = /\+?(\d+)%/.exec(value);
        if (q) { out.quality = { value: Number(q[1]), tag: catalystTagFromLabel(l), label: l }; continue; }
      }
      if (/^(Grants Skill|スキルを付与)$/i.test(l)) { out.grants.push(value.replace(/^Level \d+\s+/i, "").trim()); continue; }
      if (/^(Sockets|ソケット)$/i.test(l)) { out.sockets.count = value.trim().split(/\s+/).filter(Boolean).length; continue; }
      if (/^(Requires|Requirements|必要)/i.test(l) || /^(Note)$/i.test(l)) continue;
      out.properties.push(line);
      continue;
    }
    if (!out.base) {
      // マジックはベースを接辞で挟んだ 1 行
      const b = baseOfLine(line) ?? (out.rarity === "magic" ? baseInText(line) : null);
      if (b) { out.base = b; continue; }
      if (!inBody) { names.push(line); continue; }
    }
    const { text: t, kind, noted: n } = noteOfLine(stripRangeHint(line));
    if (n) noted = true;
    const hit = matchModLine(t);
    // ベースの後・属性の前の型に当たらない行は種類の名前 (「指輪」「Ring」)
    if (!inBody && !hit && !kind) { kindWords.push(t); continue; }
    inBody = true;
    body.push({ line, text: t, note: kind, template: hit?.template ?? null, values: hit?.values ?? [], ...(group ?? {}), ...(tier ?? {}) });
  }

  if (!out.base) {
    // レアリティの行が無いマジック (トレードのコピー)
    for (const n of names) { const b = baseInText(n); if (b) { out.base = b; out.rarity ??= "magic"; break; } }
  }
  if (out.rarity === "magic") names.length = 0;
  out.source = advanced ? "game-advanced" : noted ? "ninja" : tradeMarks && !gameHead ? "trade" : separators || gameHead ? "game" : "unknown";
  out.name = names.length ? names[names.length - 1]! : null;
  if (!out.rarity && out.name) out.rarity = "rare";

  // フラスコ・チャームはエンジンに無い (オーナー 10-20 決定)。種類の名前の行・ベース名で見分け、行は全部「未対応」で返す
  // ベースが引けなかった時だけ名前の行も見る (レアの名前に「Charm」が付くことがあるため)
  if ([...kindWords, ...(out.base ? [out.base.en] : names)].some((w) => FLASK_CHARM.test(w))) {
    out.base = null;
    out.skipped.push(...body.map((b) => skip(b.line, "flaskCharmUnsupported")));
    return out;
  }
  if (!out.base) {
    out.skipped.push(...body.map((b) => skip(b.line, "noBase")));
    return out;
  }
  out.cls = htcBaseInfo()[out.base.en]?.cls ?? classOfBase(data, out.base.en)?.id ?? null;
  out.count.limit = sideLimits(data, out.base.en);

  const explicit = splitImplicits(data, out, body);
  readMods(data, out, explicit);
  for (const u of unrevealed) {
    out.mods.push({ text: u.line, modId: null, source: "desecrated", side: u.side, sideFrom: "paste", tier: null, values: [], shownValues: [], boosts: [], fractured: false, desecrated: true, crafted: false, unrevealed: true });
  }
  for (const m of out.mods) if (m.side) out.count[m.side]++;
  return out;
}

/** 暗黙側の行を out.implicits に移し、残り (明示の MOD の候補) を返す */
function splitImplicits(data: PatchData, out: ItemTextResult, body: Body[]): Body[] {
  const implicit = (b: Body, from: ItemTextImplicit["from"]): void => {
    out.implicits.push({ text: b.text, from, template: b.template, values: b.values, ...(from === "corruption" ? { corruption: corruptionOf(out, b) } : {}) });
    if (from === "rune") out.sockets.runes.push(b.text);
  };
  // 注油 (Allocates <ノータブル>) はどの形でもエンチャント (アミュレットの注油、mods/anoint.ts の一覧と同じ名前の時だけ)
  body = body.filter((b) => { if (!anointOfLine(b.text)) return true; implicit(b, "enchant"); return false; });
  const rest: Body[] = [];
  const marked = body.some((b) => b.note || b.group || b.side);
  // トレードのサイトの段の表記がある時は、表記の無い行は暗黙側 (サイトは明示の MOD にだけ P・S を付ける)
  const tiered = body.some((b) => b.tradeTier !== undefined);
  if (marked) {
    // 注記・見出しがあれば推し量らない
    for (const b of body) {
      const g = b.group ?? (b.note === "implicit" ? "implicit" : b.note === "rune" ? "rune" : b.note === "enchant" ? "enchant" : tiered && b.tradeTier === undefined && !b.note ? "implicit" : null);
      if (g) implicit(b, g === "implicit" ? "base" : g);
      else rest.push(b);
    }
    return rest;
  }
  // 印が無い: ベースの暗黙 1 つにつき 1 行 (同じ文の明示の MOD を巻き込まない)。最後に当たった暗黙より前の行も暗黙側 (ルーン・エンチャント・コラプトの暗黙)
  // 同じ名前の別物 (implicitVariants) は、貼り付けの行に一番多く当たる組を使う
  const info = htcBaseInfo()[out.base!.en];
  const sets = [info?.implicits ?? [], ...(info?.implicitVariants ?? [])];
  const hits = (set: ReadonlyArray<{ en: string; ja: string }>): number => set.filter((im) => body.some((b) => bare(b.text) === bare(im.en) || bare(b.text) === bare(im.ja))).length;
  const chosen = sets.reduce((best, set) => (hits(set) > hits(best) ? set : best), sets[0]!);
  const quota = new Map<string, number>();
  for (const im of chosen) {
    for (const k of new Set([bare(im.en), bare(im.ja)])) quota.set(k, (quota.get(k) ?? 0) + 1);
  }
  const isBase: boolean[] = body.map((b) => {
    const k = bare(b.text);
    const left = quota.get(k) ?? 0;
    if (left <= 0) return false;
    quota.set(k, left - 1);
    return true;
  });
  const last = isBase.lastIndexOf(true);
  // 暗黙より前の行: 差したルーン・ソウルコアの効果 (ソケットの数だけ値が足される) と文が同じなら rune。
  // 残りはコラプトした物ならエンチャント (コラプトの結果は poe2db の Vaal Orb で Corrupted Enchantment)、それ以外は見分けられない (extra)
  const cls = classOfBase(data, out.base!.en);
  const cat = cls ? runeCategoryOf({ base: out.base!.en, cls }) : null;
  const runeTexts = new Set(cat ? Object.values(RUNES).flatMap((r) => { const e = runeEffectFor(r, cat); return e ? [bare(e.en), bare(e.ja)] : []; }) : []);
  body.forEach((b, i) => {
    if (isBase[i]) implicit(b, "base");
    else if (i < last) implicit(b, runeTexts.has(bare(b.text)) ? "rune" : out.corrupted > 0 ? "corruption" : "extra");
    else rest.push(b);
  });
  return rest;
}

/**
 * 明示の MOD の候補を、計算機と同じ繋ぎ方 (targetsFor) でエンジンの MOD に直し、段は打つ処理の表示の式を割り戻して引く。
 * 表示 = floor(素 × (1 + (品質 + 反対側の「側の効果」) / 100))。品質が効くかはクラフト台の catalystBoosts (指輪・アミュレットは MOD のタグ、ジュエルは中身のタグ)。
 */
function readMods(data: PatchData, out: ItemTextResult, rows: Body[]): void {
  const lines: PastedLine[] = [];
  const used: Body[] = [];
  for (const b of rows) {
    if (!b.template) { out.skipped.push(skip(b.line, "unknownText")); continue; }
    lines.push({ kind: b.note ?? "explicit", text: b.text, template: b.template, values: b.values });
    used.push(b);
  }
  const item: PastedItem = {
    baseType: out.base!.en, baseText: out.base!.ja, itemLevel: out.itemLevel, quality: out.quality?.value ?? null,
    catalystTag: out.quality?.tag ?? null, lines, unmatched: [], grantedSkill: null, annotated: true, corrupted: out.corrupted > 0,
  };
  const t = targetsFor(data, item);
  const taken = new Set<number>();
  const dropOnly = new Set(t.dropOnly.map((d) => d.text));
  const picked: { b: Body; mod: Mod; fixed?: { index: number; fits: boolean } }[] = [];
  const pick = (b: Body, i: number, aldur: boolean): void => {
    taken.add(i);
    const target = t.targets[i]!;
    let mod: Mod | undefined = data.mods.get(target.modId);
    if (!mod) return;
    // Ctrl+Alt+C の見出しの側が正。違えば同じ文の反対側の MOD に付け替える
    if (b.side && mod.type !== b.side) {
      const cls = mod.id.split("/")[0];
      const twin = [...data.mods.values()].find((x) => x.id.split("/")[0] === cls && x.type === b.side && x.source === mod!.source && x.text === mod!.text);
      if (twin) mod = twin;
    }
    // アルダーで重ねた 1 行は値が合計なので、段は targetsFor の割り方のまま
    picked.push({ b, mod, ...(aldur ? { fixed: { index: target.minTierIndex ?? 0, fits: t.fits?.[i] ?? true } } : {}) });
  };
  for (const b of used) {
    const i = t.texts.findIndex((x, k) => !taken.has(k) && x === b.text);
    if (i >= 0) { pick(b, i, false); continue; }
    if (t.aldur && t.aldur.text === b.text) {
      t.texts.forEach((x, k) => { if (!taken.has(k) && x.endsWith("(アルダーで重ねる)")) pick(b, k, true); });
      continue;
    }
    if (dropOnly.has(b.text)) { out.skipped.push(skip(b.line, "dropOnly")); continue; }
    if (!t.skipped.includes(b.text)) { out.skipped.push(skip(b.line, "hybridPart")); continue; }
    // 置き場の索引に無い (液化した感情の MOD など、プールではなく別の表で付く物)。同じクラスのエンジンの MOD を文で引く
    const k = matchKey(b.template!);
    const any = out.cls ? [...data.mods.values()].find((m) => m.id.startsWith(out.cls + "/") && matchKey(m.text ?? "") === k) : undefined;
    if (any) picked.push({ b, mod: any });
    else if (out.corrupted > 0) {
      // コラプトした物: コラプトの表にあれば暗黙側 (コラプトの行)、無ければ不明
      const c = corruptionOf(out, b);
      if (c.status === "table") out.implicits.push({ text: b.text, from: "corruption", template: b.template, values: b.values, corruption: c });
      else out.skipped.push(skip(b.line, "corruptionUnknown"));
    } else out.skipped.push(skip(b.line, "notInPool"));
  }

  const level = out.itemLevel ?? 100;
  const stub = { base: out.base!.en } as StageItem;
  const sideEffect = (side: string): number => picked
    .filter((p) => p.mod.type !== side && p.mod.id.endsWith(side === "prefix" ? "PrefixEffect" : "SuffixEffect"))
    .reduce((a, p) => a + (p.b.values[0] ?? 0), 0);
  /** その MOD に掛かっている上乗せ (品質の種類・反対側の効果、boosts.ts と同じ決まり) */
  const boostsFor = (m: Mod, b: Body): ItemTextBoost[] => {
    const side = m.type === "prefix" || m.type === "suffix" ? m.type : (b.side ?? null);
    const out2: ItemTextBoost[] = [];
    if (out.quality && out.quality.tag && catalystBoosts(stub, { modId: m.id, tags: m.tags }, out.quality.tag, data)) out2.push({ kind: "quality", pct: out.quality.value });
    const se = side ? sideEffect(side) : 0;
    if (se > 0) out2.push({ kind: "sideEffect", pct: se });
    // ルーンの「明示 ○○ MOD の強さが N% 増加」(stage-core の magnitudePct と同じ決まり: その種類のタグを持つ明示 MOD に、自分自身には掛けない)
    const mg = picked.filter((p) => p.mod !== m).reduce((a, p) => {
      const tag = magnitudeTagOf((p.mod.tiers[0] as { stats?: string[] } | undefined)?.stats?.[0]);
      return tag && (m.tags ?? []).includes(tag) ? a + (p.b.values[0] ?? 0) : a;
    }, 0);
    if (mg > 0) out2.push({ kind: "magnitude", pct: mg });
    return out2;
  };
  const pctOf = (bs: readonly ItemTextBoost[]): number => bs.reduce((a, x) => a + x.pct, 0);
  // 「30% 減少する」(reduced) は文では正の数、MOD の段の値は負 (-30)。段の値が全部 0 以下なら文の数を負にして比べる (2026-10-24 タリスマンの要求能力値が段に収まらなかった)
  const signed = (m: Mod, vs: readonly number[]): number[] => (m.tiers.length && m.tiers.every((t) => t.ranges.every(([, hi]) => hi <= 0)) ? vs.map((v) => (v > 0 ? -v : v)) : [...vs]);
  const tierWith = (m: Mod, b: Body): { index: number; fits: boolean } =>
    // エッセンスの段はエッセンスの強さで決まり、アイテムレベルの縛りは無い (パーフェクトのエッセンスの段も同じ)
    tierOf(m, signed(m, b.values), pctOf(boostsFor(m, b)), /essence/.test(String(m.source)) ? Infinity : level);
  for (const pk of picked) {
    const { b, fixed } = pk;
    let mod = pk.mod;
    let t = fixed ?? tierWith(mod, b);
    // トレードの段 0 はエッセンス・完全エッセンス・合金の MOD: 値の幅で普通の MOD に読まず、同じクラスの同じ文のエッセンスの MOD を先に (収まる物から)
    if (!fixed && b.tradeTier === 0 && !/essence/.test(String(mod.source))) {
      const cls = mod.id.split("/")[0], text = mod.text;
      const ess = [...data.mods.values()].filter((x) => x.id.split("/")[0] === cls && x.text === text && /essence/.test(String(x.source)) && (!b.side || x.type === b.side))
        .map((x) => ({ x, tx: tierWith(x, b) })).sort((p, q) => Number(q.tx.fits) - Number(p.tx.fits));
      if (ess[0]) { mod = ess[0].x; t = ess[0].tx; }
    }
    // 値が段に収まらない時は、同じクラスの同じ文の別の MOD (エッセンス・冒涜・反対側) を見る。印が (crafted) ならエッセンス、(desecrated) なら冒涜を先に
    if (!fixed && !t.fits) {
      const cls = mod.id.split("/")[0];
      const want = b.note === "crafted" ? /essence/ : b.note === "desecrated" ? /desecrated/ : /^$/;
      const twins = [...data.mods.values()].filter((x) => x.id !== mod.id && x.id.split("/")[0] === cls && x.text === mod.text)
        .sort((x, y) => Number(want.test(String(y.source))) - Number(want.test(String(x.source))));
      for (const x of twins) { const tx = tierWith(x, b); if (tx.fits) { mod = x; t = tx; break; } }
    }
    const side = mod.type === "prefix" || mod.type === "suffix" ? mod.type : (b.side ?? null);
    const { index, fits } = t;
    const boosts = fixed ? [] : boostsFor(mod, b);
    out.mods.push({
      text: b.text, modId: mod.id, source: String(mod.source ?? "normal"), side, sideFrom: b.side ? "paste" : "engine",
      tier: { index, of: mod.tiers.length, label: `T${mod.tiers.length - index}`, name: String(mod.tiers[index]?.name ?? ""), fits },
      values: unboost(signed(mod, b.values), pctOf(boosts)), shownValues: [...b.values], boosts,
      fractured: b.note === "fractured", desecrated: b.note === "desecrated" || mod.source === "desecrated", crafted: b.note === "crafted",
      unrevealed: false,
      ...(out.corrupted > 0 && !fits ? { corruption: { status: "unknown" as const } } : {}),
      ...(b.tierName ? { pasteTierName: b.tierName } : {}),
      ...(b.tradeTier !== undefined ? { pasteTier: b.tradeTier } : {}),
    });
  }
}

/**
 * 値が収まる段 (上から見て、帯が段の幅と重なる一番上)。pct > 0 なら表示は切り捨てなので素は [割り戻し(表示), 割り戻し(表示 + 1)) の帯。
 * どこにも収まらなければ、その ilvl で出る一番上の段で fits = false (計算機の tierMatch / tierFallback と同じ選び方)
 */
function tierOf(mod: Mod, shown: readonly number[], pct: number, level: number): { index: number; fits: boolean } {
  const lo = pct > 0 ? shown.map((v) => rawValue(v, pct)) : shown;
  const hi = pct > 0 ? shown.map((v) => rawValue(v + 1, pct) - 1e-9) : shown;
  for (let i = mod.tiers.length - 1; i >= 0; i--) {
    const tier = mod.tiers[i]!;
    if (tier.ilvl > level) continue;
    const ranges = tierDisplayRanges(tier);
    // 幅の無い段 (エッセンスの「+20% to Maximum Quality」のように値が文に入った物) は文の数字と比べる
    if (ranges.length === 0) {
      const nums = (mod.text ?? "").match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      if (nums.length === shown.length && nums.every((n, k) => n === shown[k])) return { index: i, fits: true };
      continue;
    }
    if (ranges.length !== lo.length) continue;
    if (ranges.every((r, k) => hi[k]! >= Number(r[0]) && lo[k]! <= Number(r[1]))) return { index: i, fits: true };
  }
  for (let i = mod.tiers.length - 1; i >= 0; i--) if ((mod.tiers[i]?.ilvl ?? 0) <= level) return { index: i, fits: false };
  return { index: mod.tiers.length - 1, fits: false };
}

/** 1 行をそのクラスのコラプトの表 (エンジン部の mods/corruption.ts、poe2db) と照らす。無ければ unknown */
function corruptionOf(out: ItemTextResult, b: Body): ItemTextCorruption {
  const hit = out.cls ? matchCorruption(out.cls, b.text, b.template, b.values) : null;
  if (!hit) return { status: "unknown" };
  return { status: "table", kind: hit.row.kind, id: hit.row.id, range: hit.row.ranges, fits: hit.fits };
}

