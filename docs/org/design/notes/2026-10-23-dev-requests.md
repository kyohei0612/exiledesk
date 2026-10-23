# 開発版・手元の dev サーバーから Workers へ出すリクエスト (10-23 夜、デザイン部長 3 本目。オーナー「開発版でリクエストいらなくね、分析とか」)

## 分析の送り — 開発版・手元の dev では送らない
- 送る所は全部 `noLog()` (src/utils/no-log.ts) を通る: log-sender.ts (/log)・track.ts (visit・screen・手の記録)・main.ts (Cloudflare の beacon)。
- 開発版 (VITE_DEV_PREVIEW) は前から送っていなかった。手元の dev サーバー (vite、`import.meta.env.DEV`) は本番の server/live へ送っていた → no-log.ts に DEV を足した。本番の作りは変わらない (出し直し・版上げは要らない)。

## ほかのリクエスト (開発版から)
| 先 | 回数 | 残す? | 理由 |
|---|---|---|---|
| server/live `/boot.json` (相場・配信・訪問者) | 開いた時 1 回 (+ 45 分放置から戻った時) | 残す | 相場がエミュ・シミュの費用に要る。控え (/market-fallback.json) に替えても開発版は門 (dev-gate) を通るので回数は同じ |
| server/live `/feedback/replies` | この端末から要望を送った事がある時だけ、開いた時 1 回 | 残す | 開発版の origin で要望を送った端末だけ (ふだん 0)。返事の窓を確かめるのに要る |
| server/live `/feedback` (POST)・`/forget` | 人が送った時・?nolog を切り替えた時だけ | 残す | 人の操作の時だけ。止めると開発版で要望の窓を確かめられない |
| web-dev `/`・`/assets/…`・`/web/manifest.webmanifest`・`/blog/index.json` | 開いた時・後から読む部品 | 残す | 画面そのもの。門 (鍵) を通すのは分析君の設定 (4caa758e で絵・フォント・音は門の外) |
| web-dev `/?stale=…` (古い塊の読み直し) | 出し直しをまたいだタブだけ | 残す | notes/2026-10-23-stale-reload-requests.md |
| Workers の外 (fonts.googleapis・poecdn の絵・YouTube の絵・AdSense) | — | 対象外 | Workers の枠に数えない |

## 確かめ (台本はブラックの共有メモ nolog-check.mjs・nolog-base.mjs。分析の送り先は CDP の Fetch で止めて 204 を返し、数えるだけ = 本番の記録に入れていない)
- 手元の dev (1440、直した後): エミュ → シミュのタブ → エミュのタブ、ベースのページ (?page=base) で 分析の送り 0。
- 開発版 (2affeeeb、作りは変わらないので出し直していない): エミュ → シミュ → エミュで 分析の送り 0。Workers へは boot.json 1 回 + 門を通る画面の物。
- 本番の作り (手元で vite build → vite preview 1450): /log 1 回と beacon が今まで通り出る (止めて数えた)。ベースのページでも beacon が出る。
- 見ていない: 開発版のベースのページ (台本の開き方が悪く開けず、開発版を余分に叩かないため手元で見た)。
