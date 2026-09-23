/**
 * useSandbox.ts — 1 手ずつ、次に作る MOD を選んで進める (2026-09-24)
 *
 * オーナー:「自動でやるのはベース決めまで。そっからは 1 手 1 手考えながら」「1 手進むごとに作る MOD を
 * 選択したらいいんじゃね。今全部忍者始動の動きだからね」。
 *
 * 流れ (1 画面ずつ):
 *   pick    … 今の指輪を見て、次に作る MOD を選ぶ (忍者の狙いは ★ で上に。外れがあれば「外れを消す」)
 *   method  … その MOD の打ち方を上位 3 つ (1 回で付く確率・1 回の値段・当たるまでの平均)
 *   result  … 打った結果を押す → 指輪が変わって pick に戻る
 * 計算は [[step-odds.ts]]。出発点はベース決めの結果 (固定済み・樹 MOD が付いた物)。
 */
import { computed, ref, shallowRef, watch } from "vue";
import { sideLimits } from "../../services/htc/bridge";
import { catalystPriceKey } from "../../services/htc/catalysing";
import { jaOfMod } from "../../services/htc/mod-text";
import { stepHelpers, type Cleanup, type ItemState, type Side, type StepMethod } from "../../services/htc/step-odds";
import { startOption, zeroStart } from "./craft-settings";
import type { useHtcCraft } from "./useHtcCraft";

/** 既定で「使わない」カタリストの値段 (1 個・神)。[[spam-plan.ts]] と同じ */
const PRICEY_DIVINE = 0.2;

type Screen =
  | { kind: "pick" }
  | { kind: "method"; modId: string; minTier: number }
  | { kind: "result"; modId: string; minTier: number; m: StepMethod }
  | { kind: "chaosAdd"; modId: string; minTier: number; m: StepMethod }
  | { kind: "cleanup" }
  | { kind: "cleanupResult"; cl: Cleanup };

interface Snap { item: ItemState; spent: number; moves: number; log: string[] }

export function useSandbox(c: ReturnType<typeof useHtcCraft>) {
  const ctx = computed(() => {
    const d = c.data.value, cls = c.base.value, p = c.prices.value;
    if (!d || !cls || !p) return null;
    const it = c.item.value;
    const div = p.currency.divine ?? 1;
    return stepHelpers({
      data: d, cls, prices: p,
      itemLevel: it ? it.itemLevel ?? 82 : zeroStart.value.itemLevel,
      limits: sideLimits(d, it ? it.baseType : zeroStart.value.baseType),
      catalystOk: (tag) => c.catalystChoice.value[tag] ?? (p.currency[catalystPriceKey(tag)] ?? Infinity) / div < PRICEY_DIVINE,
    });
  });

  /** 出発点: ベース決めの結果 (固定済みの MOD と樹 MOD の枠) */
  const startItem = (): ItemState => {
    const d = c.data.value;
    // フラクチャー品から始める時だけ、固定済みの MOD を付けた状態で始める
    const frac = startOption.value !== "plain";
    const slots: ItemState["slots"] = frac
      ? c.fracturedTargets.value.map((t) => ({ modId: t.modId, side: (d?.mods.get(t.modId)?.type ?? "prefix") as Side, fixed: true }))
      : [];
    const tree = c.item.value ? { p: c.slotsUsed.value.prefixes, s: c.slotsUsed.value.suffixes } : { p: zeroStart.value.fixedPrefix, s: zeroStart.value.fixedSuffix };
    for (let i = 0; i < tree.p; i++) slots.push({ modId: null, side: "prefix", fixed: true, label: "樹 MOD (固定済み)" });
    for (let i = 0; i < tree.s; i++) slots.push({ modId: null, side: "suffix", fixed: true, label: "樹 MOD (固定済み)" });
    // 「他の MOD 各側 1 つまで」のフラクチャー品は、各側に外れが 1 つ付いている前提
    if (startOption.value === "frac1" && c.fracturedTargets.value.length) {
      slots.push({ modId: null, side: "prefix", fixed: false }, { modId: null, side: "suffix", fixed: false });
    }
    return { slots, breach: false };
  };
  const snap = shallowRef<Snap>({ item: startItem(), spent: 0, moves: 0, log: [] });
  const history = shallowRef<Snap[]>([]);
  const screen = ref<Screen>({ kind: "pick" });
  const restartAll = (): void => { snap.value = { item: startItem(), spent: 0, moves: 0, log: [] }; history.value = []; screen.value = { kind: "pick" }; };
  watch(() => [c.targets.value, c.base.value, startOption.value], restartAll);

  /** 忍者 (貼り付け) の狙い。★ で上に出すだけで、選ぶのは人 */
  const ninja = computed(() => {
    const fixed = new Set(startOption.value !== "plain" ? c.fracturedTargets.value.map((t) => t.modId) : []);
    return new Map(c.targets.value.filter((t) => !fixed.has(t.modId)).map((t) => [t.modId, t.minTierIndex ?? 0]));
  });
  const name = (id: string | null, label?: string): string => {
    if (!id) return label ?? "外れ";
    const row = c.rows.value.find((r) => r.modId === id);
    if (row) return row.text;
    const m = c.data.value?.mods.get(id);
    return m ? jaOfMod(m) : id;
  };
  const slotName = (i: number): string => (i === -1 ? "ブリーチの MOD" : name(snap.value.item.slots[i]!.modId, snap.value.item.slots[i]!.label));

  /** 1 手打った: 費用を足し、指輪を変え、pick に戻る */
  function commit(cost: number, item: ItemState, what: string): void {
    history.value = [...history.value, snap.value];
    snap.value = { item, spent: snap.value.spent + cost, moves: snap.value.moves + 1, log: [...snap.value.log, what] };
    screen.value = { kind: "pick" };
  }
  const add = (s: ItemState, modId: string | null, side: Side): ItemState => ({ ...s, slots: [...s.slots, { modId, side, fixed: false }] });
  const remove = (s: ItemState, slot: number): ItemState => (slot === -1 ? { ...s, breach: false } : { ...s, slots: s.slots.filter((_, i) => i !== slot) });
  const back = (): void => {
    const h = history.value;
    if (screen.value.kind !== "pick") { screen.value = { kind: "pick" }; return; }
    if (!h.length) return;
    snap.value = h[h.length - 1]!;
    history.value = h.slice(0, -1);
  };

  /** 選べる MOD (★ を先に、次に一番安い打ち方の平均が安い順) */
  const rows = computed(() => {
    const h = ctx.value;
    if (!h) return [];
    const s = snap.value.item;
    return h.candidates(s).map((m) => {
      const minTier = ninja.value.get(m.id) ?? Math.max(0, m.tiers.length - 2);
      const best = h.methodsFor(s, m.id, minTier)[0] ?? null;
      return { modId: m.id, side: m.type as Side, name: name(m.id), star: ninja.value.has(m.id), minTier, best };
    }).filter((r) => r.best).sort((a, b) => Number(b.star) - Number(a.star) || a.best!.avg - b.best!.avg);
  });
  const methods = computed(() => {
    const sc = screen.value, h = ctx.value;
    return sc.kind === "method" && h ? h.methodsFor(snap.value.item, sc.modId, sc.minTier).slice(0, 3) : [];
  });
  const cleanups = computed(() => (ctx.value ? ctx.value.cleanups(snap.value.item).slice(0, 3) : []));
  const junk = computed(() => snap.value.item.slots.filter((x) => !x.fixed && !x.modId).length);

  /** 結果のボタン */
  const results = computed<Array<{ text: string; apply: () => void }>>(() => {
    const sc = screen.value, s = snap.value.item;
    if (sc.kind === "result") {
      const { m, modId } = sc, side = c.data.value?.mods.get(modId)?.type as Side;
      const hit = { text: `${name(modId)} が付いた`, apply: () => commit(m.perTry, add(s, modId, side), `${m.label} → 付いた`) };
      if (m.kind === "exalt") {
        const sides: Side[] = m.missSide ? [m.missSide] : ["prefix", "suffix"];
        return [hit, ...sides.map((x) => ({ text: `外れが付いた${sides.length > 1 ? ` (${x === "prefix" ? "プレ" : "サフィ"})` : ""}`, apply: () => commit(m.perTry, add(s, null, x), `${m.label} → 外れ`) }))];
      }
      if (m.kind === "desecrate") {
        return [hit, { text: "外れ (消去のオーブ + 光のお告げで冒涜だけ消した)", apply: () => commit(m.perTry + (m.light ?? 0), s, `${m.label} → 外れ`) }];
      }
      if (m.kind === "essence") {
        const rem = [...s.slots.map((x, i) => (!x.fixed && x.side === side ? i : -2)).filter((i) => i >= 0), ...(side === "prefix" && s.breach ? [-1] : [])];
        return rem.map((r) => ({ text: `${slotName(r)} と入れ替わった`, apply: () => commit(m.perTry, add(remove(s, r), modId, side), `${m.label} (${slotName(r)} と入れ替え)`) }));
      }
      // カオス: まず何が消えたか
      const rem = [...s.slots.map((x, i) => (x.fixed ? -2 : i)).filter((i) => i >= 0), ...(s.breach ? [-1] : [])];
      return rem.map((r) => ({ text: `${slotName(r)} が消えた`, apply: () => { snap.value = { ...snap.value, item: remove(s, r) }; screen.value = { kind: "chaosAdd", modId, minTier: sc.minTier, m }; } }));
    }
    if (sc.kind === "chaosAdd") {
      const side = c.data.value?.mods.get(sc.modId)?.type as Side;
      return [
        { text: `${name(sc.modId)} が付いた`, apply: () => commit(sc.m.perTry, add(s, sc.modId, side), `${sc.m.label} → 付いた`) },
        { text: "外れが付いた (プレ)", apply: () => commit(sc.m.perTry, add(s, null, "prefix"), `${sc.m.label} → 外れ`) },
        { text: "外れが付いた (サフィ)", apply: () => commit(sc.m.perTry, add(s, null, "suffix"), `${sc.m.label} → 外れ`) },
      ];
    }
    if (sc.kind === "cleanupResult") {
      return sc.cl.removes.map((r) => ({ text: `${slotName(r.slot)} が消えた`, apply: () => commit(sc.cl.perTry, remove(s, r.slot), `${sc.cl.label} → ${slotName(r.slot)} が消えた`) }));
    }
    return [];
  });

  return {
    snap, screen, rows, methods, cleanups, junk, results, name, restartAll, back,
    canBack: computed(() => history.value.length > 0 || screen.value.kind !== "pick"),
    toggleBreach: () => { snap.value = { ...snap.value, item: { ...snap.value.item, breach: !snap.value.item.breach } }; },
    room: (side: Side) => ctx.value?.room(snap.value.item, side) ?? false,
  };
}
