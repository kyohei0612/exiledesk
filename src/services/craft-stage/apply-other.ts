/**
 * クラフトステージ: MOD を足し引きしない物 (2026-09-27、ADR-001)
 *
 *   - 神のオーブ: 固定済み以外の MOD の数値を段の範囲の中で転がし直す (段は変わらない)
 *   - 破砕のオーブ: レアで MOD 4 つ以上、固定済みが無い時。固定する MOD は等しく 1 つ (未開示の冒涜 MOD は選ばれない。
 *     計算機の self-fracture.ts と同じ)
 *   - アーティファサーのオーブ: 武器・防具にソケットを 1 つ (規格外で 2 つまで。計算機の sockets.ts)
 *   - カタリスト: 指輪・アミュレットに品質 +1.5% (計算機の QUALITY_PER_CATALYST)。種類を変えると品質は 0 からやり直し。上限はベースの最大品質
 *   - ヴァールのオーブと聖別は [[apply-vaal.ts]]
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { QUALITY_PER_CATALYST } from "../htc/catalysing-setup";
import { socketCapOf } from "./stage-runes";
import { allMods, maxQualityOf, replaced, skip, withValues } from "./stage-core";
import type { StageApply, StageItem, StageMod } from "./types";

export const OTHER_KINDS: readonly string[] = ["divine", "fracture", "artificer"];
const FRACTURE_NEEDS = 4;
const CATALYST_CLASSES = ["Rings", "Amulets"];

export function applyOther(data: PatchData, item: StageItem, currency: string, rng: () => number): StageApply {
  if (currency.startsWith("catalyst_")) {
    if (!CATALYST_CLASSES.includes(item.cls.category)) return skip(item, "カタリストは指輪・アミュレットだけ");
    const tag = currency.slice("catalyst_".length);
    // ブリーチのエッセンスの「品質の最大値 +20%」も足す (要望 ㉔-3)
    const max = maxQualityOf(item);
    const base = item.qualityTag === tag ? item.quality : 0;
    if (base >= max) return skip(item, `品質が上限 (${max}%)`);
    const quality = Math.min(max, Math.round((base + QUALITY_PER_CATALYST) * 10) / 10);
    return { applied: true, item: { ...item, quality, qualityTag: tag }, added: [], removed: [] };
  }
  switch (currency) {
    case "divine": {
      const mods = allMods(item).filter((m) => !m.fractured && !m.unrevealed && m.ranges.length);
      if (!mods.length) return skip(item, "転がし直せる MOD が無い");
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
      if (item.rarity !== "rare") return skip(item, "レアのアイテムにだけ使える");
      const mods = allMods(item);
      if (mods.length < FRACTURE_NEEDS) return skip(item, `MOD が ${FRACTURE_NEEDS} つ以上要る`);
      if (mods.some((m) => m.fractured)) return skip(item, "もう固定した MOD がある");
      const pool = mods.filter((m) => !m.unrevealed);
      const m = pool[Math.floor(rng() * pool.length)]!;
      const next = { ...m, fractured: true };
      return { applied: true, item: replaced(item, m, next), added: [next], removed: [m] };
    }
    case "artificer": {
      // 上限はベースごと (PoB の socketLimit − 2、stage-runes.ts)。2026-09-29 までは全部 2 だった
      const max = socketCapOf(item.base, item.cls.category);
      // 言葉はゲームの説明文「マーシャル武器、ワンド、スタッフまたは防具にオーグメントソケットを1個追加する」
      if (!max) return skip(item, "マーシャル武器・ワンド・スタッフ・防具にだけ使える");
      const n = item.sockets ?? 0;
      if (n >= max) return skip(item, `ソケットが上限 (${max})`);
      return { applied: true, item: { ...item, sockets: n + 1 }, added: [], removed: [] };
    }
    default:
      return skip(item, `このアイテムはまだ使えない (${currency})`);
  }
}
