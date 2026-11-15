# 組織の台帳 (宛先・触っている・共有の物)

ここは今の状態だけ。終わった記録・前の順番は git の履歴 (10-29 の md の整理で消した): 2026-10-22-todo-archive.md。OK 待ちは docs/pending-release.md の 1 本。

## 常駐の宛先 (SendMessage の to。入れ替えたら直す。立てたブラックが自分で書く)
| 誰 | session id | 今 |
|---|---|---|
| ブラック | local_b04e70b4-d28f-4bdd-9ceb-8fe2e92f7ad3 (120 代目、Opus 5.5、11-15 19 時ごろ入れ替え。119 = local_819477c9 が 2,39x 件で交代。控えは無し、進み = 共有 local_41371db6…/progress/black120.md・引き継ぎ = black119.md の一番上) | 司令塔・振り分け・順番 |
| デイリー部長 | local_da35e386-6176-4cdc-96f2-c991eb5c4d32 (26、Opus 5.5、ブラック 120 が 11-15 夜に控えで立て、22 時台に 25 = local_937d85b3 から交代。頼み = 共有 local_41371db6…/progress/daily-lead26-brief.md、進み = 同 daily-lead26.md、引き継ぎ = 同 daily-lead25.md の一番上。記録 = progress/daily-lead26-run.log) | 今: 品質のお題 D-03d (開発版まで) の絵の撮り直しと、画面の 100 人回しと 16:00 の検算の数のずれの訳 (開発版まで)。D-56b は 0.1.742 で本番。D-50h は木の大改装と一緒に出す。毎日の見張り (roll / close) は予定のタスク側 |
| 最終チェック長 | local_d6fa4b95-bbd9-4a80-9c64-d4ff36bd115a (20、11-15 夕にブラック 118 が立てた。19 = local_9add0a56 はアーカイブ。記録 = progress/release-next20-run.log) | 今: 0.1.742 (デイリーの挑戦済みの直し D-56b だけ) を出し終えた。本番は 0.1.742 |
| サーバー係 | local_c4fa7cdc-b847-4671-b7fa-bdba82e7556f (5 代目 server-keeper5、11-15 16:46 に 1440 を立て直して持ち主に。4 代目 local_f6d61d7a は 2,5xx 件でアーカイブ) | 開発版 1440 を持つ。ブラックの「1440 を立て直して」で立て直し、結果は ExileDesk/progress/server-keeper.md に 1 行 (返事は送らない、止まった時だけ) |
| 解析君 | — (analyst1 local_819bb9cb は 11-14 0 時台に ui_tally を済ませてアーカイブ。一覧は本番に出て 1 週溜めてから) | 待機 |
| ジン部長 | local_047c4bca-0c2b-487f-933c-4b4c9f49a119 (jin-cast、11-15 夜にブラック 119 が立てた。頼み = 共有 local_41371db6…/progress/jin-cast-brief.md、記録 = progress/jin-cast-run.log。前の local_e283feed はアーカイブ、引き継ぎ = 共有ノート progress/jin-wash.md・tests-triage-1112.md) | 今: 首飾りのキャストスピードの重み 800 → 1000 (開発版まで)。残り = 古いテスト 10 件 → 冒涜のタグ → 外の正解の束の口 → エンジンの決まり 10 個のテスト |
| エンジン部長 | — (10-25 夜に 1 本目を立てたが、オーナーの決め直しでエンジンはジンに戻し閉じた、引き継ぎ emulator/notes/2026-10-25-engine-lead-handover.md) | なし |
| リサーチ長 | — (research-video は 11-05 に動画の手順を渡してアーカイブ) | 仕事が来たらブラックが立てる |
| シミュ部長 | local_ead16579-b573-4fbc-873b-f1ab36ba2486 (63、Opus 5.5、11-15 夜にブラック 120 が立てた。62 = local_a607a4be は 2,5xx 件で止まりアーカイブ。頼み = 共有 local_41371db6…/progress/sim-lead63-brief.md、引き継ぎ = 同 sim-lead62.md の一番上。記録 = progress/sim-lead63-run.log) | 今: 完成形の「いずれかの元素耐性」の「付ける ▾」(1/2/3 つ) が重い件の測り (一瞬だけかも)、付け方 (フラクチャー) を選べる形の調べ。大改装はオーナーの「出して」待ち |
| デザイン部長 | local_3ed491bd-6a49-406c-8ed0-46ff35f6a2be (10、Opus 5.5、11-15 18 時台にブラック 119 が立てた。9 = local_7572ea36 から交代。頼み = 共有 local_41371db6…/progress/design-lead10-brief.md、進み = 同 design-lead10.md。記録 = progress/design-lead10-run.log) | 今: 済み (32aa5a12f・e59eb1ee2) → 11-15 夜にブラック 120 がアーカイブ。仕事が来たら立てる |
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
