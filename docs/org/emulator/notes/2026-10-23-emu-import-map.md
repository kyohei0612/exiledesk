# エミュの画面の直読みの付け替えの対応表 (2026-10-23、ジン部長 6 本目。ブラック 7 代目の頼みの 2)

エンジンの中の仕分けの結果。エミュの画面 (src/views/craft-stage・src/state/emulator) は engine.ts (核) と engine-emu.ts (エミュの要望の物) だけを読む形へ、エミュ部長が下の表で付け替える (直すのはエミュ部長、名前は窓口にもう全部ある)。付け替えたら見張り `node scripts/check-engine-entry.mjs --head --write` で A の控えを取り直す (ジン部長に一言でも可)。

## 仕分け (台本で数えた。台本は消した)
- 名前ごとに「エミュ以外の src のファイル (核・シミュ・共通・アプリ) が使うか」で分けた。使う = 核 (engine.ts)、エミュだけ = engine-emu.ts。
- ファイルごと for-emu へ移したのは 1 つ: route-race.ts から、スパムシミュの 100 人の競争 raceOne・行の形 RaceRow / RaceStats・シェアの包み packRace / unpackRace / SharedRace を for-emu/spam-race.ts へ (打つ処理 routeRun などは spam-counts 経由でシミュ・解析も使うので核のまま)。このファイルを読んでいた 4 か所 (StageRouteLuck・StageRoutesPage・route-place・spam-share-open) と共通の web-page は付け替え済み。
- chaos-spam・route-runes は核から読まれていない (route-race はコメントで名前を出していただけ) ので engine-emu/ へ移した (10-23 809039db、置き場は engine-emu/・engine-sim/ に名前替え)。SpamStats・medianOf・runePrep も engine-emu.ts から。stage-tuning・聖別の上下限・omenBlock は棚と MOD 表が共通 (for-share) になったので核。
- 前の控え 178 行 (A、エミュを足した時) のうち、エミュの直読みは今 27 行 (エミュ部長の 46 個の付け替えと、画面の移しで減った)。

## 対応表 (今の行ごと、10-23 809039db の後に取り直し)
| ファイル | 今の import 先 | engine.ts から | engine-emu.ts から | 窓口に無い |
|---|---|---|---|---|
