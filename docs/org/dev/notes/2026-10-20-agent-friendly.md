# エージェントで開発しやすい作り — 調べと案 (開発部長、2026-10-20 夜。読むだけ・案だけ)

数え方: scratchpad の churn.mjs (今日 00:00 からの commit 116 本、`git log --name-only`)。部は commit の題の頭から推した近似 (セッションは commit に残らない)。「フォルダー分け 手 1〜3」と版上げの commit は移動なので、回数から外した数も出した。

## 1. 今日、複数の部・セッションが触ったファイル (重い順)

| 順 | ファイル | 今日の commit (移動を除く) | 触った部・セッション | 何が起きたか |
|---|---|---|---|---|
| 1 | src/views/simulator/StageTargetSummary.vue (② 狙う MOD、399 行。午前は craft-stage/ にあった) | 16 | シミュ (② の番号・貼り付け・手 3 の入口の付け替え・どっちもの組を、別々のセッションで) | 同じシミュ部の中でセッションが並び、順番待ちになった。手 3 の付け替えと ② の番号が同じ関数 (shareOf・slotsOf) を触った |
| 2 | src/services/simulator/auto/ (auto-model 7・auto-solve 5・auto-order 4・worker 4・auto-actions 3) | 23 | 解析君 (計算) × 2 本 + シミュ部長 (呼ぶ側) | auto-model をシミュが 3 回直した (持ち主は解析君)。K3 と S1b がまた同じ所に来ている。書きかけの auto-rules.ts・auto-model.ts で他の人の型チェックが落ちた |
| 3 | src/views/craft-stage/StageBasePage.vue・use-stage-base.ts (① のベースのページ、エンジン部の持ち物) | 7 | シミュ (貼り付けのタイル・レシピから始める・ilvl の持ち越し) | 持ち主はジン部長なのに、直すのは毎回シミュ。今夜の S1d・S1e もここ |
| 4 | src/views/craft-stage/CraftStage.vue (495 行、上限 500 の手前) | 3 (+ 移動 2) | ジン・シミュ (S1d)・チュートリアル (コースの画面 7 か所) | 3 部の画面の差し込み口がこの 1 枚に集まる |
| 5 | src/state/craft-stage.ts (516 行、上限超え) | 移動 3 | 全部の部 (`SIM_LOCKED`・mode・simTargets など) | 今日は移動だけだが、どの部の機能もここに 1 行足しがち |
| 6 | src/web/page.ts・WebApp.vue・state/web-page.ts (ページの URL・題・履歴) | 3 | 開発・シミュ (レシピのページ)・エンジン | 新しいページのたびに 3 枚を同時に直す (page.ts に `page=` の分かれ道 32) |
| 7 | docs/org/*/README.md・dev/todo.md (md) | 20 本超 | 全部の部長 + ブラック + 開発部長 | 「混ざった」2 件の場所 (下) |

起きた事故 (今日):
- **混ざった**: 046528b0 (解析君の todo の commit に、開発部長が先に stage した md 11 本が入った = git の index は皆で共有)、ed2c9ba3 (一時の解析君の commit に math/README.md の開発部長の書きかけ)。→ 決まり 5 を「`git commit -- <パス>` の 1 回で」に直した (7660d25b)。
- **止まった**: 開発版のデプロイが、他のセッションの書きかけ (paste-read の型エラー) で出せなかった → HEAD だけからビルドする形に直した (aa0d414a)。型チェックは今も、他の人の書きかけ (SimStartPick・auto-rules) で落ちると各部長が報告している。
- **待たせた**: シミュ部の中で ②・① のセッションが並び、順番を決め直した (今夜から階段式)。解析君 K3 (auto-model) とシミュ部長 S1b (ワーカー) は、呼び方を変える時に私を通す約束で並べている。

## 2. 割る候補 (全部の作り直しはしない。1 手 = 1 commit、移動と中身の直しは別の commit)

| 対象 | 何に割る | 手 | どの部 | 壊れやすい所 |
|---|---|---|---|---|
| StageTargetSummary.vue | ① 行の並べ方 (rows・columns・noOf) / ② 付け方の ▾ (plansOf・setPlan・restOf。自動の札もここに入る) / ③ 確率の % (shareOf・shareNote → エンジンの入口を呼ぶだけ) の 3 つに。親は並べるだけ | 3 | シミュ部長 (S2 の前にやると、自動の札がきれいに入る) | ② の番号 (slotsOf) が行と付け方の両方を見ている。Ctrl+Z の Snap |
| auto/ の線 | 計算 (model・solve・actions・engine・rules・linear) と呼ぶ側 (order・worker) の間に、型だけの 1 枚 `auto-types.ts` を置き、シミュはそれと関数の名前だけを読む。持ち主の表 (3) で auto-model をシミュから「直さない」に | 1〜2 | 解析君 (型を出す) → シミュ部長 (import を直す) | ワーカーのバンドル (再輸出の連鎖を作らない、800KB の件)。手 7 (import の付け替え) と一緒にやると 1 回で済む |
| ① ベースのページ | StageBasePage.vue の中のシミュの物 (貼り付けの枠・レシピから始める・ilvl・revealSimMods) を `views/simulator/SimBaseExtras.vue` 1 枚に出し、ベースのページは `<SimBaseExtras v-if="mode==='sim'">` の 1 行で差すだけに | 1 | シミュ部長 (エンジン部の画面を 1 行だけ触るので、ジン部長に知らせる) | ベースを選んだ時の流れ (pickSimBase・startFromRecipe) と、S1d・S1e の直しと同じ所 → S1e の後に |
| CraftStage.vue | 部ごとの差し込み口: `<SimHost>`・`<CourseHost>` (各部のフォルダー) に、各部の画面を中に持たせる。CraftStage は mode で切り替えるだけ | 2 | ジン部長 (口を作る) → シミュ部長 (中身を移す) | コースの画面 7 か所が CraftStage の状態 (inLesson など) を直に見ている。UI が変わらない事を画面で確かめる |
| state/craft-stage.ts | 部の物を `state/simulator/`・`state/emulator/` に追い出し、craft-stage.ts は全部の部が使う物だけ (`SIM_LOCKED`・mode・base) に。500 行の内に | 2〜3 | 開発部長 (境目の持ち主) | import の数が多い (全部の部)。1 手ごとに型チェック・`pnpm build:web` |
| ページ (page.ts・WebApp.vue) | ページの表を部ごとに `web/pages/<部>.ts` に持ち、page.ts は表を読むだけ (URL・題・開き方・履歴) | 2 | 開発部長 | 広告の数え方 (pageTick)・戻るボタン・シェアの URL。今あるページの URL を変えない |

おすすめの順: auto-types (今の K3・S1b のぶつかりが一番近い) → SimBaseExtras (S1e の後) → StageTargetSummary の 3 つ (S2 の前) → CraftStage の口 → state → ページの表。

## 3. 持ち主の表 (ファイル → 部) を機械で持つ

- 1 枚 `docs/org/owners.txt` (CODEOWNERS と同じ形: `<glob> <部>`、下の行ほど強い)。元は各部の README の地図と ARCHITECTURE.md の「部ごとの持ち場」。例:
  ```
  src/views/simulator/**          シミュ
  src/services/simulator/auto/auto-order*.ts  シミュ
  src/services/simulator/auto/**  解析
  src/services/craft-stage/**     ジン
  src/state/craft-stage.ts        開発 (境目)
  ```
- 引く台本 `scripts/owner-of.mjs`: `node scripts/owner-of.mjs <パス…>` → 部の名前。`--status` で `git status` の書きかけを部ごとに並べる (誰の書きかけが残っているかが一目で分かる)。
- 使い道: (a) 開発部長が振る時、触るファイル → 部を引く。(b) 部長の commit の前に「他の部の持ち物が入っていないか」を見る (警告だけ、止めない)。(c) dev/todo.md の「触っている」の表を、各部長の 1 行 + `--status` で埋める。
- 手間: owners.txt の最初の版は各部の地図から 40〜60 行、台本 50 行ほど。半日。地図と食い違ったら owners.txt が正、と決める。

## 4. 手 8 の見張りと、ファイルの頭の 1 行

- **手 8 (scripts/check-engine-entry.mjs + CI)**: 「シミュ・チュートリアル・解析君が、craft-stage/ のエンジンの中・vendor/poe2htc を入口 (engine.ts) の外から読んでいないか」「Web から simulator/htc/ を読んでいないか」を import の文から数える。手 7 の前に入れる時は、今の違反を控え (数) に持ち、増えたら落ちる形 (減るのは良い)。手間: 台本 80 行・CI 1 行・控え 1 枚で 2〜3 時間。owners.txt と同じ台本の部品 (glob → 部) を使える。
- **ファイルの頭の 1 行 (`// 持ち主: シミュ部 / 役目: …`)**: src の .ts・.vue が 613 本 (vendor 29 を除くと 584)。持ち主は owners.txt から機械で入れられるが、役目の文は 1 本ずつ読まないと書けない。全部だと 1 本 1〜2 分で 10〜20 時間分、しかも持ち主が動くたびに 2 か所 (頭と owners.txt) を直す。→ 案: **持ち主は頭に書かず owners.txt 1 か所**、役目の 1 行は今の頭のコメントが無い物と、上の 1・2 の表のファイルだけ (vendor を除く 584 本のうち 574 本 = 98% は、頭の 3 行の中にもうコメントがある。数え方: head -3 に /** // <!-- があるか)。

## 5. 得と損・決めてもらう事

得
- 順番待ちと混ざりの元 (auto/・① のページ・②・CraftStage) が部ごとの 1 枚に分かれ、同じ時間に 2 部が動ける所が増える。
- 振り分けが表を引くだけになり、開発部長の手で「誰の物か」を調べる時間と間違いが減る。見張り (手 8・owners) で、決まりを破った所が commit の時に分かる。
- 500 行を超えたファイル (state/craft-stage.ts) と手前の物 (CraftStage.vue) が決まりの内に戻る。

損
- 割る commit の間は、そのファイルの他の仕事を止める (1 手 半日ほど × 10 手前後)。自動 / 手動 (S2〜S4) の進みが少し遅れる。
- ファイルの数が増え、読む物の地図 (各部の README) を毎回直す。owners.txt が 1 枚増えて、それ自体の手入れが要る。
- 割る時に UI が少し変わる事故の心配 (画面で確かめる手間)。CraftStage・ページの表は広告の数え方にも触れる。

決めてもらう事 (おすすめが先)
1. **進め方**: おすすめ = 「今の仕事の合間に、ぶつかっている所から 1 つずつ」(auto-types → SimBaseExtras → StageTargetSummary の 3 つ)。CraftStage・state・ページの表は自動 / 手動 (S4) が開発版に出た後。別案: 先に全部割ってから自動 / 手動へ (1〜2 日止まる)。
2. **持ち主の表**: おすすめ = owners.txt + owner-of.mjs を作る (半日、開発部長)。commit の前の見張りは「警告だけ」。別案: 各部の README の地図のまま (今のまま)。
3. **ファイルの頭の 1 行**: おすすめ = 持ち主は書かない (owners.txt 1 か所)、役目の 1 行は割った物・説明の無い物だけ。別案: 584 本全部に入れる (10〜20 時間)。
4. **手 8**: おすすめ = 控えの数を持って手 7 の前に入れる (増えたら落ちる)。別案: 手 7 が済んでから 0 件で入れる (今の順番)。
