# poe2db の取り直しと照らし直し (2026-10-24、ジン部長 8 本目)

ブラック 9 代目の頼み (オーナー 10-24 OK)。今のリーグの poe2db を取り直し、エンジンのデータと照らす。直しはまだしない。

## 取り方
- 台本は前と同じ `scripts/audit-poe2db.mjs`。前の控えを消さないよう引数を足した (`--cache`・`--wait`・`--us`・`--out`、照らしの `audit-poe2db-mods.mjs`・`audit-poe2db-implicits.mjs` にも `--cache`・`--cache-us`・`--out`)。
- 日本語 56 ページ → `data-cache/poe2db-pages-2026-10-24/`、英語 56 ページ → `data-cache/poe2db-pages-us-2026-10-24/`。1 ページずつ 3 秒おき。取りの記録 `data-cache/poe2db-refresh-2026-10-24.log`。
- 全能力値の兜・手袋・靴 (Grand Visage・Manchettes・Cuisses) は前と同じく MOD の表 (ModsView) が無い。
- 前の控え (`data-cache/poe2db-pages` 10-18・10-20、`poe2db-pages-us` 10-20) はそのまま。

## 結果
- **poe2db の MOD の表は 10-18 から変わっていない**: 新旧 53 ページの ModsView (名前・必要レベル・重み・文・側) が全部同じ。
- 段の照らし (`data-cache/poe2db-mod-audit-2026-10-24.json`): 前の控えで回し直した物 (`…-old-2026-10-24.json`) と全部の数が同じで、10-22 の照らし (`poe2db-mod-audit.json`) とも同じ。新しく出た差は 0。
- 暗黙の照らし (`data-cache/poe2db-implicit-audit-2026-10-24.json`): poe2db のベース 1,516 がすべて一致 (新旧同じ)。
- タリスマンの物理の追加は新しいページでも 9 段 (トレードの P6 とは合わないまま、poe2db 自体が 9 段)。

## 今ある差 (どれも前から、理由は notes/2026-10-20-j4-poe2db-audit.md)
| 置き場 | 件数 | 中身 |
|---|---|---|
| normal.missing | 79 | グラスピングメイル (poe2db は鎧の一般 MOD、エンジンは指輪の MOD。メモ grasping-mail-ring-mods) |
| normal.extra | 10 | クロスボウ |
| normal.weight | 1,249 | ジュエルの重み (8 クラスで 50〜160)・全能力値の鎧 203・グラスピングメイル 328 ほか、部位ごとに 2〜6 |
| essence.missing | 56 | グラスピングメイル 52・全能力値の鎧とタリスマンの アビスのエッセンス 2 ずつ |
| desecrated.missing | 4 | グラスピングメイル |
| soul (ルーンの MOD) | 無い 21・多い 19・重み 147 | グラスピングメイル・鎧 |
| destruction・chronomancy・marksman・decay・berserking | 重み 90〜180 | poe2db は 1 (非公開)、エンジンは CoE 由来の重み |

値の幅の違いは 0。
