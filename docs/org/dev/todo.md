# 組織の台帳 (宛先・触っている・共有の物)

ここは今の状態だけ。終わった記録・前の順番は git の履歴 (10-29 の md の整理で消した): 2026-10-22-todo-archive.md。OK 待ちは docs/pending-release.md の 1 本。

## 常駐の宛先 (SendMessage の to。入れ替えたら直す。立てたブラックが自分で書く)
| 誰 | session id | 今 |
|---|---|---|
| ブラック | local_6c315ff7-9fce-4976-911e-da71d60c8108 (112 代目、Opus 5.5、11-15 11 時台に入れ替え。111 = local_b35318f6 が 2,37x 件で交代。控えは無し) | 司令塔・振り分け・順番 |
| デイリー部長 | local_f0e3bead-1d17-4e00-bb00-16abf89e2fbe (21、Opus 5.5、11-14 夕にブラック 110 が控えで立て、20 = local_ad45c42f が 2,500 件で交代。引き継ぎ = 共有ノート local_429a9cb4…/daily-lead20-handover.md。記録 = progress/daily-lead21-run.log) | 今: 順位の行から開くレシピの直し 03a1760c3 をシミュ部長 46 の push の後に push・スマホの幅の確かめ。11-15 16:15 頃に来週の予定の見張り (plancheck)。毎日の見張り (roll / close) は予定のタスク側 |
| 最終チェック長 | local_bd769d85-da09-44a8-8254-93470617baea (18、11-14 夕にブラック 110 が控えで立て、17 = local_77b05d2b が 2,424 件で交代。記録 = progress/release-next18-run.log) | 次: デイリーのすり抜けの直し 案 1 (ブラックの合図で出す)。本番は 0.1.738 |
| サーバー係 | local_f6d61d7a-84b0-4083-a562-8a70d8ee1a19 (4 代目 server-keeper4、Opus 5.5、11-13 21 時台にブラック 101 が控えに立て、3 代目 local_723fe780 が 2,39x 件で交代。頼み = 共有ノート progress/server-keeper4-brief.md) | 開発版 1440 を持つ。ブラックの「1440 を立て直して」で立て直し、結果は ExileDesk/progress/server-keeper.md に 1 行 (返事は送らない、止まった時だけ) |
| 解析君 | — (analyst1 local_819bb9cb は 11-14 0 時台に ui_tally を済ませてアーカイブ。一覧は本番に出て 1 週溜めてから) | 待機 |
| ジン部長 | — (local_e283feed はアーカイブ済み、11-14 0 時台にブラック 104 が見た。作業場 .claude/worktrees/wizardly-gould-f36ecf・引き継ぎ = 共有ノート progress/jin-wash.md・tests-triage-1112.md) | 仕事が来たらブラックが立てる (古いテスト 10 件 → 冒涜のタグ → 外の正解の束の口 → エンジンの決まり 10 個のテストが残り) |
| エンジン部長 | — (10-25 夜に 1 本目を立てたが、オーナーの決め直しでエンジンはジンに戻し閉じた、引き継ぎ emulator/notes/2026-10-25-engine-lead-handover.md) | なし |
| リサーチ長 | — (research-video は 11-05 に動画の手順を渡してアーカイブ) | 仕事が来たらブラックが立てる |
| シミュ部長 | local_5d1c490e-597f-4923-82dd-b664e9aa9fa9 (50、Opus 5.5、11-15 にブラック 112 が控えで立て、49 = local_36d25c04 が 2,2xx 件で交代。引き継ぎ = 共有ノート local_41371db6…/progress/sim-lead49-handover.md。記録 = progress/sim-lead50-run.log、確かめの表 = 共有 progress/sim-lead50-eleany-check.md。レビュワーは無し = 撮りと数えは部長自身) | 今: いずれかの元素耐性 (S-10h、開発版だけ) の直し A〜D (A はジンの返事待ち)、その後に「☐ 2 個目の MOD も狙う」の窓の見本の絵。待ち = オーナーの確かめ (手順 = 共有 local_41371db6…/progress/owner-check-1115.md)・完成形の設定の一言の返事。止め = フラックスの後の札の直し (オーナー「要相談」) |
| デザイン部長 | local_7572ea36-62ba-458f-8061-62f4eb92e735 (9、Opus 5.5、11-14 16 時台にブラック 109 が控えで立て、8 = local_d5d63228 が 2,415 件・残り無しで交代。引き継ぎ = 共有ノート local_429a9cb4…/design-lead8-handover.md。記録 = progress/design-lead9-run.log) | 今: 待機。要望の統一 (U-05e) と途中の未設定を出さない (U-05f、要望に数を添える) は済み・スイッチ actLog の下、開発版だけ |
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
