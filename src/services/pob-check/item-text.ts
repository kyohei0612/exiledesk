/**
 * item-text.ts — ゲームでコピーしたアイテムの文面 (日本語 / 英語) → PoB が読める文面 (2026-10-02 火力チェックの装備の差し替え)
 *
 * 英語のコピー (Item Class: / Rarity: のある物) は PoB がそのまま読めるので素通し。
 * 日本語のコピーは 1 行ずつ英語にする:
 *   - MOD の行: ゲームの stat_descriptions の日本語と英語の組 (src/i18n/mod-lines-ja-en.json、scripts/build-mod-lines-ja-en.mjs)
 *   - ベース名: items-ja-client.json (逆引き)、ユニーク名: unique-names-ja.json (逆引き)
 *   - 区切り線で塊に分け、アイテムレベルより後で MOD の行が当たった塊を MOD の塊とみる。
 *     日本語のコピーには (implicit) の注記が無いので、**最後の塊が明示 MOD、それより前は暗黙** (ノーマルは全部暗黙)
 *   - 物理ダメージ・アーマー・要求などの性能の塊は入れない (PoB がベースと MOD から計算し直す)
 */
import itemsJaClient from "../../i18n/items-ja-client.json";
import itemsJa from "../../i18n/items-ja.json";
import uniqueNamesJa from "../../i18n/unique-names-ja.json";
import rareNamesJa from "../../i18n/rare-names-ja.json";
import { gemJa } from "./api";

export interface ItemLine {
  ja: string;
  en: string;
  kind: "implicit" | "explicit" | "rune" | "enchant";
}
export interface ConvertedItem {
  /** PoB に渡す文面 */
  text: string;
  /** 画面に出す名前 (貼られたままの表記) */
  name: string;
  /** ベース名 (英語) */
  base: string | null;
  rarity: string;
  /** 英語のコピーで、そのまま渡した */
  english: boolean;
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
      const lit = ja.slice(last, m.index);
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
    const gs = /^Grants Skill:\s*(?:Level (\d+) )?(.+)$/.exec(l);
    if (gs) return `スキル付与: ${gemJa(gs[2]!)}${gs[1] ? ` Lv ${gs[1]}` : ""}`;
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
    return p.en.replace(PH, (_s, idx: string, fmt?: string) => {
      const n = idx === "" ? seq : Number(idx);
      seq++;
      const raw = byIndex.get(n) ?? "0";
      const v = raw.replace(/^\+/, "");
      return fmt?.includes("+") && !v.startsWith("-") ? "+" + v : v;
    });
  }
  return null;
}

const baseEnByJa: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const dict of [itemsJaClient, itemsJa] as Record<string, string>[]) for (const [en, ja] of Object.entries(dict)) if (!m.has(ja)) m.set(ja, en);
  return m;
})();
const uniqueEnByJa: Map<string, string> = new Map(Object.entries(uniqueNamesJa as Record<string, string>).map(([en, ja]) => [ja, en]));

/** 名前の行からベース (英語)。マジックは「接頭 + ベース + 接尾」なので中に含まれる一番長いベース名 */
function findBase(nameLines: string[]): string | null {
  for (let i = nameLines.length - 1; i >= 0; i--) {
    const exact = baseEnByJa.get(nameLines[i]!);
    if (exact) return exact;
  }
  let best: [string, string] | null = null;
  for (const line of nameLines) for (const [ja, en] of baseEnByJa) if (ja.length >= 2 && line.includes(ja) && (!best || ja.length > best[0].length)) best = [ja, en];
  return best?.[1] ?? null;
}

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

const RARITY: Record<string, string> = { ノーマル: "Normal", マジック: "Magic", レア: "Rare", ユニーク: "Unique" };
const NOTE_KIND: Array<[RegExp, ItemLine["kind"]]> = [
  [/implicit|固有|暗黙/i, "implicit"],
  [/rune|ルーン/i, "rune"],
  [/enchant|エンチャント/i, "enchant"],
];

/** 貼られた文面 → PoB の文面 */
export async function toPobItem(pasted: string): Promise<ConvertedItem> {
  const text = pasted.replace(/\r\n?/g, NL).trim();
  if (/^(Item Class|Rarity):/m.test(text)) {
    const lines = text.split(NL).map((l) => l.trim());
    const r = lines.findIndex((l) => l.startsWith("Rarity:"));
    const names = lines.slice(r + 1).filter((l) => l && !/^-{3,}$/.test(l)).slice(0, 2);
    return { text, name: names[0] ?? "", base: names[1] ?? names[0] ?? null, rarity: (lines[r] ?? "").replace("Rarity:", "").trim(), english: true, lines: [], unread: [] };
  }

  const blocks = text.split(/\n-{3,}\n?/).map((b) => b.split(NL).map((l) => l.trim()).filter(Boolean)).filter((b) => b.length);
  const head = blocks[0] ?? [];
  const rarityJa = (head.find((l) => l.startsWith("レアリティ")) ?? "").split(/[:：]/)[1]?.trim() ?? "";
  const rarity = RARITY[rarityJa] ?? "Rare";
  const nameLines = head.filter((l) => !/^(アイテムクラス|レアリティ)/.test(l));
  const base = findBase(nameLines);
  if (!base) throw new Error("ベースの名前が読めません (ゲームで Ctrl+C したアイテムの文面を貼ってください)");

  let itemLevel = 0;
  let quality = 0;
  let corrupted = false;
  let sockets = "";
  let afterLevel = false;
  const pats = await linePatterns();
  const modBlocks: Array<Array<{ ja: string; en: string | null; kind: ItemLine["kind"] | null }>> = [];
  for (const b of blocks.slice(1)) {
    const rows: Array<{ ja: string; en: string | null; kind: ItemLine["kind"] | null }> = [];
    for (const l of b) {
      const lv = /^アイテムレベル[:：]\s*(\d+)/.exec(l);
      if (lv) { itemLevel = Number(lv[1]); afterLevel = true; continue; }
      const q = /^品質.*?[:：]\s*\+?(\d+)%/.exec(l);
      if (q) { quality = Number(q[1]); continue; }
      const so = /^ソケット[:：]\s*(.+)$/.exec(l);
      if (so) { sockets = so[1]!.trim(); continue; }
      if (l === "コラプト済み" || l === "コラプト状態") { corrupted = true; continue; }
      if (!afterLevel) continue;
      const bondedJa = /^絆[:：]?\s*(.+)$/.exec(l);
      let en = bondedJa ? ((x) => (x ? `Bonded: ${x}` : null))(lineToEn(bondedJa[1]!, pats)) : lineToEn(l, pats);
      let kind: ItemLine["kind"] | null = null;
      if (!en) {
        // 行末の注記 (固有) (ルーン) などを外してもう 1 度
        const note = /^(.*?)\s*[(（]([^)）]+)[)）]$/.exec(l);
        if (note) {
          en = lineToEn(note[1]!, pats);
          kind = NOTE_KIND.find(([re]) => re.test(note[2]!))?.[1] ?? null;
        }
      }
      rows.push({ ja: l, en, kind });
    }
    if (rows.some((r) => r.en)) modBlocks.push(rows);
  }

  const lines: ItemLine[] = [];
  const unread: string[] = [];
  modBlocks.forEach((rows, bi) => {
    const blockKind: ItemLine["kind"] = rarity === "Normal" || bi < modBlocks.length - 1 ? "implicit" : "explicit";
    for (const r of rows) {
      if (!r.en) { unread.push(r.ja); continue; }
      lines.push({ ja: r.ja, en: r.en, kind: r.kind ?? blockKind });
    }
  });

  const uniqueName = rarity === "Unique" ? uniqueEnByJa.get(nameLines[0] ?? "") ?? nameLines[0] : null;
  const rareName = rarity === "Rare" ? rareNameEn(nameLines[0] ?? "") : null;
  const name = rarity === "Rare" || rarity === "Unique" ? (uniqueName ?? rareName ?? "Pasted Item") : base;
  const implicitLike = lines.filter((l) => l.kind !== "explicit");
  const out = [`Rarity: ${rarity}`, name];
  if (name !== base) out.push(base);
  if (itemLevel) out.push(`Item Level: ${itemLevel}`);
  if (quality) out.push(`Quality: ${quality}`);
  if (sockets) out.push(`Sockets: ${sockets}`);
  out.push(`Implicits: ${implicitLike.length}`);
  for (const l of implicitLike) out.push((l.kind === "rune" ? "{rune}" : l.kind === "enchant" ? "{enchant}" : "") + l.en);
  for (const l of lines) if (l.kind === "explicit") out.push(l.en);
  if (corrupted) out.push("Corrupted");
  return { text: out.join(NL), name: nameLines[0] ?? base, base, rarity, english: false, lines, unread };
}
