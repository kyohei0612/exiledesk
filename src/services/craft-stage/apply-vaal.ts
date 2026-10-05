/**
 * クラフトステージ: ヴァールのオーブ (コラプト) と聖別 (2026-09-27、ADR-001 の Phase 3)
 *
 * オーナー:「ヴァールも poe2db で調べて入れて」。poe2db はコラプトで付く MOD の一覧だけで結果の分岐が無いので、
 * 分岐は PoE2 Wiki (poe2wiki.net/wiki/Corrupted「Corruption outcomes / Non-unique equipment」、2026-09-27 確認) に従う:
 *   1. 変化なし
 *   2. MOD を最大 3 つ新しい MOD に振り直す
 *   3. ヴァールのエンチャントを 1 つ付ける
 *   4. 武器・防具はソケット +1 (上限を無視)。アクセサリーは変化なし (コラプトのお告げでも消えない方の「変化なし」)
 * どれも等しく 1/4 (Wiki はコラプトのお告げを「4 つから 3 つになる」と書くので等分と読む。公開の実測は無い)。
 * コラプトのお告げ: 1 の「変化なし」を外して 3 つから (0.5.0 で入手不可になったが持っている物は使える)。
 * エンチャントのプールは src/i18n/vaal-enchants.json (クライアントの Mods.GenerationType=corrupted、spawn は 0/1 なので付く物から等分)。
 *
 * 聖別 (聖別のお告げ + 神のオーブ、レアだけ): MOD ごとに 0.78〜1.22 倍 (0.01 刻み) を掛けて丸め、聖別済みになる (Wiki の Omen of Sanctification)。
 * コラプトと同じく、以後は手を加えられない。
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { socketCapOf } from "./stage-runes";
import vaal from "../../i18n/vaal-enchants.json";
import { addOne, allMods, replaced, retext, skip, without } from "./stage-core";
import type { StageApply, StageItem, StageMod } from "./types";
import { tagsOfEngineRow } from "../mods/item-class-tags";
import { displayValue } from "../mods/stat-scale";

interface Enchant { domain: string; en: string; ja: string; stats: Array<{ id: string; min: number; max: number }>; spawn: Array<{ t: string; w: number }> }
export const ENCHANTS = (vaal as unknown as { mods: Record<string, Enchant> }).mods;

/** そのアイテムのタグ (クライアントの BaseItemTypes.Tags と同じ名前。表は services/mods/item-class-tags.ts に 1 つ) */
const tagsOf = (item: StageItem): Set<string> => tagsOfEngineRow(item.cls.category, item.cls.id);
/** そのアイテムに付くエンチャント (spawn は順番に見て最初に当たったタグの重み) */
export function enchantPool(item: StageItem): string[] {
  const tags = tagsOf(item);
  return Object.entries(ENCHANTS).filter(([, m]) => {
    if (m.domain !== "item") return false;
    const hit = m.spawn.find((w) => w.t === "default" || tags.has(w.t));
    return !!hit && hit.w > 0;
  }).map(([id]) => id);
}
/** 文面の「(a-b)」を順に振った値にする */
/**
 * エンチャントの数値を転がす。転がすのはデータの整数のまま、文に入れる値は画面の単位
 * (フラスコのチャージ獲得は毎分 20-35 → 毎秒 0.33-0.58。生の値を入れると「毎秒 27」になっていた。services/mods/stat-scale.ts)
 */
export function rollEnchantValues(stats: ReadonlyArray<{ id: string; min: number; max: number }>, rng: () => number): number[] {
  return stats.filter((s) => s.min !== s.max).map((s) => displayValue(s.id, s.min + Math.floor(rng() * (s.max - s.min + 1))));
}

export function rollText(text: string, vals: readonly number[]): string {
  let i = 0;
  return text.replace(/\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)/g, (m) => (i < vals.length ? String(vals[i++]) : m));
}

const OUTCOMES = ["none", "reroll", "enchant", "fourth"] as const;

export function applyVaal(data: PatchData, item: StageItem, rng: () => number, used: readonly string[]): StageApply {
  const list = used.includes("OmenofCorruption") ? OUTCOMES.filter((o) => o !== "none") : [...OUTCOMES];
  const outcome = list[Math.floor(rng() * list.length)]!;
  const done = (it: StageItem, added: StageMod[] = [], removed: StageMod[] = []): StageApply =>
    ({ applied: true, item: { ...it, corrupted: true }, added, removed });
  switch (outcome) {
    case "reroll": {
      // 最大 3 つ (1〜3 を等分。フラクチャー・未発現は振り直さない)。消した側に新しい MOD を 1 つずつ
      const pool = allMods(item).filter((m) => !m.fractured && !m.unrevealed);
      const n = Math.min(pool.length, 1 + Math.floor(rng() * 3));
      let cur = item;
      const added: StageMod[] = [];
      const removed: StageMod[] = [];
      for (let i = 0; i < n; i++) {
        const left = pool.filter((m) => !removed.includes(m));
        const m = left[Math.floor(rng() * left.length)]!;
        cur = without(cur, m);
        removed.push(m);
        const a = addOne(data, cur, 0, rng, { sides: [m.side] });
        if (a) { cur = a.item; added.push(a.mod); }
      }
      return done(cur, added, removed);
    }
    case "enchant": {
      if (item.enchant) return done(item);
      const pool = enchantPool(item);
      const id = pool[Math.floor(rng() * pool.length)];
      const e = id ? ENCHANTS[id] : undefined;
      if (!id || !e) return done(item);
      const vals = rollEnchantValues(e.stats, rng);
      return done({ ...item, enchant: { id, textJa: rollText(e.ja, vals), textEn: rollText(e.en, vals) } });
    }
    case "fourth": {
      // コラプトは上限を無視して 1 つ足す。一番多いのは規格外 (熟練工の上限 + 1) にもう 1 つ = 熟練工の上限 + 2
      // (胴・両手 4 / ほか 3 = PoB の socketLimit。2026-10-05 オーナー「上限ソケットはヴァールコラプトに合わせよう」、前は + 1 で止めていて
      // 規格外 3 の胴が 4 にならなかった)
      const max = socketCapOf(item.base, item.cls.category);
      if (!max) return done(item);
      return done({ ...item, sockets: Math.min(max + 2, (item.sockets ?? 0) + 1) });
    }
    default:
      return done(item);
  }
}

/** 聖別: MOD ごとに 0.78〜1.22 倍して丸める。文は stage-core の retext (雛形の「#」の位置だけ変える。カタリストの品質と同じ道) */
export function applySanctify(data: PatchData, item: StageItem, rng: () => number): StageApply {
  if (item.rarity !== "rare") return skip(item, "聖別はレアのアイテムにだけ");
  const mods = allMods(item).filter((m) => m.values.length && !m.unrevealed);
  let cur = item;
  const added: StageMod[] = [];
  for (const m of mods) {
    const k = (78 + Math.floor(rng() * 45)) / 100;
    const digits = (v: number) => (Number.isInteger(v) ? 0 : 2);
    const values = m.values.map((v) => { const d = 10 ** digits(v); return Math.round(v * k * d) / d; });
    const next = { ...m, values, ...retext(m, values, data) };
    cur = replaced(cur, m, next);
    added.push(next);
  }
  return { applied: true, item: { ...cur, sanctified: true }, added, removed: mods };
}
