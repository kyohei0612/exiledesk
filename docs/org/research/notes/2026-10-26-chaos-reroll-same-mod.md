# カオスで消した MOD が同じ 1 回でまた付くか (2026-10-26、リサーチ長)

## 結論
**付く (CoE の扱い)。** 確からしさ: 中〜高 (CoE の実装で確定、GGG の公式の言及は見つからず)。
- CoE (PoE2) のシミュレーターは「先に 1 つ消す → 消した後の品物を元に候補を組んで 1 つ付ける」。付ける時の除外の一覧は空 (`"|"`)。消した MOD もその系統 (mod group) も候補に戻り、同じ MOD・同じ段がまた付きうる。
- 今のエンジンの扱い (消した直後の付け直しの候補から外さない) と同じ。**エンジンの直しは要らない。**
- オーナーの内訳 99.25 / 0.50 / 0.25 はこの扱いの結果で、矛盾しない。

## 出どころごとの言い分
| 出どころ | 言い分 | URL |
|---|---|---|
| Craft of Exile (PoE2) のシミュレーター (公開ページが読み込む `packages/package.js`) | `case 'chaos'` (poe2): `craftDetail.rem = poec_simRemoveAffix(...)` で品物の MOD の列から 1 つ抜いた後、`poec_simRollAffix(..., blocklist "|", ..., minLevel)` で付ける。RollAffix は今の品物 (抜いた後) の MOD の数・系統で候補を組むので、消した MOD は除かれない。ホイットリング・シニストラル/デクストラル消去は「消す側」だけに効く | https://www.craftofexile.com/?game=poe2 |
| CoE の変更履歴 | 2026-09-17「(POE2) Fixed chaos orb behavior preventing success if no modifier could be added」。消す/付けるの順の話はあるが、消した MOD の除外の話は無い | https://beta.craftofexile.com/changelog |
| poe2db (英語) | 文は "Removes a random modifier and augments a Rare item with a new random modifier"。除外の記述は無い | https://poe2db.tw/us/Chaos_Orb |
| maxroll・fextralife・各種ガイド (poe2fun・u4n・crafting codex など) | 「1 つ消して 1 つ付ける」だけ。除外の記述は無い | https://maxroll.gg/poe2/resources/path-of-exile-2-crafting-overview ・ https://pathofexile2.wiki.fextralife.com/Chaos_Orb |
| poe2wiki.net | Anubis で読めず (Access Denied) | https://www.poe2wiki.net/wiki/Chaos_Orb |
| GGG 公式 (パッチノート・フォーラム) | 検索では言及を見つけられず。フォーラムは冒涜 MOD がカオスで消えた報告 (別の話) だけ | https://www.pathofexile.com/forum/view-thread/3981445 |
| Reddit | 検索の道具も窓なし Chrome も弾かれて読めず (ログインはしない決まり) | — |
| PoE1 | カオスは全部振り直しで、同じ論点が無い (PoE1 の maxroll は「付いている MOD の系統は同じ系統の追加を止める」だけ) | https://maxroll.gg/poe/resources/crafting-resources |

## 確からしさと残り
- 確率の正は CoE (メモ feedback-verify-with-poe2db) なので、ExileDesk の決まりとしては「付く」で決着してよい。
- ゲームそのものの裏 (GGG の言及・大量の実測) は無い。出てきたら蒸し返しではなく追記として扱う。

## どの部に何が効くか
| 部 | 効く事 |
|---|---|
| ジン (エンジン) | 直し無し。今の扱いが CoE と同じ |
| ブラック | メモ poe2-craft-rules-confirmed の未決着を「付く (CoE と同じ)」に書き換え済み |
