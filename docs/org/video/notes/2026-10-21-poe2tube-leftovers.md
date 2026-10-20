# 古い POE2Tube の引っ越しの残り (2026-10-21、動画編集長)

## 1. 立ち絵の元絵を写した
- `C:\Users\kyohei\POE2Tube\assets\characters\` → `video/assets/characters/` (`cp -rn`、上書きなし)。
- 写した物: めたん 2.1 の PSD 1・zip 1、ずんだもん V3.2 の PSD 3・zip 1 = 6 ファイル、23,081,816 バイト (約 23MB。頼みの「約 33MB」は assets 全体の du 32M と混ざった数)。
- 確かめ: 両側で PSD・zip・readme.txt の sha256 を並べたハッシュが一致 (d699121f…)、数 6・合計バイトも一致。`git status --short video/` は空 (video/.gitignore の `assets/characters/*.zip`・`*/**/*.psd` で外れている、.gitignore の直しは要らなかった)。

## 2. diff -rq (.git・.venv・__pycache__・*_cache・cache・output を除く)
- 古い方にしか無い物: `scripts/app_capture` (空のフォルダー) だけ。
- 中身が違う物: 改行 (CRLF/LF) を無視すると 9 件。全部 video/ 側が新しい (統合の時の直し):
  - `.gitignore` (video/ に `.coverage` を足した)、`README.md`・`CLAUDE.md` (統合の時に書き換え、古い CLAUDE.md の中身は docs/org/video/README.md・notes/guide.md へ。古い文は git 履歴 75f394e9 の subtree に残る)
  - `scripts/thumbs/exiledesk_promo.py`・`scripts/update_exiledesk.py`・`src/poe2tube/config/settings.py` (ExileDesk の場所を `video/` の親から取る直し)
  - `src/poe2tube.egg-info/SOURCES.txt` (作られる物、video/ の方が新しいファイルを含む)
  - `.coverage` (テストの残り、古い方は未 commit の変更)
- 古い方の未 commit: `.coverage` (残り物) と `uv.lock` (未追跡、video/ の uv.lock と同じ中身)。
- 古い方の最後の commit ca08db9 (10-17) は ExileDesk の履歴に入っている (`git merge-base --is-ancestor ca08db9 HEAD`)。
- → 古い方にしか無い直しは 0。

## 3. 古い POE2Tube を消す判断材料 (消すかはオーナー)
- 合計 170MB: .venv 108M・.git 22M・assets 32M (立ち絵、写し済み)・.mypy_cache 6M・残り (data・src・scripts・tests・docs・contracts) 約 3MB。.venv・.git の外のファイル 762 個。
- video/ に無い物: 0 (空の app_capture フォルダーだけ)。.env も同じ中身。
- 消してよい状態。
