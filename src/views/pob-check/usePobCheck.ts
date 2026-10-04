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
import { buildPlannerWrite, equip, exportCode, nodePower, plan, stashState, unstashState, resetTree, toggleNode, loadBuild, restore, setGem, setWeaponSet, treeStatic, type BuildPlan, type TreeNode, unequip, setGroup, setPowerCharges, summary, type GroupView, type SkillView, type Summary, estimateItem, estimateGems, estimateTree, estimateJewel, estimateAll, setEstimateTree, setGroupGems, type EstimateRaw, type EstimateStats, type EstimateItemRaw, type EstimateGemsRaw, type EstimateTreeRaw, type EstimateJewelRaw, breakdown as fetchBreakdown } from "../../services/pob-check/api";
import { buildChain, type Chain } from "../../services/pob-check/breakdown";
import { recordHistory } from "../../services/history";
import { gemJa } from "../../services/pob-check/api";
import { slotJa } from "../../services/pob-check/slots";
import { adoptCandidates, copyAllPlan, type AdoptCandidate } from "../../services/pob-check/build-diff";
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
/** 最後に読み込んだ元 (読み込み直す用。text = 貼った物 (PoB コード か poe.ninja の URL)、code = 実際に読んだ PoB コード = 「全部戻す」が読み直す物) */
const lastSource = ref<{ text: string; code: string } | null>(null);
/** 何から読み込んだか (画面の表示用) */
const loadedFrom = ref("");
/** 上のバーで見るスキルの鍵 (読み込んだ時に DPS が一番高いスキルで確定。行が消えたら一番高い物に戻る) */
const focusKey = ref<string | null>(null);
/** 読み込みの回数 (ツリーの画面が「取っている所に合わせる」のは読み込みの時だけ) */
const loadSeq = ref(0);
/** 比べる相手 (忍者のビルド等)。読み込んだ時の数字と装備の写し (PoB の中は自分のビルドに戻してある) */
const target = shallowRef<Summary | null>(null);
const targetFrom = ref("");
const targetInput = ref("");
/** 相手のビルドプランナーの中身 (相手を読み込んでいる間に取る。相手は読み直しで PoB から消えるので、後からは作れない) */
const targetPlan = shallowRef<BuildPlan | null>(null);
/** 相手の PoB コード (poe.ninja の URL から読んだ時は取ってきた物)。タブ「値段」が相手の装備を解析するのに使う (2026-10-03 忍者ビルドコピーの統合) */
const targetCode = ref<string | null>(null);
const note = (s: string): void => {
  changes.value = [...changes.value, s];
};
/** パッシブツリーの形 (読み込みのたびに 1 回取る) */
const treeNodes = shallowRef<TreeNode[]>([]);

/**
 * 取り入れの試算 (2026-10-03 オーナー「まんま真似できないけど部分的に真似できる所、ここだけ真似しようかな」) の 1 行。
 * dps = 取り入れた後の上のバーのスキルの DPS (自分の行の DPS × PoB の with / base。物差しは行と同じなので取り入れた後の行とそろう)、
 * stats = ライフ等の変化 (後 − 前)。lines = ユニークの「ここが効く」(行を抜くと DPS が下がる割合、大きい順の上位 3 つ)
 */
export interface Estimate {
  c: AdoptCandidate;
  dps: number;
  stats: EstimateStats;
  lines?: Array<{ line: string; loss: number }>;
  /** PoB が知らないジェム (計算に入っていない) */
  unknown?: string[];
  /** 両手武器で外れる欄 */
  displaced?: string[];
  /** ツリーの束: 本当に足したノードの数 */
  n?: number;
  /** 組を足す時: その組の最初のスキルの DPS */
  newDps?: number;
  /** 組の差し替えで上のバーのスキルがその組から無くなる (dps は 0) */
  focusLost?: boolean;
  /** ツリー: 外したノードの数 */
  removed?: number;
  /** ジュエル: 穴を取っていないので穴も足して計算した */
  socketAdded?: boolean;
  /** 使っていない武器セットの欄 (今の DPS は変わらない) */
  unusedSet?: boolean;
  /** 試算できなかった理由 */
  error?: string;
}
/** 試算の結果。of = 試算した時の自分 (cur が変わったら古い = もう一度試算)、dps = その時の上のバーのスキルの DPS */
/**
 * 全部まとめて真似した時の段ごとの DPS (上のバーのスキル、自分の行と同じ物差し)。life / es = [今, ツリー, + 装備, + ジェム]
 */
export interface EstimateAll { tree: number; items: number; gems: number; config?: number | null; life: number[]; es: number[]; error?: string }
/** quiet = 火力が変わらないので出さなかった装備・ジュエルの数、treeBased = 装備等の行はツリーを相手と同じにした上での差 */
const estimates = shallowRef<{ list: Estimate[]; of: Summary; focusKey: string; dps: number; quiet: number; all: EstimateAll | null; treeBased: boolean } | null>(null);
const estimating = ref(false);
const estimateProgress = ref("");
/** 取り入れた項目の鍵 (表に「取り入れた」の印) */
const adopted = ref<Set<string>>(new Set());
/**
 * 火力の内訳 (2026-10-03 オーナー「どこの火力が乗っているから今こんな火力が出ている、という詳細が欲しい」)。
 * 上のバーのスキルの式の鎖 (services/pob-check/breakdown.ts)。of = その時の自分、key = その時のスキル (どちらかが変わったら取り直す)
 */
const chain = shallowRef<{ chain: Chain; of: Summary; key: string } | null>(null);
const chainLoading = ref(false);
const chainError = ref<string | null>(null);

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
  /**
   * 読み込む: text = PoB コード (人のビルド / 自分のキャラは PoB の Import/Export のコード) か poe.ninja の URL。
   * code = 読み直す時 (「全部戻す」) の、前に読んだ PoB コード (text が poe.ninja の URL でも取り直さない)
   */
  async function load(opts: { keepBase?: boolean; text?: string; code?: string } = {}): Promise<void> {
    const text = opts.text ?? input.value;
    if (!text.trim()) return;
    if (loading.value || busy.value) return;
    const prev = cur.value;
    loading.value = true;
    error.value = null;
    try {
      // 読み込み・部品送り・数字・ツリー を 1 つの run にまとめる (間に他の操作が割り込まない)
      const { s, nodes, code } = await run(async () => {
        const code = await loadBuild(opts.code ?? text);
        return { s: await summary(), nodes: (await treeStatic()).nodes, code };
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
      lastSource.value = { text, code };
      // 上のバーのスキルは読み込んだ時に確定 (DPS が一番高い物)。変更で順位が入れ替わっても勝手に変わらない
      focusKey.value = skillsOf(s)[0]?.key ?? null;
      loadSeq.value++;
      recordHistory("pob-check", opts.keepBase ? "reload" : opts.code ? "reset" : "load", { input: text.slice(0, 200), char: s.char, stats: s.stats });
      loadedFrom.value = parseNinjaUrl(text) ? "poe.ninja" : "PoB コード";
    } catch (e) {
      error.value = msg(e);
    } finally {
      loading.value = false;
    }
  }
  /**
   * 比べる相手を読み込む (2026-10-03 オーナー「比較先もビルド読み込みと同じ流れで」)。同じ PoB に相手を読み込んで数字と装備を
   * 写し、自分のビルドは今の状態 (変えた所も込み) をコードにして読み直す。覚え (元の物・ツリーの元) は PCK.stash / unstash で保つ
   */
  async function loadTarget(text = targetInput.value): Promise<void> {
    const t = text.trim();
    if (!t || loading.value || busy.value) return;
    loading.value = true;
    error.value = null;
    try {
      const { s, p, code } = await run(async () => {
        const mine = cur.value ? await exportCode() : null;
        if (mine) await stashState();
        const code = await loadBuild(t);
        const s = await summary();
        // 相手のビルドプランナーの中身は、相手が PoB にいる今のうちに作る (失敗しても相手の差は出す)
        const p = await plan(planName(s, "相手"), "ExileDesk").catch(() => null);
        if (mine) {
          await loadBuild(mine);
          await unstashState();
        }
        return { s, p, code };
      });
      target.value = s;
      targetPlan.value = p;
      targetCode.value = code;
      targetFrom.value = parseNinjaUrl(t) ? "poe.ninja" : "PoB コード";
      recordHistory("pob-check", "target", { input: t.slice(0, 200), char: s.char, stats: s.stats, plan: p ? { passives: p.passives, skills: p.skills } : null });
      // 自分のビルドを読み直したので、数字を今の物に (変えた所は PoB の中に残っている)
      if (cur.value) cur.value = await run(summary);
    } catch (e) {
      error.value = msg(e);
    } finally {
      loading.value = false;
    }
  }
  function clearTarget(): void {
    target.value = null;
    targetPlan.value = null;
    targetCode.value = null;
    targetFrom.value = "";
    estimates.value = null;
    adopted.value = new Set();
  }

  // ---------------------------------------------------------------- 火力の内訳 (2026-10-03)
  /** 今の自分・上のバーのスキルの内訳があるか (変えた・スキルを切り替えた後は古い) */
  const chainFresh = computed(() => !!chain.value && chain.value.of === cur.value && chain.value.key === focus.value?.key);
  /**
   * 内訳を取り直す (内訳のタブが開いている時だけ画面が呼ぶ。1 回 1 秒くらい)。act() の計算し直しと同じ列に並ぶので、変えた直後に呼んでも
   * 変えた後の数字になる。PoB のビルドは変えない (PCK.breakdown は主スキルの選びを戻す)
   */
  async function refreshChain(): Promise<void> {
    const f = focus.value;
    const mine = cur.value;
    if (!f || !mine || chainLoading.value) return;
    if (chain.value && chain.value.of === mine && chain.value.key === f.key) return;
    chainLoading.value = true;
    try {
      const raw = await run(() => fetchBreakdown(f.g.i, f.s.k));
      const c = buildChain(raw);
      chain.value = { chain: c, of: mine, key: f.key };
      chainError.value = null;
      recordHistory("pob-check", "breakdown", { skill: f.s.name, dps: Math.round(c.dps), hitDps: Math.round(c.hitDps), ok: c.okDps && c.okHit, mismatches: c.mismatches });
    } catch (e) {
      chainError.value = msg(e);
    } finally {
      chainLoading.value = false;
    }
  }

  // ---------------------------------------------------------------- 取り入れの試算 (2026-10-03)
  /** 試算の対象 (差の 1 項目ずつ)。相手が無ければ空 */
  const candidates = computed(() => (cur.value && target.value ? adoptCandidates(cur.value, target.value, treeNodes.value) : []));
  /** 試算した後に自分を変えた (取り入れた・他で変えた) = 数字が古い */
  const estimatesStale = computed(() => !!estimates.value && (estimates.value.of !== cur.value || estimates.value.focusKey !== focus.value?.key));
  /** ライフ等の変化 (後 − 前) */
  const statDelta = (r: EstimateRaw): EstimateStats => {
    const out = {} as EstimateStats;
    for (const k of Object.keys(r.statsWith) as Array<keyof EstimateStats>) out[k] = (r.statsWith[k] ?? 0) - (r.stats[k] ?? 0);
    return out;
  };
  /**
   * 候補を順に PoB で試算する (1 つ 1〜3 秒。装備はユニークだけ行ごとの効きも)。ビルドは変えない。
   * 1 つ失敗しても残りは続け、その行に理由を出す
   */
  async function runEstimates(): Promise<void> {
    const f = focus.value;
    const mine = cur.value;
    // ツリーを先に (今の自分が基準)。残り (装備・ジュエル・リネージュ) は「ツリーを相手と同じにした上で」を基準にする
    // (2026-10-04 オーナー「基準はノード類は真似前提にしないと乗算効かんからな」「そら装備だけ真似してもね」)
    const list = [...candidates.value].sort((a, b) => (a.kind === "tree" ? 0 : 1) - (b.kind === "tree" ? 0 : 1));
    const tgt = target.value;
    if (!f || !mine || !tgt || !list.length || estimating.value || busy.value || loading.value) return;
    estimating.value = true;
    const out: Estimate[] = [];
    const plan = copyAllPlan(mine, tgt, treeNodes.value);
    const total = list.length + 1;
    let treeBased = false;
    let all: EstimateAll | null = null;
    try {
      for (const [idx, c] of list.entries()) {
        estimateProgress.value = `${idx + 1}/${total}`;
        if (c.kind !== "tree" && !treeBased && (plan.tree.add.length || plan.tree.remove.length)) {
          await run(() => setEstimateTree({ ...plan.tree, attr: tgt.tree.attr ?? [] }));
          treeBased = true;
        }
        try {
          const r = await run<EstimateItemRaw | EstimateGemsRaw | EstimateTreeRaw | EstimateJewelRaw>(() =>
            c.kind === "item" ? estimateItem(f.g.i, f.s.k, c.slot, c.to.raw, c.unique)
              : c.kind === "gems" ? estimateGems(f.g.i, f.s.k, c.gi, c.gems)
                : c.kind === "tree" ? estimateTree(f.g.i, f.s.k, c.add, c.remove)
                  : estimateJewel(f.g.i, f.s.k, c.slot, c.to.raw, c.nodeId),
          );
          const ratio = r.base > 0 ? r.with / r.base : 1;
          const e: Estimate = { c, dps: f.s.game.dps * ratio, stats: statDelta(r) };
          if ("lines" in r && r.lines) {
            // 行を抜いた時に DPS が下がる割合 = その行の効き。下がらない行は出さない
            e.lines = r.lines
              .map((x) => ({ line: x.line, loss: r.with > 0 ? 1 - x.dps / r.with : 0 }))
              .filter((x) => x.loss > 0.0005)
              .sort((a, b) => b.loss - a.loss)
              .slice(0, 3);
          }
          if ("displaced" in r && r.displaced.length) e.displaced = r.displaced;
          if ("unknown" in r && r.unknown.length) e.unknown = r.unknown;
          if ("focusLost" in r && r.focusLost) e.focusLost = true;
          // 武器の欄が使っていない側の武器セット (Weapon 1 Swap を I で使っている時など) なら、今の DPS は変わらない
          if (c.kind === "item" && /^Weapon/.test(c.slot)) e.unusedSet = c.slot.endsWith(" Swap") !== (mine.weaponSet === 2);
          if ("n" in r) e.n = r.n;
          if ("removed" in r) e.removed = r.removed;
          if ("socketAdded" in r) e.socketAdded = r.socketAdded;
          if ("newDps" in r && r.newDps != null && c.kind === "gems" && c.gi === 0) {
            const g = target.value?.groups.find((x) => x.gems.some((y) => y === c.active));
            const ratio2 = g?.skills.find((s) => s.name === c.active.name)?.game.enemyRatio;
            // 足した組の DPS は相手の行の物差し (敵側の割り戻し) が分からないので、相手の同じスキルの比があればそれで
            e.newDps = r.newDps * (ratio2 ?? 1);
          }
          out.push(e);
        } catch (err) {
          out.push({ c, dps: f.s.game.dps, stats: {} as EstimateStats, error: msg(err) });
        }
      }
      // 全部まとめて真似したら (ツリー → + 装備・ジュエル → + ジェム)。1 つずつの数字は掛け算で伸びる分・揃って初めて効く分が入らないので、
      // 足しても相手との差にならない (オーナー 2026-10-04「全部足したら 207% のはずが 30%」)
      estimateProgress.value = `${total}/${total}`;
      if (treeBased) {
        await run(() => setEstimateTree(null));
        treeBased = false;
      }
      try {
        const r = await run(() => estimateAll(f.g.i, f.s.k, {
          items: plan.items,
          tree: plan.tree,
          groups: plan.groups.map((g) => ({ gi: g.gi, gems: g.gems.map((x) => ({ name: x.name, gemId: x.gemId, level: x.level, quality: x.quality, corrupt: x.corrupt, enabled: x.enabled })) })),
          off: plan.off,
          attr: tgt.tree.attr ?? [],
          config: tgt.config.input ?? null,
        }));
        const k = r.cur > 0 ? f.s.game.dps / r.cur : 1;
        all = { tree: r.tree * k, items: r.items * k, gems: r.gems * k, config: r.config != null ? r.config * k : null, life: [r.stats.Life, r.statsTree.Life, r.statsItems.Life, r.statsGems.Life], es: [r.stats.EnergyShield, r.statsTree.EnergyShield, r.statsItems.EnergyShield, r.statsGems.EnergyShield] };
        // ツリーの行は計算の上書きで出した物なので、本当に付け替えた「ツリーを相手と同じに」の段の数字にそろえる (属性ノード・ジュエルの範囲込み)
        const treeRow = out.find((e) => e.c.kind === "tree" && !e.error);
        if (treeRow && r.cur > 0) treeRow.dps = all.tree;
      } catch (err) {
        all = { tree: 0, items: 0, gems: 0, config: null, life: [], es: [], error: msg(err) };
      }
      // 火力に関係ない装備・ジュエル (DPS の変化 0.5% 未満) は出さない (2026-10-04 オーナー「火力に関係ない装備は表示しなくていい、ややこしい」)。
      // ツリーとリネージュは出す。並びは DPS の変化が大きい順 (失敗は最後)
      const base = f.s.game.dps;
      const quiet = (e: Estimate): boolean => !e.error && (e.c.kind === "item" || e.c.kind === "jewel") && base > 0 && Math.abs(e.dps / base - 1) < 0.005;
      const shown = out.filter((e) => !quiet(e));
      shown.sort((a, b) => (a.error ? 1 : 0) - (b.error ? 1 : 0) || b.dps - a.dps);
      estimates.value = { list: shown, of: mine, focusKey: f.key, dps: base, quiet: out.length - shown.length, all, treeBased: !!(plan.tree.add.length || plan.tree.remove.length) };
      recordHistory("pob-check", "adopt-estimate", {
        skill: f.s.name,
        dps: f.s.game.dps,
        results: out.map((e) => ({ kind: e.c.kind, key: e.c.key, dps: Math.round(e.dps), life: e.stats.Life, error: e.error })),
      });
    } finally {
      // 試算の基準のツリーは必ず外す (他の計算に混ざらないように)
      if (treeBased) await run(() => setEstimateTree(null)).catch(() => undefined);
      estimating.value = false;
      estimateProgress.value = "";
    }
  }
  /**
   * 取り入れる: 装備 = 相手の物を自分の欄に (英語の PoB の文面なので changeItem がそのまま通す)、ジェム = 自分の組を相手の構成に (無い組は足す)、
   * ツリー = 束のノードを 1 つずつ取る (PoB が始点からの道も取る。つながらないノードで止めて理由を出す)。返り値は画面に出す失敗の理由
   */
  async function adopt(c: AdoptCandidate): Promise<string | null> {
    try {
      if (c.kind === "item") {
        await changeItem(c.slot, c.to.raw);
      } else if (c.kind === "gems") {
        const r = await act({
          fn: () => setGroupGems(c.gi, c.gems.map((g) => ({ name: g.name, gemId: g.gemId, level: g.level, quality: g.quality, corrupt: g.corrupt, enabled: g.enabled }))),
          history: ["adopt", (x) => ({ kind: "gems", gi: c.gi, active: c.active.name, gems: c.gems.map((g) => g.name), unknown: x.unknown })],
          note: c.gi ? `${gemJa(c.active.name)} の組を相手の構成に` : `${gemJa(c.active.name)} の組を足す (相手の構成)`,
          rethrow: true,
        });
        if (!r) return "読み込み中か計算中です";
        if (r.unknown.length) return `PoB が知らないジェムは入れていません: ${r.unknown.map(gemJa).join("、")}`;
      } else if (c.kind === "jewel") {
        // 穴を取っていなければ先に取る (始点からの道も PoB が取る)。それからジュエルを入れる
        if (!cur.value?.tree.alloc.includes(c.nodeId)) {
          const err = await clickNode(c.nodeId, 1);
          if (err) return `ジュエルの穴: ${err}`;
        }
        await changeItem(c.slot, c.to.raw);
        recordHistory("pob-check", "adopt", { kind: "jewel", slot: c.slot, title: c.to.title });
      } else {
        return "ツリーは振り直しで真似してください (試算だけ)";
      }
      if (c.kind === "item") recordHistory("pob-check", "adopt", { kind: "item", slot: c.slot, title: c.to.title, base: c.to.base });
      adopted.value = new Set([...adopted.value, c.key]);
      return null;
    } catch (e) {
      return msg(e);
    }
  }

  /** ビルドプランナーのファイル名 (拡張子なし)。誰の物か分かるよう ExileDesk を入れる */
  function planName(s: Summary, who: string): string {
    return `${s.char.ascendancy || s.char.class} Lv${s.char.level} - ${who} - ExileDesk`;
  }
  /**
   * ゲームのビルドプランナーに書き出す (2026-10-03 オーナー「相手のビルドのビルドプランナーもそのまま使えるようにしたい」)。
   * which = mine: 今の自分のビルド (変えた所も込み) を今 PoB から作る / target: 相手を読み込んだ時に作った物。
   * 返り値は画面に出す文 (失敗は error に出して null)
   */
  async function exportPlan(which: "mine" | "target"): Promise<string | null> {
    try {
      let p: BuildPlan | null;
      let name: string;
      if (which === "mine") {
        if (!cur.value) return null;
        name = planName(cur.value, "自分");
        p = await run(() => plan(name, "ExileDesk"));
      } else {
        p = targetPlan.value;
        name = target.value ? planName(target.value, "相手") : "相手 - ExileDesk";
        if (!p) throw new Error("相手のビルドプランナーの中身がありません (相手を読み直してください)");
      }
      const path = await buildPlannerWrite(name, p.json);
      recordHistory("pob-check", "plan", { which, path, passives: p.passives, skills: p.skills, unknownNodes: p.unknownNodes, skippedGems: p.skippedGems, changes: which === "mine" ? changes.value : undefined });
      const file = path.split(/[\\/]/).pop() ?? path;
      const notes: string[] = [];
      if (p.unknownNodes.length) notes.push(`ID の分からないノード ${p.unknownNodes.length} 個は入れていません`);
      if (p.skippedGems) notes.push(`PoB が知らないジェム ${p.skippedGems} 個は入れていません`);
      return `${file} に書きました。ゲームのビルドプランナーの一覧に出ます (ゲームを開き直す)${notes.length ? "。" + notes.join("、") : ""}`;
    } catch (e) {
      error.value = msg(e);
      return null;
    }
  }

  /** 全部戻す (2026-10-03 オーナー「火力チェックのリセット機能も欲しい」): 読み込んだ元をもう 1 回読み込む。比べる元も読み込んだ時に戻る。相手は残す */
  /**
   * リセット = この画面を初めて開いた状態に戻す (2026-10-03 オーナー「全部戻すボタンはリセットボタンへ。初めてこのページを開く状態へ」)。
   * 自分のビルド・比べる相手・試算・入力欄・変えた所を全部消す。PoB の中身は次の読み込みで入れ替わるので触らない。
   * 何か読み込んである、または欄に何か入っていれば押せる
   */
  const canReset = computed(() => !!cur.value || !!target.value || !!input.value || !!targetInput.value);
  function resetAll(): void {
    if (loading.value || busy.value) return;
    recordHistory("pob-check", "reset", { had: { mine: !!cur.value, target: !!target.value } });
    cur.value = null;
    base.value = null;
    baseAt.value = "";
    changes.value = [];
    lastSource.value = null;
    loadedFrom.value = "";
    focusKey.value = null;
    input.value = "";
    treeNodes.value = [];
    power.value = null;
    powerProgress.value = "";
    error.value = null;
    estimates.value = null;
    adopted.value = new Set();
    chain.value = null;
    chainError.value = null;
    clearTarget();
    targetInput.value = "";
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

  /** 相手のスキルの表 (スキルごとの比較用。自分と同じ決まりで 2 重を除き DPS 0 を落とす) */
  const targetSkills = computed(() => skillsOf(target.value));

  return { chain, chainLoading, chainError, chainFresh, refreshChain, targetSkills, candidates, estimates, estimating, estimateProgress, estimatesStale, adopted, runEstimates, adopt, target, targetFrom, targetInput, targetPlan, targetCode, loadTarget, clearTarget, exportPlan, canReset, resetAll, lastSource, canReload, reload, loadedFrom, shareCode, changes, clickNode, resetTreeToLoaded, power, powerProgress, computePower, treeNodes, loadSeq, input, loading, busy, error, cur, base, baseAt, skills, baseSkills, focus, focusBase, focusKey, groups, merged, load, setBaseToNow, changeGem, toggleGroup, changeCharges, changeItem, clearItem, restoreItem, changeWeaponSet };
}
