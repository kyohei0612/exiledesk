/**
 * use-hand-rune.ts — 打つ手の棚 (TreeHandShelf) のルーンのソケットの選び (整理 ③-5 で TreeHandShelf.vue から分けた。動きは同じ)。
 * ルーンはカードのソケットに置く (S-31f、11-05 オーナー「エミュみたいにここに設置」)。はまったソケットを押す = その番号へ (入れ替え、エンジンの rune:名前@n)、
 * 本体 (と空き) = 空きへ。木でソケットを足す手は無い (11-07 オーナー「熟練工はそもそもつりーでうてんでしょ」)。
 * 全部埋まっている時は押したソケットと入れ替えるだけで、本体・「使う」では左から置き換えない (11-07 オーナー「同じ動作で刺す方にクリックしたらつけれるはず」)。
 * 足す空きの丸はカードに出さない (11-05 オーナー「規格外スタートだから空き穴ないでしょ」= B)
 */
import { computed, ref, watch, type Ref } from "vue";
import type { StageItem } from "../../../services/craft-stage/engine";
import { isRuneHand } from "../../../services/simulator/tree/tree-hands";
import { tr } from "../../../i18n/lang";

/** problem = 今の手で打てない訳 (棚の problem)、ok = カードを押したのと同じ (棚の ok)。どちらも呼ぶ時に読む */
export function useHandRune(held: Ref<string | null>, item: Ref<StageItem | null>, shelfItem: Ref<StageItem | null>, problem: () => string | null, ok: () => void) {
  const runeAt = ref<number | null>(null);
  /** 置き換えられないソケット (バウンド) を押した訳。その押しだけ断り、持った物はそのまま (猿 release-668 ①: 断った後に別のソケットも押せなくなっていた) */
  const socketWhy = ref<string | null>(null);
  watch(held, () => { runeAt.value = null; socketWhy.value = null; });
  const runeHold = computed(() => !!held.value && isRuneHand(held.value));
  /** ルーンを持っていてソケットが全部埋まっている (まだソケットを押していない) = 入れ替えるソケットを選ぶ番 */
  const runePick = computed(() => { const it = item.value ?? shelfItem.value, n = it?.sockets ?? 0; return runeHold.value && !runeAt.value && n > 0 && (it?.augments?.length ?? 0) >= n; });
  const RUNE_PICK = (): string => tr("ソケットが埋まっている", "All sockets are filled");
  const runeNote = computed(() => (runeHold.value ? `${socketWhy.value ? `${socketWhy.value} · ` : ""}${runePick.value ? tr("入れ替えるルーンのソケットを押す · 右クリック / Esc で手放す", "Click the socket whose rune to swap · Right-click / Esc to drop") : tr("ルーンのソケットを押すと入れ替え · カードを押すと空きへ · 右クリック / Esc で手放す", "Click a filled socket to swap its rune · Click the item to use an empty socket · Right-click / Esc to drop")}` : undefined));
  function onSocket(n: number): void {
    // ルーン以外を持っている時はアイテムを押したのと同じ (StageItemCard の onSocket の決まり。前は何もせず、ルーンの入ったソケットを押しても打てなかった、11-05 動画の木)
    if (!runeHold.value) { ok(); return; }
    runeAt.value = n;
    const why = problem();
    if (why) { socketWhy.value = tr(`${n} 番目: ${why}`, `Socket ${n}: ${why}`); runeAt.value = null; return; }
    socketWhy.value = null;
    ok();
  }
  return { runeAt, socketWhy, runeHold, runePick, RUNE_PICK, runeNote, onSocket };
}
