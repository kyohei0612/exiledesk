# poe.ninja をデイリーのお題の控えに使えるか (2026-11-01、リサーチ長)

頼み: オーナーの決め「案 1 + 4」(ninja の上位の装備を週 1 回手元で集計 → 候補 → オーナーが選ぶ → 曜日で難易度) の取得の可否。
読んだのは公開のページだけ。API の本体は 1 本も叩いていない (Y-52)。引用は取得の道具の要約を通した物なので、決める前に原文を一度見る事。

## 結論

| やり方 | 結論 | 理由 |
|---|---|---|
| 台本で poe.ninja の builds / キャラの口を週 1 回叩く | **できない** | poe.ninja の API の案内が、builds / profiles・キャラの口を内部用と明記。第三者には出していない |
| 公開の economy の口で集計 | **できない** (許可はあるが中身が違う) | 値段だけ。ビルド・装備・MOD は無い |
| GGG の公式 API で集計 | **できない** | 新規の登録を止めている。他人のキャラの装備を取る scope も書かれていない |
| 公式のラダー・サイトを台本で抜く | **できない** | GGG の利用規約 7.3 (ボット)・7.6 (情報の抽出の道具) に当たる |
| オーナーが普通に poe.ninja を見て、手で MOD を拾う | **条件つきでできる** | 人が見るのは普通の利用。自動にしない事・丸写しして公開しない事が条件。明文の許可ではない |
| poe.ninja の作者に頼む | **聞く価値あり、望みは薄い** | 負荷とプライバシーを理由に出していないと書いてある。Discord が窓口 |

**おすすめ**: 案 1 + 4 の「手元で集計」を台本から**人の手**に替える。週 1 回オーナーが poe.ninja で部位ごとに上位の装備を見て、手で控えに写す。数字は「上位の何割」ではなく「よく見た MOD の組み合わせ」で十分 (候補 10 個ほどをオーナーが選ぶので、割合の精度はお題の質に効かない)。

## 分かった事

### 1. poe.ninja の PoE2 の中身
- PoE2 の Economy / Builds / Passive Skill Tree がある ([トップ](https://poe.ninja/poe2))。
- ビルドの元は公式のラダー API の上位キャラ ([載らない時の案内](https://poe.ninja/docs/character-not-listed-poe2))。公式の PoE2 ラダーは API で上位 1000 件まで ([公式の仕様](https://www.pathofexile.com/developer/docs/reference))。
- 第三者のガイドでは: クラス・アイテム・キーストーン等で絞れて、各項目に「使っているキャラの割合」が出る。対象は上位キャラ + アカウント連携したキャラ、装備を外した・HC で死んだキャラは除く。割合は人気で、強さではない ([gamespuma](https://gamespuma.com/poe2-ninja/))。
- 更新: economy は PoE2 で約 1 時間ごと ([API の案内](https://poe.ninja/docs/api))。builds の頻度は公式の記載が見つからない。

### 2. 利用の条件
- [poe.ninja の API の案内](https://poe.ninja/docs/api) が今回の答えの本体:
  - 公開の口は economy (リーグ一覧・Exchange・stash の値段) だけ。
  - builds / profiles・キャラ・PoB・認証は "not available for third-party use"。負荷が高い事とプライバシー設定を守る必要がある事が理由。
  - 行儀の悪い利用者・使いすぎはブロックする。サイトの丸ごとの複製は禁止。
  - economy を使う時の作法: 分かる User-Agent (連絡先入り)・ETag のキャッシュを守る・自前のサーバーを経由する。
- [robots.txt](https://poe.ninja/robots.txt) は `/dev/` だけ禁止。**ただしこれは許可の根拠にならない**。API の案内の明文が先。
- 利用規約のページはフッターに見当たらない ([トップ](https://poe.ninja/poe2) のフッターは privacy のみ)。[privacy](https://poe.ninja/privacy) にゲームのキャラ情報の決まりは無い。
- 窓口: [support](https://poe.ninja/support) は Discord (discord.gg/7qSRyKdyre)。メールは privacy に support@poe.ninja があるが、個人情報の請求の用途。許可を出す手続きは書かれていない。
- 公式 API: 第三者の利用自体は可だが ["We are currently unable to process new applications."](https://www.pathofexile.com/developer/docs/index)。ラダーの scope `service:leagues:ladder` はあるが、キャラの装備は `account:characters` で[認可した本人の分だけの説明](https://www.pathofexile.com/developer/docs/authorization)。PSAPI は PoE1 のみ。
- [GGG の利用規約](https://www.pathofexile.com/legal/terms-of-use-and-privacy-policy): 7.3 ボット、7.6 情報の抽出の道具、7.9 逆解析を禁止。[開発者の案内](https://www.pathofexile.com/developer/docs) も文書外の口の逆解析を禁止。
- 出どころの書き方: 決まった型は見つからない。書くなら「poe.ninja を参考」+ GGG の非提携の文 ("This product isn't affiliated with or endorsed by Grinding Gear Games in any way." これは公開アプリに求められている文で、ExileDesk で既に出しているかは未確認)。**お題の画面で「poe.ninja の集計」と言わない**。集計の数字を載せるなら別の話になる。

### 3. 集計に使える形
- 手で拾うなら入口は既にある: `src/services/simulator/paste/item-text.ts` の `parseItemText` (S-08) が、ゲームの item text の文を ExileDesk の MOD に当てる。読めない行は読めないまま出る。
- poe.ninja のキャラのページから item text の形でコピーできるかは**未確認** (「Copy PoB Code」はある、と[ガイド](https://poetrades.net/poe-ninja-guide-2026/)。PoE2 で同じかは書かれていない)。出来なければオーナーが目で読んでシミュで選ぶ。
- 上位の数の見方: 「上位 1000」の中の割合。割合は人気の物なので、**控えの選びでは「多い + 作れる + ベースが合う」をオーナーが見る**のがよい。

### 4. 無理な時の代わり
- 公式のラダー ([pathofexile2.com/ladders](https://www.pathofexile2.com/ladders)): 手で見るだけなら可。装備が見えるかは未確認 (JS で読めず)。
- 公開の別の集計: PoE2 の MOD の使われ方を集計したサイトは見つからなかった。
- 手書きのビルドの案内 (maxroll・mobalytics 等): 部位ごとの優先の MOD が書かれている物があるとの紹介はあるが、中身は未確認。手で読む代わりとしては使える。
- 既存の手元: オーナーの完成品・利用者のクラフトボックスの投稿 (D-xx)。外の取得が要らない。

## 確かめられなかった事
- poe.ninja の PoE2 のキャラのページで MOD の全文が見えるか、絞り込みに MOD の項目があるか。ページは JS で描くので読めなかった。**画面を開くと裏で内部の口が動くので、頼みの範囲を越えると見て開いていない**。オーナーが 1 分見れば分かる。
- 今のリーグと、builds の更新の頻度 (ガイドに Forbidden Rites 2026-09-04・0.5.5 の記述はあるが公式で未確認)。
- 作者に頼んだ時の返事 (未連絡。送るならオーナーの判断)。
- 「個人が手で週 1 回見て控えを作る」を明文で許した文は無い。禁じる文も無い。

## どの部に何が効くか
| 部 | 効く事 |
|---|---|
| デイリー部長 | 控えの作りを「台本で取得」にしない。入口の「忍者」は**利用者が自分で貼る**形なら問題なし、サーバー・台本が ninja を取る形は不可 |
| ブラック / オーナー | Y-52 に poe.ninja の builds は 1〜2 本の試しも避ける旨を足すかの判断。Discord で聞くかの判断 |
| 動画 | 画面に映す・出典に書く時は今まで通りでよい。今回の調べでは変わらない |
