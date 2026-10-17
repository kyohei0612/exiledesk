# 開発版で OK 待ちの物 (OK が出たらすぐ本番)

2026-10-17 オーナー「残りはシミュレーターの実装だけ一緒に作る。ほかは開発版でチェックしたらすぐ出せるように」。
開発版: `pnpm deploy:web-dev` (URL は ?k= 付き)。OK が出た物を下から changelog-notes.json / -en.json の次の版に写して、`node scripts/bump-version.mjs patch` → `cd src-tauri && cargo check -q` → commit → push → `pnpm deploy:web`。
OK が出ていない物を外して出す時は `git revert --no-edit --no-commit <コミット>` → `pnpm deploy:web` → `git revert --abort`。

| 物 | コミット | 更新内容 (日本語) | 更新内容 (英語) |
|---|---|---|---|
| PWA (PC は帯の「アプリ版はこちら」でデスクトップに置ける、スマホは「追加」でホーム画面に。オフライン) | 507b4457・アプリ版はこちら (2026-10-17) | 上の帯の「アプリ版はこちら」から、ExileDesk をアプリとしてデスクトップに置けるように (中身はウェブと同じ)。スマホは「追加」でホーム画面に置けます。一度開いた画面はオフラインでも開けます | “Get the app” in the top bar now installs ExileDesk as a desktop app (same as the web version). On phones, “Install” adds it to your home screen. Pages you have opened once also work offline |

チュートリアルのコースは合格した物から出す: `StageCourses.vue` の `RELEASED` に id を足す (開発版も本番と同じ表示、手元の dev だけ全部)。
済み: MOD 一覧の「付ける」(v0.1.550)、チュートリアル (基本のオーブ) と一番下の行の記録の案内をプライバシーポリシーへ (v0.1.551、2026-10-17)。POE2Tube への連絡: 目印が `mod-add-n / f / d / e` に変わった (メモ poe2tube-handoff)。
