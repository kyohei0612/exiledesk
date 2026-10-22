# ジン部長 のやる事

## ブラックへの報告 (送信の上限で送れなかった分、10-22)
- 入口に aimHits を出した: services/craft-stage/engine.ts の `aimHits(m: StageMod, t: AimTarget): boolean` (aim-odds の hits そのまま = 未発現でなく、同じ modId で段が minTierIndex 以上。振る舞いは同じ)。0d11e79d、push 済み、型チェック通過。シミュ部長 12 本目へ。use() の seed・setUseHook (251a20b0) のお知らせも受けた。待機中。

## やる事
- 引き継ぎ (10-22 深夜、4 本目 → 5 本目): 下の「4 本目の分」→「3 本目の分」の順に先に読む。宛先のブラックは 5 代目 (dev/todo.md の表)。
- 4 本目の分 (全部 push 済み):
  - RowTag.replace (3fcae561、シミュのツリーの外れ MOD の行)。パターンの初期値 freshPatterns() (96e6050d、シミュも使用済み)。docs/craft-challenge.md の整理 (50e7a433)。
  - スパムシミュ「今のアイテムから (カオス)」(cc238c44、要望 51092b58、FROM_ON) と「複数の当たり」(9620bea6、ROUTES_MULTI_ON、当たり 3 つまで OR・内訳 hitsBy・増強は側ごとに独立で両側なら「両方揃うまで」RaceRow.both)。どちらも開発版だけ、pending-release.md に行あり (印を外して出す)。開発版に出したのは cc238c44 まで (af82aa4d)、9620bea6 はまだ開発版に出していない (デプロイはブラックに聞く)。スナップ 共有メモ routes-from/・multi-aim/。
  - 返事待ち (オーナー): 今のアイテムからの時に高貴の道も灰色 (増強だけでよいか)・この形の X のシェア・既定の始めの状態。複数の当たりのシェアは a に全部入る、両方揃うまでの数字はシェアに入れていない。
  - デイリーの入口 (2506d232・bb0f90e2、DAILY_ON、dailyPage {view, q}・?page=daily / daily&q / daily-start&q・ヘッダーの「デイリー」・textPage に足して両脇の枠)。中身 DailyPage.vue はデイリー部長。
  - CourseHost の class の警告 (a57b9625、チュートリアルの持ち物・ブラックの OK)。StageCourseGuide の class は効く物なので残した。
  - 確かめの小技: 窓なし Chrome は Bash から立て、閉じる時は CDP の Browser.close (PowerShell を呼ぶと窓が出る)。vite は他のセッションの書き換えでページを丸ごと読み直すので、スパムシミュの台本は読み直されたらやり直す形で。src に一時のファイルを置いて消しても読み直しが起きる。
- 引き継ぎ (10-22 夜、3 本目 → 4 本目): 下の「3 本目の分」→ notes/2026-10-22-handoff-2.md (2 本目の分) → notes/2026-10-22-handoff.md の順に先に読む。
- 3 本目の分 (全部 push 済み、詳しくは notes/2026-10-22-code-audit.md の頭「直した物」):
  - 済み: StageItemCard の行ごとの札 rowTags (15a5f73d、型 stage-item-row-tag.ts。シミュが試し打ちの外れ MOD に使った 4e51480b)。500 行超え 4 本を割った (parts-unrevealed・stage-draw・_htc-display-tags / _htc-base-info・_gem-csd)。コードの点検 notes/2026-10-22-code-audit.md。ホワイト用 scripts/org-lint.mjs (読むだけ、--json あり) と .gitignore の docs/org/white/notes/。code-audit の直す案のジンの分 (owners.txt・入口の sideOfMod・重複・消す・parity を 2 本・_poe2db-common)。xIntentUrl(url, text?) (1adf9da6)。
  - 届いていない知らせ (送信の上限で止まった): シミュ部長 5 本目 (local_b0d5106d) に「xIntentUrl が文を引数で受ける (1adf9da6)。recipe-share.ts を寄せられる」。4 本目が 1 行送る。
  - 残り (頼まれて済んでいない物なし)。他の部に投げた物: sideOfMod への置き換え (シミュ 5 本目が simulator/todo.md に、解析君の auto-model.ts:164)・simulator/htc と htc-craft への import を外す (シミュ。外れたら owners.txt はそのまま、org-lint の 2 フォルダーが消える)。
  - 見送った物 (理由は code-audit.md): spam-counts と routeRun の打ち方をまとめる (決まりが違い乱数が変わる)、クライアントの作り直しの exists・loadTable・exportTables (写しでない)、StageModList (500 行ちょうど) の rows・tierIndexOf、style.css・pob-check (今回やらない)。
  - オーナーに見せる物: 使わない台本 7 本の一覧 (code-audit.md 1 節の要確認、消していない)。
  - 気付き: tests は tsconfig の include に入っておらず型チェックされない (割った parity は tsc を手で当てた)。stage-core は stage-draw を再輸出している (循環は関数だけなので動く)。Bash の `\` が 1 段消えるので正規表現の入る台本は Write で書く。今の作業ツリーで simulator/tree/tree-run.ts に使わない import 3 つ (シミュの書きかけ、型チェックが落ちる)。
  - 立てた物 (Chrome・dev サーバー) は無し。
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
- スパムシミュの「今のアイテムから (カオス)」(要望 51092b58、cc238c44、開発版だけ FROM_ON、開発版に出した)。本番はオーナーの OK の後 (FROM_ON を外す)。残り: この形の X のシェア (開いた人は同じアイテムを持っていないので今は出さない)・既定を今のアイテムにするか、をオーナーに。運試しそのものは作業中のアイテムを触らない (書き換えるのは「ここから開始」だけ、押すと工程は 0 から。説明の文に足した = 本番にも出る)。スナップ 共有メモ routes-from/。
- サイトの体裁 (1adfb648、開発版。docs/pending-release.md に OK 待ち、【要確認】5 か所はオーナーに)。ブログの部品 (d306fea0、README 4b)。
- ブログの入れ物 (開発版だけ、notes/2026-10-22-blog.md)。本番は記事を読んでもらってから (build:web に build-blog-pages.mjs を足し、BLOG_ON を外す)。日報の行は分析君、コメント欄はこれから。
- MOD の重みを直せる (開発版だけ、WEIGHTS_ON。notes/2026-10-22-mod-weight-edit.md)。本番はオーナーの OK の後。
