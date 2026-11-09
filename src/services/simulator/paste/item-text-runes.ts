/**
 * item-text-runes.ts — 貼った文のルーンの行から、差していたルーン・ソウルコア・遺産の名前と、その込みの枠を出す (S-08e、2026-11-05 オーナー
 * 「エミュからシミュの時単純よ使ったルーンや遺産の種類を追加するだけ、MODは作れないからシミュで、ついてるMODそのまま付与しないと」)。
 * 名前は parseItemText が暗黙側にしたルーンの行 (out.implicits の from "rune") を、そのベースに差せる物の効き目の文と照らして戻す。
 * ゲームのコピーは同じ文の行を 1 行に足して出すので、値がその効き目の値の n 倍なら n 個。照らせない行は名前にしない (推し量らない)
 */
import { classOfBase, itemBaseFor } from "../../htc/bridge";
import { RUNES, runeCategoryOf, runeEffectFor } from "../../craft-stage/stage-runes";
import { limitsWithRunes, runeIdByName } from "../../../vendor/poe2htc/engine/runes";
import { DEFAULT_LIMITS } from "../../../vendor/poe2htc/engine/item";
import type { Mod, PatchData } from "../../../vendor/poe2htc/engine/types";
import type { ItemTextImplicit, ItemTextResult } from "./item-text-types";

/** 数字・記号・空白・印を落とした文 (item-text の bare と同じ見方) */
const bare = (t: string): string => t.replace(/\s*\((rune|enchant|implicit)\)\s*$/i, "").replace(/[0-9.()+\-%\s]+/g, "");

/** ルーンの行 → 差していたルーンの英語名 (行の順、同じ物が n 個なら n 回) */
export function runeNamesOf(data: PatchData, base: string, implicits: readonly ItemTextImplicit[]): string[] {
  const cls = classOfBase(data, base);
  if (!cls) return [];
  const cat = runeCategoryOf({ base, cls });
  // 効き目の文 (全文と、2 行に分かれて出る物の頭の行) → その物と 1 個分の値
  const cands = Object.entries(RUNES).flatMap(([en, r]) => {
    const e = runeEffectFor(r, cat);
    if (!e) return [];
    const one = Math.abs(e.stats[0]?.value ?? 0);
    const keys = new Set([bare(e.ja), bare(e.en), bare(e.ja.split("、")[0]!)]);
    return [{ en, keys, one, ok: r.available !== false }];
  });
  const out: string[] = [];
  for (const im of implicits) {
    if (im.from !== "rune") continue;
    const k = bare(im.text), v = Math.abs(im.values[0] ?? 0);
    const hits = cands.filter((c) => c.keys.has(k));
    if (!hits.length) continue;
    // 値が 1 個分の n 倍になる物のうち n が一番小さい物 (今のゲームに有る物が先)。どれも割り切れなければ 1 個
    const fit = hits.map((c) => ({ c, n: c.one > 0 && v > 0 ? v / c.one : 1 }))
      .filter((x) => Number.isInteger(x.n) && x.n >= 1)
      .sort((a, b) => a.n - b.n || Number(b.c.ok) - Number(a.c.ok))[0];
    const pick = fit ?? { c: hits.sort((a, b) => Number(b.ok) - Number(a.ok))[0]!, n: 1 };
    for (let i = 0; i < pick.n; i++) out.push(pick.c.en);
  }
  return out;
}

/** ベースの枠に、差していたルーンの枠 (セールの凱旋 = サフィ +1) を足した数 */
export function limitsOfRunes(data: PatchData, base: string, names: readonly string[], from: { prefix: number; suffix: number }): { prefix: number; suffix: number } {
  const ib = itemBaseFor(data, base);
  const ids = names.flatMap((n) => { const id = runeIdByName(n); return id ? [id] : []; });
  if (!ib || !ids.length) return from;
  const lim = limitsWithRunes(ib.category, ids, { ...(ib.limits ?? DEFAULT_LIMITS), prefixes: from.prefix, suffixes: from.suffix });
  return { prefix: lim.prefixes, suffix: lim.suffixes };
}

/** parseItemText の中で、暗黙側を分けた後・MOD を読む前に呼ぶ: ルーンの名前を sockets.names に、枠をその込みに */
export function readRuneSockets(data: PatchData, out: ItemTextResult): void {
  if (!out.base) return;
  out.sockets.names = runeNamesOf(data, out.base.en, out.implicits);
  out.count.limit = limitsOfRunes(data, out.base.en, out.sockets.names, out.count.limit);
}

/**
 * ルーンの池の MOD (コルの狩りの手袋の投射物の速度など、そのルーンを差すと一般の置き場に入る物 = E-10a)。品にあればそのルーンを差している印なので、
 * 読みの割り当ての候補に入れる (一般の MOD で説明できる時はそちらが先、item-text-solve の sourceCost、S-08g)
 */
export function runePoolMods(data: PatchData, base: string): Mod[] {
  const cls = classOfBase(data, base);
  if (!cls?.pools.rune) return [];
  return Object.values(cls.pools.rune).flatMap((p) => [...p.prefixes, ...p.suffixes]).flatMap((id) => { const m = data.mods.get(id); return m ? [m] : []; });
}

/** 読んだ MOD にルーンの池の物があれば、そのルーンを差していた物の名前に足す (S-08g、行から戻した名前に無い時だけ 1 個) */
export function addPoolRunes(data: PatchData, out: ItemTextResult): void {
  const names = out.sockets.names ?? [];
  for (const m of out.mods) {
    // 名前は使用ルーンの鍵 (stage-runes の英語名、「Kolr's Hunt」)。エンジンの名前は「’」なので id で引き直す (画面が今の言語の名前に直せるように)
    const id = data.mods.get(m.modId ?? "")?.rune;
    const name = id ? Object.keys(RUNES).find((en) => runeIdByName(en) === id) : undefined;
    if (name && !names.includes(name)) names.push(name);
  }
  out.sockets.names = names;
}
