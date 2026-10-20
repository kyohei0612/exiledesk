# J1 (a)(b): 点検 2 の貼り付けの読みと「品質の最大値 +20%」(ジン部長 2026-10-20)

## (a) 見本 3 の「ソケット…手袋」・「ダメージが56%増加する」・「ゴールド 10%」が読めない行に落ちる (点検 2)
- 点検は f808760c (① の貼り付けが【仮】の htc/paste を読んでいた頃) の画面。11a2722b で ① の読みが parseItemText に替わっている。
- 今のコードで services/simulator/paste-read.ts の readPaste に見本 3・4・8 を通した (台本、scratchpad の使い捨て): 読めない行は 0。
  - 「ソケット…手袋」= 暗黙 base (グラスピングリングのベースの暗黙と一致)。
  - 「ダメージが56%増加する」「ゴールド 10%」= 暗黙 extra (ベースの暗黙より前の行)。
- extra の中身 (poe2db の Vaal Orb の Corrupted Mods、domain Item): 「(20—30)% increased Damage」「(5—10)% increased Quantity of Gold Dropped by Slain Enemies」「(15—20)% increased Critical Damage Bonus」がある → コラプトの結果の行と合う。ただし 56%・31% は表の幅を超え、見本 4 の「装備中のコラプト状態のアイテム 1 個ごとにスキルスピード」「アイテムのコラプト化は常に変化する結果になる」は表に無い (二重コラプトの何か。推し量らず extra のまま)。
- 直しは要らない (コードは変えていない)。点検 2 の残り (「T1?」の ? に理由を出す) は画面 (シミュ部長) の分。? は ItemTextMod.tier.fits === false の時。

## (b) 見本 3・8 の「品質の最大値 +20%」がクラフト MOD の狙いに入る
- poe2db の Essence of the Breach の項: 「Rings: +20% to Maximum Quality — Prefix」(Amulets も同じ)。
- エンジンの行 Rings/PerfectEssence_LocalMaximumQuality = prefix・source perfect_essence・「+20% to Maximum Quality」・値は文に入った固定。打つ処理の鍵は essence:breach (apply-essence の essenceTarget)。
- → 読み違いではなく、ブリーチのエッセンスで付く本物の MOD (MOD の種類の言い方では「クラフト MOD (エッセンス)」)。狙いに入るのは正しい。付け方 (エッセンス) と ④ の取り直しの空欄は自動の範囲 (シミュ部長・解析君)。
- e263ee15 で、幅の無い段は文の数字と比べるようにした (前は fits false で「T1?」と出ていた)。
