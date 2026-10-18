# 開発版で OK 待ちの物 (OK が出たらすぐ本番)

2026-10-17 オーナー「残りはシミュレーターの実装だけ一緒に作る。ほかは開発版でチェックしたらすぐ出せるように」。
開発版: `pnpm deploy:web-dev` (URL は ?k= 付き)。OK が出た物を下から changelog-notes.json / -en.json の次の版に写して、`node scripts/bump-version.mjs patch` → `cd src-tauri && cargo check -q` → commit → push → `pnpm deploy:web`。
OK が出ていない物を外して出す時は `git revert --no-edit --no-commit <コミット>` → `pnpm deploy:web` → `git revert --abort`。

| 物 | コミット | 更新内容 (日本語) | 更新内容 (英語) |
|---|---|---|---|
| MOD 一覧の「付ける」をプルダウンに・折り返しを直す | 0497ada8 | MOD 一覧の「付ける」をプルダウンに (そのまま・冒涜・フラクチャー)。付けられない付け方はグレーアウトして、乗せると理由を出します | Mod list: “Add” is now a dropdown (As is / Desecrated / Fracture). Unavailable ones are greyed out and show the reason on hover |
| MOD 一覧の見た目 (段のボタン・段の名前・タグ・推定の札) | c16af4dd | MOD 一覧: 段のボタンはマウスを乗せた段だけに・英語の段の名前を外す・タグは 1 行で切る・「※」を「重みは推定」の札に | Mod list: tier buttons only on the hovered tier, English tier names removed, tags cut to one line, “※” is now an “Est. weight” badge |
| シェアのカードのロゴ | c16af4dd | カオススパム計算機の X シェアのカードのロゴを、サイトと同じ形に | Chaos spam share card: the logo now matches the site |

チュートリアルのコースは合格した物から出す: `StageCourses.vue` の `RELEASED` に id を足す (開発版も本番と同じ表示、手元の dev だけ全部)。
済み: MOD 一覧の「付ける」(v0.1.550)、チュートリアル (基本のオーブ) と一番下の行の記録の案内をプライバシーポリシーへ (v0.1.551)、PWA (アプリ版はこちら・オフライン、v0.1.552)、エッセンスのチュートリアル・お告げで光らせる・錯乱のノータブル (v0.1.553)、発現の魂の井戸の見た目・未発現の緑の文字・MOD の行の並び (v0.1.554、2026-10-17)、冒涜の MOD の行 (トレードの見た目・一番下、v0.1.555)。冒涜のチュートリアルと MOD の行の ↓ を外す・MOD 一覧の枠 (v0.1.557)。POE2Tube への連絡: 目印が `mod-add-n / f / d / e` に変わった (メモ poe2tube-handoff)。
