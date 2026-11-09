# poe.ninja の作者に聞く文の案 (2026-11-09、デイリー部長)

オーナー 11-09「全部ね修正に関係ある長今」の 2 (作者に聞く)。**送るのはオーナー**。部長は文の案だけ。
宛先の候補 (オーナーが選ぶ): poe.ninja の Discord (案内の欄にある作者への連絡の道)・GitHub の連絡先・Patreon のメッセージ。どこに何が書いてあるかは送る前にオーナーが見る (部長は調べに叩かない、Y-52)。

聞く事は 3 つ: ① この使い方で使ってよいか ② 第三者に向けた取り口 (公開の API・まとめのファイル・決まった間隔) があるか ③ 守ってほしい決まり (間隔・名乗り・出典の書き方)。
こちらの事実: 週 1 回・1 回 100〜250 本 (上限 400、2.5 秒以上あける)・名乗りに連絡先・残すのは「部位・ベース・MOD の行」だけでキャラ名とアカウント名は捨てる・画面に poe.ninja の数字や名前は出さない。

---

## 英語 (送る文)

Subject: Permission question — weekly use of poe.ninja PoE2 build data for a crafting challenge

Hi,

I run ExileDesk (https://exiledesk.com), a free Path of Exile 2 crafting emulator. We are adding a "Daily Craft" challenge: each day players try to craft one item, and the target items come from gear that top players are actually wearing.

To pick those targets, once a week we would like to read the PoE2 builds data on poe.ninja (index-state, build-index-state, the builds search and character endpoints) for the top 7 ascendancies, 3 builds each, and the top 3 characters per build by DPS. That is about 100–250 requests per week (hard cap 400), sent one at a time with at least 2.5 seconds between requests, with backoff on 429/5xx, and a User-Agent that includes our contact address.

From each character we keep only the rare items' slot, base type and mod lines. Character names and account names are discarded right after the weekly run, and we do not show poe.ninja numbers, names or rankings on our pages.

I understand the builds/character endpoints are meant for poe.ninja itself, so before doing this regularly I wanted to ask:

1. Is this kind of use OK with you?
2. Is there a preferred way for third parties to get this data (a public endpoint, a data dump, or a schedule you would like us to follow)?
3. Are there any rules you would like us to follow (rate, User-Agent, attribution)?

If you would rather we did not use it, just say so and we will stop. Thank you for poe.ninja — it is a huge help to the community.

Best regards,
(オーナーの名前) — ExileDesk
nekodori0612@gmail.com

---

## 日本語訳 (オーナーが読む用)

件名: 許可のお尋ね — クラフトの挑戦のため、poe.ninja の PoE2 のビルドのデータを週 1 回使いたい

こんにちは。

ExileDesk (https://exiledesk.com) という、無料の Path of Exile 2 のクラフトのエミュレーターをやっています。「デイリークラフト」という挑戦を足すところで、毎日 1 つの品をクラフトしてもらい、そのお題の品は上位のプレイヤーが実際に着ている装備から選びます。

お題を選ぶため、週 1 回、poe.ninja の PoE2 のビルドのデータ (index-state・build-index-state・ビルドの検索・キャラクターの口) を読みたいと考えています。範囲は上位 7 アセンダンシー × 各 3 ビルド × ビルドごとに DPS の上位 3 キャラです。週に 100〜250 本ほど (上限 400 本)、1 本ずつ・最低 2.5 秒あけて送り、429・5xx では待って下がり、User-Agent に連絡先を入れます。

各キャラから残すのはレアの装備の部位・ベース・MOD の行だけです。キャラ名・アカウント名は週の取得が終わったらすぐ捨て、こちらの画面に poe.ninja の数字・名前・順位は出しません。

ビルド・キャラクターの口は poe.ninja のための物だと理解しているので、定期的に使う前にお聞きしたいです:

1. この使い方で問題ないでしょうか？
2. 第三者がこのデータを得るのに望ましい方法 (公開の口・まとめのファイル・守ってほしい時間割) はありますか？
3. 守ってほしい決まり (頻度・User-Agent・出典の書き方) はありますか？

使ってほしくなければ、そう言っていただければ止めます。poe.ninja にはいつも助けられています、ありがとうございます。

(オーナーの名前) — ExileDesk
nekodori0612@gmail.com
