/**
 * usePobCheck.ts — 火力チェックの画面の状態 (2026-10-02)
 *
 * 読み込む → 変える → 計算し直す → 前と比べる、の繰り返し (オーナー「火力チェック、更新する比較してってのがやりたい」)。
 *   - base: 比べる元 (読み込んだ時の数字。「今を基準にする」で差し替え)
 *   - cur: 今の数字。変えるたびに PoB で計算し直す (変更は順番に 1 本ずつ流す)
 */
import { computed, ref, shallowRef } from "vue";
import { loadBuild, setGem, setGroup, setPowerCharges, summary, type GroupView, type SkillView, type Summary } from "../../services/pob-check/api";
import { recordHistory } from "../../services/history";

const input = ref("");
const loading = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);
const cur = shallowRef<Summary | null>(null);
const base = shallowRef<Summary | null>(null);
const baseAt = ref<string>("");

/** スキルの鍵 (組の番号 + スキルの番号)。比べる時に同じスキル同士を合わせる */
export const skillKey = (g: GroupView, s: SkillView): string => `${g.i}:${s.k}:${s.name}`;

/** 表に出すスキル (2 重の組を除く、DPS の高い順)。
 *  同じスキルが同じ数字で 2 つ以上 (CoEA にアークを 2 つ、武器セットごとの組など) は 1 枚にまとめて count に数を入れる。
 *  PoB はメタジェムのエネルギーを分け合う計算をしないので、合計には 1 つ分だけ入れる */
function skillsOf(sum: Summary | null): Array<{ g: GroupView; s: SkillView; key: string; count: number }> {
  if (!sum) return [];
  const out: Array<{ g: GroupView; s: SkillView; key: string; count: number }> = [];
  const seen = new Map<string, { count: number }>();
  for (const g of sum.groups) {
    if (g.duplicateOf || !g.enabled) continue;
    for (const s of g.skills) {
      const sig = `${s.name}|${s.level}|${Math.round(s.game.dps)}`;
      const hit = seen.get(sig);
      if (hit) {
        hit.count++;
        continue;
      }
      const row = { g, s, key: skillKey(g, s), count: 1 };
      seen.set(sig, row);
      out.push(row);
    }
  }
  return out.sort((a, b) => b.s.game.dps - a.s.game.dps);
}

let queue: Promise<unknown> = Promise.resolve();
/** PoB への変更は順番に (前の計算が終わってから次) */
function run<T>(fn: () => Promise<T>): Promise<T> {
  const p = queue.then(fn, fn);
  queue = p.catch(() => undefined);
  return p;
}

async function refresh(): Promise<void> {
  busy.value = true;
  try {
    cur.value = await run(summary);
    error.value = null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

/** その組と、2 重としてまとめた組 (武器セットの写しなど) の番号。変える時は全部そろえて変える */
function withCopies(i: number): number[] {
  return [i, ...(cur.value?.groups ?? []).filter((g) => g.duplicateOf === i).map((g) => g.i)];
}

export function usePobCheck() {
  async function load(): Promise<void> {
    if (!input.value.trim()) return;
    loading.value = true;
    error.value = null;
    try {
      await run(() => loadBuild(input.value));
      const s = await run(summary);
      cur.value = s;
      base.value = s;
      baseAt.value = "読み込んだ時";
      recordHistory("pob-check", "load", { input: input.value.slice(0, 200), char: s.char, stats: s.stats });
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }
  function setBaseToNow(): void {
    base.value = cur.value;
    baseAt.value = new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) + " の状態";
  }
  async function changeGem(i: number, j: number, field: "level" | "quality" | "corrupt" | "enabled", value: number | boolean): Promise<void> {
    for (const gi of withCopies(i)) await run(() => setGem(gi, j, field, value));
    recordHistory("pob-check", "gem", { i, j, field, value });
    await refresh();
  }
  async function toggleGroup(i: number, enabled: boolean): Promise<void> {
    for (const gi of withCopies(i)) await run(() => setGroup(gi, enabled));
    await refresh();
  }
  async function changeCharges(n: number): Promise<void> {
    await run(() => setPowerCharges(n));
    recordHistory("pob-check", "charges", { n });
    await refresh();
  }

  const skills = computed(() => skillsOf(cur.value));
  const baseSkills = computed(() => new Map(skillsOf(base.value).map((x) => [x.key, x.s])));
  const total = computed(() => skills.value.reduce((a, x) => a + x.s.game.dps, 0));
  const baseTotal = computed(() => skillsOf(base.value).reduce((a, x) => a + x.s.game.dps, 0));
  /** 画面に出す組 (2 重を除く) と、まとめた数 */
  const groups = computed(() => (cur.value?.groups ?? []).filter((g) => !g.duplicateOf));
  const merged = computed(() => (cur.value?.groups ?? []).filter((g) => g.duplicateOf).length);

  return { input, loading, busy, error, cur, base, baseAt, skills, baseSkills, total, baseTotal, groups, merged, load, setBaseToNow, changeGem, toggleGroup, changeCharges };
}
