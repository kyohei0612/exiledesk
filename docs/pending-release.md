# 開発版で OK 待ちの物 (OK が出たらすぐ本番)

2026-10-17 オーナー「残りはシミュレーターの実装だけ一緒に作る。ほかは開発版でチェックしたらすぐ出せるように」。
開発版: `pnpm deploy:web-dev` (URL は ?k= 付き)。OK が出た物を下から changelog-notes.json / -en.json の次の版に写して、`node scripts/bump-version.mjs patch` → `cd src-tauri && cargo check -q` → commit → push → `pnpm deploy:web`。
OK が出ていない物を外して出す時は `git revert --no-edit --no-commit <コミット>` → `pnpm deploy:web` → `git revert --abort`。

| 物 | コミット | 更新内容 (日本語) | 更新内容 (英語) |
|---|---|---|---|
| エッセンスの段をレアリティで絞る (レアはパーフェクトだけ・押したらそのまま持つ) | 62f992d9 | レアにはパーフェクトのエッセンスだけ、ノーマル・マジックにはパーフェクト以外だけを出すように (レアでは段を選ばずにそのまま持てます) | Essences now show only the tiers you can use: Perfect for Rare items (picked directly, no tier menu), non-Perfect for Normal and Magic items |

チュートリアルのコースは合格した物から出す: `StageCourses.vue` の `RELEASED` に id を足す (開発版も本番と同じ表示、手元の dev だけ全部)。
済み: ページの作り (ベース選び・計算機・要望)・アイテムレベルのプルダウン・段の表のタグ (v0.1.573、2026-10-18)。MOD 一覧の「付ける」(v0.1.550)、チュートリアル (基本のオーブ) と一番下の行の記録の案内をプライバシーポリシーへ (v0.1.551)、PWA (アプリ版はこちら・オフライン、v0.1.552)、エッセンスのチュートリアル・お告げで光らせる・錯乱のノータブル (v0.1.553)、発現の魂の井戸の見た目・未発現の緑の文字・MOD の行の並び (v0.1.554、2026-10-17)、冒涜の MOD の行 (トレードの見た目・一番下、v0.1.555)。冒涜のチュートリアルと MOD の行の ↓ を外す・MOD 一覧の枠 (v0.1.557)。POE2Tube への連絡: 目印が `mod-add-n / f / d / e` に変わった (メモ poe2tube-handoff)。
