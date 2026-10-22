# 共通の部品と見た目の地図 (2026-10-23、デザイン部長 1 本目)

for-share (ジン部長が移し中) は入れていない。渡された後に足す。
出し方: 台本 (scratchpad の comp-map.mjs、要る時は作り直す) で src/ の全 .vue/.ts/.css の import と `<style src>` を見て、`node scripts/owner-of.mjs` の持ち主と並べた。
使う画面の名前: エミュ = src/views/craft-stage、シミュ = src/views/simulator・tutorial、for-share = 両方の画面の核、web 枠 = src/web (WebApp・ヘッダー・広告の枠)、デイリー = src/views/daily、部品 = ほかの部品の中から。

## Web が使う物 (持ち主 = デザイン)
| 物 | 使う所 |
|---|---|
| ui/Icon.vue | for-share・エミュ・シミュ・デイリー・部品・アプリの画面 (28 か所) |
| ui/ModalShell.vue | エミュ・シミュ・web 枠・部品 (12) |
| ui/Disclosure.vue | for-share・エミュ・デイリー・部品・アプリの画面 (18) |
| ui/HelpTip.vue | for-share・エミュ・シミュ・デイリー |
| ui/BusyTag.vue | エミュ・シミュ |
| ui/AdSlot.vue | web 枠 (広告の枠、AdSense の再審査中は壊さない) |
| decor/RichText.vue | for-share・エミュ・部品 (11) |
| decor/GameItemCard.vue | エミュ・部品 (7) |
| decor/HoverStack.vue | web 枠・App.vue (浮かぶ説明の土台) |
| decor/Gem*.vue・ItemArt.vue・KeywordHoverCard.vue | 部品の中 (説明のカード) とアプリの画面 |
| items/BaseCatalog.vue (+ BaseCardGrid・BaseItemHoverCard・fam-glow.json) | エミュ・シミュ・htc-craft (ベースを選ぶ一覧) |
| NumStep.vue | シミュ・部品 |
| vaal-scales/CurrencyPicker.vue | エミュ・アプリの画面 (置き場の名前はアプリの頃のまま) |
| ChangelogDialog.vue・SupportDialog.vue・LangSwitch.vue | web 枠 (+ App.vue) |
| PriceInput.vue・vaal-scales/MoneyInput.vue・build-copy/BuildItemHoverCard.vue・currency/CurrencyHoverCard.vue・unique-trend/UniqueHoverCard.vue | アプリの画面・部品の中だけ (src/web・エミュ・シミュから htc-craft・gem-corrupt への import は無い = Web には出ない) |

## アプリだけ (凍結、owners.txt のアプリの行)
App.vue からの物 (AssetPackToast・CenterContent・ConfirmDialog・FetchBusyBar・LeftSidebar・LoginGate・UpdateToast・WatchReplaceDialog・useAppUpdater)、craft-v2/・build-copy/ (BuildItemHoverCard 以外)・currency/ (CurrencyHoverCard 以外)・unique-trend/ (UniqueHoverCard 以外)、AttemptsSelect・CountInput・RefreshButton・ScreenHeader・SoldListDialog・sold-list-rows・WatchToggleButton・ui/TabBar・decor/BaseCard・UniqueTooltip・unique-tooltip-i18n。
- decor/BaseCard.vue はアプリの行だが gem-corrupt (Web の GemCorruptWebPanel の並び) からも使われる。src/web・エミュ・シミュから gem-corrupt への import は無いので Web には出ない。

## 見た目 (CSS)
| 物 | 読み込み | 使う所 |
|---|---|---|
| src/style.css | main.ts・web 枠 | 全部 (tailwind・字体・色) |
| src/styles/game-ui.css | style.css の @import | 全部 (.g-panel・.g-tab・.g-section・枠の絵) |
| src/styles/poe-card.css | `<style src>` | htc-craft/ItemCard.vue (アプリ) |
| src/styles/route-rule.css | `<style src>` | エミュのスパムシミュレーター (StageRoutesPage・StageRoutesIntro) |
| src/styles/spam-lucky.css | `<style src>` | エミュの運試し (StageRouteLuck) |

## 食い違い (ブラックへ)
- owners.txt の `src/style/**  デザイン` は実際の置き場 `src/styles/` と名前が違い、`src/styles/*.css` と `src/style.css` は今「共通」(ジン部長) になっている。デザインにするなら `src/styles/**` と `src/style.css` の行に直す (owners.txt は組織の物なのでブラックの判断)。
