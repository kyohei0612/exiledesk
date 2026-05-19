/**
 * POE2 アイテムテキストパーサー（クリップボード形式）
 *
 * ゲーム内 Ctrl+C / トレードサイト の "Item Class: ... ---- Item Level: N ----- mod 行..." 形式を
 * 構造化する。日本語版・英語版の両方に対応。
 *
 * このモジュールは CraftHelper.vue から切り出した共通パーサー。
 * tool-dps（装備 DPS 比較ビュー）も同じパース仕様で動作することで、
 * UX 統一・メンテナンス簡素化を図る。
 */

export interface ParsedClipboard {
  name?: string;
  base?: string;
  itemLevel?: number;
  quality?: number;
  qualityCategory?: string;
  /** explicit mod 行（暗黙・enchant 等を除いた本体 mod） */
  modLines: string[];
  /**
   * 暗黙とみなした mod 行（セクション ≥ 2 のとき先頭セクション）。
   * 暗黙無視方針 (2026-05-09) なので tier matching には渡さないが、
   * 誤判定確認のため保持。空配列なら「暗黙なしと判定された」。
   */
  implicitLines: string[];
  /** "プレフィックスモッド +1個" 等から抽出（黄昏の指輪等の +/-1 ベース用） */
  prefixDelta?: number;
  suffixDelta?: number;
  /** PoB に投げる際に使う元テキスト（trim 済み） */
  raw?: string;
}

/**
 * クリップボード形式テキストを ParsedClipboard に変換。
 * - 行ベース。アイテムレベル行を境に metadata セクション → mod セクション に切替え。
 * - metadata セクションでは name → base の順に取得。
 * - mod セクションでは modLines にそのまま蓄積。
 * - 空・無効テキストは null。
 */
export function parseJaClipboard(text: string): ParsedClipboard | null {
  const raw = text.trim();
  if (!raw) return null;
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const result: ParsedClipboard = { modLines: [], implicitLines: [], raw };
  let inModSection = false;
  /**
   * mod セクション群（`--------` 区切りで分割）。
   * - 暗黙 (implicit) アイテムでは: [0]=暗黙 / [1]=explicit / ([2+]=corrupt 等)
   * - 暗黙なしアイテムでは: [0]=explicit
   * 後段で「セクション数 ≥ 2 なら先頭 = 暗黙とみなして捨てる」ヒューリスティックで
   * explicit のみ抽出。暗黙無視はオーナー判断 (2026-05-09)。
   */
  const modSections: string[][] = [];
  let currentSection: string[] = [];

  // 英語版 metadata で skip 対象のプリフィックス
  const EN_SKIP_PREFIXES = [
    "Item Class:",
    "Rarity:",
    "Sockets:",
    "Requires",
    "Physical Damage:",
    "Elemental Damage:",
    "Chaos Damage:",
    "Attacks per Second:",
    "Critical Hit Chance:",
    "Critical Strike Chance:",
    "Armour:",
    "Evasion Rating:",
    "Energy Shield:",
    "Block chance:",
    "Block Chance:",
    "Spirit:",
  ];

  for (const line of lines) {
    // アイテムレベル（JA / EN）
    const ilvl = line.match(/^(?:アイテムレベル|Item Level)\s*[:\s]\s*(\d+)/i);
    if (ilvl) {
      result.itemLevel = parseInt(ilvl[1]);
      inModSection = true;
      continue;
    }
    // 品質（カテゴリ付き: "品質 (アタックモッド): +14%" / "Quality (Attack Modifiers): +14%"）
    const qmCat = line.match(
      /^(?:品質|Quality)\s*\(([^)]+)\)\s*[:\s]\s*\+?(\d+)%/i,
    );
    if (qmCat) {
      result.qualityCategory = qmCat[1];
      result.quality = parseInt(qmCat[2]);
      continue;
    }
    // 品質（カテゴリなし）
    const qm = line.match(/^(?:品質|Quality)\s*[:\s]\s*\+?(\d+)%/i);
    if (qm) {
      result.quality = parseInt(qm[1]);
      continue;
    }
    // 「品質の最大値」/ "Maximum Quality" 等は無視
    if (line.startsWith("品質の最大値") || /^Maximum Quality/i.test(line))
      continue;

    // ベース固有の prefix/suffix +/-N 個 修飾子（黄昏の指輪 等）
    const pd = line.match(
      /^(?:プレフィックスモッド|Prefix Modifier(?:s)?|Prefix Modifiers?)\s*([+\-]?\d+)個?/i,
    );
    if (pd) {
      result.prefixDelta = parseInt(pd[1]);
      continue;
    }
    const sd = line.match(
      /^(?:サフィックスモッド|Suffix Modifier(?:s)?|Suffix Modifiers?)\s*([+\-]?\d+)個?/i,
    );
    if (sd) {
      result.suffixDelta = parseInt(sd[1]);
      continue;
    }

    // 日本語スキップ metadata
    if (line.startsWith("品質") || line.startsWith("ソケット")) continue;
    if (line.startsWith("必要")) continue;
    if (
      line.startsWith("攻撃力") ||
      line.startsWith("アーマー") ||
      line.startsWith("回避") ||
      line.startsWith("エナジーシールド") ||
      line.startsWith("ブロック")
    )
      continue;
    if (line === "腐敗" || line === "鏡映" || line === "壊れた") continue;

    // 英語スキップ metadata
    if (EN_SKIP_PREFIXES.some((p) => line.startsWith(p))) continue;
    if (
      line === "Corrupted" ||
      line === "Mirrored" ||
      line === "Split" ||
      line === "Unidentified"
    )
      continue;

    // セクション区切り
    if (line.match(/^---+$/)) {
      if (inModSection && currentSection.length) {
        modSections.push(currentSection);
        currentSection = [];
      }
      continue;
    }

    if (!inModSection) {
      if (!result.name) result.name = line;
      else if (!result.base) result.base = line;
    } else {
      currentSection.push(line);
    }
  }
  // 末尾セクションを flush
  if (currentSection.length) modSections.push(currentSection);

  // 暗黙 vs explicit 振り分け:
  //   セクション 1 個 → 全部 explicit（暗黙なしベース、または magic で暗黙なし）
  //   セクション 2 個以上 → 先頭 = 暗黙とみなして implicitLines に分離、
  //                         残りを modLines (explicit + 終端の corrupt mod もここ)
  // 仮定: POE2 のクリップボード形式は Item Level 後の最初のセクションが必ず
  // 暗黙系（暗黙無いベースは「Item Level の次は explicit が直接来る = セクション 1 個」）。
  // 誤判定があれば implicitLines を確認すれば原因特定可能。
  if (modSections.length <= 1) {
    result.modLines = modSections[0] ?? [];
  } else {
    result.implicitLines = modSections[0];
    result.modLines = modSections.slice(1).flat();
  }
  return result;
}
