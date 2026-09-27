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
import { socketCountFor } from "../htc/sockets";
import vaal from "../../i18n/vaal-enchants.json";
import { addOne, allMods, replaced, skip, without } from "./stage-core";
import type { StageApply, StageItem, StageMod } from "./types";

interface Enchant { domain: string; en: string; ja: string; stats: Array<{ id: string; min: number; max: number }>; spawn: Array<{ t: string; w: number }> }
const ENCHANTS = (vaal as unknown as { mods: Record<string, Enchant> }).mods;

/** 計算機のベースの種類 → コラプトの付加が見るタグ (クライアントの BaseItemTypes.Tags と同じ名前) */
const CLASS_TAGS: Record<string, string[]> = {
  Rings: ["ring"], Amulets: ["amulet"], Belts: ["belt"], Quivers: ["quiver"],
  Helmets: ["helmet", "armour"], Gloves: ["gloves", "armour"], Boots: ["boots", "armour"], Body_Armours: ["body_armour", "armour"],
  Shields: ["shield", "armour"], Bucklers: ["shield", "armour"], Foci: ["focus", "armour"],
  Bows: ["bow", "two_hand_weapon", "weapon"], Crossbows: ["crossbow", "two_hand_weapon", "weapon"],
  Wands: ["wand", "one_hand_weapon", "weapon"], Sceptres: ["sceptre", "one_hand_weapon", "weapon"],
  Staves: ["staff", "two_hand_weapon", "weapon"], Quarterstaves: ["warstaff", "two_hand_weapon", "weapon"],
  Spears: ["spear", "one_hand_weapon", "weapon"], OneHand_Maces: ["mace", "one_hand_weapon", "weapon"],
  TwoHand_Maces: ["mace", "two_hand_weapon", "weapon"],
};
/** 防具の属性のタグ (Helmets_str_int → str_int_armour) */
function tagsOf(item: StageItem): Set<string> {
  const tags = new Set(CLASS_TAGS[item.cls.category] ?? []);
  const attr = /_((?:str|dex|int)(?:_(?:str|dex|int))?)$/.exec(item.cls.id)?.[1];
  if (attr && tags.has("armour")) tags.add(`${attr}_armour`);
  return tags;
}
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
function rollText(text: string, vals: readonly number[]): string {
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
      // 最大 3 つ (1〜3 を等分。破砕・未開示は振り直さない)。消した側に新しい MOD を 1 つずつ
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
      const vals = e.stats.filter((s) => s.min !== s.max).map((s) => s.min + Math.floor(rng() * (s.max - s.min + 1)));
      return done({ ...item, enchant: { id, textJa: rollText(e.ja, vals), textEn: rollText(e.en, vals) } });
    }
    case "fourth": {
      const max = socketCountFor(item.cls.category);
      if (!max) return done(item);
      return done({ ...item, sockets: Math.min(max + 1, (item.sockets ?? 0) + 1) });
    }
    default:
      return done(item);
  }
}

/** 聖別: MOD ごとに 0.78〜1.22 倍して丸める */
export function applySanctify(item: StageItem, rng: () => number): StageApply {
  if (item.rarity !== "rare") return skip(item, "聖別はレアのアイテムにだけ");
  const mods = allMods(item).filter((m) => m.values.length && !m.unrevealed);
  let cur = item;
  const added: StageMod[] = [];
  for (const m of mods) {
    const k = (78 + Math.floor(rng() * 45)) / 100;
    const digits = (v: number) => (Number.isInteger(v) ? 0 : 2);
    const values = m.values.map((v) => { const d = 10 ** digits(v); return Math.round(v * k * d) / d; });
    const next = { ...m, values, textJa: swapNums(m.textJa, m.values, values), textEn: swapNums(m.textEn, m.values, values) };
    cur = replaced(cur, m, next);
    added.push(next);
  }
  return { applied: true, item: { ...cur, sanctified: true }, added, removed: mods };
}
/** 文面の数値を順に差し替える (値の並びと同じ順で出てくる物だけ) */
function swapNums(text: string, from: readonly number[], to: readonly number[]): string {
  let i = 0;
  return text.replace(/\d+(?:\.\d+)?/g, (s) => (i < from.length && Number(s) === Math.abs(from[i]!) ? String(Math.abs(to[i++]!)) : s));
}
