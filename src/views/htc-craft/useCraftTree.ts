/**
 * useCraftTree.ts — 作り方のツリー (手の並びと○×の行き先) と、回した結果 (2026-09-24)
 *
 * オーナー:「ツリー上、シミュレーター方式。完成までの道のりを○×で進める」「最初から入力はしない。その状態で使える
 * カレンシーのみ表示」「一番最初の○×は必ず要る」。回すのは [[sim-route.ts]]。
 *
 * 手ごとの「その手に来た時の指輪」は、手 1 から○×の行き先をたどって作る (○ = 狙いが付いた / 消去が外れを消した、
 * × = 外れが付いた / 消去が残したい MOD を消した、の代表の形)。打てる物と「1 回で○になる確率」はこの指輪で出す。
 */
import { computed, ref, shallowRef, watch } from "vue";
import { CERTAIN, simHelpers, simulateTreeChunked, type SimNode, type SimResult, type SimState } from "../../services/htc/sim-route";
import { mulberry32 } from "../../services/htc/spam-total";
import { simCtxOf, startStateOf } from "./sim-setup";
import type { Side } from "../../services/htc/step-odds";
import type { useHtcCraft } from "./useHtcCraft";

let seq = 0;
const newId = (): string => `n${Date.now().toString(36)}${(seq++).toString(36)}`;
/** 空の手 (打つ物も行き先も未設定) */
export const emptyNode = (keep: string[] = []): SimNode => ({ id: newId(), action: null, targets: [], need: 1, keep, clean: false, maxMods: null, onHit: null, onMiss: null });

export function useCraftTree(c: ReturnType<typeof useHtcCraft>) {
  const ctx = computed(() => simCtxOf(c));

  /** 出発点 ([[sim-setup.ts]])。固定済みで始める狙いは始め方で選んだ物 */
  const start = computed<SimState>(() => startStateOf(c, c.fracturedTargets.value.map((t) => t.modId)));

  /** 手の並び。最初は空の手 1 つだけ (オーナー:「最初から入力はしない」) */
  const nodes = ref<SimNode[]>([emptyNode()]);
  watch(() => [c.item.value, c.base.value, c.fracturedTargets.value.map((t) => t.modId).join()], () => { nodes.value = [emptyNode()]; result.value = null; });
  /** ツリーを空にして自分で組む (「1 から組む」。オーナー 2026-09-25: 自動で組んだ後、自分でやる時に押したらリセット) */
  function clear(): void {
    nodes.value = [emptyNode()];
    result.value = null;
  }

  const helpers = computed(() => (ctx.value ? simHelpers(ctx.value, nodes.value) : null));

  /** 手ごとの「その手に来た時の指輪」(代表)。手 1 から○×をたどって最初に来た形 */
  const states = computed(() => {
    const out = new Map<string, SimState>();
    const h = helpers.value, d = c.data.value;
    if (!h || !d || !nodes.value.length) return out;
    const byId = new Map(nodes.value.map((n) => [n.id, n]));
    const queue: Array<[string, SimState]> = [[nodes.value[0]!.id, start.value]];
    while (queue.length) {
      const [id, s] = queue.shift()!;
      if (out.has(id)) continue;
      out.set(id, s);
      const n = byId.get(id);
      if (!n) continue;
      const sideOf = (m: string): Side => (d.mods.get(m)?.type ?? "prefix") as Side;
      const a = n.action;
      // ○ の代表: 狙いのうちまだ無い物が付く / 消去は外れが消える
      let hit = s, miss = s;
      const want = n.targets.find((t) => !h.has(s, t.modId));
      const junkAt = s.slots.findIndex((x) => !x.fixed && !x.modId);
      if (a && (a.kind === "chaos" || a.kind === "exalt" || a.kind === "essence" || a.kind === "desecrate")) {
        const base = a.kind === "chaos" || a.kind === "essence" ? (junkAt >= 0 ? { ...s, slots: s.slots.filter((_, i) => i !== junkAt) } : s) : s;
        hit = want ? { ...base, slots: [...base.slots, { modId: want.modId, side: sideOf(want.modId), fixed: false }] } : base;
        const jSide: Side = a.kind === "exalt" && a.side ? a.side : a.kind === "desecrate" ? a.side : (h.room(s, "suffix") ? "suffix" : "prefix");
        miss = a.kind === "chaos" ? s : { ...s, slots: [...s.slots, { modId: null, side: jSide, fixed: false, ...(a.kind === "desecrate" ? { desecrated: true } : {}) }] };
      } else if (a && (a.kind === "annul" || a.kind === "light")) {
        const j = a.kind === "light" ? s.slots.findIndex((x) => x.desecrated) : junkAt;
        hit = j >= 0 ? { ...s, slots: s.slots.filter((_, i) => i !== j) } : s;
        const k = s.slots.findIndex((x) => !x.fixed && x.modId && n.keep.includes(x.modId));
        miss = k >= 0 ? { ...s, slots: s.slots.filter((_, i) => i !== k) } : hit;
      } else if (a?.kind === "breach") {
        hit = { ...(junkAt >= 0 && s.slots[junkAt]!.side === "prefix" ? { ...s, slots: s.slots.filter((_, i) => i !== junkAt) } : s), breach: true };
      } else if (a?.kind === "whittle") {
        hit = { ...s, breach: false };
      }
      if (n.onHit && n.onHit !== "done" && n.onHit !== "auto") queue.push([n.onHit, hit]);
      if (n.onMiss && n.onMiss !== "done" && n.onMiss !== "auto") queue.push([n.onMiss, miss]);
    }
    return out;
  });
  const stateOf = (id: string): SimState => states.value.get(id) ?? start.value;

  /**
   * 枝の置き方 (オーナー 2026-09-24:「ツリーの枝は作って良さそう」)。手 1 から ○ を先に、次に × をたどり、
   * 最初にたどり着いた枝の子として置く。2 回目以降に来る所 (戻る所) は札で出す
   */
  const layout = computed(() => {
    const byId = new Map(nodes.value.map((n) => [n.id, n]));
    const parent = new Map<string, { from: string; via: "onHit" | "onMiss" }>();
    const root = nodes.value[0]?.id;
    const placed = new Set<string>(root ? [root] : []);
    const visit = (id: string): void => {
      const n = byId.get(id);
      if (!n) return;
      for (const via of ["onHit", "onMiss"] as const) {
        const g = n[via];
        if (g && g !== "done" && g !== "auto" && byId.has(g) && !placed.has(g)) {
          placed.add(g);
          parent.set(g, { from: id, via });
          visit(g);
        }
      }
    };
    if (root) visit(root);
    return { parent, placed };
  });
  /** その手の ○ / × の枝に子として置く手 (無ければ null = 札で出す) */
  const childOf = (id: string, via: "onHit" | "onMiss"): string | null => {
    const g = nodes.value.find((n) => n.id === id)?.[via];
    const p = g ? layout.value.parent.get(g) : undefined;
    return g && p && p.from === id && p.via === via ? g : null;
  };
  const indexOf = (id: string): number => nodes.value.findIndex((n) => n.id === id);
  /** 手 1 からその手までに通る手 (枝の親をたどる。自分は入れない、手 1 が先頭) */
  const ancestors = (id: string): string[] => {
    const out: string[] = [];
    for (let p = layout.value.parent.get(id); p; p = layout.value.parent.get(p.from)) {
      if (out.includes(p.from)) break;
      out.unshift(p.from);
    }
    return out;
  };
  /** その手の枝の下にぶら下がっている手 (○ でも × でも) */
  const descendants = (id: string): Set<string> =>
    new Set(nodes.value.filter((n) => n.id !== id && ancestors(n.id).includes(id)).map((n) => n.id));
  /** 手の短い名前 (「カオス → キャストスピード…」)。行き先の選択肢と結果の表で使う */
  const KIND: Record<string, string> = {
    chaos: "カオス", exalt: "高貴", annul: "消去", essence: "エッセンス", desecrate: "冒涜", light: "光 + 消去",
    breach: "ブリーチ", whittle: "削減", quality: "品質", check: "確認",
  };
  const labelOf = (id: string): string => {
    const n = nodes.value.find((x) => x.id === id);
    if (!n?.action) return "打つ物まだ";
    const aim = n.action.kind === "essence" ? [c.stepTarget([n.action.modId])] : n.targets.map((x) => c.stepTarget([x.modId]));
    return [KIND[n.action.kind], aim.join(" / ")].filter(Boolean).join(" → ");
  };
  const unplaced = computed(() => nodes.value.filter((n) => !layout.value.placed.has(n.id)));

  /** 1 回で○になる確率 (その手の指輪から 400 回打ってみる) */
  function hitOdds(n: SimNode): number | null {
    const h = helpers.value;
    if (!h || !n.action || h.usable(stateOf(n.id), n.action)) return null;
    const rnd = mulberry32(7);
    let ok = 0;
    for (let i = 0; i < 400; i++) if (h.passes(h.apply(stateOf(n.id), n, rnd), n)) ok++;
    return ok / 400;
  }

  /**
   * 作り方の設定 (ツリーの上。オーナー 2026-09-24:「成功確率は 8 割になるまで試行とか、ツリーの上部に必要な設定を書くように。
   * そしたら試行回数も決めれる」): 予算・目標の成功確率・回す回数
   */
  const budgetDivine = ref(500);
  const targetPct = ref(80);
  const runs = ref(2000);
  /**
   * ベース代 (神)。始め方で選んだ候補の値段が入る (手で直せる)。予算と結果の額はこれ込み
   * (オーナー 2026-09-24:「最終収支に買ったベースの値段含めてなさそう」)
   */
  const baseDivine = ref(0);
  watch(() => c.startPrice.value, (v) => {
    const div = c.prices.value?.currency.divine ?? 1;
    baseDivine.value = v != null && v > 0 ? Math.round((v / div) * 10) / 10 : 0;
  }, { immediate: true });
  /** ベース代 (高貴建て) */
  const baseEx = computed(() => Math.max(0, baseDivine.value || 0) * (c.prices.value?.currency.divine ?? 1));
  const running = ref(false);
  const progress = ref<[number, number] | null>(null);
  const result = shallowRef<SimResult | null>(null);
  // 予算以内の確率はベース代込みで回した時の物なので、ベース代を変えたら回し直し
  watch(baseDivine, () => { result.value = null; });
  /** 回せない理由 (手 1 の○×が未設定、など) */
  const blocked = computed(() => {
    const first = nodes.value[0];
    if (!first?.action) return "手 1 の打つ物を選んでください";
    // 確定の手 (ブリーチ・品質など) は × が来ないので ○ だけでいい (自動で組むと手 1 がブリーチになる。2026-09-24)
    if (!first.onHit || (!first.onMiss && !CERTAIN.has(first.action.kind))) return "手 1 は ○ と × の両方の行き先が要ります";
    if (!nodes.value.some((n) => n.onHit === "done" || n.onMiss === "done")) return "どこかの行き先を「完成」にしてください (本線の最後の○)";
    return null;
  });
  async function run(): Promise<void> {
    const x = ctx.value;
    if (!x || running.value || blocked.value) return;
    running.value = true;
    result.value = null;
    try {
      // 回す前に相場を取り直す (値段は ctx の中の c.prices から引く)
      await c.refreshPrices();
      const x2 = ctx.value ?? x;
      const div = c.prices.value?.currency.divine ?? 1;
      result.value = await simulateTreeChunked({ ctx: x2, start: start.value, nodes: nodes.value, runs: Math.max(100, runs.value), budget: Math.max(0, budgetDivine.value - Math.max(0, baseDivine.value || 0)) * div },
        (done, total) => { progress.value = [done, total]; });
    } finally {
      running.value = false;
      progress.value = null;
    }
  }

  /**
   * 手の並びを画面の順 (手 1 から ○ を先・× を後にたどった順、つながっていない手は後ろ) に並べ直す。
   * 手の番号がこの並びなので、見本を読み込んだ時に途中の番号がずれない。止まった理由の「手 N」とも揃う
   */
  function ordered(list: SimNode[]): SimNode[] {
    const byId = new Map(list.map((n) => [n.id, n]));
    const out: SimNode[] = [];
    const seen = new Set<string>();
    const visit = (id: string | undefined): void => {
      const n = id ? byId.get(id) : undefined;
      if (!n || seen.has(n.id)) return;
      seen.add(n.id); out.push(n);
      for (const g of [n.onHit, n.onMiss]) if (g && g !== "done" && g !== "auto") visit(g);
    };
    visit(list[0]?.id);
    return [...out, ...list.filter((n) => !seen.has(n.id))];
  }
  /** 手を足す。残したい MOD は自動 (本線の上の手で揃えた物) なので入れない */
  function addNode(_fromState: SimState): string {
    const n = emptyNode();
    nodes.value = ordered([...nodes.value, n]);
    return n.id;
  }
  function update(id: string, patch: Partial<SimNode>): void {
    nodes.value = ordered(nodes.value.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    result.value = null;
  }
  /** 見本などを丸ごと入れる */
  function setAll(list: SimNode[]): void {
    nodes.value = ordered(list);
    result.value = null;
  }
  function remove(id: string): void {
    if (nodes.value[0]?.id === id) return;
    nodes.value = nodes.value.filter((n) => n.id !== id).map((n) => ({
      ...n, onHit: n.onHit === id ? null : n.onHit, onMiss: n.onMiss === id ? null : n.onMiss,
    }));
    result.value = null;
  }

  /** 目標の確率で完成させるのに要る額 (高貴換算)。完成しなかった回は届かない扱い。届かなければ null */
  const needForTarget = computed(() => {
    const r = result.value;
    if (!r) return null;
    const k = Math.ceil(r.runs * Math.min(100, Math.max(1, targetPct.value)) / 100);
    return k <= r.doneCosts.length ? r.doneCosts[k - 1]! + baseEx.value : null;
  });

  return { baseDivine, baseEx, clear, setAll, ctx, start, nodes, helpers, stateOf, hitOdds, addNode, update, remove, budgetDivine, targetPct, runs, needForTarget, running, progress, result, blocked, run, childOf, indexOf, unplaced, ancestors, descendants, labelOf };
}
