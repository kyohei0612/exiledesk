# 記事の本文の行間 (オーナー 10-22「行間がキモい」= line-height の話) の測りと直す案

測り方: 開発版と同じ組み立て (scripts/build-blog-pages.mjs) の記事 dont-hoard-misses を、窓なしの Chrome で幅 1280px に開いて getComputedStyle で値を取り、さらに画面を撮って画素で行の間隔を測った。note は公開の記事 (note 公式 https://note.com/info/n/n103aef54553f) を同じ幅で撮って画素で測った (CSS の値は読めないので画素だけ)。比べの絵: 共有メモ blog/line-height-compare-pc.png。

## 今の値と note
| | 字 | 字の大きさ | 行の高さ (line-height) | 段落の間 | 1 行の長さ |
|---|---|---:|---:|---:|---:|
| 今 PC (getComputedStyle) | Zen Kaku Gothic New (Google Fonts) | 18px | 36px (2.0) | 28.8px (1.6em) | 640px (約 35 字) |
| 今 スマホ幅 (768px 未満の CSS) | 同じ | 17px | 33.15px (1.95) | 27.2px | 画面の幅 − 44px |
| 今 PC (画素) | | 字の帯 15px | 36px | 段落をまたぐ間隔 64〜66px | 618px |
| note PC (画素) | 游ゴシック系に見える (確かめていない) | 字の帯 15px (= 約 18px) | 36px | 72px (1 行ぶん空ける) | 600px |

分かった事: **行の高さは note と同じ 36px**。違うのは (1) 字の形: Zen Kaku Gothic New は字と字の間が広く、同じ 36px でも行の間が空いて見える (2) 段落の間が note より 1 割ほど狭い (3) 1 行が少し長い。段落の間 (margin) は前に直した物で、line-height とは別。

## 直す案 (おすすめ A2、入れ物の CSS = ジン部長)
```css
body{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic Medium","YuGothic","Yu Gothic","Meiryo",sans-serif;font-size:18px;line-height:2}
main{max-width:640px}          /* 本文の幅 600px */
main p{margin:0 0 2em}         /* 段落の間 36px = 1 行ぶん */
@media (max-width:767px){body{font-size:16px;line-height:1.9}}
```
- A2 で撮って画素で測ると、行の間隔 36px・段落をまたぐ間隔 71〜73px・1 行 581px で、note (36px・72px・600px) とほぼ同じ。
- 「Yu Gothic UI」を先に置くと Windows でかなが詰まりすぎる (案 A で確かめた) ので入れない。Zen Kaku Gothic New の読み込み (Google Fonts) は記事のページでは要らなくなる。
- もっと詰めたいなら案 B: 行 1.8・段落 1.4em (撮って行の間隔 34px)。
- スマホ幅の値 (16px・1.9) は案。窓なしの Chrome は幅 500px より狭くできず、スマホ幅は撮っていない (開発版をスマホで見て確かめる)。
