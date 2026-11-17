/**
 * tree-room.ts — (S-101b、スイッチ saveCap15) シミュの木のレシピの保存は 15 個まで。
 * 人が新しく保存しようとした時に 15 個あれば、保存を待たせてレシピの一覧の窓 (TreeRoomModal) を出し、1 つ消して 15 個未満になったら待たせた保存を続ける。
 * 上書きは数に入れない。15 個より多く持っている人の分は消さない (新しく保存する時だけ、15 個未満になるまで消してもらう)。
 * 黙って足す口 (共有の木を開いた時の追加・タブを閉じる時と白紙に戻す前の自動の保存) は roomFull() を見て、15 個ある時は保存しない (窓は出さない)
 */
import { ref, watch } from "vue";
import { treeRecipes } from "./tree-recipes";
import { flag } from "../../web/release-flags";

/** 保存できる数 */
export const RECIPE_CAP = 15;
/** 15 個あって新しく保存できない */
export const roomFull = (): boolean => flag("saveCap15") && treeRecipes.value.length >= RECIPE_CAP;
/** 1 つ消すのを待っている保存 (null = 窓を出していない) */
export const roomAsk = ref<(() => void) | null>(null);

/** 新しく保存する口: 空きがあればすぐ then、15 個なら一覧の窓を出して 1 つ消した後に then */
export function withRoom(then: () => void): void {
  if (!roomFull()) { then(); return; }
  roomAsk.value = then;
}
/**
 * 離れる時の「保存して進む」で保存が窓の待ちになった時、進むのも窓の後にする (S-101b ①)。待ちがあれば true (go は預かる)。
 * 1 つ消すと保存してから go、「保存をやめる」は保存も進むのもやめてその場に残る。
 * 先に進むと、窓を持つ画面 (木・レシピ) から移った時に窓ごと消え、待ちだけ残って後で 1 つ消した時に続きが走っていた
 */
export function holdLeave(go: () => void): boolean {
  const f = roomAsk.value;
  if (!f) return false;
  roomAsk.value = () => { f(); go(); };
  return true;
}
/** 窓を閉じる (待たせた保存はやめる) */
export const dropRoomAsk = (): void => { roomAsk.value = null; };

// 消して空きができたら、待たせた保存を続ける (窓も閉じる)
watch(() => treeRecipes.value.length, () => {
  const f = roomAsk.value;
  if (!f || roomFull()) return;
  roomAsk.value = null;
  f();
});
