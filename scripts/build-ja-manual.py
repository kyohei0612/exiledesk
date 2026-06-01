#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build-ja-manual.py  (2026-06-01)
--------------------------------------------------------------
公式トレード/RePoE のどのソースにも JA が無いニッチMOD(0.5新メカ等)を、
**既存訳の公式用語辞書を基に**手動翻訳して補完する。

入力: data-cache/ja-todo.json (未訳行 {common_norm キー: EN原文})
出力: src/i18n/mod-text-ja-manual.json ({common_norm キー: JA})

翻訳方針: 既存 bundle 訳から採取した Tag→日本語 用語に揃える
  (アタック/投射物/貫通/連鎖/憤怒/呪印/状態異常/物理/冷気/雷/混沌… )。
  欠落タグは PoE2 標準訳 (Ward=ワード/ルーニックワード, Frozen=凍結, 上限, 消費 等)。
※ オーナー確認用。誤訳が見つかれば SRC を直して再生成。
"""
import json, os, re, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TODO = os.path.join(ROOT, "data-cache", "ja-todo.json")
OUT = os.path.join(ROOT, "src", "i18n", "mod-text-ja-manual.json")

# EN原文(ja-todo.json の untranslated 値, verbatim) -> 手動JA訳
SRC = {
 "+(0.3-0.4) metres to Dodge Roll distance": "ドッジロール距離 +(0.3-0.4)メートル",
 "+1 to [Limit] for [ElementalDamage|Elemental] Skills": "[ElementalDamage|元素]スキルの[Limit|上限] +1",
 "+(8-10) to Weapon Range": "武器の射程 +(8-10)",
 "10 uses remaining": "残り使用回数 10",
 "(20-50)% chance to Avoid being [Chill|Chilled]": "[Chill|冷却]状態を回避する確率(20-50)%",
 "(20-50)% chance to Avoid being [Ignite|Ignited]": "[Ignite|発火]状態を回避する確率(20-50)%",
 "(20-50)% chance to Avoid being [Shock|Shocked]": "[Shock|感電]状態を回避する確率(20-50)%",
 "(25-50)% chance to gain [NatureArchon|Nature's Archon] when your [Plant|Plants] Overgrow": "[Plant|プラント]が繁茂した時、[NatureArchon|ネイチャーアルコン]を得る確率(25-50)%",
 "(8-12)% chance to gain [Onslaught] for 4 seconds on Hit": "ヒット時、4秒間[Onslaught|猛攻]を得る確率(8-12)%",
 "(10-30)% chance to gain a [Charges|Power Charge] when you [Stun]": "[Stun|スタン]させた時、[Charges|パワーチャージ]を得る確率(10-30)%",
 "(15-25)% chance when collecting an [ElementalInfusion|Elemental Infusion] to gain an": "[ElementalInfusion|エレメンタルインフュージョン]を獲得した時、(15-25)%の確率で追加で",
 "(13-17)% increased [Attack] Speed if you haven't been [HitDamage|Hit] [Recently]": "[Recently|直近]に[HitDamage|ヒット]を受けていない場合、[Attack|アタック]スピードが(13-17)%増加する",
 "(17-23)% increased [Attack] Speed when on Full Life": "ライフが満タンの時、[Attack|アタック]スピードが(17-23)%増加する",
 "(10-15)% increased [Attack] Speed while missing [Ward|Runic Ward]": "[Ward|ルーニックワード]が欠けている間、[Attack|アタック]スピードが(10-15)%増加する",
 "(20-35)% increased Damage for each [Poison] on you up to a maximum of 75%": "自分にかかっている[Poison|毒]1つ毎にダメージが(20-35)%増加する(最大75%)",
 "(10-19)% increased Damage with [HitDamage|Hits] against [Mark|Marked] Enemy": "[Mark|呪印]を付けた敵に対する[HitDamage|ヒット]ダメージが(10-19)%増加する",
 "(10-20)% increased Damage with Hits per [Curse] on Enemy": "敵にかかっている[Curse|呪い]1つ毎にヒットダメージが(10-20)%増加する",
 "(7-9)% increased [Dexterity] and [Intelligence]": "[Dexterity|器用さ]と[Intelligence|知性]が(7-9)%増加する",
 "(10-22)% increased Duration of [Ailments|Ailments] on Enemies": "敵にかかる[Ailments|状態異常]の持続時間が(10-22)%増加する",
 "(15-35)% increased [Evasion] while Leeching": "リーチ中、[Evasion|回避力]が(15-35)%増加する",
 "(15-20)% increased Explicit Chaos Modifier magnitudes": "[Chaos|混沌]系の明示MODの強度が(15-20)%増加する",
 "(15-20)% increased Explicit Cold Modifier magnitudes": "[Cold|冷気]系の明示MODの強度が(15-20)%増加する",
 "(20-30)% increased Explicit Critical Modifier magnitudes": "クリティカル系の明示MODの強度が(20-30)%増加する",
 "(25-30)% increased Explicit Mana Modifier magnitudes": "マナ系の明示MODの強度が(25-30)%増加する",
 "(25-30)% increased Explicit Speed Modifier magnitudes": "速度系の明示MODの強度が(25-30)%増加する",
 "(35-49)% increased Minion Duration": "[Minion|ミニオン]の持続時間が(35-49)%増加する",
 "(17-25)% increased Movement Speed for each [Poison] on you up to a maximum of 50%": "自分にかかっている[Poison|毒]1つ毎に移動速度が(17-25)%増加する(最大50%)",
 "(1-2)% increased [Projectile|Projectile] Damage per [Charges|Power Charge]": "[Charges|パワーチャージ]1つ毎に[Projectile|投射物]ダメージが(1-2)%増加する",
 "(6-10)% increased [Reservation] [Efficiency] of Skills": "スキルの[Reservation|リザーブ][Efficiency|効率]が(6-10)%増加する",
 "(7-9)% increased [Strength] and [Dexterity]": "[Strength|筋力]と[Dexterity|器用さ]が(7-9)%増加する",
 "(7-9)% increased [Strength] and [Intelligence]": "[Strength|筋力]と[Intelligence|知性]が(7-9)%増加する",
 "5% less damage taken while on [LowLife|Low Life]": "[LowLife|低ライフ]の間、受けるダメージが5%減少する",
 "(10-11)% more [Attack|Attack] damage while on [LowMana|Low Mana]": "[LowMana|低マナ]の間、[Attack|アタック]ダメージが(10-11)%増加する",
 "(7-8)% more Global [Evasion] Rating and [EnergyShield|Energy Shield]": "全体の[Evasion|回避力]と[EnergyShield|エナジーシールド]が(7-8)%増加する",
 "(50-5)% reduced Duration of [Ailments|Ailments] on You": "自分にかかる[Ailments|状態異常]の持続時間が(50-5)%減少する",
 "(40-15)% reduced Mana Cost of [Attack|Attacks]": "[Attack|アタック]のマナコストが(40-15)%減少する",
 "(60-10)% reduced [Poison|Poison] Duration on you": "自分にかかる[Poison|毒]の持続時間が(60-10)%減少する",
 "(30-15)% reduced [Slow|Slowing] Potency of [Debuff|Debuffs] on You": "自分にかかる[Debuff|デバフ]の[Slow|減速]効果が(30-15)%減少する",
 "+(12-23)% to [Resistances|Chaos Resistance] per [Poison] on you": "自分にかかっている[Poison|毒]1つ毎に[Resistances|混沌耐性] +(12-23)%",
 "[ContainsAbyss|Abyss] Pits in Area always have Rewards": "エリア内の[ContainsAbyss|アビス]の穴は常に報酬を持つ",
 "Adds [ContainsIncursion|Vaal Beacons] to a Map": "マップに[ContainsIncursion|ヴァールビーコン]を追加する",
 "[Attack] [HitDamage|Hits] [Aggravate] any [Bleeding] on targets which is older than (3-4) seconds": "[Attack|アタック]の[HitDamage|ヒット]は、対象にかかっている(3-4)秒より古い[Bleeding|出血]を[Aggravate|悪化]させる",
 "[Attack] Skills have Added Lightning Damage equal to (1-5)% of maximum Mana": "[Attack|アタック]スキルは最大マナの(1-5)%に等しい[Lightning|雷]ダメージを追加する",
 "[Attack|Attacks] [Chain] 2 additional times": "[Attack|アタック]は追加で2回[Chain|連鎖]する",
 "[Attack|Attacks] [Gain] 10% of Damage as Extra [Lightning|Lightning] Damage": "[Attack|アタック]はダメージの10%を追加[Lightning|雷]ダメージとして得る",
 "[Attack|Attacks] [Gain] 10% of Damage as Extra [Physical] Damage": "[Attack|アタック]はダメージの10%を追加[Physical|物理]ダメージとして得る",
 "[Attack|Attacks] have added [Chaos] damage equal to (1-3)% of maximum Life": "[Attack|アタック]は最大ライフの(1-3)%に等しい[Chaos|混沌]ダメージを追加する",
 "[Attack|Attacks] with this Weapon Penetrate (15-25)% Chaos Resistance": "この武器での[Attack|アタック]は混沌耐性を(15-25)%貫通する",
 "[Burning] Enemies you kill have a (10-30)% chance to Explode, dealing a": "倒した[Burning|燃焼]状態の敵は(10-30)%の確率で爆発し、",
 "Chance to [Poison] is calculated from your base chance to inflict [Bleeding] instead": "[Poison|毒]を与える確率は、代わりに[Bleeding|出血]を与える基礎確率から計算される",
 "Chance to inflict [Bleeding] is calculated from your base chance to [Poison] instead": "[Bleeding|出血]を与える確率は、代わりに[Poison|毒]を与える基礎確率から計算される",
 "[Charm|Charms] gain (0.13-0.27) charges per Second": "[Charm|チャーム]は毎秒(0.13-0.27)チャージを得る",
 "[Cold] and [Fire] Damage in Radius are transformed to apply to [Lightning] Damage": "範囲内の[Cold|冷気]と[Fire|火]ダメージは[Lightning|雷]ダメージに変換される",
 "[Cold] and [Lightning] Damage in Radius are transformed to apply to [Fire] Damage": "範囲内の[Cold|冷気]と[Lightning|雷]ダメージは[Fire|火]ダメージに変換される",
 "Damage with Weapons [Penetration|Penetrates] (5-9)% [Resistances|Chaos Resistance]": "武器によるダメージは[Resistances|混沌耐性]を(5-9)%[Penetration|貫通]する",
 "Enemies killed by your [HitDamage|Hits] are destroyed": "自分の[HitDamage|ヒット]で倒した敵は破壊される",
 "Enemies take (5-10)% increased Damage for each [ElementalAilments|Elemental Ailment] type among": "敵が受けるダメージは、対象にかかっている[ElementalAilments|元素状態異常]の種類1つ毎に(5-10)%増加する",
 "Enemies you kill have a (10-30)% chance to explode, dealing a tenth of their maximum Life as [Physical] damage": "倒した敵は(10-30)%の確率で爆発し、最大ライフの10分の1を[Physical|物理]ダメージとして与える",
 "[Fire] and [Lightning] Damage in Radius are transformed to apply to [Cold] Damage": "範囲内の[Fire|火]と[Lightning|雷]ダメージは[Cold|冷気]ダメージに変換される",
 "Gain (1-10) Life per [Curse|Cursed] Enemy Hit with [Attack|Attacks]": "[Attack|アタック]で[Curse|呪い]状態の敵をヒットする毎にライフを(1-10)獲得する",
 "Gain (4-6) Life per Enemy Hit with [Attack|Attacks] if you have dealt a [Critical|Critical Hit] [Recently]": "[Recently|直近]に[Critical|クリティカルヒット]を与えている場合、[Attack|アタック]で敵をヒットする毎にライフを(4-6)獲得する",
 "Gain (1-10) Mana per [Curse|Cursed] Enemy Hit with [Attack|Attacks]": "[Attack|アタック]で[Curse|呪い]状態の敵をヒットする毎にマナを(1-10)獲得する",
 "Gain (42-52)% of Damage as Extra [Chaos] Damage while you are missing [Ward|Runic Ward]": "[Ward|ルーニックワード]が欠けている間、ダメージの(42-52)%を追加[Chaos|混沌]ダメージとして得る",
 "Gain (42-52)% of Damage as Extra [Cold] Damage while you are missing [Ward|Runic Ward]": "[Ward|ルーニックワード]が欠けている間、ダメージの(42-52)%を追加[Cold|冷気]ダメージとして得る",
 "Gain (42-52)% of Damage as Extra [Lightning] Damage while you are missing [Ward|Runic Ward]": "[Ward|ルーニックワード]が欠けている間、ダメージの(42-52)%を追加[Lightning|雷]ダメージとして得る",
 "[Gain] (11-15)% of [Physical] Damage as Extra [Cold] Damage against [Daze|Dazed] Enemies": "[Daze|眩暈]状態の敵に対し、[Physical|物理]ダメージの(11-15)%を追加[Cold|冷気]ダメージとして得る",
 "Gain 1% of [Physical] Damage as Extra [Fire] Damage per [Rage]": "[Rage|憤怒]1つ毎に[Physical|物理]ダメージの1%を追加[Fire|火]ダメージとして得る",
 "[Grenade] Skills Fire 2 additional [Projectile|Projectiles]": "[Grenade|グレネード]スキルは追加で2個の[Projectile|投射物]を放つ",
 "[Grenade] Skills have +2 Cooldown Uses": "[Grenade|グレネード]スキルのクールダウン使用回数 +2",
 "Has +3 to [Evasion] Rating per player level": "プレイヤーレベル毎に[Evasion|回避力] +3",
 "Has +1 to maximum [EnergyShield|Energy Shield] per player level": "プレイヤーレベル毎に最大[EnergyShield|エナジーシールド] +1",
 "Has +1 to maximum [Ward|Runic Ward] per player level": "プレイヤーレベル毎に最大[Ward|ルーニックワード] +1",
 "Increases and Reductions to": "～への増加と減少",
 "Inherent [Rage|Rage] loss starts (1-2) seconds later": "[Rage|憤怒]の自然減少が(1-2)秒遅れて始まる",
 "[LifeLeech|Leech] Life (25-15)% slower": "ライフ[LifeLeech|リーチ]が(25-15)%遅くなる",
 "[ManaLeech|Leech] Mana (25-20)% slower": "マナ[ManaLeech|リーチ]が(25-20)%遅くなる",
 "[LifeLeech|Life Leech] effects are not removed when [Reservation|Unreserved] Life is Filled": "[Reservation|非リザーブ]ライフが満タンになっても[LifeLeech|ライフリーチ]効果が除去されない",
 "[Melee] [Attack|Attacks] fire 2 additional [Projectile|Projectiles]": "[Melee|近接][Attack|アタック]は追加で2個の[Projectile|投射物]を放つ",
 "[Melee] [Attack|Attacks] fire an additional [Projectile]": "[Melee|近接][Attack|アタック]は追加で1個の[Projectile|投射物]を放つ",
 "Non-Channelling Skills Cost -(8-3) Mana": "非チャネリングスキルのマナコスト -(8-3)",
 "[Poison] you inflict is Reflected to you": "自分が与えた[Poison|毒]が自分に反射される",
 "[Projectile|Projectiles] [Pierce] 2 additional Targets": "[Projectile|投射物]は追加で2体の対象を[Pierce|貫通]する",
 "[Projectile|Projectiles] [Pierce] an additional Target": "[Projectile|投射物]は追加で1体の対象を[Pierce|貫通]する",
 "[Projectile|Projectiles] have (15-20)% chance to [Shock]": "[Projectile|投射物]は(15-20)%の確率で[Shock|感電]させる",
 "Recover (2-3)% of maximum Life when you use a Warcry": "[Warcry|ウォークライ]を使用した時、最大ライフの(2-3)%を回復する",
 "Regenerate (5-15)% of maximum Life per second while [Frozen|Frozen]": "[Frozen|凍結]している間、毎秒最大ライフの(5-15)%を自動回復する",
 "Tempest Bells are destroyed after an additional (4-5) [HitDamage|Hits]": "テンペストベルは追加で(4-5)回[HitDamage|ヒット]した後に破壊される",
 "When your [Mark|Marks] are [Consume|Consumed], they have (10-19)% chance to Mark another Enemy within 3 metres": "[Mark|呪印]が[Consume|消費]された時、(10-19)%の確率で3メートル以内の別の敵に呪印を付ける",
 "You can apply an additional [Curse]": "追加で1つの[Curse|呪い]をかけられる",
 "additional [ElementalInfusion|Elemental Infusion] of the same type": "同じ種類の[ElementalInfusion|エレメンタルインフュージョン]を追加で得る",
 "tenth of their maximum Life as [Fire] Damage": "最大ライフの10分の1を[Fire|火]ダメージとして",
 "your Ailments on them": "自分の状態異常を敵に",
 "Inflict [Anaemia] on [HitDamage|Hit]": "[HitDamage|ヒット]時に[Anaemia|貧血]を与える",
 "[Anaemia] allows +(2-3) [CorruptedBlood|Corrupted Blood] debuffs to be inflicted on enemies": "[Anaemia|貧血]により、敵に追加で+(2-3)個の[CorruptedBlood|汚染された血]デバフを与えられる",
}

def common_norm(t):
    t = re.sub(r"\[([^\]|]+)\|([^\]]+)\]", r"\2", t)
    t = re.sub(r"\[([^\]]+)\]", r"\1", t)
    t = t.replace("—", "-").replace("–", "-")
    t = re.sub(r"\((?:\+|-)?\d+(?:\.\d+)?\s*-\s*(?:\+|-)?\d+(?:\.\d+)?\)", "#", t)
    t = re.sub(r"\((?:\+|-)?\d+(?:\.\d+)?\)", "#", t)
    t = re.sub(r"(?<![\w#])[-+]?\d+(?:\.\d+)?", "#", t)
    t = re.sub(r"#(\s*-\s*#)+", "#", t)
    t = re.sub(r"\+#", "#", t)
    return re.sub(r"\s+", " ", t).strip()

def main():
    # common_norm(EN) をキーに自前生成 (ja-todo.json 非依存)。
    out = {}
    for en, ja in SRC.items():
        k = common_norm(en)
        if k:
            out[k] = ja
    print(f"SRC訳: {len(SRC)} / 出力キー(common_norm): {len(out)}")
    ordered = {k: out[k] for k in sorted(out)}
    json.dump(ordered, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    open(OUT, "a", encoding="utf-8").write("\n")
    print(f"WROTE {OUT} ({len(ordered)} entries)")

if __name__ == "__main__":
    main()
