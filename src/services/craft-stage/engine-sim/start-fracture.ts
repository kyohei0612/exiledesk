/**
 * start-fracture.ts — シミュのスタートと完成形のカードの作り (2026-10-23 オーナーの決め「スタートとフラクチャーの形」、シミュ部長の頼み J1・J2。
 * docs/org/simulator/notes/2026-10-23-start-fracture-plan.md)。打つのは全部核の applyCurrency (指名の手 forceKey・素の高貴)、当たりの判定は核の aimHits。
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { applyCurrency } from "../apply-currency";
import { forceKey } from "../apply-force";
import { hits } from "../aim-odds";
import { freshItem } from "../run-plan";
import { mulberry32 } from "../../htc/rng";
import type { StageItem, StageMod } from "../types";
import { tr } from "../../../i18n/lang";

/** 段の名前の T で言う MOD (T1 が一番上)。fractured = ✦ で付ける */
export interface TierMod { modId: string; tier: number; fractured?: boolean }

/** エッセンスの MOD はクラフト MOD の印で付ける (始まりの形と同じ) */
const flagOf = (data: PatchData, m: TierMod): "f" | "e" | "n" => {
  if (m.fractured) return "f";
  const src = data.mods.get(m.modId)?.source;
  return src === "essence" || src === "perfect_essence" ? "e" : "n";
};
const keyOf = (data: PatchData, m: TierMod): string => forceKey(m.modId, `T${m.tier}`, flagOf(data, m));

/**
 * フラクチャーの候補から始めのアイテム (J1): 候補のどれか 1 つが ✦ で付いたレア + 外れ junk 個 (既定 3 = フラクチャーのオーブを打てる MOD 4 つのレア)。
 * - どれが固定されるか: ゲームのフラクチャーのオーブは MOD 4 つのレアの固定できる MOD を等しく 1 つ固定する。候補が固定された時に限ると、固定できる候補どうしで等分 (chances)。
 * - 外れ: 素の高貴で 1 つずつ付ける (候補と同じ系統・同じ文の MOD が付いた回は引き直す、tries 回まで)。
 * - extra = ✦ の後・外れの前に指名で付ける MOD (スタートの枠の「＋」で足した物)。外れの数は junk − extra の数 (0 未満は 0)。
 * - from = 白のレアの代わりに使うアイテム (ルーンを先に差した物など)。
 * - avoid = 外れに付けない MOD (ツリーの完成の狙い全部など。同じ MOD・同じ系統で同じ文なら段を問わず引き直す、候補と同じ扱い。2026-10-24 シミュ部長 19 本目:
 *   外れに完成の狙いの MOD が付くと、外れの箱のカオススパムで当たらず上限で外れになっていた)
 * - 固定できる候補が無い・extra や外れが付けられない時は note に理由 (固定できない時のアイテムは白、from があれば from)。
 */
export function fractureStart(data: PatchData, base: string, itemLevel: number, candidates: readonly TierMod[], rng: () => number, o: { junk?: number; tries?: number; extra?: readonly TierMod[]; from?: StageItem; avoid?: readonly TierMod[] } = {}):
  { item: StageItem; fixed: TierMod | null; chances: Record<string, number>; note: string | null } {
  const extra = o.extra ?? [], junk = Math.max(0, (o.junk ?? 3) - extra.length), tries = o.tries ?? 200;
  const rare = o.from ?? freshItem(data, base, itemLevel, "rare");
  const reasons: string[] = [];
  const can = candidates.filter((c) => {
    const r = applyCurrency(data, rare, keyOf(data, { ...c, fractured: true }), mulberry32(1));
    if (!r.applied && r.reason) reasons.push(r.reason);
    return r.applied;
  });
  if (!can.length) return { item: o.from ?? freshItem(data, base, itemLevel), fixed: null, chances: {}, note: reasons[0] ?? tr("固定できる候補が無い", "No candidate can be fractured") };
  const chances = Object.fromEntries(can.map((c) => [`${c.modId}#T${c.tier}`, 1 / can.length]));
  const pick = can[Math.min(can.length - 1, Math.floor(rng() * can.length))]!;
  let item = applyCurrency(data, rare, keyOf(data, { ...pick, fractured: true }), rng).item;
  for (const m of extra) {
    const r = applyCurrency(data, item, keyOf(data, { ...m, fractured: false }), rng);
    if (!r.applied) return { item, fixed: { ...pick, fractured: true }, chances, note: r.reason ?? tr("足した MOD が付けられない", "Cannot add the extra mod") };
    item = r.item;
  }
  const ts = [...candidates, ...(o.avoid ?? [])].map((c) => ({ modId: c.modId, minTierIndex: 0 })), opts = { data, sameText: true };
  const isCand = (m: StageMod): boolean => ts.some((t) => hits(m, t, opts));
  for (let i = 0; i < junk; i++) {
    let placed = false;
    for (let k = 0; k < tries && !placed; k++) {
      const x = applyCurrency(data, item, "exalt", rng);
      if (!x.applied) return { item, fixed: { ...pick, fractured: true }, chances, note: x.reason ?? tr("外れの MOD が付けられない", "Cannot add a miss mod") };
      if (x.added.some(isCand)) continue;
      item = x.item;
      placed = true;
    }
    if (!placed) return { item, fixed: { ...pick, fractured: true }, chances, note: tr("候補・避ける MOD でない MOD が付かなかった", "Could not roll a mod outside the candidates and the avoided mods") };
  }
  return { item, fixed: { ...pick, fractured: true }, chances, note: null };
}

/**
 * 狙いを付けられる所まで付けた形 (J2、完成形のカード用): 白のベースのレアに mods を順に指名で付け、付けられなかった物は left に理由と返す
 * (MOD の枠を超えた・同じ系統・アイテムレベルが足りない など、核の断りの文)。表示用で、付ける順は渡した順
 */
export function placeMods(data: PatchData, base: string, itemLevel: number, mods: readonly TierMod[], rng: () => number): { item: StageItem; left: Array<TierMod & { reason: string }> } {
  let item = freshItem(data, base, itemLevel, "rare");
  const left: Array<TierMod & { reason: string }> = [];
  for (const m of mods) {
    const r = applyCurrency(data, item, keyOf(data, m), rng);
    if (r.applied) item = r.item;
    else left.push({ ...m, reason: r.reason ?? tr("付けられない", "Cannot add") });
  }
  return { item, left };
}
