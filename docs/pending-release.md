# 開発版で OK 待ちの物 (OK が出たらすぐ本番)

2026-10-17 オーナー「残りはシミュレーターの実装だけ一緒に作る。ほかは開発版でチェックしたらすぐ出せるように」。
開発版: `pnpm deploy:web-dev` (URL は ?k= 付き)。OK が出た物を下から changelog-notes.json / -en.json の次の版に写して、`node scripts/bump-version.mjs patch` → `cd src-tauri && cargo check -q` → commit → push → `pnpm deploy:web`。
OK が出ていない物を外して出す時は `git revert --no-edit --no-commit <コミット>` → `pnpm deploy:web` → `git revert --abort`。

| 物 | コミット | 更新内容 (日本語) | 更新内容 (英語) |
|---|---|---|---|
| 持った時に光らせる (変わる MOD はオレンジの文字、付く空きは緑の枠) | (このコミット) | カレンシーを持つと、打った時に消える・入れ替わる・数値が変わる・固定される候補の MOD をオレンジの文字で、新しい MOD が付く空きを緑の枠で光らせるように (偉大なる高貴なら最大 4 枠) | Holding a currency now highlights the mods it may remove, replace, reroll or fracture (orange text) and the open slots a new mod can roll into (green; up to 4 with Greater Exaltation) |

チュートリアルのコースは合格した物から出す: `StageCourses.vue` の `RELEASED` に id を足す (開発版も本番と同じ表示、手元の dev だけ全部)。
済み: MOD 一覧の「付ける」(v0.1.550)、チュートリアル (基本のオーブ) と一番下の行の記録の案内をプライバシーポリシーへ (v0.1.551)、PWA (アプリ版はこちら・ホーム画面に追加・オフライン、v0.1.552、2026-10-17)。POE2Tube への連絡: 目印が `mod-add-n / f / d / e` に変わった (メモ poe2tube-handoff)。
