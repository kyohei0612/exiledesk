# 入口を「出した側だけ」に分ける案 (2026-10-22 深夜、ジン部長 6 本目。作るのはブラック・オーナーの OK の後)

元: 組織の変更 (38982ef3)。ジン部長 = エンジンの管理者、画面はエミュ部長・シミュ部長。エンジンに足した物は、要望を出した側の画面だけが使える。

## 今 (数えた台本は消した、git ls-files src の import を owners.txt の持ち主で分けた)
- engine.ts の export 85 行。使っている部ごとの名前の数: シミュだけ 59・エミュだけ 9・解析だけ 8・チュートリアルだけ 1、2 つ以上の部 12。
- シミュだけの 59 のうち、今日シミュの要望で足した物 (B1〜B16・C・aimHits の sameText) が約 40、残りは元からの核 (applyCurrency・room・SIDES・kindOf・loadHtcPatch・parseItemText・mulberry32 …)。
- エミュだけの 9: previewUse・omenBlock・catalystOf・stage-tuning の 4 つ (CATALYSING_PER_PCT など)・OVERRIDDEN・SANCTIFY_MIN / MAX。
- エミュの画面 (src/views/craft-stage・src/state/emulator) は入口を通さず中を直に読む行が 137 行 (34 ファイル)。今の見張りの「入口の外」はシミュ・チュートリアル・解析だけを数えている。

## 案
1. 入口を 3 つに
   - `engine.ts` = 核 (どの画面も読んでよい): 形・打つ・アイテムを読む・置き場 / 重み / 段・1 手の確率 (heldOdds・addHitOdds・stepOutcomes)・名簿・文・乱数。今の engine.ts から下の 2 つへ移す物を抜いた残り。
   - `engine-sim.ts` = シミュの要望で足した物 (シミュ・チュートリアル・解析が読む。チュートリアルはシミュ部長の持ち物、解析は順番の計算をシミュから呼ばれる): tier-rank・aim-odds の aimHits / aimHeldOn / isAimMod / junkOf / heldSetOf・aim-reach・hand-effect・can-use・hand-use・start-with・magic-odds・modListForUse・runesFor・modRawText。中身のファイルは今のまま (名前を並べる所だけ移す)。
   - `engine-emu.ts` = エミュの要望で足した物 (エミュだけが読む): 上の 9 と、これから直に読んでいる物を入口に出す分。
2. 見張り check-engine-entry.mjs
   - A (入口の外) の数える側に「エミュ」を足す。今の 137 行は控え (baseline) に入れて、増えたら落ちる・減ったら取り直す (今の A と同じ形)。
   - 新しく C (よその入口): エミュが engine-sim.ts を読む、シミュ・チュートリアル・解析が engine-emu.ts を読むと数える。今は 0 なので控え 0 から (1 行でも落ちる)。
3. 両方が欲しくなった物: 同じ名前を 2 つの入口に並べない。ブラックが決めて engine.ts (核) へ上げる (上げるのはジン部長、使う側の import の直しは同じ commit で、決まり 7)。
4. 入れ方 (OK の後、3 つの commit): ① engine-sim.ts・engine-emu.ts を作り、engine.ts からは消さずに両方に並べる (使う側は落ちない) → ② シミュ部長・エミュ部長が自分の import を付け替える → ③ ジン部長が engine.ts から移した名前を消し、見張りの C を入れて控えを取る。② が終わるまで ③ をしない (main は 1 本、型チェックが落ちる物を先に出さない)。

## 決めてほしい事
- 解析君の要望 (K4 の occupiedFamiliesOf・ANCIENT_BONE_FLOOR・REVEAL_SPEC など) は核のままでよいか、engine-sim.ts へ入れるか (案: 核のまま。解析は数字の確かめで両方の画面の答えを見るため)。
- エミュの直読み 137 行を入口に出す順番 (案: エミュ部長の要望が来た所から。まとめて先にはやらない)。
