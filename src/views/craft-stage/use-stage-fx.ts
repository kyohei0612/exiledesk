/**
 * use-stage-fx.ts — クラフトステージの「打った瞬間」の演出 (2026-09-27、ADR-001)
 *
 * オーナー:「カレンシークリックして付け終わった時の挙動なんかいいもんないかな」。動画で 1 手ごとの手応えが見えるように:
 *   - 押した所に波紋と、持っていたアイコンが吸い込まれる
 *   - アイテム枠が色付きで光って弾む (マジック = 青 / レア = 金 / 冒涜 = 赤 / 破砕 = 金茶 / 神 = 白)
 *   - レアリティが上がった時は大きく光って「マジックに!」「レアに!」、T1 が付いた時は金の「T1!」
 *   - 打てなかった時は枠が赤く震えて理由を出す
 * 手が増えた時と、打てなかった時 (craftStage.miss。工程には積まない) だけ動く (1 手戻す・再生では動かない)。色と文字は style.css の stage-* と --fx。
 */
import { ref, watch, type Ref } from "vue";
import { craftStage, iconOf } from "../../state/craft-stage";
import type { StageItem } from "../../services/craft-stage/types";

export interface StageFx {
  n: number;
  kind: "hit" | "up" | "shake";
  color: string;
  text: string;
  x: number;
  y: number;
  icon: string;
}

const RARITY_TEXT = { magic: "マジックに!", rare: "レアに!", normal: "" } as const;
const COLOR = { magic: "#8888ff", rare: "#e8d77a", normal: "#c8c8c8", desecrated: "#f07070", fractured: "#c8a86a", divine: "#ffffff", miss: "#f43f5e", top: "#fbbf24", corrupt: "#ff2a2a" };
/** コラプトの結果の文字 */
function vaalText(before: StageItem, after: StageItem, changed: number): string {
  if (after.enchant !== before.enchant) return "コラプト — エンチャント!";
  if ((after.sockets ?? 0) > (before.sockets ?? 0)) return "コラプト — ソケット +1!";
  if (changed) return "コラプト — 振り直し!";
  return "コラプト — 変化なし";
}

export function useStageFx(mouse: Ref<{ x: number; y: number }>) {
  const fx = ref<StageFx | null>(null);
  let n = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  watch(() => craftStage.log.value.length, (len, old) => {
    if (len <= old || craftStage.replay.value) return;
    const st = craftStage.last.value;
    if (!st) return;
    const o = st.out;
    const top = st.added.find((m) => m.tierName === "T1" && !m.unrevealed);
    let next: Omit<StageFx, "n" | "x" | "y" | "icon">;
    if (!o.applied) next = { kind: "shake", color: COLOR.miss, text: o.reason ?? "使えない" };
    else if (st.after.corrupted && !st.before.corrupted && o.currency !== "vaal") next = { kind: "up", color: COLOR.desecrated, text: "腐食!" };
    else if (st.after.corrupted && !st.before.corrupted) next = { kind: "up", color: COLOR.corrupt, text: vaalText(st.before, st.after, st.added.length + st.removed.length) };
    else if (st.after.sanctified) next = { kind: "up", color: COLOR.top, text: "聖別!" };
    else if (o.changed.rarity_from !== o.changed.rarity_to) next = { kind: "up", color: COLOR[o.changed.rarity_to], text: RARITY_TEXT[o.changed.rarity_to] };
    else if (top) next = { kind: "up", color: COLOR.top, text: "T1!" };
    else if (st.added.some((m) => m.fractured)) next = { kind: "hit", color: COLOR.fractured, text: "破砕!" };
    else if (st.added.some((m) => m.desecrated)) next = { kind: "hit", color: COLOR.desecrated, text: st.added.some((m) => m.unrevealed) ? "冒涜!" : "開示!" };
    else if (o.currency === "divine") next = { kind: "hit", color: COLOR.divine, text: "" };
    else next = { kind: "hit", color: COLOR[st.after.rarity], text: "" };
    show(next, iconOf(o.currency));
  });
  watch(() => craftStage.miss.value?.n, () => {
    const m = craftStage.miss.value;
    if (m) show({ kind: "shake", color: COLOR.miss, text: m.reason }, "");
  });
  function show(next: Omit<StageFx, "n" | "x" | "y" | "icon">, icon: string): void {
    // 同じ演出を続けて出す時もアニメーションをやり直すため、いったん消してから次の描画で出す
    fx.value = null;
    requestAnimationFrame(() => {
      fx.value = { ...next, n: ++n, x: mouse.value.x, y: mouse.value.y, icon };
      clearTimeout(timer);
      timer = setTimeout(() => (fx.value = null), 1400);
    });
  }
  return fx;
}
