# 火力チェック (+ クラフトステージ ㉔) バグ点検 — 2026-10-02

## 修正の状況 (2026-10-02 午後、同日に修正済み・未コミット)
点検の後、下の 1〜5 章の項目は **1-12 (継続・ミニオンの敵の混在のうちミニオン側) と 3 章の「PoE1 コード…メインスレッド」以外は全部直した**。構造は次の 1 本に寄せた (同じ所を見る物は 1 箇所、後から足しても二重にならない):
- **pck.lua**: 変える関数は全部 `PCK.mutate` (pcall・buildFlag・`{ok,error}`)、数字を読む前は `PCK.recalc` (本家 OnFrame = wipeGlobalCache → BuildOutput)、CALCS の選びは `alignCalcsToMain` で MAIN にそろえる、1 発は手ごとの `handNumbers` を本家 combineStat と同じに合成、継続は `dotNumbers` で割り戻し。装備は `putInSlot` / `dropAdded` / `settleSlots` (フラスコの active・足した物の削除・本家 PopulateSlots) を equip / unequip / restore が共用
- **api.ts**: `evalLua` が `{ok:false}` を throw に変える (呼ぶ側の catch は 1 つ)、`luaNum` / `luaStr` で Lua に渡す値を 1 箇所で検査、`CharacterWindowResponse` 型
- **usePobCheck.ts**: PoB を変える操作は全部 `act()` (busy・error・履歴・「変えた所」・計算し直し)。スキルの鍵は欄 + 名前 (組の番号に依存しない)。`PasteNote` (貼った後の注意) を 1 つの型に
- **slots.ts**: 欄の日本語は 1 箇所。**item-text.ts**: ベースは `src/data/pob-item-bases.json` (PoB の itemBases だけ、`scripts/build-pob-item-bases.mjs`)、カタリストは htc/quality.ts の表を再利用
- **craft-stage**: 数値差し替えは `text-nums.ts` (apply-vaal と stage-core が共用、雛形から作り直す `retext`)、部位の上位語は `essence-parts.ts`、撮影カードの props は `cardCommon`
- **Rust**: pob_* は `command(async)` + `request()` 1 本 (120 秒タイムアウト・worker 死亡時 1 回再起動)、`check_pob2_xml` を 3 箇所で共用
- 確かめ: `pnpm test` 117 件、`vue-tsc` 0 件、`cargo check` 通過、ヘッドレス PoB (examples/pob_eval + オーナーの XML) で summary / 両手武器 → オフハンドが外れて戻る / フラスコの欄の規則と active / ジェムの丸め / コラプトの印 / 足した物が残らない を確認。**アプリ本体 (開発ビルド、CDP) で `scripts/pob-check-live/run.mjs` を流した (2026-10-02 15:50)**: オーナーのキャラ + タイの人のビルド (Stormweaver Lv97、オーナーが貼ったコード) + poe.ninja の 7 ビルドで、本家の左の数字 (MAIN の TotalDPS) と行の pobDps が一致、取引所の武器 (両手スタッフ) と手袋を日本語 / 英語で貼って同じ結果、両手武器でオフハンドが外れて「元に戻す」で両方戻る、足したアイテムが PoB に残らない (個数が元に戻る)、ジェム Lv 99 → 40。**ツリーのクリック位置・fit・画面の見た目はオーナーの試し待ち** (開発ビルドは起動したまま)
- 残り (オーナーの確認が要る物): ゲーム内コピーのルーンの塊の位置・「スキルを付与」「品質 (アタックモッド)」の実表記、Light Radius 5% がカタリストで伸びるか (データでは値)、キャラ一覧 (get-account-name → get-items) が PoE2 で動くか

---

読み取り専用の点検。コードは変えていない。Fable モデル 4 本 (装備の文面 / 火力・防御の本家トレース / 読み込み経路と Rust / UI とクラフトステージ) の結果を 1 つにまとめた。
本家 = vendor/PathOfBuilding-PoE2 (v0.23.1)。ローカル確認: `pnpm test` 96 件通過、`vue-tsc --noEmit` 0 件、`cargo check` 通過。

---

## 1. 計算が本家 PoB と変わる (最優先)

### 1-1. DPS を CALCS モード (calcsOutput) から読んでいる。本家の左サイドバーは MAIN モード
- `src/services/pob-check/pck.lua:125-130`。EffMult を取るために CALCS を読んでいる。
- CALCS は `calcsInput.misc_buffMode` (Unbuffed / Buffed / In Combat / Effective) に従う (`CalcSetup.lua:640-660`)。PoB で保存したビルドの計算タブの設定が XML から復元される (`CalcsTab.lua:195-233`) ので、オーナーが計算タブを Unbuffed 等にしていると全スキルがその設定で出る。本家サイドバーは常に Effective。
- **スタットセット**: CALCS は `statSetCalcs`、MAIN は `statSet` (`CalcActiveSkill.lua:166-169, 430-431`)。サイドバーのプルダウンは `statSet` しか書かない (`Build.lua:375-382`)。PoE2 はスタットセットが複数あるジェムが多い → 作者がセット 2 を選んだビルドはセット 1 で計算される。
- 同じく `skillStageCountCalcs` (`CalcActiveSkill.lua:868`)。
- 確かめ方: 読み込み後に `return tostring(build.calcsTab.input.misc_buffMode)` と `mainOutput.TotalDPS` / `calcsOutput.TotalDPS` を並べる eval。
- 方向: `misc_buffMode = "EFFECTIVE"` に固定し `statSet` / `skillStageCount` を MAIN 側からコピーしてから BuildOutput、または DPS 本体は mainOutput、EffMult だけ calcsOutput。

### 1-2. GlobalCache を消さずに `calcs:BuildOutput()` を直接呼んでいる
- `pck.lua:76, 125, 147`。各 setXxx は `buildFlag = true` を立てるだけで OnFrame を回さない。本家は buildFlag → `wipeGlobalCache()` → BuildOutput (`Build.lua:1320-1327`)。読み込み直後だけは `lua_calls.rs:11-13` の OnFrame で正しい。
- `CalcPerform.lua:27-31 getCachedOutputValue` はキャッシュがあれば再計算しない。キーはスキル名_スロット_ジェム位置_組番号 (`Common.lua:828-851`) でレベル・品質・装備・ツリーを含まない → 変更後も Blight / Penance Brand / Earthquake の段数、ミニオンの CalcTriggers、コスト警告が前の状態のまま。summary のループで全スキルの Env がキャッシュに溜まり続ける。
- 確かめ方: `wipeGlobalCache(); return PCK.summary()` と `return PCK.summary()` を比べる。

### 1-3. 「うち継続」= CombinedDPS − TotalDPS に、継続でない物が入る
- `pck.lua:41`、`SkillTable.vue:69`。本家の CombinedDPS = TotalDPS + 状態異常/DoT **+ ImpaleDPS + MirageDPS**、最後に **× bestCull × ReservationDpsMultiplier** (`CalcOffence.lua:6137-6342`)。カリング・予約倍率・インペイル・ミラージュが全部「継続」に出る。hitDps は EffMult で割り戻しているがカリング分は割り戻さず、物差しが混在。

### 1-4. 二刀流 (bothWeaponAttack) の 1 発・クリ率・速さ・命中がメインハンドだけ
- `pck.lua:22, 38, 47-49`。本家 `combineStat` (`CalcOffence.lua:2464-2550`) は二刀流で CritChance = 合成、AverageDamage/TotalDPS = 和 (÷2)、Speed = 調和平均、HitChance = 平均。`ratio = hit/hitPost` も MH の EffMult だけ。
- 二刀流でなければ `MainHand or OffHand` で一致 (問題なし)。

### 1-5. ジェムのコラプトで `corrupted` フラグを書かない
- `pck.lua:246` は `corruptLevel` だけ。本家 `SkillsTab.lua:1069-1070` は `corrupted` も一緒に書く。`CalcActiveSkill.lua:770` の「コラプトしたジェム」条件に乗る MOD があるビルドで数字が変わる。共有コードにも `corrupted="false"` で出る。

### 1-6. 装備の文面: 塊の中の行が 1 つも辞書に当たらないと、塊ごと黙って落ちる (unread にも出ない)
- `src/services/pob-check/item-text.ts:237` `if (rows.some((r) => r.en))`。フレーバーを捨てるための作りだが本物の MOD も巻き込む。塊の数が減るので「最後の塊 = 明示」(:243) により**暗黙が明示に化ける**。
- 一番大きい被害: **セプターの「スキル付与: …」(Grants Skill)** が辞書に無く (stat_descriptions 由来、`grep スキル付与|付与スキル` 0 件)、落ちる。本家はこの行で `item.grantedSkills` (`Item.lua:2211-2222`) を作りミニオンのスキル組の元にする → **ミニオンの DPS が丸ごと消える**。`linesToJa` (:108) が逆方向だけ "Grants Skill:" を扱っていて非対称。
- 詳細コピー (Ctrl+Alt+C) の `{ 固有モッド }` + `+20(10-30)%` も 2 行とも落ちる。

### 1-7. 品質の種類 (カタリスト) が落ちて、ただの Quality になる
- `item-text.ts:212` `/^品質.*?[:：]\s*\+?(\d+)%/` が「品質 (攻撃モッド): +20%」も `Quality: 20` にする。本家は `Quality (Attack Modifiers): +20%` を `catalyst` / `catalystQuality` にして該当タグの MOD 値を伸ばす (`Item.lua:558-564, 878`)。日本語変換では**装飾品のカタリスト分が計算から消える**。
- ラベルの日本語は `src/services/htc/quality.ts:167 catalystTagFromLabel` が既に持っている。

### 1-8. 両手武器を「武器」に貼っても、オフハンド (盾・フォーカス) が外れず両方計算に入る
- `pck.lua:197-198` は `AddItem` → `SetSelItemId` だけ。本家 UI は装備後に `ItemsTab:PopulateSlots()` → `IsItemValidForSlot` で Weapon 2 を 0 にする (`ItemsTab.lua:1542-1546, 2353-2357`)。ヘッドレスではこれが走らず、`CalcSetup.lua:894-911` はジュエル以外の欄で有効性を見ない → 盾の防御・耐性・MOD と弓が同時に乗る。逆 (両手が入っている所に盾を Weapon 2 へ) も通る。

### 1-9. フラスコ・チャームを空の欄に貼っても `active` が立たず、効果が計算に入らない
- `CalcSetup.lua:1096-1110` は `slot.active` の時だけ env に入れる。`pck.lua:190-208` は触らない。ライフフラスコを Flask 2 に入れる等の欄の規則 (`ItemsTab.lua:2313-2316`) も飛ばしている。

### 1-10. 負号が落ちる辞書の組 (1 組だけ)
- `item-text.ts:42` NUM は `[+-]?` だが、日本語型にリテラルの「-」があると先に消費される。該当は「静止中の混沌耐性 -{0}%」↔「{0}% to Chaos Resistance while stationary」の 1 組: 「-15%」→ `15%` (符号が消える)。逆方向は `--15%`。

### 1-11. 日本語ベース名の衝突 (先勝ち)
- `item-text.ts:136`。日本語が同じ英語ベースが 17 組、うち **13 組は両方 PoB の itemBases に実在** (神秘の装束 = Arcane Raiment / Mystic Raiment、整列のフォーカス = Array Buckler / Arrayed Focus、禁欲の衣、要塞のサバトン、不気味な手袋、巻き布の帽子、放浪者の鎧、Runeforged/Runemastered 版 5 つ)。Mystic Raiment を貼ると Arcane Raiment で計算 (base 防御・要求が違う)。
- 回避策: アイテムクラス行・防御値・要求レベルで絞る、または衝突時に選ばせる。

### 1-12. ヒットは「敵なし」、継続ダメージ・ミニオンは「ピナクルボス相手」の混在
- `pck.lua:40-43`。既定の敵は `ConfigTab.lua:561-562` で `enemyIsBoss` = Pinnacle が input に入る。オーナー方針「仮想ボスはいらん、ゲーム内表記で」に半分だけ対応。DoT 側の倍率は CALCS に `<Type>DotEffMult` / `<Ailment>EffMult` (`CalcOffence.lua:5203-5228, 5936`) が出ているので割り戻し可能。

### 1-13. パワーチャージの表示値が実効値と食い違い得る
- `CalcPerform.lua:918-927`: `PowerCharges = Override or Max` の後 `max(PowerCharges, min(Max, Min))` → **PowerChargesMin があるビルドは 0 にしても Min 個が効く**し Override は Max でクランプされない。`pck.lua:93` の `config.powerCharges` は input から再構成していて `o.PowerCharges` と違い得る。表示は `o.PowerCharges` を使うべき。

### 1-14. ノードの寄与 (PCK.nodePower) の除外条件が本家より緩い
- 本家 `CalcsTab.lua:548, 593, 621` は `node.modKey ~= ""` と `mainEnv.grantedPassives[nodeId]` (装備・ジュエルが与えるノード) を除外。`pck.lua:373-376` は alloc 全部 → 外せないノードの「外した時の DPS」が出る。`calcFunc` を `useFullDPS` 省略で呼ぶので `includeInFullDPS` の組があると毎回 calcFullDPS が走る (速度だけ)。
- `TreeView.vue:69` の「条件つき」の正規表現: `per ` が「per Power Charge」「per 10 Strength」(PoB は計算している) も拾い、`duration` (DPS に効かないので 0 が正しい) も「ゲームでは効いている事がある」側へ。誤判定あり。

### 1-15. ジェムを enabled オンに戻す時 `enableGlobal1/2` を戻さない
- 本家 `SkillsTab.lua:989-994` は vaal でなければ `enableGlobal1/2 = true` に戻す。`pck.lua:247` は enabled だけ。global 効果のあるスキルをオフ→オンで本家は戻り ExileDesk は戻らない。

---

## 2. 装備の文面の「まんま」に関するその他 (要確認)

- **注記の有無の前提が食い違う**: `item-text.ts:9` 「日本語のコピーには注記が無い」/ `tests/pob-item-text.test.ts:63` 「日本語でも注記は英語」/ `paste-parse.ts:8-10` 「未確認」。オーナーの実物 (2026-09-22 の STAFF) には注記が無い。注記が無い時に**ルーンの塊が明示より後ろに来る並びだと、ルーンが明示・明示が暗黙に入れ替わる** (計算値は同じだが分類・色分け・`Implicits:` の数が違う)。ゲーム内コピーの実際の並びを実物で 1 回確かめるべき。
- **`NOTE_KIND` (:176-180) に fractured / desecrated / crafted / mutated が無い** (塊の種類に従うので明示なら問題なし)。
- **ベースが引けない時の includes 当て (:148) がベースでない物を拾う**: 「ゴールドアミュレット」→ 「ゴールド」= Gold (通貨)。PoB で `item.base` が nil → 「PoB が読めない文面です」で止まるが原因が伝わらない。辞書を PoB の itemBases にある物に限るべき。
- **詳細コピーの `30(20-40)`** が注記はがし (:229) に拾われる (偶然正しい結果。`+35(30-40)%` は未読)。日本語の詳細コピーは「対応していない」と断る方が安全。
- **未鑑定・ミラー化・サンクティファイの日本語を見ていない** (:216 はコラプトだけ。本家 `Item.lua:433-442`)。影響は小。
- **辞書の多対一 (JA 1 → EN 複数、先勝ち)**: 275 組 (単複・大小文字を除いて 74 組)。危ないのは「物理ダメージの{0}%を追加雷ダメージとして獲得する」→ `Gain {0}% of Physical Damage as Extra Lightning Damage` と **`Gain {0}% of Lightning damage as Extra Physical damage`** (後者が選ばれると意味が逆転)。選ばれた EN が ModParser に無いと `extra` (計算されない)。今の先勝ちで前者になっているか要確認。
- **逆引き (EN → JA 表示) も先勝ち** 28 組。例 `{0}% increased Accuracy Rating` → 「グローバル命中力が…」(武器のローカルでもこう出る)。表示だけ。
- `Spirit:` / `Charm Slots:` を渡さないので base 値になる (ベース値が増強されたユニークで差が出る可能性)。
- 旧経路の残骸: `lua_calls.rs:38-66 call_set_item_in_slot` / `commands.rs:44 pob_set_item_in_slot` は火力チェックから使われていない (api.ts:192 は `pob_eval` + `PCK.equip`)。
- テストで足りないケース: 塊が全部未読 / スキル付与 / 品質 (…モッド) / 注記なしでルーンが後ろ / ノーマル / マジック / ユニーク + フレーバー + コラプト / 未鑑定 / ソケットだけ / ジュエル / フラスコ / チャーム / 矢筒 / 盾 / 負号 / 小数 / 衝突するベース名 / PoB 側の装着 (両手で Weapon 2 が外れる、restore 後に items が増えない、フラスコの active)。
- 再現用 probe (プロジェクト外): `scratchpad/probe/item.probe.test.ts`

---

## 3. 操作・状態 (本家との数字の差ではないが、使っていて困る物)

### 確実
- **ツリーのヒット判定・ホイール拡大がアプリ全体の CSS zoom を考慮していない**: `TreeView.vue:262-264, 277, 286-287` で `getBoundingClientRect()` と `clientX` (zoom 後) を `clientWidth` (zoom 前) 基準の `toScreen` と比べている。`App.vue:35` の `zoom = innerWidth/1660` で、窓が 1660px より広いとクリック位置がずれる (別のノードを取る)。`utils/zoom.ts` の `toCss()` 未使用。1660px ぴったりでは再現しない。
- **ノードを 1 個取る / 外すたびにツリーの表示位置・倍率がリセットされ、全ノードの日本語化をやり直す**: `usePobCheck.ts:221, 229` で `treeNodes` を丸ごと差し替え → `TreeView.vue:87-104` の watch → `linesToJa` 全ノード + `fit()`。拡大して連続で取る作業ができない。
- **ジェム変更・組オン/オフ・チャージ・外す・戻す・武器セット・ツリー戻す の失敗が画面に出ない**: `usePobCheck.ts:142-196, 225-231` が try/catch 無し。`error` を立てるのは load / refresh / computePower だけ。PoB 側で Lua エラーになっても無言で何も変わらない。
- **貼った装備が PoB の items に溜まり、外す/戻すでも消えず、共有コードに全部入る**: `pck.lua:194-198` `AddItem` に対し `restore` / `unequip` は欄を戻すだけ。削除は `ItemsTab:DeleteItem` (`ItemsTab.lua:1666`)。

### 要確認
- **読み込みの途中失敗で画面 `cur` と PoB の中身がずれる**: `usePobCheck.ts:110-116`。`loadBuild` 成功後に `summary` / `treeStatic` が失敗すると `cur` は前のビルド、PoB は新ビルド → 以後の操作は新ビルドに効き表は前の数字。`loading` 中は `busy` が立たないので (:108) 読み込み中にジェムの +/− やツリークリックが押せ、`run()` のキューに割り込む。
- **上のバーのスキルが、選んでいない時は常に「DPS 最大」なので、変更で順位が入れ替わるとバーのスキルが勝手に変わる**: `usePobCheck.ts:277` `focus = find(focusKey) ?? skills[0]`、`focusKey` は読み込みで null。読み込み時に `focusKey = skills[0].key` を確定させる方向。本家の主スキルは XML の `mainSocketGroup` (作者の選択) で、ExileDesk はそれを無視して DPS 最大を初期選択 (CoEA 等で本命が低いビルドで見ている行がずれる)。
- **DPS が 0 になったスキルは行ごと消える (−100% が出ない)**: `pck.lua:131` `if n.dps > 0`。組をオフ → 行が消え、focus も別スキルへ移る。期待は「0 / −100%」。PoB が計算できないスキルも見えない。
- **ジェムの Lv / 品質に上限が無く、PoB 側で黙って丸められて「変えた所」の表記と実際がずれる**: `GemGroupCard.vue:60, 66` + 無制限。`pck.lua:244-245` はそのまま代入 → `validateGemLevel` (`CalcTools.lua:42-58`) が丸める。Lv 40 で + → note は「40→41」、PoB は 40。品質は 23 を超えても PoB がそのまま掛けるので品質 50% が作れる。`PCK.setGem` が丸め後の値を返すべき。
- **スキルの鍵が組の番号に依存**: `usePobCheck.ts:51` `${g.i}:${s.k}:${s.name}`。読み込み直しで組の並びが変わると差が出ない / 「新しく出た」になる。:63 の重複まとめ (`name|level|round(dps)`) も片方だけ変わると別行。
- **`PCK.summary` の途中でエラーが起きると PoB の状態が壊れたまま**: `pck.lua:117-147` が pcall 無しで `mainSocketGroup` / `mainActiveSkill` / `skill_number` を書き換えてから戻す。1 スキルの BuildOutput が落ちると主スキルが別のまま → 共有コードにもそのまま。`nodePower` (:368-393) は pcall で戻しているので同じ形に。
- **共有コードの主スキルは focus と無関係**: 画面で選んだスキルは PoB の `mainSocketGroup` に反映されない (`Build.lua:1160`)。開いた人の主スキルは読み込んだ時のまま。
- **PoE1 のコードや PoB でない XML を貼っても「読み込み成功」になり、後で意味不明な Lua エラー**: `lua_calls.rs:7-15` は `loadBuildFromXML` の `LoadDB` 失敗 (`Build.lua:2385-2388` → ShowErrMsg + CloseBuild) を拾えない。`decode_pob_code` 後に `<PathOfBuilding2` を Rust で見る (`commands.rs:16`)。`pob_load_saved_build` も同様。
- **pob_* は同期コマンドで、計算中は Tauri のメインスレッドをブロックしている可能性**: `#[tauri::command(async)]` が 1 つも無く、`pob_eval` → `rx.recv()` (`worker.rs:168-175`) で待つ。nodePower (1 スキル 2 秒) の間ウィンドウが固まる・タイムアウト無しで PoB の無限ループに戻れない。確かめ方: 計算中に窓をドラッグ。
- **「↻ 読み込み直す」は PoB コード元では最新を取れない** (同じ文字列を decode し直すだけ)。ツールチップ (`PobCheck.vue:266`) 「ゲームで装備を変えた後に…」はコード元では成り立たない。本当に再取得されるのは poe.ninja URL と保存ファイルのみ。
- **TreeView 初回 `fit()` が実サイズを知る前に走る (タブを 2 回目に開いた時)**: `TreeView.vue:74` 初期 800×600、`linesToJa` の import がキャッシュ済みだと ResizeObserver より先に `fit()`。再現: 装備 → ツリー → 装備 → ツリー。
- `pob_saved_builds` (`commands.rs:140-150`) の再帰は junction の循環で止まらない (`is_dir()` はリンクを辿る)。各ビルドを全文 `read_to_string` してから 4000 文字に切るので数百あると同期コマンドで数秒止まる。

### 改善候補
- `pck.lua:98, 124, 146` の `calcs.input.skill_activeNumber` は本家に存在しないキー (削除可)。
- `PCK.summary` は組×スキルごとに MAIN + CALCS + FullDPS を全部回す。1-1 を直して CALCS だけで良くなるなら半分以下に。
- 防御で読んでいるのは Life / Mana / ES / Ward / Spirit / Str / Dex / Int / 4 耐性 (`pck.lua:85-90`)。Armour / Evasion / TotalEHP は未読。`Ward` は PoE2 の CalcDefence に無く常に nil。`resistancePenalty` 既定 Endgame −60% は本家と同じ (低レベルのゲーム表記とは違う)。
- `SLOT_JA` が `usePobCheck.ts:41-46` と `ItemSlotCard.vue:20-43` に 2 つ (中身も微妙に違う)。
- `TreeView.vue:330 pct()` `loss === 0` で「−0.0%」。`:59 nameJa(n.n)` は `node.dn` が nil だと "undefined" が混ざる。`PobCheck.vue:406 :power="{...}"` が毎レンダー新規オブジェクトで watch が毎回 draw。
- `DiffBadge.vue:22` before 0 → 今 > 0 (クリ率 0 → 10%) は何も出ない。
- `GemGroupCard.vue:58-60` 連打: 計算が返るまで古い値なので同じ値を 2 回送り note が 2 件積まれる。
- 英語のまま: `PobCheck.vue:250` クラス / アセンダンシー名、`:223` 保存一覧、`:282` / `SkillTable.vue:50` ミニオン名、`GemGroupCard.vue:23` スロット名、`TreeView.vue:63` ジュエル名。「段」は pob-check 配下に 0 件。
- `api.ts:126 startsWith("ERR")` は到達しない分岐。`api.ts:185 Number(value)` が NaN だと Lua 構文エラー。`api.ts:198-202 luaStr` は先頭に改行を足していない (今は影響なし)。
- `worker.rs:191-203` boot 失敗 / ワーカー死亡は永続 (`restart` を呼ぶのは pob_bundle_install だけ)。`lua_boot.rs:120` の `set_current_dir` はプロセス全体の cwd を変える。
- `commands.rs:124-134` Settings.xml の buildPath は XML 実体 (`&amp;`) を戻していない。`commands.rs:16` decode のエラー文が英語のまま、pobb.in / `poe.ninja/poe2/pob/<id>` の共有 URL を貼ると base64 エラー (取りに行く実装は新しい外部通信なのでオーナー判断)。
- 履歴: `load` の `input` は 200 文字 (再現できない) / `account-*` は生 body 60,000 文字 × 2 (試しのためと明記。取り込みを作ったら外す)。pob-check.jsonl は 2 MB × 2 世代。

---

## 4. 自分のキャラ (poe_character_window) — 取り込みを作る前に

- **get-items / get-passive-skills を accountName 無しで呼んでいる**: `PobCheck.vue:74-76`。character-window は get-characters 以外 accountName 必須だったはず (無いと `false` / error)。get-characters の応答にアカウント名は無いので別途要る。オーナーの試しで履歴の `items.body` が `"false"` / error ならこれ。
- **応答はそのままでは本家 ImportTab に渡せない**: 本家 PoB2 は OAuth の `api.pathofexile.com/character/poe2` (`PoEAPI.lua:19, 205-215`) を読み、ImportTab が受けるのは `charData = { class, name, league, equipment[], jewels[], passives = { hashes, hashes_ex, mastery_effects, skill_overrides, jewel_data, specialisations, alternate_ascendancy } }` (`ImportTab.lua:749-782, 919`)。character-window の get-items `{ items, character }` / get-passive-skills `{ hashes, …, items(=ジュエル), jewel_data }` はキーの置き場が違う。`passives.specialisations` / `skill_overrides` が nil だと `pairs(nil)` で Lua エラー (ガード無し) → 無ければ `{}` を補う。`HeadlessWrapper.lua:218-226 loadBuildFromJSON` も `charData.passives` 前提で雛形には使えない。
- **401/403/429 の扱いが既存の決まりと揃っていない**: `trade_history.rs:233-237` は状態を素通し、`retry_after` / `ratelimit` を返さない。フロントは「読めない (状態 N)」のみ。本家の対応表 (`ImportTab.lua:455-471`: 401 要ログイン / 403 非公開 / 404 アカウント名違い / 429 待ち秒数)。429 時の待ちは固定 1.5 秒。`gate_acquire` / `gate_note` を通さない pathofexile.com への経路はプロジェクトで初めてなので方針を明示すべき。
- **Accept-Language が `ja,en;q=0.9`** (`trade2.rs:85` 共通) なので typeLine が日本語で返る可能性 → 本家 `ImportItem` は英語前提。履歴で `typeLine` を確認。

---

## 5. クラフトステージ (要望 ㉔ の差分)

### 確実
- **`&tags=1` の時、撮影 (clip) の倍率を決める計測カードに `show-tags` を渡していない**: `VideoStage.vue:235` (計測) に無く `:226` (本物) にはある。札で行が折り返して高さが増え、本番は下 15% の線を越える。
- **VideoEssence の部位の金の囲いが包含を見ていない** (POE2Tube 報告の件): `VideoEssence.vue:33` `g.h.includes(props.part)` の単純一致。見出し 46 種で取りこぼし: 「宝飾品に付く」「宝飾品またはベルトに付く」「防具、ベルトまたは宝飾品に付く」… ⊇ 指輪・アミュレット / 「防具に付く」 ⊇ 鎧・兜・手袋・靴・盾 / 「鎧に付く」(胴防具を「鎧」と書く) / 「装備に付く」 ⊇ 全部 / 「武器に付く」「マーシャル武器に付く」「近接武器に付く」「片手近接武器または弓」「両手近接武器またはクロスボウ」 ⊇ 各武器種 / 「キャスター武器」「フォーカス、スタッフまたはワンド」「盾またはフォーカス」。逆の過剰一致: `part=盾` は「盾またはフォーカス」にも当たる。方向: 部位 → 上位語の表。日本語名 (`name=肉体`) は英数字除去で 1 件も当たらない。

### 要確認
- **伸びた後の文の数値差し替えが「同じ数字をすべて置換」**: `stage-core.ts:125-127`。文中の固定数と衝突する MOD: `Rings/LightRadiusAndManaRegeneration` 「5% increased Light Radius / #% Mana Regen」(マナ再生が 5 の時、Light Radius も 6% に)、`Rings/ColdDamage` 等「Adds 1 to #」、`Amulets/Desecrated_GloryChanceToNotConsume` 「retain 40%」。`apply-vaal.ts:99 swapNums()` (順番で差し替え) に寄せる方が安全。
- **小数の値は `values` に浮動小数の誤差がそのまま入る**: `displayedValue(6.45, 20)` = 7.739999…。文は丸めるが `values` は誤差付き。
- **契約との差分**: POE2Tube の schema にあるのは `quality_boosted` と `raw_text_ja` だけ。ExileDesk は `raw_values` / `raw_text_en` も出す (extra=ignore で壊れないが使ってもらうなら契約に足す)。

### 改善候補
- `VideoEssence.vue:42` 見つからない時も「読んでいます…」のまま。
- `craft-stage-help.ts:180` 「上限はこのベースで N%」→ MOD 込みになったので「今のアイテムで」。
- コメントに「破砕」が残る (画面文字ではない)。

---

## 6. 確かめて問題なかった点 (抜粋)
- PoB コードの decode / 共有コードの encode は本家 ImportTab と等価。外部には取りに行っていない。
- toggleNode (AllocNode / DeallocNode / 道ごと / 能力値の attributeIndex / Undo) は `PassiveTreeView.lua:419-430, 532-534`、`PassiveSpec.lua:917-990, 2511-2558` と同順。
- nodePower の物差し (CombinedDPS + Minion.CombinedDPS) と `removeNodes` の渡し方は `CalcsTab.lua:694-695` と同じ。
- setWeaponSet は本家の I/II ボタンの onClick そのもの。
- setGroup / setGem (level, quality, enabled) のフィールドと `ProcessSocketGroup` の流れは `SkillsTab.lua` と同じ。コラプト +1 は activeEffect.level に乗る。
- equip / unequip / restore の `AddItem` → `SetSelItemId` → buildFlag は `ItemsTab.lua:1577-1615` と同じ。
- 出力の形 (`Rarity:` … `Implicits: N` / `{rune}` `{enchant}` / `Corrupted` / `Bonded:`) は本家の読みに合う。ローカル / グローバルの英語はゲームの英語表示と同一で解釈は変わらない。数値 (`{0:+d}` / 小数 / 順番入れ替え / 単位) は正しい。ベース名は PoB itemBases 1768 のうち日本語が無いのは 5 つだけ。
- 差の計算 (`diffPct`) のゼロ除算・丸め起因の差は無し。ツリー座標は PoB の x/y をそのまま使い向きの罠は無い。二重クリック・イベント解除は OK。
- Builds の外を読まない (canonicalize + starts_with)。POESESSID はフロントに返していない。PCK は PoB の Settings / ModCache を書かない。
- 品質の決まり (boostedMod) は quality.ts の実物を直接使い、印の付く場所 (before / after / changed / final) は全部に効く。品質の上限の 3 箇所は同じ関数。`&floor` の境界・hl=0 との組み合わせ・注の名前は正しい。「破砕」は画面文字に残っていない。
