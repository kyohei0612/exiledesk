/**
 * use-tree-flow.ts — ツリーの見え方を Vue Flow の上で (2026-10-22 オーナー「Vue Flow を入れて、拡大縮小は中身を読んで合わせる」)。
 * 前の use-tree-view.ts (自前のスクロールと scale) と同じ形で外へ出す: 倍率 zoom・見るだけ viewOnly・全体 fit・等倍 resetZoom・
 * 寄る reveal・画面の点 → ツリーの座標 toWorld・全画面 full。
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

export const FLOW_ID = "sim-tree";
/**
 * 倍率は決まった段だけ (10-22 オーナー: 自由な値だと 76% で札がくっついて重なった)。ホイール・＋−・全体表示・幅が変わった時もこの段に吸い付く。
 * 75% は縮めたまま組める一番下の段 (VIEW_ONLY)、それ未満は見るだけ。20% は見本の木にプレフィックスをつないで 25% でも収まらなくなった分 (10-22)。
 * 15%・10% は 10-26 に全体表示のために足したが、本番で木が 10% の点になったので外した (10-26 夜オーナー「なんでこうしたの、めっちゃ引きのやつ」)
 */
const ZOOM_LEVELS = [0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5] as const;
const ZOOM_MIN = ZOOM_LEVELS[0];
const ZOOM_MAX = ZOOM_LEVELS[ZOOM_LEVELS.length - 1]!;
/** 一番近い段 */
const snapTo = (levels: readonly number[], z: number): number => levels.reduce((a, l) => (Math.abs(l - z) < Math.abs(a - z) ? l : a), levels[0]!);
/** 20% でも入らない木の時だけ足す段 (S-147d) */
const WHOLE_STEPS = [0.15, 0.1] as const;
/** ホイールの量をためてから 1 段動かす (マウスの 1 目盛り ≒ 100、タッチパッドは細かく来る) */
const WHEEL_STEP = 60;
/** ホイール 1 回の倍率 (S-147i、スイッチ treeFineWheel) */
const WHEEL_RATE = 1.1;
/** これ未満は箱の中の物を押させず、箱を押すと等倍の編集のポップアップ (ボタンが 24px の 3/4 = 18px を切る。10-22 オーナー「75% 未満の見るだけをやめる」) */
const VIEW_ONLY = 0.75;
/** スマホの全体表示の一番小さい段 */
const PHONE_MIN = 0.5;
/**
 * 開いた時の一番小さい段 (これ未満でしか収まらない木は、この段で始まりの箱を上の真ん中)。組める一番下の段 VIEW_ONLY と同じ
 * (50% にしていた時は 5 箱の木でも 67% = 見るだけで開き、箱の ＋ が隠れた。10-25 ブラック「＋ が隠れない事を優先」)
 */
const OPEN_MIN = VIEW_ONLY;
/** 木を変えた後の大きさの境目 (S-147h、スイッチ treeCalmCamera): これより大きければここへ縮め、以下ならそのまま */
const CALM_Z = 0.5;
/** 開いた時の寄りの後、箱の背が測れて並べ直しが済むまでの間 (この間は見ていた箱を軸に視点を送らない、S-147h) と、手を決めた箱を軸にする間 */
const OPEN_QUIET = 1500, HELD_MS = 3000;
/** 「全体を表示」の一番小さい段 (これより大きい木は下が枠の外に出てよい。10-26 夜ブラック 13「全体表示は下限 25%」) */
const FIT_MIN = 0.25;
/** 全体に合わせる時の余白の下限 */
const PAD_MIN = 12;
/** 右へ伸びる木 (S-142h) が枠に入らない時の左の余白 */
const LEFT_PAD = 24;
/** 箱の下の外の＋ (TreeBox の data-tree-next、真ん中が箱の 68px 下・28px) の分 */
const NEXT_H = 88;

export function useTreeFlow(doc: Ref<TreeDoc>) {
  const f = useVueFlow(FLOW_ID);
  /** ページの zoom (枠で打ち消す量)。画面の幅が変わると WebApp.vue が掛け直すので、その後で読み直す */
  const pageZ = ref(pageZoom());
  /** 画面の倍率 (前と同じ 100% = 箱が拡大前の CSS ピクセルどおり) */
  const zoom = computed(() => f.viewport.value.zoom / pageZ.value);
  const viewOnly = computed(() => zoom.value < VIEW_ONLY - 1e-6);
  const minZoom = computed(() => (levels()[0] ?? ZOOM_MIN) * pageZ.value);
  const maxZoom = computed(() => ZOOM_MAX * pageZ.value);
  const full = ref(false);
  const bounds = computed(() => boundsOf(doc.value));

  /** 木全体が入る倍率 (段に丸めない。枠が無い間は null) */
  function wholeZoom(): number | null {
    const b = bounds.value, st = doc.value.boxes.start, w = f.dimensions.value.width, h = f.dimensions.value.height;
    if (!w || !h) return null;
    const sx = st ? st.x + BOX_W / 2 : b.x + b.w / 2, half = flag("treeGrowRight") ? 0.5 * b.w : Math.max(sx - b.x, b.x + b.w - sx);
    return Math.min((w / 2 - PAD_MIN) / half, (h - topY() - PAD_MIN) / (treeBottom() - b.y)) / pageZ.value;
  }
  /**
   * 今の木で使える段。20% でも全体が入らない PC の木だけ、全体が入る倍率まで下に足す (S-147d、10-26 夜の 10% の点は開いた時の話で、開いた時は 75% のまま)
   */
  function levels(): readonly number[] {
    if (innerWidth < VIEW_ONLY_MAX) return ZOOM_LEVELS;
    const fit = wholeZoom();
    if (fit == null || fit >= ZOOM_MIN) return ZOOM_LEVELS;
    return [fit, ...WHOLE_STEPS.filter((l) => l > fit * 1.1), ...ZOOM_LEVELS].sort((a, b) => a - b);
  }
  const snapZoom = (z: number): number => snapTo(levels(), z);

  /** 倍率を変える (段に吸い付く。at = 軸にする画面の点 (clientX / clientY)、無ければ画面の真ん中) */
  async function setZoom(z: number, at?: { x: number; y: number }): Promise<void> {
    const to = snapZoom(z) * pageZ.value, vp = f.viewport.value;
    if (!at) { await f.zoomTo(to); return; }
    // 軸の点の下のツリーの座標が、倍率を変えた後も同じ画面の点に来るように
    const w = f.screenToFlowCoordinate(at);
    await f.setViewport({ x: w.x * vp.zoom + vp.x - w.x * to, y: w.y * vp.zoom + vp.y - w.y * to, zoom: to });
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
      const vp = f.viewport.value, to = Math.min(maxZoom.value, Math.max(minZoom.value, vp.zoom * (dir > 0 ? WHEEL_RATE : 1 / WHEEL_RATE))), w = f.screenToFlowCoordinate({ x: e.clientX, y: e.clientY });
      if (to !== vp.zoom) void f.setViewport({ x: w.x * vp.zoom + vp.x - w.x * to, y: w.y * vp.zoom + vp.y - w.y * to, zoom: to });
      return;
    }
    void stepZoom(dir, { x: e.clientX, y: e.clientY });
  }
  /** 一番上の箱を置く高さ (0 完成形の設定は枠の左上の札、10-23。スマホは札 (高さ約 110px) の下へ) */
  const topY = (): number => (innerWidth < VIEW_ONLY_MAX ? 130 : 40);
  /**
   * 始まりの箱を枠の横の真ん中に置いた時、木全体が収まる一番大きい段 (上は topY、下は余白だけ。100% まで)。
   * 左右は始まりの箱の真ん中から遠い方の端まで (始まりを真ん中に置くので、片側に伸びた木はその側の分を両側に取る)
   */
  /**
   * 木の下の端 (ツリーの座標)。箱の高さは Vue Flow が測った物 (中のアイテムの枠で BOX_H より高い) + 下の＋の分
   * (前は BOX_H で数え、全体表示でも下の段の箱が枠の外に 124px 切れた、10-26 モンキー 8 の 1)
   */
  const treeBottom = (): number => Math.max(...Object.values(doc.value.boxes).map((b) => b.y + (f.findNode(b.id)?.dimensions.height || BOX_H) + NEXT_H));
  /**
   * 木の面の左に重ねた段の札の帯の幅 (画面の px = 木の面の px、TreeLaneTags の inside)。開いた時の寄せはこの分を左に空けて、
   * 左端の箱が「n 段目」の下に入らないように (11-11 オーナー「この点線をツリー中として」で帯を木の面の中へ移した)
   */
  const laneW = (): number => document.querySelector("[data-tree-frame] [data-tree-lane-band]")?.getBoundingClientRect().width ?? 0;
  /**
   * 開いた時・全体表示の合わせに使う木の範囲 (S-142h、スイッチ treeOpenStartLeft): 描く箱だけで数え (畳んで描かない消去の続きの箱は古い位置のまま)、
   * 左の端は始まりの箱そのもの (木は始まりから右と下へだけ伸びる)。スイッチの外は全部の箱
   */
  function openBounds(): { x: number; y: number; w: number; h: number } {
    const d = doc.value, st = d.boxes.start;
    if (!st || !flag("treeOpenStartLeft")) return bounds.value;
    const seen = new Set<string>();
    const go = (id: string): void => { const b = d.boxes[id]; if (!b || seen.has(id)) return; seen.add(id); for (const k of drawnKids(d, b)) go(k); };
    go("start");
    const bs = [...seen].map((id) => d.boxes[id]!), y0 = Math.min(...bs.map((b) => b.y));
    return { x: st.x, y: y0, w: Math.max(...bs.map((b) => b.x + BOX_W)) - st.x, h: Math.max(...bs.map((b) => b.y + BOX_H)) - y0 };
  }
  function fitLevel(): number | null {
    const b = openBounds(), st = doc.value.boxes.start, w = f.dimensions.value.width - laneW(), h = f.dimensions.value.height;
    if (!w || !h) return null;
    const sx = st ? st.x + BOX_W / 2 : b.x + b.w / 2;
    // S-142h (スイッチ treeGrowRight): 木は右へだけ伸びるので、幅は木の幅そのまま (始まりを真ん中に置かない)
    const half = flag("treeGrowRight") ? 0.5 * b.w : Math.max(sx - b.x, b.x + b.w - sx);
    // 木の左の外の段の目印 (TreeBandLayer、画面の上で約 110px × ページの zoom。部品は 11-02 に消した) の分も左を空ける (1280 で目印が枠の外に切れた、10-22)
    // 段の目印を出さない時 (スイッチ noBand、10-28 夜オーナー「これいらんなもう　消してくれわかりづらいし」) は左を空けない
    const fz = Math.min((w / 2 - PAD_MIN) / half, (h - topY() - PAD_MIN) / (treeBottom() - b.y)) / pageZ.value;
    return [...levels()].reverse().find((l) => l <= Math.min(1, fz) + 1e-6) ?? levels()[0]!;
  }
  /**
   * 始まりの箱を枠の横の真ん中・木の一番上を上の端 (topY) に、段 lv で。
   * (10-26 オーナー「スタートは必ずツリーを真ん中に配置して開始、それも一番上ね」)。完成形の窓は木の枠の外の右の列へ移したので、窓を避けて下げる処理は外した (10-26 夜)
   */
  function placeOf(lv: number, left = false): { x: number; y: number; z: number } {
    const b = openBounds(), st = doc.value.boxes.start, lw = laneW(), w = f.dimensions.value.width - lw;
    const z = lv * pageZ.value, sx = st ? st.x + BOX_W / 2 : b.x + b.w / 2;
    // S-142h (スイッチ treeGrowRight): 木が枠に入るなら木の真ん中を枠の真ん中へ、入らなければ木の左端 (始まりの箱) を枠の左へ
    const x = flag("treeGrowRight") ? (!left && b.w * z <= w - 2 * LEFT_PAD ? lw + w / 2 - (b.x + 0.5 * b.w) * z : lw + LEFT_PAD - b.x * z) : lw + w / 2 - sx * z;
    const y = topY() - b.y * z;
    return { x, y, z };
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
    await f.setViewport({ x: p.x, y: p.y, zoom: p.z });
  }
  /** 全体に合わせる (「1」・右下の道具)。PC は木の全体が入る倍率まで (S-147d)。whole = スマホでも 50% の下限を使わず木の全体 (回すの 1 人目が歩く時。光る枠を画面の外へ出さない) */
  async function fit(whole = false): Promise<void> {
    const lv = fitLevel();
    if (lv == null) return;
    // スマホの形 (U-53) は 50% より小さくしない (20% で箱の字が読めなかった、10-22)
    if (!whole && (innerWidth < VIEW_ONLY_MAX)) await startTop(Math.max(lv, PHONE_MIN));
    else await startTop(lv, true);
  }
  /**
   * 開いた時の見え方 (10-25 オーナー「任せる」、23 本目の決め): 木全体が収まる段 (100% まで)。
   * 75% (OPEN_MIN) 未満でしか収まらない時は 75% (前は 100% で始まりを上の真ん中にしていて、木の下が枠の外にあった)。
   * どちらも始まりの箱は横の真ん中・一番上 (10-26 オーナー)
   */
  /** 開いた時の寄りを呼んだ回数 (S-147h: 木を変えた後の縮めが、木を開く・タブを替える時の寄りを上書きしないように見る) */
  let opens = 0;
  /** 最後に開いた時の寄りを掛けた時刻 (その直後の並べ直しでは視点を動かさない) と、最後に手を決めた箱 (S-147h の軸) */
  let openAt = -OPEN_QUIET, held: { id: string; at: number } | null = null;
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
    const put = (l: number): Promise<void> => (wide(l) ? startTop(CALM_Z, false, true) : startTop(Math.max(l, OPEN_MIN)));
    await put(lv);
    openAt = performance.now();
    if (!late) return;
    // 箱の背が測れた後の並べ直しで木の幅が変わった時だけ、人が動かしていなければ置き直す
    const set = { ...f.viewport.value };
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const now = f.viewport.value;
    if (mine !== opens || now.x !== set.x || now.y !== set.y || now.zoom !== set.zoom) return;
    const lv2 = fitLevel();
    if (lv2 != null) await put(lv2);
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
  async function backView(): Promise<void> { const k = kept; kept = null; if (k && k.key === docKey()) await f.setViewport({ x: k.x, y: k.y, zoom: k.zoom }); else await openView(); }
  /** 始まりの箱を上の真ん中へ、等倍で (一望から等倍に戻した時。真ん中を軸にすると枝の間の空き所に出た、10-22) */
  const goHome = (): Promise<void> => startTop(1);
  /** 等倍に戻す。一望 (VIEW_ONLY 未満) からは始まりへ、75% 以上の時は今見ている真ん中を軸に */
  async function resetZoom(): Promise<void> {
    if (viewOnly.value) await goHome(); else await setZoom(1);
  }
  /** 画面の点 (マウスの clientX / clientY) → ツリーの座標 (箱の x・y と同じ) */
  const toWorld = (clientX: number, clientY: number): { x: number; y: number } => f.screenToFlowCoordinate({ x: clientX, y: clientY });
  /** 箱を見える所へ (center = 真ん中へ。そうでなければ外れている時だけ) */
  async function reveal(id: string, center = false): Promise<void> {
    const b = doc.value.boxes[id];
    if (!b) return;
    const { x, y, zoom: z } = f.viewport.value, w = f.dimensions.value.width, h = f.dimensions.value.height, m = 24;
    // スイッチ nextInView (S-147c): 箱の本当の高さ + 下の ＋ まで (帯「! 未設定」の下に ＋ を隠さない)
    const sx = b.x * z + x, sy = b.y * z + y, sw = BOX_W * z, sh = ((f.findNode(id)?.dimensions.height || BOX_H) + NEXT_H) * z;
    // 帯「! 未設定」は枠の下に重なるので、その分だけ見える高さが狭い。箱の真ん中でなく箱と ＋ の全体を見える所の真ん中へ (背の高い箱の ＋ が帯の裏へ落ちた、11-02 オーナーのレシピの b29)
    // 11-11 から札は木の面の上に浮くので (TreeUnsetBar)、札の帯の高さ 44 を見える高さから引く
    const bar = document.querySelector("[data-tree-unset-bar]") ? 44 * pageZ.value : 0;
    const out = sx < m || sy < m || sx + sw > w - m || sy + sh > h - bar - m;
    if (center || out) await f.setCenter(b.x + BOX_W / 2, sh > h - bar - m * 2 ? b.y + (h / 2 - m) / z : b.y + sh / (2 * z) + bar / (2 * z), { zoom: z });
  }
  /**
   * 箱の数が変わった時 (横の ＋・手を足す・戻す・やり直し) に、新しく出た箱とそれと同じ段の箱のどれかが枠の外なら、開いた時の寄りに合わせ直す
   * (10-27 モンキー 9 の 6・7: 横の ＋ の後に左右の箱が枠の外、白紙 → 戻すで左右がはみ出したまま)。消えただけの時は動かさない
   */
  let seen = new Set(Object.keys(doc.value.boxes));
  /** 手を決めている間は下の見直しを通さない (視点は holdBox が決める、S-147e) */
  let holding = false;
  watch(() => Object.keys(doc.value.boxes).length, async () => {
    const now = Object.keys(doc.value.boxes), fresh = now.filter((id) => !seen.has(id));
    seen = new Set(now);
    // スイッチ treeCalmCamera (S-147h): 木を変えた後は視点を動かさない (1 つ戻す・打ち直しで木の頭へ飛んで見失った)。大きさだけ、50% より大きければ今見ている真ん中を軸に 50% へ
    // (木を開く・タブを替えるで箱の数が変わった時は開いた時の寄りが決めるので、その間に openView が呼ばれたら触らない)
    if (flag("treeCalmCamera")) { const o = opens; if (!holding) { await nextTick(); await nextTick(); if (o === opens && !holding && !(flag("treeOpenStartLeft") && performance.now() - openAt < OPEN_QUIET) && f.viewport.value.zoom > CALM_Z * pageZ.value + 1e-3) await setZoom(CALM_Z); } return; }
    if (!fresh.length || holding) return;
    await nextTick(); await nextTick();
    // スイッチ nextInView (S-147c): 箱の高さが測れて並べ直し (use-row-settle) が済むまで待つ (新しい箱の位置と高さが 2 コマ続けて同じ、最長 30 コマ)
    {
      const sig = (): string => fresh.map((id) => { const b = doc.value.boxes[id]; return b ? `${b.x},${b.y},${f.findNode(id)?.dimensions.height ?? 0}` : ""; }).join("|");
      let last = "", same = 0;
      for (let i = 0; i < 30 && same < 2; i++) { await new Promise((r) => requestAnimationFrame(r)); const s = sig(); same = s === last ? same + 1 : 0; last = s; }
    }
    // 箱がまとめて戻った (白紙 → 戻す・レシピを開いた等、4 つ以上) は整列の後と同じ見え方 (開いた時の寄り、モンキー 9 の 7)
    if (fresh.length > 3) { await openView(); return; }
    const ys = new Set(fresh.map((id) => doc.value.boxes[id]?.y));
    // nextInView: 帯「! 未設定」(TreeUnsetBar、高さ 44) が数え直しの間だけ消えていても、帯の分を下に空けて数える (新しい箱はたいてい未設定で、帯がすぐ戻る)
    const barGap = 44 * pageZ.value;
    const { x, y, zoom: z } = f.viewport.value, w = f.dimensions.value.width, h = f.dimensions.value.height - barGap, m = 8;
    const row = Object.values(doc.value.boxes).filter((b) => ys.has(b.y));
    const l = Math.min(...row.map((b) => b.x)), r = Math.max(...row.map((b) => b.x + BOX_W)), t0 = Math.min(...row.map((b) => b.y)), b0 = Math.max(...row.map((b) => b.y + (f.findNode(b.id)?.dimensions.height || BOX_H))) + NEXT_H;
    const out = l * z + x < m || t0 * z + y < m || r * z + x > w - m || b0 * z + y > h - m;
    if (!out) return;
    // 今の倍率で入るなら、入る所まで最小限だけ動かす (手を足すたびに上へ戻すと組んでいる所を見失う)。入らない時だけ開いた時の寄りへ
    if ((r - l) * z > w - 2 * m || (b0 - t0) * z > h - 2 * m) {
      // 今の倍率で入らない: 開いた時の下限 (OPEN_MIN) 以上で入るならそこまで縮めて段の真ん中へ、入らなければ新しい箱を真ん中に (段は送って見る)
      const z2 = Math.min(z, (w - 2 * m) / (r - l), (h - 2 * m) / (b0 - t0));
      if (z2 >= OPEN_MIN) await f.setCenter((l + r) / 2, (t0 + b0) / 2, { zoom: z2 });
      else { const nb = doc.value.boxes[fresh[0]!]!; await f.setCenter(nb.x + BOX_W / 2, nb.y + BOX_H / 2, { zoom: z }); }
      return;
    }
    let nx = x, ny = y;
    if (l * z + nx < m) nx = m - l * z; else if (r * z + nx > w - m) nx = w - m - r * z;
    if (t0 * z + ny < m) ny = m - t0 * z; else if (b0 * z + ny > h - m) ny = h - m - b0 * z;
    await f.setViewport({ x: nx, y: ny, zoom: z });
  });
  /**
   * 手を決めた後も触った箱を画面の同じ場所に (S-147e)。edit = 木を組み替えて触った箱の今の id を返す。
   * 箱が 4 つ以上増えても開いた時の寄りへ戻さない。手を足す時は結果の箱が枠の外なら入る向きだけ最小限動かす (S-147c)。手を変える時は結果の箱の頭が全く見えない時だけ動かす
   */
  /** 手の窓を開く時の箱の画面の場所 (窓を開く寄せの前。holdBox はここへ戻す) */
  let spot: { id: string; sx: number; sy: number } | null = null;
  const noteSpot = (id: string): void => { const b = doc.value.boxes[id], { x, y, zoom: z } = f.viewport.value; spot = b ? { id, sx: b.x * z + x, sy: b.y * z + y } : null; };
  /** 窓を開く寄せの後の視点 (閉じる時に人が動かしていないかを見る) */
  let opened: { x: number; y: number; zoom: number } | null = null;
  /** 手の窓を開いた時の寄せ (外れていた箱を見える所へ)。閉じた時に backSpot が戻す */
  async function revealSpot(id: string): Promise<void> { await reveal(id); opened = { ...f.viewport.value }; }
  /** 手の窓を選ばずに閉じた: 窓を開く寄せの分だけ視点を戻す (S-147e)。手を決めた時は holdBox が spot を使う。開いている間に人が動かした視点はそのまま */
  async function backSpot(): Promise<void> {
    const p = spot, was = opened, b = p ? doc.value.boxes[p.id] : null, { x, y, zoom: z } = f.viewport.value;
    spot = null; opened = null;
    if (!p || !b || !was || was.x !== x || was.y !== y || was.zoom !== z) return;
    await f.setViewport({ x: p.sx - b.x * z, y: p.sy - b.y * z, zoom: z });
  }
  async function holdBox(id: string, edit: () => string): Promise<void> {
    const was = doc.value.boxes[id];
    if (!was) { edit(); return; }
    const { x: x0, y: y0, zoom: z } = f.viewport.value, sx = spot?.id === id ? spot.sx : was.x * z + x0, sy = spot?.id === id ? spot.sy : was.y * z + y0, changed = !!was.hand;
    spot = null;
    holding = true;
    try {
      const to = edit();
      noteHeld(to);
      // S-147h: 50% より大きい時は 50% へ縮めて、触った箱を同じ場所に (50% 以下ならその大きさのまま)
      const zc = flag("treeCalmCamera") && z > CALM_Z * pageZ.value + 1e-3 ? CALM_Z * pageZ.value : z;
      const put = async (): Promise<void> => { const b = doc.value.boxes[to]; if (b) await f.setViewport({ x: sx - b.x * zc, y: sy - b.y * zc, zoom: zc }); };
      const kidsOf = (): NonNullable<typeof was>[] => (doc.value.boxes[to]?.outs ?? []).flatMap((k) => doc.value.boxes[k] ?? []);
      await put();
      await nextTick(); await nextTick();
      // 箱の高さが測れて並べ直しが済むまで待つ (S-147c と同じ、2 コマ続けて同じ・最長 30 コマ)
      const sig = (): string => [to, ...kidsOf().map((b) => b.id)].map((k) => { const b = doc.value.boxes[k]; return b ? `${b.x},${b.y},${f.findNode(k)?.dimensions.height ?? 0}` : ""; }).join("|");
      let last = "", same = 0;
      for (let i = 0; i < 30 && same < 2; i++) { await new Promise((r) => requestAnimationFrame(r)); const s = sig(); same = s === last ? same + 1 : 0; last = s; }
      await put();
      const kids = kidsOf();
      if (!kids.length || flag("treeCalmCamera")) return; // S-147h: 触った箱を同じ場所に保つだけ (結果の箱へは寄せない)
      // 未設定の帯は 0 の時も置くので (TreeUnsetBar)、木の面の高さは札が出ても変わらない (前は札の無い時に先に 44px 引いていた)
      // 11-11 から札は木の面の上に浮くので、帯の高さ 44 を下に空けて数える
      const { x, y } = f.viewport.value, w = f.dimensions.value.width, h = f.dimensions.value.height - 44 * pageZ.value, m = 8;
      const l = Math.min(...kids.map((b) => b.x)), r = Math.max(...kids.map((b) => b.x + BOX_W)), t0 = Math.min(...kids.map((b) => b.y)), b0 = Math.max(...kids.map((b) => b.y + (f.findNode(b.id)?.dimensions.height || BOX_H))) + NEXT_H;
      const head = BOX_H * z / 2;
      if (changed && l * z + x < w - m && r * z + x > m && t0 * z + y < h - m - head && t0 * z + y > m) return;
      let nx = x, ny = y;
      if ((r - l) * z <= w - 2 * m) { if (l * z + nx < m) nx = m - l * z; else if (r * z + nx > w - m) nx = w - m - r * z; }
      if ((b0 - t0) * z <= h - 2 * m) { if (t0 * z + ny < m) ny = m - t0 * z; else if (b0 * z + ny > h - m) ny = h - m - b0 * z; }
      if (nx !== x || ny !== y) await f.setViewport({ x: nx, y: ny, zoom: z });
    } finally { holding = false; }
  }
  /** 手を決めた箱を、その後しばらくの並べ直しの軸にする (S-147h) */
  function noteHeld(id: string): void {
    held = { id, at: performance.now() };
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
    if (ny < y) await f.setViewport({ x, y: ny, zoom: z });
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
    if (holding || !flag("treeCalmCamera") || !was.size || !w || !h || t - openAt < OPEN_QUIET || f.getNodes.value.some((n) => n.dragging)) return;
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
    if (o && n && (o.x !== n.x || o.y !== n.y)) void f.setViewport({ x: x - (n.x - o.x) * z, y: y - (n.y - o.y) * z, zoom: z });
  });
  /**
   * 木を送れる範囲の左と上の端 (S-142h、スイッチ treeOpenStartLeft): 木は始まりの箱から右と下へだけ伸びるので、始まりの箱が開いた時の位置 (横に入らない木 = 木の面の左上、
   * 入る木 = 木が真ん中に来る所) より右・下へは送れない = 左と上の空きを見せない。手で左へ引っ張った箱がある時はその箱まで。スマホの形 (U-53) は今のまま
   */
  watch(() => `${f.viewport.value.x}|${f.viewport.value.y}|${f.viewport.value.zoom}`, () => {
    const d = doc.value, { x, y, zoom: z } = f.viewport.value, lw = laneW(), w = f.dimensions.value.width - lw;
    if (!flag("treeOpenStartLeft") || innerWidth < VIEW_ONLY_MAX || !d.boxes.start || w <= 0) return;
    const b = openBounds(), ns = f.getNodes.value;
    const x0 = Math.min(b.x, ...ns.map((n) => n.position.x)), y0 = Math.min(b.y, ...ns.map((n) => n.position.y));
    const mx = Math.max(lw + LEFT_PAD, lw + w / 2 - 0.5 * (b.x + b.w - x0) * z) - x0 * z, my = topY() - y0 * z;
    if (x > mx + 0.5 || y > my + 0.5) void f.setViewport({ x: Math.min(x, mx), y: Math.min(y, my), zoom: z });
  }, { flush: "sync" });
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
  const centerOn = (wx: number, wy: number): Promise<void> => f.setCenter(wx, wy, { zoom: f.viewport.value.zoom }).then(() => {});

  // 画面の幅が変わってページの zoom が変わったら、見た目の倍率をそのまま保つ
  const onResize = (): void => {
    requestAnimationFrame(() => {
      const z = pageZoom();
      if (Math.abs(z - pageZ.value) < 1e-4) return;
      const keep = zoom.value;
      pageZ.value = z;
      void f.zoomTo(snapZoom(keep) * z);
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
    void f.setViewport({ x: vp.x + (w - old) / 2 - d / 2, y: vp.y, zoom: vp.zoom });
  });

  return { flow: f, pageZ, zoom, viewOnly, minZoom, maxZoom, full, bounds, view, setZoom, zoomIn, zoomOut, onWheel, fit, openView, keepView, backView, goHome, resetZoom, toWorld, reveal, holdBox, noteSpot, revealSpot, backSpot, toggleFull, centerOn, rectOf, laneShift, dispose: () => window.removeEventListener("resize", onResize) };
}
