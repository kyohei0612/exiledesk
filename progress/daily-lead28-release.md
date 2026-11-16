# デイリーの出しの手順 (大改装の出し、デイリー部長 28、11-16)

出すのはオーナーの「出して」と印 (G-38) の後。ここは手順と順番だけ。決まりの正は設計図 daily.md (D-85b・D-03f・D-14e・D-03d)。

## デイリーで出す / 出さない物

| 物 | 出す? | 何を動かすか |
|---|---|---|
| 今日のお題を #日報・報告 へ (D-85b) | 出す (見た目 OK 11-16「お題の絵おｋ」) | Worker server/live と server/web の deploy。表・秘密・スイッチは足さない (行き先は今の REPORT_WEBHOOK) |
| 確定フラクチャーの費用 = フラクチャーまで全部 ×3 (D-03f、スイッチ `sureFracAll`) | 出す (オーナーの決め「１で」11-15。シミュの木の S-43a と同じスイッチ = シミュ部長と一緒) | `RELEASED` に `sureFracAll` を 1 行 → Web の出し → 過去の提出の数え直し (下の ③)。数え直しはこのスイッチを出す時だけ・1 回だけ |
| クラフト箱の投稿は MOD の数を問わない (D-14e、スイッチ `dailyBoxAnyMods`) | 出す (オーナー 11-16「クラフト箱だふ」) | `RELEASED` に `dailyBoxAnyMods` を 1 行。効く所は 3 つ: 投稿の画面の止め (DailyPost.vue)・16:00 の機械の確かめ (not-full)・箱からお題を選ぶ所 (どちらも `daily-check.ts` の `boxModsOk`)。サーバー server/live は MOD の数を見ない (触らない) |
| 貼り付けでドロップ限定の MOD も取り込む (S-08j、スイッチ `pasteDropOnly`) | 出す (シミュとデイリーの両方、ブラック 124) | `RELEASED` に 1 行。読みは画面と台本で同じ `parseItemText`。デイリーの箱の投稿は画面が読んだ狙いを送るので、サーバーは触らない |

## 16:00 の機械の確かめはどちらのビルドで動くか
- 15:00 の台本 (`daily-roll.mjs`) は **手元の作業の木のファイルを、その時にそのまま esbuild で束ねて** 回す (`scripts/_bundle-ts.mjs`)。束ねる時に `import.meta.env.DEV = false`・`VITE_DEV_PREVIEW = undefined` を当てるので、スイッチは **本番の作りと同じ = `RELEASED` に入っている物だけ開く** (開発版の「全部開く」ではない)。
- 箱の確かめ (D-20、`boxCheck` → `boxModsOk`)・箱からのお題選び・締めの検算 (D-58、確定フラクチャーの費用 `sureFracAll`) は全部この束ねの中。
- **合わせる事: `RELEASED` を当てた作業の木で 15:00 の台本が回ると、Web を出す前でも台本だけ新しい決まりになる。** 今 (11-16 17:00) ブラック 124 の `RELEASED` の足し (dailyBoxAnyMods・sureFracAll・pasteDropOnly ほか) は作業の木にあって commit 前。
  - クラフト箱: 台本が先に開くと、本番の画面では送れない品 (MOD の足りない投稿) は元から箱に無いので害は小さい。ただし前に not-full で落ちた投稿は戻らない (待ちの wait の物だけ見直される)。
  - 確定フラクチャー: 締めの検算 (D-58) は `--verify` の時だけで、予定のタスク (15:00・16:15) は付けていない = 今は検算で順位から外れる事は無い。順位の費用は画面が提出した数のまま。ただし後で `--verify` を付けるなら、`sureFracAll` が台本と本番の画面で揃ってからにする。
  - 安全な並び: ① 15:00 の台本の回の後 (16:30 以降) に Web と Worker を出す → ② その日のうちに数え直し → 次の 15:00 から台本も本番も同じ決まり。
| 指輪・アミュ・ジュエルの品質をお題に (D-03d、日の門 `QUALITY_FROM`) | 出す時に日の門を「出した後に最初に始まるお題の日」に直す (直さなければ来ない日のまま = 出さないのと同じ) | `src/views/daily/daily-quality.ts` の `QUALITY_FROM` を 1 行。Web とサーバー (server/live、検算の品質) が出た後の日にする。15:00 の台本は main から回るので commit すれば次の回から効く |

## 順番

① **Web の出し (R-06・R-08)**: `RELEASED` に `sureFracAll` (と OK があれば `dailyBoxAnyMods`) を入れた main を出す。出した時刻 (JST、分まで) を控える = ③ の `--before`。
   - `QUALITY_FROM` は出す日の次のお題の日 (例: 11-17 に出すなら 16:00 前の出しは "2026-11-17"、16:00 後なら "2026-11-18") にして、同じ出しに入れる。
② **Worker server/live の deploy** (`pnpm -C server/live run deploy`)。足す表 (migrations) は無い (D-85b は KV の印だけ)。続けて **server/web の deploy** (お題の絵の見出し 2726a6769。Web の出しと同じ worker なら ① で一緒に済む = R-08 の手順どおり)。
   - 確かめ: `curl -X POST https://exiledesk-live.exiledesk.workers.dev/daily/topic-ping` が `{"ok":true,"sent":[...]}` (今出ているお題は日の門 11-17 より前なら [] のまま。404 なら Worker が古い)。
③ **過去の提出の費用の数え直し** (D-03f、sureFracAll を出した時だけ):
   ```
   EXILEDESK_RECOUNT_APPLY=1 node scripts/_daily-recount-frac.mjs --apply --before=<① の時刻 YYYY-MM-DDTHH:MM>
   ```
   - 先に `node scripts/_daily-recount-frac.mjs` (読むだけ) で前後の表を見る (progress/daily-lead27-recount-dry.md)。
   - **15:30〜16:30 JST は台本が止める** (締めと重なる)。その時間を避ける。2 回目は印 (docs/org/daily/notes/recount-frac-*.json の applied) で止まる。戻し方は台本の頭のとおり (控えの before を手で)。
   - 回し終えたら控えの json ができているかを見る。
④ **16:00 の台本の上げ**: 台本 (15:00 の exiledesk-daily-next-topic・16:15 の close-day) は手元の main からそのまま回るので、①〜③ の commit が main に入っていれば何もしない。台本を手で回さない (予定のタスクに任せる)。
   - 次の 15:00 の回の後に、#日報・報告 に「本日のクラフトお題」+ 絵が 1 通来れば D-85b は通っている (お題の日が 11-17 以降の物から)。来なければ記録 (`お題の知らせ (D-85b): …` の行) を見る。

## 待ちと注意
- ③ は ① の後・同じ日に。① の前に回すと新しい数えの版でない提出まで数え直す (--before で切るが、時刻は ① の実際の時刻)。
- 15:00 の台本は Worker の出しの前でも口を叩く (404 が記録に 1 行出るだけで止まらない)。
- 本番に書くのは ③ だけ (オーナーの wrangler のログイン)。デイリー部長は「出して」と印の後にブラックから頼まれて回す。
