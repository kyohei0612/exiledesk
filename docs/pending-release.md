# 開発版で OK 待ちの物 (OK が出たらすぐ本番)

2026-10-17 オーナー「残りはシミュレーターの実装だけ一緒に作る。ほかは開発版でチェックしたらすぐ出せるように」。
開発版: `pnpm deploy:web-dev` (URL は ?k= 付き)。OK が出た物を下から changelog-notes.json / -en.json の次の版に写して、`node scripts/bump-version.mjs patch` → `cd src-tauri && cargo check -q` → commit → push → `pnpm deploy:web`。
OK が出ていない物を外して出す時は `git revert --no-edit --no-commit <コミット>` → `pnpm deploy:web` → `git revert --abort`。

| 物 | コミット | 更新内容 (日本語) | 更新内容 (英語) |
|---|---|---|---|
| 開く / たたむを折り返さない・MOD 一覧の列の見出し (エミュレーターにも出る。ほかはシミュレーターだけ) | 1ee2ad43 | (見た目だけ。更新内容は書かない) | (layout only, no changelog entry) |
| スパムシミュレーター (カレンシーの見出しから別ページ・MOD を 1 つ選ぶ → 増強 / カオス / 高貴を 100 人で比べる)。旧カオススパム計算機はそのまま残す (オーナー「挙動残しててもいい」) | (このコミット) | カレンシーの横に「スパムシミュレーター」を足しました。狙う MOD を 1 つ選ぶと、増強・カオス・高貴のスパムでどれが一番安く着くかを比べます | Added “Spam simulator” next to Currency: pick one mod to see whether augment, chaos or exalt spam gets there cheapest |
| ベースの一覧: 名前で探すを外し、装備・エフェクトオフを一番下へ | 0c5d5be9 | ベースの一覧から名前で探す欄を外し、「装備・エフェクトオフ」を一番下に移しました | Removed the name search from the base list and moved “Plain art, no effects” to the bottom |

チュートリアルのコースは合格した物から出す: `StageCourses.vue` の `RELEASED` に id を足す (開発版も本番と同じ表示、手元の dev だけ全部)。
済み: ページの作り (ベース選び・計算機・要望)・アイテムレベルのプルダウン・段の表のタグ (v0.1.573、2026-10-18)。MOD 一覧の「付ける」(v0.1.550)、チュートリアル (基本のオーブ) と一番下の行の記録の案内をプライバシーポリシーへ (v0.1.551)、PWA (アプリ版はこちら・オフライン、v0.1.552)、エッセンスのチュートリアル・お告げで光らせる・錯乱のノータブル (v0.1.553)、発現の魂の井戸の見た目・未発現の緑の文字・MOD の行の並び (v0.1.554、2026-10-17)、冒涜の MOD の行 (トレードの見た目・一番下、v0.1.555)。冒涜のチュートリアルと MOD の行の ↓ を外す・MOD 一覧の枠 (v0.1.557)。POE2Tube への連絡: 目印が `mod-add-n / f / d / e` に変わった (メモ poe2tube-handoff)。
