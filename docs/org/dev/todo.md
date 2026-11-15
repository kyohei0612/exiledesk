# 組織の台帳 (宛先・触っている・共有の物)

ここは今の状態だけ。終わった記録・前の順番は git の履歴 (10-29 の md の整理で消した): 2026-10-22-todo-archive.md。OK 待ちは docs/pending-release.md の 1 本。

## 常駐の宛先 (SendMessage の to。入れ替えたら直す。立てたブラックが自分で書く)
| 誰 | session id | 今 |
|---|---|---|
| ブラック | local_819477c9-3c85-4d0c-b741-90934db52ba6 (119 代目、Opus 5.5、11-15 夕に入れ替え。118 = local_63f05cbb が 2,39x 件で交代。控えは無し、進み = 共有 local_41371db6…/progress/black119.md・引き継ぎ = black118.md の一番上) | 司令塔・振り分け・順番 |
| デイリー部長 | local_a7b68204-acff-4219-9158-f6b6dba60033 (24、Opus 5.5、ブラック 118 が控えで立て、23 = local_91627cfb から 11-15 夕に交代。頼み = 共有 local_41371db6…/progress/daily-lead24-brief.md、進み = 同 daily-lead24.md、引き継ぎ = 同 daily-lead23-handover.md。記録 = progress/daily-lead24-run.log) | 今: D-56b は 0.1.742 で本番に出た。オーナーが本番で「挑戦済み」になるか見る返事待ち。D-50h は木の大改装と一緒に出す。D-03c はやめた。毎日の見張り (roll / close) は予定のタスク側 |
| 最終チェック長 | local_d6fa4b95-bbd9-4a80-9c64-d4ff36bd115a (20、11-15 夕にブラック 118 が立てた。19 = local_9add0a56 はアーカイブ。記録 = progress/release-next20-run.log) | 今: 0.1.742 (デイリーの挑戦済みの直し D-56b だけ) を出し終えた。本番は 0.1.742 |
| サーバー係 | local_c4fa7cdc-b847-4671-b7fa-bdba82e7556f (5 代目 server-keeper5、11-15 16:46 に 1440 を立て直して持ち主に。4 代目 local_f6d61d7a は 2,5xx 件でアーカイブ) | 開発版 1440 を持つ。ブラックの「1440 を立て直して」で立て直し、結果は ExileDesk/progress/server-keeper.md に 1 行 (返事は送らない、止まった時だけ) |
| 解析君 | — (analyst1 local_819bb9cb は 11-14 0 時台に ui_tally を済ませてアーカイブ。一覧は本番に出て 1 週溜めてから) | 待機 |
| ジン部長 | — (local_e283feed はアーカイブ済み、11-14 0 時台にブラック 104 が見た。作業場 .claude/worktrees/wizardly-gould-f36ecf・引き継ぎ = 共有ノート progress/jin-wash.md・tests-triage-1112.md) | 仕事が来たらブラックが立てる (古いテスト 10 件 → 冒涜のタグ → 外の正解の束の口 → エンジンの決まり 10 個のテストが残り) |
| エンジン部長 | — (10-25 夜に 1 本目を立てたが、オーナーの決め直しでエンジンはジンに戻し閉じた、引き継ぎ emulator/notes/2026-10-25-engine-lead-handover.md) | なし |
| リサーチ長 | — (research-video は 11-05 に動画の手順を渡してアーカイブ) | 仕事が来たらブラックが立てる |
| シミュ部長 | local_a607a4be-69f3-48e7-9227-80dcb38b9e95 (62、Opus 5.5、11-15 にブラック 119 が控えで立て、61 = local_44722f9d が 2,47x 件で交代。引き継ぎ = 共有 local_41371db6…/progress/sim-lead61.md の一番上「61 → 62 の引き継ぎ」。記録 = progress/sim-lead62-run.log、状態 = 共有 progress/sim-lead62.md) | 今: 入った。残り = FmNY7Wwv の開発版の未設定 2 の訳・確かめ帳の ④ はオーナーの相談待ち・goalMetTag の説明文はデザインへ頼み中 |
| デザイン部長 | local_3ed491bd-6a49-406c-8ed0-46ff35f6a2be (10、Opus 5.5、11-15 18 時台にブラック 119 が立てた。9 = local_7572ea36 から交代。頼み = 共有 local_41371db6…/progress/design-lead10-brief.md、進み = 同 design-lead10.md。記録 = progress/design-lead10-run.log) | 今: MOD の表の長い名前を「…」で切る・開いた段の表の列を見出しにそろえる (開発版まで) |
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
