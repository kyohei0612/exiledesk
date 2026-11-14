/**
 * use-tree-flow.ts — ツリーの見え方を Vue Flow の上で (2026-10-22 オーナー「Vue Flow を入れて、拡大縮小は中身を読んで合わせる」)。
 * 前の use-tree-view.ts (自前のスクロールと scale) と同じ形で外へ出す: 倍率 zoom・見るだけ viewOnly・全体 fit・等倍 resetZoom・
 * 寄る reveal・画面の点 → ツリーの座標 toWorld・全画面 full。
 *
 * 視点 (場所と大きさ) の作りは 3 つ (決まりは設計図 sim-tree.md の S-147a の表): ここ = 大きさの段・開く・全体・箱へ寄る・送れる端・枠の幅、
 * use-tree-cam-follow.ts = 木を変えた後 (手を決める・箱が増える / 減る・箱の背)、tree-cam-math.ts = 決まった値と式。
 * 視点を書くのは下の put・center・scale の 3 つだけ (ほかの所で f.setViewport などを直に呼ばない)。
 *
 * ページの CSS zoom (WebApp.vue の fitZoom、Z = 0.85〜1.6) との合わせ方: ツリーの枠だけ zoom 1/Z を掛けて打ち消す (SimTreePage の枠)。
 * 枠の中は実質 1 倍なので、Vue Flow の座標 (clientX − getBoundingClientRect、d3-zoom の transform) がマウスと揃う。
 * そのままだと箱が 1/Z に小さく見えるので、Vue Flow の倍率は Z 倍で持つ: 画面の「100%」= Vue Flow の zoom Z。
 * (Vue Flow 1.48.2 の pointer() と getEventPosition() を読んで確かめた: 枠の BCR とマウスの clientX はどちらも拡大後のピクセル)
 */
import { computed, ref, watch, type Ref, nextTick } from "vue";
import { useVueFlow } from "@vue-flow/core";
import { BOX_H, BOX_W, boundsOf, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { drawnKids } from "../../../services/simulator/tree/tree-row-tops";
import { pageZoom } from "../../../utils/zoom";
import { VIEW_ONLY_MAX } from "../../../utils/use-phone";
import { flag } from "../../../web/release-flags";
import { BAR_H, CALM_Z, FIT_MIN, LEFT_PAD, NEXT_H, OPEN_MIN, OPEN_QUIET, PAD_MIN, PHONE_MIN, VIEW_ONLY, WHEEL_RATE, WHEEL_STEP, ZOOM_LEVELS, ZOOM_MAX, ZOOM_MIN, edgeLimit, fitZoom, laneClear, laneSnap, levelsWith, openPlace, snapTo, zoomAt, type Area } from "./tree-cam-math";
import { useTreeCamFollow } from "./use-tree-cam-follow";
import { laneSize } from "./tree-lane-band";

export const FLOW_ID = "sim-tree";

/** id = Vue Flow の名前 (スイッチ tabKeep の間は描き面ごと)、root = 描き面の外枠 (段の札の帯を探す所。無ければ木の枠、S-09c) */
export function useTreeFlow(doc: Ref<TreeDoc>, id = FLOW_ID, root?: () => Element | null) {
  const f = useVueFlow(id);
  const inRoot = (sel: string): Element | null => (root?.() ?? document.querySelector("[data-tree-frame]"))?.querySelector(sel) ?? null;
  /** 視点を書く口: 置く・ツリーの座標の点を枠の真ん中へ・今見ている真ん中を軸に大きさだけ */
  const put = (x: number, y: number, zoom: number): Promise<unknown> => f.setViewport({ x, y, zoom });
  const center = (wx: number, wy: number, zoom: number): Promise<unknown> => f.setCenter(wx, wy, { zoom });
  const scale = (zoom: number): Promise<unknown> => f.zoomTo(zoom);
  /** ページの zoom (枠で打ち消す量)。画面の幅が変わると WebApp.vue が掛け直すので、その後で読み直す */
  const pageZ = ref(pageZoom());
  /** 画面の倍率 (前と同じ 100% = 箱が拡大前の CSS ピクセルどおり) */
  const zoom = computed(() => f.viewport.value.zoom / pageZ.value);
  const viewOnly = computed(() => zoom.value < VIEW_ONLY - 1e-6);
  const minZoom = computed(() => (levels()[0] ?? ZOOM_MIN) * pageZ.value);
  const maxZoom = computed(() => ZOOM_MAX * pageZ.value);
  const full = ref(false);
  const bounds = computed(() => boundsOf(doc.value));
  /** 始まりの箱の左の端 (無ければ null) */
  const startX = (): number | null => doc.value.boxes.start?.x ?? null;

  /** 木全体が入る倍率 (段に丸めない。枠が無い間は null) */
  function wholeZoom(): number | null {
    const w = f.dimensions.value.width, h = f.dimensions.value.height;
    if (!w || !h) return null;
    return fitZoom(bounds.value, startX(), w, h, topY(), treeBottom(), flag("treeGrowRight")) / pageZ.value;
  }
  /**
   * 今の木で使える段。20% でも全体が入らない PC の木だけ、全体が入る倍率まで下に足す (S-147d、10-26 夜の 10% の点は開いた時の話で、開いた時は 75% のまま)
   */
  const levels = (): readonly number[] => (innerWidth < VIEW_ONLY_MAX ? ZOOM_LEVELS : levelsWith(wholeZoom()));
  const snapZoom = (z: number): number => snapTo(levels(), z);

  /** 倍率を変える (段に吸い付く。at = 軸にする画面の点 (clientX / clientY)、無ければ画面の真ん中。clear = 段の札の帯にかぶる箱を寄せる (人が大きさを変えた時、S-147k)) */
  async function setZoom(z: number, at?: { x: number; y: number }, clear = true): Promise<void> {
    const to = snapZoom(z) * pageZ.value, vp = f.viewport.value;
    if (!at && !(clear && laneOn())) { await scale(to); return; }
    // 軸の点の下のツリーの座標が、倍率を変えた後も同じ画面の点に来るように (軸が無い時は枠の真ん中)
    const w = f.dimensions.value.width, h = f.dimensions.value.height;
    const n = zoomAt(vp, at ? f.screenToFlowCoordinate(at) : { x: (w / 2 - vp.x) / vp.zoom, y: (h / 2 - vp.y) / vp.zoom }, to);
    await (clear ? zoomPut(n.x, n.y, n.zoom) : put(n.x, n.y, n.zoom));
  }
  /** スイッチ treeZoomLane (S-147k): 大きさを変えた後に段の札の帯にかぶる箱を横だけ帯の外へ。PC の木だけ (スマホの形 U-53 は今のまま) */
  const laneOn = (): boolean => flag("treeZoomLane") && innerWidth >= VIEW_ONLY_MAX;
  function zoomPut(x: number, y: number, zoom: number): Promise<unknown> {
    if (!laneOn()) return put(x, y, zoom);
    return put(laneX(x, y, zoom), y, zoom);
  }
  /** 視点 (x, y, zoom) で段の札の帯にかぶる箱を横だけ帯の外へ出す視点の x (S-147k の laneClear) */
  function laneX(x: number, y: number, zoom: number): number {
    const bs = f.getNodes.value.filter((n) => !n.hidden).map((n) => ({ x: n.position.x, y: n.position.y, h: n.dimensions.height || BOX_H }));
    return laneClear(bs, { x, y, zoom }, laneWAt(zoom), f.dimensions.value.height);
  }
  /** 今より 1 段上 / 下 (段の間にいる時は近い側の次) */
  const stepZoom = (dir: 1 | -1, at?: { x: number; y: number }): Promise<void> => {
    const ls = levels(), z = zoom.value, next = dir > 0 ? ls.find((l) => l > z + 1e-3) : [...ls].reverse().find((l) => l < z - 1e-3);
    return setZoom(next ?? (dir > 0 ? ZOOM_MAX : ls[0]!), at);
  };
  const zoomIn = (): Promise<void> => stepZoom(1);
  const zoomOut = (): Promise<void> => stepZoom(-1);
  /** ホイール (タッチパッドのピンチ = ctrl + ホイールも) はマウスの所を軸に 1 段ずつ。Vue Flow のホイールの拡大縮小は切ってある (SimTreePage) */
  let wheelAcc = 0, wheelT = 0;
  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    clearTimeout(wheelT);
    wheelT = window.setTimeout(() => { wheelAcc = 0; }, 200);
    wheelAcc += e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1);
    if (Math.abs(wheelAcc) < WHEEL_STEP) return;
    const dir = wheelAcc < 0 ? 1 : -1;
    wheelAcc = 0;
    // スイッチ treeFineWheel (S-147i): 1 回で今の大きさの 1 割 (段に吸い付かない)。マウスの下の点を軸に、下限・上限で止める
    if (flag("treeFineWheel")) {
      const vp = f.viewport.value, to = Math.min(maxZoom.value, Math.max(minZoom.value, vp.zoom * (dir > 0 ? WHEEL_RATE : 1 / WHEEL_RATE)));
      const n = zoomAt(vp, f.screenToFlowCoordinate({ x: e.clientX, y: e.clientY }), to);
      if (to !== vp.zoom) void zoomPut(n.x, n.y, n.zoom);
      return;
    }
    void stepZoom(dir, { x: e.clientX, y: e.clientY });
  }
  /** 一番上の箱を置く高さ (0 完成形の設定は枠の左上の札、10-23。スマホは札 (高さ約 110px) の下へ) */
  const topY = (): number => (innerWidth < VIEW_ONLY_MAX ? 130 : 40);
  /**
   * 木の下の端 (ツリーの座標)。箱の高さは Vue Flow が測った物 (中のアイテムの枠で BOX_H より高い) + 下の＋の分
   * (前は BOX_H で数え、全体表示でも下の段の箱が枠の外に 124px 切れた、10-26 モンキー 8 の 1)
   */
  const treeBottom = (): number => Math.max(...Object.values(doc.value.boxes).map((b) => b.y + (f.findNode(b.id)?.dimensions.height || BOX_H) + NEXT_H));
  /**
   * 木の面の左に重ねた段の札の帯の幅 (画面の px = 木の面の px、TreeLaneTags の inside)。開いた時の寄せはこの分を左に空けて、
   * 左端の箱が「n 段目」の下に入らないように (11-11 オーナー「この点線をツリー中として」で帯を木の面の中へ移した)
   */
  const laneW = (): number => inRoot("[data-tree-lane-band]")?.getBoundingClientRect().width ?? 0;
  /**
   * 倍率 z (Vue Flow の倍率) の時の帯の幅 (S-147k)。帯の幅は札の字の大きさ (laneSize) に比例するので、今描いている幅 × 字の大きさの比。
   * 今描いている字の大きさは札の style から読む (視点を書いた直後は描き直しの前で、帯はまだ前の倍率の幅)
   */
  function laneWAt(z: number): number {
    const w = laneW(), fs = parseFloat((inRoot("[data-tree-lane]") as HTMLElement | null)?.style.fontSize ?? "");
    return fs > 0 ? w * laneSize(z) / fs : w;
  }
  /**
   * 開いた時・全体表示の合わせに使う木の範囲 (S-142h、スイッチ treeOpenStartLeft): 描く箱だけで数え (畳んで描かない消去の続きの箱は古い位置のまま)、
   * 左の端は始まりの箱そのもの (木は始まりから右と下へだけ伸びる)。スイッチの外は全部の箱
   */
  function openBounds(): Area {
    const d = doc.value, st = d.boxes.start;
    if (!st || !flag("treeOpenStartLeft")) return bounds.value;
    const seen = new Set<string>();
    const go = (id: string): void => { const b = d.boxes[id]; if (!b || seen.has(id)) return; seen.add(id); for (const k of drawnKids(d, b)) go(k); };
    go("start");
    const bs = [...seen].map((id) => d.boxes[id]!), y0 = Math.min(...bs.map((b) => b.y));
    return { x: st.x, y: y0, w: Math.max(...bs.map((b) => b.x + BOX_W)) - st.x, h: Math.max(...bs.map((b) => b.y + BOX_H)) - y0 };
  }
  /** 始まりの箱を枠の横の真ん中に置いた時、木全体が収まる一番大きい段 (上は topY、下は余白だけ。100% まで。枠が無い間は null) */
  function fitLevel(): number | null {
    const b = openBounds(), w = f.dimensions.value.width - laneW(), h = f.dimensions.value.height;
    if (!w || !h) return null;
    const fz = fitZoom(b, startX(), w, h, topY(), treeBottom(), flag("treeGrowRight")) / pageZ.value;
    return [...levels()].reverse().find((l) => l <= Math.min(1, fz) + 1e-6) ?? levels()[0]!;
  }
  /** 開いた時の置き場を段 lv で (式は tree-cam-math の openPlace。完成形の窓は木の枠の外の右の列へ移したので、窓を避けて下げる処理は外した、10-26 夜) */
  function placeOf(lv: number, left = false): { x: number; y: number; z: number } {
    const lw = laneW();
    return openPlace(openBounds(), startX(), lw, f.dimensions.value.width - lw, lv * pageZ.value, topY(), flag("treeGrowRight"), left);
  }
  /**
   * fitAll = 下の段が枠の外に出るなら、収まるまで倍率を 1 段ずつ下げる (全体表示だけ。PC は木の全体が入る倍率まで S-147d、スマホは FIT_MIN まで)。
   * 開いた時・整列の後は下げるだけで縮めない (10-26 夜ブラック 13: 縮めて 10% になった)
   */
  async function startTop(lv: number, fitAll = false, left = false): Promise<void> {
    let p = placeOf(lv, left);
    const h = f.dimensions.value.height;
    const ls = levels(), low = innerWidth < VIEW_ONLY_MAX ? FIT_MIN : 0;
    for (let i = ls.indexOf(lv); fitAll && i > 0 && ls[i - 1]! >= low && treeBottom() * p.z + p.y > h - PAD_MIN; i--) p = placeOf(ls[i - 1]!);
    await put(p.x, p.y, p.z);
  }
  /** 全体に合わせる (「1」・右下の道具)。PC は木の全体が入る倍率まで (S-147d)。whole = スマホでも 50% の下限を使わず木の全体 (回すの 1 人目が歩く時。光る枠を画面の外へ出さない) */
  async function fit(whole = false): Promise<void> {
    const lv = fitLevel();
    if (lv == null) return;
    // スマホの形 (U-53) は 50% より小さくしない (20% で箱の字が読めなかった、10-22)
    if (!whole && (innerWidth < VIEW_ONLY_MAX)) await startTop(Math.max(lv, PHONE_MIN));
    else await startTop(lv, true);
  }
  /** 開いた時の寄りを呼んだ回数 (S-147h: 木を変えた後の縮めが、木を開く・タブを替える時の寄りを上書きしないように見る) */
  let opens = 0;
  /** 最後に開いた時の寄りを掛けた時刻 (その直後の並べ直しでは視点を動かさない) */
  let openAt = -OPEN_QUIET;
  /**
   * 開いた時の見え方 (10-25 オーナー「任せる」、23 本目の決め): 木全体が収まる段 (100% まで)。
   * 75% (OPEN_MIN) 未満でしか収まらない時は 75% (前は 100% で始まりを上の真ん中にしていて、木の下が枠の外にあった)。
   * どちらも始まりの箱は横の真ん中・一番上 (10-26 オーナー)
   */
  async function openView(): Promise<void> {
    opens++;
    openAt = performance.now();
    // スイッチ treeOpenStartLeft (S-142h): 箱の並べ直し (use-row-settle、同じ番の後ろで動く) が済んでから置く。前は並べ直す前の位置 (枝が左へ伸びた形) で置き、始まりの箱が右端に出た。
    // 横に入らない木 (今までの開く大きさ = 75% 以上で横が枠に入らない) は 50% で始まりの箱を左上へ、入る木は今までどおり (その大きさで真ん中)
    const late = flag("treeOpenStartLeft") && innerWidth >= VIEW_ONLY_MAX, mine = opens; // スマホの形 (U-53) は今のまま
    if (late) { await nextTick(); if (mine !== opens) return; }
    const lv = fitLevel();
    if (lv == null) { await goHome(); return; }
    /** 今までの開く大きさで横が枠に入らない木か (スイッチ treeOpenStartLeft の時だけ見る) */
    const wide = (l: number): boolean => late && openBounds().w * Math.max(l, OPEN_MIN) * pageZ.value > f.dimensions.value.width - laneW() - 2 * LEFT_PAD;
    const place = (l: number): Promise<void> => (wide(l) ? startTop(CALM_Z, false, true) : startTop(Math.max(l, OPEN_MIN)));
    await place(lv);
    openAt = performance.now();
    if (!late) return;
    // 箱の背が測れた後の並べ直しで木の幅が変わった時だけ、人が動かしていなければ置き直す
    const set = { ...f.viewport.value };
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const now = f.viewport.value;
    if (mine !== opens || now.x !== set.x || now.y !== set.y || now.zoom !== set.zoom) return;
    const lv2 = fitLevel();
    if (lv2 != null) await place(lv2);
    openAt = performance.now();
  }
  /** 完成形の設定などを見に行く前の寄りと位置 (戻ったらそのまま。10-26 モンキー 7 の 10、メモ feedback-basic-flow「閉じたら前の位置」) */
  let kept: { x: number; y: number; zoom: number; key: string } | null = null;
  /** 木の中身の目印 (ベースと箱の数。変わっていたら前の寄りは別の木の物) */
  const docKey = (): string => `${doc.value.base}|${Object.keys(doc.value.boxes).length}`;
  // 木の枠が隠れて幅 0 の間の寄りは覚えない (開いた時の寄せが効いていない寄りを、戻った時にそのまま戻してしまう。スイッチ viewFromZero)
  const keepView = (): void => { if (!f.dimensions.value.width) { kept = null; return; } const v = f.getViewport(); kept = { x: v.x, y: v.y, zoom: v.zoom, key: docKey() }; };
  /**
   * 覚えた寄りへ戻す。覚えていない・木が変わった (新しいツリーでベースを選んだ等) 時は開いた時の寄り
   * (前は新しい木でも開く前の寄り (0, 0) へ戻し、スタートの箱が左上の完成形の窓の下に入った、10-26 夜オーナー「めっちゃかぶるやん」)
   */
  async function backView(): Promise<void> { const k = kept; kept = null; if (k && k.key === docKey()) await put(k.x, k.y, k.zoom); else await openView(); }
  /** 始まりの箱を上の真ん中へ、等倍で (一望から等倍に戻した時。真ん中を軸にすると枝の間の空き所に出た、10-22) */
  const goHome = (): Promise<void> => startTop(1);
  /** 等倍に戻す。一望 (VIEW_ONLY 未満) からは始まりへ、75% 以上の時は今見ている真ん中を軸に */
  async function resetZoom(): Promise<void> {
    if (viewOnly.value) await goHome(); else await setZoom(1);
  }
  /** 画面の点 (マウスの clientX / clientY) → ツリーの座標 (箱の x・y と同じ) */
  const toWorld = (clientX: number, clientY: number): { x: number; y: number } => f.screenToFlowCoordinate({ x: clientX, y: clientY });
  /** 箱を見える所へ (center = 真ん中へ。そうでなければ外れている時だけ) */
  async function reveal(id: string, mid = false): Promise<void> {
    const b = doc.value.boxes[id];
    if (!b) return;
    const { x, y, zoom: z } = f.viewport.value, w = f.dimensions.value.width, h = f.dimensions.value.height, m = 24;
    // スイッチ nextInView (S-147c): 箱の本当の高さ + 下の ＋ まで (帯「! 未設定」の下に ＋ を隠さない)
    const sx = b.x * z + x, sy = b.y * z + y, sw = BOX_W * z, sh = ((f.findNode(id)?.dimensions.height || BOX_H) + NEXT_H) * z;
    // 帯「! 未設定」は枠の下に重なるので、その分だけ見える高さが狭い。箱の真ん中でなく箱と ＋ の全体を見える所の真ん中へ (背の高い箱の ＋ が帯の裏へ落ちた、11-02 オーナーのレシピの b29)
    // 11-11 から札は木の面の上に浮くので (TreeUnsetBar)、札の帯の高さを見える高さから引く
    const bar = document.querySelector("[data-tree-unset-bar]") ? BAR_H * pageZ.value : 0;
    const out = sx < m || sy < m || sx + sw > w - m || sy + sh > h - bar - m;
    if (!(mid || out)) return;
    await center(b.x + BOX_W / 2, sh > h - bar - m * 2 ? b.y + (h / 2 - m) / z : b.y + sh / (2 * z) + bar / (2 * z), z);
    // 寄せた後も段の札の帯にかぶる箱を横だけ帯の外へ (S-147l、「未設定 → 次へ」の飛び先など。11-13 オーナー「被り直して」)。寄せた箱が枠から出る送りはしない
    if (!laneOn()) return;
    const v = f.viewport.value, nx = laneX(v.x, v.y, v.zoom), bx = b.x * v.zoom + nx;
    if (nx !== v.x && bx >= 0 && bx + BOX_W * v.zoom <= w) await put(nx, v.y, v.zoom);
  }
  // 木を変えた後の視点 (手を決める・箱が増える / 減る・箱の背、S-147c・S-147e・S-147h) は use-tree-cam-follow.ts
  const follow = useTreeCamFollow(doc, f, { pageZ, put, center, setZoom: (z: number) => setZoom(z, undefined, false), openView, reveal, opens: () => opens, openAt: () => openAt });
  /**
   * 木を送れる範囲の左と上の端 (S-142h、スイッチ treeOpenStartLeft): 木は始まりの箱から右と下へだけ伸びるので、始まりの箱が開いた時の位置 (横に入らない木 = 木の面の左上、
   * 入る木 = 木が真ん中に来る所) より右・下へは送れない = 左と上の空きを見せない。手で左へ引っ張った箱がある時はその箱まで。スマホの形 (U-53) は今のまま
   */
  watch(() => `${f.viewport.value.x}|${f.viewport.value.y}|${f.viewport.value.zoom}`, () => {
    // スイッチ treeZoomLane (S-147k): ここは描き直しの前なので帯はまだ前の倍率の幅。倍率 z の幅で数える (古い幅で端を数えると、帯の右へ出した箱を帯の下へ押し戻した)
    const d = doc.value, { x, y, zoom: z } = f.viewport.value, lw = laneOn() ? laneWAt(z) : laneW(), w = f.dimensions.value.width - lw;
    if (!flag("treeOpenStartLeft") || innerWidth < VIEW_ONLY_MAX || !d.boxes.start || w <= 0) return;
    const b = openBounds(), ns = f.getNodes.value;
    const { mx, my } = edgeLimit(b, Math.min(b.x, ...ns.map((n) => n.position.x)), Math.min(b.y, ...ns.map((n) => n.position.y)), lw, w, z, topY());
    if (x > mx + 0.5 || y > my + 0.5) void put(Math.min(x, mx), Math.min(y, my), z);
  }, { flush: "sync" });
  // スイッチ laneSnapDrag (S-147n): 手で引っ張り終えた時、段の札の帯の線で半分に切れた箱を横だけ送る (視点だけ。箱は動かさない)。
  // 引っ張り (マウス・指の押して動かす) だけ。ホイール・トラックパッドの送り (wheel) と、寄せ・開いた時など人の操作でない動き (sourceEvent 無し) は見ない
  const dragOf = (e: unknown): boolean => { const t = (e as { sourceEvent?: { type?: string } } | null)?.sourceEvent?.type ?? ""; return /^(mouse|pointer|touch)/.test(t); };
  let dragX0: number | null = null;
  f.onMoveStart(({ event }) => { dragX0 = dragOf(event) ? f.viewport.value.x : null; });
  f.onMoveEnd(({ event }) => {
    const x0 = dragX0; dragX0 = null;
    if (x0 == null || !dragOf(event) || !flag("laneSnapDrag") || !laneOn()) return;
    const v = f.viewport.value;
    if (Math.abs(v.x - x0) < 1) return;
    const bs = f.getNodes.value.filter((n) => !n.hidden).map((n) => ({ x: n.position.x, y: n.position.y, h: n.dimensions.height || BOX_H }));
    const nx = laneSnap(bs, v, laneWAt(v.zoom), f.dimensions.value.height, v.x - x0);
    if (Math.abs(nx - v.x) > 0.5) void put(nx, v.y, v.zoom);
  });
  async function toggleFull(): Promise<void> { full.value = !full.value; }
  /** 箱の枠の上の位置 (ページの CSS ピクセル = 実ピクセル ÷ ページの zoom。ポップアップ・ホバーのカードの置き場)。W・H = 枠の大きさ */
  function rectOf(b: { x: number; y: number }, w = BOX_W, h = BOX_H): { left: number; top: number; right: number; bottom: number; W: number; H: number } {
    const { x, y, zoom: z } = f.viewport.value, Z = pageZ.value;
    return { left: (b.x * z + x) / Z, top: (b.y * z + y) / Z, right: ((b.x + w) * z + x) / Z, bottom: ((b.y + h) * z + y) / Z, W: f.dimensions.value.width / Z, H: f.dimensions.value.height / Z };
  }
  /** 今見ている所 (ツリーの座標。ミニマップの枠) */
  const view = computed(() => {
    const { x, y, zoom: z } = f.viewport.value;
    return { x: -x / z, y: -y / z, w: f.dimensions.value.width / z, h: f.dimensions.value.height / z };
  });
  /** ミニマップで押した所 (ツリーの座標) を真ん中へ */
  const centerOn = (wx: number, wy: number): Promise<void> => center(wx, wy, f.viewport.value.zoom).then(() => {});

  // 画面の幅が変わってページの zoom が変わったら、見た目の倍率をそのまま保つ
  const onResize = (): void => {
    requestAnimationFrame(() => {
      const z = pageZoom();
      if (Math.abs(z - pageZ.value) < 1e-4) return;
      const keep = zoom.value;
      pageZ.value = z;
      void scale(snapZoom(keep) * z);
    });
  };
  window.addEventListener("resize", onResize);
  f.onPaneReady(() => { void openView(); });
  /** 段の札の帯 (枠の外の左の列、S-147f) の幅の増えた分。枠の左の端がその分右へ動くので、次の幅の変わりで箱が画面の同じ所に残るように送る */
  let laneD = 0;
  const laneShift = (d: number): void => { laneD += d; };
  // 右の欄を開いた時など、枠の幅が変わっても見ている真ん中は動かさない (Vue Flow は左上を軸にするので、何もしなければ左上が残る)
  watch(() => f.dimensions.value.width, (w, old) => {
    // 幅 0 (木の枠が隠れていた) から幅が出た = 開いた時の寄せをやり直す。隠れたまま組まれると寄せが効かず、スタートが枠の左上に出た
    // (10-27 夜オーナー r/C6YHoWk2、本番 v0.1.634。エミュの「シミュレーターへ」→ 完成形のページ → 決めた で同じ形を作れた。スイッチ viewFromZero)
    if (!old && w) { void nextTick(() => openView()); return; }
    if (!old || !w) { laneD = 0; return; }
    const vp = f.viewport.value, d = laneD;
    laneD = 0;
    void put(vp.x + (w - old) / 2 - d / 2, vp.y, vp.zoom);
  });

  return { flow: f, pageZ, zoom, viewOnly, minZoom, maxZoom, full, bounds, view, setZoom, zoomIn, zoomOut, onWheel, fit, openView, keepView, backView, goHome, resetZoom, toWorld, reveal, ...follow, toggleFull, centerOn, rectOf, laneShift, dispose: () => window.removeEventListener("resize", onResize) };
}
