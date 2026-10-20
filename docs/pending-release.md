# 開発版で OK 待ちの物 (OK が出たらすぐ本番)

2026-10-17 オーナー「残りはシミュレーターの実装だけ一緒に作る。ほかは開発版でチェックしたらすぐ出せるように」。
開発版: `pnpm deploy:web-dev` (URL は ?k= 付き)。OK が出た物を下から changelog-notes.json / -en.json の次の版に写して、`node scripts/bump-version.mjs patch` → `cd src-tauri && cargo check -q` → commit → push → `pnpm deploy:web`。
OK が出ていない物を外して出す時は `git revert --no-edit --no-commit <コミット>` → `pnpm deploy:web` → `git revert --abort`。

| 物 | コミット | 更新内容 (日本語) | 更新内容 (英語) |
|---|---|---|---|
| シミュレーター ① の「貼り付け」(オーナー 10-20 の形。① のベースの一覧に「貼り付け」のタイル、押すと下に枠、読んだ結果を並べて「これで始める」で ① のベースと ② の狙いを一度に。② の「貼り付けで写す」は外して一本化。要望 91832821 の ②。シミュレーターは開発版だけなので本番はシミュレーターを出す時に一緒。返事は本番の後にブラックが置く。読みは【仮】、ジン部長の入口が来たら差し替え) | 1a0d6e53・63aafd86・(この commit) | シミュレーター: ベースを選ぶ画面の「貼り付け」に取引所・poe.ninja のアイテムを貼ると、ベースと狙う MOD を一度に決めて始められるように (読めない行は理由を表示) | Simulator: “Paste” on the base screen — paste an item from trade or poe.ninja to set the base and the target mods at once (lines that can't be read are listed with the reason) |
| クラフト手順の段 (使い方・コツの段 5) と「不在のアミュレットで全スペル +5」(要望 93d00e7c。出す時は course-release.ts の REVIEW から RELEASED へ移す。返事は本番の後にブラックが置く) | 04ad4147・d1e7c664 | 使い方・コツ: 「クラフト手順」を追加。完成品までを 1 手ずつ作るコースで、最初は不在のアミュレットで全スペル +5 (品質 40% + 聖別) | Guide & Tips: new “Crafting guides” section — build a finished item step by step, starting with +5 to all Spell Skills on an Absent Amulet (40% quality + Sanctify) |
| シミュレーター ④ の「おすすめの順番を出す」(順番だけ自動。計算は解析君の solveOrder、シミュレーターは開発版だけなので本番はシミュレーターを出す時に一緒) | 83fb3fbe・276bda26 | シミュレーター: ④ 付ける順番に「おすすめの順番を出す」。各場面で一番安い手を打った時の費用の目安で上位 3 つと今の順番を並べ、押した順にできる | Simulator: “Suggest an order” in step 4 — ranks the top 3 orders and yours by the estimated cost when the cheapest move is played at every point, and lets you apply one |
| クラフト台の聖別の帯 (聖別した後に倍率 ×0.78〜1.22・最小・最大を手で決める。オーナー 10-20 の案、エミュ部長) | e61bb9ab | クラフト台: 聖別したアイテムの数値を手で決められるように (カードの上の聖別の帯で倍率・最小・最大) | Craft stage: set the values of a Sanctified item by hand (multiplier / Min / Max on the Sanctified bar above the card) |

チュートリアルのコースは合格した物から出す: `StageCourses.vue` の `RELEASED` に id を足す (開発版も本番と同じ表示、手元の dev だけ全部)。
済み: 開く/たたむ・列の見出し・棚のエッセンスの札・ベースの一覧・値段の欄の単位 (v0.1.588、2026-10-21)。済み: MOD 一覧のタブの言い方 一般 / 冒涜専用 (v0.1.586、2026-10-21)。済み: MOD 一覧のタグを色付きの札に・折り返して全部 (v0.1.585、2026-10-19)。済み: 段の表を開いたら全体が見える所まで送る (v0.1.584、2026-10-19)。初めて来た時の一言と「金の指輪ですぐ試す」(v0.1.583、2026-10-19)。読み込みを速く (最初の画面・後から読む、v0.1.582、2026-10-19)。スマホのスパムシミュレーター (送り・下の帯・何位、v0.1.581、2026-10-19)。スパムシミュレーター (旧カオススパム計算機をまとめた・運試し・ルーン・シェア、v0.1.578、2026-10-19。最初の画面の並べ替えは版を上げずに同じ日に本番へ)。ページの作り (ベース選び・計算機・要望)・アイテムレベルのプルダウン・段の表のタグ (v0.1.573、2026-10-18)。MOD 一覧の「付ける」(v0.1.550)、チュートリアル (基本のオーブ) と一番下の行の記録の案内をプライバシーポリシーへ (v0.1.551)、PWA (アプリ版はこちら・オフライン、v0.1.552)、エッセンスのチュートリアル・お告げで光らせる・錯乱のノータブル (v0.1.553)、発現の魂の井戸の見た目・未発現の緑の文字・MOD の行の並び (v0.1.554、2026-10-17)、冒涜の MOD の行 (トレードの見た目・一番下、v0.1.555)。冒涜のチュートリアルと MOD の行の ↓ を外す・MOD 一覧の枠 (v0.1.557)。POE2Tube への連絡: 目印が `mod-add-n / f / d / e` に変わった (メモ poe2tube-handoff)。
