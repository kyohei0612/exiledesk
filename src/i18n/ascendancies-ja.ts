/**
 * POE2 アセンダンシー英語 → 日本語マップ
 *
 * Rust 側 poe.ninja クライアントは `build-index-state` から取れる英語表記
 * (`"Blood Mage"` / `"Oracle"` / …) をそのまま `class` フィールドとして emit する。
 * UI 側では POE2 公式日本語クライアントのカタカナ転写に揃えて表示する。
 *
 * 不明なクラス (新アセンダンシー追加時など) は英語のまま返す (fallback)。
 */

const ascendancyJaMap: Record<string, string> = {
  // === Witch 系 ===
  "Blood Mage": "ブラッドメイジ",
  Infernalist: "インフェルナリスト",
  Lich: "リッチ",
  // === Sorceress 系 ===
  Stormweaver: "ストームウィーバー",
  Chronomancer: "クロノマンサー",
  // === Monk 系 ===
  Invoker: "インヴォーカー",
  "Acolyte of Chayula": "チャユラ", // オーナー指示 2026-05-22: 短くカタカナ
  "Martial Artist": "マーシャルアーティスト", // 0.5 新規
  // === Ranger 系 ===
  Deadeye: "デッドアイ",
  Pathfinder: "パスファインダー",
  // === Mercenary 系 ===
  "Witch Hunter": "ウィッチハンター",
  Witchhunter: "ウィッチハンター", // poe.ninja の表記揺れ (スペースなし) も対応
  "Gemling Legionnaire": "ジェムリング・レジオネア",
  Tactician: "タクティシャン",
  // === Warrior 系 ===
  Titan: "タイタン",
  Warbringer: "ウォーブリンガー",
  Smith: "スミス",
  "Smith of Kitava": "キタヴァ", // オーナー指示 2026-05-22: 短くカタカナ
  // === Druid 系 ===
  Shaman: "シャーマン",
  // === Huntress 系 ===
  Amazon: "アマゾン",
  Ritualist: "リチュアリスト",
  Oracle: "オラクル",
  "Disciple of Varashta": "ヴァラシュタ", // オーナー指示 2026-05-22: 短くカタカナ
  "Spirit Walker": "スピリットウォーカー", // 0.5 新規
  // === ベースクラス (アセンダンシー未選択キャラ、念のため網羅) ===
  Witch: "ウィッチ",
  Sorceress: "ソーサレス",
  Monk: "モンク",
  Ranger: "レンジャー",
  Mercenary: "マーセナリー",
  Warrior: "ウォリアー",
  Druid: "ドルイド",
  Huntress: "ハントレス",
  Templar: "テンプラー",
};

export function jaAscendancy(className: string): string {
  return ascendancyJaMap[className] ?? className;
}

/**
 * アセンダンシーに対する装飾アイコン (錬金術記号風)
 *
 * 既存 V2B モックで使われていた絵文字を踏襲。未知クラスは汎用の "✦"。
 */
const ascendancyIconMap: Record<string, string> = {
  "Blood Mage": "🜍",
  Oracle: "🜔",
  Pathfinder: "🜂",
  Shaman: "🜄",
  Titan: "🜛",
  Invoker: "🜃",
  Stormweaver: "🜁",
  Infernalist: "🜚",
  Deadeye: "☿",
  Chronomancer: "🜺",
  Lich: "🜉",
  "Acolyte of Chayula": "🜏",
  "Martial Artist": "🝃",
  "Witch Hunter": "🜟",
  Witchhunter: "🜟",
  "Gemling Legionnaire": "🜘",
  Warbringer: "🜞",
  Smith: "🜠",
  "Smith of Kitava": "🜠",
  Amazon: "🝀",
  Ritualist: "🝁",
  Tactician: "🝂",
  "Disciple of Varashta": "🝅",
  "Spirit Walker": "🝆",
};

export function ascendancyIcon(className: string): string {
  return ascendancyIconMap[className] ?? "✦";
}
