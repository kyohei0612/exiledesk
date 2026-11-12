/**
 * tree-box-mods.ts — 箱から開く「MOD 一覧」の窓の、開いている箱の置き場 (S-145h、スイッチ treeBoxModList)。
 * ボタン (TreeBoxModBtn = 次に打つ手の窓のカードの下・箱の大きい写しの窓) が書き、窓 (TreeBoxModList、TreeOverlays に 1 つ) が読む。
 * 見るだけの窓で、木には何もしない
 * (オーナー 11-12「モッド一覧はあるけど、カードで確認するときにもモッド一覧欲しいからな。しかもカードだどより今ついてるアイテムによって違うから次の手の確率」)
 */
import { ref } from "vue";

/** MOD 一覧を開いている箱の id (null = 閉じている) */
export const boxModsId = ref<string | null>(null);
export function openBoxMods(id: string): void { boxModsId.value = id; }
export function closeBoxMods(): void { boxModsId.value = null; }
