/**
 * POE2 アイテムカテゴリ ID の日本語ローカライズ
 * poe2scout の CategoryApiId 値を日本語に変換する
 */

const categoryJaMap: Record<string, string> = {
  currency: "通貨",
  essence: "エッセンス",
  omen: "オーメン",
  shard: "かけら",
  distilled: "蒸留",
  bone: "骨片",
  catalyst: "触媒",
  expedition: "遠征",
  sanctum: "聖域",
  ritual: "儀式",
  delirium: "錯乱",
  breach: "ブリーチ",
  ultimatum: "アルティメイタム",
  abyss: "アビス",
  fragment: "フラグメント",
  splinter: "破片",
  vaal: "ヴァール",
  rune: "ルーン",
  soulcore: "ソウルコア",
  tablet: "タブレット",
  jewel: "ジュエル",

  // ジェム系（参考、Currency Exchange に通常無いが将来用）
  "skill-gem": "スキルジェム",
  "support-gem": "サポートジェム",
  "spirit-gem": "スピリットジェム",
};

export function jaCategory(apiId: string): string {
  return categoryJaMap[apiId] ?? apiId;
}
