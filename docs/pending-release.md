# 開発版で OK 待ちの物 (OK が出たらすぐ本番)

2026-10-17 オーナー「残りはシミュレーターの実装だけ一緒に作る。ほかは開発版でチェックしたらすぐ出せるように」。
開発版: `pnpm deploy:web-dev` (URL は ?k= 付き)。OK が出た物を下から changelog-notes.json / -en.json の次の版に写して、`node scripts/bump-version.mjs patch` → `cd src-tauri && cargo check -q` → commit → push → `pnpm deploy:web`。
OK が出ていない物を外して出す時は `git revert --no-edit --no-commit <コミット>` → `pnpm deploy:web` → `git revert --abort`。

| 物 | コミット | 更新内容 (日本語) | 更新内容 (英語) |
|---|---|---|---|
| 発現をゲームの魂の井戸の見た目に・未発現の行を緑の崩れた文字に | (このコミット) | 冒涜の発現をゲームの魂の井戸の見た目に (候補を選んで「発現」、引き直しは右下の矢印)。アイテムの未発現の冒涜 MOD は緑の崩れた文字で出すように | Revealing now looks like the in-game Well of Souls (pick an option, then Reveal; reroll with the arrow at the bottom right). Unrevealed Desecrated mods on the item show as green scrambled text |

チュートリアルのコースは合格した物から出す: `StageCourses.vue` の `RELEASED` に id を足す (開発版も本番と同じ表示、手元の dev だけ全部)。
済み: MOD 一覧の「付ける」(v0.1.550)、チュートリアル (基本のオーブ) と一番下の行の記録の案内をプライバシーポリシーへ (v0.1.551)、PWA (アプリ版はこちら・オフライン、v0.1.552)、エッセンスのチュートリアル・お告げで光らせる・錯乱のノータブル (v0.1.553、2026-10-17)。POE2Tube への連絡: 目印が `mod-add-n / f / d / e` に変わった (メモ poe2tube-handoff)。
