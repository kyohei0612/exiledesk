/**
 * use-held-shares.ts — 「このベースに付く MOD」の表 (ModTable) の、持った物で次に付く確率・灰色・札 (2026-10-30 に StageModList.vue から出した、中身はそのまま)。
 * エミュの MOD 一覧の窓 (StageModList) と、シミュの発現の MOD の窓 (TreeVeilCheck、S-38) が同じ物を呼ぶ = 同じアイテム・骨・お告げなら同じ % と灰色。
 * 計算はエンジンの heldOdds (打つ処理・計算機と同じ決まり。tests/held-odds-parity.test.ts)。held が null = 持っていない (出やすさ = 同じ側の重みの割合)
 */
import { computed, type ComputedRef } from "vue";
import { heldOdds, type ListRow, type ListTier, type PatchData, type StageItem } from "../../../services/craft-stage/engine";
import { TIER } from "../../../state/for-share/tier-word";
import { fmtPct } from "../../../utils/format-pct";
import { tr } from "../../../i18n/lang";
/** ModTable の節 (ModSection) のうち、ここで見る所だけ (.ts から .vue の型を引かない) */
type SectionLike = { columns: Array<{ items: ListRow[] }>; rune?: unknown; socketed?: boolean };

/** 持っている物 (key = カレンシー・骨などのキー、name = 画面の名前) */
export interface HeldAt { data: PatchData; item: StageItem; key: string; omens: readonly string[]; name: string }

export function useHeldShares(held: () => HeldAt | null, data: () => PatchData | null) {
  /** 持っている物で次に付く確率 (null = 持っていない / MOD を足さない物) */
  const heldCands = computed(() => {
    const h = held();
    if (!h) return null;
    const o = heldOdds(h.data, h.item, h.key, h.omens);
    return o ? { ...o, name: h.name } : null;
  });
  /** 段の番号はその MOD の段の表から (同じ系統をまとめた行は段が混ざるので、名前とレベルで引く) */
  function tierIndexOf(modId: string, t: { name: string; ilvl: number }): number {
    return data()?.mods.get(modId)?.tiers.findIndex((x) => x.name === t.name && x.ilvl === t.ilvl) ?? -1;
  }
  /** その行 (系統) が持っている物で付く確率。0 = 付かない */
  function heldShare(r: ListRow): number {
    const h = heldCands.value;
    if (!h || !(h.total > 0)) return 0;
    const ids = new Set(r.tiers.map((t) => t.modId ?? r.id));
    let w = 0;
    for (const id of ids) w += h.byMod.get(id)?.w ?? 0;
    return w / h.total;
  }
  /** その段が持っている物で付く確率 (下限より下・アイテムレベルが届かない段は 0) */
  function heldTierShare(r: ListRow, t: { name: string; ilvl: number; modId?: string }): number {
    const h = heldCands.value;
    if (!h || !(h.total > 0)) return 0;
    const id = t.modId ?? r.id;
    const idx = tierIndexOf(id, t);
    return (h.byMod.get(id)?.tiers.find((x) => x.index === idx)?.w ?? 0) / h.total;
  }
  /** 今は付かない行は 0% (同じ系統が付いている・差していないルーン。冒涜・異界は骨を持っている時だけ。2026-10-09 オーナー) */
  const cannow = (r: ListRow): boolean => !r.blocked && !(r.group === "rune" && !r.socketed) && !((r.group === "desecrated" || r.group === "otherworldly") && !(heldCands.value && "bone" in heldCands.value));
  /** 表の % と棒: 持っている時は付く確率、それ以外は出やすさ (同じ側の重みの割合) */
  const shareOf = (r: ListRow): number => (!cannow(r) ? 0 : heldCands.value ? heldShare(r) : r.share);
  const tierShareOf = (r: ListRow, t: ListTier): string => (!cannow(r) ? "0%" : heldCands.value ? fmtPct(heldTierShare(r, t)) : t.weight && r.weight ? fmtPct((r.share * t.weight) / r.weight) : "");
  const rowDim = (r: ListRow): boolean => r.blocked || (!!heldCands.value && !heldShare(r)) || (r.group === "rune" && !r.socketed);
  const rowTitle = (r: ListRow): string | undefined => (r.blocked ? tr("同じ系統の MOD が付いているので、今は付かない", "A mod from the same group is already on the item, so this cannot roll now") : heldCands.value && !heldShare(r) ? tr(`持っている ${heldCands.value.name} では付かない`, `Cannot roll with the held ${heldCands.value.name}`) : undefined);
  const tierDim = (r: ListRow, t: ListTier): boolean => !!heldCands.value && !heldTierShare(r, t);
  const tierTitle = (r: ListRow, t: ListTier): string | undefined => (heldCands.value && !heldTierShare(r, t) ? tr(`持っている ${heldCands.value.name} では付かない${TIER} (強さの下限・アイテムレベル・同じ系統)`, `This tier cannot roll with the held ${heldCands.value.name} (minimum tier, item level, or same group)`) : undefined);
  function shareTitle(r: ListRow): string {
    const h = heldCands.value;
    if (h) return "bone" in h ? tr(`持っている ${h.name} の次の発現で、候補 3 つに出る確率 (専用 MOD 1〜3 個 + 残り普通。計算機と同じ)`, `Chance to appear among the 3 options on the next reveal with the held ${h.name} (1-3 desecrated-only mods + the rest normal, same as the calculator)`) : tr(`持っている ${h.name} で次に付く確率`, `Chance to roll next with the held ${h.name}`);
    return r.group === "desecrated" || r.group === "otherworldly" ? tr("骨を使わないと付かない (骨を持つと候補に出る確率)", "Only rolls via a Bone (hold a Bone to see the chance to be offered)") : tr("出やすさ (同じ側の重みの割合)", "Chance (share of weight on the same side)");
  }
  const shareHead: ComputedRef<string> = computed(() => (heldCands.value ? ("bone" in heldCands.value ? tr("候補に出る", "Offered") : tr("付く確率", "Chance")) : tr("出やすさ", "Weight")));
  /** カレンシーを持っている時は、それで付く節を上に、付かない節を下に (2026-10-11 オーナー)。持っていない時は差していないルーンだけ下 */
  const sectionLate = (sec: SectionLike): boolean => (heldCands.value ? !sec.columns.some((c) => c.items.some((r) => heldShare(r) > 0)) : sec.rune != null && !sec.socketed);
  return { heldCands, tierIndexOf, heldShare, heldTierShare, cannow, shareOf, tierShareOf, rowDim, rowTitle, tierDim, tierTitle, shareTitle, shareHead, sectionLate };
}
