# ジン部長の todo から移した済みの物 (10-23、ホワイトが整理。中身はそのまま)

- FAQ の入れ物 済み (9d3d8462、build-blog-pages.mjs)。元 src/data/faq/faq.<ja|en>.md (記事編集長が書く、1 問 = ## 質問)。本番は ready: true の時だけ出てリンク (記事のヘッダー・フッター・About のフッター・サイトマップ) も付く。残り: 原稿が入ったら開発版 (デプロイはブラックに一言)、本番はオーナーの OK の後。見本のスナップ 共有メモ faq/。
- 済み (10-22): items-ja.json の残りの突き合わせ → 221 件を poe2db に合わせた (notes/2026-10-22-name-check-poe2db-jp.md、本番は OK 待ち)。poe2db の一覧に無い 2,420 件は比べていない。
- 済み (10-22): 名前のずれ → notes/2026-10-22-name-check.md (2 件 + 紋章 + クルガル、本番は OK 待ち)。残り 3,266 件は poe2db の写しを取り直す時に。
- 済み: お告げの下の設定 (触媒の高貴の品質 1% ごとの倍率・聖別の倍率) は本番 v0.1.589 (f1e1a612、オーナー 10-21 OK)。notes/2026-10-21-omen-tune.md
- 済み: currency-spec-golden の控えのずれ → J2 (3f4e605d) で取り直し済み、10-22 に 6/6 通る (不在のアミュレットの理由の文で a2c4532b に orbs を取り直し)。

- J11 (オーナー 10-20 の答え、J8 の迷う物 4 つ。1 つずつ別の commit、クラフト台は開発版まで・本番は OK 待ち):
  - ① 済 (10-21 dc3e219a エンジン・64e7c766 貼り付け、golden・held-odds-parity 変わらず) — ルーンの「明示 ○○ MOD の強さが N% 増加」(破壊のルーン Rune_destruction_*ModifierEffect: Critical / Speed / Chaos / Physical / Elemental (火・冷気・雷・元素ダメージ) / Mana) をエンジンで MOD の値に掛ける。案: stage-core の boostedMod の % に「アイテムの他の MOD の ModifierEffect のうち、その MOD のタグに当たる物の合計」を足す (自分自身には掛けない)、boosts.ts の ModBoost に kind "magnitude" を足して表示では抜く。**どの MOD が「明示 ○○ MOD」に入るか (タグ critical・speed・chaos・physical・fire/cold/lightning/elemental_damage・mana のどれで見るか) は poe2db で確かめてから** (推し量らない)。golden・held-odds-parity を回す。
  - ② 防御・DPS の合計は盛ったまま (直さない)。
  - ③ ルーン・ソウルコアの行は今の値のまま、ソケットの効果 (アストリッドなど、scaledAugment) で盛った分だけ抜く。
  - ④ 聖別も抜いて素の値を出し、聖別後の値は小さく添える (baseValueOf の base = sanctify.base)。
  - 済み (10-21): ③ 86b42bb4・④ afa0b266・2d301a1a・暗黙 ada62af7 (開発版だけ、BASE_VALUES_ON。本番は pending-release の OK 待ち)。
