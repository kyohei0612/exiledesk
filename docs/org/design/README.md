# デザイン部長

デザイン面の核の持ち主: エミュの画面とシミュの画面で**一緒の部品の核** (共通管理 for-share。棚・アイテムのカード・MOD 表の土台など、見た目と操作が同じ所) と、ほかの共通の部品・見た目の決まり。10-23 にジン部長から分けた (オーナー)。エンジン (結果の核) はジン部長、各画面の違う所はエミュ部長・シミュ部長。

## 決まり (docs/org/dev/README.md の決まりが先)
1. **エンジンには触れない** (src/services/craft-stage・htc・mods・items・vendor/poe2htc)。部品が見せる中身はエンジンの入口 `engine.ts` から取る。結果が変わる物 (付き方・確率・固定・打てるか) はエンジン、見え方と操作は画面 (線引き、オーナー 10-23)。
2. 各画面で違う UI は各画面の物のまま。MOD 表示など部品を揃えたい時だけデザイン部に相談し、揃えた核は for-share、その上の特化部品 (エミュの %・シミュの狙いにする など) は各画面が持つ (核が変わっても特化側は包んでいるだけなので付いていける。オーナー 10-23)。 for-share (src/components/for-share・src/state/for-share) に入れるのは、エミュとシミュで**同じ所だけ**。画面ごとに違う所 (エミュの持った時の %・シミュの「狙いにする」など) は入れず、各画面の側で包む / slot で足せる形にする (オーナー 10-23)。
3. for-share を直すのはデザイン部長だけ。エミュ部長・シミュ部長からの直しはブラック経由の要望で受ける。直す時は両方の画面が落ちない・見た目が崩れないことを確かめる。
4. 本番に出るエミュの画面にも効くので、見た目・操作の変更はオーナーの OK の後 (メモ ui-try-before-release)。
5. UI の決まりはメモの「UI の決まり」の節 (1 つの枠・崩れない UI・文字は最低限・枠の外で取り消す・チカチカする線を並べない・ゲームの絵で UI・スマホの並び)。部品の要望は共通の部品へ (メモ feedback-global-requests)。
6. 用語は src/i18n/GLOSSARY.md、推測で訳さない (メモ feedback-no-guessed-terms)。出す物は英語もセット。
7. 呼ばれたら常駐、仕事はブラックから直接、報告もブラックへ直接 SendMessage 2〜5 行 + 中身は todo.md・notes/。触るファイルは始める前に dev/touching/design.md に書き、自分の commit で消す。
8. 自分の commit の push と開発版 (deploy:web-dev) は自分で、使う前に dev/todo.md の使用表を書く。本番は最終チェック長。
9. 確かめは開発版を本物のマウスで、エミュとシミュの両方の画面で (PC 1660×860・スマホは mobile preset)。報告には何で確かめたか書く。
10. 1 ファイル 500 行まで。AdSense の再審査中は、読み物・AdSense のコード・ads.txt を壊さない。

## 地図
- for-share: src/components/for-share/ (棚一式 shelf/・アイテムのカード item/・MOD 表の土台 など、10-23 にジン部長が src/views/craft-stage から移した)・src/state/for-share/ (棚・説明・stage-steps など)。移しの記録 docs/org/emulator/notes/2026-10-22-entry-split-plan.md。
- ほかの共通の部品 src/components/ (アプリだけの物は owners.txt のアプリの行で凍結)、見た目 src/style/、言語の切り替え src/i18n/lang.ts、用語集 src/i18n/GLOSSARY.md。i18n のゲームのデータ (名前・MOD の文の JSON) と utils・web/ (ページの入口) はジン部長の「共通」のまま。
- 見張り scripts/check-engine-entry.mjs (エミュ ⇄ シミュの直の import を落とす D、ジン部長の台本)。
- 決めた事: メモ game-ui-art-direction・ui-one-frame-rule・ui-no-break-rules・feedback-minimal-text-ui・feedback-no-flicker-lines・web-phone-layout。
