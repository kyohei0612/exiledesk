/**
 * MOD テキストの正規化 / 数値抽出 / テンプレート埋め戻し (純関数)
 *
 * craft-discovery-v2.ts から切り出し (2026-09-07)。UniqueTooltip.vue が独自に
 * 再実装していた同名ロジック (normalizeTpl / extractNums / fillJa / stripRichText)
 * もここに統一する。辞書 (mod-text-ja / mod-tier-and-group / unique-mods-ja) の
 * キーは全部この正規化で作られているので、規則を変えるときは辞書の再生成も必要。
 */

/**
 * `[Tag|Display]` → Display、単独 `[Tag]` → Tag。
 *
 * poe.ninja の explicitMods や GGG クライアント由来の文言はリッチテキストマーカーを
 * 含む。ゲーム内表示と同じく Display 側だけを残す。
 */
export function stripRichTextMarkers(s: string): string {
  return s
    .replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2")
    .replace(/\[([^|\]]+)\]/g, "$1");
}

/**
 * 数値を `#` プレースホルダに置換する。
 *
 * 入力例:
 *   - explicitMod (実値):  "+47 to maximum Life"             → "+# to maximum Life"
 *   - bundle text_en:       "+(30-40) to maximum Life"        → "+# to maximum Life"
 *   - explicit (レンジ):    "Adds 2 to 5 Lightning Damage"    → "Adds # to # Lightning Damage"
 *   - bundle (レンジ):      "Adds (1-3) to (4-7) Lightning"   → "Adds # to # Lightning"
 *   - explicit (%/小数):    "9.4% increased Cast Speed"       → "#% increased Cast Speed"
 *
 * 順序が重要:
 *   0. em-dash / en-dash → ハイフン (poe2db スクレイプ由来の `(20—30)` を吸収)
 *   1. レンジ括弧 `(min-max)` → `#`
 *   2. 単一括弧 `(num)` → `#`
 *   3. 裸の数値 `-?\d+(\.\d+)?` → `#`
 */
export function normalizeModTemplate(text: string): string {
  let s = text;
  s = s.replace(/[—–]/g, "-");
  s = s.replace(/\(-?\d+(?:\.\d+)?-{1}-?\d+(?:\.\d+)?\)/g, "#");
  s = s.replace(/\(-?\d+(?:\.\d+)?\)/g, "#");
  s = s.replace(/-?\d+(?:\.\d+)?/g, "#");
  return s.trim();
}

/**
 * mod-text-ja(.manual) 辞書のキーと集計テンプレを同一空間で突合するための正規化。
 * `normalizeModTemplate` + マーカー除去 + 小文字化 + trim。
 * "Adds # to # Fire Damage to Attacks" と "Adds # to # Fire damage to Attacks" の
 * 大小揺れを吸収する。
 */
export function normalizeModTextKey(text: string): string {
  return stripRichTextMarkers(normalizeModTemplate(text)).toLowerCase().trim();
}

/**
 * 入力文字列から数値部分だけを順序保ったまま抽出する。
 *
 *   "+47 to maximum Life"         → [47]
 *   "Adds 2 to 5 Lightning"       → [2, 5]
 *   "9.4% increased Cast Speed"   → [9.4]
 */
export function extractNumbers(text: string): number[] {
  const matches = text.match(/-?\d+(?:\.\d+)?/g);
  if (!matches) return [];
  return matches.map((s) => Number(s)).filter((n) => Number.isFinite(n));
}

/** 整数なら整数表示、小数なら 1 桁 (UI 表示の ModEntry.text と同じ規則) */
function formatAvgNumber(v: number): string {
  if (!Number.isFinite(v)) return "?";
  const rounded = Math.round(v * 10) / 10;
  if (Number.isInteger(rounded)) return rounded.toFixed(0);
  return rounded.toFixed(1);
}

/**
 * `#` プレースホルダ列を値で順序通り埋める。
 *   - values が空: テンプレートをそのまま返す
 *   - レンジ MOD (# が 2 個以上): 全 # を順序通りに 1 個ずつ埋める
 *   - 値が足りない `#` はそのまま残す
 */
export function fillTemplate(template: string, values: number[]): string {
  let i = 0;
  return template.replace(/#/g, () => {
    if (i >= values.length) return "#";
    const v = values[i++];
    return formatAvgNumber(v);
  });
}

/** テンプレ中の `#` の個数 */
export function countPlaceholders(template: string): number {
  return (template.match(/#/g) || []).length;
}
