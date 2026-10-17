# 開発版で OK 待ちの物 (OK が出たらすぐ本番)

2026-10-17 オーナー「残りはシミュレーターの実装だけ一緒に作る。ほかは開発版でチェックしたらすぐ出せるように」。
開発版: `pnpm deploy:web-dev` (URL は ?k= 付き)。OK が出た物を下から changelog-notes.json / -en.json の次の版に写して、`node scripts/bump-version.mjs patch` → `cd src-tauri && cargo check -q` → commit → push → `pnpm deploy:web`。
OK が出ていない物を外して出す時は `git revert --no-edit --no-commit <コミット>` → `pnpm deploy:web` → `git revert --abort`。

| 物 | コミット | 更新内容 (日本語) | 更新内容 (英語) |
|---|---|---|---|
| PWA (ホーム画面に追加・オフライン) | 507b4457 | 上の帯に「ホーム画面に追加」を付けました (iPhone は手順を出します)。一度開いた画面はオフラインでも開けます | Added "Add to home screen" to the top bar (iPhone shows the steps). Pages you have opened once also work offline |
| MOD 一覧の「付ける」で付け方を選ぶ | d5378d21 | MOD 一覧の「付ける」を押すと、付け方 (普通 / フラクチャー / 冒涜 / エッセンス) を選べるように。もうフラクチャー・冒涜がある時はその付け方を出しません | In the mod list, "Add" now lets you choose how to add (Normal / Fracture / Desecrated / Essence). Options already used on the item are hidden |
| チュートリアル (動作を学ぶコース 6 本 + 実践 5 本) | 5765aed5 ほか | チュートリアルを公開しました: 基本のオーブ・エッセンス・冒涜・お告げ・カタリストと品質・液化した感情を、1 つずつ打って覚えるコース | Tutorials are live: courses that teach basic orbs, essences, desecration, omens, catalysts and quality, and liquid emotions one step at a time |

チュートリアルを出す時は `src/state/craft-stage.ts` の `TUTORIAL_LOCKED` を `false` にするだけ (シミュレーターは SIM_LOCKED で閉じたまま)。
POE2Tube への連絡: MOD 一覧の目印が `mod-add-n / f / d / e` に変わる (メモ poe2tube-handoff)。
