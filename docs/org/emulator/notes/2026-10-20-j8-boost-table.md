# J8 3) クラフト台 (本番) で盛った値をそのまま出している所 (ジン部長 2026-10-20)

オーナー決定 (10-20):「MOD の数字は上乗せを全部抜いた素の値 (デフォの値) と段で出す、盛った値は要る所でだけ小さく添える」。
上乗せと割り戻しはエンジンの入口の boosts.ts (`boostsOf`・`modBoostsOf`・`baseValueOf`・`unboost`) に 1 か所 (0f2a6f0f)。画面はそれを呼ぶだけにする。
**直すのはこの表をオーナーに見せてから** (本番の見た目が変わる)。数は grep で拾った物 (src/views/craft-stage/ と stage-props)。

## 上乗せの種類 (エンジンが今掛けている物)
| 種類 | どこで掛けているか | 値の持ち方 |
|---|---|---|
| 品質 (カタリスト: 指輪・アミュレット・ジュエル・グラスピングメイル) | stage-core `boostedMod` (catalystBoosts) | MOD の values は素、表示の時だけ盛る |
| 反対側の効果 (獰猛「サフィックス / プレフィックスの効果が N% 増加」) | stage-core `boostedMod` (sideEffectPct) | 同上 |
| 聖別 (×0.78〜1.22) | apply-vaal `applySanctify` | **values・textJa・textEn そのものが盛った値**。素は `m.sanctify.base` |
| ソケットの効果 (ルーン・ソウルコアの効果の % 増加、アストリッドなど) | stage-core `scaledAugment` | ルーンの効果の文を盛って出す (MOD ではなくソケットの行) |
| 暗黙の品質 (カタリストで伸びる暗黙) | stage-props `implicitRows` (roll-text の boosted) | 暗黙の行を盛って出す |

## 盛った値を出している所
| 画面 | ファイル | 出している値 | 直し方の案 |
|---|---|---|---|
| アイテムカードの MOD の行 | views/craft-stage/StageItemCard.vue (rows: `boostedMod` の文を水色で) | 品質・反対側の効果・聖別で盛った値 | 文は素の値 (`baseValueOf().base`) で、盛った値は行の後ろに小さく (例「(盛 55)」) |
| アイテムカードのソケットの行 | StageItemCard.vue (`scaledAugment`) | ソケットの効果で盛ったルーンの効果 | 素の効果 + 小さく盛った値 |
| アイテムカードの暗黙 | StageItemCard.vue (stage-props `implicitRows`) | カタリストの品質で盛った暗黙 | 同上 |
| 工程の履歴 (足した / 消した MOD) | StageHistory.vue (`modText(m)`) | 聖別した MOD は聖別後の値 (品質・側の効果は盛っていない) | 素の値で |
| 小さいアイテムカード | StageItemMini.vue (`modText`) | 同上 | 同上 |
| スマホの下の帯 | StagePhoneBar.vue (`modText`) | 同上 | 同上 |
| 発現の候補 | RevealPanel.vue (`modText`) | 聖別前なので素 (変わらない) | — |
| 上の数値 (防御・DPS などの合計) | stage-props `propRows` | 盛った値の合計 | **合計はゲームの表示どおり盛った値のまま** (素にしない方がよい。オーナーに確かめたい) |
| MOD 一覧・段の幅 | StageModList.vue | 段の幅 (素) | — (今のまま) |

## 上乗せと数えるか迷う物 (開発部長・オーナーへ)
1. **ルーンで付く「明示 ○○ MOD の強さが N% 増加する」**(破壊のルーン系、Crossbows_cannon など): ゲームでは他の MOD の値を盛るはずだが、エンジンは今 MOD の値に掛けていない (画面は素の値のまま)。貼り付けではこの分だけ盛られた値が来るので段を高く読む。上乗せとして掛ける・割り戻すか。
2. **上の数値の合計** (アーマー・ES・DPS): 素にするとゲームの表示と合わなくなる。合計は盛った値のままでよいか。
3. **ソケットの効果で盛ったルーンの行**: ルーンの効果は MOD ではないが、「ルーン・ソウルコア」は抜く物に入っている。ルーンの行も素で出すか。
4. **聖別の倍率**: 聖別は MOD の値そのものを変える手 (ゲームでも聖別後の値が MOD の値)。上乗せとして抜くか、聖別後を素とみなすか。
