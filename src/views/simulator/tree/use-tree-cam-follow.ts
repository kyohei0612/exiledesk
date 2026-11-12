/**
 * use-tree-cam-follow.ts — 木を変えた後の視点 (設計図 sim-tree.md の S-147a の表の「手を足す・替える」「箱が増える」「手を消す」「箱の背が変わる」の行と
 * 「手の窓を開く」の行。細かい決まりは S-147c・S-147e・S-147h)。use-tree-flow.ts の useTreeFlow が中で 1 回だけ呼ぶ (外からは useTreeFlow の返す名前で使う)。
 * 視点を書くのは cam の put・center・setZoom だけ。式は tree-cam-math.ts。
 */
import { nextTick, watch, type Ref } from "vue";
import type { useVueFlow } from "@vue-flow/core";
import { BOX_H, BOX_W, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { flag } from "../../../web/release-flags";
import { BAR_H, CALM_Z, HELD_MS, NEXT_H, OPEN_MIN, OPEN_QUIET, extentOf, isOut, nudgeInto } from "./tree-cam-math";

/** use-tree-flow.ts から渡す物 (視点を書く口と、開いた時の寄りの様子) */
export type TreeCam = {
  /** ページの zoom */
  pageZ: Ref<number>;
  /** 視点を置く */
  put: (x: number, y: number, zoom: number) => Promise<unknown>;
  /** ツリーの座標の点を枠の真ん中へ */
  center: (wx: number, wy: number, zoom: number) => Promise<unknown>;
  /** 倍率を変える (段に吸い付く、今見ている真ん中が軸) */
  setZoom: (z: number) => Promise<void>;
  /** 開いた時の寄り */
  openView: () => Promise<void>;
  /** 箱を見える所へ (外れている時だけ) */
  reveal: (id: string) => Promise<void>;
  /** 開いた時の寄りを呼んだ回数 */
  opens: () => number;
  /** 最後に開いた時の寄りを掛けた時刻 */
  openAt: () => number;
};

export function useTreeCamFollow(doc: Ref<TreeDoc>, f: ReturnType<typeof useVueFlow>, cam: TreeCam) {
  const { pageZ } = cam;
  const heightOf = (id: string): number => f.findNode(id)?.dimensions.height || BOX_H;
  /** 箱の位置と測った高さの並び (並べ直しが済んだかを見る) */
  const sig = (ids: readonly string[]): string => ids.map((id) => { const b = doc.value.boxes[id]; return b ? `${b.x},${b.y},${f.findNode(id)?.dimensions.height ?? 0}` : ""; }).join("|");
  /** 箱の高さが測れて並べ直し (use-row-settle) が済むまで待つ (S-147c: 位置と高さが 2 コマ続けて同じ、最長 30 コマ) */
  async function settled(now: () => string): Promise<void> {
    let last = "", same = 0;
    for (let i = 0; i < 30 && same < 2; i++) { await new Promise((r) => requestAnimationFrame(r)); const s = now(); same = s === last ? same + 1 : 0; last = s; }
  }
  /**
   * 箱の数が変わった時 (横の ＋・手を足す・戻す・やり直し) に、新しく出た箱とそれと同じ段の箱のどれかが枠の外なら、開いた時の寄りに合わせ直す
   * (10-27 モンキー 9 の 6・7: 横の ＋ の後に左右の箱が枠の外、白紙 → 戻すで左右がはみ出したまま)。消えただけの時は動かさない
   */
  let seen = new Set(Object.keys(doc.value.boxes));
  /** 手を決めている間は下の見直しを通さない (視点は holdBox が決める、S-147e) */
  let holding = false;
  /** 最後に手を決めた箱 (S-147h の軸) */
  let held: { id: string; at: number } | null = null;
  watch(() => Object.keys(doc.value.boxes).length, async () => {
    const now = Object.keys(doc.value.boxes), fresh = now.filter((id) => !seen.has(id));
    seen = new Set(now);
    // スイッチ treeCalmCamera (S-147h): 木を変えた後は視点を動かさない (1 つ戻す・打ち直しで木の頭へ飛んで見失った)。大きさだけ、50% より大きければ今見ている真ん中を軸に 50% へ
    // (木を開く・タブを替えるで箱の数が変わった時は開いた時の寄りが決めるので、その間に openView が呼ばれたら触らない)
    if (flag("treeCalmCamera")) { const o = cam.opens(); if (!holding) { await nextTick(); await nextTick(); if (o === cam.opens() && !holding && !(flag("treeOpenStartLeft") && performance.now() - cam.openAt() < OPEN_QUIET) && f.viewport.value.zoom > CALM_Z * pageZ.value + 1e-3) await cam.setZoom(CALM_Z); } return; }
    if (!fresh.length || holding) return;
    await nextTick(); await nextTick();
    // スイッチ nextInView (S-147c): 箱の高さが測れて並べ直しが済むまで待つ
    await settled(() => sig(fresh));
    // 箱がまとめて戻った (白紙 → 戻す・レシピを開いた等、4 つ以上) は整列の後と同じ見え方 (開いた時の寄り、モンキー 9 の 7)
    if (fresh.length > 3) { await cam.openView(); return; }
    const ys = new Set(fresh.map((id) => doc.value.boxes[id]?.y));
    // nextInView: 帯「! 未設定」が数え直しの間だけ消えていても、帯の分を下に空けて数える (新しい箱はたいてい未設定で、帯がすぐ戻る)
    const vp = f.viewport.value, z = vp.zoom, w = f.dimensions.value.width, h = f.dimensions.value.height - BAR_H * pageZ.value, m = 8;
    const e = extentOf(Object.values(doc.value.boxes).filter((b) => ys.has(b.y)), heightOf);
    if (!isOut(e, vp, w, h, m)) return;
    // 今の倍率で入るなら、入る所まで最小限だけ動かす (手を足すたびに上へ戻すと組んでいる所を見失う)。入らない時だけ開いた時の寄りへ
    if ((e.r - e.l) * z > w - 2 * m || (e.b - e.t) * z > h - 2 * m) {
      // 今の倍率で入らない: 開いた時の下限 (OPEN_MIN) 以上で入るならそこまで縮めて段の真ん中へ、入らなければ新しい箱を真ん中に (段は送って見る)
      const z2 = Math.min(z, (w - 2 * m) / (e.r - e.l), (h - 2 * m) / (e.b - e.t));
      if (z2 >= OPEN_MIN) await cam.center((e.l + e.r) / 2, (e.t + e.b) / 2, z2);
      else { const nb = doc.value.boxes[fresh[0]!]!; await cam.center(nb.x + BOX_W / 2, nb.y + BOX_H / 2, z); }
      return;
    }
    const to = nudgeInto(e, vp, w, h, m);
    await cam.put(to.x, to.y, z);
  });
  /** 手の窓を開く時の箱の画面の場所 (窓を開く寄せの前。holdBox はここへ戻す) */
  let spot: { id: string; sx: number; sy: number } | null = null;
  const noteSpot = (id: string): void => { const b = doc.value.boxes[id], { x, y, zoom: z } = f.viewport.value; spot = b ? { id, sx: b.x * z + x, sy: b.y * z + y } : null; };
  /** 窓を開く寄せの後の視点 (閉じる時に人が動かしていないかを見る) */
  let opened: { x: number; y: number; zoom: number } | null = null;
  /** 手の窓を開いた時の寄せ (外れていた箱を見える所へ)。閉じた時に backSpot が戻す */
  async function revealSpot(id: string): Promise<void> { await cam.reveal(id); opened = { ...f.viewport.value }; }
  /** 手の窓を選ばずに閉じた: 窓を開く寄せの分だけ視点を戻す (S-147e)。手を決めた時は holdBox が spot を使う。開いている間に人が動かした視点はそのまま */
  async function backSpot(): Promise<void> {
    const p = spot, was = opened, b = p ? doc.value.boxes[p.id] : null, { x, y, zoom: z } = f.viewport.value;
    spot = null; opened = null;
    if (!p || !b || !was || was.x !== x || was.y !== y || was.zoom !== z) return;
    await cam.put(p.sx - b.x * z, p.sy - b.y * z, z);
  }
  /**
   * 手を決めた後も触った箱を画面の同じ場所に (S-147e)。edit = 木を組み替えて触った箱の今の id を返す。
   * 箱が 4 つ以上増えても開いた時の寄りへ戻さない。手を足す時は結果の箱が枠の外なら入る向きだけ最小限動かす (S-147c)。手を変える時は結果の箱の頭が全く見えない時だけ動かす
   */
  async function holdBox(id: string, edit: () => string): Promise<void> {
    const was = doc.value.boxes[id];
    if (!was) { edit(); return; }
    const { x: x0, y: y0, zoom: z } = f.viewport.value, sx = spot?.id === id ? spot.sx : was.x * z + x0, sy = spot?.id === id ? spot.sy : was.y * z + y0, changed = !!was.hand;
    spot = null;
    holding = true;
    try {
      const to = edit();
      // 手を決めた箱を、その後しばらくの並べ直しの軸にする (S-147h)
      held = { id: to, at: performance.now() };
      // S-147h: 50% より大きい時は 50% へ縮めて、触った箱を同じ場所に (50% 以下ならその大きさのまま)
      const zc = flag("treeCalmCamera") && z > CALM_Z * pageZ.value + 1e-3 ? CALM_Z * pageZ.value : z;
      const put = async (): Promise<void> => { const b = doc.value.boxes[to]; if (b) await cam.put(sx - b.x * zc, sy - b.y * zc, zc); };
      const kidsOf = (): NonNullable<typeof was>[] => (doc.value.boxes[to]?.outs ?? []).flatMap((k) => doc.value.boxes[k] ?? []);
      await put();
      await nextTick(); await nextTick();
      await settled(() => sig([to, ...kidsOf().map((b) => b.id)]));
      await put();
      const kids = kidsOf();
      if (!kids.length || flag("treeCalmCamera")) return; // S-147h: 触った箱を同じ場所に保つだけ (結果の箱へは寄せない)
      // 未設定の帯は 0 の時も置くので (TreeUnsetBar)、木の面の高さは札が出ても変わらない。帯の高さを下に空けて数える
      const { x, y } = f.viewport.value, w = f.dimensions.value.width, h = f.dimensions.value.height - BAR_H * pageZ.value, m = 8;
      const e = extentOf(kids, heightOf);
      const head = BOX_H * z / 2;
      if (changed && e.l * z + x < w - m && e.r * z + x > m && e.t * z + y < h - m - head && e.t * z + y > m) return;
      const n = nudgeInto(e, { x, y, zoom: z }, w, h, m);
      if (n.x !== x || n.y !== y) await cam.put(n.x, n.y, z);
    } finally { holding = false; }
  }
  /**
   * 箱の背や置き場が変わった (言葉の切り替え・中身の変わり。箱は同じ) 時、変わる前に＋まで全部見えていた箱は、＋が木の面の下へ出たら見える所まで最小限だけ上へ寄せる
   * (上端は見えたまま)。どの幅・高さでも同じ (11-10 最終チェック: 英語にすると箱の背が伸び、＋が木の面の下へ出て「未設定 → 次へ」の札の裏で押せなかった)
   */
  let laid = new Map<string, { y: number; h: number }>();
  watch(() => f.getNodes.value.map((n) => `${n.id}:${n.position.y}:${n.dimensions.height}`).join("|"), async () => {
    const was = laid, now = new Map(f.getNodes.value.map((n) => [n.id, { y: n.position.y, h: n.dimensions.height || BOX_H }] as const));
    laid = now;
    if (holding || flag("treeCalmCamera") || !was.size || was.size !== now.size || [...now.keys()].some((k) => !was.has(k))) return;
    const { x, y, zoom: z } = f.viewport.value, h = f.dimensions.value.height, m = 8;
    // はみ出した箱 (前は＋まで見えていて、今は＋が木の面の下へ出た) だけで寄せる。上限はその箱の上端 (ほかの見えていた箱の上端では止めない = 1920 で上の段の箱が止めていた)
    // 見えていたかは木の面の中にあれば良い (余白 0。NEXT_H は＋の下端より数 px 大きいので、余白を取ると下端ぎりぎりの＋が漏れた = 1660・1920 の試し)
    const over = [...was].filter(([, o]) => o.y * z + y >= 0 && (o.y + o.h + NEXT_H) * z + y <= h).map(([k]) => now.get(k)!).filter((o) => (o.y + o.h + NEXT_H) * z + y > h - m);
    if (!over.length) return;
    const bottom = Math.max(...over.map((o) => o.y + o.h + NEXT_H)), top = Math.min(...over.map((o) => o.y));
    const ny = Math.max(h - m - bottom * z, m - top * z);
    if (ny < y) await cam.put(x, ny, z);
  });
  /**
   * 木を変えて並びが動いた時 (1 つ戻す・やり直し・手を消す・箱の背が変わった後の並べ直し) も、見ていた箱を画面の同じ場所に (S-147h)。
   * 並べ方は始まりの箱を動かさず親を子の真ん中に置くので、視点をそのままにすると見ていた枝が横へずれた (11-12 オーナー「特にツリーがどっかいくしカメラもキモイ」)。
   * 軸 = 手を決めた直後はその箱、そのほかは画面の真ん中に一番近い見えていた箱 (前にも今にもある箱)。手を決めている間は holdBox、木を開いた直後は開いた時の寄りが決める
   */
  let posWas = new Map<string, { x: number; y: number }>();
  watch(() => f.getNodes.value.map((n) => `${n.id}:${n.position.x}:${n.position.y}`).join("|"), () => {
    const was = posWas, now = new Map(f.getNodes.value.map((n) => [n.id, { x: n.position.x, y: n.position.y }] as const));
    posWas = now;
    const t = performance.now(), { x, y, zoom: z } = f.viewport.value, w = f.dimensions.value.width, h = f.dimensions.value.height;
    if (holding || !flag("treeCalmCamera") || !was.size || !w || !h || t - cam.openAt() < OPEN_QUIET || f.getNodes.value.some((n) => n.dragging)) return;
    // S-142h (スイッチ treeGrowRight): 右へだけ広がるので、見えていた箱のどれかが動いていなければ視点はそのまま (右へ送られた箱を軸にしない)
    const grow = flag("treeGrowRight");
    let best: string | null = null, near = Infinity;
    for (const [id, o] of was) {
      const p = now.get(id);
      if (!p) continue;
      const sx = (o.x + BOX_W / 2) * z + x, sy = (o.y + BOX_H / 2) * z + y;
      if (sx < 0 || sy < 0 || sx > w || sy > h) continue;
      if (grow && p.x === o.x && p.y === o.y) return;
      const far = id === held?.id && t - held.at < HELD_MS ? -1 : Math.hypot(sx - w / 2, sy - h / 2);
      if (far < near) { near = far; best = id; }
    }
    const o = best ? was.get(best)! : null, n = best ? now.get(best)! : null;
    if (o && n && (o.x !== n.x || o.y !== n.y)) void cam.put(x - (n.x - o.x) * z, y - (n.y - o.y) * z, z);
  });
  return { holdBox, noteSpot, revealSpot, backSpot };
}
