/**
 * carry-aims.ts — ベースを替えた時に、完成の狙い・始まりの MOD (MOD と T の段) を新しいベースへ読み替える
 * (2026-10-24 オーナー「MOD 決めたけどベース選び直す使い方は多い、使える物は残す」、シミュ部長 18 本目の頼み)。
 * MOD の id は部位ごとに別 (Rings/IncreasedLife → Gloves_str/IncreasedLife)、段の数も違う (指輪 8 段・手袋 9 段) ので、
 * 新しいベースの MOD 一覧 (核の modListFor) から「同じ文・同じ系統・同じ側・同じ種類」の MOD を探し、段は同じ名前 (Virile = 指輪 T1 → 手袋 T2)、
 * 無ければ必要レベルが一番近い段 (同じなら下の段) に読み替える。見つからない物は外す
 */
import type { Mod, PatchData } from "../../../vendor/poe2htc/engine/types";
import { modListFor } from "../mod-list";
import { freshItem } from "../run-plan";
import { sharesRawFamily } from "../../mods/mod-rules";

/** 読み替えた先 (to は元の印 = fractured などをそのまま持つ) と、新しいベースに無くて外した物 */
export interface CarriedAims<A extends { modId: string; tier: number }> { kept: Array<{ from: A; to: A }>; dropped: A[] }

/** 同じ MOD とみなすか: 文 (英語の文面、無ければ日本語)・生の系統・側・種類・ルーンが同じ */
const sameMod = (a: Mod, b: Mod): boolean =>
  a.type === b.type && a.source === b.source && a.rune === b.rune && (a.text ?? a.textJa) === (b.text ?? b.textJa) && (a.text ?? a.textJa) != null && sharesRawFamily(a, b);

export function carryAims<A extends { modId: string; tier: number }>(data: PatchData, toBase: string, itemLevel: number, aims: readonly A[]): CarriedAims<A> {
  // 段の表は modListFor の行と同じ数え方 (T1 が一番上、同じ系統をまとめた行は段ごとに modId)
  const tiers = modListFor(data, freshItem(data, toBase, itemLevel, "rare")).flatMap((r) => r.tiers.map((t) => ({ ...t, modId: t.modId ?? r.id })));
  const out: CarriedAims<A> = { kept: [], dropped: [] };
  for (const a of aims) {
    if (tiers.some((t) => t.modId === a.modId && t.tier === a.tier)) { out.kept.push({ from: a, to: a }); continue; }
    const src = data.mods.get(a.modId);
    const srcTier = src?.tiers[src.tiers.length - a.tier]; // mod.tiers は下の段から並ぶ
    const cands = src && srcTier ? tiers.filter((t) => { const m = data.mods.get(t.modId); return !!m && sameMod(src, m); }) : [];
    const pick = cands.find((t) => t.name === srcTier!.name)
      ?? [...cands].sort((x, y) => Math.abs(x.ilvl - srcTier!.ilvl) - Math.abs(y.ilvl - srcTier!.ilvl) || x.ilvl - y.ilvl)[0];
    if (pick) out.kept.push({ from: a, to: { ...a, modId: pick.modId, tier: pick.tier } });
    else out.dropped.push(a);
  }
  return out;
}
