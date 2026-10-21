# ジン部長 のやる事

## やる事
- 引き継ぎ (10-22 夜): notes/2026-10-22-handoff.md を先に読む (お告げの欄の部品・previewUse・聖別の後は何もできない)。
- FAQ の入れ物 済み (9d3d8462、build-blog-pages.mjs)。元 src/data/faq/faq.<ja|en>.md (記事編集長が書く、1 問 = ## 質問)。本番は ready: true の時だけ出てリンク (記事のヘッダー・フッター・About のフッター・サイトマップ) も付く。残り: 原稿が入ったら開発版 (デプロイはブラックに一言)、本番はオーナーの OK の後。見本のスナップ 共有メモ faq/。
- 済み (10-22、2 本目): 聖別済みは品質の帯とアイテムレベルの欄を灰色で押せなく (092c49bb、オーナーの決め)。9acbea38 と一緒に開発版 (HEAD 2a33d4eb)、本番は pending-release の OK 待ち。前後のスナップは共有メモ sanctified-bar/。確認の手順: vite の dev で `import('/src/state/craft-stage.ts')` の craftStage.use('alchemy') → omens=['OmenofSanctification'] → use('divine')。
- クラフト画面 1440 幅で元からはみ出している 1 件 (DIV.flex flex-col、overflow-guard の判定で見つけた、10-22) を直す。
- 済み (10-22): items-ja.json の残りの突き合わせ → 221 件を poe2db に合わせた (notes/2026-10-22-name-check-poe2db-jp.md、本番は OK 待ち)。poe2db の一覧に無い 2,420 件は比べていない。
- 済み (10-22): 名前のずれ → notes/2026-10-22-name-check.md (2 件 + 紋章 + クルガル、本番は OK 待ち)。残り 3,266 件は poe2db の写しを取り直す時に。
- 済み: お告げの下の設定 (触媒の高貴の品質 1% ごとの倍率・聖別の倍率) は本番 v0.1.589 (f1e1a612、オーナー 10-21 OK)。notes/2026-10-21-omen-tune.md
- 済み: currency-spec-golden の控えのずれ → J2 (3f4e605d) で取り直し済み、10-22 に 6/6 通る (不在のアミュレットの理由の文で a2c4532b に orbs を取り直し)。

- 貼り付けの読み取り parseItemText (item-text.ts) の残り: 日本語の Ctrl+Alt+C の見出し・日本語の注記の形 (見本が来たら notes/paste-samples/ に足して対応)。ジュエルの枠 2/2 はエンジンの値で poe2db では確かめていない。
- J11 (オーナー 10-20 の答え、J8 の迷う物 4 つ。1 つずつ別の commit、クラフト台は開発版まで・本番は OK 待ち):
  - ① 済 (10-21 dc3e219a エンジン・64e7c766 貼り付け、golden・held-odds-parity 変わらず) — ルーンの「明示 ○○ MOD の強さが N% 増加」(破壊のルーン Rune_destruction_*ModifierEffect: Critical / Speed / Chaos / Physical / Elemental (火・冷気・雷・元素ダメージ) / Mana) をエンジンで MOD の値に掛ける。案: stage-core の boostedMod の % に「アイテムの他の MOD の ModifierEffect のうち、その MOD のタグに当たる物の合計」を足す (自分自身には掛けない)、boosts.ts の ModBoost に kind "magnitude" を足して表示では抜く。**どの MOD が「明示 ○○ MOD」に入るか (タグ critical・speed・chaos・physical・fire/cold/lightning/elemental_damage・mana のどれで見るか) は poe2db で確かめてから** (推し量らない)。golden・held-odds-parity を回す。
  - ② 防御・DPS の合計は盛ったまま (直さない)。
  - ③ ルーン・ソウルコアの行は今の値のまま、ソケットの効果 (アストリッドなど、scaledAugment) で盛った分だけ抜く。
  - ④ 聖別も抜いて素の値を出し、聖別後の値は小さく添える (baseValueOf の base = sanctify.base)。
  - 済み (10-21): ③ 86b42bb4・④ afa0b266・2d301a1a・暗黙 ada62af7 (開発版だけ、BASE_VALUES_ON。本番は pending-release の OK 待ち)。

## OK 待ち
- サイトの体裁 (1adfb648、開発版。docs/pending-release.md に OK 待ち、【要確認】5 か所はオーナーに)。ブログの部品 (d306fea0、README 4b)。
- ブログの入れ物 (開発版だけ、notes/2026-10-22-blog.md)。本番は記事を読んでもらってから (build:web に build-blog-pages.mjs を足し、BLOG_ON を外す)。日報の行は分析君、コメント欄はこれから。
- MOD の重みを直せる (開発版だけ、WEIGHTS_ON。notes/2026-10-22-mod-weight-edit.md)。本番はオーナーの OK の後。
