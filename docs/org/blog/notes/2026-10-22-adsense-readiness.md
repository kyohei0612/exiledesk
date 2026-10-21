# 再申請の前の記事まわりの準備 (記事編集長、2026-10-22)

AdSense のチェック表 (research/notes/2026-10-22-adsense-policy-check.md) の記事・文章の分。記事は 19 本 (日英、全部 draft)。

## 1. 公開日の並び (案、決めるのはオーナー / ブラック)
- 日付をさかのぼって付けない (公開日は本当に出した日。作り話の日付は E-E-A-T と決まり 5 に反する)。
- 案 A (おすすめ): 再申請の前に 12 本を出し、残り 7 本を週 2〜3 本ずつ出して「更新が続いている」形を見せる。再申請は 7 本目あたり (2〜3 週後)。
- 案 B: 19 本を一度に出す。手は軽いが「更新が見えない」(表の #2) が残る。
- 先に出す 12 本 (検索の言葉が別々・中身の芯が強い順): dont-hoard-misses / optimal-move-vs-intuition / sanctify-quality-order / gold-ring-video-decoded / poe2db-cast-speed-weight / es-gloves-greater-exalt / crafting-cost-variance / chaos-spam-odds / desecration-weights / fracture-desecrated / quality-rounding-down / catalysing-exaltation-multiplier
- 後から出す 7 本: mana-ring-craft / kolrs-hunt-gloves (ES 手袋と数字が重なるので間を空ける) / arcane-surge-desecrated-gloves / desecration-bone-sides / desecration-lords-tag-audit / essence-of-the-abyss-mark / crafting-calculator-mistakes
- 決まり (オーナー 10-22): 案 B = 19 本を一度に。出す時は `node docs/org/blog/charts/publish.mjs <その日>` で draft を外して date を揃える (`--dry` で先に見る)。数字を直したら `updated`。

## 2. PoE2 の版
- 手引き 9・11 は「公開日・更新日・PoE2 の版 (patch 0.x)」を頭に出す。版の番号は記録に無い → リサーチ長に今の版の名前と番号を調べてもらう (ブラックへ頼んだ)。入れ物に版の欄 (`patch:`) が要るならジン部長。

## 3. 足した記事の一覧 (再申請の「直した記録」に使う)
| 記事 | 独自の中身 (どこから) |
|---|---|
| 外れは溜めるな | エンジン 300 人ずつ、外れの消し方だけで 400 → 220 神 |
| 期待値は勘と違う | 後ろからの計算 + エンジン 1,000 本 (105 / 94 神) |
| 聖別と品質の順番 | 取引所の実物 + エンジンの順番で +5 が出ない理由 |
| 金の指輪の動画を解く | 字幕の聞き違い 9 個を poe2db の名前に |
| キャストスピードの重み | poe2db 1 / CoE 1,000 を並べ、エンジン 20,000 回 |
| ES 手袋の高貴 | 上級 105・完全 201・通常 423 神 (エンジン 300 人ずつ) |
| クラフトの費用と運 | 平均・中央・90% の分布 (エンジン) |
| カオススパムの確率 | 1 回 0.30〜0.32% と何個かかるか |
| 冒涜 MOD の重み | 指輪 563 回の実測と、全部同じにした理由 |
| フラクチャーの勘違い (直した話) | 24 回打って 0 回で直した |
| 品質の丸めは切り捨て (直した話) | 実物の 33% / 34% で直した |
| 触媒の高貴の倍率 | CoE の式と Reddit の 2 点、倍率を選べるようにした |
| マナの指輪 | 1 個 1,991 神・完成 64% (エンジン) |
| コルの狩りの手袋 | ルーンで MOD が混ざり 1.8 倍 |
| アーケインサージの冒涜 | 知性を含む手袋だけ・候補に出る 7.4% |
| 骨の左右 (直した話) | CoE に合わせて半々に |
| 陣営のタグ (直した話) | 9,455 段を照合、93 MOD を直した |
| アビスの紋章 | 紋章と冒涜の入れ替わり (poe2db の文) |
| 計算の間違い (直した話) | 乱数・最低レベル・印の持ち方の 3 つ |

## 4. 外の人に読んでもらう 3 本 (表の #11)
- dont-hoard-misses (いちばん読み物らしい・図あり) / sanctify-quality-order (謎解き・実物あり) / quality-rounding-down (直した話)。
- 確かめてほしい点: 最初の 3 行で何の記事か分かるか / 数字の出どころが信用できるか / 広告があっても読みやすいか / 分からない言葉はどこか。

## 5. 残り
- コメント欄の決まりの文案 (再申請の後)。ツール画面・ベースのページに文章を足すと決まったら文案。
