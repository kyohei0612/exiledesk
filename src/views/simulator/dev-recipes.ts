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
  { name: "見本: 不在のアミュレット B", code: "xZbPattAEMZfJcx5QxTLtpy9JaENgUJDfOihhLKWxnjr1a6zuwo2RofWl0LpGwQKhZYeQs99H7Wlj1FW_6y0NrHThl6ExGpH3_eb2dHM4Qpoi4AECj8_vf1xfUN3vn199_36c_bqS_b6Q7Z4ny0-ZoubbLHIFm92joCABToHE44wZkABp1xghGa8azXiXgsIDJhBoHA4MCjtzmGcCLRAgFuMn-AVCqBBhwAXV-Ixt0CtTpCAsUznkTXT3M6AuhsEArGKDNDnFwSGWsVAYahZaBONEaQEDF4C9T0CAzVFkyurAvEIaPlEYArUIzDLryqxjRXGY6AyEYLAiMnI7QwTrVGGs9weE-4tFaMsZYTMMjEzttp1mTCRK_YIaJwgK1fS_EtuEwxaOZeWn1_bcOEgheMqQqQkVvcTplEuI7idlZciyhTobicozASt2s6I12bmjtmp21GwN3tHzGB_wnX-juWogbbSlX7DEVNme79zSKTlotYRs2lp4RaFYBPnZWbSAtjSvN9M46bOT2WokRmMjpmx_QliVBPw_weB3rYE2g0C7YJAlX2_WzN4mcjxnbX8sM46eW13t_XXafjrFP783j-s7uLLpcxaW3mWVoorOLPEqqP8Xdef0sLbUmq3kBp0H6Ac10r2t5YcNCQHvzWPfa_3UGcIjUEZIp2gHmJoaRXprHh-VCy_OE8kD58xHZ2hDp2TZW3C0xilGva55MZqJo71zFgmBDfMciXhvn34wFWp721Upa5Gcoq9BsVeswttjPB-JRqsz7e_Ot8HDaUHZb6rGt1vtzcTe3eWCgf7dzhoooWYcQm3LAQ5XN9bSva9UnLVAZqShTIrf9dr6GmsfvBrCAbg-pebVY5HyqCsBpEYY3XIYxftTzQnQg2YqA5Ef4JC9MdciJNqtKnZkMacUuZn07LY9gT-TQYvysnr_NbUlaa_AA" },
];
