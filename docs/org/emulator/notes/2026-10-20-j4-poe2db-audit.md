# J4 2) poe2db の全部位とエンジンの行の照らし (ジン部長 2026-10-20)

台本 3 本で照らした (数字は台本の出力のまま。違いは推し量らず並べる。直しは別の仕事)。写しは data-cache (git に入らない) なので、食い違いの一覧はここに写した。
- 暗黙: scripts/audit-poe2db-implicits.mjs (新しく作った) — poe2db の部位のページのベースのカードの implicitMod とエンジンの baseInfo.implicits
- ルーン・ソウルコア・タリスマン: scripts/audit-poe2db-runes.mjs (新しく作った) — poe2db の強化のページ (https://poe2db.tw/jp/Augment を 1 枚写した) と stage-runes.json
- MOD の段: scripts/audit-poe2db-mods.mjs (前からある) — 一般・冒涜専用・エッセンス・ルーンで付く MOD
- コラプト: J1b で poe2db の写しそのものを持った (照らしは不要)

## まとめ
- 暗黙: poe2db のベース 1,569 のうち 1,508 が同じ。目立つ食い違い: ベルトの「(1—3) 個のチャームスロットを持つ」がエンジンに無い (全ベルト)、減少の幅の向きが逆 `(30-20)` (メイルコートなど)、同じ名前の別物 (2 ストーンリング・ルーンマスター品) をエンジンは 1 つしか持たない、全能力値の鎧などの暗黙の文の違い。エンジンにだけあるベース 105 (黄金の…・DNT・ルーンフォージの一部など)。
- ルーン・ソウルコア・タリスマン: 305 全部同じ。
- MOD の段: 無い物は essence 46 (各部位のアビスのエッセンス 1 つ = 深淵の王の印、poe2db にあってエンジンの置き場に無い)、エンジンにだけある物は Crossbows の 10 + 8 (Crossbows_cannon = Trarthan Cannon の行。グレネードのクールダウン使用回数などで、見本 5 の行もここ。poe2db のクロスボウ・Trarthan Cannon のページとも、シージクロスボウに付くとは書いていない)。値の幅の違いはルーンで付く MOD の単位 (ドッジロール m と 0.1 m、憤怒の秒と ms) と冒涜 3。
- 足した部位 (10-20 夜、開発部長の順 ①②): ジュエル 8 クラス (Ruby・Emerald・Sapphire・Diamond とタイムロスト 4 つのベースのページ) とグラスピングメイル (Grasping_Mail) を写しに足した (audit-poe2db.mjs の URL_OF、写しのファイル名はクラス名)。兜・手袋・靴の全能力値 (Grand Visage・Manchettes・Cuisses) は poe2db のページに MOD の表 (ModsView) が無く照らせない。ジュエルの置き場の食い違いは 0 (重みだけ違う)。グラスピングメイルは poe2db の一般 MOD が 79 多い (エンジンは指輪の MOD)。コラプトの表はジュエル・グラスピングメイルの分が増えて 53 部位・1,338 行。

## 暗黙 (scripts/audit-poe2db-implicits.mjs)
合計: {"pages":56,"bases":1583,"onlyEngine":102,"onlyDb":2,"count":42,"text":14,"values":3,"grants":0,"hidden":41,"same":1522}

| 部位 | poe2db のベース | 同じ | 食い違い |
|---|---|---|---|
| Amulets | 25 | 19 | count 6 |
| Belts | 20 | 0 | count 20 |
| Body_Armours_dex | 55 | 52 | values 3 |
| Body_Armours_dex_int | 50 | 49 | text 1 |
| Body_Armours_int | 55 | 55 | — |
| Body_Armours_ring_str_dex_int | 8 | 8 | — |
| Body_Armours_str | 52 | 52 | — |
| Body_Armours_str_dex | 56 | 49 | text 7 |
| Body_Armours_str_dex_int | 10 | 9 | count 1 |
| Body_Armours_str_int | 56 | 54 | count 2 |
| Boots_dex | 33 | 33 | — |
| Boots_dex_int | 25 | 25 | — |
| Boots_int | 33 | 33 | — |
| Boots_str | 33 | 33 | — |
| Boots_str_dex | 26 | 26 | — |
| Boots_str_dex_int | 2 | 2 | — |
| Boots_str_int | 25 | 25 | — |
| Bows | 35 | 34 | count 1 |
| Bucklers | 52 | 52 | — |
| Crossbows | 35 | 34 | onlyDb 1 |
| Foci | 52 | 51 | onlyDb 1 |
| Gloves_dex | 34 | 34 | — |
| Gloves_dex_int | 26 | 26 | — |
| Gloves_int | 35 | 35 | — |
| Gloves_str | 34 | 34 | — |
| Gloves_str_dex | 28 | 28 | — |
| Gloves_str_dex_int | 2 | 2 | — |
| Gloves_str_int | 27 | 27 | — |
| Helmets_dex | 43 | 42 | count 1 |
| Helmets_dex_int | 36 | 36 | — |
| Helmets_int | 44 | 44 | — |
| Helmets_str | 41 | 41 | — |
| Helmets_str_dex | 37 | 37 | — |
| Helmets_str_dex_int | 2 | 2 | — |
| Helmets_str_int | 39 | 37 | count 1 / text 1 |
| Jewels_dex | 0 | 0 | — |
| Jewels_diamond | 0 | 0 | — |
| Jewels_int | 0 | 0 | — |
| Jewels_radius_dex | 0 | 0 | — |
| Jewels_radius_diamond | 0 | 0 | — |
| Jewels_radius_int | 0 | 0 | — |
| Jewels_radius_str | 0 | 0 | — |
| Jewels_str | 0 | 0 | — |
| One_Hand_Maces | 44 | 36 | count 8 |
| Quarterstaves | 38 | 38 | — |
| Quivers | 11 | 11 | — |
| Rings | 29 | 27 | text 2 |
| Sceptres | 16 | 16 | — |
| Shields_str | 52 | 51 | text 1 |
| Shields_str_dex | 40 | 40 | — |
| Shields_str_int | 42 | 42 | — |
| Spears | 36 | 36 | — |
| Staves | 17 | 17 | — |
| Talismans | 31 | 31 | — |
| Two_Hand_Maces | 43 | 41 | count 2 |
| Wands | 18 | 16 | text 2 |

### 食い違いの中身 (db = poe2db、こちら = extra-bases.json の baseInfo)
- Amulets count: Runemastered Veridical Chain | db 2: 最大ルーンワード +(30—40) / 冷気耐性の最大値 +(2—3)% | こちら 1: 最大ルーンワードが(15-20)%増加する
- Amulets count: Runemastered Veridical Chain | db 2: 最大ルーンワード +(30—40) / 全ての冷気スキルのレベル +(1—2) | こちら 1: 最大ルーンワードが(15-20)%増加する
- Amulets count: Lament Amulet | db 1: プレフィックスモッド -1個 | こちら 2: プレフィックスモッド -1個 / サフィックスモッド 0個
- Amulets count: Portent Amulet | db 1: サフィックスモッド -1個 | こちら 2: プレフィックスモッド 0個 / サフィックスモッド -1個
- Amulets count: Twisted Amulet | db 1: プレフィックスモッド -1個 | こちら 2: プレフィックスモッド -1個 / サフィックスモッド 0個
- Amulets count: Distorted Amulet | db 1: サフィックスモッド -1個 | こちら 2: プレフィックスモッド 0個 / サフィックスモッド -1個
- Belts count: Golden Obi | db 2: (1—3)個のチャームスロットを持つ / 見つかるアイテムのレアリティが(20—30)%増加する | こちら 1: 見つかるアイテムのレアリティが(20-30)%増加する
- Belts count: Rawhide Belt | db 2: (1—3)個のチャームスロットを持つ / フラスコによるライフ回復量が(20—30)%増加する | こちら 1: フラスコによるライフ回復量が(20-30)%増加する
- Belts count: Linen Belt | db 2: (1—3)個のチャームスロットを持つ / フラスコによるマナ回復量が(20—30)%増加する | こちら 1: フラスコによるマナ回復量が(20-30)%増加する
- Belts count: Wide Belt | db 2: (1—3)個のチャームスロットを持つ / 獲得フラスコチャージが(20—30)%増加する | こちら 1: 獲得フラスコチャージが(20-30)%増加する
- Belts count: Long Belt | db 2: (1—3)個のチャームスロットを持つ / チャームの効果持続時間が(15—20)%増加する | こちら 1: チャームの効果持続時間が(15-20)%増加する
- Belts count: Plate Belt | db 2: (1—3)個のチャームスロットを持つ / アーマー +(140—180) | こちら 1: アーマー +(140-180)
- Belts count: Ornate Belt | db 2: (1—3)個のチャームスロットを持つ / チャームの使用チャージが(10—15)%減少する | こちら 1: チャームの使用チャージが(15-10)%減少する
- Belts count: Mail Belt | db 2: (1—3)個のチャームスロットを持つ / 消費フラスコチャージが(10—15)%減少する | こちら 1: 消費フラスコチャージが(15-10)%減少する
- Belts count: Double Belt | db 2: (1—3)個のチャームスロットを持つ / チャームの獲得チャージが(20—30)%増加する | こちら 1: チャームの獲得チャージが(20-30)%増加する
- Belts count: Heavy Belt | db 2: (1—3)個のチャームスロットを持つ / スタン閾値が(20—30)%増加する | こちら 1: スタン閾値が(20-30)%増加する
- Belts count: Runemastered Heavy Belt | db 3: (1—3)個のチャームスロットを持つ / スタン閾値が(20—30)%増加する / フラスコによるライフ回復の(15—25)%はルーンワードにも適用される | こちら 2: スタン閾値が(20-30)%増加する / フラスコは毎秒(0.5-1)のチャージを獲得する
- Belts count: Runemastered Heavy Belt | db 3: (1—3)個のチャームスロットを持つ / スタン閾値が(20—30)%増加する / ルーンワードの自動回復レートが(20—40)%増加する | こちら 2: スタン閾値が(20-30)%増加する / フラスコは毎秒(0.5-1)のチャージを獲得する
- Belts count: Runemastered Heavy Belt | db 3: (1—3)個のチャームスロットを持つ / スタン閾値が(20—30)%増加する / ルーンワード回復は最大ルーンワードをオーバーフローできる | こちら 2: スタン閾値が(20-30)%増加する / フラスコは毎秒(0.5-1)のチャージを獲得する
- Belts count: Runemastered Heavy Belt | db 3: (1—3)個のチャームスロットを持つ / スタン閾値が(20—30)%増加する / フラスコは毎秒(0.5—1)のチャージを獲得する | こちら 2: スタン閾値が(20-30)%増加する / フラスコは毎秒(0.5-1)のチャージを獲得する
- Belts count: Utility Belt | db 2: (1—3)個のチャームスロットを持つ / フラスコによる回復の20%が即時に適用される | こちら 1: フラスコによる回復の20%が即時に適用される
- Belts count: Fine Belt | db 2: (1—3)個のチャームスロットを持つ / フラスコは毎秒0.17のチャージを獲得する | こちら 1: フラスコは毎秒0.17のチャージを獲得する
- Belts count: Stalking Belt | db 3: (1—3)個のチャームスロットを持つ / 1個のチャームスロットを持つ / このアイテムはソケットされたアイテムからそれが靴にソケットされているかのように仮定してボーナスを獲得する | こちら 2: 1個のチャームスロットを持つ / このアイテムはソケットされたアイテムからそれが靴にソケットされているかのように仮定してボーナスを獲得する
- Belts count: Invoking Belt | db 3: (1—3)個のチャームスロットを持つ / 1個のチャームスロットを持つ / キャストスピードが(8—12)%増加する | こちら 2: 1個のチャームスロットを持つ / キャストスピードが(8-12)%増加する
- Belts count: Sinew Belt | db 3: (1—3)個のチャームスロットを持つ / 1個のチャームスロットを持つ / 筋力 +(15—20) | こちら 2: 1個のチャームスロットを持つ / 筋力 +(15-20)
- Belts count: Forking Belt | db 3: (1—3)個のチャームスロットを持つ / 1個のチャームスロットを持つ / 1から(20—30)の雷ダメージをアタックに追加する | こちら 2: 1個のチャームスロットを持つ / 1から(20-30)の雷ダメージをアタックに追加する
- Body_Armours_dex values: Mail Coat | db: プレイヤーに対する減速のデバフのポテンシャルが(20—30)%減少する | こちら: プレイヤーに対する減速のデバフのポテンシャルが(30-20)%減少する
- Body_Armours_dex values: Swiftstalker Coat | db: プレイヤーに対する減速のデバフのポテンシャルが(20—30)%減少する | こちら: プレイヤーに対する減速のデバフのポテンシャルが(30-20)%減少する
- Body_Armours_dex values: Runeforged Swiftstalker Coat | db: プレイヤーに対する減速のデバフのポテンシャルが(20—30)%減少する | こちら: プレイヤーに対する減速のデバフのポテンシャルが(30-20)%減少する
- Body_Armours_dex_int text: Runeforged Sacrificial Regalia | db: 装備中のコラプト状態のアイテム1個ごとに全ての耐性 +1% | こちら: 装備中のコラプト状態のアイテム1個ごとに混沌ダメージが(2-4)%増加する
- Body_Armours_str_dex text: Tournament Mail | db: 火耐性 +(20—25)% | こちら: 雷耐性 +(20-25)%
- Body_Armours_str_dex text: Tournament Mail | db: 冷気耐性 +(20—25)% | こちら: 雷耐性 +(20-25)%
- Body_Armours_str_dex text: Shrouded Mail | db: 火耐性 +(20—25)% | こちら: 雷耐性 +(20-25)%
- Body_Armours_str_dex text: Shrouded Mail | db: 冷気耐性 +(20—25)% | こちら: 雷耐性 +(20-25)%
- Body_Armours_str_dex text: Runeforged Sacrificial Regalia | db: 装備中のコラプト状態のアイテム1個ごとに最大ライフが1%増加する | こちら: 装備中のコラプト状態のアイテム1個ごとに混沌ダメージが(2-4)%増加する
- Body_Armours_str_dex text: Runeforged Shrouded Mail | db: 火耐性 +(20—25)% | こちら: 雷耐性 +(20-25)%
- Body_Armours_str_dex text: Runeforged Shrouded Mail | db: 冷気耐性 +(20—25)% | こちら: 雷耐性 +(20-25)%
- Body_Armours_str_dex_int count: Runeforged Sacrificial Regalia | db 1: 全てのコラプト状態のスキルジェムのレベル +1 | こちら 2: 全てのコラプト状態のスキルジェムのレベル +1 / 装備中のコラプト状態のアイテム1個ごとに混沌ダメージが(2-4)%増加する
- Body_Armours_str_int count: Runemastered Revered Vestments | db 2: 全ての元素耐性の最大値 +1% / プレイヤーに対するアーケインサージの効果が(30—50)%増加する | こちら 1: 全ての元素耐性の最大値 +1%
- Body_Armours_str_int count: Runemastered Revered Vestments | db 2: 全ての元素耐性の最大値 +1% / エナジーシールドリチャージレートが(10—15)%増加する | こちら 1: 全ての元素耐性の最大値 +1%
- Bows count: Runeforged Shortbow | db 0: — | こちら 1: 投射物は分岐する時に50%の確率で追加の投射物を放つ
- Crossbows onlyDb: Ancient Rune of Detonation (起爆の古代ルーン) | クロスボウ: グレネードは10%の確率で追加で1回アクティベートする
- Foci onlyDb: Atmohuas Soul Core of Retreat (アトモフアの退却のソウルコア) | 鎧: 装備中のフォーカスから得られるエナジーシールドが40%増加する / フォーカス: 装備中の鎧から得られるエナジーシールドが30%増加する
- Helmets_dex count: Runeforged Lace Hood | db 0: — | こちら 1: 発火の強度が(30-50)%増加する
- Helmets_str_int count: Runemastered Spiritbone Crown | db 3: ルーンワードの自動回復レートが(25—50)%増加する / 知性の装備条件 +250 / 受ける呪いの持続時間が100%減少する | こちら 1: 5秒ごとにヴェリシウムインフュージョンを1スタック獲得する
- Helmets_str_int text: Runemastered Spiritbone Crown | db: ソケットを3個持つ | こちら: 5秒ごとにヴェリシウムインフュージョンを1スタック獲得する
- One_Hand_Maces count: Runemastered Torment Club | db 1: 雷ダメージの100%を冷気ダメージに変換する | こちら 0: —
- One_Hand_Maces count: Runemastered Torment Club | db 1: スキルはルーンワードコスト50ごとにダメージの(4—6)%を追加雷ダメージとして獲得する | こちら 0: —
- One_Hand_Maces count: Runemastered Torment Club | db 1: 近接ストライク距離 +(1.5—2)m | こちら 0: —
- One_Hand_Maces count: Runemastered Torment Club | db 1: 雷ダメージが(40—60)%増加する | こちら 0: —
- One_Hand_Maces count: Runemastered Torment Club | db 1: (50—100)%の確率で雷スキルは追加で1回連鎖する | こちら 0: —
- One_Hand_Maces count: Runeforged Kalguuran Forgehammer | db 1: ソケットを3個持つ | こちら 2: ソケットを3個持つ / 最大ルーンワード +(100-150)
- One_Hand_Maces count: Runeforged Kalguuran Forgehammer | db 1: ソケットを3個持つ | こちら 2: ソケットを3個持つ / 最大ルーンワード +(100-150)
- One_Hand_Maces count: Runeforged Kalguuran Forgehammer | db 1: ソケットを3個持つ | こちら 2: ソケットを3個持つ / 最大ルーンワード +(100-150)
- Rings text: Two-Stone Ring | db: 火および冷気耐性 +(12—16)% | こちら: 冷気および雷耐性 +(12-16)%
- Rings text: Two-Stone Ring | db: 火および雷耐性 +(12—16)% | こちら: 冷気および雷耐性 +(12-16)%
- Shields_str text: Runemastered Crucible Tower Shield | db: ブロック時に(15—25)のルーンワードを回復する | こちら: ダメージの(15-25)%をライフより先にマナで受ける
- Two_Hand_Maces count: Runemastered Aberrant Sledge | db 1: 亀裂を生成するスキルは50%の確率で亀裂を追加で1個生成する | こちら 0: —
- Two_Hand_Maces count: Runemastered Aberrant Sledge | db 1: 凍結蓄積が(200—300)%増加する | こちら 0: —
- Wands text: Runemastered Runic Fork | db: (30—50)%の確率でスペルスキルは投射物を追加で2個放つ | こちら: 最大ルーンワード +300
- Wands text: Runemastered Runic Fork | db: マナ自動回復レートが(30—50)%増加する | こちら: 最大ルーンワード +300

### エンジンにだけあるベース (102、poe2db の部位のページのどこにも出ない)
Golden Flame (黄金の炎, Shields)、Golden Wreath (黄金の花冠, Helmets)、Golden Visage (黄金の顔飾り, Helmets)、Golden Caligae (黄金のカリガ, Boots)、Golden Bracers (黄金のブレーサー, Gloves)、[DNT] Cragbreaker Staff ([DNT] Cragbreaker Staff, Staves)、[DNT] Driftwood Oar ([DNT] Driftwood Oar, Staves)、Garment (ガーメント, Body_Armours)、Runefather's Grasping Mail (ルーンファーザーのグラスピングメイル, Body_Armours)、Grand Visage (大いなる顔飾り, Helmets)、Grand Manchettes (大いなるマンシェット, Gloves)、Grand Cuisses (大いなる脛当て, Boots)、Golden Greaves (黄金のグリーヴ, Boots)、Golden Plate (黄金のプレート, Body_Armours)、Golden Shield (黄金の盾, Shields)、Fists of Stone (石の拳, Gloves)、Runeforged Fists of Stone (ルーンフォージの石の拳, Gloves)、Runeforged Colosseum Plate (ルーンフォージのコロシアムプレート, Body_Armours)、Runeforged Champion Cuirass (ルーンフォージの王者の胴鎧, Body_Armours)、Runeforged Glorious Plate (ルーンフォージの栄光のプレート, Body_Armours)、Runeforged Abyssal Cuirass (ルーンフォージの深淵の胴鎧, Body_Armours)、Runeforged Strider Vest (ルーンフォージのストライダーベスト, Body_Armours)、Runeforged Hardleather Coat (ルーンフォージのハードレザーコート, Body_Armours)、Runeforged Exquisite Vest (ルーンフォージの精巧なベスト, Body_Armours)、Runeforged Mail Coat (ルーンフォージのメイルコート, Body_Armours)、Runeforged Armoured Vest (ルーンフォージの装甲ベスト, Body_Armours)、Runeforged Imperial Robe (ルーンフォージの帝国のローブ, Body_Armours)、Runeforged Plated Raiment (ルーンフォージの装甲の装束, Body_Armours)、Runeforged Havoc Raiment (ルーンフォージの破壊の装束, Body_Armours)、Runeforged Enlightened Robe (ルーンフォージの覚者のローブ, Body_Armours)、Runeforged Arcane Raiment (ルーンフォージの神秘の装束, Body_Armours)、Runeforged Lamellar Mail (ルーンフォージのラメラーメイル, Body_Armours)、Runeforged Gladiator Armour (ルーンフォージの剣闘士の鎧, Body_Armours)、Runeforged Heroic Armour (ルーンフォージの英雄の鎧, Body_Armours)、Runeforged Tournament Mail (ルーンフォージのトーナメントメイル, Body_Armours)、Runeforged Gilded Vestments (ルーンフォージの金装の祭服, Body_Armours)、Runeforged Venerated Mantle (ルーンフォージの尊者の外套, Body_Armours)、Runeforged Revered Vestments (ルーンフォージの畏敬の祭服, Body_Armours)、Runeforged Corvus Mantle (ルーンフォージの鴉の外套, Body_Armours)、Runeforged Zenith Vestments (ルーンフォージの天頂の祭服, Body_Armours)、Runeforged Clandestine Jacket (ルーンフォージの隠密のジャケット, Body_Armours)、Runeforged Monastic Garb (ルーンフォージの修道士の服, Body_Armours)、Runeforged Torment Jacket (ルーンフォージの苦痛のジャケット, Body_Armours)、Runeforged Devout Garb (ルーンフォージの信者の服, Body_Armours)、Runeforged Assassin Garb (ルーンフォージの暗殺者の服, Body_Armours)、Runeforged Garment (ルーンフォージのガーメント, Body_Armours)、Runeforged Sentinel Greathelm (ルーンフォージの歩哨のグレートヘルム, Helmets)、Runeforged Goliath Greathelm (ルーンフォージのゴライアスのグレートヘルム, Helmets)、Runeforged Guardian Greathelm (ルーンフォージの守護者のグレートヘルム, Helmets)、Runeforged Velvet Cap (ルーンフォージのベルベットの帽子, Helmets)、Runeforged Covert Hood (ルーンフォージの隠密のフード, Helmets)、Runeforged Armoured Cap (ルーンフォージの装甲帽子, Helmets)、Runeforged Noble Circlet (ルーンフォージの貴族のサークレット, Helmets)、Runeforged Twilight Tiara (ルーンフォージの黄昏のティアラ, Helmets)、Runeforged Magus Tiara (ルーンフォージの魔導士のティアラ, Helmets)、Runeforged Decorated Helm (ルーンフォージの装飾兜, Helmets)、Runeforged Gallant Helm (ルーンフォージの勇士のヘルム, Helmets)、Runeforged Lavish Crown (ルーンフォージの豪華な冠, Helmets)、Runeforged Archon Crown (ルーンフォージのアルコンの冠, Helmets)、Runeforged Shaded Mask (ルーンフォージの遮光の仮面, Helmets)、Runeforged Death Mask (ルーンフォージのデスマスク, Helmets)、Runeforged Grand Visage (ルーンフォージの大いなる顔飾り, Helmets)、Runeforged Titan Mitts (ルーンフォージのタイタンのミット, Gloves)、Runeforged Grand Mitts (ルーンフォージの大いなるミット, Gloves)、Runeforged Hardened Bracers (ルーンフォージの焼き入れの弓籠手, Gloves)、Runeforged Embroidered Gloves (ルーンフォージの刺繍入りの手袋, Gloves)、Runeforged Adorned Gloves (ルーンフォージの装飾の手袋, Gloves)、Runeforged Burnished Gauntlets (ルーンフォージの研磨されたガントレット, Gloves)、Runeforged Ornate Gauntlets (ルーンフォージの装飾のガントレット, Gloves)、Runeforged Righteous Cuffs (ルーンフォージの正義のカフス, Gloves)、Runeforged Signet Cuffs (ルーンフォージの印章のカフス, Gloves)、Runeforged Furtive Wraps (ルーンフォージの隠密のラップ, Gloves)、Runeforged Utility Wraps (ルーンフォージの実用的なラップ, Gloves)、Runeforged Grand Manchettes (ルーンフォージの大いなるマンシェット, Gloves)、Runeforged Monument Greaves (ルーンフォージのモニュメントグリーヴ, Boots)、Runeforged Totemic Greaves (ルーンフォージのトーテムのグリーヴ, Boots)、Runeforged Leatherplate Boots (ルーンフォージのレザープレートブーツ, Boots)、Runeforged Embroidered Boots (ルーンフォージの刺繍入りブーツ, Boots)、Runeforged Studded Sandals (ルーンフォージの鋲付きのサンダル, Boots)、Runeforged Elaborate Sandals (ルーンフォージの精巧なサバトン, Boots)、Runeforged Flexile Sabatons (ルーンフォージの柔軟なサバトン, Boots)、Runeforged Bold Sabatons (ルーンフォージの剛胆なサバトン, Boots)、Runeforged Gilt Leggings (ルーンフォージの金装のレギンス, Boots)、Runeforged Pious Leggings (ルーンフォージの敬虔なレギンス, Boots)、Runeforged Velour Shoes (ルーンフォージのベロアシューズ, Boots)、Runeforged Bladed Shoes (ルーンフォージの刃付きシューズ, Boots)、Runeforged Grand Cuisses (ルーンフォージの大いなる脛当て, Boots)、Runeforged Ancestor Tower Shield (ルーンフォージの先祖のタワーシールド, Shields)、Runeforged Phalanx Tower Shield (ルーンフォージのファランクスのタワーシールド, Shields)、Runeforged Defiant Tower Shield (ルーンフォージの反抗のタワーシールド, Shields)、Runeforged Blacksteel Tower Shield (ルーンフォージの黒鉄のタワーシールド, Shields)、Runeforged Mosaic Targe (ルーンフォージのモザイクタージ, Shields)、Runeforged Aureate Targe (ルーンフォージの金色のタージ, Shields)、Runeforged Grand Targe (ルーンフォージの大いなるタージ, Shields)、[DNT] Venerable Defender ([DNT-UNUSED] Venerable Defender, Shields)、Runeforged Stoic Crest Shield (ルーンフォージの不動のクレストシールド, Shields)、Runeforged Empyreal Crest Shield (ルーンフォージの天上のクレストシールド, Shields)、Runeforged Deified Crest Shield (ルーンフォージの神聖なクレストシールド, Shields)、Runemastered Garment (ルーンマスターのガーメント, Body_Armours)、Runemastered Shabby Hood (ルーンマスターの擦り切れたフード, Helmets)、Runemastered Gauze Wraps (ルーンマスターの薄布のラップ, Gloves)、Runemastered Effigial Tower Shield (ルーンマスターの立像のタワーシールド, Shields)

## ルーン・ソウルコア・タリスマン (scripts/audit-poe2db-runes.mjs、poe2db の強化のページ 10-20)
合計: {"db":305,"engine":305,"same":305,"onlyEngine":0,"onlyDb":0,"count":0,"text":0,"values":0,"hidden":3} — 305 全部、部位と効果の文・数字が同じ (区切りと並びは揃えて比べた)。poe2db の隠れた stat の行 3 は比べていない。

## MOD の置き場 (scripts/audit-poe2db.mjs、系統とプレ / サフィ)
- Helmets_str_dex_int: ModsView が無い
- Gloves_str_dex_int: ModsView が無い
- Boots_str_dex_int: ModsView が無い
- グラスピングメイル (Body_Armours_ring_str_dex_int) は置き場の食い違い 19 (エンジンは指輪の MOD を持たせている、メモ grasping-mail-ring-mods)。ジュエル 8 クラスは食い違い 0。

## MOD の段 (scripts/audit-poe2db-mods.mjs、置き場 normal / desecrated / essence / ルーンで付く MOD)
合計: {"normal.missing":79,"normal.extra":10,"normal.weight":1250,"normal.values":0,"normal.db段":7762,"desecrated.missing":4,"desecrated.extra":0,"desecrated.weight":0,"desecrated.values":3,"desecrated.db段":856,"essence.missing":98,"essence.extra":0,"essence.weight":0,"essence.values":0,"essence.db段":2239,"soul.missing":21,"soul.extra":19,"soul.weight":147,"soul.values":0,"soul.db段":168,"chronomancy.missing":0,"chronomancy.extra":0,"chronomancy.weight":102,"chronomancy.values":12,"chronomancy.db段":102,"destruction.missing":0,"destruction.extra":8,"destruction.weight":90,"destruction.values":0,"destruction.db段":90,"marksman.missing":0,"marksman.extra":0,"marksman.weight":168,"marksman.values":0,"marksman.db段":168,"decay.missing":0,"decay.extra":0,"decay.weight":138,"decay.values":12,"decay.db段":138,"berserking.missing":0,"berserking.extra":0,"berserking.weight":180,"berserking.values":6,"berserking.db段":180}
- weight の食い違いは poe2db が 1 (非公開) の物・ルーンで付く MOD の重み (CoE 由来)・ジュエルの重みが大半。値の幅・無い物を下に (グラスピングメイルの 79 + 4 + 52 + 21 は件数だけ、上の置き場の件と同じ元)。
- Amulets essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Belts essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Body_Armours_dex essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Body_Armours_dex_int essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Body_Armours_int essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Body_Armours_str essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Body_Armours_str_dex essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Body_Armours_str_int essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Boots_dex essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Boots_dex chronomancy.values: P DodgeRoll Lv45 Uhtred's | ドッジロールの距離 +(0.3—0.4)m | こちら Boots_dex/Rune_chronomancy_DodgeRoll [[3,4]]
- Boots_dex chronomancy.values: P DodgeRoll Lv78 Uhtred's | ドッジロールの距離 +(0.4—0.5)m | こちら Boots_dex/Rune_chronomancy_DodgeRoll [[4,5]]
- Boots_dex_int essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Boots_dex_int chronomancy.values: P DodgeRoll Lv45 Uhtred's | ドッジロールの距離 +(0.3—0.4)m | こちら Boots_dex_int/Rune_chronomancy_DodgeRoll [[3,4]]
- Boots_dex_int chronomancy.values: P DodgeRoll Lv78 Uhtred's | ドッジロールの距離 +(0.4—0.5)m | こちら Boots_dex_int/Rune_chronomancy_DodgeRoll [[4,5]]
- Boots_int essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Boots_int chronomancy.values: P DodgeRoll Lv45 Uhtred's | ドッジロールの距離 +(0.3—0.4)m | こちら Boots_int/Rune_chronomancy_DodgeRoll [[3,4]]
- Boots_int chronomancy.values: P DodgeRoll Lv78 Uhtred's | ドッジロールの距離 +(0.4—0.5)m | こちら Boots_int/Rune_chronomancy_DodgeRoll [[4,5]]
- Boots_str essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Boots_str chronomancy.values: P DodgeRoll Lv45 Uhtred's | ドッジロールの距離 +(0.3—0.4)m | こちら Boots_str/Rune_chronomancy_DodgeRoll [[3,4]]
- Boots_str chronomancy.values: P DodgeRoll Lv78 Uhtred's | ドッジロールの距離 +(0.4—0.5)m | こちら Boots_str/Rune_chronomancy_DodgeRoll [[4,5]]
- Boots_str_dex essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Boots_str_dex chronomancy.values: P DodgeRoll Lv45 Uhtred's | ドッジロールの距離 +(0.3—0.4)m | こちら Boots_str_dex/Rune_chronomancy_DodgeRoll [[3,4]]
- Boots_str_dex chronomancy.values: P DodgeRoll Lv78 Uhtred's | ドッジロールの距離 +(0.4—0.5)m | こちら Boots_str_dex/Rune_chronomancy_DodgeRoll [[4,5]]
- Boots_str_int essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Boots_str_int chronomancy.values: P DodgeRoll Lv45 Uhtred's | ドッジロールの距離 +(0.3—0.4)m | こちら Boots_str_int/Rune_chronomancy_DodgeRoll [[3,4]]
- Boots_str_int chronomancy.values: P DodgeRoll Lv78 Uhtred's | ドッジロールの距離 +(0.4—0.5)m | こちら Boots_str_int/Rune_chronomancy_DodgeRoll [[4,5]]
- Bows essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Bucklers essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Crossbows normal.extra: S GrenadeCooldownUse Lv72 Crossbows_cannon/GrenadeCooldownUse (Crossbows_cannon) | グレネードスキルのクールダウン使用回数 +# [[1,1]] w500
- Crossbows normal.extra: S GrenadeCooldownUse Lv81 Crossbows_cannon/GrenadeCooldownUse (Crossbows_cannon) | グレネードスキルのクールダウン使用回数 +# [[2,2]] w250
- Crossbows normal.extra: S AdditionalProjectiles Lv72 Crossbows_cannon/AdditionalProjectiles (Crossbows_cannon) | グレネードスキルは投射物を追加で1個放つ [[1,1]] w250
- Crossbows normal.extra: S AdditionalProjectiles Lv81 Crossbows_cannon/AdditionalProjectiles (Crossbows_cannon) | グレネードスキルは投射物を追加で1個放つ [[2,2]] w125
- Crossbows normal.extra: S CooldownRecovery Lv4 Crossbows_cannon/CooldownRecovery (Crossbows_cannon) | グレネードスキルのクールダウン解消レートが#%増加する [[4,8]] w1000
- Crossbows normal.extra: S CooldownRecovery Lv16 Crossbows_cannon/CooldownRecovery (Crossbows_cannon) | グレネードスキルのクールダウン解消レートが#%増加する [[9,14]] w1000
- Crossbows normal.extra: S CooldownRecovery Lv33 Crossbows_cannon/CooldownRecovery (Crossbows_cannon) | グレネードスキルのクールダウン解消レートが#%増加する [[15,21]] w1000
- Crossbows normal.extra: S CooldownRecovery Lv46 Crossbows_cannon/CooldownRecovery (Crossbows_cannon) | グレネードスキルのクールダウン解消レートが#%増加する [[22,26]] w1000
- Crossbows normal.extra: S CooldownRecovery Lv60 Crossbows_cannon/CooldownRecovery (Crossbows_cannon) | グレネードスキルのクールダウン解消レートが#%増加する [[27,32]] w1000
- Crossbows normal.extra: S CooldownRecovery Lv81 Crossbows_cannon/CooldownRecovery (Crossbows_cannon) | グレネードスキルのクールダウン解消レートが#%増加する [[33,40]] w1000
- Crossbows essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Crossbows destruction.extra: P Rune_destruction_CriticalModifierEffect Lv65 Crossbows_cannon/Rune_destruction_CriticalModifierEffect (Crossbows_cannon) | (20-30)% increased Explicit Critical Modifier magnitudes [[20,30]] w500
- Crossbows destruction.extra: P Rune_destruction_SpeedModifierEffect Lv65 Crossbows_cannon/Rune_destruction_SpeedModifierEffect (Crossbows_cannon) | (25-30)% increased Explicit Speed Modifier magnitudes [[25,30]] w500
- Crossbows destruction.extra: S Rune_destruction_ChaosModifierEffect Lv65 Crossbows_cannon/Rune_destruction_ChaosModifierEffect (Crossbows_cannon) | (15-20)% increased Explicit Chaos Modifier magnitudes [[15,20]] w500
- Crossbows destruction.extra: S Rune_destruction_ElementalModifierEffect Lv65 Crossbows_cannon/Rune_destruction_ElementalModifierEffect__heist_enchantment_cold_mod_effect (Crossbows_cannon) | 明示冷気モッドの強さが#%増加する [[15,20]] w500
- Crossbows destruction.extra: S Rune_destruction_ElementalModifierEffect Lv65 Crossbows_cannon/Rune_destruction_ElementalModifierEffect__local_explicit_elemental_damage_mod_effect (Crossbows_cannon) | 明示元素ダメージモッドの強さが#%増加する [[15,20]] w250
- Crossbows destruction.extra: S Rune_destruction_ElementalModifierEffect Lv65 Crossbows_cannon/Rune_destruction_ElementalModifierEffect__heist_enchantment_fire_mod_effect (Crossbows_cannon) | 明示火モッドの強さが#%増加する [[15,20]] w500
- Crossbows destruction.extra: S Rune_destruction_ElementalModifierEffect Lv65 Crossbows_cannon/Rune_destruction_ElementalModifierEffect__heist_enchantment_lightning_mod_effect (Crossbows_cannon) | 明示雷モッドの強さが#%増加する [[15,20]] w500
- Crossbows destruction.extra: S Rune_destruction_PhysicalModifierEffect Lv65 Crossbows_cannon/Rune_destruction_PhysicalModifierEffect (Crossbows_cannon) | 明示物理モッドの強さが#%増加する [[10,15]] w500
- Foci essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Gloves_dex essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Gloves_dex decay.values: S LifeLeech Lv45 of Decay | 物理アタックダメージの(8—12)%をライフとしてリーチする / ライフリーチが(15—25)%速くなる | こちら Gloves_dex/Rune_decay_LifeLeech__base_life_leech_from_physical_attack_damage_permyriad_base_life_leech_rate [[800,1200],[15,25]]
- Gloves_dex decay.values: S LifeLeech Lv45 of Decay | 物理アタックダメージの(8—12)%をライフとしてリーチする / ライフリーチが(15—25)%遅くなる | こちら Gloves_dex/Rune_decay_LifeLeech__base_life_leech_from_physical_attack_damage_permyriad_base_life_leech_rate [[800,1200],[15,25]]
- Gloves_dex_int essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Gloves_dex_int decay.values: S LifeLeech Lv45 of Decay | 物理アタックダメージの(8—12)%をライフとしてリーチする / ライフリーチが(15—25)%速くなる | こちら Gloves_dex_int/Rune_decay_LifeLeech__base_life_leech_from_physical_attack_damage_permyriad_base_life_leech_rate [[800,1200],[15,25]]
- Gloves_dex_int decay.values: S LifeLeech Lv45 of Decay | 物理アタックダメージの(8—12)%をライフとしてリーチする / ライフリーチが(15—25)%遅くなる | こちら Gloves_dex_int/Rune_decay_LifeLeech__base_life_leech_from_physical_attack_damage_permyriad_base_life_leech_rate [[800,1200],[15,25]]
- Gloves_int essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Gloves_int decay.values: S LifeLeech Lv45 of Decay | 物理アタックダメージの(8—12)%をライフとしてリーチする / ライフリーチが(15—25)%速くなる | こちら Gloves_int/Rune_decay_LifeLeech__base_life_leech_from_physical_attack_damage_permyriad_base_life_leech_rate [[800,1200],[15,25]]
- Gloves_int decay.values: S LifeLeech Lv45 of Decay | 物理アタックダメージの(8—12)%をライフとしてリーチする / ライフリーチが(15—25)%遅くなる | こちら Gloves_int/Rune_decay_LifeLeech__base_life_leech_from_physical_attack_damage_permyriad_base_life_leech_rate [[800,1200],[15,25]]
- Gloves_str essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Gloves_str decay.values: S LifeLeech Lv45 of Decay | 物理アタックダメージの(8—12)%をライフとしてリーチする / ライフリーチが(15—25)%速くなる | こちら Gloves_str/Rune_decay_LifeLeech__base_life_leech_from_physical_attack_damage_permyriad_base_life_leech_rate [[800,1200],[15,25]]
- Gloves_str decay.values: S LifeLeech Lv45 of Decay | 物理アタックダメージの(8—12)%をライフとしてリーチする / ライフリーチが(15—25)%遅くなる | こちら Gloves_str/Rune_decay_LifeLeech__base_life_leech_from_physical_attack_damage_permyriad_base_life_leech_rate [[800,1200],[15,25]]
- Gloves_str_dex essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Gloves_str_dex decay.values: S LifeLeech Lv45 of Decay | 物理アタックダメージの(8—12)%をライフとしてリーチする / ライフリーチが(15—25)%速くなる | こちら Gloves_str_dex/Rune_decay_LifeLeech__base_life_leech_from_physical_attack_damage_permyriad_base_life_leech_rate [[800,1200],[15,25]]
- Gloves_str_dex decay.values: S LifeLeech Lv45 of Decay | 物理アタックダメージの(8—12)%をライフとしてリーチする / ライフリーチが(15—25)%遅くなる | こちら Gloves_str_dex/Rune_decay_LifeLeech__base_life_leech_from_physical_attack_damage_permyriad_base_life_leech_rate [[800,1200],[15,25]]
- Gloves_str_int essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Gloves_str_int decay.values: S LifeLeech Lv45 of Decay | 物理アタックダメージの(8—12)%をライフとしてリーチする / ライフリーチが(15—25)%速くなる | こちら Gloves_str_int/Rune_decay_LifeLeech__base_life_leech_from_physical_attack_damage_permyriad_base_life_leech_rate [[800,1200],[15,25]]
- Gloves_str_int decay.values: S LifeLeech Lv45 of Decay | 物理アタックダメージの(8—12)%をライフとしてリーチする / ライフリーチが(15—25)%遅くなる | こちら Gloves_str_int/Rune_decay_LifeLeech__base_life_leech_from_physical_attack_damage_permyriad_base_life_leech_rate [[800,1200],[15,25]]
- Helmets_dex essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Helmets_dex berserking.values: S RageLossDelay Lv45 of the Berserker | 憤怒の固有効果による喪失が1秒遅く始まる | こちら Helmets_dex/Rune_berserking_RageLossDelay [[1000,2000]]
- Helmets_dex_int essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Helmets_dex_int berserking.values: S RageLossDelay Lv45 of the Berserker | 憤怒の固有効果による喪失が1秒遅く始まる | こちら Helmets_dex_int/Rune_berserking_RageLossDelay [[1000,2000]]
- Helmets_int essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Helmets_int berserking.values: S RageLossDelay Lv45 of the Berserker | 憤怒の固有効果による喪失が1秒遅く始まる | こちら Helmets_int/Rune_berserking_RageLossDelay [[1000,2000]]
- Helmets_str essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Helmets_str berserking.values: S RageLossDelay Lv45 of the Berserker | 憤怒の固有効果による喪失が1秒遅く始まる | こちら Helmets_str/Rune_berserking_RageLossDelay [[1000,2000]]
- Helmets_str_dex essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Helmets_str_dex berserking.values: S RageLossDelay Lv45 of the Berserker | 憤怒の固有効果による喪失が1秒遅く始まる | こちら Helmets_str_dex/Rune_berserking_RageLossDelay [[1000,2000]]
- Helmets_str_int essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Helmets_str_int berserking.values: S RageLossDelay Lv45 of the Berserker | 憤怒の固有効果による喪失が1秒遅く始まる | こちら Helmets_str_int/Rune_berserking_RageLossDelay [[1000,2000]]
- One_Hand_Maces essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Quarterstaves essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Quivers essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Rings essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Sceptres essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Shields_str desecrated.values: S ShieldSkillsStunningAlsoFullyBreaksArmour Lv65 アマナムの | 盾スキルは対象をヘビースタンさせた時に完全アーマー破壊状態にする | こちら Shields_str/ShieldSkillsStunningAlsoFullyBreaksArmour [[1,1]]
- Shields_str essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Shields_str_dex desecrated.values: S ShieldSkillsStunningAlsoFullyBreaksArmour Lv65 アマナムの | 盾スキルは対象をヘビースタンさせた時に完全アーマー破壊状態にする | こちら Shields_str_dex/ShieldSkillsStunningAlsoFullyBreaksArmour [[1,1]]
- Shields_str_dex essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Shields_str_int desecrated.values: S ShieldSkillsStunningAlsoFullyBreaksArmour Lv65 アマナムの | 盾スキルは対象をヘビースタンさせた時に完全アーマー破壊状態にする | こちら Shields_str_int/ShieldSkillsStunningAlsoFullyBreaksArmour [[1,1]]
- Shields_str_int essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Spears essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Staves essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Two_Hand_Maces essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Wands essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Talismans essence.missing: P EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Talismans essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Body_Armours_str_dex_int essence.missing: P EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
- Body_Armours_str_dex_int essence.missing: S EssenceAbyss Lv1 アビスのエッセンス | アビサルロードの紋章
