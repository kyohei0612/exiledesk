/**
 * use-tree-check.ts — ツリーのルート精査の状態 (SimTreePage から分けた、2026-10-22)。精査そのものは services/simulator/tree/tree-check.ts
 */
import { computed, ref, triggerRef, watch, type Ref } from "vue";
import { pruneBacks } from "../../../services/simulator/tree/tree-shape";
import { checkTreeAsync, NOTICE_KINDS, type CheckIssue, type CheckProgress } from "../../../services/simulator/tree/tree-check";
import { fractureMarks, startOf, type TreeBox, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { craftStage as s } from "../../../state/craft-stage";
import { track } from "../../../utils/track";
import { pathKeysOf, type RecipePick } from "../../../services/simulator/tree/tree-recipe-v1";
import { handName } from "./tree-names";
import { tr } from "../../../i18n/lang";

/**
 * 要確認の一覧 (S-107・⑦20 案 A、スイッチ recipeV1): 組み直した木に札の無い決め・前の版の人の ↩・分かれ目・読めなかった所。
 * 印は札の残っている一番近い上の箱に付ける (人が一覧で見て、その箱で決め直す)。合格を止める
 */
export function orphanIssues(d: TreeDoc): CheckIssue[] {
  if (!d.orphans?.length) return [];
  const idOf = new Map([...pathKeysOf(d)].map(([id, k]) => [k, id]));
  return d.orphans.map((o) => {
    let k = o.at;
    while (k.includes("/") && !idOf.has(k)) k = k.slice(0, k.lastIndexOf("/"));
    const step = o.at.split("/").length - 1, h = (o.raw as RecipePick | null)?.hand;
    const text = o.why === "gone" ? tr(`要確認: ${step} 段目の決め${h ? ` (${handName(h.currency)})` : ""}の箱が今の木に無い (決まりが変わって結果の箱が替わった。この箱で決め直す)`, `Check: the decision at step ${step}${h ? ` (${handName(h.currency)})` : ""} has no box in the rebuilt tree (the rules changed the results; decide again here)`)
      : o.why === "back" ? tr(`要確認: ${step} 段目に前の版で人が選んだ戻り先がある (今は自動の ↩ だけ。行き先を決め直す)`, `Check: step ${step} had a hand-picked return from an older version (returns are automatic now; decide again)`)
      : o.why === "split" ? tr(`要確認: ${step} 段目に前の版の分かれ目がある (今は作れない。手を決め直す)`, `Check: step ${step} had a split from an older version (no longer available; pick a craft again)`)
      : tr("要確認: 読めなかった所がある (元の値は保存に残っている)", "Check: part of the saved recipe could not be read (the raw value is kept)");
    return { boxId: idOf.get(k) ?? "start", kind: "orphan" as const, text };
  });
}

/**
 * 道の形 (箱の位置・メモ・ベースの値段は入れない)。位置を動かしただけでは精査し直さない・回した結果を消さない
 * (値段は結果のまとめの欄で入れる。1 文字ごとにまとめが閉じていた、10-22 14 本目)
 */
export const routeKeyOf = (d: TreeDoc): string => JSON.stringify([(({ price: _p, ...st }) => st)(startOf(d)), fractureMarks(d), Object.values(d.boxes).map(({ x: _x, y: _y, note: _n, ...r }) => r)]);

/**
 * テストラン = ルート精査 (5 人をエンジンで辿り 30 人を回して、止まる所・打てない手・付かない当たり・完成に着かない道などの穴を探す、tree-check.ts)。
 * 道を組み替えるたびに合格を外して自動で回し直す (10-24 オーナー「何かしら変更加えたら即テストラン」)。穴が 0 なら合格で、合格するまで「100 人回す」は押せない。
 * ! は今の道の穴だけ (直せば次のテストランで消える)。一覧を閉じる・箱を押す・動かすでは消さない
 * 穴 (帯の赤い「穴 n」・一覧・箱の !) は既定で見せ、札を押すと隠す・もう一度で見せる。隠したら組み替えても隠したまま (そのタブの間、タブを替えると見せる)
 * (10-25 オーナー「穴はそもそもずっと赤くて OK よ、デフォで。押したらオフにって UI で変わったら OK」)
 */
export function useTreeCheck(doc: Ref<TreeDoc>, on: () => boolean) {
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
  let timer = 0, again = false;
  // 組み替えたら少し待って (続けて組む間は回さない) テストラン。開いた時も 1 回
  // スイッチ bodyStrict: 回す前に、体の同じと分からない古い自動の ↩ を外す (外すと木が変わって、この watch がもう一度走る。S-50)
  watch([routeKey, () => !!s.data.value && on()], ([, ok]) => { clearTimeout(timer); if (ok && s.data.value && pruneBacks(s.data.value, doc.value)) { triggerRef(doc); return; } if (ok) timer = window.setTimeout(() => void runCheck(), 500); }, { immediate: true });
  async function runCheck(): Promise<void> {
    const d = s.data.value;
    if (!d) return;
    if (checking.value) { again = true; return; }
    checking.value = true;
    const key = routeKey.value;
    issues.value = []; // 穴は辿った人から順に足す (10-22 オーナー「読み込みながら徐々に出す」)
    await new Promise((r) => setTimeout(r, 30)); // 「テスト中」を先に出す
    try {
      const now = [...(await checkTreeAsync(d, doc.value, (p) => { progress.value = p; issues.value = p.partial; })), ...orphanIssues(doc.value)];
      issues.value = now;
      // 合格を止めない知らせ (NOTICE_KINDS) は数えない (S-73)
      if (!now.filter((x) => !NOTICE_KINDS.includes(x.kind)).length && key === routeKey.value) passedKey.value = key;
    } finally {
      checking.value = false; progress.value = null;
      // 回している間に組み替えた = 今の形でもう 1 回
      if (again || key !== routeKey.value) { again = false; void runCheck(); }
    }
  }
  /** テストランのボタン (記録の印は 1 押し 1 回、10-25 オーナー「回すボタンに記録足して」) */
  async function onCheck(): Promise<void> { if (!checking.value) track("sim:test"); await runCheck(); }
  /**
   * 始めたばかり (スタートにまだ手も分かれ目も無い) の木では足りない所を見せない (赤い「!」と数で壊れた・間違えたに見えた、10-26 猿の 3。
   * まずスタートの ＋ で手を足すだけ)。合格ではないので「100 人回す」は今のまま押せない
   */
  const fresh = computed(() => !doc.value.boxes.start?.hand && !doc.value.boxes.start?.split);
  const shownIssues = computed(() => (fresh.value ? [] : issues.value));
  const issueOf = (b: TreeBox): string | null => (!shown.value || fresh.value ? null : issues.value?.filter((x) => x.boxId === b.id).map((x) => x.text).join(" / ") || null);
  return { issues: shownIssues, issuesOpen, shown, issuesFold, checking, progress, passed, runCheck, onCheck, issueOf };
}
