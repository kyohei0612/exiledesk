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
import { pageZoom } from "../../../utils/zoom";
import { isPhoneWidth } from "../../../utils/use-phone";
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
/** 20% でも入らない木の時だけ足す段 (S-147d、スイッチ zoomWhole) */
const WHOLE_STEPS = [0.15, 0.1] as const;
/** ホイールの量をためてから 1 段動かす (マウスの 1 目盛り ≒ 100、タッチパッドは細かく来る) */
const WHEEL_STEP = 60;
/** これ未満は箱の中の物を押させず、箱を押すと等倍の編集のポップアップ (ボタンが 24px の 3/4 = 18px を切る。10-22 オーナー「75% 未満の見るだけをやめる」) */
const VIEW_ONLY = 0.75;
/** スマホの全体表示の一番小さい段 */
const PHONE_MIN = 0.5;
/**
 * 開いた時の一番小さい段 (これ未満でしか収まらない木は、この段で始まりの箱を上の真ん中)。組める一番下の段 VIEW_ONLY と同じ
 * (50% にしていた時は 5 箱の木でも 67% = 見るだけで開き、箱の ＋ が隠れた。10-25 ブラック「＋ が隠れない事を優先」)
 */
const OPEN_MIN = VIEW_ONLY;
/** 「全体を表示」の一番小さい段 (これより大きい木は下が枠の外に出てよい。10-26 夜ブラック 13「全体表示は下限 25%」) */
const FIT_MIN = 0.25;
/** 全体に合わせる時の余白の下限 */
const PAD_MIN = 12;
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
    const sx = st ? st.x + BOX_W / 2 : b.x + b.w / 2, half = Math.max(sx - b.x, b.x + b.w - sx);
    return Math.min((w / 2 - PAD_MIN) / half, (h - topY() - PAD_MIN) / (treeBottom() - b.y)) / pageZ.value;
  }
  /**
   * 今の木で使える段。20% でも全体が入らない PC の木だけ、全体が入る倍率まで下に足す (S-147d、10-26 夜の 10% の点は開いた時の話で、開いた時は 75% のまま)
   */
  function levels(): readonly number[] {
    if (!flag("zoomWhole") || isPhoneWidth()) return ZOOM_LEVELS;
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
    void stepZoom(dir, { x: e.clientX, y: e.clientY });
  }
  /** 一番上の箱を置く高さ (0 完成形の設定は枠の左上の札、10-23。スマホは札 (高さ約 110px) の下へ) */
  const topY = (): number => (isPhoneWidth() ? 130 : 40);
  /**
   * 始まりの箱を枠の横の真ん中に置いた時、木全体が収まる一番大きい段 (上は topY、下は余白だけ。100% まで)。
   * 左右は始まりの箱の真ん中から遠い方の端まで (始まりを真ん中に置くので、片側に伸びた木はその側の分を両側に取る)
   */
  /**
   * 木の下の端 (ツリーの座標)。箱の高さは Vue Flow が測った物 (中のアイテムの枠で BOX_H より高い) + 下の＋の分
   * (前は BOX_H で数え、全体表示でも下の段の箱が枠の外に 124px 切れた、10-26 モンキー 8 の 1)
   */
  const treeBottom = (): number => Math.max(...Object.values(doc.value.boxes).map((b) => b.y + (f.findNode(b.id)?.dimensions.height || BOX_H) + NEXT_H));
  function fitLevel(): number | null {
    const b = bounds.value, st = doc.value.boxes.start, w = f.dimensions.value.width, h = f.dimensions.value.height;
    if (!w || !h) return null;
    const sx = st ? st.x + BOX_W / 2 : b.x + b.w / 2;
    const half = Math.max(sx - b.x, b.x + b.w - sx);
    // 木の左の外の段の目印 (TreeBandLayer、画面の上で約 110px × ページの zoom) の分も左を空ける (1280 で目印が枠の外に切れた、10-22)
    // 段の目印を出さない時 (スイッチ noBand、10-28 夜オーナー「これいらんなもう　消してくれわかりづらいし」) は左を空けない
    const fz = Math.min((w / 2 - PAD_MIN) / half, (h - topY() - PAD_MIN) / (treeBottom() - b.y)) / pageZ.value;
    return [...levels()].reverse().find((l) => l <= Math.min(1, fz) + 1e-6) ?? levels()[0]!;
  }
  /**
   * 始まりの箱を枠の横の真ん中・木の一番上を上の端 (topY) に、段 lv で。
   * (10-26 オーナー「スタートは必ずツリーを真ん中に配置して開始、それも一番上ね」)。完成形の窓は木の枠の外の右の列へ移したので、窓を避けて下げる処理は外した (10-26 夜)
   */
  function placeOf(lv: number): { x: number; y: number; z: number } {
    const b = bounds.value, st = doc.value.boxes.start, w = f.dimensions.value.width;
    const z = lv * pageZ.value, sx = st ? st.x + BOX_W / 2 : b.x + b.w / 2;
    const x = w / 2 - sx * z;
    const y = topY() - b.y * z;
    return { x, y, z };
  }
  /**
   * fitAll = 下の段が枠の外に出るなら、収まるまで倍率を 1 段ずつ下げる (全体表示だけ、FIT_MIN まで)。
   * 開いた時・整列の後は下げるだけで縮めない (10-26 夜ブラック 13: 縮めて 10% になった)
   */
  async function startTop(lv: number, fitAll = false): Promise<void> {
    let p = placeOf(lv);
    const h = f.dimensions.value.height;
    const ls = levels(), low = flag("zoomWhole") && !isPhoneWidth() ? 0 : FIT_MIN;
    for (let i = ls.indexOf(lv); fitAll && i > 0 && ls[i - 1]! >= low && treeBottom() * p.z + p.y > h - PAD_MIN; i--) p = placeOf(ls[i - 1]!);
    await f.setViewport({ x: p.x, y: p.y, zoom: p.z });
  }
  /** 全体に合わせる (「1」・右下の道具)。下限 25%。whole = スマホでも 50% の下限を使わず木の全体 (回すの 1 人目が歩く時。光る枠を画面の外へ出さない) */
  async function fit(whole = false): Promise<void> {
    const lv = fitLevel();
    if (lv == null) return;
    // スマホの形 (U-53) は 50% より小さくしない (20% で箱の字が読めなかった、10-22)
    if (!whole && isPhoneWidth()) await startTop(Math.max(lv, PHONE_MIN));
    else await startTop(flag("zoomWhole") ? lv : Math.max(lv, FIT_MIN), true);
  }
  /**
   * 開いた時の見え方 (10-25 オーナー「任せる」、23 本目の決め): 木全体が収まる段 (100% まで)。
   * 75% (OPEN_MIN) 未満でしか収まらない時は 75% (前は 100% で始まりを上の真ん中にしていて、木の下が枠の外にあった)。
   * どちらも始まりの箱は横の真ん中・一番上 (10-26 オーナー)
   */
  async function openView(): Promise<void> {
    const lv = fitLevel();
    if (lv == null) { await goHome(); return; }
    await startTop(Math.max(lv, OPEN_MIN));
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
    const bar = document.querySelector<HTMLElement>("[data-tree-unset-bar]")?.offsetHeight ?? 0;
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
    const barGap = !document.querySelector("[data-tree-unset-bar]") ? 44 * pageZ.value : 0;
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
   * 手を決めた後も触った箱を画面の同じ場所に (S-147e、スイッチ junkTidy)。edit = 木を組み替えて触った箱の今の id を返す。
   * 箱が 4 つ以上増えても開いた時の寄りへ戻さない。手を足す時は結果の箱が枠の外なら入る向きだけ最小限動かす (S-147c)。手を変える時は結果の箱の頭が全く見えない時だけ動かす
   */
  /** 手の窓を開く時の箱の画面の場所 (窓を開く寄せの前。holdBox はここへ戻す) */
  let spot: { id: string; sx: number; sy: number } | null = null;
  const noteSpot = (id: string): void => { const b = doc.value.boxes[id], { x, y, zoom: z } = f.viewport.value; spot = b ? { id, sx: b.x * z + x, sy: b.y * z + y } : null; };
  /** 窓を開く寄せの後の視点 (閉じる時に人が動かしていないかを見る) */
  let opened: { x: number; y: number; zoom: number } | null = null;
  /** 手の窓を開いた時の寄せ (外れていた箱を見える所へ)。閉じた時に backSpot が戻す */
  async function revealSpot(id: string): Promise<void> { await reveal(id); opened = { ...f.viewport.value }; }
  /** 手の窓を選ばずに閉じた: 窓を開く寄せの分だけ視点を戻す (S-147e、スイッチ junkTidy)。手を決めた時は holdBox が spot を使う。開いている間に人が動かした視点はそのまま */
  async function backSpot(): Promise<void> {
    const p = spot, was = opened, b = p ? doc.value.boxes[p.id] : null, { x, y, zoom: z } = f.viewport.value;
    spot = null; opened = null;
    if (!flag("junkTidy") || !p || !b || !was || was.x !== x || was.y !== y || was.zoom !== z) return;
    await f.setViewport({ x: p.sx - b.x * z, y: p.sy - b.y * z, zoom: z });
  }
  async function holdBox(id: string, edit: () => string): Promise<void> {
    const was = doc.value.boxes[id];
    if (!flag("junkTidy") || !was) { edit(); return; }
    const { x: x0, y: y0, zoom: z } = f.viewport.value, sx = spot?.id === id ? spot.sx : was.x * z + x0, sy = spot?.id === id ? spot.sy : was.y * z + y0, changed = !!was.hand;
    spot = null;
    holding = true;
    try {
      const to = edit();
      const put = async (): Promise<void> => { const b = doc.value.boxes[to]; if (b) await f.setViewport({ x: sx - b.x * z, y: sy - b.y * z, zoom: z }); };
      const kidsOf = (): NonNullable<typeof was>[] => (doc.value.boxes[to]?.outs ?? []).flatMap((k) => doc.value.boxes[k] ?? []);
      await put();
      await nextTick(); await nextTick();
      // 箱の高さが測れて並べ直しが済むまで待つ (S-147c と同じ、2 コマ続けて同じ・最長 30 コマ)
      const sig = (): string => [to, ...kidsOf().map((b) => b.id)].map((k) => { const b = doc.value.boxes[k]; return b ? `${b.x},${b.y},${f.findNode(k)?.dimensions.height ?? 0}` : ""; }).join("|");
      let last = "", same = 0;
      for (let i = 0; i < 30 && same < 2; i++) { await new Promise((r) => requestAnimationFrame(r)); const s = sig(); same = s === last ? same + 1 : 0; last = s; }
      await put();
      const kids = kidsOf();
      if (!kids.length) return;
      const barGap = !document.querySelector("[data-tree-unset-bar]") ? 44 * pageZ.value : 0;
      const { x, y } = f.viewport.value, w = f.dimensions.value.width, h = f.dimensions.value.height - barGap, m = 8;
      const l = Math.min(...kids.map((b) => b.x)), r = Math.max(...kids.map((b) => b.x + BOX_W)), t0 = Math.min(...kids.map((b) => b.y)), b0 = Math.max(...kids.map((b) => b.y + (f.findNode(b.id)?.dimensions.height || BOX_H))) + NEXT_H;
      const head = BOX_H * z / 2;
      if (changed && l * z + x < w - m && r * z + x > m && t0 * z + y < h - m - head && t0 * z + y > m) return;
      let nx = x, ny = y;
      if ((r - l) * z <= w - 2 * m) { if (l * z + nx < m) nx = m - l * z; else if (r * z + nx > w - m) nx = w - m - r * z; }
      if ((b0 - t0) * z <= h - 2 * m) { if (t0 * z + ny < m) ny = m - t0 * z; else if (b0 * z + ny > h - m) ny = h - m - b0 * z; }
      if (nx !== x || ny !== y) await f.setViewport({ x: nx, y: ny, zoom: z });
    } finally { holding = false; }
  }
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
  // 右の欄を開いた時など、枠の幅が変わっても見ている真ん中は動かさない (Vue Flow は左上を軸にするので、何もしなければ左上が残る)
  watch(() => f.dimensions.value.width, (w, old) => {
    // 幅 0 (木の枠が隠れていた) から幅が出た = 開いた時の寄せをやり直す。隠れたまま組まれると寄せが効かず、スタートが枠の左上に出た
    // (10-27 夜オーナー r/C6YHoWk2、本番 v0.1.634。エミュの「シミュレーターへ」→ 完成形のページ → 決めた で同じ形を作れた。スイッチ viewFromZero)
    if (!old && w) { void nextTick(() => openView()); return; }
    if (!old || !w) return;
    const vp = f.viewport.value;
    void f.setViewport({ x: vp.x + (w - old) / 2, y: vp.y, zoom: vp.zoom });
  });

  return { flow: f, pageZ, zoom, viewOnly, minZoom, maxZoom, full, bounds, view, setZoom, zoomIn, zoomOut, onWheel, fit, openView, keepView, backView, goHome, resetZoom, toWorld, reveal, holdBox, noteSpot, revealSpot, backSpot, toggleFull, centerOn, rectOf, dispose: () => window.removeEventListener("resize", onResize) };
}
