# Craft of Exile (PoE2) のアイテムレベルの扱い (2026-10-22 夜、リサーチ長 2 本目)

頼み: ブラック 5 代目 (シミュレーターの「途中で Lv が足りないとベースの買い直し」の参考)。
**出どころ**: 手元の写し data-cache/coe-beta-package_poe2.js (2026-10-16 取得、beta の PoE2 用のコード) を grep で読んだ。画面では確かめていない (10-22 夜にオーナーの Chrome で触った時、計算機の上に「ILvl 100」の欄があるのは見た)。

1. **選び方**: 既定は **100** (`Item.defaultMaximumItemLevel=100`。空・数でない時も 100)。範囲は **1〜100** (`gameConstants.minimumItemLevel:1 / maximumItemLevel:100`、setter で丸める)。計算機は検索欄の横の数の欄「ILvl」(min 1・max 100、URL の `ilvl=` にも入る)。エミュレーターはアイテムの右クリックの「アイテムレベルを変える」窓 (数の欄 + 最小 / 最大のボタン、履歴に「Manually changed item level」と残る)。
2. **Lv が足りない段**: MOD 一覧を作る時 (`getFilteredModPool`) に、段の `minlvl > ilvl` の物を **候補から外して「使えない MOD」(`inactiveMods`) に回し、一覧では `filter` の印 (薄く / 隠す) を付けるだけ**。警告の文や、Lv を自動で上げる動きは見つからなかった。一覧の「ILvl」の列 (ツールチップ「Maximum item level required」) は群の一番高い段の要る Lv で、今の Lv と違う時は「今 (元)」の形で出す。外す判定を飛ばすのは影響 (influence) の一部の種類と、`ignoreItemLevel` の付いた手だけ。
3. **逆算**: しない。既定の Lv は狙いの段に関係なく 100 で固定。フラクチャーの MOD について Lv の特別な扱い (警告・買い直し) も見つからなかった。Lv を下げた時に付いている MOD を消すかは確かめていない。
- Lv の上限の判定はほかに 1 つだけ: 手の条件「max_item_level_64」(「Item level cannot be over 64」のエラー)。
