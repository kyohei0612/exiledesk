/**
 * use-tree-merge.ts — SimTreePage の戻りの見え方の動き (2026-10-22、SimTreePage が 500 行を超えるので分けた): 戻りの矢印だけの箱から行き先へ流れ込む線
 * (tree-merge.ts の mergeReqs → tree-lines の routeBacks、同じ行き先は束ねる)・&lines=a の「線を全部表示」・乗せている箱とホバーのカード
 */
import { computed, ref, watch, type Ref } from "vue";
import { BOX_H, BOX_W, type TreeBox, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { CHIP_HALF, mirrorPath, mirrorPos, mirrorSeg, roundPath, routeBacks, type BackReq, type Seg } from "./tree-lines";
import { sideRoute } from "./tree-lines-grid";
import { joinPath, mergeReqs } from "./tree-merge";
import { flag } from "../../../web/release-flags";

export function useTreeMerge(o: {
  doc: Ref<TreeDoc>; posOf: (b: TreeBox) => { x: number; y: number }; segs: () => Seg[];
  /** 箱の今の高さ (アイテムの枠で BOX_H より高い。測れなければ BOX_H。線がほかの箱を横切っていた、10-27 オーナーの絵) */ heightOf?: (id: string) => number;
  /** カードを出さない・消す時 (引っ張っている・画面が動いた・欄を開いた) */ busy: () => boolean; reset: () => unknown;
  /** 統合の線の横の区間を通す高さ (段の間、tree-row-tops の laneYs。スイッチ lineShort) */ lanes?: () => number[];
  /** 手の札の真ん中 (統合の線が避ける。札を横切っていた、線の見張り L3) */ chips?: () => Array<{ x: number; y: number }>;
}) {
  const merged = computed(() => {
    const d = o.doc.value;
    const pos = (id: string) => ({ ...o.posOf(d.boxes[id]!), w: BOX_W, h: o.heightOf?.(id) || BOX_H });
    const { reqs, lines } = mergeReqs(d, pos);
    // 統合の線 (当たり → 同じ状態の当たり) は向き合う辺どうしを、ほかの箱を避けて結ぶ (tree-merge の joinPath)
    const joinPaths = new Map<string, string>();
    // 手の札は幅が名前で変わるので広めに見る (札の幅の多くは 200 より狭い)
    const chipBoxes = (o.chips?.() ?? []).map((c) => ({ x: c.x - 100, y: c.y - CHIP_HALF, w: 200, h: CHIP_HALF * 2 }));
    const treeSegs = o.segs();
    // スイッチ retryHover: 統合の線も横の辺の真ん中どうしを最短で (S-144・S-145)。同じ箱へ 2 本以上入る時は辺の真ん中から 8 ずつずらす。通れなければ前の道 (joinPath)
    const SIDE = flag("retryHover"), allX = Object.keys(d.boxes).map(pos);
    const X0 = Math.min(...allX.map((b) => b.x)), X1 = Math.max(...allX.map((b) => b.x + b.w));
    const joins = lines.filter((l) => l.kind === "join"), nth = new Map<string, number>();
    for (const l of joins) {
      const others = [...Object.keys(d.boxes).filter((x) => x !== l.from && x !== l.to).map(pos), ...chipBoxes];
      if (SIDE) {
        const n = joins.filter((x) => x.to === l.to).length, i = nth.get(l.to) ?? 0;
        nth.set(l.to, i + 1);
        const side = sideRoute(pos(l.from), pos(l.to), others, X0, X1, { to: (i - (n - 1) / 2) * 8 });
        if (side) {
          joinPaths.set(l.id, roundPath(side));
          // 鎖の印は道の真ん中の区間の真ん中
          const a = side[Math.floor((side.length - 1) / 2)]!, z = side[Math.floor((side.length - 1) / 2) + 1] ?? a;
          l.mark = { x: (a.x + z.x) / 2, y: (a.y + z.y) / 2 };
          continue;
        }
      }
      const j = joinPath(pos(l.from), pos(l.to), others, treeSegs, o.lanes?.() ?? []);
      joinPaths.set(l.id, j.d); l.mark = j.mark;
    }
    // 行き先の箱の左の辺へ入る線はそのまま、右の辺へ入る線 (flip) は左右を裏返して同じ道の探し方で引き、描く時に戻す
    const bx = Object.keys(d.boxes).map(pos), sg = o.segs();
    const flip = reqs.filter((r) => r.flip);
    const back = routeBacks(flip.map((r) => ({ ...r, from: mirrorPos(r.from), to: mirrorPos(r.to), end: { x: -r.end.x, y: r.end.y }, start: r.start && { x: -r.start.x, y: r.start.y } })), bx.map(mirrorPos), sg.map(mirrorSeg), { bundle: true });
    const paths = routeBacks(reqs.filter((r) => !r.flip), bx, sg, { bundle: true });
    for (const [id, p] of back) paths.set(id, mirrorPath(p));
    // スイッチ retryHover: 再挑戦の線は乗せた時に 1 本だけ光るので、ほかの線を避けず 1 本ずつ引く。今の向きで木の中に通り道が無ければ反対の辺から、
    // どちらも無い時だけ前の道 (木の外の列)。全部を一緒に引くと先に引いた線に押されて外の列を回り、木を囲む四角になった (S-87c、10-28 深夜オーナー「P１は案①だな」)
    const sideIds = new Set<string>();
    if (flag("retryHover") && flag("backRoute")) {
      const kinds = new Map(lines.map((l) => [l.id, l.kind]));
      const mir = (r: BackReq): BackReq => ({ ...r, from: mirrorPos(r.from), to: mirrorPos(r.to), end: { x: -r.end.x, y: r.end.y }, start: r.start && { x: -r.start.x, y: r.start.y } });
      const other = (r: BackReq): BackReq => ({ ...r, flip: !r.flip, end: { x: r.flip ? r.to.x + 24 : r.to.x + r.to.w! - 24, y: r.end.y } });
      for (const r of reqs) {
        // 再挑戦 (back) も灰の ↩ (fwd) も乗せた時だけ 1 本ずつ (S-145)
        if (kinds.get(r.id) === "join") continue;
        // まず横の辺の真ん中どうしを最短で (S-87c、10-28 深夜オーナー「枠の横枠空いてるから最短距離で…その枠の真ん中に付ける」)。箱の上の縁へ下ろす足し (backRoute) はしない
        const others = bx.filter((b) => !(b.x === r.from.x && b.y === r.from.y) && !(b.x === r.to.x && b.y === r.to.y));
        const side = sideRoute(r.from, r.to, [...others, ...chipBoxes], Math.min(...bx.map((b) => b.x)), Math.max(...bx.map((b) => b.x + b.w)));
        if (side) { paths.set(r.id, roundPath(side)); sideIds.add(r.id); continue; }
        const one = (q: BackReq): string | undefined => q.flip ? (() => { const p = routeBacks([mir(q)], bx.map(mirrorPos), sg.map(mirrorSeg), { inside: true, avoid: chipBoxes.map(mirrorPos) }).get(q.id); return p && mirrorPath(p); })() : routeBacks([q], bx, sg, { inside: true, avoid: chipBoxes }).get(q.id);
        const o2 = other(r), p = one(r) ?? one(o2);
        if (!p) continue;
        paths.set(r.id, p);
        if (!one(r)) r.end = o2.end;
      }
    }
    // スイッチ backRoute: 道は箱の上 24 の段の間で終わるので、そこから箱の上の縁まで下ろす (空中で止まって見えた、10-28 深夜オーナー「途中で終わってる奴もある」。線の見張り L1)
    if (flag("backRoute")) for (const r of reqs) { if (sideIds.has(r.id)) continue; const p = paths.get(r.id); if (p) paths.set(r.id, `${p} L ${r.end.x} ${r.to.y}`); }
    for (const [id, p] of joinPaths) paths.set(id, p);
    return { lines, paths };
  });
  /** 帯の「線を全部表示」(このブラウザに覚える) */
  const KEY = "exiledesk.tree.lines-all";
  const linesAll = ref((() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } })());
  watch(linesAll, (on) => { try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* 覚えられなくても使える */ } });
  /** 乗せている箱 (線を濃く) と、少し待ってから出すホバーのカード (全部の箱・戻り先を選んでいる時の候補の箱も。オーナー 10-22「全てカードが出るように」) */
  const hoverBox = ref<string | null>(null);
  const cardBox = ref<string | null>(null);
  let t = 0;
  watch(hoverBox, (id) => { clearTimeout(t); cardBox.value = null; if (id) t = window.setTimeout(() => { if (hoverBox.value === id && !o.busy()) cardBox.value = id; }, 350); });
  watch(o.reset, () => { cardBox.value = null; });
  return { merged, linesAll, hoverBox, cardBox };
}
