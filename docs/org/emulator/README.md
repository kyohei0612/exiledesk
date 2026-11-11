# ジン部長

フォルダー名は emulator のまま (2026-10-20 に呼び名をエミュ部長 → ジン部長、エミュ部 → エンジン部に)。

エンジンの持ち主 (オーナー 10-25 夜「ジンはMOD変更やカレンシールール変更等の修正でやっと動く だからマジで出番ないはずなんだよ想定」)。エンジン = データ (json)・決まりの紙 engine.md・エンジンのコード。動くのは MOD・カレンシーの決まりの変更とエンジンの不具合の時だけ。画面と部品は持たず、画面への指示・表示の決めもしない (画面の部長がエンジンの関数を取りに来る)。持ち主の線は docs/org/owners.txt (`node scripts/owner-of.mjs <パス>`)、ほかの部の物の頼みは持ち主へ回す。

## 決まり (docs/org/dev/README.md の決まりが先)
エンジンの決まりの正は **`docs/spec/engine.md` (E-xx)**。大本は `docs/spec/README.md` (G-xx)。ここには部の動き方だけを書き、中身は番号で指す。決まりを変えたら同じ commit で engine.md を直す (G-20)。
1. 線引き: 結果が変わる物はエンジン、見え方と操作は画面 (G-06)。ゲームの仕様を足す・直すのはジンだけ (G-40)。
2. 画面はエンジンの関数を入口なしで直に呼ぶ。中身の自作はさせない、無ければジンへ (G-06・E-91・E-92、見張り check-engine-entry)。
3. 元からある物はそのまま呼ぶ: 核の関数の写し・言い換え・包み直しを作らない (オーナー 10-23)。関数の形を変えたら使っている部を報告に書く。
4. 確かめ: E-80・E-81 と engine.md ⑤ の見張り、エンジンを含む commit は golden (G-42)。合格の基準は G-22。
5. 決まりの中身: 出どころ E-01〜04 (正は poe2db、トレードは確かめ)、MOD E-10〜19、カレンシー全般 E-20〜29、オーブ E-30〜39、フラクチャー E-40〜42、エッセンス E-50〜55、骨・冒涜 E-60〜69、品質・ソケットほか E-70〜77、名前 E-90〜93、表示 E-95〜98。新しい物は engine.md ⑥ の手順、仮・未決は ⑦。
6. 画面と部品は直さず、指示も表示の決めもしない。画面の中身の自作を見つけたら部とファイルをブラックへ。
7. 組織の回し方 (常駐しない・報告・push) は G-26b と dev の決まり。触るファイルは dev/touching/emulator.md。
8. エンジンが読んでよい外は i18n/ (名前・ジェムの文)・trade-search の trade2/・本番で隠すスイッチ web/release-flags.ts の `flag` だけ (アプリの craft-v2・trade2/localize を読まない)。
9. owners.txt の部の名前「ジン」は見張りの台本が直に見る。名前を替える時は台本と 1 つの commit で。

## 地図 (ファイルの並びは書かない。フォルダーと入口だけ)
- 他の部への窓口の目録: data-catalog.md (データのファイルと入口の関数ごとに、何に答えるか・呼び方)。入口の関数の表: notes/engine-entry.md。
- エンジンの核 src/services/craft-stage/: 名前の束 engine.ts、打つ処理の形 types.ts・run-plan.ts・contract.ts、打つ中身 spec/ (土台は E-20a = spec/basis.ts・omen-layer.ts・action-class.ts、部品 parts.ts)、入口 apply-currency.ts、確率 held-odds・aim-odds・route-race。境目 (共通) share.ts・trade-search.ts。
- シミュ・エミュだけが使う計算 (置き場は画面の部の下、持ち主はジン): src/services/simulator/sim-engine.ts・sim-engine/、src/services/emulator/emu-engine/。
- MOD・データ: src/vendor/poe2htc (段の重みの式は engine/pool.ts の 1 本)、src/services/htc/ (乱数 rng.ts はどの部も同じ)、src/services/mods/、src/services/items/。
- トレードのデータ (確かめに使う、正は poe2db = E-01。消さない): services/items/tradeable-bases.json、i18n の trade2-*・stat-*、constants/trade2.ts。アプリの trade2 は凍結で触らない。
- 見張り: scripts/check-engine-entry.mjs (何を見るかは台本の頭の B〜F。控え check-engine-entry.baseline.json、減ったら `--head --write`)、scripts/check-golden.mjs、scripts/check-spec-refs.mjs。テスト tests/ (currency-spec-*・held-odds-parity・step-outcomes-all/・omen-layer ほか)。
- 台本 scripts/: データを作る・照らす build-poe2db-*・audit-poe2db*・build-corruption-mods・build-*-weights* は解析の持ち物 (owners.txt)。貼り付けの見本 notes/paste-samples/。
- 画面・部品の地図はここに置かない: エミュ docs/org/emu/README.md、シミュ docs/org/simulator/README.md、部品 docs/org/design/README.md。
- 元の記録: docs/reviews/2026-10-17-rule-checklist.md・2026-10-16-coe-rule-check.md・2026-10-18-tag-audit.md、docs/decisions/001・004。分け方の経過 notes/2026-10-22-entry-split-plan.md。
