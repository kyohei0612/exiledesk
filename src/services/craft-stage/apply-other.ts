/**
 * クラフトステージ: MOD を足し引きしない物 (2026-09-27、ADR-001)
 *
 *   - 神のオーブ: 固定済み以外の MOD の数値を段の範囲の中で転がし直す (段は変わらない)
 *   - フラクチャーのオーブ: レアで MOD 4 つ以上、固定済みが無い時。固定する MOD は等しく 1 つ (未発現の冒涜 MOD は選ばれない。
 *     計算機の self-fracture.ts と同じ)
 *   - アーティファサーのオーブ: 武器・防具にソケットを 1 つ (規格外で 2 つまで。計算機の sockets.ts)
 *   - カタリスト: 1 手で指輪・アミュレットの品質を上限まで盛る (使う数は 上げた品質 ÷ 計算機の QUALITY_PER_CATALYST = 1%)。
 *     2026-10-05 オーナー「カタリストは 1 回打ったらマックスまで付けておk。品質は 1 か 2 で、ほとんど 1、小数点は付かない」。
 *     種類を変えると品質は 0 からやり直し。上限はベースの最大品質
 *   - ヴァールのオーブと聖別は [[apply-vaal.ts]]
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { QUALITY_PER_CATALYST } from "../htc/catalysing-setup";
import { socketCapOf } from "./stage-runes";
import { allMods, maxQualityOf, replaced, skip, withValues } from "./stage-core";
import type { StageApply, StageItem, StageMod } from "./types";
import { tr } from "../../i18n/lang";

export const OTHER_KINDS: readonly string[] = ["divine", "fracture", "artificer"];
const FRACTURE_NEEDS = 4;
const CATALYST_CLASSES = ["Rings", "Amulets"];

/**
 * oneCatalyst = 手順 (craft-stage-plan) の再生: カタリストは 1 手 = 1 個 (品質 +QUALITY_PER_CATALYST)。上限まで打つ時は手順の times で
 * (2026-10-06 POE2Tube 要望 ㉜ の 2「動画で 1 個で上限までに見えてしまう」)。手で打つ画面は今まで通り 1 手で上限まで
 */
export function applyOther(data: PatchData, item: StageItem, currency: string, rng: () => number, oneCatalyst = false): StageApply {
  if (currency.startsWith("catalyst_")) {
    if (!CATALYST_CLASSES.includes(item.cls.category)) return skip(item, tr("カタリストは指輪・アミュレットだけ", "Catalysts: Rings and Amulets only"));
    const tag = currency.slice("catalyst_".length);
    // ブリーチのエッセンスの「品質の最大値 +20%」も足す (要望 ㉔-3)
    const max = maxQualityOf(item);
    const base = item.qualityTag === tag ? item.quality : 0;
    if (base >= max) return skip(item, tr(`品質が上限 (${max}%)`, `Quality is maxed (${max}%)`));
    if (oneCatalyst) return { applied: true, item: { ...item, quality: Math.min(max, base + QUALITY_PER_CATALYST), qualityTag: tag }, added: [], removed: [] };
    const count = Math.ceil((max - base) / QUALITY_PER_CATALYST);
    return { applied: true, item: { ...item, quality: max, qualityTag: tag }, added: [], removed: [], count };
  }
  switch (currency) {
    case "divine": {
      // ユニークは効果の値を振る種 (rollSeed) を変える (ユニークの数値も振り直せる。2026-10-08 使い倒しテスト)
      if (item.rarity === "unique") return { applied: true, item: { ...item, rollSeed: 1 + Math.floor(rng() * 2 ** 30) }, added: [], removed: [], note: tr("ユニークの数値を振り直し", "Rerolled Unique values") };
      const mods = allMods(item).filter((m) => !m.fractured && !m.unrevealed && m.ranges.length);
      if (!mods.length) return skip(item, tr("転がし直せる MOD が無い", "No mod to reroll"));
      let cur = item;
      const added: StageMod[] = [];
      for (const m of mods) {
        const mod = data.mods.get(m.modId);
        if (!mod) continue;
        const next = withValues(m, mod, rng);
        cur = replaced(cur, m, next);
        added.push(next);
      }
      return { applied: true, item: cur, added, removed: mods };
    }
    case "fracture": {
      if (item.rarity !== "rare") return skip(item, tr("レアのアイテムにだけ使える", "Rare items only"));
      const mods = allMods(item);
      if (mods.length < FRACTURE_NEEDS) return skip(item, tr(`MOD が ${FRACTURE_NEEDS} つ以上要る`, `Needs ${FRACTURE_NEEDS}+ mods`));
      if (mods.some((m) => m.fractured)) return skip(item, tr("もう固定した MOD がある", "Already has a Fractured mod"));
      const pool = mods.filter((m) => !m.unrevealed);
      const m = pool[Math.floor(rng() * pool.length)]!;
      const next = { ...m, fractured: true };
      // 固定は消えて付いたのではない (＋ と － に同じ MOD が並んで分かりづらかった。2026-10-08 完成判定)
      return { applied: true, item: replaced(item, m, next), added: [next], removed: [] };
    }
    case "artificer": {
      // 上限はベースごと (PoB の socketLimit − 2、stage-runes.ts)。2026-09-29 までは全部 2 だった
      const max = socketCapOf(item.base, item.cls.category);
      // 言葉はゲームの説明文「マーシャル武器、ワンド、スタッフまたは防具にオーグメントソケットを1個追加する」
      if (!max) return skip(item, tr("マーシャル武器・ワンド・スタッフ・防具にだけ使える", "Martial Weapons, Wands, Staves and Armour only"));
      const n = item.sockets ?? 0;
      if (n >= max) return skip(item, n > max ? tr(`ソケットが規格外 (${n})。熟練工のオーブで足せるのは ${max} まで`, `Sockets over the limit (${n}); Artificer's Orbs add up to ${max}`) : tr(`ソケットが上限 (${max})`, `Sockets are maxed (${max})`));
      return { applied: true, item: { ...item, sockets: n + 1 }, added: [], removed: [] };
    }
    default:
      return skip(item, tr(`このアイテムはまだ使えない (${currency})`, `Not supported yet (${currency})`));
  }
}
