# 名前のずれ (items-ja.json と poe2db、2026-10-22、記事編集長の指摘)

台本: items-ja.json (RePoE 由来、3,593 件) と items-ja-poe2db.json (poe2db の日本語の一覧ページの写し、642 件) の重なる 327 件を比べた。

| 英語 | items-ja.json (前) | poe2db (直した後) |
|---|---|---|
| Essence of the Abyss | 深淵のエッセンス | アビスのエッセンス |
| Rabid Talisman | 凶暴のタリスマン | 狂犬病のタリスマン |

ほかに直した物 (poe2db の日本語に合わせる、写しで決まらない物は poe2db の決まり):
- 「深淵の王の印」→「アビサルロードの紋章」(英語 Mark of the Abyssal Lord、keywords-ja / en と mod の文の写しと同じ): クラフト台の説明 (craft-stage-help.ts・craft-stage-help-mods.ts) の画面に出る 4 か所。英語の "the Abyssal Mark" も合わせた。
- 「カーガル」→「クルガル」(poe2db jp の Omen of the Blackblooded「ランダムなクルガルのモッド」、クライアントの日本語も同じ): poe2db-tag-fixes.ts のコメント 1 か所。
- 触っていない: コードのコメントの「深淵の王の印」「深淵のエッセンス」(画面に出ない)、アプリ版の計算機 views/htc-craft/ (当分触らない)、シミュレーター (シミュ部長の持ち物)、更新履歴 (過去の記録)。

残り: poe2db の写しは 642 件だけなので、items-ja.json の残り 3,266 件は比べていない。全部比べるなら scripts/build-items-ja-poe2db.mjs で poe2db の写しを取り直す (poe2db の一覧ページを読む)。
確かめ: 見張り (currency-spec-golden) 6/6、型 0。
