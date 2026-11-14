/**
 * use-tree-check.ts — ツリーのルート精査の状態 (SimTreePage から分けた、2026-10-22)。精査そのものは services/simulator/tree/tree-check.ts
 */
import { computed, ref, triggerRef, watch, type Ref } from "vue";
import { pruneBacks } from "../../../services/simulator/tree/tree-shape";
import { markStill } from "../../../services/simulator/tree/tree-sample";
import { blocksRun, checkTreeAsync, unsetIssues, type CheckIssue, type CheckPrice, type CheckProgress } from "../../../services/simulator/tree/tree-check";
import type { TreeRunResult } from "../../../services/simulator/tree/tree-run";
import { fractureMarks, startOf, type TreeBox, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { craftStage as s } from "../../../state/craft-stage";
import { track } from "../../../utils/track";
import { pathKeysOf } from "../../../services/simulator/tree/tree-recipe-v1";
import { tr } from "../../../i18n/lang";

/** 精査で回した 30 人 (key = その時の道の形) */
export type CheckRun = { key: string; startCost: number; run: TreeRunResult };

/** 木の側の不具合の文 (要確認の全部) */
export const orphanText = (): string => tr("サイトの不具合です。お手数ですが『要望・バグを送る』から送ってください", "This is a site bug. Please report it with \"Send feedback\"");

/**
 * 要確認の一覧 (S-107・⑦20 案 A): 組み直した木に札の無い決め・前の版の人の ↩・分かれ目・読めなかった所。
 * 印は札の残っている一番近い上の箱に付ける (人が一覧で見て、その箱で決め直す)。合格を止める
 */
export function orphanIssues(d: TreeDoc): CheckIssue[] {
  if (!d.orphans?.length) return [];
  const idOf = new Map([...pathKeysOf(d)].map(([id, k]) => [k, id]));
  // 札の箱が今の木にある「gone」は手を足し直した古い一覧 (S-107)
  // 人が組んだのに木の途中で出る物 = サイトの不具合。要望へ促す (11-08 オーナー「ツリー途中に未設定が出るのは本体バグとして要望へって促してくれ」)。
  // 中身の訳は送る時の木の URL から読む (一覧の行の「要望・バグを送る」が URL を写して要望の窓を開く、kind orphan)。
  // 札の残る上の箱がスタートしか無い時は、スタート自身の決めでなければ箱に付けず一覧と帯の数だけ (S-89c ③。保存を開き直すとスタートに落ちた)
  return d.orphans.filter((o) => o.why !== "gone" || !idOf.has(o.at)).map((o) => ({ boxId: orphanBoxOf(idOf, o.at), kind: "orphan" as const, text: orphanText() }));
}

/** 木の途中の未設定 = 要確認の印の箱が手を持つ (下に箱が続く) 物。末端の未設定 (人がこれから組む所) は入れない (S-107d、誘いの札の数) */
export const midUnsetOf = (d: TreeDoc, list: readonly CheckIssue[] | null): CheckIssue[] => (list ?? []).filter((x) => x.kind === "orphan" && !!d.boxes[x.boxId]?.hand);

/** 要確認の札の箱 (orphanIssues と同じ: 札の残っている一番近い上の箱。無ければ "") */
function orphanBoxOf(idOf: ReadonlyMap<string, string>, at: string): string {
  let k = at;
  while (k.includes("/") && !idOf.has(k)) k = k.slice(0, k.lastIndexOf("/"));
  return k === "s" && at !== "s" ? "" : idOf.get(k) ?? "";
}
/**
 * 人が要確認の印の箱の決め (手・↩・完成 / 失敗) を置き直したら、その箱の要確認を木から外す (11-08 ブラック 61「オーナーが手を置き直したり矢印を付け直したら、印が消えるように」。
 * 前は一度付くと外す所が無く、保存のたびに要確認へ書き写されて残った)。edit (use-tree) が人の組み替えのたびに呼ぶ。開いただけ・ほかの箱の決めでは外さない
 */
export function dropTouchedOrphans(before: TreeDoc, d: TreeDoc): void {
  if (!d.orphans?.length) return;
  const idOf = new Map([...pathKeysOf(d)].map(([id, k]) => [k, id]));
  const decision = (x: TreeDoc, id: string): string => { const b = x.boxes[id]; return JSON.stringify(b ? [b.hand ?? null, b.autoBack ? null : b.back ?? null, b.done ?? null] : null); };
  const touched = new Set<string>();
  const left = d.orphans.filter((o) => { const id = orphanBoxOf(idOf, o.at); if (!id || decision(before, id) === decision(d, id)) return true; touched.add(id); return false; });
  if (!touched.size) return;
  if (left.length) d.orphans = left; else delete d.orphans;
  // 箱の読めなかった印 (tree-migrate の healBox) も外す (残すと保存の時にまた要確認へ書き写される、tree-recipe-v1)
  for (const id of touched) { const b = d.boxes[id]; if (b) { delete b.check; delete b.checkRaw; } }
}

/**
 * 道の形 (箱の位置・メモ・ベースの値段は入れない)。位置を動かしただけでは精査し直さない・回した結果を消さない
 * (値段は結果のまとめの欄で入れる。1 文字ごとにまとめが閉じていた、10-22 14 本目)
 */
export const routeKeyOf = (d: TreeDoc): string => JSON.stringify([(({ price: _p, ...st }) => st)(startOf(d)), fractureMarks(d), Object.values(d.boxes).map(({ x: _x, y: _y, note: _n, ...r }) => r)]);

/**
 * 穴チェック (前の名前はテストラン) = ルート精査 (5 人をエンジンで辿り 30 人を回して、止まる所・打てない手・付かない当たり・完成に着かない道などの穴を探す、tree-check.ts)。
 * 道を組み替えるたびに合格を外して自動で回し直す (10-24 オーナー「何かしら変更加えたら即テストラン」)。穴が 0 なら合格で、合格するまで「100 人回す」は灰色で押せない (S-70。穴チェック自体は足りない所があっても回す)。
 * ! は今の道の穴だけ (直せば次の穴チェックで消える)。一覧を閉じる・箱を押す・動かすでは消さない
 * (S-70、オーナー 11-01「1ボタンでチェック方式それいがい起動しないみたいな」): 自動では回さず、押した時だけ回す。木が変わると合格も結果も消える。
 * 押した時の形のままの間は結果を見せ、それ以外の未設定の数えと赤枠は形だけの unsetIssues (見本も人も使わない)
 * 穴 (帯の赤い「穴 n」・一覧・箱の !) は既定で見せ、札を押すと隠す・もう一度で見せる。隠したら組み替えても隠したまま (そのタブの間、タブを替えると見せる)
 * (10-25 オーナー「穴はそもそもずっと赤くて OK よ、デフォで。押したらオフにって UI で変わったら OK」)
 */
export function useTreeCheck(doc: Ref<TreeDoc>, on: () => boolean, priced?: () => CheckPrice) {
  /** 今の精査で回した 30 人 (穴チェックの走行が使い回す、S-71b) */
  let lastRun: CheckRun | null = null;
  watch(doc, markStill, { flush: "sync", immediate: true }); // 置いた木の鍵は 1 回だけ (S-71e ①)
  const issues = ref<CheckIssue[] | null>(null);
  /** 穴の一覧の窓 (人が開いた時だけ: 箱の ! か札の横の ▾。10-25 オーナー「デフォではここ出さないけど穴は UI で光る」) */
  const issuesOpen = ref(false);
  /** 一覧を畳んで見出しだけ (行を押して箱へ寄った時。帯が箱を隠した、10-22 白紙から組んだ試し) */
  const issuesFold = ref(false);
  const checking = ref(false);
  /** 精査の進み (くるくるの一言「精査中 12/30」、10-22 オーナー「ローディング画面を出さないとバグってるのか分からない」) */
  const progress = ref<CheckProgress | null>(null);
  const routeKey = computed(() => routeKeyOf(doc.value));
  /** 合格した道の形 (今の形と同じ間だけ合格) */
  const passedKey = ref<string | null>(null);
  const passed = computed(() => passedKey.value === routeKey.value);
  /** 穴を見せる (帯の札のスイッチ、既定はオン) */
  const shown = ref(true);
  /** 穴チェックを押した時の道の形 (今の形と同じ間だけ issues は押した結果) */
  const checkedKey = ref<string | null>(null);
  // 回す前に、体の同じと分からない古い自動の ↩ を外す (外すと木が変わって、この watch がもう一度走る。S-50)
  watch([routeKey, () => !!s.data.value && on()], ([, ok]) => { if (ok && s.data.value && pruneBacks(s.data.value, doc.value)) { triggerRef(doc); return; } }, { immediate: true });
  async function runCheck(): Promise<void> {
    const d = s.data.value;
    if (!d) return;
    if (checking.value) return;
    checking.value = true;
    const key = routeKey.value;
    checkedKey.value = key;
    issues.value = []; // 穴は辿った人から順に足す (10-22 オーナー「読み込みながら徐々に出す」)
    await new Promise((r) => setTimeout(r, 30)); // 「穴チェック中」を先に出す
    try {
      lastRun = null;
      const price = priced?.();
      const now = [...(await checkTreeAsync(d, doc.value, (p) => { progress.value = p; issues.value = p.partial; }, price, (run) => { if (price) lastRun = { key, startCost: price.startCost, run }; })), ...orphanIssues(doc.value)];
      issues.value = now;
      // 合格 (100 人回せる) を止めるのは未設定だけ (S-205 ③)。ほかの足りない所は一覧に残す知らせ
      if (!now.some((x) => blocksRun(x.kind)) && key === routeKey.value) passedKey.value = key;
    } finally {
      checking.value = false; progress.value = null;
    }
  }
  /** 穴チェックのボタン (記録の印は 1 押し 1 回、10-25 オーナー「回すボタンに記録足して」) */
  async function onCheck(): Promise<void> { if (!checking.value) track("sim:test"); await runCheck(); }
  /** 今の穴: 押した時の形のままなら押した結果、それ以外は形だけの未設定 */
  const nowIssues = computed(() => (checkedKey.value !== routeKey.value ? [...unsetIssues(doc.value), ...orphanIssues(doc.value)] : issues.value));
  // 始めたばかり (スタートしか無い) の木もスタートに印を出す (S-89b・S-89c。前の 10-26 の「見せない」= S-132 は 10-28 深夜に撤回)
  const shownIssues = computed(() => nowIssues.value);
  const issueOf = (b: TreeBox): string | null => (!shown.value ? null : nowIssues.value?.filter((x) => x.boxId === b.id).map((x) => x.text).join(" / ") || null);
  /** 今の木の途中の未設定 (S-107d。文・色・札はデザイン部長) */
  const midUnset = computed(() => midUnsetOf(doc.value, nowIssues.value));
  return { issues: shownIssues, issuesOpen, shown, issuesFold, checking, progress, passed, runCheck, onCheck, issueOf, midUnset, checkRun: (): CheckRun | null => lastRun };
}
