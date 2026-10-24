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
import { carryAims, placeMods } from "../../../services/craft-stage/engine-sim";
import type { StageItem } from "../../../services/craft-stage/engine";
import { isTreeDoc, migrateStart, newTree, startOf, startRarity, type Aim, type StartMod, type TreeDoc, type TreeRarity } from "../../../services/simulator/tree/tree-model";
import { treeBaseCost } from "../../../services/simulator/tree/tree-base-cost";
import { addTreeRecipe, sameTree, setCurrentTreeRecipe, treeRecipes, treeRecipeSaved } from "../../../state/simulator/tree-recipes";
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

/**
 * 開発版だけ: 出した版が変わったら最初に開いた時 1 回、前の木をレシピに入れてから木の保存を白紙に戻す
 * (10-23 オーナー「毎回キャッシュクリアして。前の設定の MOD やベースが選ばれてる」。形は上の resetOldTreesOnce と同じ)。
 * 版の印は入口の部品ファイルの名前 (中身の hash 付き、出し直すと変わる)。空の木と、もうレシピにある同じ木は入れない。本番・手元の dev では動かさない。
 * 消すのは木・完成形の設定 (ベース・狙いの MOD・レアリティ・印は木の中)・タブ・見本の前の控えだけ。エミュとチュートリアルの保存・レシピ・好みは触らない
 */
const BUILD_KEY = "exiledesk.tree.dev-build";
function resetTreesOnNewBuild(): void {
  if (import.meta.env.VITE_DEV_PREVIEW !== "1") return;
  try {
    const build = [...document.querySelectorAll<HTMLScriptElement>('script[type="module"][src*="/assets/"]')].map((s) => new URL(s.src).pathname).join(" ");
    if (!build || localStorage.getItem(BUILD_KEY) === build) return;
    const found: TreeDoc[] = [];
    const take = (v: unknown): void => {
      // ベースを選んだだけの木 (baseChosen の印だけ) も空の木
      if (!isTreeDoc(v) || sameTree({ ...v, baseChosen: undefined } as TreeDoc, newTree(v.base, v.itemLevel)) || sameTree(v, newTree(v.base, v.itemLevel))) return;
      if (found.some((d) => sameTree(d, v)) || treeRecipes.value.some((r) => sameTree(r.tree, v))) return;
      found.push(v);
    };
    const tabs = JSON.parse(localStorage.getItem(TABS_KEY) ?? "null") as { docs?: unknown[] } | null;
    for (const d of tabs?.docs ?? []) take(d);
    take(JSON.parse(localStorage.getItem(KEY) ?? "null"));
    take(JSON.parse(localStorage.getItem(BEFORE_SAMPLE_KEY) ?? "null"));
    const stamp = new Date().toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const kept = found.map((d, i) => addTreeRecipe(found.length > 1 ? `前の木 (${stamp}) ${i + 1}` : `前の木 (${stamp})`, d));
    if (!kept.every((r) => treeRecipeSaved(r.id))) return;
    for (const k of [KEY, TABS_KEY, BEFORE_SAMPLE_KEY]) localStorage.removeItem(k);
    setCurrentTreeRecipe(null);
    localStorage.setItem(BUILD_KEY, build);
  } catch { /* 読めない・書けない時は何もしない (次に開いた時にもう一度) */ }
}
resetTreesOnNewBuild();

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
/** タブの木を写す (タブごとに別の木。完成形の設定も写さない、10-24 オーナー「タブは人が押した時だけ、新しいツリーを最初から」) */
const cloneDoc = (d: TreeDoc): TreeDoc => JSON.parse(JSON.stringify(d)) as TreeDoc;
/** タブごとの 1 つ戻す・やり直しの控え (替えて戻っても続きから戻せる、10-24 モンキー初めての人の回 9。保存はしない、読み直したら空) */
const histories: Array<{ u: string[]; r: string[] }> = [];
/** from = 今の控えをしまうタブ (閉じたタブは null) */
function setActive(i: number, next: TreeDoc, from: number | null = active.value): void {
  if (from !== null) histories[from] = { u: [...undoStack], r: [...redoStack] };
  const h = histories[i] ?? { u: [], r: [] };
  active.value = i;
  undoStack.splice(0, undoStack.length, ...h.u);
  redoStack.splice(0, redoStack.length, ...h.r);
  canUndo.value = undoStack.length > 0;
  canRedo.value = redoStack.length > 0;
  opened.value++;
  doc.value = next;
  save(next);
}
/** タブを替える (1 つ戻すは替えたタブの分から) */
function switchTab(i: number): void {
  if (i === active.value || !tabDocs.value[i]) return;
  setActive(i, cloneDoc(tabDocs.value[i]!));
  // ベースを選ぶ前の白紙のタブはベース選びから、ほかは完成形の設定を閉じてその木へ (完成形の設定の窓の上のタブから替えた時、10-24 モンキー初めての人の回 8)
  const d = doc.value, blank = !d.baseChosen && isBlank(d) && !d.memoAims?.length;
  needBase.value = blank;
  goalPage.value = blank ? 1 : 0;
}
/** 新しいタブ = 全くの白紙の木 (完成形の設定の 1 = ベース選びから。選ばずに閉じたら空の形、needBase) を足して開く */
function addTab(): void {
  const cur = doc.value;
  tabDocs.value = [...tabDocs.value, cur];
  setActive(tabDocs.value.length - 1, newTree(FIRST_BASE, FIRST_ILVL));
  needBase.value = true;
  goalPage.value = 1;
}
/** タブを閉じる (最後の 1 つは閉じない) */
function closeTab(i: number): void {
  if (tabDocs.value.length <= 1) return;
  const list = tabDocs.value.filter((_, j) => j !== i);
  histories.splice(i, 1);
  if (i === active.value) { const k = Math.max(0, i - 1); tabDocs.value = list; setActive(k, cloneDoc(list[k]!), null); return; }
  if (i < active.value) active.value--;
  tabDocs.value = list;
  save(doc.value);
}
const undoStack: string[] = [];
const canUndo = shallowRef(false);
/** やり直し (1 つ戻した物を戻す。新しく組み替えると消える、10-23 モンキー 1「戻した物がやり直しで戻らない」) */
const redoStack: string[] = [];
const canRedo = shallowRef(false);
function clearHistory(): void {
  undoStack.length = 0;
  redoStack.length = 0;
  canUndo.value = false;
  canRedo.value = false;
}

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
  redoStack.length = 0;
  canRedo.value = false;
  doc.value = d;
  save(d);
}
/** 控えの形へ移る (今の形は反対側の控えへ)。ツリーのメモの文は動かさない (メモ欄の中の Ctrl+Z が受け持つ。ツリーの Ctrl+Z で書いた文がまとめて消えた、10-22) */
function step(from: string[], to: string[]): void {
  const prev = from.pop();
  if (prev) {
    to.push(JSON.stringify(doc.value));
    const d = JSON.parse(prev) as TreeDoc;
    d.note = doc.value.note;
    doc.value = d;
    save(d);
  }
  canUndo.value = undoStack.length > 0;
  canRedo.value = redoStack.length > 0;
}
/** 1 つ戻す */
const undo = (): void => step(undoStack, redoStack);
/** やり直し (Ctrl+Shift+Z / Ctrl+Y) */
const redo = (): void => step(redoStack, undoStack);
/**
 * 別の木で新しく始める (見本を開く時。1 つ戻す・やり直しの控えは空に)。
 * 前は見本を開くのも 1 手で、開いた直後の「1 つ戻す」で見本が丸ごと消えて白紙に見えた (10-23 モンキー 1)。前の木は呼ぶ側が控えに残す
 */
function startFresh(tree: TreeDoc): void {
  needBase.value = false;
  opened.value++;
  const d = JSON.parse(JSON.stringify(tree)) as TreeDoc;
  migrateStart(d);
  clearHistory();
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
function open(tree: TreeDoc): void { needBase.value = false; opened.value++; edit((d) => { for (const k of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[k]; Object.assign(d, JSON.parse(JSON.stringify(tree))); migrateStart(d); }); }
/**
 * 白紙に戻す (今のベースとアイテムレベルのまま。1 つ戻すで戻せる)。前の木の鍵は先に全部消す (setBase と同じ)。
 * 前は上書きだけで、白紙に無い鍵 (乱数の MOD の数 startRandom・完成形のレアリティ goal・完成の狙い memoAims など) が残り、
 * 見本の木から戻すとスタートに乱数の外れの MOD が付いたままだった (10-23 オーナー「スタートは何も設定していないはず」)
 */
function reset(): void {
  edit((d) => {
    const { base, itemLevel } = d;
    for (const k of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[k];
    Object.assign(d, newTree(base, itemLevel));
  });
}
/**
 * ベースを替える = そのベースの白紙から (手は前のベースの物なので残さない)。完成の狙い・始まりの MOD・完成形のレアリティは残し、MOD は新しいベースの同じ MOD へ読み替える
 * (エンジンの入口 carryAims: 部位で modId が別・段の数も違う。10-24 オーナー「MOD 決めたけどベース選び直そうって使い方は多い」)。付かない狙いは外して返す (画面が 1 行で知らせる)。
 * アイテムレベルだけなら木はそのまま。1 つ戻すで戻せる
 */
function setBase(base: string, itemLevel: number): Aim[] {
  needBase.value = false;
  const data = s.data.value;
  const dropped: Aim[] = [];
  edit((d) => {
    if (d.base === base) { d.itemLevel = itemLevel; d.baseChosen = true; return; }
    const { memoAims = [], goal } = d, mods = startOf(d).mods;
    for (const k of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[k];
    Object.assign(d, newTree(base, itemLevel), { baseChosen: true });
    if (!data) return;
    const aims = carryAims(data, base, itemLevel, memoAims);
    dropped.push(...aims.dropped);
    if (aims.kept.length) d.memoAims = aims.kept.map((k) => k.to);
    if (goal) d.goal = goal;
    d.start!.mods = carryAims(data, base, itemLevel, mods).kept.map((k) => k.to);
    migrateStart(d);
  });
  return dropped;
}
/**
 * 白紙の木を開いた時に、まず 0 完成形の設定の重ね窓 (TreeGoalPage) を出すか (10-22 オーナー「ツリー特化」)。
 * クラフト台の「このベースでクラフトの道へ」から来た時はベースが決まっているので出さない (1 回だけ)
 */
const askBase = ref(true);
/** 0 完成形の設定の重ね窓 (TreeGoalPage.vue): 0 = 閉じている、1 = ベース・レアリティ・アイテムレベル、2 = 完成の MOD (オーナー 10-22) */
const goalPage = ref<0 | 1 | 2>(0);
/**
 * ベースが無い (白紙の木でベースを選ばずに完成形の設定を閉じた) 時の空の形を出すか。木は出さず、真ん中に「ベースを選ぶ」1 つ
 * (10-23 オーナー「ベースが無いとツリーもくそもない」「× 押したらシミュレーターが消え失せる」= 既定の指輪で始めず、画面からも出さない)。ベースを選ぶと下ろす
 */
const needBase = ref(false);
/** 完成形の設定を窓でなくページで出している (初手のベース選び。ツリーは隠す、TreeGoalPage が立てる) */
const goalInline = ref(false);
/** 100 人回し終えて結果のまとめを開ける (SimTreePage が回す状態から立てる。流れの帯 TreeFlowSteps の 4) */
const runReady = ref(false);
/** 結果のまとめ (TreeRunReport) を開いている (帯の「結果のまとめ」・流れの帯の 4 で開く) */
const reportOpen = ref(false);
/** スタートの箱の重ね窓 (TreeStartPage.vue。始まりに付いている MOD・✦・乱数の数) */
const startPage = ref(false);
/** 完成の狙い (0 の箱で決める。前の「欲しい MOD のメモ」memoAims を使い回す。後の箱の当たりはこの一覧から選ぶ、オーナー 10-22) */
const goals = computed((): Aim[] => doc.value.memoAims ?? []);
const hasGoal = (modId: string, tier: number): boolean => goals.value.some((a) => a.modId === modId && a.tier === tier);
/** 狙いにする / 外す (同じ MOD は段だけ替える。1 つ戻すで戻せる) */
function toggleGoal(modId: string, tier: number): void {
  edit((d) => {
    const list = d.memoAims ?? [], same = list.find((a) => a.modId === modId);
    const next = same?.tier === tier ? list.filter((a) => a.modId !== modId) : same ? list.map((a) => (a.modId === modId ? { ...a, tier } : a)) : [...list, { modId, tier }];
    if (next.length) d.memoAims = next; else delete d.memoAims;
    migrateStart(d);
  });
}
/**
 * フラクチャーの印を付ける / 外す (10-23 オーナー: 「狙いにする」の横のボタン・完成形のカードの右クリック。複数可 = どれかが固定されればよい)。
 * 狙いに無い MOD は、その段で狙いに足して印を付ける (フラクチャーのボタンは「狙い」の右に初めから並ぶ、10-24 オーナー。前は狙いにした後だけ出していた)。
 * 印の MOD はスタートの＋の MOD から外す (✦ の候補と同じ MOD は足さない)。1 つ戻すで戻せる
 */
function toggleFracture(modId: string, tier: number): void {
  edit((d) => {
    const list = d.memoAims ?? [], g = list.find((a) => a.modId === modId);
    if (!g) list.push({ modId, tier, fractured: true });
    else if (g.fractured && g.tier === tier) delete g.fractured;
    else { g.tier = tier; g.fractured = true; }
    d.memoAims = list;
    migrateStart(d);
    d.start!.mods = d.start!.mods.filter((m) => !list.some((a) => a.fractured && a.modId === m.modId));
    d.start!.rarity = startRarity(d);
  });
}
/**
 * 完成形のアイテム (木のベースに狙いを付けられる所まで付けた物、エンジンの入口 placeMods)。狙いは MOD の枠を超えてよい (10-23 オーナー、止めない): 乗らない物は left。
 * 印の MOD を先に付ける。印が 1 つならその MOD を ✦ で (2 つ以上はカードの fractureGroup で 1 行にまとめる)。ノーマル・マジックの完成形は前と同じ startItemOf
 */
const goalItem = computed((): { item: StageItem; note: string | null; left: Array<Aim & { reason: string }> } | null => {
  const data = s.data.value, d = doc.value;
  if (!data) return null;
  const plain = goals.value.map((a) => ({ modId: a.modId, tier: a.tier }));
  if (goalRarity.value !== "rare") return { ...startItemOf(data, { ...d, memoAims: plain, start: { rarity: goalRarity.value, mods: goalRarity.value === "normal" ? [] : plain } }, mulberry32(1)), left: [] };
  const marks = goals.value.filter((a) => a.fractured), one = marks.length === 1;
  const order = [...marks, ...goals.value.filter((a) => !a.fractured)].map((a) => ({ modId: a.modId, tier: a.tier, ...(one && a.fractured ? { fractured: true } : {}) }));
  const r = placeMods(data, d.base, d.itemLevel, order, mulberry32(1));
  return { item: r.item, note: null, left: r.left.map((x) => ({ modId: x.modId, tier: x.tier, ...(marks.some((a) => a.modId === x.modId) ? { fractured: true as const } : {}), reason: x.reason })) };
});
/** 完成形のレアリティ (0 の箱、TreeDoc.goal。無ければレア。1 つ戻すで戻せる) */
const goalRarity = computed((): TreeRarity => doc.value.goal?.rarity ?? "rare");
function setRarity(r: TreeRarity): void { edit((d) => { if (r === "rare") delete d.goal; else d.goal = { rarity: r }; migrateStart(d); }); }
/** 始め方のベースの値段 (神、start.price。無ければ前の版の始め方の比べの一番安い物、どちらも無ければ 0)。100 人回す時の 1 本ごとの値段 */
const startPrice = (): number => startOf(doc.value).price ?? baseCost.value?.best?.cost ?? 0;
function setStartPrice(v: number | null): void { edit((d) => { migrateStart(d); if (v == null || !Number.isFinite(v) || v < 0) delete d.start!.price; else d.start!.price = v; }); }
/** blank = 始まりの箱に手が無い (白紙) */
const isBlank = (d: TreeDoc): boolean => !d.boxes.start?.hand && !d.boxes.start?.split && Object.keys(d.boxes).length === 1;
/** 白紙の木を開いた時にベースを選ばせるか (読んだら下ろす) */
function takeAskBase(): boolean { const d = doc.value; const v = askBase.value && isBlank(d) && !d.baseChosen && !d.memoAims?.length; askBase.value = true; return v; }
/** 今のベースで決めた印を付ける (同じベースを押した・2 の段へ進んだ時。1 つ戻すで戻せる) */
function chooseBase(): void { needBase.value = false; edit((d) => { d.baseChosen = true; }); }
/** クラフト台のベースとアイテムレベルで白紙の木を開く (前の木は 1 つ戻すで戻せる)。ページを開くのは呼ぶ側 */
function startTreeWith(base: string, itemLevel: number): void {
  needBase.value = false;
  opened.value++;
  edit((d) => { for (const k of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[k]; Object.assign(d, newTree(base, itemLevel), { baseChosen: true }); });
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
  ilvlNote.value = { from: d.itemLevel, to: lv };
  doc.value = { ...d, itemLevel: lv };
  save(doc.value);
});
/** 適正で狙いに合わせてアイテムレベルを変えた知らせ (完成形の設定の窓に小さく 1 行、× で閉じる。10-24 オーナー「合わせましたと小さく一言」) */
const ilvlNote = ref<{ from: number; to: number } | null>(null);
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
  return `${tierRankLabel(a.tier)} ${side} ${r?.template ?? NOT_ON_BASE()}`;
}
/** 木のベースの MOD 一覧に無い MOD (前のベースの狙いが残った等) の文。MOD の id はそのまま出さない (10-24 デザイン部長の気づき) */
const NOT_ON_BASE = (): string => tr("(このベースに無い MOD)", "(mod not on this base)");
/** 狙いの MOD の短い名前 (戻り先の札で、どの狙いの所の箱かを添える) */
const aimShort = (a: Aim): string => rowOfMod(a.modId)?.template ?? NOT_ON_BASE();
/** 始まりの MOD の文 (その段の数値で埋めた文 + 段)。atLeast = 完成の狙い (✦ の印など) で段を「T2 以上」と言う (10-24 オーナー「T2 を選んだら T2 以上」) */
function startModLabel(a: Aim | StartMod | null, atLeast = false): string {
  if (!a) return "";
  const r = rowOfMod(a.modId);
  // まとめ行 (同じ系統の別の MOD) は段ごとに modId がある。その MOD の段だけで数える
  const t = r?.tiers.filter((x) => (x.modId ?? r.id) === a.modId)[a.tier - 1];
  return `${atLeast ? tierRankLabel(a.tier) : `T${a.tier}`} ${t?.text ?? r?.text ?? NOT_ON_BASE()}`;
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
  return { tabDocs, active, switchTab, addTab, closeTab, ilvlNote, startPrice, setStartPrice, goalPage, needBase, goalInline, startPage, runReady, reportOpen, goals, hasGoal, toggleGoal, toggleFracture, goalItem, goalRarity, setRarity, fitIlvl, setFit, doc, edit, chooseBase, undo, canUndo, redo, canRedo, startFresh, reset, setBase, lostOnBase, open, opened, setTreeNote, rows, aimLabel, aimShort, startModLabel, baseCost, baseCostBusy, treePrice, takeAskBase, startTreeWith };
}
