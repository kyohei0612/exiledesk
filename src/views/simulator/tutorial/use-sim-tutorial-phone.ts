/**
 * use-sim-tutorial-phone.ts — スマホの形 (1280 未満) のシミュのチュートリアルの場面 (tutorial.md T-26、作りかけ)
 */
import type { TutCtx, TutNow } from "./use-sim-tutorial";

export function phoneNow(c: TutCtx): TutNow {
  return { key: `${c.st.id}.p-main`, target: null, draft: ["", ""] };
}
