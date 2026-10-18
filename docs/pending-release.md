# 開発版で OK 待ちの物 (OK が出たらすぐ本番)

2026-10-17 オーナー「残りはシミュレーターの実装だけ一緒に作る。ほかは開発版でチェックしたらすぐ出せるように」。
開発版: `pnpm deploy:web-dev` (URL は ?k= 付き)。OK が出た物を下から changelog-notes.json / -en.json の次の版に写して、`node scripts/bump-version.mjs patch` → `cd src-tauri && cargo check -q` → commit → push → `pnpm deploy:web`。
OK が出ていない物を外して出す時は `git revert --no-edit --no-commit <コミット>` → `pnpm deploy:web` → `git revert --abort`。

| 物 | コミット | 更新内容 (日本語) | 更新内容 (英語) |
|---|---|---|---|
| 冒涜で普通の MOD・お告げを外さない | 64aa0348 | MOD 一覧の「付ける」で、普通の MOD も冒涜で付けられるように・お告げは打っても掛けたままに (切り替えのチェックは無くしました。外す時はもう一度押す) | Mod list “Add”: normal mods can now be added as Desecrated. Omens now stay on after you craft (the toggle is gone; click an omen again to remove it) |
| UI 点検 5〜8 | 440e7781 | 品質の帯を 1 行に揃える・カレンシーの名前を切りの良い所で折る・チュートリアルの「β」を外す・MOD 一覧のタブをほかのタブと同じ見た目に | Quality bar fits on one line, currency names wrap at natural points, “β” removed from Tutorial, mod list tabs match the other tabs |

チュートリアルのコースは合格した物から出す: `StageCourses.vue` の `RELEASED` に id を足す (開発版も本番と同じ表示、手元の dev だけ全部)。
済み: MOD 一覧の「付ける」(v0.1.550)、チュートリアル (基本のオーブ) と一番下の行の記録の案内をプライバシーポリシーへ (v0.1.551)、PWA (アプリ版はこちら・オフライン、v0.1.552)、エッセンスのチュートリアル・お告げで光らせる・錯乱のノータブル (v0.1.553)、発現の魂の井戸の見た目・未発現の緑の文字・MOD の行の並び (v0.1.554、2026-10-17)、冒涜の MOD の行 (トレードの見た目・一番下、v0.1.555)。冒涜のチュートリアルと MOD の行の ↓ を外す・MOD 一覧の枠 (v0.1.557)。POE2Tube への連絡: 目印が `mod-add-n / f / d / e` に変わった (メモ poe2tube-handoff)。
