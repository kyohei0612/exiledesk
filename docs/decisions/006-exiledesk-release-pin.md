# ADR 006: 撮影・実演・名前は「リリースで固定した ExileDesk」から読む

- 状態: 採用 (2026-09-29)
- 決めた人: kyohei (「A やな、リリース版をみよう」)

## 背景

POE2Tube は ExileDesk の作業フォルダ (`~/ExileDesk`) を直接読んでいた。撮影は開発サーバー (Vite 1420)、
実演は `scripts/craft-stage-run.mjs`、名前は `src/` の JSON。リリース版のアプリは見ていなかった。
そのため作業途中の変更が動画に写り、2026-09-29 には開発サーバーの部品の版ずれで動画モードが開かず、
普通の画面のまま動画ができた。

## 決めたこと

- ExileDesk の**リリースの印 (タグ v0.1.*) の時点**を、git worktree で別のフォルダ `~/ExileDesk-stage` に取り出す
- 撮影・実演・名前は全部そちらから読む (`POE2TUBE_EXILEDESK_ROOT` の既定)。撮影の Vite は **1430** で起動し、
  ExileDesk の開発版 (1420) と並べて動かせる
- 新しいリリースを使う時だけ `python scripts/update_exiledesk.py` で最新の印に進め、`CAPTURE_VER` を上げる
- 頼んだ変更をリリース前に試したい時は、`.env` に `POE2TUBE_EXILEDESK_ROOT=C:\Users\kyohei\ExileDesk` と
  `POE2TUBE_EXILEDESK_DEV_URL=http://localhost:1420` を書く (試し終わったら消す)
- 動画モードで開けていない画面は撮らずに止める確認 (`ensure_video_mode`) は残す

## 影響

- 頼んだ変更は ExileDesk がリリースするまで本番の動画に使えない (試すのは開発版に切り替えて)
- 画像パック (`public/base-art` 等) は git に入っているので、固定版にもある
