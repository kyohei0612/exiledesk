/**
 * essence-route.ts — 「その MOD、エッセンスでも付くなら安いほうで」(2026-09-22)
 *
 * オーナー指摘:「エッセンスで付く MOD とかも加味してるんかな HTC って。猛攻ってエッセンス
 * じゃなかったっけ」「HTC の MOD ルールも、付けれるやつはエッセンスから引いてるでしょ」。
 *
 * ## 何が抜けていたか
 * エンジンはエッセンスを**行動として持っていて、値段も見ています**。ただし使うのは
 * **狙う MOD の id がエッセンス側の物だった時だけ**で、通常プールの MOD を狙った時に
 * 「同じ物がエッセンスでも付くから、そっちが安ければそっち」とは**しません**。
 *
 * これが効きます。実測 (イージスクォータースタッフ / アタック速度 23-25% + 撃破時ライフ T1):
 *   通常ロールを狙う      104,806 高貴
 *   エッセンスを狙う        4,148 高貴   ← **25 倍安い。出来上がる行は同じ**
 * 画面に出る文言が同じなので、利用者には「エッセンス側を狙え」と分かりません。
 *
 * ## 直し方 — 枠 (`slot`) で「どちらでもいい」と伝える
 * `TierTarget.slot` は「同じ枠の目標はどれか 1 つ埋まればいい」という仕組みです。通常の MOD と
 * その**エッセンス版**を同じ枠に入れると、ソルバが値段を見て選びます。実測:
 *   エッセンス   4.254 高貴 → 使う、合計   4,148 高貴
 *   エッセンス   0.05  高貴 → 使う、合計   4,144 高貴
 *   エッセンス 300,000 高貴 → 使わない、合計 104,806 高貴 (通常ロールに戻る)
 *
 * ## family だけで繋ぐと間違えます
 * 同じ family でも**別物**のことがあります。クォータースタッフの `IncreaseSocketedGemLevel`:
 *   通常      `+# to Level of all Melee Skills`
 *   エッセンス  `+3 to Level of all Attack Skills`   ← 近接ではなくアタック。別の MOD
 * なので family に加えて**文言 (正規化後) の一致**も見ます。逆に
 * `Adds 1 to # Lightning Damage` と `Adds # to # Lightning Damage` は正規化すると同じで、
 * これは繋いで正しい。
 *
 * ## ティアが足りないエッセンスは繋ぎません
 * エッセンスは固定ティアで、通常の T1 より下のことがほとんどです (火ダメージは通常 T1 が
 * 135-156/205-236、エッセンス最上位が 56-70/84-107)。**狙いの下限を満たす物だけ**入れます。
 * どのレベルを買うかは engine の `cheapestEssenceLevel` が値段で選びます
 * (上級のほうが安いことが普通にある ── Essence of Abrasion は Lesser 116ex / Greater 0.81ex)。
 */
import { matchKey } from "./bridge-index";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { ItemBase, Mod, PatchData } from "../../vendor/poe2htc/engine/types";

/** 繋いだエッセンス 1 件 */
export interface EssenceAlternative {
  /** ソルバに渡す目標 (エッセンス版。`slot` は呼び出し側が振る) */
  target: TierTarget;
  modId: string;
  /** 満たせる一番下のティア名 (「Greater Essence of Haste」) */
  tierName: string;
  /** 元になった通常 MOD */
  forModId: string;
}

/** 目標のティア (未指定なら最上位) */
function tierIndexOf(mod: Mod, t: TierTarget): number {
  return Math.max(0, Math.min(mod.tiers.length - 1, t.minTierIndex ?? mod.tiers.length - 1));
}

/**
 * そのエッセンスのティアが、狙いのティアの下限を満たすか。
 *
 * 範囲の数が違う物は繋ぎません (複合 MOD の 2 行目を 1 行目と突き合わせると嘘になる)。
 */
function satisfies(want: Mod["tiers"][number], have: Mod["tiers"][number]): boolean {
  if (have.ranges.length !== want.ranges.length || have.ranges.length === 0) return false;
  return want.ranges.every((w, k) => {
    const h = have.ranges[k];
    return !!h && Number(h[0]) >= Number(w[0]);
  });
}

/** そのクラスのエッセンスプールの MOD */
function essencePool(data: PatchData, cls: ItemBase): Mod[] {
  const pool = cls.pools.essence;
  const out: Mod[] = [];
  for (const ids of [pool?.prefixes, pool?.suffixes]) {
    for (const id of ids ?? []) {
      const m = data.mods.get(id);
      if (m) out.push(m);
    }
  }
  return out;
}

/**
 * その目標を**エッセンスでも満たせる**なら、その候補を返す。
 *
 * @param level アイテムレベル。これを超えるティアしか無いエッセンスは繋がない
 */
export function essenceAlternativesFor(
  data: PatchData,
  cls: ItemBase,
  t: TierTarget,
  level: number,
): EssenceAlternative[] {
  const mod = data.mods.get(t.modId);
  // エッセンス MOD を狙っている時は何もしない (既にエッセンスの話)
  if (!mod || mod.source !== "normal") return [];
  const want = mod.tiers[tierIndexOf(mod, t)];
  // 文言が無い MOD は繋げない (突き合わせる材料が無いので、family だけで繋ぐのは危険)
  if (!want || !mod.text) return [];
  const key = matchKey(mod.text);

  const out: EssenceAlternative[] = [];
  for (const e of essencePool(data, cls)) {
    // family だけでは足りない。文言と側も見る (冒頭の「別物」の説明を参照)
    if (e.family !== mod.family || e.type !== mod.type || !e.text || matchKey(e.text) !== key) continue;
    // 満たせる一番下のティア。engine が値段でこれ以上の中から選ぶ
    const idx = e.tiers.findIndex((tier) => tier.ilvl <= level && satisfies(want, tier));
    if (idx < 0) continue;
    out.push({
      target: { modId: e.id, minTierIndex: idx },
      modId: e.id,
      tierName: String(e.tiers[idx]?.name ?? ""),
      forModId: mod.id,
    });
  }
  return out;
}

/**
 * 目標一覧に「エッセンスでもいい」を足し、同じ枠にまとめて返す。
 *
 * **これをソルバに渡してください。**候補が無い目標は `slot` を付けずに素通しするので、
 * 繋がる物が 1 つも無ければ今までと完全に同じ挙動になります。
 */
export function withEssenceAlternatives(
  data: PatchData,
  cls: ItemBase,
  targets: readonly TierTarget[],
  level: number,
): TierTarget[] {
  const out: TierTarget[] = [];
  let slot = 0;
  for (const t of targets) {
    const alts = essenceAlternativesFor(data, cls, t, level);
    if (alts.length === 0) {
      out.push(t);
      continue;
    }
    slot++;
    out.push({ ...t, slot });
    for (const a of alts) out.push({ ...a.target, slot });
  }
  return out;
}
