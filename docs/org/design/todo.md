# デザイン部長 のやる事

## 次の部長へ (3 本目 local_1e0c8dab-f968-48a2-b867-04e5816e7dac → 4 本目、10-24)
- 今の状態: v0.1.596 で本番も main の作り。本番に出していない物は src/web/release-flags.ts のスイッチで隠す (本番のビルドで切れ・開発版 / dev で入る、OK が出たら RELEASED に 1 行、CSS は :root[data-flag-…] の下)。使い方と入れた物は docs/org/dev/notes/2026-10-24-main-release.md。
- 私の名前: sim・daily・dismiss・tierClose・modeTabs・fitZoom・omenRow・monkey1023・baseValues・weights・essTier (baseValues・weights は 10-24 4 本目が自前の判定から寄せた b35b5826。エミュ 3 つ・ジン 5 つは各部)。確かめは本番の作りを WEB_OUT で scratchpad に vite build → vite preview (preview:prod は出し先が 1 つで 1 人ずつ、使用表を見る)。
- 10-24 にした事 (詳しくは notes/2026-10-24-todo-archive.md と commit): 段の表を閉じる b6b7fea2・押せない札 178daf1b・タブ替えの守り 2affeeeb・分析を送らない (手元の dev) 00551d1f・スイッチ 3d616bd1・338c1c25・古いコードを消す 37839454 ほか・棚と for-share はアイテムを渡された物で引く 4194c728・8cb0a906。アイテムの枠の A/B 案は取り下げ。
- 待っている返事: ブラック — 見た目に出ない裏の直し (履歴の戻り方・音・?lang=) を隠すか。オーナー判断 — 使われなくなった絵 public/ui-art/head-l・head-r.webp を消すか。
- やりかけ: 無し (頼みは全部返した)。古い塊の読み直しの index.html の取り直しを静的な版の印にする案は notes/2026-10-23-stale-reload-requests.md (明日やる予定だった、ブラックに確かめて)。
- 気を付ける事: 確認用 Chrome 9333 は他の部長も使う → 空いていなければ自分の番号 (9334 など) と自分の profile で、台本の小物は CDP_PORT で番号を替える (scratchpad の cdp.mjs の形)。立てた物は根から止める (preview:prod は wrangler と workerd が残る)。
- 気を付ける事 2: Bash の heredoc・node -e で \ が消える・CRLF のファイルは一致が外れる → 正規表現や置き換えは Write / Edit で。手元の dev の Web は /web.html (/ はアプリ)。
- 台本はブラックの共有メモ (side-session-notes/local_20eeeb19-…) の tab-flip・tab-rapid・tier-probe・nolog-check・card-variants・gtab-disabled・backor-check・reset-check.mjs。

## 済んだ節 (前の版の塊を残す・404 が 3 回・入口の塊の 404・古い塊の読み直し・StageItemCard の D1・D2・エミュ部長の頼み) は notes/2026-10-23-todo-archive.md にそのまま移した。各節の「見ていない」もそこ (10-23 夜 ホワイト)。10-23 夜に 3 本目が fitZoom・先読み・シミュの初手・BasePickBody・ModeTabs・モンキー 4・14・15・モンキー 3・2・9 も移した (OK 待ちは上の引き継ぎに commit で並べてある)

## 10-24 の済んだ節 (アイテムの枠の取り下げ・段の表の行のボタン b6b7fea2・高速のタブ替え 2affeeeb) は notes/2026-10-24-todo-archive.md にそのまま移した

## 本番で隠すスイッチ (オーナー 10-24「今本番に出てるやつそっくり出す」) — 3d616bd1・338c1c25
- src/web/release-flags.ts。使い方・入れた物・確かめは docs/org/dev/notes/2026-10-24-main-release.md の「スイッチの使い方」と「進み」。OK が出たら RELEASED に 1 行。
- 残り: ジン部長に TREE_ON・DAILY_ON・SIM_LOCKED を flag に寄せる頼み (返事待ち)。見えない裏の直し (履歴・音・?lang=) を隠すかはブラックの判断。

## 開く・畳むの揃え (オーナー 10-23) — 994b95b8・6d535cbd・fb69342b + エミュ 1d6fa62b・シミュ 990f12ad、オーナーの OK 待ち
- 表と確かめは notes/2026-10-23-expand-collapse.md。

## 今 (10-23)
- for-share はジン部長から受け取った (e7c697ef・9f46ef0b)。地図は README と notes/2026-10-23-components-map.md に書いた。
- ModTable の見立て: エミュ (StageModList)・シミュ (TreeGoalPage) とも今の口で作れている。問いは閉じた (ブラック 8 代目 10-23、オーナー): 「シミュ = % 無し」は % の列ではなく、エミュ専用の「次の手で狙う」ボタン (段の表) がシミュに要らないという事。「狙う」は StageModList の tier-actions の差し込みのまま、土台に入れない。ModTable は今のまま。
- 気になる所 (要望待ち): 列の見出し (出やすさ・段・Lv) に差し込み口が無い。
- 控え (10-23、急がない): エンジンが核 / engine-emu / engine-sim に分かれた (809039db)。for-share は engine-emu・engine-sim を読んでおらず影響なし。ただ engine.ts を通さず核の中 (apply-*・stage-runes・stage-bases・mod-list・htc/patch・mods/mod-rules など 20 本ほど) を直に読む所が残る (前の views/craft-stage の頃のまま)。決まり 1 に合わせて寄せるなら、入口に足すのはジン部長 (ブラック経由)。数え方 `grep -rhoE "from \"[^\"]*services/[^\"]*\"" src/components/for-share src/state/for-share | sort | uniq -c`。
