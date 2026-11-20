/**
 * phone-goal-steps.ts — スマホの端末でも白紙からベース選びで木を作る (S-94l2、スイッチ phoneGoalSteps、オーナー 11-20「おけ」)。
 * 1 ベース・2 完成の MOD はスマホの画面のまま縦で組み、3 ツリーから横持ちの PC の画面 (S-94l、phonePcView)。
 * 開いている間: SimTreePage の見るだけの分かれ道はツリーの段だけ・白紙はベース選びへ (S-94f の案内を出さない)、エミュの「シミュレーターへ →」も出す。
 * チュートリアルは PC だけのまま (ベース選びの「チュートリアル」を出さない)。PC のブラウザの狭い窓は今のまま (指の端末だけ)
 */
import { flag } from "../../../web/release-flags";
import { phoneDevice } from "../../../utils/phone-pc-view";

/** スマホの端末で、ベース選び・完成の MOD をスマホの画面で組める */
export const phoneGoalSteps = (): boolean => flag("phoneGoalSteps") && flag("phonePcView") && phoneDevice();
