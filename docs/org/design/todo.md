# デザイン部長 のやる事

## 引き継ぎ (2 本目 local_d9a6380b-ff4e-49da-99e5-cfc1f662a6d0 → 3 本目、10-23 夜)
- 持ち物 (10-23 に増えた): for-share・共通の部品・見た目・言語の切り替え・画面の挙動 (src/web・composables・utils) に加え、web.html (ページの入口) と scripts/deploy-web-dev.mjs (開発版の出し)。README の地図に書いた。決まりは 10 個 (8 = 両方の画面で同じ操作をして見た目と動きを並べ比べる、10 = 共有の線引き)。
- 今日やった事 (詳しくは下の各節と notes/): 古い塊の読み直し (web.html の __staleReload + pwa.ts、出した直後の Cloudflare の版のずれは揃うのを待って 1 回)・開発版で 1 つ前の版の塊を残す (本番の案は notes/2026-10-23-keep-prev-assets.md)・開く・畳むの揃え (Esc は内側から、use-dismiss の積み)・上のタブの帯 ModeTabs・ベースのページの中身 BasePickBody・シミュの初手の送り・シミュの先読み (prefetch.ts)・fitZoom の揺れ。
- オーナーの OK 待ち (見た目・操作): 3a250a59・60a880d3・ec25866e (1 本目から)、開く・畳むの揃え (994b95b8・6d535cbd・fb69342b)、ModeTabs (ad68e08b)、シミュの初手の送りとスマホの頭 (c01b78e7)。BasePickBody の @quick (7cde43ad) はエミュの @quick="pick('Gold Ring')" とそろった (画面はまだ見ていない)。裏方 (見た目ほぼ同じ): 古い塊の読み直し (12733c99〜2e952b59)・先読み (4f58312f)・fitZoom (a23050a4、バーの無いページで右に約 15px 余る)。本番の判断はブラック。
- 残りの頼み: 無し (全部返した)。急がない控え: エミュの RevealPanel.vue:125 の `disabled:opacity-40` は共通で効くので要らない (誰にも頼んでいない)。ModTable の列の見出しに差し込み口が無い (要望待ち)。for-share が engine.ts を通さず核を直に読む所。本番で 1 つ前の版の塊を残す案 (最終チェック長・サーバー管理人へ)。
- 気づき: 台本の posOf はタイルを真ん中へ送ってから押すので、送りの比べには使わない。隠れたもう 1 つのベース選びがあるので、目印は見えているページの中で探す。エミュがベース未選択で始まるのはタブで初めての時だけ (新しい profile が要る)。待ちは台本の中 (go-wait.mjs)、Chrome は close-chrome.mjs (CDP の Browser.close) で閉じる (PowerShell・sleep の繰り返しは使わない、オーナー「cmd がちらつく」)。python3 は Windows の入口で止まるので使わない。
- 台本はブラックの共有メモ (side-session-notes/local_20eeeb19-…) の stale-*・expand-*・tabs-*・basepick-*・prefetch-check・zoom-flap・cpu-sweep・go-wait・close-chrome.mjs。小物 design-cdp.mjs は local_ec583720-… の方。開発版は `?k=8ZlDQtkU9siTTMXD-qDzj50w` を 1 回開いてから。
- 使用表: 開発版・確認用 Chrome は返してある (空き)。dev/touching/design.md に触っている行は無い。

## 済んだ節 (前の版の塊を残す・404 が 3 回・入口の塊の 404・古い塊の読み直し・StageItemCard の D1・D2・エミュ部長の頼み) は notes/2026-10-23-todo-archive.md にそのまま移した。各節の「見ていない」もそこ (10-23 夜 ホワイト)。10-23 夜に 3 本目が fitZoom・先読み・シミュの初手・BasePickBody・ModeTabs・モンキー 4・14・15・モンキー 3・2・9 も移した (OK 待ちは上の引き継ぎに commit で並べてある)

## エミュ ⇄ シミュの高速のタブ替え (オーナー「死ぬほど重い」10-23 夜) — 2affeeeb、開発版に出した
- 原因: page.ts の「移った直後 0.5 秒のクリックを受けない守り」が、守っている間のクリックで守りを延ばすので、500ms 未満の間で押し続けるとタブの押しが全部捨てられて替わらなかった (直す前: 250ms・400ms の間で 20 回中 10 回だけ効く = 最初の 1 回の後は全部捨て、700ms なら 20 回)。描く重さではない。
- 直し: 上の切り替えタブ (data-mode-tab) の押しは守りの外 (どのページでも同じ位置)。「← 戻る」の 2 回目がブログに当たる守りはそのまま。
- 疑った物 (原因ではない): ページの読み直しは無い (history に積むだけ)。シミュの版が変わった時の白紙 (use-tree.ts) は読み込みの 1 回だけ。先読みは起動の 1 回だけ。シミュは v-if で毎回作り直す (片道 約 50ms、CPU 4 倍遅くして 210〜330ms・長いタスク 160〜250ms)、木はモジュールの中なので状態は残る。
- 確かめ (開発版 2affeeeb・窓なし Chrome・本物のマウス、台本はブラックの共有メモ tab-flip.mjs・tab-rapid.mjs・tab-rapid-phone.mjs・reset-check.mjs・tab-prof.mjs): 150・250・400・700ms の間で 20 回とも効く (PC)、スマホ 375×812 のタップで 250・700ms とも 20 回。見本の木で 10 往復: シミュへ中央値 51ms・エミュへ 44ms・最大 65ms、長いタスク 0、両方の画面の中身は 1 回目と 10 回目で同じ、エラー 0。新しい版を開いた最初の 1 回だけ木が白紙 (前の木はレシピに 1 本)、その後の 10 往復と読み直しでは白紙にならない。
- 見ていない: オーナーの普通の Chrome (広告・拡張あり) での重さ。送りの位置 (スクロール) はページを替えると変わる (帯の位置がずれた)、要望が来たら keep-place で。

## 開く・畳むの揃え (オーナー 10-23) — 994b95b8・6d535cbd・fb69342b + エミュ 1d6fa62b・シミュ 990f12ad、オーナーの OK 待ち
- 表と確かめは notes/2026-10-23-expand-collapse.md。

## 今 (10-23)
- for-share はジン部長から受け取った (e7c697ef・9f46ef0b)。地図は README と notes/2026-10-23-components-map.md に書いた。
- ModTable の見立て: エミュ (StageModList)・シミュ (TreeGoalPage) とも今の口で作れている。問いは閉じた (ブラック 8 代目 10-23、オーナー): 「シミュ = % 無し」は % の列ではなく、エミュ専用の「次の手で狙う」ボタン (段の表) がシミュに要らないという事。「狙う」は StageModList の tier-actions の差し込みのまま、土台に入れない。ModTable は今のまま。
- 気になる所 (要望待ち): 列の見出し (出やすさ・段・Lv) に差し込み口が無い。
- 控え (10-23、急がない): エンジンが核 / engine-emu / engine-sim に分かれた (809039db)。for-share は engine-emu・engine-sim を読んでおらず影響なし。ただ engine.ts を通さず核の中 (apply-*・stage-runes・stage-bases・mod-list・htc/patch・mods/mod-rules など 20 本ほど) を直に読む所が残る (前の views/craft-stage の頃のまま)。決まり 1 に合わせて寄せるなら、入口に足すのはジン部長 (ブラック経由)。数え方 `grep -rhoE "from \"[^\"]*services/[^\"]*\"" src/components/for-share src/state/for-share | sort | uniq -c`。
