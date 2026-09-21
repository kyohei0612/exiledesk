/**
 * POE2 trade2 API レスポンスの英語 mod text → 日本語 翻訳。
 *
 * オーナー指示 (2026-05-19): 「POE2 のライブラリないの？日本語訳の」
 *   → ExileDesk が既に保持している `src/i18n/mods-bundle.json` (2754 件) を再利用。
 *   クラフト君が repoe-fork/poe2 から生成した英日対訳バンドル。
 *
 * 翻訳フロー:
 *   1. mods-bundle.json から text_en / text_ja ペアを全件ロード
 *   2. text_en の `(min-max)` を `(\d+(?:\.\d+)?)` 正規表現に変換 → lookup pattern
 *   3. trade2 レスポンスの英語 text をパターンマッチ → 数値キャプチャ
 *   4. 対応する text_ja の `(min-max)` をキャプチャ済み実値で置換
 *   5. `[token|display]` タグは別途展開（呼び側で処理済前提）
 *
 * マッチしない mod は **英語のまま** 返される（壊さない設計）。
 * bundle 不足分の fallback として hardcoded patterns も併用可能（現状は空、必要なら追加）。
 */

import modsBundle from "../i18n/mods-bundle.json";

interface BundleEntry {
  text_en?: string;
  text_ja?: string;
  type?: "prefix" | "suffix";
  stats?: Array<{ id?: string; min?: number; max?: number }>;
  // 他フィールドは無視
}

interface CompiledTranslation {
  pattern: RegExp; // text_en を正規化した照合 pattern（タグ込み）
  jaPattern: RegExp | null; // 翻訳済 text_ja からの逆引き pattern（タグ展開済、stat ID 取得用）
  /**
   * craft-discovery-v2.ts の `normalizeModTemplate` と同じ形式の正規化 text_en。
   *   - `(min-max)` / `(num)` / 裸数値 全て `#` に置換
   *   - `[Tag|Display]` タグはそのまま保持
   * `rawTemplate` (= ModEntry.rawTemplate) との **完全一致** での Map lookup に使う。
   * Data-H1 修正: rawTemplate からの stat ID 逆引きを「常に失敗する正規表現マッチ」から
   * O(1) Map ヒットに置き換えるための鍵。
   */
  normalizedEn: string;
  enRaw: string;
  jaTemplate: string;
  /** この mod に対応する POE stat ID 列（trade2 search クエリ生成用） */
  statIds: string[];
  /**
   * prefix / suffix 区別（Phase 1.5 追加）。
   * bundle の type フィールドから直接取得。
   * 同 text_en で prefix/suffix 両方ある曖昧 mod (7 件) は "unknown"。
   */
  affixType: "prefix" | "suffix" | "unknown";
}

/**
 * craft-discovery-v2.ts の `normalizeModTemplate` と**完全一致**させた正規化。
 * Data-H1 修正で rawTemplate キー direct lookup のために導入。
 * 順序: (min-max) → (num) → 裸数値 の順に `#` 置換、最後に trim。
 */
function normalizeTemplate(text: string): string {
  if (!text || typeof text !== "string") return "";
  let s = text;
  s = s.replace(/\(-?\d+(?:\.\d+)?-{1}-?\d+(?:\.\d+)?\)/g, "#");
  s = s.replace(/\(-?\d+(?:\.\d+)?\)/g, "#");
  s = s.replace(/-?\d+(?:\.\d+)?/g, "#");
  return s.trim();
}

/** [token|display] タグを展開（mod-translations 内部用） */
function expandTagsInText(s: string): string {
  return s.replace(/\[([^|\]]+)\|([^\]]+)\]/g, (_, _t, d) => d);
}

// ━━ 起動時に bundle から lookup table を構築（1 回のみ） ━━

const compiledTranslations: CompiledTranslation[] = (() => {
  const out: CompiledTranslation[] = [];
  // テンプレート文字列の `(min-max)` `(min-max-min-max)` 等を正規表現キャプチャに変換
  // メタ文字をエスケープし、続いて (min-max) を `(\\d+(?:\\.\\d+)?)` に置換
  const REGEX_META = /[.+*?^$()\[\]{}|\\]/g;
  // 例: "(41-59)%" → エスケープ後 "\(41-59\)%" → "(\\d+(?:\\.\\d+)?)"
  const ESCAPED_RANGE_PATTERN =
    /\\\(-?\d+(?:\.\d+)?-(?:-?\d+(?:\.\d+)?)\\\)/g;

  const seen = new Map<string, number>(); // text_en → out index（同 text_en の 2 回目以降は type 衝突判定）

  const entries = modsBundle as unknown as Record<string, BundleEntry>;
  for (const entry of Object.values(entries)) {
    const en = entry.text_en;
    const ja = entry.text_ja;
    if (!en || !ja || typeof en !== "string" || typeof ja !== "string") continue;

    // 同 text_en で type が衝突する場合は "unknown" にマーク（Phase 1.5）
    if (seen.has(en)) {
      const idx = seen.get(en)!;
      const existing = out[idx];
      const incomingType: "prefix" | "suffix" | "unknown" =
        entry.type === "prefix" || entry.type === "suffix" ? entry.type : "unknown";
      if (existing.affixType !== incomingType) {
        existing.affixType = "unknown";
      }
      continue;
    }

    // stat IDs を抽出（trade2 search 用、null/undefined は除外）
    const statIds: string[] = [];
    if (Array.isArray(entry.stats)) {
      for (const s of entry.stats) {
        if (s && typeof s.id === "string" && s.id.length > 0) {
          statIds.push(s.id);
        }
      }
    }

    const affixType: "prefix" | "suffix" | "unknown" =
      entry.type === "prefix" || entry.type === "suffix" ? entry.type : "unknown";

    try {
      // 1. en pattern: メタ文字エスケープ → (min-max) を (\d+) に
      let escapedEn = en.replace(REGEX_META, "\\$&");
      escapedEn = escapedEn.replace(ESCAPED_RANGE_PATTERN, "(\\d+(?:\\.\\d+)?)");
      const pattern = new RegExp("^" + escapedEn + "$");

      // 2. ja pattern: タグ展開済の ja text からも逆引き可能にする（stat ID 用）
      //    クラスタの rawSamples は translateModText 出力 = タグ展開済日訳
      let jaPattern: RegExp | null = null;
      try {
        const jaExpanded = expandTagsInText(ja);
        let escapedJa = jaExpanded.replace(REGEX_META, "\\$&");
        escapedJa = escapedJa.replace(
          ESCAPED_RANGE_PATTERN,
          "(\\d+(?:\\.\\d+)?)",
        );
        jaPattern = new RegExp("^" + escapedJa + "$");
      } catch {
        jaPattern = null;
      }

      seen.set(en, out.length);
      const normalizedEn = normalizeTemplate(en);
      out.push({ pattern, jaPattern, normalizedEn, enRaw: en, jaTemplate: ja, statIds, affixType });
    } catch {
      // 異常なテンプレートはスキップ
    }
  }
  return out;
})();

// Data-H1: rawTemplate (= normalizeModTemplate(text_en)) → CompiledTranslation index への直接逆引き Map。
// 旧実装は `compiledTranslations[].pattern.test("+# to maximum Life")` を走らせていたが、
// pattern は bundle text_en の `(min-max)` を `(\d+)` に変換した anchored 正規表現なので、
// `#` プレースホルダ入りの rawTemplate を渡しても**常に false**。結果、stat ID が拾えず
// trade2 search に MOD が乗らない問題があった。
// 同じ正規化を bundle 側にも適用し、normalized text 一致で direct lookup させる。
const normalizedEnIndex: Map<string, number> = (() => {
  const m = new Map<string, number>();
  for (let i = 0; i < compiledTranslations.length; i++) {
    const k = compiledTranslations[i].normalizedEn;
    if (k && !m.has(k)) m.set(k, i);
  }
  return m;
})();

// ━━ 公開関数 ━━

/**
 * mod text から、対応する POE stat ID 列を逆引き。
 * trade2 search クエリ生成（クラスタを trade2 サイトで開く機能）用。
 *
 * 入力は以下のいずれでも OK:
 *   - `#` プレースホルダ入りの rawTemplate (Data-H1): "+# to maximum Life"
 *   - trade2 raw text (タグ込み英語): "Adds (N) to (N) [Physical|Physical] Damage to [Attack|Attacks]"
 *   - 翻訳済日訳 text (タグ展開済): "(N)から(N)の物理ダメージをアタックに加える"
 *
 * 該当 mod が bundle にない or stats フィールドが無い場合は空配列。
 *
 * Data-H1: rawTemplate 直接マッチを最優先で行うため、
 * 入力を `normalizeTemplate()` した結果 (`#` プレースホルダ込み) を
 * `normalizedEnIndex` で direct lookup する。これにより
 * `pattern.test("+# to maximum Life")` が常に false だった旧バグを解消。
 */
export function getModStatIds(text: string): string[] {
  if (!text) return [];
  // 1) Data-H1: rawTemplate / 数値入り英語 どちらでも normalize して direct Map lookup
  const norm = normalizeTemplate(text);
  if (norm) {
    const idx = normalizedEnIndex.get(norm);
    if (idx !== undefined) return compiledTranslations[idx].statIds;
  }
  // 2) フォールバック: 既存の anchored 正規表現マッチ
  //    日訳 text 入力 / タグ展開済 など正規化で吸収できないケース用。
  for (const t of compiledTranslations) {
    if (t.pattern.test(text)) return t.statIds;
    if (t.jaPattern && t.jaPattern.test(text)) return t.statIds;
  }
  return [];
}
