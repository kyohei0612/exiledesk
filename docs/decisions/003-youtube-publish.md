# ADR 003: YouTube チャンネル「チョコバナナ」への投稿とチャンネル設定

- 状態: 採用 (2026-09-28)
- 決めた人: kyohei

## 背景

POE2Tube の動画を新チャンネル「チョコバナナ」に上げる。kyohei の要望は
「チャンネル設定も全部書き込んでおいて、新チャンネルに接続したら全部反映できるように」。
ニュース (youtube-pipeline) と同じ Google アカウント配下に作るので、**間違って
ニュースのチャンネルに上げる事故**が一番怖い。

## 決めたこと

1. **設定は全部ファイルに書く** (`data/channel/chocobanana.json`、pydantic `ChannelProfile`)。
   チャンネル説明・キーワード・国・言語・バナー・再生リスト・動画の既定 (カテゴリ・タグ・
   クレジット・公開範囲) をここに集める。変える時はこのファイルだけ直して `apply_channel` を流す。
2. **書き込む前に必ず接続先のチャンネル名を確かめる** (`channels.list(mine)` の title が
   `expected_title` と一致しなければ何もしない)。認証は POE2Tube 専用の refresh token
   (`POE2TUBE_YOUTUBE_REFRESH_TOKEN`) で、ニュースの token とは別。
3. **既定は dry-run** (何をするかを表示するだけ)。`--execute` を付けた時だけ API を叩く。
   動画は既定で **非公開** で上げる (kyohei が見てから公開 / 予約)。
4. OAuth クライアント (client id / secret) はニュースと同じ Google Cloud プロジェクトの物を使う
   (Production 公開済みなので refresh token が 7 日で切れない)。API の 1 日の枠 (10,000) は
   ニュースと共有: 動画 1 本 ≒ 1,700 (upload 1,600 + サムネ 50 + 再生リスト 50)。
5. 動画の説明文は台本から作る (`publish/meta.py`): 要約 + チャプター (build 時に
   `output/work/<name>/chapters.json` を書く) + クレジット (VOICEVOX は必須表記) + 非公式の断り。

## API でできない事 (kyohei が YouTube Studio で手で行う)

- チャンネル名・ハンドル・**アイコン** の変更 (Data API に口が無い)。アイコンは `assets/brand/chocobanana_icon_800.png`
- カスタムサムネイルは **電話番号の確認済みチャンネル** でないと `thumbnails.set` が 403 になる

## 影響

- `src/poe2tube/publish/` (models / youtube / meta)、`scripts/youtube_auth.py` / `apply_channel.py` / `publish_video.py` / `make_banner.py`
- youtube-pipeline 側の quota 記録 (discord-bot の youtube_quota) には POE2Tube の使用分が載らない。
  枠が足りなくなったら共通の記録に寄せる
