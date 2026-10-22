# 英語版の用語 (2026-10-10)

画面の言葉は `tr("日本語", "English")` (src/i18n/lang.ts) で並べて書く。ゲームの言葉 (アイテム・カレンシー・お告げ・状態・仕組みの名前) は **推測しない**。必ず poe2db (https://poe2db.tw/jp/ と /us/ の同じページ = 同じ物) で日本語と英語を引いて、そのまま使う (2026-10-17 からクライアントの表は参照しない。オーナー「全て db に合わせて」)。略語 (Pre/Suf・T6・iLvl・ex/c/div) と画面の操作の言葉 (Close・Undo など) だけは界隈の呼び方で短く。

右の列の (出どころ) は確かめた表。

| 日本語 | English |
|---|---|
| プレ / プレフィックス | Prefix (狭い所は "Pre") |
| サフィ / サフィックス | Suffix (狭い所は "Suf") |
| 段 / T6 | Tier / T6 |
| お告げ | Omen (KeywordPopups / ItemClasses) |
| 冒涜 / 冒涜された / 冒涜化 | Desecrated / Desecration (CurrencyItems) |
| 未発現 (の冒涜モッド) | Unrevealed (Desecrated Modifier) (KeywordPopups) |
| 発現 | Reveal (ClientStrings) |
| 固定 / フラクチャー | Fractured (KeywordPopups「Fractured Modifiers」) / Fracturing Orb (BaseItemTypes) |
| 高貴 (なオーブ) | Exalted Orb / Exalt (BaseItemTypes) |
| 高貴なオーブ (上級) / 偉大な高貴 | Greater Exalted Orb (BaseItemTypes) |
| 高貴なオーブ (完全) / 完全な高貴 | Perfect Exalted Orb (BaseItemTypes) |
| カオス | Chaos Orb (BaseItemTypes) |
| 神 (のオーブ) | Divine Orb (BaseItemTypes) |
| 消去 (のオーブ) | Orb of Annulment / Annul (BaseItemTypes) |
| 錬金 (術のオーブ) | Orb of Alchemy / Alchemy (BaseItemTypes) |
| 変成 / 増強 / 王者 (のオーブ) | Orb of Transmutation / Orb of Augmentation / Regal Orb (BaseItemTypes) |
| エッセンス | Essence |
| 触媒 / カタリスト | Catalyst (KeywordPopups) |
| 骨 | Bone (ゲームに総称は無い。個々は Gnawed Jawbone・Preserved Rib・Ancient Collarbone・Altered Collarbone など BaseItemTypes) |
| 品質 | Quality (ClientStrings) |
| アイテムレベル | Item Level (ClientStrings、狭い所は iLvl) |
| 要求 Lv (装備条件) | Requires: Level (ClientStrings ItemRequirementsLabel + Level) |
| ノーマル / マジック / レア / ユニーク | Normal / Magic / Rare / Unique |
| エミュレーター | Emulator |
| シミュレーター (調整中) | Simulator (WIP) |
| 使用可能 | Usable |
| 打つ / 掛ける | Use / Apply |
| 持っている | Holding |
| 白に戻す | Reset |
| 1 手戻す | Undo |
| 取引所 | Trade site |
| 相場 | Market price |
| 確率 | Chance |
| 重み | Weight |
| 狙い | Target |
| 満杯 | Full |
| 空き | Open slot |
| MOD | Mod |
| 適正 (表示通貨) | Auto |
| 要望・バグ | Feedback |

## シミュレーターのツリー (2026-10-22、?page=sim-tree。画面の英語は tr の対で揃っている、今の言い方を正にする)

| 日本語 | English |
|---|---|
| クラフトの道 (ツリー) / 木 | Craft route tree / tree |
| 箱 / 結果の箱 / 始まり | Box / Result boxes / Start |
| 手 (打つ手) / 手の札 / 右の棚 | Craft / craft chip / shelf on the right |
| 当たり / 外れ | Hit / Miss |
| 外れが消えた / 狙いが消えた | Miss removed / Target lost |
| 分かれ目 (打たずに分ける) | Split (Split without crafting) |
| 戻り先 | Returns to (札は return tag) |
| 完成 / 完成にする | Done / Mark done |
| 精査 (ルート精査) | Check (Check route) |
| 回す / N 人回す / 回している | Run / Run N / Running (「Play」は使わない) |
| 止まり / 打ち止め | stuck / capped |
| 欲しい MOD のメモ | wanted mods memo (見出しは Notes) |
| カオススパム | Chaos spam |
| 触媒のお告げ (= 触媒の高貴のお告げ) | Omen of Catalysing Exaltation (poe2db、items-ja-poe2db.json)。「Catalysing omen」と縮めない |
| 区切りの「・」 | 英語は ", " |

## ゲームの言葉 (2026-10-10 にクライアントで確かめた物。食い違いが見つかったら poe2db に合わせて直す)

| 日本語 | English (出どころ) |
|---|---|
| 規格外 | Exceptional (KeywordPopups「Exceptional Item」) |
| アルダー (のルーン) | Aldur (BaseItemTypes「Passion of Aldur」「Breath of Aldur」など) |
| 熟練工のオーブ | Artificer's Orb (BaseItemTypes) |
| 宝飾職人のオーブ | Jeweller's Orb (BaseItemTypes) |
| サポート枠 (スキルジェム) | Support Gem Sockets (CurrencyItems、宝飾職人のオーブの説明) |
| ソケット | Sockets (ClientStrings) |
| ソケットバウンド | Socket-bound (KeywordPopups) |
| ルーン / オーグメント | Rune / Augment |
| エンチャント | Enchantment (ClientStrings) |
| コラプト | Corrupted (KeywordPopups) |
| 聖別 | Sanctified (KeywordPopups「Sanctified Items」) |
| ミラー | Mirrored (KeywordPopups「Mirrored Items」) |
| 未鑑定 | Unidentified (ClientStrings) |
| 予見 (ヒネコラの髪束) | foresee / Foreseen (CurrencyItems)、Hinekora's Lock (BaseItemTypes) |
| キル閾値 / ヴァールサイフォナー | kill threshold (CurrencyItems) / Vaal Siphoner (KeywordPopups) |
| 魂の井戸 | the Well of Souls (ClientStrings) |
| アビスの反響のお告げ | Omen of Abyssal Echoes (BaseItemTypes) |
| 異界 (の MOD、変質した鎖骨) | otherworldly modifiers (CurrencyItems、Altered Collarbone の説明) |
| ウラマン / アマナム / クルガル | Ulaman / Amanamu / Kurgal (CurrencyItems・BaseItemTypes) |
| 創生の樹 | the Genesis Tree (ClientStrings) |
| ハンドラップ | Wraps (ゲームに「hand wraps」は無い。ベース名は Gauze Wraps など BaseItemTypes) |
| 解呪 / サルベージ | Disenchant / Salvage (ClientStrings) |
| スキルジェム / フラスコ | Skill Gem / Flask (ItemClasses) |
| プレフィックス / サフィックス | Prefix / Suffix (ClientStrings) |
| ティア / 段 | Tier (ClientStrings) |
| 古びた / 変質 (骨) | Ancient / Altered (BaseItemTypes) |
| レッサー / グレーター / パーフェクト (エッセンス) | Lesser / Greater / Perfect (BaseItemTypes) |
