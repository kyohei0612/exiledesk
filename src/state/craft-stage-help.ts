/**
 * craft-stage-help.ts — クラフトステージの棚の詳細カードに出す「ステージでの動き」(2026-09-28、ADR-001)
 *
 * オーナー:「ステージでのカレンシー詳細カードは文字だけでいいから、どんな挙動するオーブやお告げなのか細かく書いてくれ。今簡易的だから」。
 * ゲームの公式の説明文 (currency-hover-ja.json、クライアント原本) とは別に、このステージ (= 計算機と同じ規則) で
 * **実際にどう動くか**を書く。規則の本体は services/craft-stage/apply-*.ts。ここを変えたら向こうも見る。
 */
import { GNAWED_MAX_ILVL } from "../services/craft-stage/apply-currency";
import { essenceTarget } from "../services/craft-stage/apply-essence";
import { essenceLevelOf } from "../vendor/poe2htc/optimizer/cost";
import { isRune, runeEffectFor, runeNameOf, runeOf, socketCapOf } from "../services/craft-stage/stage-runes";
import { ruleLines } from "../services/augment-rules";
import { maxQualityOf } from "../services/craft-stage/stage-core";
import { desecrationBoneFor } from "../vendor/poe2htc/engine/probability";
import { skillQualityOf } from "../services/craft-stage/skill-quality";
import { isShard, JEWELLER_TO, QUALITY_MAX, QUALITY_STEP, QUALITY_TARGET, SHARD_TO_ORB, SHARDS_PER_ORB } from "../services/craft-stage/apply-act";
import { CURRENCY_FLOOR, type PatchData } from "../vendor/poe2htc/engine/types";
import type { StageItem } from "../services/craft-stage/types";
import { lang, tr } from "../i18n/lang";
import { emotionNameOf, isEmotion } from "../services/craft-stage/apply-emotion";
import { jewelEmotionsOf } from "../services/htc/patch";
import { EXTRA_HELP, EXTRA_HELP_EN, OMEN, OMEN_EN } from "./craft-stage-help-text";
import { specialEssence } from "./craft-stage-help-mods";
export { shelfTag, shortMod, specialEssence, stageAdds } from "./craft-stage-help-mods";

/** 英語の画面か (2026-10-10 英語版) */
const isEn = (): boolean => lang.value === "en";
/** ゲームの書式記号 ([Projectile|投射物] → 投射物) を外す */
const plainGame = (x: string): string => x.replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]]+)\]/g, "$1");

const FLOOR = (kind: "transmute" | "regal", s: string): string => {
  const f = CURRENCY_FLOOR[kind];
  if (isEn()) {
    const tailEn = "(groups without such a tier use their top tier; can't be used below that Item Level)";
    return s === "greater" ? `Greater: only tiers with mod level ${f.greater}+ ${tailEn}` : s === "perfect" ? `Perfect: only tiers with mod level ${f.perfect}+ ${tailEn}` : "";
  }
  const tail = "(上の段が無い系統は一番上の段。アイテムレベルが下限未満の品には使えない)";
  return s === "greater" ? `上級: 付く MOD は MOD レベル ${f.greater} 以上のティアだけ ${tail}` : s === "perfect" ? `完全: 付く MOD は MOD レベル ${f.perfect} 以上のティアだけ ${tail}` : "";
};
/** カオスの上級 / 完全の下限 (足す MOD の MOD レベル。説明の行と同じ数) */
const CHAOS_FLOOR = { greater: 35, perfect: 50 } as const;
/**
 * 上級・完全のカレンシーで付く MOD の MOD レベルの下限 (それ以外は null)。カードの頭に大きく出す
 * (2026-10-16 要望 9c8a5f99「付く下限の MOD レベルが小さく表示してるから一番最初の説明文に大きく分かりやすく。上級・完全とつくやつ全て」)
 */
export function stageFloor(key: string): number | null {
  const s = strengthOf(key);
  if (s !== "greater" && s !== "perfect") return null;
  const kind = key.replace(/_(greater|perfect)$/, "");
  if (kind === "chaos") return CHAOS_FLOOR[s];
  const k = kind === "augment" ? "augment" : kind === "transmute" ? "transmute" : kind === "regal" ? "regal" : kind === "exalt" ? "exalt" : null;
  return k ? CURRENCY_FLOOR[k][s] : null;
}
const strengthOf = (key: string): string => (key.endsWith("_greater") ? "greater" : key.endsWith("_perfect") ? "perfect" : "base");
const ADD = "付く MOD は、その側の普通の MOD の置き場から、付いている系統を除き、アイテムレベル以下のティアの重みで引く";
const add = (): string => tr(ADD, "New mods are rolled by weight from that side's normal mod pool, excluding groups already on the item and tiers above the Item Level");

export function stageHelp(key: string, data: PatchData | null, item: StageItem | null): string[] {
  const sp = specialEssence(key, item);
  return [...(sp?.notes ?? []), ...stageHelpBase(key, data, item)];
}

function stageHelpBase(key: string, data: PatchData | null, item: StageItem | null): string[] {
  // 液化した感情 (ジュエル。2026-10-12 要望 1b901ac5「マウスオーバーで効果を表示」)。決まりは apply-emotion.ts の頭の注
  if (isEmotion(key)) {
    const two = !!item && jewelEmotionsOf(item.cls.id).filter((e) => e.item === emotionNameOf(key)).length > 1;
    return [
      tr("**レアのジュエル**にだけ使える。固定 (フラクチャー) 以外から**ランダムに 1 つ消して**、決まった作った MOD を付ける", "**Rare jewels** only. **Removes a random mod** (not fractured) and adds a fixed crafted mod"),
      two ? tr("付くのは**プレフィックスの版かサフィックスの版のどちらか** (消した後に付けられる側から等しく。説明文に決め方が無いのでランダム)", "Adds **either the prefix or the suffix version** (equally among the sides with room after the removal; the text doesn't say, so it's random)") : "",
      tr("**作った MOD が付いている間は使えない** (前の感情の MOD を外してから)。MOD が 4 つ揃っていなくても使える", "**Can't be used while a crafted mod is on the jewel** (remove the previous one first). Works with fewer than 4 mods"),
      tr("上限を超えている側 (軽蔑を外した後の 3 つ目) が消える候補に当たると**弾かれる** (何も変わらない、もう一度)", "If it hits the side that is over its limit (after removing Contempt), it is **rejected** (no change, try again)"),
      tr("古代の版は時を失ったジュエル用", "Ancient versions are for Time-Lost Jewels"),
    ].filter(Boolean);
  }
  // 発現 (チュートリアルの選択肢の絵。2026-10-16 初心者の目での点検: 発現にだけカードが無かった)
  if (key === "reveal") {
    return [
      tr("骨 (冒涜) で付いた**未発現の MOD** を見て、候補 **3 つから 1 つ選ぶ** (カレンシーは要らない)", "Look at the **Unrevealed mod** from a Bone (Desecration) and **pick 1 of 3** options (no currency needed)"),
      tr("候補は勢力のお告げを掛けていればその勢力の MOD だけ。アビスの反響のお告げを掛けると、3 つを 1 回だけ引き直せる", "With a faction Omen the options are that faction's mods only. Omen of Abyssal Echoes lets you reroll the 3 once"),
    ];
  }
  if (OMEN[key]) return [...((isEn() ? OMEN_EN[key] : null) ?? OMEN[key]!), tr("押すと掛けておく (何枚でも)。次に打つ、関係する手でだけ使われる", "Click to apply (stackable). Only consumed by the next currency it affects")];
  const s = strengthOf(key);
  const kind = key.replace(/_(greater|perfect)$/, "");
  switch (kind) {
    case "transmute":
      return [tr("**ノーマル → マジック** にして MOD を 1 つ付ける", "**Normal → Magic**, adds 1 mod"), add(), FLOOR("transmute", s)].filter(Boolean);
    case "augment":
      return [tr("**マジック** で MOD が 1 つの時、空いている側に 1 つ足す (マジックはプレフィックス 1 / サフィックス 1 まで)", "On a **Magic** item with 1 mod, adds 1 mod to the open side (Magic: 1 prefix / 1 suffix)"), add(), FLOOR("transmute", s)].filter(Boolean);
    case "regal":
      return [tr("**マジック → レア** にして MOD を 1 つ足す (付いている MOD は残る)", "**Magic → Rare**, adds 1 mod (existing mods stay)"), add(), FLOOR("regal", s)].filter(Boolean);
    case "alchemy":
      return [tr("**ノーマルかマジック → レア** にして MOD を **4 つ** 付ける (マジックの MOD は付け直し)", "**Normal or Magic → Rare** with **4 mods** (Magic mods are rerolled)"), add()];
    case "exalt":
      return [tr("**レア** に MOD を 1 つ足す (プレフィックス・サフィックス合わせて空きがある時)", "Adds 1 mod to a **Rare** (needs an open prefix or suffix)"), add(), FLOOR("regal", s), tr("お告げ: 左右の高貴 (足す側) / 偉大なる高貴 (2 つ) / 触媒の高貴 (品質の種類を重く)", "Omens: Sinistral / Dextral Exaltation (side) / Greater Exaltation (2 mods) / Catalysing Exaltation (weights the quality type)")].filter(Boolean);
    case "chaos":
      return [
        tr("**レア** の MOD を 1 つ消して、1 つ足す", "Removes 1 mod from a **Rare** and adds 1"),
        tr("消すのはフラクチャー (固定) 以外から等しく 1 つ", "The removed mod is picked equally from non-Fractured mods"),
        add(),
        s === "greater" ? tr(`上級: 足す MOD は MOD レベル ${CHAOS_FLOOR.greater} 以上のティアだけ`, `Greater: added mod only from tiers with mod level ${CHAOS_FLOOR.greater}+`) : s === "perfect" ? tr(`完全: 足す MOD は MOD レベル ${CHAOS_FLOOR.perfect} 以上のティアだけ`, `Perfect: added mod only from tiers with mod level ${CHAOS_FLOOR.perfect}+`) : "",
        tr("お告げ: 削減 (一番低い MOD を消す) / 左右の抹消 (消す側)", "Omens: Whittling (removes the lowest mod) / Sinistral / Dextral Erasure (side)"),
      ].filter(Boolean);
    case "annul":
      return [tr("**マジックかレア** の MOD を 1 つ消す (フラクチャー以外から等しく)", "Removes 1 mod from a **Magic or Rare** item (equally among non-Fractured mods)"), tr("お告げ: 左右の消去 (消す側) / 光 (冒涜の MOD だけ)", "Omens: Sinistral / Dextral Annulment (side) / Light (Desecrated mod only)")];
    case "divine":
      return [tr("フラクチャー以外の MOD の **数値だけ** を、そのティアの範囲の中で振り直す (ティアは変わらない)", "Rerolls **only the values** of non-Fractured mods within their tier range (tiers don't change)"), tr("お告げ: 聖別 (0.78〜1.22 倍にして聖別。以後手を加えられない) / 祝福 (暗黙 MOD だけ振り直す)", "Omens: Sanctification (x0.78-1.22 and sanctified; no further changes) / the Blessed (rerolls implicits only)")];
    case "fracture":
      return [tr("**レア** で MOD が **4 つ以上**、まだフラクチャーが無い時", "On a **Rare** with **4+ mods** and no Fractured mod yet"), tr("MOD を 1 つ **固定 (フラクチャー)** する。どれになるかは等しく (冒涜の MOD は発現済みでも選ばれない。4 つの数には入る)", "**Fractures** 1 random mod (equal chance; Desecrated mods are never picked, revealed or not, but count toward the 4)"), tr("フラクチャーした MOD は、カオス・消去・エッセンスでも消えない", "Fractured mods can't be removed by Chaos, Annulment or Essences")];
    case "artificer": {
      const n = item ? socketCapOf(item.base, item.cls.category) : 1;
      return [tr("マーシャル武器・ワンド・スタッフ・防具に **ソケットを 1 つ** 足す", "Adds **1 socket** to Martial Weapons, Wands, Staves and Armour"), n ? tr(`このベースは ${n} つまで (胴・両手武器 2 / ほか 1。コラプトで +1)`, `Up to ${n} on this base (Body Armour / Two Handed Weapon 2, others 1; +1 via corruption)`) : tr("このベース (アクセサリー・矢筒・フラスコ) には付けられない", "Can't be added to this base (jewellery, quivers, flasks)")];
    }
    case "desecrate":
    case "desecrate_ancient":
    case "desecrate_altered":
    case "desecrate_gnawed": {
      const bone = item ? { jawbone: "顎の骨 (武器・矢筒)", rib: "肋骨 (防具)", collarbone: "鎖骨 (アクセサリー)", cranium: "頭蓋骨 (ジュエル)" }[desecrationBoneFor(item.cls.category)] : "";
      if (isEn()) {
        const boneEn = item ? { jawbone: "Jawbone (weapons, quivers)", rib: "Rib (armour)", collarbone: "Collarbone (jewellery)", cranium: "Cranium (jewels)" }[desecrationBoneFor(item.cls.category)] : "";
        return [
          "Adds 1 **Unrevealed Desecrated mod** to a **Rare** (only 1 Desecrated mod per item)",
          "The side is decided by the total weight of possible mods on each side. If both sides are full, it replaces a mod on that side",
          "On reveal you **pick 1 of 3 options**. Desecrated-only mods: 1 option 85% / 2 options 14% / 3 options 1% (always at least 1); the rest are normal mods by weight (no duplicate groups)",
          key === "desecrate_ancient" ? "Ancient Jawbone / Rib / Collarbone: options only from tiers with mod level 40+" : "",
          key === "desecrate_gnawed" ? `Gnawed Jawbone / Rib / Collarbone: only for **Item Level ${GNAWED_MAX_ILVL} or lower** (game data). Same options as Preserved ones` : "",
          key === "desecrate_altered" ? "Altered Collarbone: options also include **Otherworldly mods** (jewellery only)" : "",
          boneEn ? `Abyssal Bone used for this base: ${boneEn}` : "",
          "Omens: Sinistral / Dextral Necromancy (side) / Sovereign, Liege, Blackblooded (faction) / Putrefaction (works alone: replaces all mods with up to 6 Unrevealed Desecrated mods and corrupts; other Omens stay unused) / Abyssal Echoes (reroll the reveal)",
        ].filter(Boolean);
      }
      return [
        "**レア** に **未発現の冒涜 MOD** を 1 つ付ける (冒涜の MOD はアイテムに 1 つまで)",
        "付く側は、その側で出うる MOD の重みの合計で決まる。両側が埋まっていれば、その側の MOD を 1 つ差し替える",
        "発現で **候補 3 つから 1 つ選ぶ**。冒涜専用の MOD は 1 個 85% / 2 個 14% / 3 個 1% (必ず 1 個は入る)、残りは普通の MOD から重みで (系統の被りなし)",
        key === "desecrate_ancient" ? "古びた骨: 候補は MOD レベル 40 以上のティアだけ" : "",
        key === "desecrate_gnawed" ? `噛み切られた骨: **アイテムレベル ${GNAWED_MAX_ILVL} 以下** にだけ使える (クライアントの表)。候補は保存された骨と同じ` : "",
        key === "desecrate_altered" ? "変質した鎖骨: 候補に **異界の MOD** も入る (アクセサリーだけ)" : "",
        bone ? `このベースで使う骨: ${bone}` : "",
        "お告げ: 左右のネクロマンシー (側) / 支配者・君主・ブラックブラッド (勢力で絞る) / 腐食 (単体で効く: 全部の MOD を未発現の冒涜 MOD 最大 6 個に置き換えてコラプト。一緒に掛けた他のお告げは使わずに残る) / アビスの反響 (発現の引き直し)",
      ].filter(Boolean);
    }
  }
  // アクト中に落ちる物 (2026-09-28、要望 ⑧。出典は apply-act.ts)
  if (key in QUALITY_TARGET) {
    const t = QUALITY_TARGET[key]!;
    const st = QUALITY_STEP;
    // 彫刻針: 今のワンド・スタッフのスキルが品質 20% で何を得るか (skill-quality.ts、2026-10-17)
    const sq = key === "etcher" && item ? skillQualityOf(item.base, item.cls.category, QUALITY_MAX).map((x) => `**${x.name}**: ${x.lines.map(plainGame).join(" / ")}`) : [];
    if (isEn()) {
      return [
        `Raises the quality of **${t.en}** (max ${QUALITY_MAX}%)${key === "etcher" ? ". For wands, staves and sceptres (Blacksmith's Whetstone is for martial weapons)" : ""}${key === "whetstone" ? ". Martial weapons = bows, crossbows, maces, quarterstaves, spears, talismans (not wands, sceptres or staves)" : ""}`,
        key === "gemcutter" || key === "bauble" ? `+${key === "gemcutter" ? st.gem : st.item}% per use (any rarity; checked in game)` : "**+1% or +2%** per use (random, even odds)",
        key === "whetstone" ? "Each 1% quality gives 1% more Physical Damage (Quality on poe2db)" : key === "scrap" ? "Each 1% quality gives 1% more Armour / Evasion / Energy Shield" : key === "bauble" ? "Each 1% quality gives 1% more Life / Mana recovery" : key === "etcher" ? "Quality boosts the weapon's granted skill (the bonus differs per skill), not its mods" : "Quality effects differ per gem",
        ...sq.map((l) => `At ${QUALITY_MAX}% quality: ${l}`),
      ];
    }
    return [
      `**${t.ja}** の品質を上げる (上限 ${QUALITY_MAX}%)${key === "etcher" ? "。ワンド・スタッフ・セプター用 (砥石はマーシャル武器用)" : ""}${key === "whetstone" ? "。マーシャル武器 = 弓・クロスボウ・メイス・クォータースタッフ・槍・タリスマン (ワンド・セプター・スタッフは不可)" : ""}`,
      key === "gemcutter" || key === "bauble" ? `1 回で +${key === "gemcutter" ? st.gem : st.item}% (レアリティに関係なし。ゲームで確認)` : "1 回で **+1% か +2%** (ランダム、半々)",
      key === "whetstone" ? "品質 1% ごとに物理ダメージが 1% 増える (poe2db の Quality)" : key === "scrap" ? "品質 1% ごとにアーマー・回避力・エナジーシールドが 1% 増える" : key === "bauble" ? "品質 1% ごとにライフ・マナの回復量が 1% 増える" : key === "etcher" ? "品質は武器に付いているスキルを強くする (上がる物はスキルごとに違う)。MOD には効かない" : "品質の効果はジェムごとに違う",
      ...sq.map((l) => `品質 ${QUALITY_MAX}% で ${l}`),
    ];
  }
  // 2026-09-29 に足した物 (apply-extra.ts)。確率は公開されていないので仮
  const extra = (isEn() ? EXTRA_HELP_EN[key] : null) ?? EXTRA_HELP[key];
  if (extra) return extra;
  if (key === "wisdom") return [tr("**未鑑定** のアイテムを鑑定する (隠れていた MOD が見える)", "Identifies an **unidentified** item (reveals its mods)"), tr("未鑑定のアイテムには、ほかのカレンシーは打てない", "Other currency can't be used on unidentified items")];
  if (JEWELLER_TO[key]) {
    const n = JEWELLER_TO[key];
    if (isEn()) return [`Sets a **Skill Gem** to have **${n} Support Gem Sockets** (all at once)`, `Only for gems with fewer than ${n} Support Gem Sockets`, "Can't be used on equipment"];
    return [`**スキルジェム** のサポート枠を **${n} つ** にする (1 つずつではなく一気に)`, `サポート枠が ${n} つ未満のジェムにだけ使える`, "装備には使えない"];
  }
  // ルーン・ソウルコア等 (2026-10-03): 決まり (部位・外せるか・置き換えられるか・数) は説明文から作った表 (augment-rules.ts) のまま
  if (isRune(key)) {
    const eff = item ? runeEffectFor(runeOf(key)!, item.cls.category) : null;
    return [
      ...(eff ? [] : item ? [tr("この部位には効き目が無い", "No effect on this item class")] : []),
      ...ruleLines(runeNameOf(key)),
      // アストリッドの「クラフトモッド」が何か (2026-10-16 初心者の目での点検: エッセンスが 2 つになると分からなかった)
      ...(/Astrid/.test(runeNameOf(key)) ? [tr("クラフトモッド = **エッセンス・合金・深淵の印**などで付く MOD。普通は 1 つまでで、はめると **2 つ** 持てる", "Crafted mods = mods from **Essences, Alloys, the Abyssal Mark** and so on. Normally 1; with this rune you can have **2**")] : []),
      tr("空きソケットが無い時は、はまっている物と置き換える (ソケットの絵を押すとそのソケット、アイテムを押すと左から最初の置き換えられる物)", "With no empty socket it replaces a socketed one (click a socket to target it, or the item for the first replaceable one from the left)"),
    ];
  }
  if (isShard(key) && isEn()) return [`**${SHARDS_PER_ORB} shards** make 1 ${SHARD_TO_ORB[key] === "transmute" ? "Orb of Transmutation" : SHARD_TO_ORB[key] === "regal" ? "Regal Orb" : SHARD_TO_ORB[key] === "artificer" ? "Artificer's Orb" : "Orb of Chance"} (game description)`, "Can't be used on items", "In video steps, 1 step = pick up 1 shard"];
  if (isShard(key)) return [`**${SHARDS_PER_ORB} 個** 集めると ${SHARD_TO_ORB[key] === "transmute" ? "変成" : SHARD_TO_ORB[key] === "regal" ? "王者" : SHARD_TO_ORB[key] === "artificer" ? "熟練工" : "可能性"}のオーブ 1 個になる (クライアントの説明文)`, "アイテムには使えない", "動画の手順では 1 手 = 1 個拾う"];
  if (key.startsWith("catalyst_")) {
    const max = item ? maxQualityOf(item) : 20;
    if (isEn()) {
      return [
        `Raises the quality of **Rings and Amulets** by **+1% or +2%** per Catalyst (random, even odds; up to ${max}% on this item)`,
        "The quality type comes from the Catalyst. **Using a different type restarts quality from 0**",
        "With Omen of Catalysing Exaltation, mods of that type become more likely (quality is consumed). Stacked with Greater Exaltation, both mods are weighted",
      ];
    }
    return [
      // 上限はベースの最大品質 + MOD の「品質の最大値 +N%」(ブリーチのエッセンス) なので「このベースで」ではなく「今のアイテムで」
      `**指輪・アミュレット** の品質を 1 個で **+1% か +2%** 上げる (ランダム、半々。上限は今のアイテムで ${max}%)`,
      "品質の種類はカタリストで決まる。**別の種類を使うと品質は 0 からやり直し**",
      "触媒の高貴のお告げと組むと、その種類の MOD が付きやすくなる (品質は使い切る)。大いなる高貴のお告げも重ねると 2 つとも付きやすくなる",
    ];
  }
  if (key.startsWith("essence:") && data && item) {
    const t = essenceTarget(data, item, key);
    if (!t) return [tr("このベースには使えないエッセンス", "This Essence can't be used on this base")];
    const tier = t.level === "perfect" ? t.mod.tiers[0] : t.mod.tiers.find((x) => essenceLevelOf(String(x.name ?? "")) === t.level) ?? t.mod.tiers[0];
    // 深淵のエッセンス (2026-10-03)
    if (t.mod.family === "EssenceAbyss" && isEn()) {
      return [
        "Removes 1 mod from a **Rare** and adds the **Mark of the Abyssal Lord** on that side",
        "The next Abyssal Bone (Desecration) always **replaces the Mark** with an Unrevealed Desecrated mod. Tier floor mod level = item level × 0.4 rounded down (the description only says \"higher tier\"; same as Craft of Exile)",
        "With an **Unrevealed** Desecrated mod it can be used and the Mark **replaces that Unrevealed mod**. Can't be used once the Desecrated mod is revealed. The Mark is a crafted mod too (2 allowed with Astrid's Creativity)",
        "Omens: Sinistral / Dextral Crystallisation (removed side = Mark side)",
      ];
    }
    if (t.mod.family === "EssenceAbyss") {
      return [
        "**レア** の MOD を 1 つ消して、消した側に **深淵の王の印** を付ける",
        "次の骨 (冒涜) は必ず **印を置き換えて** 未発現の冒涜 MOD になる。段の下限 MOD レベル = アイテムレベル × 0.4 の切り捨て (説明文は「より高い段」だけ。Craft of Exile と同じ式)",
        "**未発現** の冒涜 MOD があれば打てて、印は **その未発現に入れ替わる**。発現済みの冒涜 MOD があると打てない。印もクラフト MOD (アストリッドの創造性で 2 つまで持てる)",
        "お告げ: 左右の結晶化 (消す側 = 印の付く側)",
      ];
    }
    if (t.level === "perfect" && isEn()) {
      return [
        "Removes 1 mod from a **Rare**, then adds this mod",
        "The removed mod is picked equally from non-Fractured mods. If this mod's side is full, it removes from that side",
        "Only 1 Essence mod per item (2 with Astrid's Creativity). Can't be used if the same group is already present",
        `Required Item Level: ${tier?.ilvl ?? "?"}`,
        "Omens: Sinistral / Dextral Crystallisation (removed side). Corrupted Essences (Hysteria and so on) and Alloys work the same way",
      ];
    }
    if (isEn()) {
      return [
        "**Magic → Rare** and adds this mod (existing mods stay)",
        "Only 1 Essence mod per item. Can't be used if the same group is already present",
        `Required Item Level: ${tier?.ilvl ?? "?"}`,
        "Use a Perfect Essence on Rares",
      ];
    }
    if (t.level === "perfect") {
      return [
        "**レア** の MOD を 1 つ消してから、この MOD を付ける",
        "消すのはフラクチャー以外から等しく 1 つ。付ける側が埋まっていれば、その側から消す",
        "エッセンスの MOD はアイテムに 1 つまで (アストリッドの創造性で 2 つ)。同じ系統が付いていると打てない",
        `必要なアイテムレベル: ${tier?.ilvl ?? "?"}`,
        "お告げ: 左右の結晶化 (消す側)。ヒステリーなどのコラプトのエッセンス・合金も同じ扱い",
      ];
    }
    return [
      "**マジック → レア** にして、この MOD を付ける (付いている MOD は残る)",
      "エッセンスの MOD はアイテムに 1 つまで。同じ系統が付いていると打てない",
      `必要なアイテムレベル: ${tier?.ilvl ?? "?"}`,
      "レアに使うにはパーフェクトエッセンス",
    ];
  }
  return [];
}
