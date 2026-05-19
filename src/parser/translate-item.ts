/**
 * 日本語アイテムテキスト → 英語アイテムテキスト変換。
 *
 * PoB の `Item.new(rawText)` は英語 mod 文字列のみ認識する。日本語クライアント /
 * 公式トレードサイトの paste は英訳しないと PoB に渡せない。
 *
 * 辞書ソース（直訳・意訳禁止 = データ通り厳守）:
 *  - mods-bundle.json: 各 mod の text_ja ↔ text_en ペア（2762 件）
 *  - items-ja.json:    base item の英→日マッピング（逆引きで日→英）
 *  - 固定辞書:          metadata 行（Item Class, Rarity, etc.）
 */

import modsBundle from "../i18n/mods-bundle.json";
import itemsJa from "../i18n/items-ja.json";
import type { Mod } from "../data/mods";

const bundle = modsBundle as Record<string, Omit<Mod, "key">>;
const itemsJaMap = itemsJa as Record<string, string>;

// ─── プレースホルダー処理 ─────────────────────────────────────
/** [Tag|表示名] → 表示名 */
function stripLinkSyntax(s: string): string {
  return s.replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2");
}

/** 数値リテラル / 範囲をパターン化して正規表現を作る (paste の実値とマッチさせる用) */
function modJaToRegex(jaText: string): RegExp {
  let s = stripLinkSyntax(jaText);
  // 正規表現メタ文字を escape (まず () . ? + 等)。後で数値範囲 → 数値パターンに変換するので
  // ( と ) は escape 後に巻き戻す。
  s = s.replace(/[.*+?^${}\\|[\]]/g, "\\$&");
  // 数値範囲 \(N-M\) → 数値 1 つ (整数 / 小数)
  s = s.replace(/\\\((\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\\\)/g, "(-?\\d+(?:\\.\\d+)?)");
  // 残った \( \) を念のため処理（範囲じゃない括弧は escape のままで OK だが、
  // 「いずれかの[Flask|フラスコ]効果中は」のような括弧無いはず。スキップ）
  // 単独の数値リテラル（たとえば +50, 25%）も任意の数値にマッチさせる
  s = s.replace(/(?<![\d.])\d+(?:\.\d+)?(?![\d.])/g, "(-?\\d+(?:\\.\\d+)?)");
  return new RegExp("^" + s + "$");
}

// ─── 辞書構築 (起動時 1 度) ─────────────────────────────────
interface ModDictEntry {
  jaPattern: RegExp;
  enTemplate: string; // text_en (link syntax 展開済み)
}

const MOD_DICT: ModDictEntry[] = [];
for (const m of Object.values(bundle)) {
  const ja = m.text_ja?.trim();
  const en = m.text_en?.trim();
  if (!ja || !en) continue;
  try {
    MOD_DICT.push({
      jaPattern: modJaToRegex(ja),
      enTemplate: stripLinkSyntax(en),
    });
  } catch {
    // 正規表現エラーは無視（未対応 mod）
  }
}

// items-ja.json: { en: ja } → { ja: en } 逆引き
const ITEMS_JA_REVERSE: Record<string, string> = {};
for (const [en, jp] of Object.entries(itemsJaMap)) {
  ITEMS_JA_REVERSE[jp] = en;
}

// ─── 固定 metadata 辞書 ─────────────────────────────────
const METADATA_TRANSLATIONS: { ja: RegExp; en: (m: RegExpMatchArray) => string }[] = [
  // Rarity
  { ja: /^レアリティ:\s*ノーマル$/, en: () => "Rarity: Normal" },
  { ja: /^レアリティ:\s*マジック$/, en: () => "Rarity: Magic" },
  { ja: /^レアリティ:\s*レア$/, en: () => "Rarity: Rare" },
  { ja: /^レアリティ:\s*ユニーク$/, en: () => "Rarity: Unique" },
  // Item Level
  { ja: /^アイテムレベル:\s*(\d+)$/, en: (m) => `Item Level: ${m[1]}` },
  // Quality (with optional category)
  {
    ja: /^品質\s*\(([^)]+)\):\s*\+?(\d+)%$/,
    en: (m) => `Quality (${m[1]}): +${m[2]}%`,
  },
  { ja: /^品質:\s*\+?(\d+)%$/, en: (m) => `Quality: +${m[1]}%` },
  // Sockets
  { ja: /^ソケット:\s*(.+)$/, en: (m) => `Sockets: ${m[1]}` },
  // Requires
  { ja: /^必要\s+レベル\s+(\d+)/, en: (m) => `Requires: Level ${m[1]}` },
  // 状態 flags
  { ja: /^腐敗$/, en: () => "Corrupted" },
  { ja: /^壊れた$/, en: () => "Split" },
  { ja: /^鏡映$/, en: () => "Mirrored" },
  { ja: /^未鑑定$/, en: () => "Unidentified" },
];

/** 1 行が metadata なら英訳、そうでなければ null を返す */
function translateMetadataLine(line: string): string | null {
  for (const t of METADATA_TRANSLATIONS) {
    const m = line.match(t.ja);
    if (m) return t.en(m);
  }
  return null;
}

// ─── mod 行翻訳 ─────────────────────────────────
/**
 * 1 mod 行を辞書で逆引きして英訳。マッチしなければ null（呼び出し側で原文 fallback）。
 *
 * 数値の取り扱い:
 *  - bundle.text_ja の `(8-12)%` パターンに paste の `10%` がマッチした場合、
 *    text_en 側のテンプレ `(N-M)% increased ...` の対応位置を `10%` に置換して返す。
 */
function translateModLine(jaLine: string): string | null {
  const stripped = jaLine.trim();
  if (!stripped) return null;
  for (const entry of MOD_DICT) {
    const m = stripped.match(entry.jaPattern);
    if (!m) continue;
    // m[1..] = 抽出された数値（複数あり）。en テンプレ中の「数値範囲 / 数値」を順番に置換。
    let en = entry.enTemplate;
    let valueIndex = 1;
    en = en.replace(/\((\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\)/g, () => {
      const v = m[valueIndex++];
      return v ?? "$&";
    });
    en = en.replace(/(?<![\d.])\d+(?:\.\d+)?(?![\d.])/g, () => {
      const v = m[valueIndex++];
      return v ?? "$&";
    });
    return en;
  }
  return null;
}

// ─── ベース名翻訳 ─────────────────────────────────
/** 日本語ベース名 → 英語ベース名。未知なら null */
function translateBaseName(jaBase: string): string | null {
  return ITEMS_JA_REVERSE[jaBase] ?? null;
}

// ─── 全体翻訳 ─────────────────────────────────
export interface TranslationResult {
  englishText: string;
  /** 翻訳できなかった行 (mod または metadata) */
  unresolved: string[];
}

/**
 * 日本語アイテムテキスト全体を英訳する。完全変換できない部分があっても、
 * 残りの行はそのまま英文に含める（PoB が tolerable な場合がある）。
 */
export function translateItemTextToEn(jaText: string): TranslationResult {
  const lines = jaText.split(/\r?\n/);
  const out: string[] = [];
  const unresolved: string[] = [];
  let inModSection = false;
  let nameLineProcessed = false;
  let baseLineProcessed = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "" || /^---+$/.test(line)) {
      out.push(rawLine); // セパレータはそのまま
      continue;
    }

    // metadata 行か?
    const metaEn = translateMetadataLine(line);
    if (metaEn) {
      out.push(metaEn);
      // アイテムレベル / 必要 lv 以降は mod 区間
      if (/^アイテムレベル:|^必要\s+レベル/.test(line)) {
        inModSection = true;
      }
      continue;
    }

    if (!inModSection) {
      // ヘッダ行: 1 行目 name (固有、固有名は翻訳しない)、2 行目 base (要翻訳)
      if (!nameLineProcessed) {
        out.push(line); // 固有名はそのまま（ブランドやネーミング、英訳辞書に無い）
        nameLineProcessed = true;
        continue;
      }
      if (!baseLineProcessed) {
        const enBase = translateBaseName(line);
        out.push(enBase ?? line);
        if (!enBase) unresolved.push(line);
        baseLineProcessed = true;
        continue;
      }
      // それ以外は metadata 後と同じ扱い
      out.push(line);
      continue;
    }

    // mod 行
    const modEn = translateModLine(line);
    if (modEn) {
      out.push(modEn);
    } else {
      out.push(line);
      unresolved.push(line);
    }
  }

  return { englishText: out.join("\n"), unresolved };
}
