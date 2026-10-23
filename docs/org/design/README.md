# デザイン部長

デザイン面の核の持ち主: エミュの画面とシミュの画面で**一緒の部品の核** (共通管理 for-share。棚・アイテムのカード・MOD 表の土台など、見た目と操作が同じ所) と、ほかの共通の部品・見た目の決まり、両方の画面で同じに動くべき**画面の挙動** (ページの入口・移り方・Esc・枠の外で取り消す・連打の守り・戻る・音・スマホ判定)。10-23 にジン部長から分けた (オーナー「ジンはデータ管理」)。エンジン (結果の核) はジン部長、各画面の違う所はエミュ部長・シミュ部長。

## 決まり (docs/org/dev/README.md の決まりが先)
1. **エンジンには触れない**。部品が見せる中身は入口 `engine.ts` から取る。結果が変わる物はエンジン、見え方と操作は画面 (線引き、オーナー 10-23)。
2. for-share に入れるのはエミュとシミュで**同じ所だけ**。画面ごとの違い (持った時の %・「狙いにする」など) は各画面の特化部品で、核を包む / slot で足せる形に (オーナー 10-23)。
3. for-share を直すのはデザイン部長だけ。エミュ部長・シミュ部長からの直しはブラック経由の要望で受ける。直す時は両方の画面が落ちない・見た目が崩れないことを確かめる。
4. 本番に出るエミュの画面にも効くので、見た目・操作の変更はオーナーの OK の後 (メモ ui-try-before-release)。
5. UI の決まりはメモ MEMORY.md の「UI の決まり」の節。部品・挙動の要望は共通の側へ (メモ feedback-global-requests)。各画面だけの挙動はエミュ・シミュ部長。
6. 用語は src/i18n/GLOSSARY.md、推測で訳さない (メモ feedback-no-guessed-terms)。出す物は英語もセット。
7. 常駐・報告・触るファイル (dev/touching/design.md) は dev の決まり 1・2・8 のとおり。
8. 自分の commit の push と開発版 (deploy:web-dev) は自分で、使う前にブラックに聞く (使用表 dev/todo.md、書くのはブラック)。本番は最終チェック長。
9. 確かめは開発版を本物のマウスで、エミュとシミュの両方の画面で (PC 1660×860・スマホは mobile preset)。報告には何で確かめたか書く。
10. 1 ファイル 500 行まで。AdSense の再審査中は、読み物・AdSense のコード・ads.txt を壊さない。

## 地図
- for-share: src/components/for-share/ (棚一式 shelf/・アイテムのカード item/・MOD 表の土台 mod-list/ModTable.vue (エミュの特化は views/craft-stage/StageModList.vue、シミュは TreeGoalPage の slot)・use-stage-fx、10-23 にジン部長が src/views/craft-stage から移した)・src/state/for-share/ (棚・説明・stage-steps など)。移しの記録 docs/org/emulator/notes/2026-10-22-entry-split-plan.md。ファイルごとの使う画面と ModTable の差し込み口 (props・slot 8 つ) は notes/2026-10-23-components-map.md。カードはエミュ・シミュ・チュートリアル、棚は CraftStage と TreeHandShelf・TreeMemoFloat、sim-links はエミュだけが使う。
- ほかの共通の部品 src/components/ (アプリだけの物は owners.txt のアプリの行で凍結)。部品ごとの使う画面の表は notes/2026-10-23-components-map.md。Web で多く使う物: ui/ (Icon・ModalShell・Disclosure・HelpTip・BusyTag・AdSlot)・decor/ (RichText・GameItemCard・HoverStack)・items/BaseCatalog (エミュ・シミュのベース選び)・NumStep (シミュ)・vaal-scales/CurrencyPicker (エミュ)・ChangelogDialog・SupportDialog・LangSwitch (web 枠)。
- 見た目 src/style.css → src/styles/game-ui.css (@import、全部の画面)、route-rule.css・spam-lucky.css (エミュのスパムシミュ、`<style src>`)、poe-card.css (アプリ)。owners.txt はどちらもデザイン (b27e7213)。言語の切り替え src/i18n/lang.ts、用語集 src/i18n/GLOSSARY.md。i18n のゲームのデータ (名前・MOD の文の JSON) はジン部長の「共通」のまま。
- 画面の挙動 (10-23 にジン部長から): src/web/ (WebApp.vue・page.ts = ページの入口と移り方・boot.ts・main.ts・track.ts・広告の枠・pwa.ts = 古い塊の読み直し)、web.html (ページの入口、頭に入口の塊の読み直し。AdSense のコードは触らない、10-23 にデザインへ)、scripts/deploy-web-dev.mjs (開発版の出し、1 つ前の版の塊を残す。本番の案は notes/2026-10-23-keep-prev-assets.md)、src/composables/ (useKeyboardShortcuts など)、src/utils/ (use-dismiss = 枠の外・Esc で取り消す、swallow-click・use-armed = 連打の守り、keep-place、use-phone、sfx = 音、zoom、ads.ts、format-pct など)。rec-mode.ts は動画との受け渡し (`?rec=1`) なので、変える時は動画編集長と同じ commit で (メモ poe2tube-handoff)。境目なので、型が落ちる変更は commit の前にブラックへ (dev の決まり 7)。
- 見張り scripts/check-engine-entry.mjs (エミュ ⇄ シミュの直の import を落とす D、ジン部長の台本)。
- 決めた事: メモ game-ui-art-direction・ui-one-frame-rule・ui-no-break-rules・feedback-minimal-text-ui・feedback-no-flicker-lines・web-phone-layout。
