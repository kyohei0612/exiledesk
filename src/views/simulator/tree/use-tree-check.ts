/**
 * use-tree-check.ts — ツリーのルート精査の状態 (SimTreePage から分けた、2026-10-22)。精査そのものは services/simulator/tree/tree-check.ts
 */
import { computed, ref, watch, type Ref } from "vue";
import { checkTree, type CheckIssue } from "../../../services/simulator/tree/tree-check";
import type { TreeBox, TreeDoc } from "../../../services/simulator/tree/tree-model";
import { craftStage as s } from "../../../state/craft-stage";

export function useTreeCheck(doc: Ref<TreeDoc>) {
  // ルート精査 (押した時に始める)。! は穴が解消した時だけ消える: 道を組み替えたら精査し直して、残った穴の ! は残す。
  // 一覧を閉じる・箱を押す・動かすでは消さない (オーナー 10-22「！マークは解消したら消していく感じで」)
  const issues = ref<CheckIssue[] | null>(null);
  const issuesOpen = ref(false);
  const checking = ref(false);
  /** 道の形 (箱の位置・メモは入れない)。位置を動かしただけでは精査し直さない */
  const routeKey = computed(() => JSON.stringify([doc.value.fracture, Object.values(doc.value.boxes).map(({ x: _x, y: _y, note: _n, ...r }) => r)]));
  let recheck = 0;
  /** 精査を押した時に見つけた穴 (箱と種類)。組み替えた後はこの中で今も残る物だけ出す (新しい穴は精査を押した時。1 つ戻すで穴が戻れば ! も戻る) */
  let found: CheckIssue[] = [];
  watch(routeKey, () => { if (!found.length) return; clearTimeout(recheck); recheck = window.setTimeout(() => void runCheck(true), 300); });
  async function runCheck(keep = false): Promise<void> {
    const d = s.data.value;
    if (!d || checking.value) return;
    checking.value = true;
    await new Promise((r) => setTimeout(r, 30)); // 「精査中」を先に出す
    try {
      const now = checkTree(d, doc.value);
      if (!keep) found = now;
      issues.value = keep ? now.filter((x) => found.some((y) => y.boxId === x.boxId && y.kind === x.kind)) : now;
    } finally { checking.value = false; }
  }
  async function onCheck(): Promise<void> { issuesOpen.value = true; await runCheck(); }
  const issueOf = (b: TreeBox): string | null => issues.value?.filter((x) => x.boxId === b.id).map((x) => x.text).join(" / ") || null;
  return { issues, issuesOpen, checking, runCheck, onCheck, issueOf };
}
