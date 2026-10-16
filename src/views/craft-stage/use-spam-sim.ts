/**
 * use-spam-sim.ts — カオススパム確率機の「100 人がスパムしたら」を、打てるカオス (普通・上級・完全) 全部で計算する
 * (2026-10-16 YouTube の要望、オーナー「モッド選択して計算機に遷移したら 3 種類のカオスを計算して一番安いスパムをお勧めに」
 * 「計算中は重いから、自分でスパムできるのは計算後」)。
 *
 * 1 種類ずつ 100 人を少しずつ (画面を止めない)。おすすめ = 半分の人が付くまでの費用 (回数 × 1 個の値段) が一番安い物。
 * 値段の無いカオスは比べない (全部無ければおすすめは無し)。半分の人が付かない物 (付かない人が多い) も外す
 */
import { computed, ref } from "vue";
import { medianOf, spamOne, SPAM_PEOPLE, type SpamStats } from "../../services/craft-stage/chaos-spam";
import { mulberry32 } from "../../services/htc/rng";
import type { AimTarget } from "../../services/craft-stage/aim-odds";
import type { StageItem } from "../../services/craft-stage/types";
import type { PatchData } from "../../vendor/poe2htc/engine/types";

export function useSpamSim(o: { price: (key: string) => number }) {
  /** カオスの種類 → 100 人の結果 */
  const all = ref<Record<string, SpamStats>>({});
  /** 計算した人数 (全部の種類の合計) と、計算する人数 */
  const done = ref(0);
  const total = ref(0);
  /** 計算中 (この間は自分でスパムできない) */
  const busy = computed(() => total.value > 0 && done.value < total.value);
  /** 何について計算したか (狙い・アイテムレベル。カオスの種類は入れない) と、始めのアイテム */
  const simFor = ref("");
  let simItem: StageItem | null = null;
  let gen = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** 同じ始めのアイテム・同じ狙いで計算済み (か計算中) なら true */
  const same = (start: StageItem | null, sig: string): boolean => start === simItem && sig === simFor.value && (busy.value || Object.keys(all.value).length > 0);

  /** start から、keys の種類を順に 100 人ずつ。終わったら onDone */
  function simulate(data: PatchData | null, start: StageItem | null, ts: readonly AimTarget[], keys: readonly string[], sig: string, onDone?: () => void): void {
    const my = ++gen;
    clearTimeout(timer);
    all.value = {};
    done.value = 0;
    simItem = start;
    simFor.value = sig;
    total.value = data && start && ts.length ? keys.length * SPAM_PEOPLE : 0;
    if (!total.value) return;
    let ki = 0, i = 0, failed = 0;
    let tries: number[] = [];
    const step = (): void => {
      if (my !== gen) return;
      const t0 = performance.now();
      while (ki < keys.length && performance.now() - t0 < 25) {
        const n = spamOne(data!, start!, ts, keys[ki]!, mulberry32(9001 + i * 7919));
        if (n == null) failed++; else tries.push(n);
        i++;
        done.value++;
        if (i >= SPAM_PEOPLE) {
          tries.sort((a, b) => a - b);
          all.value = { ...all.value, [keys[ki]!]: { tries, failed, people: SPAM_PEOPLE } };
          ki++; i = 0; failed = 0; tries = [];
        }
      }
      if (ki < keys.length) { timer = setTimeout(step, 0); return; }
      onDone?.();
    };
    timer = setTimeout(step, 0);
  }
  function stop(): void { gen++; clearTimeout(timer); total.value = 0; done.value = 0; }

  /** 半分の人が付くまでの費用 (値段が無い・半分が付かない時は null) */
  function costOf(key: string): number | null {
    const st = all.value[key];
    const m = st ? medianOf(st) : null;
    const p = o.price(key);
    return m != null && p > 0 ? m * p : null;
  }
  /** おすすめ (半分の人の費用が一番安い種類) */
  const best = computed((): string | null => {
    let b: string | null = null, bc = Infinity;
    for (const k of Object.keys(all.value)) { const c = costOf(k); if (c != null && c < bc) { bc = c; b = k; } }
    return b;
  });
  return { all, done, total, busy, simFor, same, simulate, stop, costOf, best };
}
