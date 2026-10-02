/**
 * usePobCheck.ts — 火力チェックの画面の状態 (2026-10-02)
 *
 * 読み込む → 変える → 計算し直す → 前と比べる、の繰り返し (オーナー「火力チェック、更新する比較してってのがやりたい」)。
 *   - base: 比べる元 (読み込んだ時の数字。「今を基準にする」で差し替え)
 *   - cur: 今の数字。変えるたびに PoB で計算し直す (変更は順番に 1 本ずつ流す)
 *   - PoB を変える操作は全部 act() を通す (busy・失敗の表示・履歴・「変えた所」の記録・計算し直し を 1 箇所で。
 *     新しい操作を足す時も act() に包むだけで二重にならない)
 */
import { computed, ref, shallowRef } from "vue";
import { equip, exportCode, nodePower, resetTree, toggleNode, loadBuild, restore, setGem, setWeaponSet, treeStatic, type TreeNode, unequip, setGroup, setPowerCharges, summary, type GroupView, type SkillView, type Summary } from "../../services/pob-check/api";
import { recordHistory } from "../../services/history";
import { gemJa } from "../../services/pob-check/api";
import { slotJa } from "../../services/pob-check/slots";
import { parseNinjaUrl } from "../../services/build-copy/ninja-url";
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
/** 最後に読み込んだ元 (読み込み直す用。PoB コード か poe.ninja の URL) */
const lastSource = ref<{ text: string } | null>(null);
/** 何から読み込んだか (画面の表示用) */
const loadedFrom = ref("");
/** 上のバーで見るスキルの鍵 (読み込んだ時に DPS が一番高いスキルで確定。行が消えたら一番高い物に戻る) */
const focusKey = ref<string | null>(null);
/** 読み込みの回数 (ツリーの画面が「取っている所に合わせる」のは読み込みの時だけ) */
const loadSeq = ref(0);
const note = (s: string): void => {
  changes.value = [...changes.value, s];
};
/** パッシブツリーの形 (読み込みのたびに 1 回取る) */
const treeNodes = shallowRef<TreeNode[]>([]);

/**
 * スキルの鍵。比べる時に同じスキル同士を合わせる。組の番号は読み込み直しで入れ替わることがあるので使わず、
 * 欄 + スキル名 (同じ物が 2 つ以上なら #2, #3…) で作る
 */
export const skillKey = (g: GroupView, s: SkillView, nth: number): string => `${g.slot ?? ""}|${s.name}${nth > 1 ? `#${nth}` : ""}`;

/** 装備を貼った後に欄の中に出す注意 */
export interface PasteNote {
  /** 英語にできず入れていない行 */
  unread: string[];
  /** PoB が計算しない行 */
  notCalculated: string[];
  /** その他 (ベースの候補が複数、未鑑定 など) */
  warnings: string[];
}
export interface SkillRow {
  g: GroupView;
  s: SkillView;
  key: string;
  count: number;
}
/**
 * 表に出すスキル (2 重の組を除く、DPS の高い順)。
 *  同じスキルが同じ数字で 2 つ以上 (CoEA にアークを 2 つ、武器セットごとの組など) は 1 枚にまとめて count に数を入れる。
 *  PoB はメタジェムのエネルギーを分け合う計算をしないので、合計には 1 つ分だけ入れる。
 *  DPS 0 のスキル (オーラ・バフなど) は出さない。ただし keep (比べる元で DPS があった鍵) は 0 でも出す (−100% が見える)
 */
function skillsOf(sum: Summary | null, keep?: Set<string>): SkillRow[] {
  if (!sum) return [];
  const out: SkillRow[] = [];
  const seen = new Map<string, SkillRow>();
  const nth = new Map<string, number>();
  for (const g of sum.groups) {
    if (g.duplicateOf || !g.enabled) continue;
    for (const s of g.skills) {
      const sig = `${s.name}|${s.level}|${Math.round(s.game.dps)}`;
      const hit = seen.get(sig);
      if (hit) {
        hit.count++;
        continue;
      }
      const k0 = skillKey(g, s, 1);
      const n = (nth.get(k0) ?? 0) + 1;
      nth.set(k0, n);
      const row: SkillRow = { g, s, key: skillKey(g, s, n), count: 1 };
      seen.set(sig, row);
      if (s.game.dps > 0 || keep?.has(row.key)) out.push(row);
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

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

interface ActOpts<T> {
  /** PoB を変える (run の中で順番に)。返り値は note / history に使える */
  fn: () => Promise<T>;
  /** 「変えた所」に出す文 (fn の返り値で決めてよい) */
  note?: string | ((r: T) => string);
  /** 履歴 (app_data/history/pob-check.jsonl) のイベント名と中身 */
  history?: [string, Record<string, unknown> | ((r: T) => Record<string, unknown>)];
  /** ツリーの形も取り直す (能力値のノードの名前が変わる) */
  tree?: boolean;
  /** 失敗を呼ぶ側にも投げる (欄の中に理由を出すカード用)。既定は error に入れて飲む */
  rethrow?: boolean;
}
/**
 * PoB を変える操作の共通の枠。失敗は error に出し (画面の上の帯)、成功したら計算し直して cur を更新する。
 * 読み込み中・計算中 (busy) は重ねない
 */
async function act<T>(o: ActOpts<T>): Promise<T | undefined> {
  if (busy.value || loading.value) return undefined;
  busy.value = true;
  try {
    const r = await run(o.fn);
    if (o.history) recordHistory("pob-check", o.history[0], typeof o.history[1] === "function" ? o.history[1](r) : o.history[1]);
    if (o.note) note(typeof o.note === "function" ? o.note(r) : o.note);
    if (o.tree) treeNodes.value = (await run(treeStatic)).nodes;
    cur.value = await run(summary);
    error.value = null;
    return r;
  } catch (e) {
    error.value = msg(e);
    if (o.rethrow) throw e;
    return undefined;
  } finally {
    busy.value = false;
  }
}

/** その組と、2 重としてまとめた組 (武器セットの写しなど) の番号。変える時は全部そろえて変える */
function withCopies(i: number): number[] {
  return [i, ...(cur.value?.groups ?? []).filter((g) => g.duplicateOf === i).map((g) => g.i)];
}

export function usePobCheck() {
  /** 読み込む: text = PoB コード (人のビルド / 自分のキャラは PoB の Import/Export のコード) か poe.ninja の URL */
  async function load(opts: { keepBase?: boolean; text?: string } = {}): Promise<void> {
    const text = opts.text ?? input.value;
    if (!text.trim()) return;
    if (loading.value || busy.value) return;
    const prev = cur.value;
    loading.value = true;
    error.value = null;
    try {
      // 読み込み・部品送り・数字・ツリー を 1 つの run にまとめる (間に他の操作が割り込まない)
      const { s, nodes } = await run(async () => {
        await loadBuild(text);
        return { s: await summary(), nodes: (await treeStatic()).nodes };
      });
      treeNodes.value = nodes;
      power.value = null;
      cur.value = s;
      // 読み込み直す: 前の状態を比べる元に残して、ゲームで変えた分の差を見る
      if (opts.keepBase && prev) {
        base.value = prev;
        baseAt.value = "読み込み直す前";
        changes.value = ["読み込み直し (ゲームでの変更)"];
      } else {
        base.value = s;
        baseAt.value = "読み込んだ時";
        changes.value = [];
      }
      lastSource.value = { text };
      // 上のバーのスキルは読み込んだ時に確定 (DPS が一番高い物)。変更で順位が入れ替わっても勝手に変わらない
      focusKey.value = skillsOf(s)[0]?.key ?? null;
      loadSeq.value++;
      recordHistory("pob-check", opts.keepBase ? "reload" : "load", { input: text.slice(0, 200), char: s.char, stats: s.stats });
      loadedFrom.value = parseNinjaUrl(text) ? "poe.ninja" : "PoB コード";
    } catch (e) {
      error.value = msg(e);
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
    await act({
      fn: async () => {
        let last: Awaited<ReturnType<typeof setGem>> | null = null;
        for (const gi of withCopies(i)) last = await setGem(gi, j, field, value);
        return last!.gem;
      },
      history: ["gem", (g) => ({ i, j, field, value, actual: field === "level" ? g.level : field === "quality" ? g.quality : field === "corrupt" ? g.corrupt : g.enabled })],
      // PoB が丸めた後の値で書く (Lv 40 で + を押しても 40 のまま、など)
      note: (g) => {
        const n = gemJa(g.name);
        if (field === "level") return `${n} Lv ${gem?.level ?? "?"}→${g.level}`;
        if (field === "quality") return `${n} 品質 ${gem?.quality ?? "?"}→${g.quality}%`;
        if (field === "corrupt") return `${n} コラプト ${g.corrupt ? `+${g.corrupt}` : "なし"}`;
        return `${n} ${g.enabled ? "使う" : "外す"}`;
      },
    });
  }
  async function toggleGroup(i: number, enabled: boolean): Promise<void> {
    const g = cur.value?.groups.find((x) => x.i === i);
    await act({
      fn: async () => {
        for (const gi of withCopies(i)) await setGroup(gi, enabled);
      },
      history: ["group", { i, enabled }],
      note: `${gemJa(g?.gems[0]?.name ?? "")} の組 ${enabled ? "オン" : "オフ"}`,
    });
  }
  async function changeCharges(n: number): Promise<void> {
    const before = cur.value?.config.powerCharges ?? 0;
    await act({ fn: () => setPowerCharges(n), history: ["charges", { n }], note: `パワーチャージ ${before}→${n}` });
  }

  /** 貼られた文面で欄の物を差し替える。返り値は画面に出す注意 (英語にできなかった行 / PoB が計算しない行 / その他の注意)。失敗は投げる (欄の中に出す) */
  async function changeItem(slot: string, pasted: string): Promise<PasteNote> {
    const conv = await toPobItem(pasted);
    const r = await act({
      fn: () => equip(slot, conv.text),
      history: ["equip", (x) => ({ slot, english: conv.english, base: conv.base, rarity: conv.rarity, ambiguous: conv.ambiguous, unidentified: conv.unidentified, notes: conv.notes, unread: conv.unread, notCalculated: x.unread, text: conv.text })],
      note: `${slotJa(slot)} 差し替え`,
      rethrow: true,
    });
    if (!r) throw new Error("読み込み中か計算中です");
    const warnings: string[] = [];
    if (conv.ambiguous.length) warnings.push(`同じ日本語のベースが ${conv.ambiguous.length} 通り (${conv.ambiguous.join(" / ")})。${conv.base} で計算しています`);
    if (conv.unidentified) warnings.push("未鑑定なので暗黙だけで計算しています");
    warnings.push(...conv.notes);
    return { unread: conv.unread, notCalculated: r.unread, warnings };
  }
  const clearItem = (slot: string): Promise<unknown> => act({ fn: () => unequip(slot), history: ["unequip", { slot }], note: `${slotJa(slot)} 外す` });
  const changeWeaponSet = (n: 1 | 2): Promise<unknown> => act({ fn: () => setWeaponSet(n), history: ["weapon-set", { n }], note: `武器セット ${n === 1 ? "I" : "II"}` });
  const restoreItem = (slot: string): Promise<unknown> => act({ fn: () => restore(slot), history: ["restore", { slot }], note: `${slotJa(slot)} 元に戻す` });

  /** 読み込み直せる元か (poe.ninja の URL だけ。PoB コードは同じ文字列を読み直すだけなので最新は取れない) */
  const canReload = computed(() => !!lastSource.value && !!parseNinjaUrl(lastSource.value.text));
  /** 読み込み直す (poe.ninja から最新を取り直し、今の状態を比べる元に残す)。あちらの更新待ちのことがある */
  async function reload(): Promise<void> {
    const src = lastSource.value;
    if (src) await load({ keepBase: true, text: src.text });
  }

  /** 共有: 今のビルド (変えた所も込み) の PoB コードをクリップボードへ。上のバーのスキルを PoB の主スキルにしてから書き出す */
  async function shareCode(): Promise<string | null> {
    const f = focus.value;
    try {
      const code = await run(() => exportCode(f ? { i: f.g.i, k: f.s.k } : undefined));
      await navigator.clipboard.writeText(code);
      recordHistory("pob-check", "share", { length: code.length, changes: changes.value });
      return code;
    } catch (e) {
      error.value = msg(e);
      return null;
    }
  }

  /** ツリーのノードを取る / 外す。能力値のノードの名前 (筋力など) も変わるのでツリーの形も取り直す。返り値は失敗の理由 (ツリーの画面に出す) */
  async function clickNode(id: number, attr: number): Promise<string | null> {
    const nn = treeNodes.value.find((x) => x.id === id)?.n ?? String(id);
    try {
      const r = await act({
        fn: () => toggleNode(id, attr),
        history: ["node", (x) => ({ id, attr, alloc: x.alloc, changed: x.changed })],
        note: (x) => `${(passivesJa as Record<string, string>)[nn] ?? nn} ${x.alloc ? "取る" : "外す"} (${x.changed > 0 ? "+" : "−"}${Math.abs(x.changed)})`,
        tree: true,
        rethrow: true,
      });
      return r ? null : "読み込み中か計算中です";
    } catch (e) {
      return msg(e);
    }
  }
  const resetTreeToLoaded = (): Promise<unknown> => act({ fn: resetTree, history: ["tree-reset", {}], note: "ツリーを戻す", tree: true });

  /**
   * ノードの寄与を計算する。target = スキルの鍵 か "all" (全スキルの合計 = ゲーム内の表記の DPS で重みづけ)。
   * 1 スキル 2 秒くらい。合計は表に出ているスキルを順に回す。装備・ジュエルが与えるノードは外せないので調べない
   */
  async function computePower(target: string): Promise<void> {
    const list = target === "all" ? skills.value : skills.value.filter((x) => x.key === target);
    if (!list.length || !cur.value) return;
    const granted = new Set(cur.value.tree.granted);
    const ids = cur.value.tree.alloc.filter((id) => !granted.has(id));
    const sum = new Map<number, { base: number; single: number; path: number; n: number }>();
    try {
      for (const [idx, x] of list.entries()) {
        powerProgress.value = `${x.s.name} (${idx + 1}/${list.length})`;
        const r = await run(() => nodePower(x.g.i, x.s.k, ids));
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
      error.value = msg(e);
    } finally {
      powerProgress.value = "";
    }
  }

  const baseRows = computed(() => skillsOf(base.value));
  const baseSkills = computed(() => new Map(baseRows.value.map((x) => [x.key, x.s])));
  /** 今のスキル。比べる元で DPS があった物は 0 になっても行に残す (−100%) */
  const skills = computed(() => skillsOf(cur.value, new Set(baseSkills.value.keys())));
  /**
   * 上のバーで見るスキル (2026-10-02 オーナー「合計DPSいらんから意味ないし」: 全スキルの合計は出さない)。
   * 読み込んだ時に確定した鍵。行が無くなった時だけ DPS が一番高い物
   */
  const focus = computed(() => skills.value.find((x) => x.key === focusKey.value) ?? skills.value[0] ?? null);
  const focusBase = computed(() => (focus.value ? baseSkills.value.get(focus.value.key) ?? null : null));
  /** 画面に出す組 (2 重を除く) と、まとめた数 */
  const groups = computed(() => (cur.value?.groups ?? []).filter((g) => !g.duplicateOf));
  const merged = computed(() => (cur.value?.groups ?? []).filter((g) => g.duplicateOf).length);

  return { lastSource, canReload, reload, loadedFrom, shareCode, changes, clickNode, resetTreeToLoaded, power, powerProgress, computePower, treeNodes, loadSeq, input, loading, busy, error, cur, base, baseAt, skills, baseSkills, focus, focusBase, focusKey, groups, merged, load, setBaseToNow, changeGem, toggleGroup, changeCharges, changeItem, clearItem, restoreItem, changeWeaponSet };
}
