# POE2Tube を ExileDesk に合併するか (開発部長、2026-10-20) → 今は合わせない → 同じ日にオーナーの決定で統合した (video/、メモ video-*)

## 理由 (3 行)
1. 得が小さい: 受け渡しの形 (contracts/ と craft-stage-run.mjs) が変わるのは要望の時だけで、撮影も今止まっている。受け渡しはメモ poe2tube-handoff と video/README.md の決まり 2 (開発部長を通す・両方同時) で足りる。
2. 決まりと記憶が混ざる: POE2Tube は Python の決まり (ruff・mypy strict・pytest 70%・Conventional Commits・1 ファイル 300 行) と自分のメモ 21 件 (~/.claude/projects/C--Users-kyohei-POE2Tube/memory) で動いている。ExileDesk の下に置くと、ExileDesk の CLAUDE.md (60 行まで)・メモ・フックが毎回効き、POE2Tube のメモが読まれなくなる。
3. 置き場が重い・CI が動く: git の分は 22MB (663 ファイル、いちばん大きい物で 360KB) で軽いが、.gitignore の外に cache 30GB・output 29GB があり、ExileDesk のフォルダー (ExileDesk-stage の元) に 59GB が乗る。ExileDesk の tests.yml は main への push で毎回 (paths の絞り無し、windows 40 分) 走るので、動画の commit のたびに CI が回る (paths-ignore が要る)。

## 見た数字
- POE2Tube: .git 22MB、リモート無し、追っているファイル 663 (assets 406・data 116・src 57・scripts 32・tests 22)。cache 30GB・output 29GB は .gitignore 済み。
- 依存: Python (pyproject、uv.lock)。ExileDesk の pnpm・vite・vitest (tests/**/*.test.ts)・tsconfig (src/**) には入らないので、置き場さえ分ければビルドと deploy:web には影響しない。
- ExileDesk の CI: .github/workflows/tests.yml・release.yml (push to main、paths の絞り無し)。

## 合わせ直す時 (撮影を再開して受け渡しの直しが続くようになったら)
- 置き場 ExileDesk/video/、履歴は `git subtree add --prefix=video ../POE2Tube master` (POE2Tube にリモートが無いのでローカルのパスで)。
- ExileDesk/.gitignore に video/output/・video/cache/・video/.venv/・video/assets/characters/ の psd・zip。cache・output はフォルダーの外 (POE2TUBE_* の環境変数) に出す。
- tests.yml・release.yml に `paths-ignore: ['video/**']`。
- POE2Tube のメモを ExileDesk のメモへ移す (名前の頭に video-)、video/CLAUDE.md は残す。元の C:\Users\kyohei\POE2Tube はオーナーの OK まで消さない。
