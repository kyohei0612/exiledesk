# 大改装の版で起動時の更新内容の窓を出す (R-12、シミュ部長 71 → 最終チェック長、11-16 夕)

オーナー 11-16「4載せる」= 大改装の版は起動時の更新内容の窓 (ポップアップ) に出す。

## 仕組み (読んだ所)
- `src/data/changelog-popup.json` の `versions` に書いた版だけが、`scripts/build-changelog.mjs` で `src/data/changelog.json` の項目に `pop: true` を付けられる (同 :51)。
- 版上げの台本 (bump-version.mjs :71) が新しい版を渡して build-changelog.mjs を呼ぶ = 版上げの前に versions に入れておけば、版上げ 1 回で窓の印まで入る。
- 窓を出すのは `src/state/changelog.ts` の initChangelog: 前に見た版より新しく、`pop` があり、更新内容が空でない版だけ (最大 5 版)。英語の画面と初めての人には出さない (今までどおり)。
- 文は `src/data/changelog-notes.json` (日) と `changelog-notes-en.json` (英) のその版の行。元は docs/pending-release.md の表の「更新内容」の列 (中の話の行は入れない)。

## 最終チェック長がする事 (版を上げる時)
1. 今回の版の番号を決める (今の本番 0.1.742 の次 = 0.1.743 のはず。決めるのは最終チェック長)。
2. `src/data/changelog-popup.json` の `versions` の最後に `"0.1.743"` (決めた番号) を 1 行足す。
3. `changelog-notes.json`・`changelog-notes-en.json` に同じ番号で、pending-release の表の今回出す行の文を同じ順で入れる (日英の数を揃える)。
4. いつもどおり版上げ → `src/data/changelog.json` の先頭のその版に `"pop": true` が付いているのを見る。付いていなければ `node scripts/build-changelog.mjs <版>` で作り直す (R-12)。
5. 出した後の見方: 本番を前の版を見た保存の残った窓で開く (日本語) → 起動時に更新内容の窓が出る。英語の画面では出ないのが正しい。

## 気を付ける事
- 窓に出るのは「前に見た版から今の版まで」の pop の版。0.1.742 までの細かい版は pop が無いので混ざらない。
- 大改装の行が長い (大改装 ①〜⑤ + 今回足した ジュエル・MOD の表・右クリック・デイリーの物)。窓は版ごとに行を並べるだけなので、文の長さは表のまま。短くするならブラック経由でオーナーへ。
- 出した後に足す時は R-12 のとおり versions に足して build-changelog.mjs で作り直してから deploy。
