/**
 * use-tree-check.ts — ツリーのルート精査の状態 (SimTreePage から分けた、2026-10-22)。精査そのものは services/simulator/tree/tree-check.ts
 */
import { computed, ref, watch, type Ref } from "vue";
import { checkTreeAsync, type CheckIssue, type CheckProgress } from "../../../services/simulator/tree/tree-check";
import { fractureMarks, startOf, type TreeBox, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { craftStage as s } from "../../../state/craft-stage";

/**
 * 道の形 (箱の位置・メモ・ベースの値段は入れない)。位置を動かしただけでは精査し直さない・回した結果を消さない
 * (値段は結果のまとめの欄で入れる。1 文字ごとにまとめが閉じていた、10-22 14 本目)
 */
export const routeKeyOf = (d: TreeDoc): string => JSON.stringify([(({ price: _p, ...st }) => st)(startOf(d)), fractureMarks(d), Object.values(d.boxes).map(({ x: _x, y: _y, note: _n, ...r }) => r)]);

/**
 * テストラン = ルート精査 (5 人をエンジンで辿り 30 人を回して、止まる所・打てない手・付かない当たり・完成に着かない道などの穴を探す、tree-check.ts)。
 * 道を組み替えるたびに合格を外して自動で回し直す (10-24 オーナー「何かしら変更加えたら即テストラン」)。穴が 0 なら合格で、合格するまで「100 人回す」は押せない。
 * ! は今の道の穴だけ (直せば次のテストランで消える)。一覧を閉じる・箱を押す・動かすでは消さない
 * 穴 (帯の「穴 n」・一覧・箱の !) は「テストで回す」を押した時だけ見せ、木を組み替えたら隠す。自動のテストランは合格を決めるだけ
 * (10-25 オーナー「精査ボタン押したときがいいかも、ずっと出てるし不快だわ、分かっとるわって話で」)
 */
export function useTreeCheck(doc: Ref<TreeDoc>, on: () => boolean) {
  const issues = ref<CheckIssue[] | null>(null);
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
  /** 穴を見せる (押した時に立て、組み替えたら下ろす) */
  const shown = ref(false);
  watch(routeKey, () => { shown.value = false; issuesOpen.value = false; });
  let timer = 0, again = false;
  // 組み替えたら少し待って (続けて組む間は回さない) テストラン。開いた時も 1 回
  watch([routeKey, () => !!s.data.value && on()], ([, ok]) => { clearTimeout(timer); if (ok) timer = window.setTimeout(() => void runCheck(), 500); }, { immediate: true });
  async function runCheck(): Promise<void> {
    const d = s.data.value;
    if (!d) return;
    if (checking.value) { again = true; return; }
    checking.value = true;
    const key = routeKey.value;
    issues.value = []; // 穴は辿った人から順に足す (10-22 オーナー「読み込みながら徐々に出す」)
    await new Promise((r) => setTimeout(r, 30)); // 「テスト中」を先に出す
    try {
      const now = await checkTreeAsync(d, doc.value, (p) => { progress.value = p; issues.value = p.partial; });
      issues.value = now;
      if (!now.length && key === routeKey.value) passedKey.value = key;
    } finally {
      checking.value = false; progress.value = null;
      // 回している間に組み替えた = 今の形でもう 1 回
      if (again || key !== routeKey.value) { again = false; void runCheck(); }
    }
  }
  async function onCheck(): Promise<void> { shown.value = true; issuesOpen.value = true; issuesFold.value = false; await runCheck(); }
  const issueOf = (b: TreeBox): string | null => (!shown.value ? null : issues.value?.filter((x) => x.boxId === b.id).map((x) => x.text).join(" / ") || null);
  return { issues, issuesOpen, shown, issuesFold, checking, progress, passed, runCheck, onCheck, issueOf };
}
