/**
 * usePobCheck.ts — 火力チェックの画面の状態 (2026-10-02)
 *
 * 読み込む → 変える → 計算し直す → 前と比べる、の繰り返し (オーナー「火力チェック、更新する比較してってのがやりたい」)。
 *   - base: 比べる元 (読み込んだ時の数字。「今を基準にする」で差し替え)
 *   - cur: 今の数字。変えるたびに PoB で計算し直す (変更は順番に 1 本ずつ流す)
 */
import { computed, ref, shallowRef } from "vue";
import { equip, exportCode, loadSavedBuild, nodePower, resetTree, toggleNode, loadBuild, restore, setGem, setWeaponSet, treeStatic, type TreeNode, unequip, setGroup, setPowerCharges, summary, type GroupView, type SkillView, type Summary } from "../../services/pob-check/api";
import { recordHistory } from "../../services/history";
import { gemJa } from "../../services/pob-check/api";
import passivesJa from "../../i18n/passives-ja-client.json";
import { toPobItem } from "../../services/pob-check/item-text";

const input = ref("");
const loading = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);
const cur = shallowRef<Summary | null>(null);
const base = shallowRef<Summary | null>(null);
const baseAt = ref<string>("");
/** ノードの火力への寄与。loss = 外した時に DPS が減る割合 (0.1 = −10%)、pathLoss = つながらなくなる先も込み */
export interface NodePower {
  loss: number;
  pathLoss: number;
  n: number;
}
const power = shallowRef<{ target: string; label: string; nodes: Map<number, NodePower>; of: Summary } | null>(null);
const powerProgress = ref<string>("");
/** 比べる元からの変えた所 (画面の上のバーに並べる)。読み込み・「今を比べる元にする」で空にする */
const changes = ref<string[]>([]);
/** 何から読み込んだか (画面の表示用) */
const loadedFrom = ref("");
/** 上のバーで見るスキルの鍵 (null = DPS が一番高いスキル) */
const focusKey = ref<string | null>(null);
const note = (s: string): void => {
  changes.value = [...changes.value, s];
};
const SLOT_JA: Record<string, string> = {
  "Weapon 1": "武器", "Weapon 2": "オフハンド", "Weapon 1 Swap": "武器 (II)", "Weapon 2 Swap": "オフハンド (II)",
  Helmet: "兜", "Body Armour": "胴", Gloves: "手袋", Boots: "靴", Amulet: "アミュレット",
  "Ring 1": "指輪 (左)", "Ring 2": "指輪 (右)", Belt: "ベルト",
};
const slotJa = (s: string): string => SLOT_JA[s] ?? (s.startsWith("Jewel") ? "ジュエル" : s.replace(/^Charm /, "チャーム "));
/** パッシブツリーの形 (読み込みのたびに 1 回取る) */
const treeNodes = shallowRef<TreeNode[]>([]);

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
  /** 読み込む: text = PoB コード / poe.ninja の URL、saved = PoB に保存したビルドのパス (自分のキャラ) */
  async function load(saved?: { path: string; name: string }): Promise<void> {
    if (!saved && !input.value.trim()) return;
    loading.value = true;
    error.value = null;
    try {
      if (saved) await run(() => loadSavedBuild(saved.path));
      else await run(() => loadBuild(input.value));
      const s = await run(summary);
      treeNodes.value = (await run(treeStatic)).nodes;
      power.value = null;
      cur.value = s;
      base.value = s;
      baseAt.value = "読み込んだ時";
      changes.value = [];
      focusKey.value = null;
      recordHistory("pob-check", "load", { input: saved ? `saved:${saved.name}` : input.value.slice(0, 200), char: s.char, stats: s.stats });
      loadedFrom.value = saved ? `PoB に保存したビルド「${saved.name}」` : /poe\.ninja/.test(input.value) ? "poe.ninja" : "PoB コード";
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }
  function setBaseToNow(): void {
    base.value = cur.value;
    baseAt.value = new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) + " の状態";
    changes.value = [];
  }
  async function changeGem(i: number, j: number, field: "level" | "quality" | "corrupt" | "enabled", value: number | boolean): Promise<void> {
    const gem = cur.value?.groups.find((g) => g.i === i)?.gems.find((x) => x.j === j);
    for (const gi of withCopies(i)) await run(() => setGem(gi, j, field, value));
    recordHistory("pob-check", "gem", { i, j, field, value });
    if (gem) {
      const n = gemJa(gem.name);
      if (field === "level") note(`${n} Lv ${gem.level}→${value}`);
      else if (field === "quality") note(`${n} 品質 ${gem.quality}→${value}%`);
      else if (field === "corrupt") note(`${n} コラプト ${value ? `+${value}` : "なし"}`);
      else note(`${n} ${value ? "使う" : "外す"}`);
    }
    await refresh();
  }
  async function toggleGroup(i: number, enabled: boolean): Promise<void> {
    const g = cur.value?.groups.find((x) => x.i === i);
    for (const gi of withCopies(i)) await run(() => setGroup(gi, enabled));
    if (g) note(`${gemJa(g.gems[0]?.name ?? "")} の組 ${enabled ? "オン" : "オフ"}`);
    await refresh();
  }
  async function changeCharges(n: number): Promise<void> {
    const before = cur.value?.config.powerCharges ?? 0;
    await run(() => setPowerCharges(n));
    recordHistory("pob-check", "charges", { n });
    note(`パワーチャージ ${before}→${n}`);
    await refresh();
  }

  /** 貼られた文面で欄の物を差し替える。返り値は画面に出す注意 (英語にできなかった行 / PoB が計算しない行) */
  async function changeItem(slot: string, pasted: string): Promise<{ unread: string[]; notCalculated: string[] }> {
    const conv = await toPobItem(pasted);
    const r = await run(() => equip(slot, conv.text));
    if (!r.ok) throw new Error(r.error ?? "入れられませんでした");
    recordHistory("pob-check", "equip", { slot, english: conv.english, base: conv.base, rarity: conv.rarity, unread: conv.unread, notCalculated: r.unread ?? [], text: conv.text });
    note(`${slotJa(slot)} 差し替え`);
    await refresh();
    return { unread: conv.unread, notCalculated: r.unread ?? [] };
  }
  async function clearItem(slot: string): Promise<void> {
    await run(() => unequip(slot));
    recordHistory("pob-check", "unequip", { slot });
    note(`${slotJa(slot)} 外す`);
    await refresh();
  }
  async function changeWeaponSet(n: 1 | 2): Promise<void> {
    await run(() => setWeaponSet(n));
    recordHistory("pob-check", "weapon-set", { n });
    note(`武器セット ${n === 1 ? "I" : "II"}`);
    await refresh();
  }
  async function restoreItem(slot: string): Promise<void> {
    await run(() => restore(slot));
    recordHistory("pob-check", "restore", { slot });
    note(`${slotJa(slot)} 元に戻す`);
    await refresh();
  }

  /** 共有: 今のビルド (変えた所も込み) の PoB コードをクリップボードへ */
  async function shareCode(): Promise<string> {
    const code = await run(exportCode);
    await navigator.clipboard.writeText(code);
    recordHistory("pob-check", "share", { length: code.length, changes: changes.value });
    return code;
  }

  /** ツリーのノードを取る / 外す。能力値のノードの名前 (筋力など) も変わるのでツリーの形も取り直す */
  async function clickNode(id: number, attr: number): Promise<string | null> {
    const r = await run(() => toggleNode(id, attr));
    if (!r.ok) return r.error ?? "できませんでした";
    recordHistory("pob-check", "node", { id, attr, alloc: r.alloc, changed: r.changed });
    const nn = treeNodes.value.find((x) => x.id === id)?.n ?? String(id);
    note(`${(passivesJa as Record<string, string>)[nn] ?? nn} ${r.alloc ? "取る" : "外す"} (${(r.changed ?? 0) > 0 ? "+" : "−"}${Math.abs(r.changed ?? 0)})`);
    treeNodes.value = (await run(treeStatic)).nodes;
    await refresh();
    return null;
  }
  async function resetTreeToLoaded(): Promise<void> {
    await run(resetTree);
    recordHistory("pob-check", "tree-reset", {});
    note("ツリーを戻す");
    treeNodes.value = (await run(treeStatic)).nodes;
    await refresh();
  }

  /**
   * ノードの寄与を計算する。target = スキルの鍵 か "all" (全スキルの合計 = ゲーム内の表記の DPS で重みづけ)。
   * 1 スキル 2 秒くらい。合計は表に出ているスキルを順に回す
   */
  async function computePower(target: string): Promise<void> {
    const list = target === "all" ? skills.value : skills.value.filter((x) => x.key === target);
    if (!list.length || !cur.value) return;
    const ids = cur.value.tree.alloc;
    const sum = new Map<number, { base: number; single: number; path: number; n: number }>();
    try {
      for (const [idx, x] of list.entries()) {
        powerProgress.value = `${x.s.name} (${idx + 1}/${list.length})`;
        const r = await run(() => nodePower(x.g.i, x.s.k, ids));
        if (!r.ok) throw new Error(r.error ?? "計算できませんでした");
        // PoB の DPS (敵側込み) をゲーム内の表記にそろえてから足す (スキルごとに敵側の倍率が違う)
        const ratio = x.s.game.enemyRatio || 1;
        for (const [id, e] of Object.entries(r.nodes)) {
          const cell = sum.get(Number(id)) ?? { base: 0, single: 0, path: 0, n: e.n };
          cell.base += r.base * ratio;
          cell.single += e.single * ratio;
          cell.path += e.path * ratio;
          sum.set(Number(id), cell);
        }
      }
      const nodes = new Map<number, NodePower>();
      for (const [id, c] of sum) {
        nodes.set(id, { loss: c.base > 0 ? 1 - c.single / c.base : 0, pathLoss: c.base > 0 ? 1 - c.path / c.base : 0, n: c.n });
      }
      const label = target === "all" ? "全スキルの合計" : list[0]!.s.name;
      power.value = { target, label, nodes, of: cur.value };
      recordHistory("pob-check", "node-power", { target, skills: list.map((x) => x.s.name), nodes: nodes.size });
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      powerProgress.value = "";
    }
  }

  const skills = computed(() => skillsOf(cur.value));
  const baseSkills = computed(() => new Map(skillsOf(base.value).map((x) => [x.key, x.s])));
  /**
   * 上のバーで見るスキル (2026-10-02 オーナー「合計DPSいらんから意味ないし」: 全スキルの合計は出さない)。
   * 選んでいなければ DPS が一番高いスキル。比べる元は同じ鍵のスキル
   */
  const focus = computed(() => skills.value.find((x) => x.key === focusKey.value) ?? skills.value[0] ?? null);
  const focusBase = computed(() => (focus.value ? baseSkills.value.get(focus.value.key) ?? null : null));
  /** 画面に出す組 (2 重を除く) と、まとめた数 */
  const groups = computed(() => (cur.value?.groups ?? []).filter((g) => !g.duplicateOf));
  const merged = computed(() => (cur.value?.groups ?? []).filter((g) => g.duplicateOf).length);

  return { loadedFrom, shareCode, changes, clickNode, resetTreeToLoaded, power, powerProgress, computePower, treeNodes, input, loading, busy, error, cur, base, baseAt, skills, baseSkills, focus, focusBase, focusKey, groups, merged, load, setBaseToNow, changeGem, toggleGroup, changeCharges, changeItem, clearItem, restoreItem, changeWeaponSet };
}
