/**
 * omen-memory.ts — エミュのお告げを「持った物ごと」に覚える (2026-10-26 夜オーナー「そのオーブが選ばれた時だけ、その設定をオンにしてくれないか」
 * 「他のお告げとかぶった時に打てないとかがざらにある」。スイッチ omenPerHeld)。
 * 持ち替えた瞬間に、前に持っていた物に掛けていたお告げをその物の分として控え、新しく持った物の控えを戻す。
 * なので掛かっているお告げ (題の横の札) はいつも今持っている物の分だけ。離した時 (持たない) はそのまま (骨の後の発現の反響が効くように)。
 * 例: 強化のパーフェクトエッセンスで左側の結晶化 → ヒステリーのエッセンスへ持ち替えると、前は結晶化が残って「足す側が埋まっている」で打てなかった。
 * 掛けられるかはエンジンの omensAllowedFor (その手に付けられるお告げ)。チュートリアルのコース・再生の間は今まで通り (お告げを台本が決める)
 */
import { watch } from "vue";
import { omensAllowedFor } from "../../services/craft-stage/engine";
import { craftStage as s, setUndoOmensTo } from "../craft-stage";
import { flag } from "../../web/release-flags";

/** カレンシーのキー → そのカレンシーに掛けていたお告げ */
const memo = new Map<string, string[]>();

/** CraftStage.vue の setup で 1 回呼ぶ。lesson = チュートリアルのコースの間か */
export function useOmenMemory(lesson: () => boolean): void {
  if (!flag("omenPerHeld")) return;
  // 持ち替えと同じ流れでお告げを入れる所 (狙うの行) が後から入れられるよう、持ち替えのその場で入れ替える (sync)
  // 最後に持っていた物 (離した後に別の物を持った時も、前の物の分を控える)
  let last: string | null = null;
  watch(s.held, (next) => {
    if (!next || next === last || s.mode.value !== "hand" || s.replay.value || lesson()) return;
    if (last) {
      const mine = new Set(omensAllowedFor(last));
      memo.set(last, s.omens.value.filter((o) => mine.has(o)));
    }
    last = next;
    s.omens.value = [...(memo.get(next) ?? [])];
  }, { flush: "sync" });
  // 1 手戻した手が別のカレンシーの手なら、食ったお告げは今の物ではなくその手のカレンシーの控えへ戻す (M-14、スイッチ undoKeepHeld)
  if (flag("undoKeepHeld")) setUndoOmensTo((cur, ate) => {
    if (cur === last || s.mode.value !== "hand" || s.replay.value || lesson()) return false;
    memo.set(cur, [...new Set([...(memo.get(cur) ?? []), ...ate])]);
    return true;
  });
  // ベースを変えた・白に戻した時は控えを捨てる (前のアイテムのお告げを持ち越さない)
  watch([s.base, () => s.log.value.length === 0 && s.startMods.value.length === 0], ([, fresh], [prevBase]) => { if (fresh || s.base.value !== prevBase) { memo.clear(); last = null; } });
}
