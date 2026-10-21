# 配信者・配信の中身に触れる記事の洗い出し (オーナー 10-22「配信者の話は無視、出すとまずい」)

34 本の日本語版を「配信・動画・字幕」で探し、1 本ずつ読んで分けた。A と B は docs/org/blog/charts/publish.mjs の HELD に入れて、出す対象から外した (`--include-held` で入れる)。消すかどうかはオーナー。

## A. 元が配信・動画そのもの (出さない案)
| 記事 | 何が元か |
|---|---|
| crafting-questions-from-streams | 配信で読み上げられたコメント・質問が題材 |
| ai-crafting-odds-vs-feel | 配信者の AI の確率と配信者の実感 (字幕) が題材 |
| gold-ring-video-decoded | 金の指輪の動画の手順と字幕の聞き違いが題材 |
| essence-of-the-abyss-mark | 動画の金の指輪の手順 (動画 ID も出どころに) と、それを見ていた時の話が入口 |

## B. 題材の手袋・話の入口が配信の物 (書き直せば出せる見込み。決めてほしい)
| 記事 | 配信に触れる所 | 書き直すなら |
|---|---|---|
| poe2db-cast-speed-weight | 入口が「配信での一言」、まとめ・本文にも配信の「実感 1/5」、動画の「カオス約 500 回」 | 入口を「poe2db の重みを読んだら 1 だった」に、配信の言葉の節を外す |
| optimal-move-vs-intuition | 題材が「ある配信で作られていた知性の手袋」、表と説明文の「動画に近い打ち方」 | 「ある知性の手袋」「人の勘に近い打ち方」に言い換え |
| chaos-reroll-vs-restart | 題材が「ある配信で作られていた知性の手袋」 | 同上 |
| crafting-order-cost | 題材が「ある配信で作られていた手袋」 | 同上 |
| are-omens-worth-it | 題材が「配信で作られていた知性の手袋」 | 同上 |
| chaos-spam-odds | 題材が「ある配信の手袋」、節「動画の『約 200 個』」と注意の箱 | 言い換え + 動画の節を外す |
| crafting-calculator-mistakes | 「ある動画の手袋」 | 言い換え |
| crafting-cost-variance | 表の 1 行「ある配信の手袋」 | 「ある知性の手袋」に言い換え |

## C. リンク・一文だけ (その所を消せば出せる。今は止めていない)
| 記事 | 所 |
|---|---|
| custom-mod-weights | 本文 31 行目「配信の『1/5』を重み 200 と読む人もいる」の一文 |
| quality-rounding-down | 87 行目の [金の指輪の動画の手順…] へのリンクの一文 |
| fracture-desecrated | 関連する記事に gold-ring-video-decoded |
| sanctify-quality-order | 品質の最大値の説明から gold-ring-video-decoded へのリンク (配信の話ではない) |
| greater-perfect-orb-difference | 動画に触れる一文は試作で外した (df24d177) |
- ほかの記事の「関連する記事」に A の記事へのリンクがある物は、A を出さないならリンクも外す (出す前に `grep -l "gold-ring-video-decoded\|crafting-questions-from-streams\|ai-crafting-odds-vs-feel\|essence-of-the-abyss-mark" src/data/blog/*.md`)。
