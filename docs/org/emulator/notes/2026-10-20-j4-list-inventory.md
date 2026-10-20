# J4 1) 貼り付けで「何の行か」を見分ける一覧の棚卸し (ジン部長 2026-10-20)

数は台本 (scratchpad の使い捨て、tests/helpers/patch の loadPatch = アプリと同じ applyExtras) で出した。エンジンのクラスの行 67・MOD 6,105。

| 一覧 | エンジンに | 置き場 | 数 | poe2db との照らし |
|---|---|---|---|---|
| 一般 MOD (normal) | ある | エンジンの行 pools.normal | 3,931 MOD・67 クラス | 済 (audit-poe2db-mods.mjs、写し 10-18) |
| 冒涜専用 MOD | ある | pools.desecrated | 1,082 MOD・66 クラス | 済 (同上。重みは poe2db も非公開) |
| エッセンス専用 MOD (クラフト MOD) | ある | pools.essence (+ perfect_essence) | 593 + 499 MOD・54 クラス | 済 (同上) |
| 異界の MOD (変質した鎖骨) | ある | pools.otherworldly | 3 クラス (装飾品) | 未 |
| 創生の樹など買うしかない MOD | ある | pools.special・htcDropOnly | 52 クラス | 未 |
| ルーンを差して初めて付く MOD | ある | pools.rune | 50 クラス | 済 (audit-poe2db-mods.mjs の RUNE_POOLS) |
| ルーン・ソウルコア・タリスマンの効果 (ソケットの行) | ある | craft-stage/stage-runes.json (RUNES) | ルーン 209・ソウルコア 65・タリスマン 31 | 済 (audit-poe2db-runes.mjs、305 全部同じ) |
| ベースの暗黙 | ある | extra-bases.json の baseInfo.implicits (+ stat は htc/implicit-stats.json) | ベース 1,626、暗黙つき 279 | 済 (audit-poe2db-implicits.mjs、notes/2026-10-20-j4-poe2db-audit.md) |
| 付与スキル | ある | baseInfo.grants | 275 ベース | 済 (暗黙の照らしで数を比べた、食い違い 0) |
| コラプト: ヴァールのエンチャント・強まったコラプトの行 | ある (10-20 J1b) | mods/corruption-mods.json | 53 部位・1,338 行 (ジュエル・グラスピングメイルを足した) | 写した物そのもの |
| コラプト: MOD の値の変化・暗黙の付け替え・二重コラプトの決まり | **無い** | — | — | poe2db の部位のページに表が無い (Vaal Orb のページは「unpredictably」だけ) |
| エンチャント・注油 (アミュレットの「Allocates …」) | **無い** | — | — | 未 |
| ジュエル (8 クラス) | クラスの行はある | Jewels_* | — | 10-20 夜にベースのページを写しに足して照らした (置き場の食い違い 0、コラプトの表にも入った) |
| 全能力値の 4 クラス (Body_Armours_ring_str_dex_int・Helmets/Gloves/Boots_str_dex_int) | クラスの行はある | — | — | グラスピングメイルは足して照らした。兜・手袋・靴 (Grand …) は poe2db に MOD の表が無い |
| フラスコ・チャーム | **クラスの行が無い** | — | — | オーナー決定 (10-20): 足さない。貼り付けは読めない理由 flaskCharmUnsupported |
| ユニークの MOD | エンジンの行には無い (画面用の stage-uniques・i18n/unique-mods-ja) | — | — | 貼り付けでは読まない (クラフトしない) |

## 足す順の案
1. ジュエルのページを poe2db の写しに足す (照らしとコラプトの表の両方に効く。見本 7 のサファイアの枠の件もここで見る)。
2. 全能力値の 4 クラスのページの対応 (写しの名前を決めるだけ)。
3. 注油 (アミュレットのエンチャント) の一覧: poe2db の「Allocates」で付く notable の名前。貼り付けでは `(enchant)` の印の無いトレードの形で暗黙の前に来る。
4. コラプトの値の変化・暗黙の付け替え・二重コラプト: poe2db に表が無いので、公式の説明 / poe2db の Vaal Orb の文に書いてある物だけを決まりにする (推し量らない)。それまでは「不明」の印のまま。
5. フラスコ・チャーム: クラスの行ごと無い。貼り付けで要るならクラスから (クラフトの対象にするかはオーナーの決め)。
