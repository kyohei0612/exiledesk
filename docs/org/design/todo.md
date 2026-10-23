# デザイン部長 のやる事

## 引き継ぎ (2 本目 local_d9a6380b-ff4e-49da-99e5-cfc1f662a6d0 → 3 本目、10-23 夜)
- 持ち物 (10-23 に増えた): for-share・共通の部品・見た目・言語の切り替え・画面の挙動 (src/web・composables・utils) に加え、web.html (ページの入口) と scripts/deploy-web-dev.mjs (開発版の出し)。README の地図に書いた。決まりは 10 個 (8 = 両方の画面で同じ操作をして見た目と動きを並べ比べる、10 = 共有の線引き)。
- 今日やった事 (詳しくは下の各節と notes/): 古い塊の読み直し (web.html の __staleReload + pwa.ts、出した直後の Cloudflare の版のずれは揃うのを待って 1 回)・開発版で 1 つ前の版の塊を残す (本番の案は notes/2026-10-23-keep-prev-assets.md)・開く・畳むの揃え (Esc は内側から、use-dismiss の積み)・上のタブの帯 ModeTabs・ベースのページの中身 BasePickBody・シミュの初手の送り・シミュの先読み (prefetch.ts)・fitZoom の揺れ。
- オーナーの OK 待ち (見た目・操作): 3a250a59・60a880d3・ec25866e (1 本目から)、開く・畳むの揃え (994b95b8・6d535cbd・fb69342b)、ModeTabs (ad68e08b)、シミュの初手の送りとスマホの頭 (c01b78e7)。BasePickBody の @quick (7cde43ad) はエミュの @quick="pick('Gold Ring')" とそろった (画面はまだ見ていない)。裏方 (見た目ほぼ同じ): 古い塊の読み直し (12733c99〜2e952b59)・先読み (4f58312f)・fitZoom (a23050a4、バーの無いページで右に約 15px 余る)。本番の判断はブラック。
- 残りの頼み: 無し (全部返した)。急がない控え: エミュの RevealPanel.vue:125 の `disabled:opacity-40` は共通で効くので要らない (誰にも頼んでいない)。ModTable の列の見出しに差し込み口が無い (要望待ち)。for-share が engine.ts を通さず核を直に読む所。本番で 1 つ前の版の塊を残す案 (最終チェック長・分析君へ)。
- 気づき: 台本の posOf はタイルを真ん中へ送ってから押すので、送りの比べには使わない。隠れたもう 1 つのベース選びがあるので、目印は見えているページの中で探す。エミュがベース未選択で始まるのはタブで初めての時だけ (新しい profile が要る)。待ちは台本の中 (go-wait.mjs)、Chrome は close-chrome.mjs (CDP の Browser.close) で閉じる (PowerShell・sleep の繰り返しは使わない、オーナー「cmd がちらつく」)。python3 は Windows の入口で止まるので使わない。
- 台本はブラックの共有メモ (side-session-notes/local_20eeeb19-…) の stale-*・expand-*・tabs-*・basepick-*・prefetch-check・zoom-flap・cpu-sweep・go-wait・close-chrome.mjs。小物 design-cdp.mjs は local_ec583720-… の方。開発版は `?k=8ZlDQtkU9siTTMXD-qDzj50w` を 1 回開いてから。
- 使用表: 開発版・確認用 Chrome は返してある (空き)。dev/touching/design.md に触っている行は無い。

## 済んだ節 (前の版の塊を残す・404 が 3 回・入口の塊の 404・古い塊の読み直し・StageItemCard の D1・D2・エミュ部長の頼み) は notes/2026-10-23-todo-archive.md にそのまま移した。各節の「見ていない」もそこ (10-23 夜 ホワイト)。10-23 夜に 3 本目が fitZoom・先読み・シミュの初手・BasePickBody・ModeTabs・モンキー 4・14・15・モンキー 3・2・9 も移した (OK 待ちは上の引き継ぎに commit で並べてある)

## 開く・畳むの揃え (オーナー 10-23) — 994b95b8・6d535cbd・fb69342b + エミュ 1d6fa62b・シミュ 990f12ad、オーナーの OK 待ち
- 表と確かめは notes/2026-10-23-expand-collapse.md。

## 今 (10-23)
- for-share はジン部長から受け取った (e7c697ef・9f46ef0b)。地図は README と notes/2026-10-23-components-map.md に書いた。
- ModTable の見立て: エミュ (StageModList)・シミュ (TreeGoalPage) とも今の口で作れている。問いは閉じた (ブラック 8 代目 10-23、オーナー): 「シミュ = % 無し」は % の列ではなく、エミュ専用の「次の手で狙う」ボタン (段の表) がシミュに要らないという事。「狙う」は StageModList の tier-actions の差し込みのまま、土台に入れない。ModTable は今のまま。
- 気になる所 (要望待ち): 列の見出し (出やすさ・段・Lv) に差し込み口が無い。
- 控え (10-23、急がない): エンジンが核 / engine-emu / engine-sim に分かれた (809039db)。for-share は engine-emu・engine-sim を読んでおらず影響なし。ただ engine.ts を通さず核の中 (apply-*・stage-runes・stage-bases・mod-list・htc/patch・mods/mod-rules など 20 本ほど) を直に読む所が残る (前の views/craft-stage の頃のまま)。決まり 1 に合わせて寄せるなら、入口に足すのはジン部長 (ブラック経由)。数え方 `grep -rhoE "from \"[^\"]*services/[^\"]*\"" src/components/for-share src/state/for-share | sort | uniq -c`。
