/**
 * dev-recipes.ts — 開発版 (手元の dev・preview:prod -- --dev) だけ、保存したレシピに見本を最初から入れる (10-26 オーナー「開発レシピにあるはず」、モンキー 7 の 23:
 * 新しい profile の 1440 ではレシピが 0 件で、アミュ B を画面から開けなかった)。本番のビルドには入らない (DEV_BUILD)。
 * 中身は共有 URL の # の後ろ (recipe-share の packJson)。同じ名前のレシピがあれば足さない (消した後も、名前を変えれば次に開いた時また入る)
 */
export const DEV_RECIPES: ReadonlyArray<{ name: string; code: string }> = [
  // 不在のアミュレット B を白紙から今の作りで組んだ物 (10-26 オーナー「レシピ古いのだと思うから新しいバージョンで再度表示して」「分かりやすいように高貴で狙わないようにして」、シミュ 30)。
  // 始めの高貴は狙い無し (埋めるだけ) → 打った後 + 付きうる狙いの当たりの箱 (スピリット・キャスト)。打った後にカオス (当たり 2 つ・外れ = 再度挑戦、狙いが消えたは無い)。
  // スピリットは狙い無しの高貴 2 回 → 冒涜 → エッセンス、キャストは自分の箱でカオス (スピリット狙い)、エッセンスの狙いが消えたもカオスで当たりを完成。
  // 300 人 完成 299・止まり 1 (人が選んだ形違いの戻りから、精査に出る)。名前は「見本 3」(前の見本・見本 2 がある所にも入るように)
  { name: "見本 3: 不在のアミュレット B", code: "vVhNa-NGGP4r5j21oGU9svylW5Jul4WlXdaHHkooI-lNrWYkeWdGISb44PhSCD301sPClkJLoUsLpYf-H3XL9l-UGUn2xLISyZvkImykmXme93k_HukCzsC1LYjBhfe_XP37-m3Hdjv__P3du9e_Zsvfs8ufstWbbPVztnqbrVbZ6tvOYeej_3774f2ff2XLP969ucoul9nlVbb8MVt-_zFYIMG9AOFPMaLgAp6HDAMUp48kR3xMwAKPCgQXDjyBsewcRClDCRaEEqPneIYM3GHfgpCdsU9DCa7kKVogJOV6Z055KOfgqh8IFkRJIMD98nhhgcBX4NrEAi85R6FhlKvCANzinwXn4HYtmOtrkkrjDg0jcOOUMQumNA7USj_lHGN_rrlQpp5KIoz1mRb4VFI2F7Jc9SqlTMPrWsBxhnR954Qj5mQW-lS1AXi2ikdPXQgcq9D4p-WCIImx_D2jHONiq4V-uOTkkZyQbeeUbGdNisbzWyn5U5qI_SiZNBzFoK8ugyY01vGOk-eJkOuwePaGl53zerSD2DRca3Wh9H-mFuR5JB4fUoGTWcj1MzJEDi5ZPJScIxWCYYsQLLT8a9I9MzubMn4W-xypwOCICjmZIQa3Mb8j1clAJ-5QX0ctWTsb1o7J2hndgc75qQXQNa48qXbi0mVEU5kc6ifLfOxvQPav11lTmI3EqYPbawl3sIE7yOE6TgXuN2l8uqsv1IEgLUEMNyCGZQ33KiiaNKd7KFDSVck6bpSrnq0TdbThMyr4OP0HTAJSL4C9U4DxBvC4AEyKrB3arQQIUKDPqURDBPg8wjg5-QTPJafsM_R5ElH1uFXcOfDmQlD2xJ8mKGDf1qKNArGbCTXUQpGuMRW7BfOeU2F-f1KNapUa7lSKmHOcbBXLeHBf7R-FwNhHd4b8BH3plju9yP8_yW9_9TKNQ_8LyoMXyH3Fo5IEkzAOhUqDIz4XkjIWCirDJN5b9dwJOc1UH-eqG56BlKaBVEJY1_X2CUwRD_o1qipA7UfrCuSuItNvFRPDUpDeViUQu9sssW5Ph2Z1YeKFiIYxXBsiJIds-AHibLUtEzJThvGBbC1R_dOz9cywGxn0DR_DOpDCOxBSpVPThus6zLh-GOfTihgegBQmYDB4AGt1w5jq7W5-hlEghVMYjSpI6_SuwVG-WbRCYox4Mlpr9cHOqd6-1eAwJjcZb5etcxcvQHtVqKMzyzbGq93drlADXUvFbnK5xcnGmLSLMVnKYx7c2tk6N51cUWiRf7o4miYC4_K7RIRRchBGaueqFE9Z4lFWDujJDBmbnIaMPS2_dKwFUn6V-jLlGJT50FTZto7gQxr9cfEh5uW1jzCLxf8" },
];
