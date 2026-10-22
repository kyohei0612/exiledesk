/**
 * use-tree-check.ts — ツリーのルート精査の状態 (SimTreePage から分けた、2026-10-22)。精査そのものは services/simulator/tree/tree-check.ts
 */
import { computed, ref, watch, type Ref } from "vue";
import { checkTreeAsync, type CheckIssue, type CheckProgress } from "../../../services/simulator/tree/tree-check";
import { startOf, type TreeBox, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { craftStage as s } from "../../../state/craft-stage";

/**
 * 道の形 (箱の位置・メモ・ベースの値段は入れない)。位置を動かしただけでは精査し直さない・回した結果を消さない
 * (値段は結果のまとめの欄で入れる。1 文字ごとにまとめが閉じていた、10-22 14 本目)
 */
export const routeKeyOf = (d: TreeDoc): string => JSON.stringify([(({ price: _p, ...st }) => st)(startOf(d)), d.startRandom ?? 0, Object.values(d.boxes).map(({ x: _x, y: _y, note: _n, ...r }) => r)]);

export function useTreeCheck(doc: Ref<TreeDoc>) {
  // ルート精査 (押した時に始める)。! は穴が解消した時だけ消える: 道を組み替えたら精査し直して、残った穴の ! は残す。
  // 一覧を閉じる・箱を押す・動かすでは消さない (オーナー 10-22「！マークは解消したら消していく感じで」)
  const issues = ref<CheckIssue[] | null>(null);
  const issuesOpen = ref(false);
  /** 一覧を畳んで見出しだけ (行を押して箱へ寄った時。帯が箱を隠した、10-22 白紙から組んだ試し) */
  const issuesFold = ref(false);
  const checking = ref(false);
  /** 精査の進み (くるくるの一言「精査中 12/30」、10-22 オーナー「ローディング画面を出さないとバグってるのか分からない」) */
  const progress = ref<CheckProgress | null>(null);
  const routeKey = computed(() => routeKeyOf(doc.value));
  let recheck = 0;
  /** 精査を押した時に見つけた穴 (箱と種類)。組み替えた後はこの中で今も残る物だけ出す (新しい穴は精査を押した時。1 つ戻すで穴が戻れば ! も戻る) */
  let found: CheckIssue[] = [];
  watch(routeKey, () => { if (!found.length) return; clearTimeout(recheck); recheck = window.setTimeout(() => void runCheck(true), 300); });
  async function runCheck(keep = false): Promise<void> {
    const d = s.data.value;
    if (!d || checking.value) return;
    checking.value = true;
    // 押して始めた精査は見つけた穴を辿った人から順に足す (10-22 オーナー「読み込みながら徐々に出す」)。
    // 組み替えた後の精査し直しは途中で ! が消えて戻るので、終わってから入れ替える
    if (!keep) issues.value = [];
    await new Promise((r) => setTimeout(r, 30)); // 「精査中」を先に出す
    try {
      const now = await checkTreeAsync(d, doc.value, (p) => { progress.value = p; if (!keep) issues.value = p.partial; });
      if (!keep) found = now;
      issues.value = keep ? now.filter((x) => found.some((y) => y.boxId === x.boxId && y.kind === x.kind)) : now;
    } finally { checking.value = false; progress.value = null; }
  }
  async function onCheck(): Promise<void> { issuesOpen.value = true; issuesFold.value = false; await runCheck(); }
  const issueOf = (b: TreeBox): string | null => issues.value?.filter((x) => x.boxId === b.id).map((x) => x.text).join(" / ") || null;
  return { issues, issuesOpen, issuesFold, checking, progress, runCheck, onCheck, issueOf };
}
