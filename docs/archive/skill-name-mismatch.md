# スキル名の食い違い (2026-09-20 洗い出し)

オーナー報告「スキル名間違ってる奴洗い出してくれ。アークメイジとかアーチメイジとか」。

クライアントの中に同じ物の日本語名が 2 つあり、訳が揃っていない:

- `ActiveSkills.DisplayedName` … スキルとしての名前
- `BaseItemTypes.Name` … ジェムそのものの名前 (ゲーム内でジェムに書いてある名前)

アプリが出しているのは監視するジェムなので、**ジェムの名前を優先**するようにした
(`src/i18n/skills-ja.ts` の `jaSkill`)。ベースが付与するスキル (ジェムに無い物) は今まで通り
`ActiveSkills` から引く。以下が切り替わった 34 件。

| 英語名 | これまで (スキル名) | これから (ジェム名) |
|---|---|---|
| Archmage | アークメイジ | アーチメイジ |
| Valako's Charge | ヴァラコズチャージ | ヴァラコチャージ |
| Wing Blast | ウィングバースト | ウィングブラスト |
| Wind Serpent's Fury | ウィンドサーペントズフューリー | ウィンドサーペントの怒り |
| Vaulting Impact | ヴォールティングインパクト | ヴォルティングインパクト |
| Enervating Nova | エナーベイティングノヴァ | エナヴェイティングノヴァ |
| Elemental Sundering | エレメンタルサンダリング | エレメンタルサンダーリング |
| Ember Fusillade | エンバーフューシレイド | エンバーフシレイド |
| Galvanic Shards | ガルバニックシャード | ガルヴァニックシャード |
| Convalescence | コンバレセンス | コンヴァレッセンス |
| Conductivity | コンダクティヴィティ | コンダクティビティ |
| Companion: {0} | コンパニオン: {0} | コンパニオン：{0} |
| Siphoning Strike | サイフォニングストライク | サイフォンストライク |
| Gemini Surge | ジェム二サージ | ジェミニサージ |
| Shattering Palm | シャッタリングパーム | シャタリングパーム |
| Staggering Palm | スタガリングパーム | スタッガリングパーム |
| Spell Totem | スペルトーテム召喚 | スペルトーテム |
| Thrashing Vines | スラッシングバイン | スラッシングヴァイン |
| Defiance Banner | デファイアンスバナー | ディファイアンスバナー |
| Triskelion Cascade | トリスケリオンカスケード | トリスケリオン・カスケード |
| Hammer of the Gods | ハンマーオブゴッズ | ハンマーオブゴッド |
| His Winnowing Flame | ヒズウィノウイングフレイム | ヒズウィノーイングフレイム |
| His Scattering Calamity | ヒズスキャッタリングカラミティ | ヒズスキャタリングカラミティ |
| Purity of Fire | ピュリティオブファイア | ピュリティオブファイヤー |
| Fulminating Concoction | ファルミネーティングコンコクション | フォーミネイティングコンコクション |
| Into the Breach | イントゥーザブリーチ | ブリーチ侵入 |
| Meditate | メディテイト | メディテート |
| Repulsion | リパルション | リパルジョン |
| Resonating Shield | レゾネーティングシールド | レゾーネーティングシールド |
| Rhoa Mount | ロアマウント | ロア騎乗 |
| Demon Form | デーモンフォーム | 悪魔形態 |
| Cast on Melee Kill | 近接撃破時キャスト | 近接キル時キャスト |
| Navira, the Last Mirage | 最後の蜃気楼、ナヴィラ | 最期の蜃気楼、ナヴィラ |
| Alchemist's Boon | アルケミストブーン | 錬金術師の恩恵 |
