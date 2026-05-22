/**
 * POE2 アイテムカテゴリ ID の日本語ローカライズ
 * poe2scout の CategoryApiId 値を日本語に変換する
 *
 * v0 段階の暫定マップ。POE2 公式日本語クライアントは **基本カタカナ語**を使うため、
 * 「遠征」ではなく「エクスペディション」のように転写する。
 *
 * **TODO**: 将来 RePoE fork (poe2) の正規 JA データに置換し、機械的に検証する。
 *   - https://github.com/repoe-fork/poe2
 */

const categoryJaMap: Record<string, string> = {
  // === 通貨基本 ===
  currency: "カレンシー",
  shard: "シャード",
  catalyst: "カタリスト",
  splinter: "スプリンター",
  fragment: "フラグメント",
  fragments: "フラグメント",

  // === 強化系（POE1 系譜） ===
  essence: "エッセンス",
  essences: "エッセンス",
  omen: "オーメン",
  rune: "ルーン",
  runes: "ルーン",
  jewel: "ジュエル",

  // === リーグ機構（POE2 公式日本語はカタカナ転写） ===
  expedition: "エクスペディション",
  sanctum: "サンクタム",
  ritual: "リチュアル",
  delirium: "デリリウム",
  breach: "ブリーチ",
  ultimatum: "アルティメイタム",
  abyss: "アビス",
  incursion: "インカージョン",

  // === POE2 固有 ===
  vaal: "ヴァール",
  bone: "ボーン",
  distilled: "蒸留した感情",
  soulcore: "ソウルコア",
  tablet: "タブレット",
  idol: "アイドル",
  lineagesupportgems: "リネージュサポート",
  uncutgems: "ジェムの原石",
  vaultkeys: "聖遺物の鍵",

  // === ジェム系（参考、Currency Exchange に通常無いが将来用） ===
  "skill-gem": "スキルジェム",
  "support-gem": "サポートジェム",
  "spirit-gem": "スピリットジェム",
};

export function jaCategory(apiId: string): string {
  return categoryJaMap[apiId] ?? apiId;
}
