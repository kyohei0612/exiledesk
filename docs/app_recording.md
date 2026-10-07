# ExileDesk のアプリを操作して録画する (操作説明用)

kyohei 2026-10-08「アプリで操作感を録画、全部おまかせ」「ブラウザ録画はしない」「この録画モードでの起動は操作説明用にしっかり覚えておこう」。
ExileDesk 要望 ㊲ (v0.1.390 以降)。

## 1. 録画モードで起動する

1. **いつものアプリをタスクキルする** (single-instance なので、トレイに残っていても 2 つ目は前面に出て終わる)
2. 環境変数を付けて起動する:
   - `EXILEDESK_REMOTE_DEBUG_PORT=9333` … その時だけ WebView2 に `--remote-debugging-port=9333` (口は 127.0.0.1 だけ)
   - `EXILEDESK_FULLSCREEN=1` … 枠なしの全画面。1920×1080 のモニターならページもそのまま 1920×1080
3. `http://127.0.0.1:9333/json/version` が返れば OK

```powershell
Get-Process exiledesk -ErrorAction SilentlyContinue | ForEach-Object { $_.CloseMainWindow() | Out-Null }
Start-Sleep -Seconds 3
Get-Process exiledesk -ErrorAction SilentlyContinue | Stop-Process -Force -Confirm:$false
$env:EXILEDESK_REMOTE_DEBUG_PORT = "9333"; $env:EXILEDESK_FULLSCREEN = "1"
Start-Process "$env:LOCALAPPDATA\ExileDesk\exiledesk.exe"   # 開発ビルドなら C:\Users\kyohei\ExileDesk\src-tauri\target\debug\exiledesk.exe
```

- アプリは 1 枚目のモニター (DISPLAY6、0,0、1920×1080) に全画面で出る。**録っている間はそのモニターを触らない**
- ログインの状態は起動ごと (ファイルに残さない)。取引所の機能を撮るならその起動でログインし直す (パスワードは kyohei が入れる)
- **終わったらタスクキル** (kyohei 2026-10-08「終わったらタスクキルなんだよ」。窓を閉じるだけではトレイに残る):
  `taskkill /F /IM exiledesk.exe` (PowerShell なら `Get-Process exiledesk | Stop-Process -Force`)。そのあと環境変数を外して、いつもの起動に戻す

## 2. つないで操作する

- Playwright: `p.chromium.connect_over_cdp("http://127.0.0.1:9333")` → `browser.contexts[0].pages[0]`
- Playwright の操作では OS のカーソルは動かない → **カーソルの絵をページに重ねる** (SVG の矢印、`position: fixed`、`pointer-events: none`、mousemove で動かす、mousedown で波紋)。ページを切り替えたら入れ直す
- 動きは smoothstep で 16ms ごとに少しずつ (一瞬で飛ばさない)
- **操作は地図を見てから**: `docs/app_recording_map.md` (セレクタ・待つ目印・邪魔な物・宣伝の回の手順)。文字だけで掴むと同じ文字が何か所にもある (「金の指輪」はベースのボタン・アイテム枠・MOD 一覧、「黄金の指輪」にも含まれる)。data-* 属性や親子関係で一意に掴む
- 映さない物: 「動画モード」「手順 JSON」「結果 JSON」「相場 JSON」のボタン、アカウント名・取引履歴

## 3. 録画する

```bash
ffmpeg -y -f lavfi -i "ddagrab=output_idx=0:framerate=30:draw_mouse=0" -vf hwdownload,format=bgra -c:v h264_nvenc -preset p4 -cq 23 -pix_fmt yuv420p out.mp4
```

- **ddagrab** (Desktop Duplication、GPU の画面) で 1 枚目のモニターを録る。30fps でコマ落ち無しを確認 (4 秒で 120 コマ)
- 止める時は ffmpeg の標準入力に `q`
- 使わない: gdigrab の `title=ExileDesk` (WebView2 の画面が更新されず古い絵のまま)、gdigrab の `desktop` (3 枚のモニター全部が入る)、Playwright の record_video (コマ落ち)

## 4. スクリプト (宣伝の回 2〜5 章、2026-10-08 試し撮り OK)

```bash
python scripts/record_app.py output/app_rec            # 2〜5 章を章ごとに 1 本ずつ
python scripts/record_app.py output/app_rec ch3 ch4    # 一部だけ (白い金の指輪から始める)
```

- 先に録画モードで起動しておき、終わったらタスクキル (1 章)
- 30fps でコマ落ち無し (2 章 20 秒 / 3 章 34 秒 / 4 章 14 秒 / 5 章 19 秒)
- 録画の間だけページに当てている物 (アプリのファイルは変えない):
  - アプリの「持っているカレンシー」の絵・押した所の波紋・吸い込まれる絵は、拡大 (1920 幅で 1.157 倍) の補正が抜けて右下にずれる → 隠して、持っている絵は自前のカーソルに付ける (ExileDesk に直しを依頼 ㊳)
  - 棚の詳細カード (0.4 秒乗せると出る) は隠す
  - 「動画モード」「JSON」「取引所で検索」のボタンは隠す
- 画面の一番下の「自動巡回中」の帯 (相場の取得) はそのまま写る。気になる時は自動巡回を止めてから録る
