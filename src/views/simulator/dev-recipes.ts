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
  { name: "見本: 不在のアミュレット B", code: "xVjLbttGFP0V465pRDOiRIk72U2DAEEbxIsuCqMYktcV6-FQmRkaFgwtWm0CFP2DAAUKJOgi6Lr_o7boZxQzfGgsmTFpq8mGoMB5nHPPvXOP5gauIKQeCAjh3_c___P2Q3j015-__P32982Pf2x--m2z_nWzfrdZf9is15v1m6MT8EBDeAMqnmPGIAS8TjkmqC6PtUR8QsGDiCmEEGaRQqGPZlnBUYMHqcbsBV4hhzAYeZDyK_5lqiHUskAPlGbSriyZTPUSQvOC4EGWJwrCb89XHih8DSElHkT5NSoLo56VJhBWvzy4hnDgwdI-80I7X1iaQSgKzj2YM5GYmXEhJYp4abkwbkblGQq7pwcx04wvla5nvS4Yt_AGHkhcIGu-XEjEkszK7moWgMjGY2geBM5NaOLLekKSC6zfF0yiqJZa2cE1p4iUhMh0UHIajhtWTCzv5RTPWa4exsnl4RsKI_MYd-HRBFzkL3Klm7hEdEuMlsSOG2YBbZjN00atG5MBz82MMpPUkxOm8GyRSjtGpyghJKtPJejExCDoEYOVTYCG9dDNz66Mn4tYIlOYnDKlzxaIyX3MDyQ7GdvUDexz0pO1v2XtV0k8ogeUuty4wtoFmq0lkc8KnZ_YsXVWjrZIRzvldlCJDod4vEU8LhFTOtlD_EMhLu86Ie7GUe7WjoPtoQi2KIK6mmuJyWDS66D6H2qVDEzeTjulbURtzk62jCYVoyawZDL4rLlAW3JhusU8rVUgfoXZ93upkKDCWDKNjhLwdYYiv_gCr7Vk_CuMZZ4xM9yrvsyipVKMP43nOSp46FFD7CFDu6kVWLXIwOmTg91-8rn1Clr0Im53J3t1c1DUt0tMKRQxhguUFxjrsF7pZfn7afn5u1eFSONvmExeoowNl71UOEtFqkwynMql0ozzVDGd5uLB2pcOye-m_bTU3rESpPYSwXg_iG2H4ENCU0WEfY-mGtA61bZCOVRsRr2i4lgNMtytCDrq2M3uz4j-5QEZSwXcaiqkxOwYBeLvnmCUbA0vN17yEzleYs7SiNoWQjuZ9y0hx0-Q0U5qunxaTuS29jxtb89l9yKOLSCVLzge9m1fBzZdw7Zj0HEPJHBtsWsd2iRviVH9v6Mdyr6LIU7TJ1XXb4LmQOnrpoZ9cTiNnEx3-0Ln2n2kfHeUqW-TizrNlg72ytSB11OzjwSq3trpmJTsFtToEYbX_9jWeyKtysuN03muUNQ3Fxlm-SzNzMr7YjzjecR43arPFsj52WXK-bP6LqSRyJhYFutCYlKnRFdt-3qDx5z359VVzatb1zSr1X8" },
];
