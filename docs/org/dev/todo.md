# 組織の台帳 (宛先・触っている・共有の物)

ここは今の状態だけ。終わった記録・前の順番は git の履歴 (10-29 の md の整理で消した): 2026-10-22-todo-archive.md。OK 待ちは docs/pending-release.md の 1 本。

## 常駐の宛先 (SendMessage の to。入れ替えたら直す。立てたブラックが自分で書く)
| 誰 | session id | 今 |
|---|---|---|
| ブラック | local_fcd66af1-889f-43a4-8bf1-de5b66cfd0ce (129 代目、Opus 5.5、11-17 15 時台に入れ替え。128 = local_953eabd5 が 2,39x 件で交代。進み = 共有 local_41371db6…/progress/black129.md・引き継ぎ = black128.md の一番上と ExileDesk/progress/black128-run.log) | 司令塔・振り分け・順番 |
| デイリー部長 | local_3dc532a3-f59c-4ab6-85fb-9529ad6ab3fc (29、11-16 夜にブラック 125 が立てた。28 = local_384664fe はアーカイブ。頼み = 共有 local_41371db6…/progress/daily-lead29-brief.md、進み = 同 daily-lead29.md、記録 = progress/daily-lead29-run.log) | 今: 挑戦中のぼかし・押した箱だけ完成 (76837c02f、開発版)、ごめんねの木の数え直し (書くのはオーナーの OK の後)。お題が決まった時に #日報 へ「今日のお題」を 1 通 |
| 最終チェック長 | local_f1177c1e-6910-4b0b-a6d4-cb5c90ae7881 (26、11-17 にブラック 128 が控えで立て、ブラック 129 の合図で入った。頼み = 共有 local_41371db6…/progress/release-next26-brief.md、進み = 同 release-next26.md) | 今: 0.1.747 を本番に出した (Web 2db3695d)。次の出しの合図待ち |
| サーバー係 | local_c4fa7cdc-b847-4671-b7fa-bdba82e7556f (5 代目 server-keeper5、11-15 16:46 に 1440 を立て直して持ち主に。4 代目 local_f6d61d7a は 2,5xx 件でアーカイブ) | 開発版 1440 を持つ。ブラックの「1440 を立て直して」で立て直し、結果は ExileDesk/progress/server-keeper.md に 1 行 (返事は送らない、止まった時だけ) |
| 解析君 | — (analyst1 local_819bb9cb は 11-14 0 時台に ui_tally を済ませてアーカイブ。一覧は本番に出て 1 週溜めてから) | 待機 |
| ジン部長 | local_53278b2c-7cff-44c9-83eb-03b6f52772cb (jin-frac3、11-15 夜にブラック 120 が立てた。頼み = 共有 local_41371db6…/progress/jin-frac3-brief.md、進み = 同 jin-frac3.md、記録 = progress/jin-frac3-run.log。前の jin-cast local_047c4bca は首飾りのキャスピ fc277a259 を済ませてアーカイブ、引き継ぎ = 共有ノート progress/jin-wash.md・tests-triage-1112.md) | 今: フラクチャーの固定を 3 つまで (E-40、スイッチ fracture3、オーナーの言葉だけ)・冒涜で付いた元素耐性も「いずれか」の当たりに (S-10h)。開発版まで。残り = 古いテスト 10 件 → 冒涜のタグ → 外の正解の束の口 → エンジンの決まり 10 個のテスト |
| エンジン部長 | — (10-25 夜に 1 本目を立てたが、オーナーの決め直しでエンジンはジンに戻し閉じた、引き継ぎ emulator/notes/2026-10-25-engine-lead-handover.md) | なし |
| リサーチ長 | — (research-video は 11-05 に動画の手順を渡してアーカイブ) | 仕事が来たらブラックが立てる |
| シミュ部長 | local_4d08f13a (81、11-17 16:30 に 80 = local_61f389a6 から交代、80 は上限を超えた。頼み = 共有 local_41371db6…/progress/sim-lead81-brief.md、進み = 同 sim-lead81.md、記録 = progress/sim-lead81-run.log、80 の引き継ぎ = sim-lead80.md の一番上) | 今: 2A builtLocal (S-104f、一度開いた木を端末に覚える) の作り → ページを開いた直後に覚えから読む時の測り → 1 秒以内か。後で = 同じ枠探しの索引、applyPick が craftStage.data を直に読む件 |
| デザイン部長 | local_cbf0f520-1dc2-49f5-8398-3bd299401baf (12、Opus 5.5、11-17 昼にブラック 129 が入れた。11 = local_37909448 から交代。頼み = 共有 local_41371db6…/progress/design-lead12-phonepc-brief.md、進み = 同 design-lead12.md。記録 = progress/design-lead12-run.log) | 今: スマホでデイリーを PC の全体表示 + 指の拡大縮小で遊べるように (D-70c)。続き = どの幅でもはみ出さず押せる UI (U-53c) |
| エミュ部長 | — (emu-lead2 local_190a727a はアーカイブ済み) | 仕事が来たらブラックが立てる |
| 記事編集長 | — (6 本目は 11-01 にアーカイブ、引き継ぎ = 共有メモ local_360897fa…/handoff-blog.md) | 仕事が来たらブラックが立てる |
| サーバー管理人 | 分析の係 (11-14 にブラック 108 が立てた。この session) | 今: 要望の受け口 = 添付の上限 192 KB・Discord の本文に送った画面 (U-05e、デザイン部長 8 の差分)。本番のサーバーの出しは最終チェック長 |
| スキン部長 | — (2 本目は 10-26 に閉じた。ページは本番、決まりと地図は skins/README.md) | 眠り |
| ほかの部長 | — | 仕事が来たらブラックが立てる |

## 閉じた物 (11-10 棚卸し)
- 宛先の表のシミュ部長 local_7566d630 (sim-670-fix、11-05 にブラック 46 が立てた。猿 monkey-670 の ① MOD ボタンの重なり ② 使用ルーンの置き換え、前の sim-video-fix の詰まりの一覧 = 共有メモ local_4488fd22…/sim-video-route-2026-11-05.md) — 古い (11-05 の物)
- 宛先の表のサーバー管理人 local_311c0837 (server-ninja、ninja の週 1 回取得 = Workers・Y-52 の例外) — 古い (11-09 に Workers から弾かれ家の PC へ = D-80e)
- 宛先の表の旧デイリー部長の行 (daily-sanctified は 1e1ecae71 の後 11-05 にアーカイブ、server/live の次の deploy は migration 0017 を先に = D-80d) — 古い (デイリーは v0.1.688〜691 で本番、今の部長は上のデイリー部長 4)
- 入口に無い物: 重み 0 の MOD (創生の樹のスペルダメージ) を始めの形に置く手段 (解析君 10-21) — 古い
- 共有の物の使用表の 10-22〜28 の状態 (devtools の Chrome はシミュ 30 本目が返した 10-26・窓なし Chrome はモンキーが 9333 を止めた 10-28・1460 / 1461 と 1440 は 10-28 夜に最終チェック長が止めた・Claude in Chrome はリサーチ長が返した 10-22) — 古い (表の書き換えだけ)
