/**
 * dev-recipes.ts — 開発版 (手元の dev・preview:prod -- --dev) だけ、保存したレシピに見本を最初から入れる (10-26 オーナー「開発レシピにあるはず」、モンキー 7 の 23:
 * 新しい profile の 1440 ではレシピが 0 件で、アミュ B を画面から開けなかった)。本番のビルドには入らない (DEV_BUILD)。
 * 中身は共有 URL の # の後ろ (recipe-share の packJson)。同じ名前のレシピがあれば足さない (消した後も、名前を変えれば次に開いた時また入る)
 */
export const DEV_RECIPES: ReadonlyArray<{ name: string; code: string }> = [
  // 不在のアミュレット B (10-26 オーナー「一旦整理して」で見本は 1 つ。前の「見本 2・3」は recipe-share の seedDevRecipes が開いた時に消して入れ替える)。
  // 始めの高貴は狙い無し (「分かりやすいように高貴で狙わないようにして」) → 打った後 + スピリット・キャストが付いた。打った後にカオス (外れは再度挑戦)。
  // 当たりの箱には自動の矢印を引かない (「狙いついたらシンプルにプラスボタン」) ので、カオスで付いた当たり 4 つ + エッセンスの先 1 つは次の手が未定 (静かな「＋ 次の手」)。
  // 100 人は未定の所で止まる (見本を完成まで回す形は今はやらない、オーナー「A」)。箱の幅・高さを変えた木の形 (schema 2) で整列済み
  // 10-28: 当たりどうしの統合を外れの側・種類・数で比べる決め (オーナー「精査で出してアミュ B のつなぎも直して」) で、外れの形の違う 2 つのつなぎを組み直した:
  // 外れ → カオスのスピリット (外れ 1 つ) は高貴 (キャスト ☑) → キャストは b27 へ・外れは b22 へ、キャスト → カオスのスピリット (外れ 2 つ) は b27 と同じルーンの合金 + 左側の結晶化 (当たりは完成、狙いが消えたは作り直し)
  { name: "見本: 不在のアミュレット B", code: "zVdBa9swFP4r5Z1dmlhxnOjWlq0UBivLYYdRhmK_EC2ynEpySQg5bLkMxv5BYTDY2KHsvP-TbexnDMt24rTJ6mwp68XYyHr6vu99enqawCVQ1wEJFH59fvfz6pruff_2_sfVl_nrr_M3H-ezD_PZp_nsej6bzWdv947AAQN0AjroY8SAAo64wBD1YN8oxAMXHOgyjUDhsKtRmr3DKBFowAFuMHqClyiA-p4DXFyKx9wANSpBB7RhykZWTHEzBpq-IDgQxaEG-uLcgZ6KI6DQUywwicIQpg5ovABKGg504xFqi6wIxEOg-ZcDI6A1B8b2GSemNMJ4BFQmQjjQZzJMZwaJUiiDsaXHRPpXHKHMYQTMMDHWpph1kTBhEdccUDhElo9M7UrpJOi6VheX2GcDzlORgkERIYwlFu9DplAuI6QzCy5ZlBHQfb-ZkSHNBZ0-X5CZpJqdpjMy7fXBEdPYGXJl_zEcFVB3upZv0Gex3p7vBBJpuFjgiNgop7Cigl-FeZ6ZaSbYkjwpp7Eq81MZKGQaw2OmTWeIGC4UIP9Dgda2CjRKCjQyBeq1hndThFeJHNxp5vul5llzN7cl6JUIehnBwt6-u2t772g7k3rKlbiVuKZ5m2bSLJk281QSsh3VSn7OAORoFxDzLbQRowMsMfGR_TetyRazX8Ls36g-O8W8miatUQZIh6h6GBhaRDrLvh9lwy-fJZIHz5kKz1AFKZFlYuFphDLudbjk2igmjtVYGyYE18zwWMLf1vG2TXytYuLdLPGtkoitchW7B4M_VOWIPftIpbPPOtUq1y4p187t1_Yy8eq1VjX17uaeSVq_YwOVAUPEuIQVyL6FTGpLyKSWQ_b825BFrNe2Hxs2r8KiYdmgWL58vbR8PVt-3er3WGT8zRi9tUWGlFockrc465K86YzbiMT9ExK7cqm_IHl_sV9vP0x_tTLIpYaAFA3BGsS7tlcL0tM-be2P-7FGWfTtEUbxIY_SaLeVORFxl4nCTp0hCtEZcCFOipvAQhqn1NbnxqhaBrf1778k8Dy_qDxbuaRMp78B" },
];
