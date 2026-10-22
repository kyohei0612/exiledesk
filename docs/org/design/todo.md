# デザイン部長 のやる事

## 今 (10-23)
- for-share はジン部長から受け取った (e7c697ef・9f46ef0b)。地図は README と notes/2026-10-23-components-map.md に書いた。
- ModTable の見立て: エミュ (StageModList)・シミュ (TreeGoalPage) とも今の口で作れている。問いは閉じた (ブラック 8 代目 10-23、オーナー): 「シミュ = % 無し」は % の列ではなく、エミュ専用の「次の手で狙う」ボタン (段の表) がシミュに要らないという事。「狙う」は StageModList の tier-actions の差し込みのまま、土台に入れない。ModTable は今のまま。
- 気になる所 (要望待ち): 列の見出し (出やすさ・段・Lv) に差し込み口が無い。
- 控え (10-23、急がない): エンジンが核 / engine-emu / engine-sim に分かれた (809039db)。for-share は engine-emu・engine-sim を読んでおらず影響なし。ただ engine.ts を通さず核の中 (apply-*・stage-runes・stage-bases・mod-list・htc/patch・mods/mod-rules など 20 本ほど) を直に読む所が残る (前の views/craft-stage の頃のまま)。決まり 1 に合わせて寄せるなら、入口に足すのはジン部長 (ブラック経由)。数え方 `grep -rhoE "from \"[^\"]*services/[^\"]*\"" src/components/for-share src/state/for-share | sort | uniq -c`。
