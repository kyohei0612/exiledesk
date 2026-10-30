# 9 本目からの種: 探されているベースの作り方の記事 (候補 8 本、記事編集長 2 代目、10-31)

オーナー「A で」(= ベースの作り方の記事を種にする、エンジンの数字つきで手で 1 本ずつ)。**書き始めるのはオーナーの OK の後**、11-01〜07 の毎日の出しが先。

## 元
- Search Console (過去 3 か月、10-27 まで): オーナーのデスクトップの CSV `exiledesk.com-Performance-on-Search-2026-10-30` の クエリ.csv・ページ.csv。読みは共有メモ local_e2573db4…/search-console-1031.md。
- 下の「表示」= 消したベースのページ (日 + 英) の表示の合計。「検索語」= クエリ.csv に出たその名前の言葉と表示 (同じ言葉の言い回し違いは足した)。
- ベースの特徴はエンジンのデータ: `src/services/htc/implicit-stats.json` (暗黙)・`src/data/base-info.json` (レベル・能力値・付くスキル)。名前は `src/i18n/items-ja-client.json` (poe2db の辞書 items-ja-poe2db.json に無い物はここ)。

## 決め方
- 題の頭にベースの名前 (日本語名・英語名)。1 本 1 ベース (比べる 2 つは 1 本にまとめた所だけ例外)。
- 数字は**まだ数えていない**。下の「数える物」を部下にエンジンで数えさせ (scripts/analysis/ の台本の作り、例 amulet-4aims-ev.mjs・boots-res-ev.mjs を写す)、docs/org/math/notes/ に記録を残してから書く。
- 既にある記事と主題を重ねない: 不在のアミュレットは sanctify-quality-order (聖別と品質の順)・quality-rounding-down (品質の切り捨て)・チュートリアル「全スペル +5」で使っている。コルの狩りは kolrs-hunt-gloves があるので外した (ルーンでベースではない)。

## 決まった並び (10-31)
11-08 1 不在・11-09 2 ルーニックフォーク・11-10 3 歪んだ / 悲嘆・11-11 4 聖なるフォーカス・11-12 5 ブリーチの指輪・11-13 6 追放者の仮面・11-14 8 パラゴン・11-15 鐘鳴のスタッフ (予備から)。7 は予備へ (エンジンでは抽選が変わらず外の正解なし、math/notes/2026-10-31-socket-as-gear.md。ゲームの確かめ待ち)。

## おすすめ順 (出した時の案)

| 順 | ベース | 表示 (日+英のページ) | 主な検索語 (表示) | 題 (日) | 題 (英) | 数える物 (エンジン) |
|---|---|---|---|---|---|---|
| 1 | 不在のアミュレット (Absent Amulet) | 144 (94+50、クリック 3) | 不在のアミュレット 37・poe2 不在のアミュレット 17・absent amulet 10・craft absent amulet 1 | PoE2 不在のアミュレットの作り方｜枠 2/2 で狙いを揃える費用 | PoE2 Absent Amulet Crafting: Cost With Only 2 Prefixes and 2 Suffixes | 暗黙「プレ -1・サフィ -1」(枠 2/2)。全スペル +3 (T1) とキャストを揃える費用を、ふつうのアミュレット (3/3) と同じ打ち方で比べる (外れの入る所が少ない分、カオス・抹消の回数がどう変わるか)。変成で MOD 無しのマジックになる・増強が打てない所は既にエンジンで決まっている (changelog) ので文で添える。聖別・品質の話は sanctify-quality-order へリンクして繰り返さない |
| 2 | ルーニックフォーク (Runic Fork) | 67 (48+19) | ルーニックフォーク 17・poe2 ルーニックフォーク 12・runic fork 4・poe2 runic fork 4 | PoE2 ルーニックフォークの作り方｜スキルの無いワンドで狙う MOD | PoE2 Runic Fork Crafting: Building a Wand With No Granted Skill | 同じ Lv65 のワンド (決闘・捻じれた) と違い**付くスキルが無い** (base-info)。スペルスキルのレベル + とスペルダメージ系を揃える費用 (高貴・エッセンス・お告げの打ち方 2〜3 通りの平均と分かれ方)。ルーンマスターの版 (Runemastered Runic Fork) との違いがデータで言えるかも確かめる |
| 3 | 歪んだアミュレット・悲嘆のアミュレット (Distorted / Lament Amulet) | 67 (歪 33・悲 34、クリック 2・CTR 高い) | 歪んだアミュレット 6 (2 クリック)・poe2 歪んだアミュレット 4・distorted amulet 3・lament amulet 5+4+3+3・悲嘆のアミュレット 4 | PoE2 歪んだアミュレットと悲嘆のアミュレット｜枠 3/2 と 2/3 の選び方 | PoE2 Distorted vs Lament Amulet: 3/2 or 2/3 Affix Slots | 歪んだ = サフィ -1 (3/2)、悲嘆 = プレ -1 (2/3)。同じ狙い (例: プレ 2 つ + サフィ 2 つ) をどちらで作ると安いか、狙いがプレ寄り・サフィ寄りの 2 例で数える。1 の不在 (2/2) と表 1 つで並べられるが主題は「どちらを選ぶか」に絞る |
| 4 | 聖なるフォーカス (Sacred Focus) (+ タサリオのフォーカス) | 72 (聖 49・タサリオ 23、タサリオはクリック 2) | poe2 聖なるフォーカス 7・聖なるフォーカス 1・sacred focus 1+2+1・tasalian focus 8 (1 クリック)・poe2 tasalian focus 1 | PoE2 聖なるフォーカスの作り方｜タサリオとの差と ES を伸ばす打ち方 | PoE2 Sacred Focus vs Tasalian Focus: Energy Shield Crafting Cost | Lv75 と Lv80 の素の ES の差 (データ)、ES% と ES 足しの T1 を揃える費用 (防御のカタリストの有無で比べる)。題の主は聖なるフォーカス (日本語の表示が多い)、英語の題は Tasalian も入れて両方拾う |
| 5 | ブリーチの指輪 (Breach Ring) | 52 (英 34 + Refined 18、クリック 2) | breach ring 4・refined breach ring 3・breach ring poe 2 2・breach rings poe2 2+1 ほか | PoE2 ブリーチの指輪の作り方｜品質 40% で耐性はいくつになる | PoE2 Breach Ring Crafting: What 40% Quality Does to Your Resistances | 暗黙「品質の最大値 +20」= 品質 40% まで。耐性・ライフ・レアリティの T1 が品質 20% と 40% でいくつになるか (切り捨て、E の品質の決まり) を金の指輪と並べた表。品質を上げてから打つ費用。quality-rounding-down・sanctify-quality-order と違い主題は「このベースを選ぶ得」 |
| 6 | 追放者の仮面 (Pariah Mask) | 39 (英だけ、掲載順位 4.95 と高い) | pariah mask 27 | PoE2 追放者の仮面の作り方｜回避と ES の兜に耐性を揃える | PoE2 Pariah Mask Crafting: Evasion/ES Helmet Mod Odds and Cost | 器用・知性の兜 (Lv54)。ライフ + 耐性 2 つの費用と、回避・ES の T1 の出る割合を数える。**英語を先**、日本語は「追放者の仮面」の検索が無いので添え |
| 7 | グラスピングリング・コロナアミュレット (Grasping Ring / Corona Amulet) | 36 (グ 17・コ 19) + 検索語 | poe2 grasping ring 4・grasping ring poe2 3・poe 2 grasping ring 3 (1 クリック)・corona amulet 5+4+3・poe2 グラスピング 2 | PoE2 グラスピングリングとコロナアミュレット｜はめたルーンは手袋・兜として効く | PoE2 Grasping Ring and Corona Amulet: Runes That Count as Gloves or Helmet | 暗黙「ソケットの物が手袋 / 兜として効く」。コルの狩りをグラスピングリングにはめるとマークスマンの MOD が抽選に混ざるか (kolrs-hunt-gloves の続き) を**エンジンで確かめる所から**。混ざらないなら主題を「はめて効く物の一覧」に変える。確かめの結果しだいで書く・書かないを決める |
| 8 | パラゴンのグレートヘルム (Paragon Greathelm) | 36 (日 30 + 英 6) | poe2 パラゴン 11・パラゴン poe2 7・paragon poe 2 db 2 | PoE2 パラゴンのグレートヘルムの作り方｜アーマーの兜に耐性を揃える | PoE2 Paragon Greathelm Crafting: Armour Helmet Mod Odds and Cost | 力の兜の Lv75。ライフ + 耐性 2〜3 つ・アーマー% の費用 (6 と同じ台本で部位だけ替える。6 と 8 は同じ週に出さない) |

### 予備 (表示が少ない・散らばる)
- 鐘鳴のスタッフ (Chiming Staff): 英 33・chiming staff 6+6+2+1。Lv25 で「力の印」が付く、上げ途中のスタッフ。作り方より「どこまで使えるか」の話になりやすく、数字が細い。
- 槍 (soaring / flying / akoyan spear など): 1 つずつは 5〜20、まとめると多い (poe 2 spear bases もある)。1 ベースに絞れないので「槍のベースの選び方」1 本にするなら、主の言葉が散る点をオーナーに聞く。

## 進め方 (OK が出たら)
1. オーナーが本数・順を決める (このまま 1〜8 でも、上の 5 本だけでも)。
2. 1 本ずつ: 部下にエンジンで数えさせる → math/notes/<日付>-<slug>.md → 記事編集長が日英で書く → 照らし合わせの部下 → `ready: true` + `draft: true` で commit → ブラックに「送れる」。
3. 出す日はオーナーが決めるまで書き溜め (11-08 以降)。craft: はそのベースのクラフト台 (`/?base=<英語名>`) — 消したベースのページへのリンクは置かない (410)。
