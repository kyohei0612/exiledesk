# デザイン部長 のやる事

## 今 (10-23)
- for-share はジン部長から受け取った (e7c697ef・9f46ef0b)。地図は README と notes/2026-10-23-components-map.md に書いた。
- ModTable の見立て: エミュ (StageModList)・シミュ (TreeGoalPage) とも今の口で作れている。問いは閉じた (ブラック 8 代目 10-23、オーナー): 「シミュ = % 無し」は % の列ではなく、エミュ専用の「次の手で狙う」ボタン (段の表) がシミュに要らないという事。「狙う」は StageModList の tier-actions の差し込みのまま、土台に入れない。ModTable は今のまま。
- 気になる所 (要望待ち): 列の見出し (出やすさ・段・Lv) に差し込み口が無い。
- 控え (10-23、急がない): エンジンが核 / engine-emu / engine-sim に分かれた (809039db)。for-share は engine-emu・engine-sim を読んでおらず影響なし。ただ engine.ts を通さず核の中 (apply-*・stage-runes・stage-bases・mod-list・htc/patch・mods/mod-rules など 20 本ほど) を直に読む所が残る (前の views/craft-stage の頃のまま)。決まり 1 に合わせて寄せるなら、入口に足すのはジン部長 (ブラック経由)。数え方 `grep -rhoE "from \"[^\"]*services/[^\"]*\"" src/components/for-share src/state/for-share | sort | uniq -c`。

## StageItemCard の D1・D2 (シミュの頼み、オーナー 10-23) — 83e8b3cf で済み
- `fractureGroup?: readonly string[]` (印の modId)。カードに付いている物が 2 つ以上なら、MOD の行の頭に 1 行「フラクチャー MOD ×n」(左は P / S / P·S) にまとめ、まとめた MOD は下の行から外す。ホバー (スマホは押す) で小窓「この中のどれか 1 つが固定される」+ 段と文。小窓の行: 押す = `jump`、右クリック = `fracture`。枠の外・Esc で閉じる。1 つだけの時はまとめない (今の行のまま)。
- `fracturable?: boolean`: × を出さずに MOD の行の右クリックで `emit('fracture', m)`。条件は removable の時と同じ (持っていない・未発現と冒涜は出さない)。
- 確かめ: 型 0。
- 画面の確かめ (10-23、開発版 39f28ba9・窓なし Chrome 9333・本物のマウス 1660×860、台本はブラックの共有メモ d12-check.mjs・d12-emu.mjs): シミュの完成形 = 印 2 つで「P フラクチャー MOD ×2」、ホバーで小窓に 2 行、小窓の行の右クリックで印が外れてまとめが解け、カードの行の右クリックで印が付いて戻る。エミュ = 錬金術の後、行の右クリックでフラクチャー → もう一度で外す、帯・title の文は前のまま、まとめた行は出ない。エラー 0。スマホ (押して小窓) は見ていない。
