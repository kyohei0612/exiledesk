# ジン部長 のやる事

## やる事
- クラフト画面 1440 幅で元からはみ出している 1 件 (DIV.flex flex-col、overflow-guard の判定で見つけた、10-22) を直す。
- 名前の食い違い (記事編集長 10-22、AdSense の後): items-ja.json の Essence of the Abyss「深淵のエッセンス」→ poe2db「アビスのエッセンス」(src/i18n/currencies-ja.ts は items-ja.json を先に引く)。エンジンの説明 (spec/essence-specs.ts・apply-essence.ts) の「深淵の王の印」→ poe2db「アビサルロードの紋章」。写しで決まらない物は poe2db に合わせる決まり。ついでに items-ja.json の名前と poe2db の日本語名を台本で突き合わせて、ずれの一覧を notes/ に (直すのは一覧を見てから、本番の文が変わるので pending-release に OK 待ち)。
- 済み: お告げの下の設定 (触媒の高貴の品質 1% ごとの倍率・聖別の倍率) は本番 v0.1.589 (f1e1a612、オーナー 10-21 OK)。notes/2026-10-21-omen-tune.md
- currency-spec-golden が 6 つとも控えとずれている (控えは 10-17 の 071a0af9 に取ったきり、その後のエンジンの commit が多い)。どの commit でずれたかを別の worktree で探し、わざとの変更なら GOLDEN_WRITE=1 で取り直す (J1 で見つけた、family の直しでは変わらない)

- 貼り付けの読み取り parseItemText (item-text.ts) の残り: 日本語の Ctrl+Alt+C の見出し・日本語の注記の形 (見本が来たら notes/paste-samples/ に足して対応)。ジュエルの枠 2/2 はエンジンの値で poe2db では確かめていない。
- J11 (オーナー 10-20 の答え、J8 の迷う物 4 つ。1 つずつ別の commit、クラフト台は開発版まで・本番は OK 待ち):
  - ① 済 (10-21 dc3e219a エンジン・64e7c766 貼り付け、golden・held-odds-parity 変わらず) — ルーンの「明示 ○○ MOD の強さが N% 増加」(破壊のルーン Rune_destruction_*ModifierEffect: Critical / Speed / Chaos / Physical / Elemental (火・冷気・雷・元素ダメージ) / Mana) をエンジンで MOD の値に掛ける。案: stage-core の boostedMod の % に「アイテムの他の MOD の ModifierEffect のうち、その MOD のタグに当たる物の合計」を足す (自分自身には掛けない)、boosts.ts の ModBoost に kind "magnitude" を足して表示では抜く。**どの MOD が「明示 ○○ MOD」に入るか (タグ critical・speed・chaos・physical・fire/cold/lightning/elemental_damage・mana のどれで見るか) は poe2db で確かめてから** (推し量らない)。golden・held-odds-parity を回す。
  - ② 防御・DPS の合計は盛ったまま (直さない)。
  - ③ ルーン・ソウルコアの行は今の値のまま、ソケットの効果 (アストリッドなど、scaledAugment) で盛った分だけ抜く。
  - ④ 聖別も抜いて素の値を出し、聖別後の値は小さく添える (baseValueOf の base = sanctify.base)。
  - 残り (10-21 使用量で止めた): ③ ④ とクラフト台の直し (開発版だけに出す)。クラフト台の直しの場所は notes/2026-10-20-j8-boost-table.md の表 (アイテムカードの MOD・ソケット・暗黙の行、履歴・小さいカード・スマホの帯の聖別)。

## OK 待ち
- サイトの体裁 (1adfb648、開発版。docs/pending-release.md に OK 待ち、【要確認】5 か所はオーナーに)。ブログの部品 (d306fea0、README 4b)。
- ブログの入れ物 (開発版だけ、notes/2026-10-22-blog.md)。本番は記事を読んでもらってから (build:web に build-blog-pages.mjs を足し、BLOG_ON を外す)。日報の行は分析君、コメント欄はこれから。
- MOD の重みを直せる (開発版だけ、WEIGHTS_ON。notes/2026-10-22-mod-weight-edit.md)。本番はオーナーの OK の後。
