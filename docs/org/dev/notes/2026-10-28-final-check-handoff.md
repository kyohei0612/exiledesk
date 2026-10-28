# 最終チェック長の引き継ぎ (10-28 夜、ブラック 14 代目の下の 1 本、de37a6c3)

ブラックが 15 代目に替わるので閉じる。リリースはまだ (オーナー 10-28「一旦リリースもまだでおけ」)。サーバー 1440・1460・1461 と確認用 Chrome は全部止めた。

## 1. 見張り scripts/sim-watch の使い方 (手引きは docs/org/dev/sim-watch.md、決まりの正は docs/spec/release.md)
- 本体 watch.mjs・窓なし Chrome cdp.mjs・木の側の答え doc.mjs・どの木でも成り立つ決まり rules.mjs (A)〜(D)・見本の木 trees.json (10 本: amuB・okPcmPyY・sameShape2・goalQ・fg0BCVYy・infinite・kamasan・bone1a・bone2b・bone3)・基準 baseline.json。
- 回し方: 1460 (本番の作り) は `node scripts/sim-watch/watch.mjs`、1461 (開発版、スイッチの下も) は `--dev`。木 1 本は `--only <key>`。1460 と 1461 を同時に回す時は片方に `WATCH_PORT=9381` (Chrome の口を分ける)。1 回 5〜8 分なので run_in_background で。
- 基準: prod・dev とも f6fe42cb (シミュの整理の前) で取った (3522bd38)。`--update` はわざと動きを変えた時だけ、書いたら commit。
- 基準の中に元から入っている合わない所 (直っていない、シミュ部長に伝え済み): infinite b16「知性が付いた」の見本が「筋力、器用さまたは知性」/ fg0BCVYy b22 消去の直線の箱に外れ MOD でない行 (1461) / bone1a b16・b17・bone3 b3 (1460)。
- 決まり (A) は開発版の `window.__simMonkey.shapeOf / sameShape` (c7507e17) が要るので 1461 だけ。

## 2. 最後の結果 (シミュ 33 の整理の前後比べ、全部シミュ 33 に直接返した。記録は共有の置き場 release-progress-1028.md)
- 84b8e8d7 (1461): 基準と違い 0 (シミュ 33 が言った変更を除く)。アミュ B はテスト走行 ✓ 合格・100 人 完成 99%、fg0BCVYy は ✓ 合格・100 人 完成 100%。決まり (B) 0 件。
- 残っている物 (シミュ 33 が残すと言った物): アミュ B b31・b32 は合格を止めない知らせ (shapeBody) として出る / (A) b31→b27・b32→b22 の形違いはオーナーの決め待ち (sim-tree.md ⑦ の 6)。
- 1460 の 0.3 秒のぶれ: 本番の作りの見本は tree-arrived の 0.3 秒の打ち切りで作るので、1460 と 1461 を同時に回すと機械が重くて見本・決まり (B) がぶれる。37069c37 の okPcmPyY を 1 本ずつ 2 回回して 2 回とも出なかった。1460 で見本の違いや (B) が出たら `--only <木>` で 1 本ずつ回し直す (release.md ⑦・sim-watch.md、15424d6a)。
- 1460 の比べの最後は 37069c37 (基準と同じ)。38973f4a 以降の整理 (eeb40077〜84b8e8d7) は 1461 だけで見た → 出す前に 1460 を出す中身で 1 回回す。

## 3. release.md ⑦ の仮 (docs/spec/release.md、オーナーかブラックの決め待ち)
⑦ に並べた仮 5 つ + 0.3 秒のぶれの 1 つ。中身は release.md ⑦ が正 (ここに写さない)。

## 4. 1461 の立て方 (固定版、オーナーが触る用)
1. 作業場 C:/Users/kyohei/ExileDesk-preview (detached) を出す版にする: `git -C C:/Users/kyohei/ExileDesk-preview fetch -q` → `checkout -q --force <commit>` → `clean -fdq -e node_modules`。
2. `node C:/Users/kyohei/ExileDesk-preview/scripts/preview-prod.mjs --dev` を run_in_background で (1461 = http://dev.exiledesk.localhost:1461/)。1460 は `--dev` なし。同じ作業場なので 1461 を先に作り終えてから 1460。
3. main の HEAD でよいなら `pnpm --dir C:/Users/kyohei/ExileDesk preview:prod -- --dev --head`。
4. 止め方: コマンドラインに `preview-prod.mjs` (1461 だけなら `preview-prod\.mjs.*--dev|--port 1461`) を含む node を taskkill /T で。ポート番号だけで止めない。見張りの残りの Chrome は `--remote-debugging-port=9371` / `9381`。

## 5. 出す時の段取り (まだ出さない)
1. 先に冒涜のモンキー 1 匹 30 手 (PC とスマホ、オーナーの OK の後。monkey/notes/2026-10-28-monkey.md)。
2. 出す中身で 1460 と 1461 を立て、見張りを 1 本ずつ (同時なら WATCH_PORT を分ける) → 基準と比べて違いがシミュ部長の言った物だけか (R-15〜17・R-30〜34)。
3. オーナーが 1461 で触って OK (UI は OK の後、R-02・R-13)。
4. 版上げ → 更新内容の日英 → commit → push → `pnpm deploy:web` (release.md R-01〜R-12)。出した直後の確かめはサーバー管理人。
5. 片付け (R-14): サーバー・確認用 Chrome・スクリーンショット。

## 6. メモの直す所 (ブラックへ渡す一覧、メモは書き換えていない)
release.md の番号を指す形に: feedback-backstage-release → R-07 / feedback-changelog-popup → R-12 / feedback-replies → R-20 / ui-try-before-release → G-08・R-02・R-13 (中の「1440」は古い) / feedback-owner-check-on-fixed-build → R-13 / feedback-full-check-after-sim-features → G-21・R-18 / feedback-web-only-for-now → R-06 / feedback-urgent-means-ship-first → R-03・R-04 / feedback-self-tests → G-22・R-19 / feedback-close-test-pages・feedback-stray-processes → R-14 / feedback-adsense-ship-now → R-05 / feedback-no-autostash → R-08 / CLAUDE.md の版上げの行 → R-06。

## この回の commit
3f7868b2 (冒涜の木・本番の作りの基準・未発現の行) / 3522bd38 (決まり 4 つ・f6fe42cb の基準) / a79d1fb9 (release.md・dev/README) / 4fe05cbd (pathAims に始まりの狙い) / 15424d6a (0.3 秒のぶれ)。
