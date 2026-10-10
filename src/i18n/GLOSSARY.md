# 英語版の用語 (2026-10-10)

画面の言葉は `tr("日本語", "English")` (src/i18n/lang.ts) で並べて書く。ゲームの言葉 (アイテム・カレンシー・お告げ・状態・仕組みの名前) は **推測しない**。必ずクライアントの表 (data-cache/client-export*/tables/Japanese と English は同じ行 = 同じ物) で日本語を引いて、同じ行の英語をそのまま使う。略語 (Pre/Suf・T6・iLvl・ex/c/div) と画面の操作の言葉 (Close・Undo など) だけは界隈の呼び方で短く。

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

## ゲームの言葉 (クライアントで確かめた物、2026-10-10)

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
