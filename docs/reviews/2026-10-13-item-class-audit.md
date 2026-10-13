# 部位の種別とカレンシーの使い先の総点検 (2026-10-13)

きっかけ: 要望 2d38f482「タリスマンに勢力のお告げが付けられない」。骨の表 (`BONE_BY_CATEGORY`) にタリスマンが無く、防具 (肋骨) に落ちていた。
オーナー「新しい武器が出たらまた骨の設定しないといけないのは作りが違う。タグ精査、全部の装備とカレンシーを db と照らし合わせて作り替えないと」。

## 方針

- 部位の名前を手で並べない。**クライアントの表**から部位の種別・まとまりを作る (`scripts/build-item-classes-from-client.mjs` → `src/services/mods/item-classes.json`、判定は `src/services/mods/item-classes.ts`)。
- カレンシーの「何に使えるか」は**説明文の言葉**で引く (武器・マーシャル武器・防具・宝飾品・矢筒・ジュエル…)。言葉 → まとまりの対応だけ持つので、新しい武器はデータに入れば自動で「武器」になる。
- 食い違いは poe2db (オーナーの「DB」) で確かめる。

## クライアントの元の表

| 表 | 使う物 |
|---|---|
| BaseItemTypes の Id (置き場の道) | 種別: `Weapons/OneHandWeapons`・`Weapons/TwoHandWeapons` = 武器 (片手 / 両手)、`Armours` = 防具 (盾・バックラー・フォーカスも)、`Rings`・`Amulets`・`Belts` = 宝飾品、`Quivers`・`Jewels`・`Flasks` |
| CraftingItemClassCategories | Weapon / MartialWeapon / CasterWeapon / Shield (盾の仲間) / 部位ごと |
| ItemClasses | CanBeFractured / CanBeCorrupted / CanUpgradeRarity |
| EssenceTargetItemCategories | エッセンスの部位の区分 |
| SoulCoreStatCategories | ルーン・ソウルコアの部位の区分 |
| Chanceableitemclasses | 可能性のオーブが使える部位 |

クライアントには、まだ今のデータに無い武器 (爪・短剣・フレイル・片手斧・剣・罠の道具) も同じ形で入っている。

## エンジンの部位 → クライアントの部位 (自動、25 部位)

| エンジン | クライアント | 種別 | まとまり |
|---|---|---|---|
| Talismans | Talisman | 武器 (両手) | Weapon・MartialWeapon |
| Sceptres | Sceptre | 武器 (片手) | Weapon (CasterWeapon には入らない) |
| Wands / Staves | Wand / Staff | 武器 | Weapon・CasterWeapon |
| Bows / Crossbows / Spears / Quarterstaves / OneHand_Maces / TwoHand_Maces | … | 武器 | Weapon・MartialWeapon |
| Shields / Bucklers / Foci | Shield / Buckler / Focus | 防具 | Shield (盾の仲間) |
| Helmets / Body_Armours / Gloves / Boots | … | 防具 | 部位ごと |
| Rings / Amulets / Belts | … | 宝飾品 | 部位ごと |
| Quivers | Quiver | 矢筒 | Quiver |
| Jewels | Jewel | ジュエル | Jewel |
| LifeFlask / ManaFlask / SkillGem | … | フラスコ / ジェム | |

## カレンシーの使い先 (説明文 → まとまり)

| カレンシー | 説明文 (クライアント) | まとまり | 今の作り | 判定 |
|---|---|---|---|---|
| 噛み砕かれた / 保存された / 古代の顎骨 | Rare Weapon or Quiver | 武器・矢筒 | 手書きの表 (タリスマン無し → 直した) | 種別で引く |
| 肋骨 | Rare Armour | 防具 | 手書き | 種別で引く |
| 鎖骨 (変質も) | Rare Amulet, Ring or Belt | 宝飾品 | 手書き | 種別で引く |
| 保存された頭蓋骨 | Rare Jewel | ジュエル | 手書き | 種別で引く |
| 骨を棚に出す | (冒涜の MOD がある部位だけ) | | セプターでも出る | **直す**: セプターは冒涜の MOD が 0 (poe2db でも欄が無い) |
| 君主 / 臣従 / 黒血のお告げ (勢力) | Weapon or Jewellery Desecration | 武器・宝飾品 | 顎骨 / 鎖骨の部位 = 矢筒も可 | **矢筒も可で確定**: 説明文に矢筒は無いが、Craft of Exile (beta、data 4.5.5.3) は冒涜の手のお告げに部位の縛りが無く矢筒にも使える。矢筒の冒涜の MOD に 3 勢力の物もある (poe2db) |
| 鍛冶の砥石 | martial weapon | マーシャル武器 | 手書き (MARTIAL) | まとまりで引く |
| 秘術のエッチャー | wand, staff or sceptre | ワンド・スタッフ・セプター | 手書き (CASTER) | まとまりで引く |
| 防具職人のスクラップ | armour | 防具 | 手書き (ARMOUR) | 種別で引く |
| ガラス職人の玉 | flask | フラスコ | 手書き | 種別で引く |
| ヴァールの鍛冶 / 防具職人 / 秘術 / 触媒のインフューザー | Martial Weapon / Armour / wand, staff or sceptre / ring or amulet | 同上 | 手書き | まとまりで引く |
| 品質の上限 +10 (インフューザーで上がる分) | | | **キャスター・矢筒・ベルト・ジュエルが漏れ** | 直す |
| アーティフィサーのオーブ (ソケット) | Martial Weapon, wand, staff or Armour | マーシャル武器・ワンド・スタッフ・防具 | 武器・防具 (セプターも) | **セプターも可で確定**: 説明文にセプターは無いが、Craft of Exile はセプターのベースにソケット 1 があり「ソケットを付けられるベース」扱い |
| 触媒 (普通) | ring or amulet | 指輪・アミュレット | 指輪・アミュレット・**ジュエル** | **直す**: ジュエルは「精錬された触媒 (Refined …)」という別のカレンシー (poe2db: jewel_catalyst) |
| 精錬された触媒 | on a jewel | ジュエル | 無い | **足す** |
| ヤオマック / コペック / カマサ / ユグルの生贄 | Weapon or Quiver / Armour / Amulet, Ring or Belt / Jewel | 同上 | 手書き (ユグル無し) | まとまりで引く |
| 液化した感情 (古代も) | Basic Jewel / Time-Lost Jewel | ジュエル | ジュエル | そのまま |
| アルダーのルーン | Rare Weapon | 武器 | 手書き (WEAPONS にタリスマン無し) | 種別で引く |
| スルードの力 | Weapon | 武器 | 同上 | 種別で引く |
| 遺産のルーン | Body Armour / Shield / Quarterstaff / Wand / Staff / Bow | 部位ごと | 手書き | 部位で引く |
| 普通のルーン・ソウルコア | any Equipment (効果は部位ごと) | SoulCoreStatCategories | 手書き (CAT_TO_CLASSES) | 表で引く |
| エッセンス | (効果は部位ごと) | EssenceTargetItemCategories | 置き場 (pools.essence) | そのまま (データの置き場) |
| 可能性のオーブ | | Chanceableitemclasses | (棚から外した) | |

## 同時に見つかった不具合 (手書きの表の写しの食い違い)

1. 計算機でジュエルにソケットが 2 つ付く (`htc/sockets.ts` の socketCountFor にジュエルが無い)
2. 計算機の特別なルーン (スルード・アルダー) がタリスマンで出ない (`vendor/poe2htc/engine/runes.ts` の WEAPONS)
3. ワンド・スタッフ・セプターで品質の帯が出ない (`StageQualityBar.vue`)、インフューザーの +10 も数えていない (`apply-currency.ts` の INFUSABLE)
4. 触媒が使える部位の一覧が 3 か所で食い違う (ベルトで触媒の選び欄が出るのに弾かれる)
5. ジュエルで取引所の検索ができない (`buy-or-craft.ts` の TRADE_CATEGORY)
6. ジュエルの MOD のタグが引けない (`item-class-tags.ts` の ENGINE_CLASS)
7. PoB の部位にジュエル・フラスコ・チャームが無い、ベルトの枠が無い (`stage-pob.ts`・`engine-mods.ts`)

手書きの表は全部で約 40 か所 (洗い出しの一覧は作業の記録に)。全部 `item-classes.ts` に置き換える。

## 確かめ方 (テスト)

- 全部位 × 全カレンシー (骨・お告げ・品質・インフューザー・触媒・生贄・ルーン) の「打てる / 打てない」を表にして、上の「説明文 → まとまり」と一致するかをテストに残す。
- `item-classes.json` を作り直した時に、エンジンの部位が 1 つでもクライアントの部位に結び付かなければ落とす (新しい部位の入れ忘れを止める)。
