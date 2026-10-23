/**
 * use-tree.ts — ツリーのページの状態 (2026-10-22 表面だけ): 今のツリー・1 つ戻す (Ctrl+Z)・ブラウザに覚える・木のベースの MOD の一覧。
 * MOD の一覧はエンジンの入口の modListFor (クラフト台の MOD 一覧と同じ行。自前の表は作らない)。ベースとアイテムレベルは木の base・itemLevel (始まりの箱で選ぶ、10-22。前は金の指輪 ilvl 82 に固定)
 */
import { computed, ref, shallowRef, watch } from "vue";
import { craftStage as s, nameOf } from "../../../state/craft-stage";
import { priceOfKey } from "../../../state/for-share/craft-stage-shelf";
import { freshItem, modListFor, mulberry32 } from "../../../services/craft-stage/engine";
import { minIlvlFor, tierRankLabel } from "../../../services/craft-stage/engine";
import { startItemOf } from "../../../services/simulator/tree/tree-sample";
import { isTreeDoc, migrateStart, newTree, startOf, type Aim, type StartMod, type TreeDoc, type TreeRarity } from "../../../services/simulator/tree/tree-model";
import { treeBaseCost } from "../../../services/simulator/tree/tree-base-cost";
import { addTreeRecipe, sameTree, setCurrentTreeRecipe, treeRecipeSaved } from "../../../state/simulator/tree-recipes";
import { tr } from "../../../i18n/lang";

export type ModRow = ReturnType<typeof modListFor>[number];

/** 初めて開いた時の木のベース (見本と同じ金の指輪 ilvl 82) */
const FIRST_BASE = "Gold Ring";
const FIRST_ILVL = 82;
const KEY = "exiledesk.tree.v0";
/** 全部のタブの木 (下の loadTabs) */
const TABS_KEY = "exiledesk.tree.v0.tabs";
const UNDO_MAX = 100;

function load(): TreeDoc {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    // 前の版の妥協の完成 (done: "compromise") は普通の箱 = 未完成として読む (妥協は無し、オーナー 10-22)
    if (isTreeDoc(v)) { for (const b of Object.values(v.boxes)) if (b.done !== "main") b.done = null; migrateStart(v); return v; }
  } catch { /* 無くてよい */ }
  return newTree(FIRST_BASE, FIRST_ILVL);
}
function save(d: TreeDoc): void {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* 覚えられなくても使える */ }
  const list = [...tabDocs.value];
  list[active.value] = d;
  tabDocs.value = list;
  try { localStorage.setItem(TABS_KEY, JSON.stringify({ active: active.value, docs: list })); } catch { /* 覚えられなくても使える */ }
}

/**
 * 開発版の木の保存を 1 回だけ白紙に戻す (10-23 オーナー「開発版のキャッシュを一応リセット。今レアリティとかいろいろ残っているから、前の物はレシピに入れておいて」)。
 * 前の木 (タブ全部・今の木・見本を開く前の控え) のうち白紙の初期値でない物をレシピに「前の木 (10-23)」で入れ、保存に書けたのを確かめてから木の鍵を消す。
 * 書けなかった時は何も消さず、次に開いた時にもう一度。レシピ・ミニマップなどの好み・エミュとチュートリアルの保存は触らない
 */
const RESET_KEY = "exiledesk.tree.reset-2026-10-23";
const BEFORE_SAMPLE_KEY = "exiledesk.tree.v0.before-sample";
function resetOldTreesOnce(): void {
  try {
    if (localStorage.getItem(RESET_KEY)) return;
    const found: TreeDoc[] = [];
    const take = (v: unknown): void => { if (isTreeDoc(v) && !found.some((d) => sameTree(d, v)) && !sameTree(v, newTree(v.base, v.itemLevel))) found.push(v); };
    const tabs = JSON.parse(localStorage.getItem(TABS_KEY) ?? "null") as { docs?: unknown[] } | null;
    for (const d of tabs?.docs ?? []) take(d);
    take(JSON.parse(localStorage.getItem(KEY) ?? "null"));
    take(JSON.parse(localStorage.getItem(BEFORE_SAMPLE_KEY) ?? "null"));
    const kept = found.map((d, i) => addTreeRecipe(found.length > 1 ? `前の木 (10-23) ${i + 1}` : "前の木 (10-23)", d));
    if (!kept.every((r) => treeRecipeSaved(r.id))) return;
    for (const k of [KEY, TABS_KEY, BEFORE_SAMPLE_KEY]) localStorage.removeItem(k);
    if (kept.length) setCurrentTreeRecipe(null);
    localStorage.setItem(RESET_KEY, "1");
  } catch { /* 読めない・書けない時は何もしない (次に開いた時にもう一度) */ }
}
resetOldTreesOnce();

const doc = shallowRef<TreeDoc>(load());
/**
 * 木のタブ (始め方ごとに別の木、0 の完成形は共通。オーナー 10-22「✦ の候補を 2 つ試したい人のために <MOD 名> スタートのタブで木を 2 本」)。
 * 今のタブの木は doc (KEY にも控える)、全部のタブは TABS_KEY。切り替える時に 0 の完成形 (ベース・アイテムレベル・適正・レアリティ・狙い) を今の木から写す
 */
function loadTabs(): { active: number; docs: TreeDoc[] } | null {
  try {
    const v = JSON.parse(localStorage.getItem(TABS_KEY) ?? "null") as { active: number; docs: unknown[] } | null;
    if (v && Array.isArray(v.docs) && v.docs.length && v.docs.every(isTreeDoc) && v.active >= 0 && v.active < v.docs.length) { for (const d of v.docs) migrateStart(d); return v as { active: number; docs: TreeDoc[] }; }
  } catch { /* 無くてよい */ }
  return null;
}
const tabs0 = loadTabs();
const active = ref(tabs0?.active ?? 0);
const tabDocs = shallowRef<TreeDoc[]>(tabs0 ? tabs0.docs.map((d, i) => (i === tabs0.active ? doc.value : d)) : [doc.value]);
/** タブごとに回した結果 (結果のまとめの始め方の比べ。このページを開いている間だけ) */
export interface TabRun { perItem: number; pct: number; price: number }
const tabRuns = shallowRef<(TabRun | null)[]>(tabDocs.value.map(() => null));
/** 0 の完成形を from から to へ (ベースが違えばそのベースの白紙から) */
function shareGoal(from: TreeDoc, to: TreeDoc): TreeDoc {
  const d = to.base === from.base ? to : newTree(from.base, from.itemLevel);
  d.itemLevel = from.itemLevel;
  if (from.ilvlFit) d.ilvlFit = true; else delete d.ilvlFit;
  if (from.goal) d.goal = { ...from.goal }; else delete d.goal;
  if (from.memoAims) d.memoAims = from.memoAims.map((a) => ({ ...a })); else delete d.memoAims;
  return d;
}
function setActive(i: number, next: TreeDoc): void {
  active.value = i;
  undoStack.length = 0;
  canUndo.value = false;
  opened.value++;
  doc.value = next;
  save(next);
}
/** タブを替える (1 つ戻すは替えたタブの分から) */
function switchTab(i: number): void {
  if (i === active.value || !tabDocs.value[i]) return;
  setActive(i, shareGoal(doc.value, JSON.parse(JSON.stringify(tabDocs.value[i])) as TreeDoc));
}
/** 新しいタブ (0 の完成形は同じ、スタートから下は白紙) を足して開く */
function addTab(): void {
  const cur = doc.value;
  tabDocs.value = [...tabDocs.value, cur];
  tabRuns.value = [...tabRuns.value, null];
  setActive(tabDocs.value.length - 1, shareGoal(cur, newTree(cur.base, cur.itemLevel)));
}
/** タブを閉じる (最後の 1 つは閉じない) */
function closeTab(i: number): void {
  if (tabDocs.value.length <= 1) return;
  const cur = doc.value, list = tabDocs.value.filter((_, j) => j !== i);
  tabRuns.value = tabRuns.value.filter((_, j) => j !== i);
  if (i === active.value) { const k = Math.max(0, i - 1); tabDocs.value = list; setActive(k, shareGoal(cur, JSON.parse(JSON.stringify(list[k]!)) as TreeDoc)); return; }
  if (i < active.value) active.value--;
  tabDocs.value = list;
  save(doc.value);
}
/** 今のタブを回した結果を控える (結果のまとめが開いた時) */
function noteRun(r: TabRun): void { const list = [...tabRuns.value]; list[active.value] = r; tabRuns.value = list; }
const undoStack: string[] = [];
const canUndo = shallowRef(false);

/** 組み替えを 1 回 (写しを書き換えて差し替える。前の形は 1 つ戻す用に控える) */
function edit(fn: (d: TreeDoc) => void): void {
  const before = JSON.stringify(doc.value);
  const d = JSON.parse(before) as TreeDoc;
  fn(d);
  const after = JSON.stringify(d);
  if (after === before) return;
  undoStack.push(before);
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  canUndo.value = true;
  doc.value = d;
  save(d);
}
/** 1 つ戻す。ツリーのメモの文は戻さない (メモ欄の中の Ctrl+Z が受け持つ。ツリーの Ctrl+Z で書いた文がまとめて消えた、10-22) */
function undo(): void {
  const prev = undoStack.pop();
  canUndo.value = undoStack.length > 0;
  if (!prev) return;
  const d = JSON.parse(prev) as TreeDoc;
  d.note = doc.value.note;
  doc.value = d;
  save(d);
}
/** ツリーのメモの文を書く (打つたびに覚える、1 つ戻すには入れない) */
function setTreeNote(text: string): void {
  if ((doc.value.note ?? "") === text) return;
  const d: TreeDoc = { ...doc.value, note: text };
  if (!text) delete d.note;
  doc.value = d;
  save(d);
}
/** 別の木を開いた回数 (開いた木の箱を上から順に出し直す、use-tree-reveal.ts) */
const opened = ref(0);
/** 別の木を開く (レシピ・共有の URL から。1 つ戻すで前の木へ戻せる) */
function open(tree: TreeDoc): void { opened.value++; edit((d) => { for (const k of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[k]; Object.assign(d, JSON.parse(JSON.stringify(tree))); migrateStart(d); }); }
/** 白紙に戻す (今のベースとアイテムレベルのまま。1 つ戻すで戻せる) */
function reset(): void { edit((d) => { Object.assign(d, newTree(d.base, d.itemLevel)); }); }
/** ベースを替える = そのベースの白紙から (狙い・手は前のベースの MOD なので残さない)。アイテムレベルだけなら木はそのまま。1 つ戻すで戻せる */
function setBase(base: string, itemLevel: number): void {
  edit((d) => {
    if (d.base === base) { d.itemLevel = itemLevel; return; }
    for (const k of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[k];
    Object.assign(d, newTree(base, itemLevel));
  });
}
/**
 * 白紙の木を開いた時に、まず 0 完成形の設定の重ね窓 (TreeGoalPage) を出すか (10-22 オーナー「ツリー特化」)。
 * クラフト台の「このベースでクラフトの道へ」から来た時はベースが決まっているので出さない (1 回だけ)
 */
const askBase = ref(true);
/** 0 完成形の設定の重ね窓 (TreeGoalPage.vue): 0 = 閉じている、1 = ベース・レアリティ・アイテムレベル、2 = 完成の MOD (オーナー 10-22) */
const goalPage = ref<0 | 1 | 2>(0);
/** スタートの箱の重ね窓 (TreeStartPage.vue。始まりに付いている MOD・✦・乱数の数) */
const startPage = ref(false);
/** 完成の狙い (0 の箱で決める。前の「欲しい MOD のメモ」memoAims を使い回す。後の箱の当たりはこの一覧から選ぶ、オーナー 10-22) */
const goals = computed((): Aim[] => doc.value.memoAims ?? []);
const hasGoal = (modId: string, tier: number): boolean => goals.value.some((a) => a.modId === modId && a.tier === tier);
/** 狙いにする / 外す (同じ MOD は段だけ替える。1 つ戻すで戻せる) */
function toggleGoal(modId: string, tier: number): void {
  edit((d) => {
    const list = d.memoAims ?? [], same = list.find((a) => a.modId === modId);
    const next = same?.tier === tier ? list.filter((a) => a.modId !== modId) : same ? list.map((a) => (a.modId === modId ? { modId, tier } : a)) : [...list, { modId, tier }];
    if (next.length) d.memoAims = next; else delete d.memoAims;
  });
}
/** 完成形のアイテム (木のベースに狙いを全部その段で付けた物。付け方はエンジンの force = スタートの箱と同じ startItemOf)。付けられない狙いは note */
const goalItem = computed(() => {
  const data = s.data.value, d = doc.value;
  if (!data) return null;
  return startItemOf(data, { ...d, start: { rarity: goalRarity.value, mods: goalRarity.value === "normal" ? [] : goals.value.map((a) => ({ modId: a.modId, tier: a.tier })) }, startRandom: 0 }, mulberry32(1));
});
/** 完成形のレアリティ (0 の箱、TreeDoc.goal。無ければレア。1 つ戻すで戻せる) */
const goalRarity = computed((): TreeRarity => doc.value.goal?.rarity ?? "rare");
function setRarity(r: TreeRarity): void { edit((d) => { if (r === "rare") delete d.goal; else d.goal = { rarity: r }; }); }
/** スタートのレアリティ (start.rarity)。ノーマルは MOD 無しの白なので、始まりの MOD と乱数の数を外す (1 つ戻すで戻せる) */
/** 始め方のベースの値段 (神、start.price。無ければ前の版の始め方の比べの一番安い物、どちらも無ければ 0)。100 人回す時の 1 本ごとの値段 */
const startPrice = (): number => startOf(doc.value).price ?? baseCost.value?.best?.cost ?? 0;
function setStartPrice(v: number | null): void { edit((d) => { migrateStart(d); if (v == null || !Number.isFinite(v) || v < 0) delete d.start!.price; else d.start!.price = v; }); }
function setStartRarity(r: TreeRarity): void { edit((d) => { migrateStart(d); d.start!.rarity = r; if (r === "normal") { d.start!.mods = []; delete d.startRandom; } }); }
/** blank = 始まりの箱に手が無い (白紙) */
const isBlank = (d: TreeDoc): boolean => !d.boxes.start?.hand && !d.boxes.start?.split && Object.keys(d.boxes).length === 1;
/** 白紙の木を開いた時にベースを選ばせるか (読んだら下ろす) */
function takeAskBase(): boolean { const v = askBase.value && isBlank(doc.value); askBase.value = true; return v; }
/** クラフト台のベースとアイテムレベルで白紙の木を開く (前の木は 1 つ戻すで戻せる)。ページを開くのは呼ぶ側 */
function startTreeWith(base: string, itemLevel: number): void {
  opened.value++;
  edit((d) => { for (const k of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[k]; Object.assign(d, newTree(base, itemLevel)); });
  askBase.value = false;
}
/**
 * アイテムレベルの「適正」(オーナー 10-22「ベース → アイテムレベル適正 → ツリー」): 狙い (当たりの箱・始まりの MOD・欲しい MOD のメモ) の段が全部付く一番低いレベル
 * = 段の MOD レベルの一番高い物。狙いが無ければ null (今のレベルのまま)
 */
const fitIlvl = computed<number | null>(() => {
  const data = s.data.value, d = doc.value;
  if (!data) return null;
  const aims: Aim[] = [...Object.values(d.boxes).flatMap((b) => (b.out === "hit" && b.aim ? [b.aim] : [])), ...startOf(d).mods, ...(d.memoAims ?? [])];
  return minIlvlFor(data, aims);
});
/** 適正を使う / 外す (使う時はすぐ合わせる。1 つ戻すで戻せる) */
function setFit(on: boolean): void {
  edit((d) => { if (on) { d.ilvlFit = true; if (fitIlvl.value) d.itemLevel = fitIlvl.value; } else delete d.ilvlFit; });
}
// 適正の間は狙いが変わるたびに合わせる (組み替えの 1 手と一緒なので 1 つ戻すには入れない)
watch(fitIlvl, (lv) => {
  const d = doc.value;
  if (!d.ilvlFit || !lv || lv === d.itemLevel) return;
  doc.value = { ...d, itemLevel: lv };
  save(doc.value);
});
/** 始めのアイテムにフラクチャーのほか付いている乱数の MOD の数 (素の高貴を n 回、tree-sample の startItemOf。0 は消す。1 つ戻すで戻せる) */
function setStartRandom(n: number): void { edit((d) => { if (n > 0) d.startRandom = n; else delete d.startRandom; }); }
/** ベースを替えると消える箱の数 (始まりより下の、画面に出る箱。品質を上げた後の通り抜けは数えない) */
const lostOnBase = computed(() => Object.values(doc.value.boxes).filter((b) => b.out !== "start" && b.out !== "pass").length);

/** 木のベース (レア) に付く MOD の行。データが読めるまでは空 */
const rows = computed((): ModRow[] => {
  const data = s.data.value;
  if (!data) return [];
  return modListFor(data, freshItem(data, doc.value.base, doc.value.itemLevel, "rare"));
});
const rowOfMod = (modId: string): ModRow | undefined => rows.value.find((r) => r.id === modId || r.tiers.some((t) => t.modId === modId));

/** 当たりの札の文 (「T2 以上」+ MOD の文。箱の幅で切れても段が見えるよう段が先) */
function aimLabel(a: Aim | null): string {
  if (!a) return "";
  const r = rowOfMod(a.modId);
  const side = r ? (r.side === "prefix" ? tr("プレ", "Prefix") : tr("サフィ", "Suffix")) : "";
  return `${tierRankLabel(a.tier)} ${side} ${r?.template ?? a.modId}`;
}
/** 狙いの MOD の短い名前 (戻り先の札で、どの狙いの所の箱かを添える) */
const aimShort = (a: Aim): string => rowOfMod(a.modId)?.template ?? a.modId;
/** 始まりの MOD の文 (その段の数値で埋めた文 + 段) */
function startModLabel(a: Aim | StartMod | null): string {
  if (!a) return "";
  const r = rowOfMod(a.modId);
  // まとめ行 (同じ系統の別の MOD) は段ごとに modId がある。その MOD の段だけで数える
  const t = r?.tiers.filter((x) => (x.modId ?? r.id) === a.modId)[a.tier - 1];
  return `T${a.tier} ${t?.text ?? r?.text ?? a.modId}`;
}

/** ツリーのベースのアイテム (値段の鍵を引く。骨は部位で顎骨・肋骨・鎖骨が変わる) */
const treeItem = computed(() => (s.data.value ? freshItem(s.data.value, doc.value.base, doc.value.itemLevel, "rare") : null));
/**
 * ツリーの値段 (高貴建て、相場)。エミュレーターの今のアイテムでなくツリーのベースで引く (10-22 分析君の調べ: 骨がツリーの部位と違う物になるか 0 になった)
 */
const treePrice = (key: string): number => priceOfKey(key, treeItem.value);
/**
 * 始まりの箱のベースの値段 (始め方を ③ の計算で比べた一番安い物、tree-base-cost.ts。カレンシーは今の相場)。
 * 計算は 1 回 3〜4 秒かかる (③ の式)。10-22 オーナー「この画面にならないように」: 開いた時にこれを先に計算して、ページが真っ黒のまま 3 秒待たされた。
 * なので (1) 値段に関わる物 (ベース・アイテムレベル・始まりの形と値段) だけを鍵にし、箱を足しても計算し直さない (前は木を替えるたびに計算した)
 * (2) 最初の計算は箱を全部出し終えて描いた後に回す (allowCost、計算中は題の横の札) (3) 同じ鍵と相場の答えは覚える
 */
const costKey = computed(() => JSON.stringify({ b: doc.value.base, l: doc.value.itemLevel, s: startOf(doc.value) }));
const costReady = ref(false);
let costAsked = false;
/** 始まりの値段の計算を始めてよい (ツリーのページが箱を全部出し終えた時、use-tree-reveal)。描いてから (2 フレーム待って) 計算する */
export function allowCost(): void {
  if (costReady.value || costAsked) return;
  costAsked = true;
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => { costReady.value = true; }, 0)));
}
const costMemo = new Map<string, ReturnType<typeof treeBaseCost>>();
const baseCost = computed(() => {
  const d = s.data.value;
  if (!d) return null;
  if (!costReady.value) return null;
  const key = costKey.value;
  const { b, l, s: st } = JSON.parse(key) as { b: string; l: number; s: ReturnType<typeof startOf> };
  // 相場 (神の値段と骨・オーブの値段) も鍵に。ここで読むので相場が変われば計算し直す
  const mk = `${key}|${treePrice("divine")}|${treePrice("exalt")}|${treePrice("chaos")}|${treePrice("exalt_greater")}`;
  const hit = costMemo.get(mk);
  if (hit) return hit;
  const r = treeBaseCost(d, { ...newTree(b, l), start: st }, st.prices ?? {}, treePrice, nameOf);
  costMemo.set(mk, r);
  return r;
});
/** 始まりの値段をまだ計算していない (題の横の札) */
const baseCostBusy = computed(() => !!s.data.value && !costReady.value);

export function useTree() {
  return { tabDocs, active, tabRuns, switchTab, addTab, closeTab, noteRun, startPrice, setStartPrice, goalPage, startPage, goals, hasGoal, toggleGoal, goalItem, goalRarity, setRarity, setStartRarity, fitIlvl, setFit, doc, edit, undo, canUndo, reset, setBase, setStartRandom, lostOnBase, open, opened, setTreeNote, rows, aimLabel, aimShort, startModLabel, baseCost, baseCostBusy, treePrice, takeAskBase, startTreeWith };
}
