/**
 * held-omens.ts — 持っている物に掛けられるお告げ (HeldOmens.vue と、slot を出すか決める呼ぶ側で使う。2026-10-22 共通の部品に)。
 * 中身はエンジンの入口の omensAllowedFor (骨には後の発現で使うアビスの反響も並べる。2026-10-22 シミュの自前の式を入口へ、B9)
 */
export { omensAllowedFor as heldOmensOf } from "../../../services/craft-stage/engine";
