# ジン部長 7 本目 → 8 本目の引き継ぎ (2026-10-24)

## 7 本目がやった事 (全部 push 済み)
- 入口: engine.ts に baseSocketsOf (3e542d51)、engine-sim.ts に carryAims (ベースを替えた時に狙いを読み替える、3599bd0b。シミュ 18 本目が use-tree の setBase で使用)。
- データ: 前兆・歪んだ・悲嘆・捻じれたアミュレットの暗黙の 0 の行を外す (9eedb4f8、poe2db-implicit-fixes.json)。
- 本番: v0.1.595 (44b86e12、288c3ba6 J5a・384370cc・9eedb4f8、../ExileDesk-release で作った最後の revert の本番) と v0.1.596 (8685ffec、main からの初めての本番、オーナーの「始めて」)。../ExileDesk-release は消した。
- スイッチ (src/web/release-flags.ts): sim・daily に寄せた (18e66905)、ジンの OK 待ち 5 つ abyssSuffix・skillPlus・talismanWeight・dntBases・runeMagnitude (eb98e239) → 全部 RELEASED (ba89987b・70825742)。フォント 1bef14b9 は main で revert (8ccb1f03)。エンジンが読んでよい外に release-flags.ts を足した (README の地図)。_bundle-ts.mjs の define に VITE_DEV_PREVIEW (97d1091d、build:web が止まっていた)。
- 古い作りの片付け (段 5): 使い手 0 の export 15 個 (05a7fd04)、for-sim / for-emu のコメント (a981095c)、pending-release.md を main から出す形に (5d643353、古い済みは dev/notes/2026-10-24-pending-release-archive.md)、消えた開発版の言い方 (974d2a1c・9dab5349・92fcd425)、mode の "sim" を外す (3a1a7687)。
- 決まり 11 個目 → 10 個に (22b0f7ff。8 = 出どころはトレード > poe2db > ほか)。
- 調べ: 10-23 の「上限を超えている側」155 回は不具合でない (ジュエルの液化した感情の後、10-14 のオーナーの確かめどおり)。
- 照らしの台本 scripts/check-monkey-engine.mjs (+ _monkey-engine-entry.ts、a1ca947e・94529235): 猿の記録の step ごとに、エンジンで棚 (打てる / 打てない + 理由)・お告げ・付きうる MOD を出して差を書く。猿が書く欄 rarity (必須)・mods・modsUnknown・baseEn。r1 で棚 381/432・お告げ 382/382 同じ。

## 待っている物
- 隊長の 3 回目 (rarity 入りの記録) をこの台本で照らした結果。残りの差 2 つ: レアの武器・兜で棚が骨 (鎖骨) だけ (シミュ部長へ渡し済み)、マジックの手袋・矢筒で戦闘のグレーターエッセンスがツリーの棚に無い (どちらの差か未決、回し直しで残るか見る)。
- 他の部へ返した物: views/daily の 6 ファイルが読まれていない (デイリー部)、../ExileDesk-devbuild の作業場所を消すか (ブラック)。
- テストの落ち 5 本 (カタリスト・ソウルコア・指名・液化した感情・log-sender) は前から (スイッチ前の 18e66905~1 でも同じ)。直すかはブラック。

## 気を付ける事
- 一時の worktree に node_modules を junction でつながない (消した時に本体の node_modules が消えた、メモ worktree-junction-node-modules)。
- Bash の heredoc・sed では `\` が消える。正規表現の入る書き換えは台本ファイル (Write) で。CRLF のファイルは置き換えが外れやすい。
- cmd 経由の execSync では `^` が消える (`e82ef1a5^` が e82ef1a5 になった)。`~1` を使う。
- web/・utils・composables はデザイン部長の持ち物 (b9aa4577、オーナー「ジンはデータ管理」)。頼まれても渡す。

## todo.md の頭から移した行 (6 本目 → 7 本目の引き継ぎ、7 本目の済み)
- 済み (7 本目、10-23): モンキー 12 は開発版で直っていた。3 の連打の守り (e643ee9a)・2 routes (96bb584d)・9 sfx (a96ebff8) は直して push、src/web・utils がデザイン部長の物になったので確かめごと渡した (notes/2026-10-23-monkey-web-handover.md)。fractureStart (J1)・placeMods (J2) は engine-sim.ts に入れてシミュ部長 17 本目に知らせ済み。
- 引き継ぎ (10-23、6 本目 → 7 本目): 宛先は dev/todo.md の表。途中の物・触っている行・立てた物 (Chrome・dev サーバー) は無し、開発版と 9333 は空きに戻した。
  - 次の仕事 (ブラック 8 代目の頼み、オーナー OK 10-23): エンジンの中だけの死蔵の洗い出し。対象 = services/htc のアプリの名残・旧シミュの run-plan / contract・使われない export と JSON など、エンジンの持ち場の中だけ (画面の部長の持ち場には触れない)。形: まず「poe2db 由来のデータと決まり / それ以外」に分けた一覧を emulator/notes/ に書き、ブラックに 2〜5 行で報告。消すのは一覧を見せてから。確かめは型チェック・小さく (エミュの画面の同じ所の答えと同じか)。シミュの死蔵の一覧 docs/org/simulator/notes/2026-10-22-dead-code.md の作り (import のグラフ・export の名前の数え) が参考。
  - 返事待ち (ブラック): 見張り D の残り 4 行 = クラフト台 → views/tutorial/course-entry.ts (チュートリアルの差し込み口)。for-share へ移すか見張りで許すか。
  - 6 本目の分 (全部 push 済み、経過は notes/2026-10-22-entry-split-plan.md の「進み」):
    - エンジンの形: 核 (services/craft-stage) / engine-emu/ (preview・spam-race・chaos-spam・route-runes) / engine-sim/ (hand-effect = fillCatalyst 一式・magic-odds・spam-counts・outcomes・essence-parts)。窓口 engine.ts・engine-emu.ts・engine-sim.ts。核は engine-*/ を読まない、engine-emu/ と engine-sim/ は互いを読まない。見張り check-engine-entry: A 入口の外 (今 96 行 = シミュ・チュートリアル・解析、付け替えの対応表 notes/2026-10-23-sim-import-map.md、エミュは 0 行)・C よその窓口 0・D エミュ ⇄ シミュ 4。
    - シミュ由来の包みは消した (0689aa28): tree-play.ts を消し、打てるかは核の useReason に 1 つ (クラフト台と棚)。木の中の打ち方はシミュの tree-sample・当たりの判定は tree-aim.ts。
    - 画面の部品は共通管理 for-share (デザイン部長の物、渡した): 棚・アイテムのカード・MOD 表の土台 ModTable (エミュは views/craft-stage/StageModList、シミュは TreeGoalPage が slot で足す)。クラフト台の中の旧シミュの形は死蔵として消した (37d1bdcf)。
    - 気付き: git rm / git mv で先に index に積むと他の人の引数なしの commit に混ざる (4f97fc8e)。mv してすぐ `git commit -- <パス>`。Bash では \ が 1 段消える (台本の正規表現は Write / Edit で)。移しの台本の作り (移した先へ相対 import を直す) は notes の「進み」に書いた手順で。
