# デザイン部長 のやる事

## 次の部長へ (4 本目 → 5 本目、10-24 夜)
- 今の状態: 本番は v0.1.596 (main をそのまま出す形)。本番に出していない物は src/web/release-flags.ts のスイッチの下 (使い方 docs/org/dev/notes/2026-10-24-main-release.md)。OK 待ちの一覧と日英の更新内容は docs/pending-release.md。
- スイッチの下にある私の物: sim・daily・dismiss・tierClose・modeTabs・fitZoom・omenRow・monkey1023・baseValues・weights・essTier (段の表のエッセンスの名前)・essCard (カードの P0 / S0 と「エッセンス」「合金」の札)・firstVisit1024 (ベースの一覧の押しの守り・説明はマウスが動いた時だけ、隊長が本物のマウスで確かめ済み 17e0fbf3)。
- 裏方で済み・本番待ち: 古い塊の読み直しを静的な版の印 /version.txt に (cd82fc4a)。次の本番と一緒に出す (ブラック 10 代目 10-24 夜、先に deploy:web しない。pending-release.md の 1 行は最終チェック長の持ち物なのでブラックへ返した)。
- やりかけ: 無し (頼みは全部返した)。public/ui-art/head-l・head-r.webp は残す (ブラック 10 代目 10-24 夜)。
- 他の部へ渡した物: 段ごとの出やすさが全段同じ (兜など) はエンジンの重みのデータ (ジン)。release-flags の外の開発版の判定 (utils/ads.ts の AD_FRAMES・エミュ CraftStage の GEM_CORRUPT_SHOWN・シミュ use-tree.ts:77) を寄せるかはブラック。
- 気を付ける事: 共通 (ジン) の hover-stack.ts は触らず、私の側 (ShelfButton・BaseCardGrid・utils) で直す。窓なし Chrome は画面が動いても mouseenter を出さないので、止まったマウスの確かめは本物のマウス (モンキー隊長) に頼む。
- 気を付ける事 2: 確認用 Chrome は 9333 が他の部長の物 → 自分は 9334 と自分の profile で立て、台本の中で Browser.close。preview:prod は --port で番号を替え、止める時は wrangler と workerd を根から (TaskStop だけでは workerd が残る)。PC の Web はいつもベースのページから (?base= か hands= の録画の口で進める)。
- 台本: 共有メモ side-session-notes/local_52fe22f9-…/design4/ (stale-ver-check・ess-tier-check・ess-card-check・ess-card-sim・hover-check・still-check・move-probe.mjs)、前の分は local_20eeeb19-… の物。4 本目の詳しい記録と 3 → 4 の引き継ぎは notes/2026-10-24-design4-handover.md。

## 済んだ節 (前の版の塊を残す・404 が 3 回・入口の塊の 404・古い塊の読み直し・StageItemCard の D1・D2・エミュ部長の頼み) は notes/2026-10-23-todo-archive.md にそのまま移した。各節の「見ていない」もそこ (10-23 夜 ホワイト)。10-23 夜に 3 本目が fitZoom・先読み・シミュの初手・BasePickBody・ModeTabs・モンキー 4・14・15・モンキー 3・2・9 も移した (OK 待ちは上の引き継ぎに commit で並べてある)

## 10-24 の済んだ節 (アイテムの枠の取り下げ・段の表の行のボタン b6b7fea2・高速のタブ替え 2affeeeb) は notes/2026-10-24-todo-archive.md にそのまま移した

## 本番で隠すスイッチ (オーナー 10-24「今本番に出てるやつそっくり出す」) — 3d616bd1・338c1c25
- src/web/release-flags.ts。使い方・入れた物・確かめは docs/org/dev/notes/2026-10-24-main-release.md の「スイッチの使い方」と「進み」。OK が出たら RELEASED に 1 行。
- 残り: TREE_ON・DAILY_ON・SIM_LOCKED のスイッチ寄せは済み (18e66905、craft-stage.ts・web-page.ts)。見えない裏の直し (履歴・音・?lang=) を隠すかはブラックの判断。

## 開く・畳むの揃え (オーナー 10-23) — 994b95b8・6d535cbd・fb69342b + エミュ 1d6fa62b・シミュ 990f12ad、オーナーの OK 待ち
- 表と確かめは notes/2026-10-23-expand-collapse.md。

## 今 (10-23)
- for-share はジン部長から受け取った (e7c697ef・9f46ef0b)。地図は README と notes/2026-10-23-components-map.md に書いた。
- ModTable の見立て: エミュ (StageModList)・シミュ (TreeGoalPage) とも今の口で作れている。問いは閉じた (ブラック 8 代目 10-23、オーナー): 「シミュ = % 無し」は % の列ではなく、エミュ専用の「次の手で狙う」ボタン (段の表) がシミュに要らないという事。「狙う」は StageModList の tier-actions の差し込みのまま、土台に入れない。ModTable は今のまま。
- 気になる所 (要望待ち): 列の見出し (出やすさ・段・Lv) に差し込み口が無い。
- 控え (10-23、急がない): エンジンが核 / engine-emu / engine-sim に分かれた (809039db)。for-share は engine-emu・engine-sim を読んでおらず影響なし。ただ engine.ts を通さず核の中 (apply-*・stage-runes・stage-bases・mod-list・htc/patch・mods/mod-rules など 20 本ほど) を直に読む所が残る (前の views/craft-stage の頃のまま)。決まり 1 に合わせて寄せるなら、入口に足すのはジン部長 (ブラック経由)。数え方 `grep -rhoE "from \"[^\"]*services/[^\"]*\"" src/components/for-share src/state/for-share | sort | uniq -c`。
