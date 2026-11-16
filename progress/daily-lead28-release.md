# デイリーの出しの手順 (大改装の出し、デイリー部長 28、11-16)

出すのはオーナーの「出して」と印 (G-38) の後。ここは手順と順番だけ。決まりの正は設計図 daily.md (D-85b・D-03f・D-14e・D-03d)。

## デイリーで出す / 出さない物

| 物 | 出す? | 何を動かすか |
|---|---|---|
| 今日のお題を #日報・報告 へ (D-85b) | 出す (見た目 OK 11-16「お題の絵おｋ」) | Worker server/live と server/web の deploy。表・秘密・スイッチは足さない (行き先は今の REPORT_WEBHOOK) |
| 確定フラクチャーの費用 = フラクチャーまで全部 ×3 (D-03f、スイッチ `sureFracAll`) | 出す (オーナーの決め「１で」11-15。シミュの木の S-43a と同じスイッチ = シミュ部長と一緒) | `RELEASED` に `sureFracAll` を 1 行 → Web の出し → 過去の提出の数え直し (下の ③)。数え直しはこのスイッチを出す時だけ・1 回だけ |
| クラフト箱の投稿は MOD の数を問わない (D-14e、スイッチ `dailyBoxAnyMods`) | 見た目の OK が出ていれば出す、無ければ閉じたまま (設計図は「出しは見た目の OK と『出して』の後」) | `RELEASED` に `dailyBoxAnyMods` を 1 行。Web と 16:00 の台本 (main から回る) だけ。サーバーは触らない |
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
