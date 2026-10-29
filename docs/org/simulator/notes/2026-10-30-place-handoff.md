# 並び部長 (シミュの ② 並べ方) の引き継ぎ (10-30、ブラック 19 から)

10-30 にシミュの残りを 3 区画に分けた時の ② (tree-place.ts・視点)。決まりは共有メモ lanes-1030.md。② はこれで終わり。

## 今夜の番号と commit
| 番号 | 中身 | 状態 | commit |
|---|---|---|---|
| S-147b | 開いた後に視点を勝手に戻さない。todo E (「少し読み込むとスタートとかに画面だけ飛ばされる」) は本番 v0.1.643 と hmr 無しの dev で戻りが 0 だった = dev の HMR だけ | 有効 | d034243db |
| S-142c | 兄弟の間はその段の箱だけで決め、下の段でぶつかる組だけ押し分ける。横線がほかの親の縦の線を横切る時だけ、2 つの親の間を広げる (todo F) | 有効 (オーナー OK 10-30「f完璧」)。スイッチ **rowNear**、次の出しで RELEASED へ | 75321335d・c60a6ee7f・eb08a1e9f・2dfa723de |
| S-147c | 手を足した後の寄せ・帯の「次へ」は、並べ直しを待ってから箱の下の ＋ と帯「! 未設定」の分まで入れる (① 48 の気付き: ＋ が帯に隠れて押せない) | 作った。スイッチ **nextInView**、本番待ち | eb3fcb08b・2d7e43649・274ad8077 |

- 作り: S-142c は `services/simulator/tree/tree-place.ts` の near。S-147c は `views/simulator/tree/use-tree-flow.ts` の reveal と、箱の数の watch。
- 前 / 後の数と絵: 共有メモ `side-session-notes/local_f0fee26e-…/sim-place-f-before-after.md`・`sim-place-f-{before,after}-*.png`。
- 数えた台本 (scratchpad、消えてよい): near.mjs (重なり・線の上の箱・横線の横切り・横線の長さ)、grow.mjs (新しい木に手を足しては数える)、unset-bar.mjs (＋ の真ん中の要素が ＋ か)、view-jump.mjs (視点の変わりを 20 秒)。

## 残り
- rowNear: kamasan (見張りの木で一番広い) だけ、一番長い横線 6408 → 6924、幅 10122 → 10454 と少し伸びた。オーナーは「f完璧」なので、そのままでよい。
- nextInView: 出す時はオーナーの OK を取ってから。スマホの形 (390×844) には木の枠・箱の下の ＋・帯が無い (PhoneTreePage)。人が下へ送った時の隠れは直していない (人が送れば見える)。
- todo.md の E・F の行はまだ閉じていない (48 も触るため、ブラックに任せた)。
- ⑦ R7 (place.mjs の P2 を S-142b / S-142c の守る事に合わせる) は ③ の見張り。今の P2 は前の S-142 の形を数えている (10-30 に 1473 で 76 件、全部 P2)。
- S-149 (作り) の文に near と nextInView はまだ書いていない。並べ直しの速さ (5〜8ms) も、rowNear の下では測っていない。
