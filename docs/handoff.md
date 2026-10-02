# 引き継ぎ (2026-10-02 時点、新しいセッションが最初に読む)

まず `CLAUDE.md` → `docs/script_rules/_all.md` (台本ルール) → この紙。

## 今やっている回 (2026-10-02): 「エンドのクラフト素材 前編」(end_craft_materials_1)

- 2 本に分ける前編 (上位オーブ・エッセンス + 合金・フラクチャー・カタリスト)。後編は骨・お告げ。視聴者はエンド、値段の数字は出さない、「前編」と言ってよい (後編の中身には触れない)
- **台本は全 6 章 確定** (`output/work/end_craft_materials_1/approved/`、つないだ物 `data/scripts/end_craft_materials_1.json`、検査 0 件)。手順は `data/briefs/end_craft_materials_1.json` (琥珀のアミュレット ilvl 82、別の実演 essence / annul)
- POE2Tube 側の素材は済 (scene.kind = icons / table、アイコン 22 個)。**ExileDesk 要望 ㉔ の返事待ち** (ExileDesk のメモ craft-stage-feature の末尾): ティアの表の下限の灰色・「破砕」→「フラクチャー」・ブリーチのエッセンスで品質の上限 40%・品質で MOD の数値を伸ばす・MOD のタグ。控えは `output/work/end_craft_materials_1/requests.md`
- 次: ㉔ を開発版 (1420) で確かめる → kyohei のリリースの指示 → update_exiledesk → 撮影 → 合体 (build_video)。カタリストの章の「145 → 203」は ㉔ の後の結果 JSON で確かめる。section_01 の tiers は ㉔ の下限の指定を足す

## 今の状態

- チャンネル「チョコバナナch」公開済み 2 本: 「クラフトの基礎」(KENilVeUeoU)、「鞄に溜まったカレンシー」本編 (X05W2eQdReU) + ショート「3 秒クイズ」(JvJp1kahmfk)
- 3 本目「アクト中の火力と防御」本編 (DJxZ7HgjNTs) + ショート「上の3つは全く同じ武器、どっちが強い？」(ZbZ2wq4EVbI) を 2026-09-30 10:00 公開で予約済み。ショートの関連動画は Studio で手設定
- 4 本目「防御の仕組み」本編 (9kF4rWk1Uvk) + ショート「ボスの赤く光る技、効く防御はどれ？」(Cace_ygWwBU) を 2026-09-30 19:00 公開で予約済み。サムネは scripts/thumbs/defence_mechanics.py の土台 (output/defence_mechanics_thumb_base.jpg) に kyohei が文字を入れた物。ショートの関連動画は kyohei が手で設定済み。**次から: ショートの関連動画は、投稿のあと Claude が Claude in Chrome で Studio (studio.youtube.com/video/<ショート>/edit) を操作して本編を指定する** (API に項目が無い、kyohei 2026-09-30「B で操作していい」)
- 台本の新しい決まり (2026-09-30): 情報の画面の最低表示 軽い 6 / 表 10 / 仕組みの図 12 秒、同じ画像は下げずに 1 枚として数える、情報の多い画面は止めて解説 (_all.md)。動画は 30 MB 超えならスマホ用 _phone.mp4 も送る
- 方針: 今は本数を打つ助走期間 (仕上げに凝りすぎず早めに出す)。本番はクラフト解説と流行りのビルドの回
- ExileDesk は**リリースで固定した** `~/ExileDesk-stage` (v0.1.341、Vite 1430) を撮る (ADR 006)

## 待っている事

- 要望 ⑯ (`view=tiers&hl=0` = 段の表の金の段を隠す) は v0.1.329 で入り、固定版を進めて確認済 (2026-09-29、CAPTURE_VER=v16-hl0。test_1min_ui の 10 行目で金の段が無く 11 行目で出る)
- **ExileDesk 要望 ⑰ は v0.1.330 / 331 でリリース済、POE2Tube に取り込み済 (2026-09-29)**: 固定版は v0.1.331 (PoB のサブモジュールと cargo の stage_pob も update_exiledesk.py が用意)。台本の画面 `dps` / `ttk` / `hit` / `resists`、stage の DPS の札 (`show_dps`)、登場の動きの録画 (`capture/anim.py`)、スキル・ルーンの小道具。見送り (次のクラフト回): スキルの札 view=skill、MOD の重み (view=pool / roll)
- **要確認 (ExileDesk に聞く)**: 耐性の画面でアクト 3 (-20%) なのに装備なしの耐性が -10% と出る (PoB の元の値か、ラベルのずれか)
- **ExileDesk 要望 ⑱ (2026-09-29)**: 手ごとに付く MOD を指名 (`pick`、指名しなかった時の確率も結果に)・最初からレア (`start.mods`)・ベースの要求レベル。乱数探しをやめるため。全文は ExileDesk のメモ `craft-stage-feature`
- **次の回の話の筋 (2026-09-29 kyohei、⑱ のリリース待ち)**: 導入 = ずんだもんの武器 (プレフィックスは普通くらいのダメージ MOD、サフィックスはしょぼい: マナ・スタン・要求能力値)。サフィックスだけ豪華 (アタックスピード・近接スキルのレベル +2・クリティカル率) にすると伸びる。PoB 試算 (アイスストライク): 白 76.1 / ずんだもん 165.2 / サフィックスだけ豪華 218.0 (+32%)。敵のアーマー (PoB の目安、Lv32 で 237) は動画で言う。⑱ の MOD 指名 (`pick` / `start.mods`) で作る。導入は approved/section_00.json を作り直す、2 章目以降は全部作り直さず章ごとに
- **ExileDesk 要望 ⑲ (2026-09-29)**: PoB 連携の総点検 (サポートが効かない・段階のあるスキルが 0 など、本体の PoB と突き合わせ)。返事を見て _facts.md に「動画で言って良い数字」を書く
- **⑱・⑲ はリリース済・取り込み済 (2026-09-29 夜、固定版 v0.1.336、CAPTURE_VER=v18-pick)**: 指名 (`pick` / `remove` / `start`)、要求レベル、PoB の skill_part / quests_act / enemyArmour。サポートジェムが効くようになった。ワーリングスラッシュは槍専用 (クォータースタッフでは 0)。耐性 +10% はアクト 3 のクエスト報酬 (以前の「元の値」は誤り)
- **次の回の台本 (2026-09-30)**: 1 章ずつ手で書いて確認中。確定済みは `output/work/act_offense_defense_8min/approved/section_00〜03.json` (導入 / プレフィックスは当たりが多い / 白からサフィックスを埋める / 熟練工とルーン)。クイズはまとめの前に 1 問だけ。次は 5 章目 = 防御 (耐性)、その後 資源 (解呪) → クイズ → まとめ。全部 OK になったら approved を並べて data/scripts/act_offense_defense_8min.json にする
- **ExileDesk 要望 ⑳ (2026-09-30)**: 耐性の画面の計算に quests_act が渡っていない (全部入りで計算される)。直るまで 5 章目の耐性の数字は確定しない
- **ExileDesk 要望 ㉑ はリリース済・取り込み済 (v0.1.338、CAPTURE_VER=v20-compare)**: 比べる画面の差の列が 増えた (+) → 変わった (53→104%) → 消えた (−) の順、差 0 の行は出ない
- **次の台本から (2026-09-30 kyohei)**: 情報の画面は 8 秒以上出したまま話す (lint.info_screen_time)、章名カードの間はモザイク + テロップなし、解呪は「かいじゅ」
- **ExileDesk 要望 ㉒ (2026-09-30、次の回「防御の違い」用)**: A = PoB の防御の点検 (感電 15/20・凍結 2/4 秒・出血毒と ES・回避のエントロピーと式・アーマー係数・耐性ペナルティの区切り・受け流し・ルーンワード・回避ロール、原因が PoB か渡し方か)、B = 防御の仕組みの画面 (layers / armour / evasion / es / bases / hit の拡張)。数字はゲームのデータ優先
- **要望 ㉒ はリリース済 (v0.1.341、CAPTURE_VER=v21-defence)**: 防御の画面 view=layers / armour / evasion / es / bases (URL の読み方は ExileDesk src/state/craft-stage.ts の defenceView)。点検の結論は _facts.md の「防御の仕組み」。POE2Tube の Scene.kind にはまだ足していない
- **POE2Tube 側で作る素材 (ExileDesk に頼まない物)**: ① DPS の推移の棒 (白 → 変成 → 増強 → 王者 → ルーン、結果 JSON の pob.dps から) ② 耐性 50% と 75% で受けるダメージの長さ比べ (2 倍) ③ 前提の札 (「モンク Lv20・普通の敵・アクト 3 のペナルティで計算」、結果 JSON に書き戻された設定から)
- 新しいリリースを使う時の手順: `python scripts/update_exiledesk.py` → 1430 の Vite を止める → `CAPTURE_VER` を上げる → `build_video.py data/scripts/test_1min_ui.json --keep-frames` → `check_sync.py` で確認

## 次の動画: 「アクト中の火力と防御」に決定 (2026-09-29、武器・ルーン・耐性・解呪。ExileDesk 要望 ⑰ 待ち)

候補 (kyohei に出した物、決まったら _intake.md の質問から):
- 前の動画の積み残し: オーグメントソケットに何をはめるか / スキルジェムの原石 / シャードの手に入れ方 (どれも _facts.md に無いので要確認)
- 拾った装備、入れ替える？捨てる？ (比べる画面 `compare` を使える)
- 耐性 (上限などの数値は要確認)、ステータス要求、スピリット、パッシブツリー、フラスコ
- クラフト素材 (エッセンス・カタリスト・お告げ・骨): 効果はゲーム内の説明文で確認済み。**アクト中に拾えるかはデータに無い → kyohei に聞く**

## 1 本の流れ (決まっている事)

既定の質問 → brief → run_stage → 台本 (Claude) → **1 章ずつ一緒にチェック** → 動画 (その間にショート案を出して並行) →
`check_sync.py` でずれ確認 → **サムネは毎回 0 から考え、白背景・文字を被せない・上げる前に kyohei に見せる** → 本編とショートを同時刻で投稿 → X で宣伝 (サムネ画像を添付 + 本文に URL、140 字以内。投稿は kyohei)

台本の決まり (_all.md): 過去の動画の内容は説明し直さない / 章末にクイズ 1 問 / ネタバレしない (変化は画面が先、答えを問う行で答えを出さない) /
次回予告はしない、締めはチャンネルの方針と登録・コメントのお願い / 剣は未実装なので使わない / シャードは 4 種類
