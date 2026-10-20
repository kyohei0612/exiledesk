# ジン部長 のやる事

## やる事
- currency-spec-golden が 6 つとも控えとずれている (控えは 10-17 の 071a0af9 に取ったきり、その後のエンジンの commit が多い)。どの commit でずれたかを別の worktree で探し、わざとの変更なら GOLDEN_WRITE=1 で取り直す (J1 で見つけた、family の直しでは変わらない)

- 貼り付けの読み取り parseItemText (item-text.ts) の残り: 日本語の Ctrl+Alt+C の見出し・日本語の注記の形 (見本が来たら notes/paste-samples/ に足して対応)。ジュエルの枠 2/2 はエンジンの値で poe2db では確かめていない。
- J11 (オーナー 10-20 の答え、J8 の迷う物 4 つ。1 つずつ別の commit、クラフト台は開発版まで・本番は OK 待ち):
  - ① ルーンの「明示 ○○ MOD の強さが N% 増加」(破壊のルーン Rune_destruction_*ModifierEffect: Critical / Speed / Chaos / Physical / Elemental (火・冷気・雷・元素ダメージ) / Mana) をエンジンで MOD の値に掛ける。案: stage-core の boostedMod の % に「アイテムの他の MOD の ModifierEffect のうち、その MOD のタグに当たる物の合計」を足す (自分自身には掛けない)、boosts.ts の ModBoost に kind "magnitude" を足して表示では抜く。**どの MOD が「明示 ○○ MOD」に入るか (タグ critical・speed・chaos・physical・fire/cold/lightning/elemental_damage・mana のどれで見るか) は poe2db で確かめてから** (推し量らない)。golden・held-odds-parity を回す。
  - ② 防御・DPS の合計は盛ったまま (直さない)。
  - ③ ルーン・ソウルコアの行は今の値のまま、ソケットの効果 (アストリッドなど、scaledAugment) で盛った分だけ抜く。
  - ④ 聖別も抜いて素の値を出し、聖別後の値は小さく添える (baseValueOf の base = sanctify.base)。
  - クラフト台の直しの場所は notes/2026-10-20-j8-boost-table.md の表 (アイテムカードの MOD・ソケット・暗黙の行、履歴・小さいカード・スマホの帯の聖別)。

## OK 待ち
