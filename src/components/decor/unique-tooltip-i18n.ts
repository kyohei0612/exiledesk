/**
 * ユニーク MOD ホバーの日本語化 + リッチテキスト整形 (辞書の逆引きインデックスと strip)
 *
 * UniqueTooltip.vue から切り出し (2026-09-26)。
 */
// ---------------------------------------------------------------------------
// 日本語化 + リッチテキスト整形
//   - mods-bundle.json の text_en/text_ja から逆引きインデックスを構築
//   - 正規化キー (数値→#) で hit すれば日本語テンプレに数値を埋め戻し
//   - hit しなければ英語のまま、ただし `[Tag|Display]` マーカーは Display 側のみ
// ---------------------------------------------------------------------------
import modsBundleRaw from "../../i18n/mods-bundle.json";
import itemsJaRaw from "../../i18n/items-ja.json";
import uniqueModsJaRaw from "../../i18n/unique-mods-ja.json";
import uniqueNamesJaRaw from "../../i18n/unique-names-ja.json";
import poe2FlavourJaRaw from "../../i18n/poe2-flavour-ja.json";
interface BundleEntry {
  text_en?: string;
  text_ja?: string;
}
const _bundle = modsBundleRaw as Record<string, BundleEntry>;
// items-ja.json はアイテム名辞書 (3500+ 件)。ユニーク特殊 MOD/flavour text に該当エントリがあれば fallback で使う。
const _itemsJa = itemsJaRaw as Record<string, string>;
// Phase κ: POE2DB スクレイプ由来のユニーク特殊 MOD 辞書 (例: "Reflects opposite Ring" → "もう一個の指輪を反射する")
//   build: `node scripts/build-unique-mods-ja.mjs` で生成。
const _uniqueModsJa = uniqueModsJaRaw as Record<string, string>;
// 2026-05-22: ユニュ英語正式名 → 日本語正式名 (例: "Atziri's Splendour" → "アッツィリの栄耀")
//   build: `node scripts/build-dicts-from-client.mjs` (GGG クライアント Words.Text2、一次ソース)
//          + `node scripts/build-unique-pages-detail.mjs` 系 (poe2db 補強)。
export const _uniqueNamesJa = uniqueNamesJaRaw as Record<string, string>;
// flavour text 辞書 (例: "Power is a matter of perspective." → "力とは主観的なものだ。")
//   build: `node scripts/build-dicts-from-client.mjs` (GGG クライアント FlavourText、一次ソース。キーは CR+LF 保持)
//          + `build-unique-pages-detail.mjs` (poe2db 補強) + `build-poe2-flavour-ja.mjs` (RePoE、現在 404 で補強のみ)。
const _flavourJa = poe2FlavourJaRaw as Record<string, string>;

// 2026-09-07: 正規化 / 数値抽出 / 埋め戻し / マーカー除去は services/mods/normalize.ts に統一
// (以前はここに同じロジックの写しがあった)。
import {
  normalizeModTemplate as normalizeTpl,
  extractNumbers as extractNums,
  fillTemplate as fillJa,
  stripRichTextMarkers as stripRichText,
} from "../../services/mods/normalize";

const _modJaIndex: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const k in _bundle) {
    const e = _bundle[k];
    if (!e || !e.text_en || !e.text_ja) continue;
    const tplKey = normalizeTpl(e.text_en);
    if (!tplKey || map.has(tplKey)) continue;
    map.set(tplKey, normalizeTpl(e.text_ja));
  }
  return map;
})();

/**
 * Phase λ 仕上げ (2026-05-22): unique-mods-ja の値テンプレ → 日本語テンプレ逆引き。
 *
 * 辞書 raw キー例: `"(20—30)% reduced Presence Area of Effect"` (em dash + 値範囲)
 * 実機 explicitMod 例: `"22% reduced Presence Area of Effect"` (具体値)
 * → 両方 `normalizeTpl` で `"#% reduced Presence Area of Effect"` に正規化、テンプレ照合。
 * 値は実機側から `extractNums` で抽出し、日本語テンプレに `fillJa` で埋め戻す。
 */
const _uniqueModsJaIndex: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const k in _uniqueModsJa) {
    const en = k;
    const ja = _uniqueModsJa[k];
    if (!en || !ja) continue;
    const tplKey = normalizeTpl(en);
    if (!tplKey || map.has(tplKey)) continue;
    map.set(tplKey, normalizeTpl(ja));
  }
  return map;
})();

export function strip(text: string): string {
  // リッチテキストマーカーは先に除去 (辞書キーは plain text 前提、2026-05-22 修正)
  const plain = stripRichText(text);
  // 1. bundle テンプレ照合 (数値→# 正規化キーで lookup、日本語テンプレに値埋戻し)
  const tpl = normalizeTpl(plain);
  const jaTpl = _modJaIndex.get(tpl);
  if (jaTpl) {
    return fillJa(jaTpl, extractNums(plain));
  }
  // 2a. unique-mods-ja テンプレ照合 (POE2DB スクレイプ、値範囲→# 正規化キー)
  const uniqueJaTpl = _uniqueModsJaIndex.get(tpl);
  if (uniqueJaTpl) {
    return fillJa(uniqueJaTpl, extractNums(plain));
  }
  // 2b. unique-mods-ja.json flat lookup (値が完全一致するケース、固定値 MOD 等)
  if (_uniqueModsJa[plain]) {
    return _uniqueModsJa[plain];
  }
  // 3. poe2-flavour-ja.json (GGG クライアント FlavourText 由来 + poe2db/RePoE 補強) flat lookup
  //    辞書キーは \r\n 改行を含む場合がある → 両方試す
  if (_flavourJa[plain]) {
    return _flavourJa[plain];
  }
  const withCrlf = plain.replace(/\n/g, "\r\n");
  if (_flavourJa[withCrlf]) {
    return _flavourJa[withCrlf];
  }
  // L10: 逆方向 (実機 \r\n / 辞書 \n) のミスマッチも吸収
  const withLfOnly = plain.replace(/\r\n/g, "\n");
  if (_flavourJa[withLfOnly]) {
    return _flavourJa[withLfOnly];
  }
  // 4. items-ja.json flat lookup
  if (_itemsJa[plain]) {
    return _itemsJa[plain];
  }
  // 5. 英語のまま (リッチテキスト除去済)
  return plain;
}

export function asArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}
