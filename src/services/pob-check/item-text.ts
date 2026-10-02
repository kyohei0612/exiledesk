/**
 * item-text.ts — ゲームでコピーしたアイテムの文面 (日本語 / 英語) → PoB が読める文面 (2026-10-02 火力チェックの装備の差し替え)
 *
 * 英語のコピー (Item Class: / Rarity: のある物) は PoB がそのまま読めるので素通し。
 * 日本語のコピーは 1 行ずつ英語にする:
 *   - MOD の行: ゲームの stat_descriptions の日本語と英語の組 (src/i18n/mod-lines-ja-en.json、scripts/build-mod-lines-ja-en.mjs)
 *   - ベース名: items-ja-client.json (逆引き) のうち **PoB の itemBases にある物だけ** (src/data/pob-item-bases.json、
 *     scripts/build-pob-item-bases.mjs。通貨・ジェム・マップが混ざると「ゴールドアミュレット」の中の「ゴールド」= 通貨を拾う)。
 *     日本語が同じベース (神秘の装束 = Arcane Raiment / Mystic Raiment) は アイテムクラス・要求レベル・防御値で絞り、絞れなければ `ambiguous` に候補を出す
 *   - ユニーク名: unique-names-ja.json (逆引き)
 *   - 区切り線で塊に分け、アイテムレベルより後の塊を MOD の塊とみる。分類は **注記が有る時は注記で、無い時は塊の順で** (どちらも実物にある:
 *     オーナーの 2026-09-22 のコピーには注記が無い、取引所の日本語には " (rune)" " (implicit)" が付く)。
 *     塊の順: **最後の塊が明示 MOD、それより前は暗黙** (ノーマルは全部暗黙)。ただし行が全部ルーンの効果 (絆 / ルーンの表の文面そのまま) の塊は
 *     位置に関わらずルーンとみて、順の数には入れない (ルーンの塊が明示より後ろに来ても明示が暗黙に化けないように)
 *   - 塊を捨てるのは**フレーバーテキストだと分かる時だけ** (ユニークで、数字が 1 つも無く、どの行も辞書に当たらない / フレーバーの辞書にある行)。
 *     それ以外の当たらなかった行は `unread` に出し、塊は残して分類に数える (黙って捨てると塊の数が減って暗黙が明示に化けた)
 *   - 物理ダメージ・アーマー・要求などの性能の塊は入れない (PoB がベースと MOD から計算し直す)
 */
import itemsJaClient from "../../i18n/items-ja-client.json";
import itemsJa from "../../i18n/items-ja.json";
import skillsJaClient from "../../i18n/skills-ja-client.json";
import uniqueNamesJa from "../../i18n/unique-names-ja.json";
import rareNamesJa from "../../i18n/rare-names-ja.json";
import flavourJa from "../../i18n/poe2-flavour-ja.json";
import pobBases from "../../data/pob-item-bases.json";
import stageRunes from "../craft-stage/stage-runes.json";
import { CATALYSTS, catalystTagFromLabel } from "../htc/quality";
import { gemJa } from "./api";

export interface ItemLine {
  ja: string;
  en: string;
  /** implicit / rune / enchant は暗黙側 (PoB の Implicits: に数える)。fractured / desecrated / crafted / mutated は明示側で PoB の {fractured} 等の印 */
  kind: "implicit" | "explicit" | "rune" | "enchant" | "fractured" | "desecrated" | "crafted" | "mutated";
}
export interface ConvertedItem {
  /** PoB に渡す文面 */
  text: string;
  /** 画面に出す名前 (貼られたままの表記) */
  name: string;
  /** ベース名 (英語) */
  base: string | null;
  /** 日本語のベース名が複数の英語に当たり、文面で絞れなかった時の候補 (英語名、先頭を `base` に使っている)。絞れた時は空 */
  ambiguous: string[];
  rarity: string;
  /** 英語のコピーで、そのまま渡した */
  english: boolean;
  /** 未鑑定 (明示 MOD が無いので PoB には暗黙だけ渡す) */
  unidentified: boolean;
  lines: ItemLine[];
  /** 英語にできなかった MOD の塊の行 (計算に入らない) */
  unread: string[];
}

const NL = String.fromCharCode(10);
const BS = String.fromCharCode(92);
const RE_SPECIAL = ".*+?^${}()|[]" + BS;
const esc = (s: string): string => [...s].map((c) => (RE_SPECIAL.includes(c) ? BS + c : c)).join("");
const NUM = "([+-]?[0-9]+(?:" + BS + ".[0-9]+)?)";
const PH = /\{(\d*)(?::([^}]*))?\}/g;
/** 型の中の数字と、その直前の符号の文字 (「受け流し力 -{0}」の「-」。数字に付けて出す) */
const PH_SIGNED = /([+-])?\{(\d*)(?::([^}]*))?\}/g;

interface LinePattern {
  re: RegExp;
  /** 正規表現の何番目の数字が {n} か */
  order: number[];
  en: string;
  /** 一番長い文字の切れ端 (先に includes で絞る) */
  lit: string;
}

const patterns: Partial<Record<"ja" | "en", LinePattern[]>> = {};
/** from = 読む側の言語。"ja" なら日本語の行 → 英語、"en" なら英語の行 (PoB の表示) → 日本語 */
async function linePatterns(from: "ja" | "en" = "ja"): Promise<LinePattern[]> {
  const cached = patterns[from];
  if (cached) return cached;
  const raw = (await import("../../i18n/mod-lines-ja-en.json")).default as Array<[string, string]>;
  const pairs = from === "ja" ? raw : raw.map(([j, e]) => [e, j] as [string, string]);
  const out: LinePattern[] = [];
  const seen = new Set<string>();
  for (const [ja, en] of pairs) {
    if (seen.has(ja)) continue;
    seen.add(ja);
    const order: number[] = [];
    const lits: string[] = [];
    let src = "^";
    let last = 0;
    let seq = 0;
    for (const m of ja.matchAll(PH)) {
      let lit = ja.slice(last, m.index);
      // 数字の直前の「-」「+」は符号 (「静止中の混沌耐性 -{0}%」)。型の文字に残すと NUM の [+-]? より先に食われて符号が落ちるので、数字側に寄せる
      if (/[+-]$/.test(lit)) lit = lit.slice(0, -1);
      lits.push(lit);
      src += esc(lit) + NUM;
      order.push(m[1] === "" ? seq : Number(m[1]));
      seq++;
      last = m.index! + m[0].length;
    }
    const tail = ja.slice(last);
    lits.push(tail);
    src += esc(tail) + "$";
    out.push({ re: new RegExp(src), order, en, lit: lits.reduce((a, b) => (b.length > a.length ? b : a), "") });
  }
  // 文字の多い型を先に (「{0}」だけの様な緩い型に先に当たらないように)
  out.sort((a, b) => b.lit.length - a.lit.length);
  patterns[from] = out;
  return out;
}

/** PoB の英語の行 → 日本語 (画面に出す用)。当たらない行は英語のまま */
export async function linesToJa(lines: string[]): Promise<string[]> {
  if (!lines.length) return [];
  const pats = await linePatterns("en");
  const one = (l: string): string | null => {
    const hit = lineToEn(l, pats);
    if (hit) return hit;
    // 「Has 3 Charm Slots」: 説明の型は単数形 (Charm Slot) しか持っていない
    if (l.endsWith("s")) return lineToEn(l.slice(0, -1), pats);
    // 「Passives in Radius of Blackflame Covenant can be …」: 型はジュエルの名前を含まない
    const of = /^(.+? in Radius) of .+? (can|also|have|are|gain) (.+)$/.exec(l);
    if (of) return lineToEn(`${of[1]} ${of[2]} ${of[3]}`, pats);
    return null;
  };
  return lines.map((l) => {
    // ルーンの「絆」(PoB は Bonded: を頭に付ける)
    const bonded = /^Bonded:\s*(.+)$/.exec(l);
    if (bonded) return `絆: ${one(bonded[1]!) ?? bonded[1]}`;
    // ゲームの表記 (ClientStrings ItemDisplayGrantedSkill「スキルを付与: レベル {1} {0}」/ NoScaling「付与するスキル: {0}」)
    const gs = /^Grants Skill:\s*(?:Level (\d+) )?(.+)$/.exec(l);
    if (gs) return gs[1] ? `スキルを付与: レベル ${gs[1]} ${gemJa(gs[2]!)}` : `付与するスキル: ${gemJa(gs[2]!)}`;
    return one(l) ?? l;
  });
}

/** 日本語の 1 行 → 英語の 1 行。当たらなければ null */
function lineToEn(line: string, pats: LinePattern[]): string | null {
  for (const p of pats) {
    if (p.lit && !line.includes(p.lit)) continue;
    const m = p.re.exec(line);
    if (!m) continue;
    const byIndex = new Map<number, string>();
    p.order.forEach((n, i) => byIndex.set(n, m[i + 1]!));
    let seq = 0;
    return p.en.replace(PH_SIGNED, (_s, sign: string | undefined, idx: string, fmt?: string) => {
      const n = idx === "" ? seq : Number(idx);
      seq++;
      const raw = byIndex.get(n) ?? "0";
      const neg = raw.startsWith("-");
      const abs = raw.replace(/^[+-]/, "");
      // 型に符号の文字がある時 (「-{0} to Deflection Rating」「レベル +{0}」) はそれを使い、負の値なら「-」だけ (「--15」「+-5」にしない)
      if (sign) return (neg ? "-" : sign) + abs;
      if (neg) return "-" + abs;
      return fmt?.includes("+") ? "+" + abs : abs;
    });
  }
  return null;
}

// ---- ベース ----
interface PobBase {
  type: string;
  level?: number;
  armour?: number;
  evasion?: number;
  es?: number;
  ward?: number;
}
const POB_BASES = (pobBases as { bases: Record<string, PobBase>; classes: Record<string, string> }).bases;
/** 文面の「アイテムクラス: 鎧」→ PoB の type */
const POB_TYPE_BY_CLASS_JA = (pobBases as { classes: Record<string, string> }).classes;

/** 日本語のベース名 → 英語の候補 (PoB の itemBases にある物だけ。辞書の順) */
const baseCandidatesByJa: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const dict of [itemsJaClient, itemsJa] as Record<string, string>[]) {
    for (const [en, ja] of Object.entries(dict)) {
      if (!(en in POB_BASES)) continue;
      const list = m.get(ja);
      if (!list) m.set(ja, [en]);
      else if (!list.includes(en)) list.push(en);
    }
  }
  return m;
})();
const uniqueEnByJa: Map<string, string> = new Map(Object.entries(uniqueNamesJa as Record<string, string>).map(([en, ja]) => [ja, en]));

/** 名前の行からベースの候補 (英語)。マジックは「接頭 + ベース + 接尾」なので中に含まれる一番長いベース名 */
function findBaseCandidates(nameLines: string[]): string[] {
  for (let i = nameLines.length - 1; i >= 0; i--) {
    const exact = baseCandidatesByJa.get(nameLines[i]!);
    if (exact) return exact;
  }
  let best: [string, string[]] | null = null;
  for (const line of nameLines) for (const [ja, ens] of baseCandidatesByJa) if (ja.length >= 2 && line.includes(ja) && (!best || ja.length > best[0].length)) best = [ja, ens];
  return best?.[1] ?? [];
}

/** 文面から読めた、ベースを絞る手がかり */
interface BaseHints {
  /** 「アイテムクラス: 鎧」の日本語 */
  classJa: string | null;
  /** 「装備要求」の「レベル: 73」。MOD で上がることはあっても下がることは無いので、ベースの要求レベルはこれ以下 */
  reqLevel: number | null;
  /** 「アーマー: 138」など。品質と MOD で増えることはあっても素の値より下がることは無い */
  defence: Partial<Record<"armour" | "evasion" | "es" | "ward", number>>;
}

/** 防御値の行 (ClientStrings ItemDisplayArmour*: アーマー / 回避力 / エナジーシールド / ルーンワード) → PoB の armour の鍵 */
const DEFENCE_KEY: Record<string, keyof BaseHints["defence"]> = { アーマー: "armour", 回避力: "evasion", エナジーシールド: "es", ルーンワード: "ward" };

/**
 * 日本語が同じ複数のベースを、文面の手がかりで絞る。
 * 手がかりごとに「残る候補が 1 つ以上なら絞り込む、0 になるなら その手がかりは使わない」(手がかりの読み違いで全滅させない)
 */
function narrowBases(cands: string[], h: BaseHints): string[] {
  let cur = cands;
  const apply = (keep: (b: PobBase) => boolean): void => {
    const next = cur.filter((n) => keep(POB_BASES[n]!));
    if (next.length) cur = next;
  };
  if (cur.length <= 1) return cur;
  const type = h.classJa ? POB_TYPE_BY_CLASS_JA[h.classJa] : undefined;
  if (type) apply((b) => b.type === type);
  if (h.reqLevel != null) apply((b) => (b.level ?? 0) <= h.reqLevel!);
  const kinds = ["armour", "evasion", "es", "ward"] as const;
  if (kinds.some((k) => h.defence[k] != null)) {
    // 防御の種類が合う (ES のベースなのにエナジーシールドの行が無い物は違う) + 素の値が文面の値を超えない
    apply((b) => kinds.every((k) => !b[k] || (h.defence[k] != null && b[k]! <= h.defence[k]!)));
  }
  return cur;
}

// ---- レアの名前 ----
const RARE = rareNamesJa as { prefix: Record<string, string>; suffix: Record<string, string> };
const rarePrefixEn = new Map(Object.entries(RARE.prefix).map(([e, j]) => [j, e]));
const rareSuffixEn = new Map(Object.entries(RARE.suffix).map(([e, j]) => [j, e]));
/** レアの名前 英語 → 日本語 ("Vengeance Spur" → "復讐の拍車")。言葉が辞書に無ければ null */
export function rareNameJa(en: string): string | null {
  const words = en.split(" ");
  for (let k = 1; k < words.length; k++) {
    const p = RARE.prefix[words.slice(0, k).join(" ")];
    const s = RARE.suffix[words.slice(k).join(" ")];
    if (p && s) return p + s;
  }
  return null;
}
/** レアの名前 日本語 → 英語 ("亀裂のあるポスト" → "Rift Post") */
export function rareNameEn(ja: string): string | null {
  for (let k = 1; k < ja.length; k++) {
    const p = rarePrefixEn.get(ja.slice(0, k));
    const s = rareSuffixEn.get(ja.slice(k));
    if (p && s) return `${p} ${s}`;
  }
  return null;
}

// ---- スキル付与 ----
/** スキル名 日本語 → 英語 (gemJa の逆。items-ja-client.json にジェムも入っている、skills-ja-client.json はスキル名) */
const skillEnByJa: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const dict of [itemsJaClient, skillsJaClient] as Record<string, string>[]) for (const [en, ja] of Object.entries(dict)) if (!m.has(ja)) m.set(ja, en);
  return m;
})();
/**
 * ゲームの表記 (ClientStrings ItemDisplayGrantedSkill「スキルを付与: レベル {1} {0}」/ ItemDisplayGrantedSkillNoScaling「付与するスキル: {0}」) と、
 * 以前 linesToJa が作っていた「スキル付与: 名前 Lv N」。PoB が読むのは Item.lua の `Grants Skill: Level N <英語名>`
 */
const GRANTS_SKILL = /^(?:スキルを付与|スキル付与|付与するスキル)[:：]\s*(?:レベル\s*(\d+)\s*)?(.+?)(?:\s*Lv\s*(\d+))?$/;
function grantsSkillToEn(line: string): string | null {
  const m = GRANTS_SKILL.exec(line);
  if (!m) return null;
  const en = skillEnByJa.get(m[2]!.trim());
  if (!en) return null;
  const level = m[1] ?? m[3];
  return level ? `Grants Skill: Level ${level} ${en}` : `Grants Skill: ${en}`;
}

// ---- 行の分類 ----
const RARITY: Record<string, string> = { ノーマル: "Normal", マジック: "Magic", レア: "Rare", ユニーク: "Unique" };
/** 行末の注記 (取引所の日本語は英語のまま、ClientStrings の日本語は 暗黙モッド / フラクチャー / 冒涜 / クラフト / エンハンス) → 種類 */
const NOTE_KIND: Array<[RegExp, ItemLine["kind"]]> = [
  [/implicit|固有|暗黙/i, "implicit"],
  [/rune|ルーン/i, "rune"],
  [/enchant|エンチャント|エンハンス/i, "enchant"],
  [/fractured|フラクチャー/i, "fractured"],
  [/desecrated|冒涜/i, "desecrated"],
  [/crafted|クラフト/i, "crafted"],
  [/mutated|ミューテート/i, "mutated"],
];
/**
 * 詳細コピー (Ctrl+Alt+C) の MOD の見出し `{ プレフィックスモッド「名前」 (ティア: 3) — ライフ }` → 続く行の種類。
 * ClientStrings ModDescriptionLine*: 暗黙モッド / ユニークモッド / プレフィックスモッド / サフィックスモッド / フラクチャー {0} / 冒涜 {0} / クラフト {0} / エンハンス
 */
function headerKind(header: string): ItemLine["kind"] {
  if (/フラクチャー|fractured/i.test(header)) return "fractured";
  if (/冒涜|desecrated/i.test(header)) return "desecrated";
  if (/クラフト|crafted/i.test(header)) return "crafted";
  if (/ミューテート|mutated/i.test(header)) return "mutated";
  if (/ルーン|rune/i.test(header)) return "rune";
  if (/エンハンス|enchant/i.test(header)) return "enchant";
  if (/暗黙|implicit/i.test(header)) return "implicit";
  return "explicit";
}
/** 暗黙側 (PoB の Implicits: に数える) か */
const isImplicitSide = (k: ItemLine["kind"]): boolean => k === "implicit" || k === "rune" || k === "enchant";
/** PoB の行頭の印 (Item.lua の lineFlags。implicit は位置で分かるので印なし) */
const LINE_FLAG: Partial<Record<ItemLine["kind"], string>> = { rune: "{rune}", enchant: "{enchant}", fractured: "{fractured}", desecrated: "{desecrated}", crafted: "{crafted}", mutated: "{mutated}" };

/**
 * MOD でない説明の行 (ClientStrings ItemDescriptionFlask / FlaskUtility1 / PassiveJewel / AbyssJewel / ItemPopupRefillFlaskReminder、メモ)。
 * アイテムレベルより後ろに来るので、MOD の塊に数えると明示が暗黙に化ける。読まない (unread にも出さない)
 */
const DESCRIPTION_LINE = /^(右クリック|条件を満たした時に自動的に使用される|街の井戸で補充|パッシブツリーで割り当てられたジュエルソケットにはめる|アイテムのアビスソケット|メモ[:：])/;
/** フレーバーテキストの行 (poe2-flavour-ja.json の日本語を 1 行ずつ) */
const flavourLines: Set<string> = (() => {
  const s = new Set<string>();
  for (const v of Object.values(flavourJa as Record<string, string>)) for (const l of v.split(/\r?\n/)) if (l.trim()) s.add(l.trim());
  return s;
})();
/** ルーン / ソウルコアの効果の英語の行 (stage-runes.json。値込みの文面そのまま)。塊の行が全部これなら、注記が無くてもルーンの塊 */
const runeEffectLines: Set<string> = (() => {
  const s = new Set<string>();
  const runes = (stageRunes as { runes: Record<string, { effects?: Array<{ en: string }> }> }).runes;
  for (const r of Object.values(runes)) for (const e of r.effects ?? []) if (e.en) s.add(e.en);
  return s;
})();

/** 詳細コピーの「30(20-40)」「+35(30-40)%」: 数字の直後の、数字と「-」だけの括弧は注記ではなく範囲の表示。捨てて外の数値だけで読む */
const stripRanges = (s: string): string => s.replace(/(\d)\(\s*-?\d+(?:\.\d+)?\s*[-–]\s*-?\d+(?:\.\d+)?\s*\)/g, "$1");

interface Row {
  ja: string;
  en: string | null;
  /** 注記・見出し・絆で決まった種類。null なら塊の順で決める */
  kind: ItemLine["kind"] | null;
}

/** 貼られた文面 → PoB の文面 */
export async function toPobItem(pasted: string): Promise<ConvertedItem> {
  const text = pasted.replace(/\r\n?/g, NL).trim();
  if (/^(Item Class|Rarity):/m.test(text)) {
    const lines = text.split(NL).map((l) => l.trim());
    const r = lines.findIndex((l) => l.startsWith("Rarity:"));
    const names = lines.slice(r + 1).filter((l) => l && !/^-{3,}$/.test(l)).slice(0, 2);
    return {
      text,
      name: names[0] ?? "",
      base: names[1] ?? names[0] ?? null,
      ambiguous: [],
      rarity: (lines[r] ?? "").replace("Rarity:", "").trim(),
      english: true,
      unidentified: lines.includes("Unidentified"),
      lines: [],
      unread: [],
    };
  }

  const blocks = text.split(/\n-{3,}\n?/).map((b) => b.split(NL).map((l) => l.trim()).filter(Boolean)).filter((b) => b.length);
  const head = blocks[0] ?? [];
  const rarityJa = (head.find((l) => l.startsWith("レアリティ")) ?? "").split(/[:：]/)[1]?.trim() ?? "";
  const rarity = RARITY[rarityJa] ?? "Rare";
  const nameLines = head.filter((l) => !/^(アイテムクラス|レアリティ)/.test(l));
  const hints: BaseHints = { classJa: (head.find((l) => l.startsWith("アイテムクラス")) ?? "").split(/[:：]/)[1]?.trim() || null, reqLevel: null, defence: {} };
  const candidates = findBaseCandidates(nameLines);
  if (!candidates.length) throw new Error("ベースの名前が読めません (ゲームで Ctrl+C したアイテムの文面を貼ってください)");

  let itemLevel = 0;
  let quality = 0;
  /** 品質の種類 (カタリスト) の PoB のラベル「Quality (Attack Modifiers)」。Item.lua:558 が catalyst として読み、該当タグの MOD を伸ばす */
  let catalystLabel: string | null = null;
  let corrupted = false;
  let mirrored = false;
  let sanctified = false;
  let unidentified = false;
  let sockets = "";
  let afterLevel = false;
  const pats = await linePatterns();
  const modBlocks: Row[][] = [];
  for (const b of blocks.slice(1)) {
    const rows: Row[] = [];
    /** 詳細コピーの見出しで決まった、続く行の種類 */
    let fromHeader: ItemLine["kind"] | null = null;
    for (const raw of b) {
      const lv = /^アイテムレベル[:：]\s*(\d+)/.exec(raw);
      if (lv) { itemLevel = Number(lv[1]); afterLevel = true; continue; }
      // 「品質: +20%」/ 装飾品は種類つき「品質 (アタックモッド): +20%」(ラベル → 種類は計算機の quality.ts と同じ表)
      const q = /^品質(.*?)[:：]\s*\+?(\d+)%/.exec(raw);
      if (q) {
        quality = Number(q[2]);
        const tag = q[1]!.trim() ? catalystTagFromLabel(raw) : null;
        catalystLabel = tag ? CATALYSTS.find((c) => c.tag === tag)?.label.en ?? null : null;
        continue;
      }
      const so = /^ソケット[:：]\s*(.+)$/.exec(raw);
      if (so) { sockets = so[1]!.trim(); continue; }
      // 状態の行 (ClientStrings: ItemPopupCorrupted コラプト状態 / ItemPopupMirrored ミラー状態 / ItemPopupSanctified 聖別化 / ItemPopupUnidentified 未鑑定)。「コラプト済み」は旧表記を念のため
      if (raw === "コラプト済み" || raw === "コラプト状態" || raw === "Corrupted") { corrupted = true; continue; }
      if (raw === "ミラー状態" || raw === "Mirrored") { mirrored = true; continue; }
      if (raw === "聖別化" || raw === "Sanctified") { sanctified = true; continue; }
      if (raw === "未鑑定" || raw === "Unidentified") { unidentified = true; continue; }
      if (!afterLevel) {
        // 装備要求 (「レベル: 73」) と防御値 (「アーマー: 138」) はアイテムレベルより前。ベースを絞る手がかりに取る
        const rl = /^(?:レベル|Level)[:：]\s*(\d+)/.exec(raw);
        if (rl) hints.reqLevel = Number(rl[1]);
        const df = /^(アーマー|回避力|エナジーシールド|ルーンワード)[:：]\s*(\d+)/.exec(raw);
        if (df) hints.defence[DEFENCE_KEY[df[1]!]!] = Number(df[2]);
        continue;
      }
      // 詳細コピー (Ctrl+Alt+C) の見出し `{ … }` は MOD ではない。続く行の種類だけ取る
      if (/^\{.*\}$/.test(raw)) { fromHeader = headerKind(raw); continue; }
      // 説明の行、注意書き (括弧で始まる行。PoB も `^%(%a+` を読み飛ばす) は MOD ではない
      if (DESCRIPTION_LINE.test(raw) || /^[(（]/.test(raw)) continue;
      const l = stripRanges(raw);
      // 絆 (Bonded) は頭に「絆」(取引所は「絆 …」、ゲームのコピーは「絆: …」かも)。注記 (rune) と重なっても読む。絆はソウルコアの物なので種類は rune
      const toEn = (t: string): { en: string | null; kind: ItemLine["kind"] | null } => {
        const bonded = /^絆[:：]?\s*(.+)$/.exec(t);
        if (bonded) {
          const x = lineToEn(bonded[1]!, pats);
          return { en: x ? `Bonded: ${x}` : null, kind: "rune" };
        }
        return { en: lineToEn(t, pats) ?? grantsSkillToEn(t), kind: null };
      };
      let { en, kind } = toEn(l);
      if (!en) {
        // 行末の注記 (固有) (ルーン) (fractured) などを外してもう 1 度
        const note = /^(.*?)\s*[(（]([^)）]+)[)）]$/.exec(l);
        if (note) {
          ({ en, kind } = toEn(note[1]!));
          kind ??= NOTE_KIND.find(([re]) => re.test(note[2]!))?.[1] ?? null;
        }
      }
      rows.push({ ja: raw, en, kind: kind ?? fromHeader });
    }
    if (!rows.length) continue;
    // フレーバーテキストだと分かる塊だけ捨てる (ユニークで、数字が 1 つも無く、どの行も辞書に当たらない / フレーバーの辞書にある行)
    const noHit = rows.every((r) => !r.en);
    const flavour = (rarity === "Unique" && noHit && rows.every((r) => !/\d/.test(r.ja))) || rows.every((r) => flavourLines.has(r.ja));
    if (flavour) continue;
    modBlocks.push(rows);
  }

  // 塊の分類: 種類が決まっている行だけの塊 (注記・見出し・絆) と、行が全部ルーンの効果の塊 (ソケットがある時) は順の数に入れない
  const positional = modBlocks.filter((rows) => {
    if (rows.every((r) => r.kind)) return false;
    if (sockets && rows.every((r) => r.en && (r.kind === "rune" || runeEffectLines.has(r.en)))) {
      for (const r of rows) r.kind = "rune";
      return false;
    }
    return true;
  });
  const lines: ItemLine[] = [];
  const unread: string[] = [];
  for (const rows of modBlocks) {
    const pi = positional.indexOf(rows);
    // ノーマルと未鑑定 (明示が見えない) は塊が全部暗黙
    const blockKind: ItemLine["kind"] = rarity === "Normal" || unidentified || (pi >= 0 && pi < positional.length - 1) ? "implicit" : "explicit";
    for (const r of rows) {
      if (!r.en) { unread.push(r.ja); continue; }
      lines.push({ ja: r.ja, en: r.en, kind: r.kind ?? blockKind });
    }
  }

  const narrowed = narrowBases(candidates, hints);
  const base = narrowed[0]!;
  const ambiguous = narrowed.length > 1 ? narrowed : [];
  const uniqueName = rarity === "Unique" ? uniqueEnByJa.get(nameLines[0] ?? "") ?? nameLines[0] : null;
  const rareName = rarity === "Rare" ? rareNameEn(nameLines[0] ?? "") : null;
  // 未鑑定は名前の行がベースだけ。PoB (Item.lua:366) もベース名が先頭なら未鑑定と読む
  const name = unidentified ? base : rarity === "Rare" || rarity === "Unique" ? (uniqueName ?? rareName ?? "Pasted Item") : base;
  const implicitLike = lines.filter((l) => isImplicitSide(l.kind));
  const out = [`Rarity: ${rarity}`, name];
  if (name !== base) out.push(base);
  if (itemLevel) out.push(`Item Level: ${itemLevel}`);
  if (quality) out.push(catalystLabel ? `${catalystLabel}: +${quality}%` : `Quality: ${quality}`);
  if (sockets) out.push(`Sockets: ${sockets}`);
  out.push(`Implicits: ${implicitLike.length}`);
  for (const l of implicitLike) out.push((LINE_FLAG[l.kind] ?? "") + l.en);
  // 未鑑定は明示 MOD が見えない (有っても読めない) ので暗黙だけ
  if (!unidentified) for (const l of lines) if (!isImplicitSide(l.kind)) out.push((LINE_FLAG[l.kind] ?? "") + l.en);
  if (corrupted) out.push("Corrupted");
  if (mirrored) out.push("Mirrored");
  if (sanctified) out.push("Sanctified");
  return { text: out.join(NL), name: nameLines[0] ?? base, base, ambiguous, rarity, english: false, unidentified, lines, unread };
}
