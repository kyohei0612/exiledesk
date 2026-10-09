/**
 * mod-rules.ts — MOD の決まり (系統・重み・出やすさ) の置き場はここだけ (2026-09-29)
 *
 * オーナー「計算式や MOD を見ている所が複数あるなら 1 つに統一して、1 か所直したら全部直る仕組みに」。
 * 前は同じ系統の判定が 3 通り、重みの合計が 6 か所にあり、画面によって答えが違っていた
 * (2 つの系統にまたがる冒涜の MOD「+力 +知性」を、計算機の確率の一部が 1 つ目の系統でしか見ていなかった など)。
 * 計算機・クラフトステージ・規格外の賭け・ビルドコピー・MOD の一覧は、系統と重みを必ずここから取る。
 * 中身は計算機のエンジン (src/vendor/poe2htc/engine/pool.ts) の式を使い、エンジンに無い決まりだけここに足す。
 */
import type { Mod } from "../../vendor/poe2htc/engine/types";
import { excluded, familiesOf, modTierWeight } from "../../vendor/poe2htc/engine/pool";

/**
 * MOD の系統の鍵 (同じ鍵は 1 つのアイテムに 1 つまで)。エンジンの familiesOf そのまま:
 * 2 つの系統にまたがる MOD は両方、エッセンス等の MOD は crafted:… (普通の MOD と同じ系統でも並ぶ。
 * poe.ninja の実物で確認済み = エンジンのコメント)。抽選の元から外す判定は全部これで
 */
export function familyKeysOf(mod: Mod): string[] {
  return [...familiesOf(mod)];
}

/** その MOD が、もう付いている系統 (familyKeysOf を集めた物) とぶつかるか (エンジンの excluded) */
export function familyBlocked(mod: Mod, taken: ReadonlySet<string>): boolean {
  return excluded(mod, taken);
}

/** 生の系統 (crafted:… に分けない)。エッセンスを打つ時の「同じ系統が付いていると打てない」判定だけに使う */
export function rawFamiliesOf(mod: Mod): string[] {
  return mod.families?.length ? [...mod.families] : mod.family ? [mod.family] : [];
}

/**
 * エッセンスを打てないか: 付いている **エッセンス (クラフト) の** MOD に同じ系統がある。普通の MOD とは同じ系統でも一緒に付く
 * (2026-10-10 オーナー確認。poe.ninja の実物に作った MOD と同じ系統の普通の MOD が並んでいる。計算機の familiesOf の crafted: と同じ)。
 * 呼ぶ側は takenRaw にクラフトの MOD の系統だけを渡す (takenCraftedFamilies)
 */
export function essenceClash(essence: Mod, takenRaw: ReadonlySet<string>): boolean {
  return rawFamiliesOf(essence).some((f) => takenRaw.has(f));
}

/**
 * 段の重みの合計。minIdx の段より上で、MOD レベルが floor 以上・cap (アイテムレベル) 以下の段だけ。
 * floor = 上級・完全のオーブや古代の骨の足切り。エンジンの modTierWeight と同じ式 (引数の順だけ使いやすく)
 */
export function tierWeight(mod: Mod, minIdx: number, cap: number, floor = 0): number {
  return modTierWeight(mod, floor, cap, minIdx);
}

type ShareKey = { side: string; group: string; weight: number };
/**
 * 出やすさ = 同じ側・同じ種類の重みの合計に対する割合 (0〜1)。rows の share を書き換える。
 * MOD の一覧 (クラフトステージ・計算機の狙う MOD) はどちらもこれで割る。重みの合計が 0 の組 (エッセンス = 確定) は 0。
 * base = 合計を取る元 (検索で絞る前の全部。省略時は rows)
 */
export function fillShares<T extends ShareKey & { share: number }>(rows: T[], base: readonly ShareKey[] = rows): T[] {
  const totals = new Map<string, number>();
  for (const r of base) totals.set(`${r.side}|${r.group}`, (totals.get(`${r.side}|${r.group}`) ?? 0) + r.weight);
  for (const r of rows) {
    const t = totals.get(`${r.side}|${r.group}`) ?? 0;
    r.share = t > 0 ? r.weight / t : 0;
  }
  return rows;
}
