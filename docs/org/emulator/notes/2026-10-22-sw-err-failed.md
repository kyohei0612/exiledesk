# service worker を通すと ERR_FAILED の調べ (2026-10-22、ジン部長 5 本目、ブラック 6 代目の頼み)

元: シミュ部長 13 本目の気付き (simulator/todo.md 報告 21 e541dabd)「新しい profile の Chrome で開発版を開くと SW を通した読み込みが ERR_FAILED (SW を外すと 200)」。まだ直さない。

## 確かめた事 (窓なし Chrome 9333、毎回新しい profile、CDP の Network で失敗と fromServiceWorker を記録。台本は消した)
| 場面 | 本番 exiledesk.com | 開発版 web-dev |
|---|---|---|
| 1 回目 (SW 無し) | 200、失敗 0、SW が入る | ?k= → 200、失敗 0、SW が入る |
| 再読み込み 2 回 (SW を通る) | 200、74 本が SW から、失敗 0 | 200、76 本が SW から、失敗 0 |
| ?page=base を開き直す | 200、失敗 0 | 200、失敗 0 |
| SW が入った後に鍵の cookie を消す | — | 入口が 404 を返し、SW はそのまま通す (ERR_FAILED ではない) |

→ ERR_FAILED は再現しなかった。public/sw.js で ERR_FAILED になるのは (a) 画面の通信が投げて (つながらない) 取っておいた物も無い時の `Response.error()`、(b) /assets/ などの cacheFirst で通信が投げた時 (受け皿が無い)。どちらも「通信そのものが失敗した時」だけ。シミュ部長の台本が CDP の Fetch で通信を止めていた・オフラインを真似ていた、などで SW の中の fetch が投げた見込みが高い (台本を見てから決める)。

## 直す案 (ブラックの OK の後、開発版で)
1. (おすすめ) 版が替わった後の古い塊: 開いたままのタブが、次のデプロイで消えた古い JS の塊を後から読むと 404 で画面が壊れる (vite:preloadError の受け皿が無い)。`window.addEventListener("vite:preloadError", …)` で 1 回だけ読み直す。オーナーの「開発版で変わってなさそう」はこちらの見込みの方が高い (開いたままのタブ = 前の版)。
2. sw.js の cacheFirst に受け皿: 通信が投げた時は取っておいた物 → 無ければ fetch のまま (今は respondWith が失敗 = ERR_FAILED)。VERSION を上げて古い SW を入れ替える。
