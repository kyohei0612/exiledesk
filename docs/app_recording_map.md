# ExileDesk クラフトステージの操作の地図 (録画用)

`docs/app_recording.md` の続き。ExileDesk のソース (`src/views/craft-stage/` ほか、2026-10-08 時点) から作った地図。
セレクタは Playwright (Python)、`import re` 前提。**本番の前に `boundingBox()` で 1 回測る**。

## 0. 先に知っておくこと

1. **長押しの連打は無い**。カレンシーは使った後も持ったまま → アイテム枠を何回もクリックするだけ
2. **画面は拡大されている**: `zoom = innerWidth / 1660` (1920 幅で 1.157 倍)。`locator.click()` は実座標なので問題なし
   - 要確認: カーソルに付くカレンシーの絵と押した所の波紋は zoom の補正をしておらず、右下にずれるかもしれない → 1 回撮って確かめる
3. **未ログインだと LoginGate が全画面を覆って何も押せない** → ログインした状態で撮る (パスワードは kyohei)
4. **シミュレーションの画面は一度開くと隠れるだけで DOM に残る** → アイテム枠・MOD 一覧・ソケットは必ず `.filter(visible=True)`
5. **文字だけで掴まない**: 「金の指輪」は「黄金の指輪」にも含まれる → `^金の指輪$`。カレンシーは 変成 / 変成 (上級) / 変成 (完全) が前方一致で全部当たる → **棚は `data-key` で**
6. **ベースとアイテムレベルは「手で打つ」と「シミュレーション」で共通**。シミュレーションでベースを選ぶと手で打つ側も白に戻る → **手で打つ章を先に、シミュレーションは最後**
7. **乱数の種は「白に戻した時刻 + 手の番号」**。撮るたびに結果は変わるが、「1 手戻す」の後に同じカレンシーを打つと同じ結果がもう一度出る
8. スクロールする枠は `div.h-full.overflow-auto.p-4`。`scroll_into_view_if_needed()` で足りる
9. 起動直後は相場の取得の帯 (画面の下) やトーストが出る → 少し待ってから撮る

## 1. 共通の部品

```python
import re
card  = page.locator("div.select-none.border-2", has=page.locator("p.stage-item-name")).filter(visible=True).first
shelf = page.locator("section", has=page.locator("b", has_text=re.compile("^カレンシー$")))
sk    = lambda k: page.locator(f'[data-shelf][data-key="{k}"]')
steps = lambda n: page.get_by_text(re.compile(rf"· {n} 手$"))
catalog = lambda: page.get_by_placeholder("名前で探す (例: サファイア、ルビー)").locator("xpath=../..")
modlist = page.locator("section").filter(
    has=page.get_by_role("button", name=re.compile("^このベースに付く MOD"))).filter(visible=True)
blk = lambda n: page.locator("div.rounded-xl").filter(has=page.get_by_role("button", name=n, exact=True))

def use_once(n):
    card.locator("p.stage-item-name").first.click()   # 見出しを押す (ソケットの丸は避ける)
    steps(n).wait_for()
    page.wait_for_timeout(1700)                       # 演出 1.4 秒 + 付いた MOD の光 1.6 秒
```

## 2. 手で打つ

| やりたい事 | セレクタ | 待つ目印・注意 |
|---|---|---|
| クラフトステージを開く | `page.locator("aside nav button", has_text="クラフトステージ")` | 「データを読んでいます…」が消え、`[data-shelf]` が見える |
| タブ | `get_by_role("button", name="手で打つ", exact=True)` / `name="シミュレーション (実験)"` | 持っていたカレンシーは手放される |
| ベース一覧を開く・閉じる | `get_by_role("button").filter(has_text=re.compile("▼ 変える\|▲ 閉じる"))` | 検索欄が出る / 消える |
| 種類 | `catalog().get_by_role("button", name="指輪", exact=True)` | 防具は「手袋(str)」のように属性付き |
| ベースを選ぶ | `catalog().locator("button").filter(has=page.locator("b", has_text=re.compile(r"^金の指輪$")))` | 一覧が閉じて白の新品に。`p.stage-item-name` が変わる |
| アイテムレベル | `page.locator("span:has(> span:text-is('アイテムレベル'))").get_by_role("button", name="82", exact=True)` | **押すと必ず白に戻る** (同じレベルでも) |
| 白に戻す | `get_by_role("button", name="白に戻す", exact=True)` | `steps(0)` |
| 1 手戻す | `get_by_role("button", name="1 手戻す", exact=True)` または Ctrl+Z | 手の数が 1 減る。**演出は出ない** |
| 棚のタブ | `shelf.get_by_role("button", name="オーブ・骨", exact=True)` ほか `^使用可能 \(\d+\)$` / `^エッセンス \(\d+\)$` / カタリスト / ルーン / `^お告げ` | 「使用可能」は棚が短く、工程まで画面に入りやすい |
| カレンシーを持つ | `sk("transmute")` | 「持っている: …」の札、ボタンに `ring-2`。**もう一度押すと手放す** |
| 使う | `use_once(n)` | 浮く文字 `.stage-float` が出て消える |
| 手放す | Escape、またはステージ内で右クリック | 「持っている:」が消える |
| お告げを掛ける | `page.locator('[data-held-omens] [data-key="OmenofGreaterExaltation"]')` | 「有効」の札、タブが「お告げ (1 枚掛け)」 |
| 発現の候補を選ぶ | `page.locator("section", has_text="魂の井戸で発現").locator("button.w-full").nth(0)` | 骨で未発現の冒涜 MOD が付いた時だけ。アビスの反響を掛けていれば「引き直す」 |
| 予見 | `sk("hinekora")` を打つ → 別のカレンシーを持つ | 紫の箱「予見: ○○ を使うと」 |
| 工程 | `page.locator("section", has=page.locator("p", has_text=re.compile("^工程$"))).locator("ol > li")` | 手の数は `steps(n)` の方が確実 |

**主な data-key**: 変成 `transmute*` / 増強 `augment*` / 王者 `regal*` / 錬金 `alchemy` / 高貴 `exalt` `exalt_greater` `exalt_perfect` / カオス `chaos*` / 消去 `annul` / 神 `divine` / フラクチャー `fracture` / 熟練工 `artificer` / ヴァール `vaal` / ヒネコラ `hinekora` / 骨 `desecrate_gnawed` `desecrate` `desecrate_ancient` `desecrate_altered`。上級は `_greater`、完全は `_perfect`。

**オーブ・骨タブは 1 手ごとに並びが変わる** (使える物が前、使えない物は線の下)。座標を覚えず、毎回 `data-key` で掴む。

**ソケットの丸** `card.locator('[data-stage-socket="1"]')`: ルーンを持って入りの穴を押すと置き換え。普通に使う時は見出しを押す (指輪にはソケットが無い)。

### MOD 一覧 (アイテム枠と棚の下、1080p ではスクロールが要る)

| やりたい事 | セレクタ | 注意 |
|---|---|---|
| 目次で飛ぶ | `modlist.locator("div.sticky button", has_text=re.compile(r"^\s*普通"))` | ふわっとスクロール → 0.8 秒待つ |
| 検索 | `modlist.get_by_placeholder("文面やタグで探す (例: 耐性、ライフ)")` | |
| 行を押して表を開く | `sec = modlist.locator("section.scroll-mt-12").filter(has=page.locator("h3 > span", has_text=re.compile("^普通$")))` → `row = sec.locator("button.w-full").filter(has_text="火耐性").first` | 表は 1 つだけ。**閉じるボタンは無い** → 同じ行をもう一度押す |
| 付ける / フラクチャー / 冒涜 | `tbl = row.locator("xpath=following-sibling::table[1]")` → `tbl.locator("tr").filter(has=page.locator("td:first-child", has_text=re.compile("^T1$"))).get_by_role("button", name="付ける", exact=True)` | **1 手も打っていない時だけ出る** (先に「白に戻す」)。フラクチャー・冒涜は 1 つまで。演出は出ない |

### 演出の長さ (次のクリックまであける目安)

- 手が増えると演出が出て 1.4 秒で消える。付いた MOD の光は 1.6 秒 → **1 手ごとに 1.6〜1.8 秒あける**
- 打てない時は枠が赤く震え、理由の札が 1.4 秒。手の数は増えない → 次は 1.4〜1.6 秒あける
- 1 手戻す・再生では演出は出ない

## 3. シミュレーション (実験)

| 工程 | セレクタ | 注意 |
|---|---|---|
| 1 ベース | 初めて開くとベース一覧が開いている → 2 章と同じ `catalog()` | 前の途中が戻る時は `#sim-tools` の「リセット」を 2 回押す (3 秒以内) |
| 2 狙う MOD | 枠の中の MOD 一覧で行を押す → `tr.get_by_role("button", name=re.compile(r"^(✓ )?T2 以上$"))` | 完成図の「プレフィックス (n/3)」が増える。同じ段をもう一度押すと外れる |
| 付け方 | `blk("2 狙う MOD").locator('select[title="付け方の予定"]').nth(i).select_option("chaos")` | 値は fracture / exalt / chaos / desecrate / essence |
| 決めた → | `blk("2 狙う MOD").get_by_role("button", name="決めた →", exact=True)` | 各工程に同じボタン → 枠で絞る |
| 3 白ベース | `blk("3 白ベース設定").locator('input[type="number"]').fill("5")` → 「決めた →」 | **「取引所で探す ↗」は外のブラウザが開くので押さない** |
| 4 最安値スタート | 価格欄 2 つ → 「決めた →」 | フラクチャー予定がある時だけ出る |
| 5 順番 | `button[title="上へ"]` / `button[title="下へ"]` → 「決めた →」 | |
| 6 パターン | `blk("6 パターン").get_by_role("button", name="＋ 手を足す").first` → 右の枠で MOD → 「次へ →」/「この手にする」 | 手数が多い → **前もってレシピに保存し、撮る時は「レシピ ▼ → 呼び出す (2 回押し)」** |
| 回す | `blk("6 パターン").get_by_role("button", name="回す ▶", exact=True)` | 「中止」が消えて「… の 1 個あたり」が出るまで (数秒〜数十秒)。結果は 6 の下 → スクロール |

レシピの箱の「書き出す」(ダウンロード) と「読み込む」(ファイル選びの窓) は押さない。

## 4. 邪魔になる物

- **棚の詳細カード**: ボタンの上に 0.4 秒止まると大きなカードが出て、マウスが離れるまで消えない → 押したら 0.4 秒以内にアイテム枠へ動かす
- **title のツールチップ** (OS の物、画面録画に写る): 「1 手戻す」「動画モード」や MOD 一覧の行など → title の付いた物の上で止まらない
- 持っている間は枠の下に「押すと使う…」の案内が出る
- レシピの箱 (z-40)、あるいはの小窓 (z-400)、LoginGate (z-100)、強制更新 (z-110)、画像パックのトースト (右下)、取得中の帯 (一番下)

## 5. 映したくない物

- **「動画モード」「手順 JSON」「結果 JSON」「相場 JSON」「今の MOD を取引所で検索 ↗」**: 「白に戻す」「1 手戻す」と同じ行。動画モードはそのすぐ右、JSON と取引所は右端
  - 隠し方 (ファイルは変えない): `page.evaluate` でボタンに `style.display='none'` を当てる (Vue の :style が無いので戻されにくい)
- **ログインの状態**: サイドバー左上の「● ログイン済み」(1920 幅で x 20〜240、y 15〜40 くらい)
- アカウント名はクラフトステージ・サイドバーには出ない

## 6. 1920×1080 での大まかな位置 (CSS × 1.157 の見積もり)

| 部品 | x | y |
|---|---|---|
| サイドバー | 0〜241 | 全体 (「クラフトステージ」は y 450〜495) |
| タブ・`#sim-tools` | 260〜 | 85〜120 |
| 設定の段 (ベース / アイテムレベル・白に戻す・1 手戻す…) | 260〜1900 | 130〜240 (ベース一覧を開くと下が 650〜700 下がる) |
| アイテム枠 | 260〜700 | 260〜 (白で高さ約 300、6 MOD のレアで y 760 まで) |
| カレンシー棚 | 718〜1900 | 260〜1000 近く (オーブ・骨タブ) |
| 工程 | 棚の下 | 950〜 (オーブ・骨タブだとほぼ画面の外) |
| MOD 一覧 | 260〜1900 | 1000〜 (スクロールが要る) |

## 7. 宣伝の回 2〜5 章の手順

**2 章 開く・白い指輪**: クラフトステージ → 手で打つ → (見せるなら) ▼ 変える → 指輪 → `^金の指輪$` → アイテムレベル 82 (白に戻る) → `steps(0)`

**3 章 変成 → 増強 → 王者 → 高貴 × 3**: 「オーブ・骨」タブ → `sk("transmute")` → `use_once(1)` → `sk("augment")` → `use_once(2)` → `sk("regal")` → `use_once(3)` → `sk("exalt")` → `use_once(4..6)` (持ったまま 3 回) → Escape

**4 章 1 手戻す**: 「1 手戻す」 → `steps(5)`。もう一度 `sk("exalt")` → `use_once(6)` で同じ MOD が付く

**5 章 MOD 一覧で指名**: 白に戻す → `modlist.scroll_into_view_if_needed()` → 目次「普通」 → 検索「耐性」 → 火耐性の行 → T1 の「付ける」 → (別の行でフラクチャー / 冒涜) → 同じ行を押して表を閉じる

**シミュレーション (最後)**: タブ → (リセット 2 回) → 金の指輪 → 2 で T2 以上を 1〜2 個 → 決めた → 3 で値段 5 → 決めた → (4) → 5 決めた → レシピを呼び出す → 回す ▶ → 結果までスクロール → 手で打つに戻す

## 8. v0.1.445〜453 (2026-10-10) で変わった所 (上の表より優先)

| 物 | 今のセレクタ・注意 |
|---|---|
| タブ | `page.get_by_role("tab", name="エミュレーター", exact=True)` (シミュレーターは `^シミュレーター`) |
| アイテム枠 | `page.locator("div.g-item.select-none", has=page.locator("p.stage-item-name")).filter(visible=True).first` (border-2 は無くなった) |
| ベース一覧を開く | `page.locator("[data-stage-settings] button[aria-expanded]")` (「▼」は無くなった) |
| 防具の種類 | 部位の札 `^鎧( \d+ 種)?$` → 属性の札「筋力」(`.g-tab`)。手袋・靴・兜も同じ。「鎧(str)」は無い |
| 同じベースを選ぶ | 何も起きない (白に戻らない)。違うベースなら白に戻る |
| 白に戻す | **2 回押し**: 「白に戻す」→ 3 秒以内に「もう一度押すと白に戻す」。手も始めの MOD も無い時は押せない。アイテムレベルの札でも確認なしで白に戻る |
| 1 手戻す | 次の手は**新しい乱数** (同じ結果にはならない) |
| 棚 | 既定のタブは「使用可能」。オーブ・骨の使えない物は畳まれて DOM に無い。ボタンの名前は「名前 — 理由」なので data-key で掴む |
| 工程 | `hist = page.locator("ol").filter(has=page.locator("li b", has_text=re.compile("^始め$")))`。手の行を押すとその手の直後に戻る |
| MOD 一覧 | `section[data-mod-list]` (visible で絞る)。段の表のボタンは `exact=True` で (打った後は「冒涜で付ける」がある)。各段に「次の手で狙う」 |
| 次の手で狙う | 段の表の「次の手で狙う」→ 窓 `body > div.fixed.inset-0.z-\[400\]` → 「確率を見る (N)」→ `section[data-aim-panel]` (「計算中…」が消えるまで待つ。棚が下にずれる)。行の「回す」、回数 10 / 100 / 1,000 |
| 右クリック | MOD の行の上はフラクチャー、ルーン入りソケットの上は外す → **手放すのは Escape で** |
| 直前の変化 | 枠の中に工程も入った (LAST_CHANGE_JS は全部の手まで読む) |
| 映さない物 | 「この状態からシミュレーター →」が増えた (HIDE_JS に足す) |
| 邪魔な窓 | 版が上がった後の最初の起動で「更新内容」の窓 (`div.fixed.inset-0.z-50`、「閉じる」)。localStorage `exiledesk.changelog.seen` に今の版を入れると出ない |
