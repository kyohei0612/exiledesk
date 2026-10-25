/**
 * use-tree-run.ts — ツリーの「100 人回す」の状態 (2026-10-22 オーナー「回すボタンもやろ？」「オーバーレイでいい、修正しやすい」)。
 * 回すのは services/simulator/tree/tree-run.ts の runTreeSteps を 1 人ずつ区切り、2 人ごとに途中の結果を出して画面を返す。
 * 結果は木の上に重ねる層 (TreeRunLayer.vue) だけが読む。組み替えたら消す (位置を動かしただけでは消さない)。
 * 回す前にまず 1 人目が木の上を 1 手ずつ進む (今いる箱が光る)。完成したら残りを回し、途中で止まったらそこで止めて寄る
 * (10-22 オーナー「回す前に 1 人通して木が正しいか確かめる」)
 */
import { computed, ref, watch, type Ref } from "vue";
import { runTreeSteps, withStartCost, type TreeRunOpts, type TreeRunResult } from "../../../services/simulator/tree/tree-run";
import { withTreeTune } from "../../../services/simulator/tree/tree-tune";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { craftStage as s } from "../../../state/craft-stage";
import { routeKeyOf } from "./use-tree-check";

/** 回す人数 (帯の「100 人回した時」と同じ)。seed は台本・解析君と同じ 1 */
export const RUN_N = 100;
/** 途中の結果を出す間隔 (人) と、その間の最低の間 (ms)。速い木でも 3 秒ほどかけて数字が増えていくのが見える (オーナー「ヌルヌルとカウントアップ」) */
const EVERY = 2;
const PACE_MS = 60;
type Person1 = Parameters<NonNullable<TreeRunOpts["onPerson"]>>[0];
/** 1 人目の再生の速さ (前の速さの何倍か。10-25 オーナー「今の3倍速がデフォでいいな」)。3 秒とどまったら早送りの決まりは今のまま */
const WALK_SPEED = 3;
/** 1 人目の 1 箱の間 (ms)。長い道 (始めに戻るが多い) は全体で 20 秒ほどに縮める、最低 40ms (金の指輪は 540 箱、90ms で 49 秒かかった)。それを WALK_SPEED 倍の速さに */
const walkMs = (len: number): number => Math.round(Math.max(40, Math.min(450, 20000 / Math.max(1, len))) / WALK_SPEED);
/**
 * 1 人目が同じ所に 3 秒とどまったら、そこを抜けるまで早送り (10-25 オーナー「1人目沼ったら長い時間待つ」「3秒同じとこにとどまったら高速化で」)。
 * 同じ所 = 直近 3 秒の手が LOOP_BOXES 箱以内で、どの箱も平均 2 回以上通るくり返し (カオスの外れ → 親の箱、冒涜の外れ → エッセンスの結果 3 つ → 冒涜の輪など)。
 * 早送りは輪の長さによらず FAST_MS ほどで抜け、抜けたら元の速さ。一度早送りした輪にまた入ったら 3 秒待たずにすぐ早送り (10-25 オーナー)
 */
const STAY_MS = 3000;
const LOOP_BOXES = 6;
const FAST_MS = 1200;
/** 一度早送りした輪にまた入った時の早送りの長さ (見たことのある輪なので短く) */
const FAST_AGAIN_MS = 400;
const FRAME_MS = 30;

/** onHalt = 止まった人が出て止めた時 (その箱へ寄る)。onWalk = 1 人目が箱に着いた時 (i = 何箱目、0 で全体を表示して、後は外れた時だけ見える所へ) */
export function useTreeRun(doc: Ref<TreeDoc>, startCost: () => number, priceOf: (key: string) => number, onHalt: (box: string) => void, onWalk: (box: string, i: number) => void) {
  /** 回した結果 (回した時のベースの値段で)。外へは今のベースの値段で足し直した result を渡す (回し直さない、tree-run の withStartCost、10-25 オーナー) */
  const raw = ref<TreeRunResult | null>(null);
  const result = computed(() => (raw.value ? withStartCost(raw.value, startCost()) : null));
  const running = ref(false);
  /** 層を出しているか (隠すと今の組む画面のまま) */
  const shown = ref(true);
  /** 止まった人が出て途中で止めた時の箱と人数 (10-22 オーナー「止まった瞬間 100 人回すの止めて修正しなよ」) */
  const halted = ref<{ box: string; n: number } | null>(null);
  /** 1 人目が進んでいる所 (今いる箱・何手目 / 全部・着いた時の費用 神・早送り中か) */
  const walk = ref<{ box: string; step: number; total: number; cost: number; ms: number; trail: ReadonlySet<string>; fast: boolean } | null>(null);
  /** 1 人目を飛ばす (帯の「飛ばす」) */
  let skip = false;
  let token = 0;
  // 組み替えたら結果を消す (回している途中なら止める)
  watch(() => routeKeyOf(doc.value), () => { token++; raw.value = null; running.value = false; halted.value = null; walk.value = null; });
  async function run(): Promise<void> {
    const data = s.data.value;
    if (!data || running.value) return;
    const my = ++token;
    running.value = true; shown.value = true; raw.value = null; halted.value = null; skip = false;
    const d = doc.value;
    // 相場は高貴建て → 神に直す (tree-base-cost と同じ。そのまま渡すと 2000 神の打ち止めに当たって完成 8% になった、10-22 開発版で見た)
    const div = priceOf("divine") || 1;
    // 回す間は相場が変わらないので、同じ物の値段は 1 回だけ引く (1 手ごとに相場の表を引くのが重く、飛ばしても 100 人に 18 秒かかった、10-23 モンキー 7)
    const memo = new Map<string, number>();
    const priceIn = (k: string): number => { let v = memo.get(k); if (v === undefined) { v = priceOf(k) / div; memo.set(k, v); } return v; };
    let last: TreeRunResult | null = null;
    const firstOf: { p: Person1 | null } = { p: null };
    // 1 人目が進む間は層の数字を出さない (光る箱だけ)
    let walking = true;
    const g = runTreeSteps(data, d, { n: RUN_N, seed: 1, price: priceIn, startCost: startCost(), every: 1,
      onProgress: (r) => { last = r; if (my === token && !walking) raw.value = r; },
      onPerson: (p, i) => { if (!i) firstOf.p = p; } });
    try {
      // 1 人目: 通った箱を順に光らせる (品質だけ上げた後の箱は絵が無いので飛ばす)
      const f0 = withTreeTune(d, () => g.next());
      if (my !== token) return;
      const p1 = firstOf.p!;
      const path = p1.visits.filter((v) => d.boxes[v.box] && d.boxes[v.box]!.out !== "pass");
      const ms = walkMs(path.length);
      // 通った箱 (足跡)。全体表示の小さい倍率で速く進んでも、どこを通ったか残る (10-22 オーナー「機能してる？」、光る枠だけでは見えなかった)
      const trail = new Set<string>();
      const stayN = Math.ceil(STAY_MS / ms);
      // since = 元の速さで進み始めた手 (早送りの後は 3 秒数え直す)
      let since = 0;
      /** 一度早送りした輪 (箱の組) */
      const known: Set<string>[] = [];
      for (let i = 0; i < path.length && !skip; i++) {
        trail.add(path[i]!.box);
        walk.value = { box: path[i]!.box, step: i + 1, total: path.length, cost: path[i]!.cost, ms, trail: new Set(trail), fast: false };
        onWalk(path[i]!.box, i);
        await new Promise((res) => setTimeout(res, ms));
        if (my !== token) return;
        // 一度早送りした輪にまた入ったら (今の箱と次の箱がその輪の箱)、3 秒待たずにすぐ早送り (10-25 オーナー「同じルートまた来たら早送りでいいな 今毎回3秒考えてるでしょ」)
        const again = i + 1 < path.length ? known.find((L) => L.has(path[i]!.box) && L.has(path[i + 1]!.box)) : undefined;
        let stay: Set<string>;
        if (again) stay = again;
        else {
          if (i - since + 1 < stayN) continue;
          stay = new Set(path.slice(i - stayN + 1, i + 1).map((v) => v.box));
          if (stay.size > LOOP_BOXES || stay.size * 2 > stayN) continue;
        }
        let j = i + 1;
        while (j < path.length && stay.has(path[j]!.box)) j++;
        const n = j - 1 - i;
        // 覚えた輪を通り抜けるだけ (1 手) は早送りしない
        if (!n || (again && n < 2)) continue;
        if (!again) known.push(stay);
        const frames = Math.max(1, Math.min(Math.round((again ? FAST_AGAIN_MS : FAST_MS) / FRAME_MS), n));
        for (let f = 1; f <= frames && !skip; f++) {
          const at = i + Math.round((n * f) / frames);
          walk.value = { box: path[at]!.box, step: at + 1, total: path.length, cost: path[at]!.cost, ms: FRAME_MS, trail: new Set(trail), fast: true };
          await new Promise((res) => setTimeout(res, FRAME_MS));
          if (my !== token) return;
        }
        i = j - 1;
        since = j;
      }
      walk.value = null; walking = false;
      raw.value = f0.done ? f0.value : last;
      // 1 人目が止まったら残りは回さない (止まった箱を直してから回し直す)
      if (p1.end === "stuck") { halted.value = { box: p1.at, n: 1 }; onHalt(p1.at); return; }
      if (f0.done) return;
      let t0 = performance.now();
      for (;;) {
        const r = withTreeTune(d, () => g.next());
        if (my !== token) return;
        if (r.done) { raw.value = r.value; break; }
        // 1 人でも止まったらそこで止める (直してから回し直す)。打ち止め (神・手の上限) は止まりではないので続ける
        const st = last ? Object.keys((last as TreeRunResult).stuckAt)[0] : undefined;
        if (st) { halted.value = { box: st, n: r.value }; onHalt(st); break; }
        // 飛ばした後は数字をゆっくり増やす間を取らず、30ms 計算するごとに画面を返すだけ
        // (前は飛ばしても 2 人ごとに間を取り、見本のアミュで結果まで 19 秒かかった。計算だけなら 100 人で 2 秒ほど、10-23 モンキー 7)
        if (skip) { if (performance.now() - t0 < 30) continue; await new Promise((res) => setTimeout(res, 0)); t0 = performance.now(); continue; }
        const wait = r.value % EVERY ? 0 : Math.max(0, PACE_MS - (performance.now() - t0));
        await new Promise((res) => setTimeout(res, wait));
        if (!(r.value % EVERY)) t0 = performance.now();
      }
    } finally { if (my === token) { running.value = false; walk.value = null; } }
  }
  /** 止まり・打ち止めの箱 (多い順) */
  const stuckBoxes = computed(() => Object.entries(result.value?.stuckAt ?? {}).sort((a, z) => z[1] - a[1]));
  return { result, running, shown, halted, walk, run, skipWalk: (): void => { skip = true; }, stuckBoxes };
}
