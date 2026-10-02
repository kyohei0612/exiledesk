<!--
  TreeView.vue — パッシブツリー (見るだけ、2026-10-02)
  PoB が持っているノードの位置・つながり・効果をそのまま描く。取っているノードは金色、比べる元から増えた物は緑・減った物は赤の輪。
  ジュエルの範囲は点線の円。ホイールで拡大縮小、ドラッグで移動、ノードに乗せると名前と効果 (日本語)。
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import passivesJa from "../../i18n/passives-ja-client.json";
import { linesToJa } from "../../services/pob-check/item-text";
import { gemJa, type TreeNode, type TreeState } from "../../services/pob-check/api";
import type { NodePower } from "./usePobCheck";

const props = defineProps<{
  nodes: TreeNode[];
  state: TreeState;
  baseAlloc?: number[];
  /** ノードの火力への寄与 (計算した時の物)。stale = その後にビルドを変えた */
  power?: { label: string; nodes: Map<number, NodePower>; stale: boolean } | null;
  powerProgress?: string;
  skillOptions: Array<{ key: string; name: string }>;
  /** 初めに選んでおくスキル (上のバーのスキル) */
  defaultTarget?: string;
  busy: boolean;
}>();
const emit = defineEmits<{
  (e: "power", target: string): void;
  (e: "toggle", id: number, attr: number, done: (err: string | null) => void): void;
  (e: "reset"): void;
}>();
/** 能力値のノード (筋力/器用さ/知性を選ぶ物) を取る時の選び。初めは今取っている能力値のノードで一番多い物 */
const ATTRS = [
  { i: 1, en: "Strength", ja: "筋力", cls: "text-rose-300" },
  { i: 2, en: "Dexterity", ja: "器用さ", cls: "text-emerald-300" },
  { i: 3, en: "Intelligence", ja: "知性", cls: "text-sky-300" },
] as const;
const attrPick = ref<number | null>(null);
const attrDefault = computed(() => {
  const count = [0, 0, 0, 0];
  for (const n of props.nodes) {
    if (!n.at || !alloc.value.has(n.id)) continue;
    const a = ATTRS.find((x) => x.en === n.n);
    if (a) count[a.i]!++;
  }
  const best = [1, 2, 3].sort((a, b) => count[b]! - count[a]!)[0]!;
  return count[best]! > 0 ? best : 1;
});
const attr = computed(() => attrPick.value ?? attrDefault.value);
const clickErr = ref("");
const toggling = ref(false);
const powerTarget = ref(props.defaultTarget || props.skillOptions[0]?.key || "");
watch(() => props.defaultTarget, (k) => { if (k) powerTarget.value = k; });
const powerLabel = computed(() => (props.power ? gemJa(props.power.label) : ""));
const progressLabel = computed(() => {
  const m = /^(.*) \((.*)\)$/.exec(props.powerProgress ?? "");
  return m ? `${gemJa(m[1]!)} ${m[2]}` : "";
});

const JA = passivesJa as Record<string, string>;
const nameJa = (n: string): string => (n === "Jewel Socket" ? "ジュエルソケット" : (JA[n] ?? n));
/** 名前 (ジュエルの穴は入っているジュエルの名前も) */
const nodeLabel = (n: TreeNode): string => {
  const j = n.t === "J" ? props.state.jewels.find((x) => x.id === n.id) : undefined;
  return j ? `${nameJa(n.n)} (${j.name})` : nameJa(n.n);
};
/**
 * 条件つきの効果 (直近〜していれば・〜中・エネルギー・トリガー など)。
 * PoB は設定 (Config) でその条件をオフにしているか、そもそも計算しない (メタスキルのエネルギー) ので 0 と出るが、ゲームでは効いていることがある
 */
const CONDITIONAL = /recently|if you|if an?|while|when |during|energy|meta skill|trigger|consum|duration|on kill|on hit|for each|per /i;
const isConditional = (n: TreeNode): boolean => (n.sd ?? []).some((l) => CONDITIONAL.test(l));

const wrap = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const size = ref({ w: 800, h: 600 });
/** 画面の点 = (世界の点 - 中心) × 倍率 + 画面の中心 */
const view = ref({ cx: 0, cy: 0, k: 0.02 });

const byId = computed(() => new Map(props.nodes.map((n) => [n.id, n])));
const alloc = computed(() => new Set(props.state.alloc));
const added = computed(() => (props.baseAlloc ? new Set(props.state.alloc.filter((id) => !props.baseAlloc!.includes(id))) : new Set<number>()));
const removed = computed(() => (props.baseAlloc ? new Set(props.baseAlloc.filter((id) => !alloc.value.has(id))) : new Set<number>()));

const query = ref("");
/** 検索に当たったノード (名前・効果の日本語/英語) */
const hits = shallowRef<Set<number>>(new Set());
const sdJa = shallowRef<Map<number, string[]>>(new Map());
watch(
  () => props.nodes,
  async (nodes) => {
    // 効果の日本語は 1 回だけ作る (検索と乗せた時の説明に使う)
    const m = new Map<number, string[]>();
    const all = nodes.flatMap((n) => n.sd ?? []);
    const ja = await linesToJa(all);
    let i = 0;
    for (const n of nodes) {
      const k = n.sd?.length ?? 0;
      m.set(n.id, ja.slice(i, i + k));
      i += k;
    }
    sdJa.value = m;
    fit();
  },
  { immediate: true },
);
watch([query, sdJa], () => {
  const q = query.value.trim().toLowerCase();
  if (!q) { hits.value = new Set(); draw(); return; }
  const s = new Set<number>();
  for (const n of props.nodes) {
    const text = [n.n, nameJa(n.n), ...(n.sd ?? []), ...(sdJa.value.get(n.id) ?? [])].join(" ").toLowerCase();
    if (text.includes(q)) s.add(n.id);
  }
  hits.value = s;
  draw();
});

/** 取っているノードが入るように合わせる (無ければ全体) */
function fit(): void {
  // アセンダンシーは離れた所に描かれるので、合わせる時は本体だけ
  const pts = props.nodes.filter((n) => alloc.value.has(n.id) && !n.a && n.t !== "A");
  const use = pts.length > 5 ? pts : props.nodes;
  if (!use.length) return;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const n of use) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); }
  const pad = 1500;
  const k = Math.min(size.value.w / (x1 - x0 + pad * 2), size.value.h / (y1 - y0 + pad * 2));
  view.value = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, k };
  draw();
}

const toScreen = (x: number, y: number): [number, number] => [
  (x - view.value.cx) * view.value.k + size.value.w / 2,
  (y - view.value.cy) * view.value.k + size.value.h / 2,
];

const WORLD_R: Record<TreeNode["t"], number> = { n: 30, N: 50, K: 70, J: 50, C: 80, A: 50 };
const MIN_PX: Record<TreeNode["t"], number> = { n: 1.6, N: 3, K: 4.5, J: 3.5, C: 4, A: 3 };
function nodePx(n: TreeNode): number {
  return Math.max(WORLD_R[n.t] * view.value.k, MIN_PX[n.t]);
}
const COLOR_ON: Record<TreeNode["t"], string> = { n: "#e8c46a", N: "#ffb347", K: "#f0abfc", J: "#4fd1c5", C: "#cbd5e1", A: "#c4b5fd" };

const showPower = computed(() => !!props.power && props.power.nodes.size > 0);
/** 寄与の色: 0 = 灰青 (効いていない)、少し = 黄、8% 以上 = 赤。マイナス (外すと上がる) は緑 */
function heat(loss: number): string {
  if (loss < -0.0005) return "#34d399";
  if (loss < 0.0005) return "#64748b";
  // 0.1% = 黄、1% = 橙、5% 以上 = 赤
  const t = Math.min(1, Math.max(0, Math.log10(loss / 0.001) / Math.log10(50)));
  const hue = 55 - 55 * t;
  return `hsl(${hue}, 95%, ${60 - 8 * t}%)`;
}

function draw(): void {
  const c = canvas.value;
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  const { w, h } = size.value;
  if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const k = view.value.k;
  const A = alloc.value;
  const map = byId.value;

  // ジュエルの範囲
  for (const j of props.state.jewels) {
    const n = map.get(j.id);
    if (!n || !j.r) continue;
    const [x, y] = toScreen(n.x, n.y);
    g.beginPath();
    g.arc(x, y, j.r * k, 0, Math.PI * 2);
    g.setLineDash([6, 5]);
    g.strokeStyle = j.rarity === "UNIQUE" ? "rgba(251,146,60,0.7)" : "rgba(253,224,71,0.6)";
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = j.rarity === "UNIQUE" ? "rgba(251,146,60,0.05)" : "rgba(253,224,71,0.05)";
    g.fill();
    g.setLineDash([]);
  }

  // つながり (取っていない → 取っている の順に重ねる)
  for (const pass of [0, 1]) {
    for (const a of props.nodes) {
      for (const bid of a.l) {
        const b = map.get(bid);
        if (!b) continue;
        // アセンダンシーと本体の始点のつながり・クラスの始点どうしの遠いつながりは描かない (PoB も描かない)
        if (!!a.a !== !!b.a || (a.x - b.x) ** 2 + (a.y - b.y) ** 2 > 2500 ** 2) continue;
        const on = A.has(a.id) && A.has(b.id);
        if ((pass === 1) !== on) continue;
        g.beginPath();
        if (a.r && b.r && a.gx === b.gx && a.gy === b.gy && a.r === b.r) {
          // 同じ軌道: 円弧 (短い向き)
          const [cx, cy] = toScreen(a.gx!, a.gy!);
          const t1 = Math.atan2(a.y - a.gy!, a.x - a.gx!);
          let t2 = Math.atan2(b.y - b.gy!, b.x - b.gx!);
          let d = t2 - t1;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          t2 = t1 + d;
          g.arc(cx, cy, a.r * k, t1, t2, d < 0);
        } else {
          g.moveTo(...toScreen(a.x, a.y));
          g.lineTo(...toScreen(b.x, b.y));
        }
        g.strokeStyle = on ? "rgba(232,196,106,0.85)" : "rgba(148,163,184,0.18)";
        g.lineWidth = on ? Math.max(2.2, 14 * k) : Math.max(0.8, 6 * k);
        g.stroke();
      }
    }
  }

  // ノード
  const H = hits.value;
  for (const n of props.nodes) {
    const [x, y] = toScreen(n.x, n.y);
    if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue;
    const r = nodePx(n);
    const on = A.has(n.id);
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    const pw = on && showPower.value ? props.power!.nodes.get(n.id) : undefined;
    g.fillStyle = pw ? heat(pw.loss) : on ? COLOR_ON[n.t] : n.t === "n" ? "rgba(100,116,139,0.55)" : "rgba(148,163,184,0.6)";
    g.fill();
    if (n.t !== "n" && !on) { g.strokeStyle = "rgba(203,213,225,0.35)"; g.lineWidth = 1; g.stroke(); }
    if (added.value.has(n.id) || removed.value.has(n.id)) {
      g.beginPath();
      g.arc(x, y, r + 3, 0, Math.PI * 2);
      g.strokeStyle = added.value.has(n.id) ? "#34d399" : "#fb7185";
      g.lineWidth = 2.5;
      g.stroke();
    }
    if (H.has(n.id)) {
      g.beginPath();
      g.arc(x, y, r + 5, 0, Math.PI * 2);
      g.strokeStyle = "#38bdf8";
      g.lineWidth = 2;
      g.stroke();
    }
  }

  // 大きくした時はノータブル・キーストーンの名前
  if (k > 0.09) {
    g.font = "11px sans-serif";
    g.textAlign = "center";
    for (const n of props.nodes) {
      if (n.t !== "N" && n.t !== "K") continue;
      const [x, y] = toScreen(n.x, n.y);
      if (x < 0 || y < 0 || x > w || y > h) continue;
      g.fillStyle = A.has(n.id) ? "#fde68a" : "rgba(203,213,225,0.7)";
      g.fillText(nameJa(n.n), x, y - nodePx(n) - 4);
    }
  }
}

// ---- 操作 ----
let drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
const hover = ref<{ node: TreeNode; x: number; y: number } | null>(null);
function onWheel(e: WheelEvent): void {
  const rect = canvas.value!.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const { cx, cy, k } = view.value;
  const wx = (mx - size.value.w / 2) / k + cx;
  const wy = (my - size.value.h / 2) / k + cy;
  const nk = Math.min(0.6, Math.max(0.005, k * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
  // カーソルの下の点が動かないように
  view.value = { k: nk, cx: wx - (mx - size.value.w / 2) / nk, cy: wy - (my - size.value.h / 2) / nk };
  draw();
}
function onDown(e: MouseEvent): void {
  drag = { x: e.clientX, y: e.clientY, cx: view.value.cx, cy: view.value.cy, moved: false };
}
function onMove(e: MouseEvent): void {
  const rect = canvas.value!.getBoundingClientRect();
  if (drag && (drag.moved || Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4)) {
    drag.moved = true;
    const k = view.value.k;
    view.value = { k, cx: drag.cx - (e.clientX - drag.x) / k, cy: drag.cy - (e.clientY - drag.y) / k };
    hover.value = null;
    draw();
    return;
  }
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  let best: TreeNode | null = null;
  let bd = Infinity;
  for (const n of props.nodes) {
    const [x, y] = toScreen(n.x, n.y);
    const d = (x - mx) ** 2 + (y - my) ** 2;
    if (d < Math.max(nodePx(n), 7) ** 2 && d < bd) { bd = d; best = n; }
  }
  hover.value = best ? { node: best, x: mx, y: my } : null;
}
function onUp(): void {
  drag = null;
}
/** クリック (動かさずに離した) でノードを取る / 外す */
function onClick(): void {
  const h = hover.value;
  if (!h || toggling.value || props.busy) return;
  if (h.node.t === "C" || h.node.t === "A") return;
  toggling.value = true;
  clickErr.value = "";
  emit("toggle", h.node.id, attr.value, (err) => {
    toggling.value = false;
    clickErr.value = err ?? "";
  });
}

let ro: ResizeObserver | null = null;
onMounted(() => {
  ro = new ResizeObserver(() => {
    const el = wrap.value;
    if (!el) return;
    size.value = { w: el.clientWidth, h: el.clientHeight };
    draw();
  });
  if (wrap.value) ro.observe(wrap.value);
  window.addEventListener("mouseup", onUp);
});
onBeforeUnmount(() => {
  ro?.disconnect();
  window.removeEventListener("mouseup", onUp);
});
watch(() => [props.state, props.baseAlloc, props.power], draw);

const pct = (v: number): string => `${v >= 0 ? "−" : "+"}${Math.abs(v * 100).toFixed(v !== 0 && Math.abs(v) < 0.01 ? 2 : 1)}%`;
/** 寄与の順位 (本体の取っているノードだけ。始点とアセンダンシーは外せないので除く) */
const ranking = computed(() => {
  const empty = { top: [] as Array<{ n: TreeNode; p: NodePower }>, idle: [] as Array<{ n: TreeNode; p: NodePower }>, cond: [] as Array<{ n: TreeNode; p: NodePower }> };
  if (!props.power) return empty;
  const rows = props.nodes
    .filter((n) => alloc.value.has(n.id) && !n.a && n.t !== "C" && n.t !== "A")
    .map((n) => ({ n, p: props.power!.nodes.get(n.id) }))
    .filter((x): x is { n: TreeNode; p: NodePower } => !!x.p);
  const top = [...rows].sort((a, b) => b.p.loss - a.p.loss).slice(0, 12);
  // 外しても火力が変わらない物 (1 個で ±0.05% 未満、つながりの先も込みで ±0.05% 未満)
  const zero = rows
    .filter((x) => Math.abs(x.p.loss) < 0.0005 && Math.abs(x.p.pathLoss) < 0.0005)
    .sort((a, b) => nameJa(a.n.n).localeCompare(nameJa(b.n.n)));
  // 条件つきは別にする (PoB では 0 でもゲームでは効いていることがある。外す候補にしない)
  return { top, idle: zero.filter((x) => !isConditional(x.n)), cond: zero.filter((x) => isConditional(x.n)) };
});
/** 一覧で押したノードを真ん中に */
function focusNode(id: number): void {
  const n = byId.value.get(id);
  if (!n) return;
  view.value = { k: Math.max(view.value.k, 0.08), cx: n.x, cy: n.y };
  const [x, y] = toScreen(n.x, n.y);
  hover.value = { node: n, x, y };
  draw();
}

const allocCount = computed(() => props.nodes.filter((n) => alloc.value.has(n.id) && !n.a && n.t !== "C").length);
const ascCount = computed(() => props.nodes.filter((n) => alloc.value.has(n.id) && n.a && n.t !== "A").length);
const hoverInfo = computed(() => {
  const h = hover.value;
  if (!h) return null;
  const n = h.node;
  const kind = { n: "", N: "ノータブル", K: "キーストーン", J: "ジュエルの穴", C: "クラスの始点", A: "アセンダンシーの始点" }[n.t];
  const jewel = props.state.jewels.find((j) => j.id === n.id);
  return {
    name: nodeLabel(n),
    kind,
    on: alloc.value.has(n.id),
    lines: sdJa.value.get(n.id) ?? n.sd ?? [],
    jewel: jewel?.name,
    power: props.power?.nodes.get(n.id),
    left: Math.min(h.x + 16, size.value.w - 300),
    top: Math.min(h.y + 16, size.value.h - 160),
  };
});
</script>

<template>
  <div>
    <div class="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
      <span class="rounded-lg bg-white/[0.05] px-2.5 py-1">
        取っている <b class="tabular-nums text-amber-200">{{ allocCount }}</b>
        <span class="ml-2 text-[var(--exile-color-text-tertiary)]">アセンダンシー</span> <b class="tabular-nums text-violet-200">{{ ascCount }}</b>
      </span>
      <span v-if="baseAlloc" class="rounded-lg bg-white/[0.05] px-2.5 py-1">
        比べる元から <b class="text-emerald-300">+{{ added.size }}</b> / <b class="text-rose-300">−{{ removed.size }}</b>
      </span>
      <input
        v-model="query"
        type="search"
        placeholder="ノードを探す (例: クリティカル、雷)"
        class="w-60 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1 outline-none focus:border-sky-400/60"
      />
      <span v-if="query.trim()" class="text-sky-300">{{ hits.size }} 個</span>
      <span class="flex items-center gap-1 rounded-lg bg-white/[0.05] px-2 py-0.5">
        <span class="text-[var(--exile-color-text-tertiary)]">能力値のノードは</span>
        <button
          v-for="a in ATTRS"
          :key="a.i"
          type="button"
          class="rounded px-1.5 py-px font-semibold"
          :class="attr === a.i ? ['bg-white/15', a.cls] : 'text-[var(--exile-color-text-tertiary)] hover:bg-white/10'"
          @click="attrPick = a.i"
        >{{ a.ja }}</button>
      </span>
      <button type="button" class="ml-auto rounded-lg bg-white/[0.06] px-2.5 py-1 hover:bg-white/15 disabled:opacity-40" :disabled="busy || toggling" @click="emit('reset')">ツリーを読み込んだ時に戻す</button>
      <button type="button" class="rounded-lg bg-white/[0.06] px-2.5 py-1 hover:bg-white/15" @click="fit">取っている所に合わせる</button>
    </div>
    <p v-if="clickErr" class="mb-2 rounded bg-rose-500/10 px-2 py-1 text-[12px] text-rose-300">{{ clickErr }}</p>
    <!-- 火力への寄与 -->
    <div class="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-orange-400/20 bg-orange-500/[0.06] px-3 py-2 text-[12px]">
      <span class="font-bold text-orange-200">火力への寄与</span>
      <select v-model="powerTarget" class="rounded-md border border-white/10 bg-black/40 px-2 py-0.5">
        <option v-for="o in skillOptions" :key="o.key" :value="o.key">{{ gemJa(o.name) }}</option>
      </select>
      <button
        type="button"
        class="rounded-md bg-orange-500 px-3 py-0.5 font-bold text-black disabled:opacity-40"
        :disabled="busy || !!powerProgress"
        @click="emit('power', powerTarget)"
      >{{ powerProgress ? `計算中… ${progressLabel}` : "取っているノードを 1 個ずつ外して計算" }}</button>
      <template v-if="power">
        <span class="text-[var(--exile-color-text-secondary)]">{{ powerLabel }} で計算済み</span>
        <span v-if="power.stale" class="rounded bg-amber-500/20 px-1.5 text-amber-200">その後ビルドを変えたので古い</span>
        <span class="ml-auto flex items-center gap-1 text-[10px] text-[var(--exile-color-text-tertiary)]">
          効いていない
          <span class="inline-block h-2 w-14 rounded-full" style="background: linear-gradient(90deg, #64748b, hsl(55, 95%, 60%), hsl(28, 95%, 56%), hsl(0, 95%, 52%))" />
          よく効く (外すと −5% 以上)
        </span>
      </template>
    </div>
    <div
      ref="wrap"
      class="relative h-[640px] overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(ellipse_at_center,rgba(30,41,59,0.6),rgba(2,6,23,0.9))]"
    >
      <canvas
        ref="canvas"
        class="h-full w-full cursor-grab active:cursor-grabbing"
        @wheel.prevent="onWheel"
        @mousedown="onDown"
        @click="onClick"
        @mousemove="onMove"
        @mouseleave="hover = null"
      />
      <div
        v-if="hoverInfo"
        class="pointer-events-none absolute z-10 w-[290px] rounded-lg border border-white/15 bg-slate-950/95 p-2.5 text-[12px] shadow-xl"
        :style="{ left: `${hoverInfo.left}px`, top: `${hoverInfo.top}px` }"
      >
        <p class="font-bold" :class="hoverInfo.on ? 'text-amber-200' : 'text-[var(--exile-color-text-primary)]'">
          {{ hoverInfo.name }}
          <span v-if="hoverInfo.kind" class="ml-1 text-[10px] font-normal text-[var(--exile-color-text-tertiary)]">{{ hoverInfo.kind }}</span>
        </p>
        <ul class="mt-1 space-y-px text-sky-100/90">
          <li v-for="(l, i) in hoverInfo.lines" :key="i">{{ l }}</li>
        </ul>
        <p v-if="hoverInfo.power" class="mt-1 text-[11px] font-semibold" :class="hoverInfo.power.loss > 0.0005 ? 'text-orange-300' : hoverInfo.power.loss < -0.0005 ? 'text-emerald-300' : 'text-slate-400'">
          外すと {{ powerLabel }} の DPS {{ pct(hoverInfo.power.loss) }}
          <span v-if="hoverInfo.power.n > 1" class="block text-[10px] font-normal text-[var(--exile-color-text-tertiary)]">つながらなくなる {{ hoverInfo.power.n - 1 }} 個も込みで {{ pct(hoverInfo.power.pathLoss) }}</span>
        </p>
        <p class="mt-1 text-[10px]" :class="hoverInfo.on ? 'text-amber-300' : 'text-[var(--exile-color-text-tertiary)]'">
          {{ hoverInfo.on ? "取っている (クリックで外す。つながらなくなる先も一緒に外れる)" : "取っていない (クリックで取る。始点からの一番近い道ごと)" }}
        </p>
      </div>
    </div>
    <div v-if="power" class="mt-3 grid gap-3 @3xl:grid-cols-2">
      <div class="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <p class="mb-1.5 text-[12px] font-bold text-orange-200">よく効いているノード</p>
        <ul class="space-y-0.5 text-[12px]">
          <li v-for="x in ranking.top" :key="x.n.id" class="flex cursor-pointer items-center gap-2 rounded px-1 hover:bg-white/5" @click="focusNode(x.n.id)">
            <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: heat(x.p.loss) }" />
            <span class="min-w-0 flex-1 truncate">{{ nodeLabel(x.n) }}</span>
            <span class="tabular-nums text-orange-300">{{ pct(x.p.loss) }}</span>
          </li>
        </ul>
      </div>
      <div class="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <p class="mb-1.5 text-[12px] font-bold text-slate-300">
          火力に効いていないノード
          <span class="font-normal text-[var(--exile-color-text-tertiary)]">{{ ranking.idle.length }} 個 (外しても DPS が変わらない。防御・移動・道のノードもここに入る)</span>
        </p>
        <ul class="max-h-64 space-y-0.5 overflow-auto text-[12px]">
          <li v-for="x in ranking.idle" :key="x.n.id" class="flex cursor-pointer items-center gap-2 rounded px-1 hover:bg-white/5" @click="focusNode(x.n.id)">
            <span class="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-500" />
            <span class="w-36 shrink-0 truncate">{{ nameJa(x.n.n) }}</span>
            <span class="min-w-0 flex-1 truncate text-[11px] text-[var(--exile-color-text-tertiary)]">{{ (sdJa.get(x.n.id) ?? x.n.sd ?? []).join(" / ") }}</span>
          </li>
        </ul>
        <template v-if="ranking.cond.length">
          <p class="mb-1.5 mt-3 text-[12px] font-bold text-amber-200">
            条件つきで PoB では 0 の物
            <span class="font-normal text-[var(--exile-color-text-tertiary)]">{{ ranking.cond.length }} 個 (「直近〜していれば」「エネルギー」など。PoB の設定でオフか計算しないだけで、ゲームでは効いていることがある)</span>
          </p>
          <ul class="max-h-48 space-y-0.5 overflow-auto text-[12px]">
            <li v-for="x in ranking.cond" :key="x.n.id" class="flex cursor-pointer items-center gap-2 rounded px-1 hover:bg-white/5" @click="focusNode(x.n.id)">
              <span class="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400/60" />
              <span class="w-36 shrink-0 truncate">{{ nameJa(x.n.n) }}</span>
              <span class="min-w-0 flex-1 truncate text-[11px] text-[var(--exile-color-text-tertiary)]">{{ (sdJa.get(x.n.id) ?? x.n.sd ?? []).join(" / ") }}</span>
            </li>
          </ul>
        </template>
      </div>
    </div>
    <p class="mt-1 text-[11px] text-[var(--exile-color-text-tertiary)]">ホイールで拡大縮小、ドラッグで移動、クリックで取る / 外す (計算し直して比べる元との差が出ます)。点線の円はジュエルの範囲。緑の輪 = 比べる元から増えた、赤の輪 = 減った。</p>
  </div>
</template>
