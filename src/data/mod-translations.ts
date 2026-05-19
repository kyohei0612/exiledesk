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
  stats?: Array<{ id?: string; min?: number; max?: number }>;
  // 他フィールドは無視
}

interface CompiledTranslation {
  pattern: RegExp; // text_en を正規化した照合 pattern（タグ込み）
  jaPattern: RegExp | null; // 翻訳済 text_ja からの逆引き pattern（タグ展開済、stat ID 取得用）
  enRaw: string;
  jaTemplate: string;
  /** この mod に対応する POE stat ID 列（trade2 search クエリ生成用） */
  statIds: string[];
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

  const seen = new Set<string>(); // 完全に同一の text_en は 1 度だけ登録

  const entries = modsBundle as unknown as Record<string, BundleEntry>;
  for (const entry of Object.values(entries)) {
    const en = entry.text_en;
    const ja = entry.text_ja;
    if (!en || !ja || typeof en !== "string" || typeof ja !== "string") continue;
    if (seen.has(en)) continue;
    seen.add(en);

    // stat IDs を抽出（trade2 search 用、null/undefined は除外）
    const statIds: string[] = [];
    if (Array.isArray(entry.stats)) {
      for (const s of entry.stats) {
        if (s && typeof s.id === "string" && s.id.length > 0) {
          statIds.push(s.id);
        }
      }
    }

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

      out.push({ pattern, jaPattern, enRaw: en, jaTemplate: ja, statIds });
    } catch {
      // 異常なテンプレートはスキップ
    }
  }
  return out;
})();

// ━━ 公開関数 ━━

/**
 * mod text の `[token|display]` タグを `display` 部分に展開。
 * trade2 API の生フォーマット → 人間に読める形に変換。
 */
function expandTagsLocal(s: string): string {
  return s.replace(/\[([^|\]]+)\|([^\]]+)\]/g, (_, _token, display) => display);
}

/**
 * 英語 mod text → 日本語 mod text。
 * bundle にマッチしなければ英語のまま返す。
 *
 * 想定入力: `[token|display]` タグ込みの trade2 raw text
 *   例: "Adds 12 to 24 [Physical|Physical] Damage to [Attack|Attacks]"
 *
 * 出力: タグ展開済の日本語 text（マッチしなければ展開済英語）
 *   例: "12から24の物理ダメージをアタックに加える"
 *
 * 内部処理:
 *   1. bundle の text_en もタグ込み形式なので、入力もタグ込みのままマッチング
 *   2. マッチした text_ja の `(min-max)` を捕獲数値で置換
 *   3. 最後に `[token|display]` タグを展開
 */
export function translateModText(en: string): string {
  if (!en) return en;

  // bundle 照合（タグ込み同士で）
  for (const t of compiledTranslations) {
    const m = en.match(t.pattern);
    if (!m) continue;
    const numbers = m.slice(1);
    // jaTemplate の `(min-max)` を順次実値に置換
    let result = t.jaTemplate;
    for (const n of numbers) {
      result = result.replace(/\(-?\d+(?:\.\d+)?-(?:-?\d+(?:\.\d+)?)\)/, n);
    }
    // タグ展開（[Physical|物理] → 物理）
    return expandTagsLocal(result);
  }

  // bundle ヒットなし → タグ展開だけして英語のまま返す
  return expandTagsLocal(en);
}

/** デバッグ / メトリクス用: 翻訳マッチ率を測る */
export function translationCoverage(mods: string[]): {
  total: number;
  translated: number;
  rate: number;
  untranslated: string[];
} {
  let translated = 0;
  const untranslated: string[] = [];
  for (const m of mods) {
    const result = translateModText(m);
    // 翻訳成功 = 元の英語と異なる（タグ展開のみで結果が同じケースもあるので、
    //   厳密には bundle ヒット = success だが、表示上は識別困難なため簡易判定）
    const expandedSource = expandTagsLocal(m);
    if (result !== expandedSource) {
      translated++;
    } else {
      untranslated.push(m);
    }
  }
  return {
    total: mods.length,
    translated,
    rate: mods.length > 0 ? translated / mods.length : 0,
    untranslated,
  };
}

/** 翻訳テーブルのサイズ（デバッグ用） */
export function getTranslationTableSize(): number {
  return compiledTranslations.length;
}

/**
 * mod text から、対応する POE stat ID 列を逆引き。
 * trade2 search クエリ生成（クラスタを trade2 サイトで開く機能）用。
 *
 * 入力は以下のいずれでも OK:
 *   - trade2 raw text (タグ込み英語): "Adds (N) to (N) [Physical|Physical] Damage to [Attack|Attacks]"
 *   - 翻訳済日訳 text (タグ展開済): "(N)から(N)の物理ダメージをアタックに加える"
 *
 * 該当 mod が bundle にない or stats フィールドが無い場合は空配列。
 */
export function getModStatIds(text: string): string[] {
  if (!text) return [];
  for (const t of compiledTranslations) {
    if (t.pattern.test(text)) return t.statIds;
    if (t.jaPattern && t.jaPattern.test(text)) return t.statIds;
  }
  return [];
}
